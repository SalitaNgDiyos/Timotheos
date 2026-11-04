//! Timotheos for Tauri 2.
//! The Bible code of Timotheos (the former Electron "main process" and its module readers) runs unchanged in a
//! Web Worker of the page. A worker cannot call Tauri commands, so it reaches the files through the custom
//! protocol `tfs://` with synchronous requests (plain GET requests only: no request body is needed, which also
//! works on Android). SQLite databases of the e-Sword modules are opened here with rusqlite.
use base64::{engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD}, Engine};
use rusqlite::{types::Value as SqlValue, Connection, OpenFlags};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{http, Manager};

#[derive(Default)]
struct Dbs {
    next: Mutex<u32>,
    map: Mutex<HashMap<u32, std::sync::Arc<Mutex<Connection>>>>,
}

type Resp = http::Response<Vec<u8>>;

fn reply(status: u16, ctype: &str, body: Vec<u8>) -> Resp {
    http::Response::builder()
        .status(status)
        .header("Content-Type", ctype)
        .header("Access-Control-Allow-Origin", "*")
        .header("Cache-Control", "no-store")
        .body(body)
        .unwrap()
}
fn json_ok(v: Value) -> Resp { reply(200, "application/json", v.to_string().into_bytes()) }
fn fail(code: &str, msg: impl ToString) -> Resp { reply(404, "application/json", json!({ "error": msg.to_string(), "code": code }).to_string().into_bytes()) }
fn io_fail(e: std::io::Error) -> Resp {
    let code = match e.kind() { std::io::ErrorKind::NotFound => "ENOENT", std::io::ErrorKind::AlreadyExists => "EEXIST", std::io::ErrorKind::PermissionDenied => "EACCES", _ => "EIO" };
    fail(code, e)
}

fn q<'a>(pairs: &'a HashMap<String, String>, k: &str) -> &'a str { pairs.get(k).map(|s| s.as_str()).unwrap_or("") }

fn mtime_ms(m: &fs::Metadata) -> f64 {
    m.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs_f64() * 1000.0).unwrap_or(0.0)
}

fn copy_rec(from: &Path, to: &Path, force: bool) -> std::io::Result<()> {
    if from.is_dir() {
        fs::create_dir_all(to)?;
        for e in fs::read_dir(from)? { let e = e?; copy_rec(&e.path(), &to.join(e.file_name()), force)?; }
    } else if force || !to.exists() {
        if let Some(p) = to.parent() { fs::create_dir_all(p)?; }
        fs::copy(from, to)?;
    }
    Ok(())
}

#[allow(dead_code)]
fn to_json(v: SqlValue) -> Value {
    match v {
        SqlValue::Null => Value::Null,
        SqlValue::Integer(i) => json!(i),
        SqlValue::Real(f) => json!(f),
        SqlValue::Text(s) => Value::String(s),
        SqlValue::Blob(b) => json!({ "$b": STANDARD.encode(b) }),
    }
}
fn from_json(v: &Value) -> SqlValue {
    match v {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(*b as i64),
        Value::Number(n) => n.as_i64().map(SqlValue::Integer).unwrap_or_else(|| SqlValue::Real(n.as_f64().unwrap_or(0.0))),
        Value::String(s) => SqlValue::Text(s.clone()),
        Value::Object(o) => o.get("$b").and_then(|b| b.as_str()).and_then(|b| STANDARD.decode(b).ok()).map(SqlValue::Blob).unwrap_or(SqlValue::Null),
        _ => SqlValue::Null,
    }
}

fn sql_op(dbs: &Dbs, op: &str, pairs: &HashMap<String, String>) -> Resp {
    if op == "open" {
        let path = q(pairs, "p"); let write = q(pairs, "w") == "1";
        let flags = if write { OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE } else { OpenFlags::SQLITE_OPEN_READ_ONLY };
        return match Connection::open_with_flags(path, flags) {
            Ok(c) => {
                let mut n = dbs.next.lock().unwrap(); *n += 1; let id = *n;
                dbs.map.lock().unwrap().insert(id, std::sync::Arc::new(Mutex::new(c)));
                json_ok(json!({ "id": id }))
            }
            Err(e) => fail("SQLITE", e),
        };
    }
    let id: u32 = q(pairs, "id").parse().unwrap_or(0);
    if op == "close" { dbs.map.lock().unwrap().remove(&id); return json_ok(json!(true)); }
    let conn = match dbs.map.lock().unwrap().get(&id) { Some(c) => c.clone(), None => return fail("SQLITE", "database is not open") };
    let conn = conn.lock().unwrap();
    let raw: Option<Vec<u8>> = if !q(pairs, "f").is_empty() { fs::read(q(pairs, "f")).ok() } else { URL_SAFE_NO_PAD.decode(q(pairs, "d")).ok() };
    let body: Value = raw.and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or(Value::Null);
    let sql = body.get("sql").and_then(|s| s.as_str()).unwrap_or("");
    let params: Vec<SqlValue> = body.get("params").and_then(|p| p.as_array()).map(|a| a.iter().map(from_json).collect()).unwrap_or_default();
    match op {
        "batch" => match conn.execute_batch(sql) { Ok(_) => json_ok(json!(true)), Err(e) => fail("SQLITE", e) },
        "all" => {
            let mut st = match conn.prepare(sql) { Ok(s) => s, Err(e) => return fail("SQLITE", e) };
            let cols: Vec<String> = st.column_names().iter().map(|s| s.to_string()).collect();
            let n = cols.len();
            let rows = st.query_map(rusqlite::params_from_iter(params.iter()), |r| {
                let mut out = Vec::with_capacity(n);
                // text that is not valid UTF-8 (old ANSI modules) is turned into U+FFFD signs, as Node's sqlite does; rusqlite's own
                // conversion would stop the whole program on it
                for i in 0..n {
                    out.push(match r.get_ref(i)? {
                        rusqlite::types::ValueRef::Null => Value::Null,
                        rusqlite::types::ValueRef::Integer(v) => json!(v),
                        rusqlite::types::ValueRef::Real(v) => json!(v),
                        rusqlite::types::ValueRef::Text(b) => Value::String(String::from_utf8_lossy(b).into_owned()),
                        rusqlite::types::ValueRef::Blob(b) => json!({ "$b": STANDARD.encode(b) }),
                    });
                }
                Ok(Value::Array(out))
            });
            match rows {
                Ok(it) => { let mut all = Vec::new(); for r in it { match r { Ok(v) => all.push(v), Err(e) => return fail("SQLITE", e) } } json_ok(json!({ "c": cols, "r": all })) }
                Err(e) => fail("SQLITE", e),
            }
        }
        "run" => match conn.execute(sql, rusqlite::params_from_iter(params.iter())) {
            Ok(ch) => json_ok(json!({ "changes": ch, "last": conn.last_insert_rowid() })),
            Err(e) => fail("SQLITE", e),
        },
        _ => fail("EINVAL", "unknown sql operation"),
    }
}

fn handle(dbs: &Dbs, req: http::Request<Vec<u8>>) -> Resp {
    let uri = req.uri().to_string();
    let parsed = match url::Url::parse(&uri.replace("http://tfs.localhost", "tfs://localhost")) { Ok(u) => u, Err(e) => return fail("EINVAL", e) };
    let route = parsed.path().trim_start_matches('/').to_string();
    let pairs: HashMap<String, String> = parsed.query_pairs().map(|(a, b)| (a.to_string(), b.to_string())).collect();
    let p = PathBuf::from(q(&pairs, "p"));
    if let Some(op) = route.strip_prefix("sql/") { return sql_op(dbs, op, &pairs); }
    match route.as_str() {
        "stat" => match fs::metadata(&p) {
            Ok(m) => json_ok(json!({ "e": true, "d": m.is_dir(), "s": m.len(), "m": mtime_ms(&m) })),
            Err(_) => json_ok(json!({ "e": false })),
        },
        "read" => {
            let off: u64 = q(&pairs, "o").parse().unwrap_or(0);
            let len: Option<u64> = q(&pairs, "n").parse().ok();
            let mut f = match fs::File::open(&p) { Ok(f) => f, Err(e) => return io_fail(e) };
            if off > 0 { if let Err(e) = f.seek(SeekFrom::Start(off)) { return io_fail(e); } }
            let mut buf = Vec::new();
            let r = match len { Some(n) => f.take(n).read_to_end(&mut buf), None => f.read_to_end(&mut buf) };
            match r { Ok(_) => reply(200, "application/octet-stream", buf), Err(e) => io_fail(e) }
        }
        "ls" => match fs::read_dir(&p) {
            Ok(rd) => json_ok(Value::Array(rd.filter_map(|e| e.ok()).map(|e| json!([e.file_name().to_string_lossy(), e.path().is_dir()])).collect())),
            Err(e) => io_fail(e),
        },
        "mkdir" => match if q(&pairs, "r") == "1" { fs::create_dir_all(&p) } else { fs::create_dir(&p) } { Ok(_) => json_ok(json!(true)), Err(e) => io_fail(e) },
        "rm" => {
            let r = if p.is_dir() { if q(&pairs, "r") == "1" { fs::remove_dir_all(&p) } else { fs::remove_dir(&p) } } else { fs::remove_file(&p) };
            match r { Ok(_) => json_ok(json!(true)), Err(e) => io_fail(e) }
        }
        "mv" => match fs::rename(&p, q(&pairs, "to")) { Ok(_) => json_ok(json!(true)), Err(e) => io_fail(e) },
        "cp" => match copy_rec(&p, Path::new(q(&pairs, "to")), q(&pairs, "f") != "0") { Ok(_) => json_ok(json!(true)), Err(e) => io_fail(e) },
        // write in pieces: m=c starts the file over, m=a adds to its end; d = URL-safe base64
        "w" => {
            let data = match URL_SAFE_NO_PAD.decode(q(&pairs, "d")) { Ok(d) => d, Err(e) => return fail("EINVAL", e) };
            let mut o = fs::OpenOptions::new();
            if q(&pairs, "m") == "a" { o.append(true).create(true); } else { o.write(true).create(true).truncate(true); }
            if let Some(dir) = p.parent() { let _ = fs::create_dir_all(dir); }
            match o.open(&p).and_then(|mut f| f.write_all(&data)) { Ok(_) => json_ok(json!(true)), Err(e) => io_fail(e) }
        }
        "trash" => {
            #[cfg(not(target_os = "android"))]
            { return match trash::delete(&p) { Ok(_) => json_ok(json!(true)), Err(e) => fail("EIO", e) }; }
            #[cfg(target_os = "android")]
            { return match if p.is_dir() { fs::remove_dir_all(&p) } else { fs::remove_file(&p) } { Ok(_) => json_ok(json!(true)), Err(e) => io_fail(e) }; }
        }
        _ => fail("EINVAL", format!("unknown route {route}")),
    }
}

/// where things are, for the worker (which has no way to ask the system itself)
#[tauri::command]
fn host_info(app: tauri::AppHandle) -> Value {
    let data = app.path().app_data_dir().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();
    let exe = std::env::current_exe().ok().and_then(|p| p.parent().map(|d| d.to_string_lossy().to_string())).unwrap_or_default();
    let home = app.path().home_dir().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();
    let tmp = if cfg!(target_os = "android") { app.path().app_cache_dir().map(|p| p.to_string_lossy().to_string()).unwrap_or_default() } else { std::env::temp_dir().to_string_lossy().to_string() };
    let _ = fs::create_dir_all(&tmp);
    let os = if cfg!(target_os = "android") { "android" } else if cfg!(target_os = "windows") { "win32" } else if cfg!(target_os = "macos") { "darwin" } else { "linux" };
    let fwd = |s: String| s.replace('\\', "/");
    let (data, exe, home, tmp) = (fwd(data), fwd(exe), fwd(home), fwd(tmp));
    json!({ "dataDir": data, "exeDir": exe, "home": home, "tmp": tmp, "platform": os, "version": env!("CARGO_PKG_VERSION"),
            "env": { "TIMOTHEOS_SCRIPT": std::env::var("TIMOTHEOS_SCRIPT").ok(), "TIMOTHEOS_MODULES": std::env::var("TIMOTHEOS_MODULES").ok(), "TIMOTHEOS_PORTABLE_DIR": std::env::var("TIMOTHEOS_PORTABLE_DIR").ok(),
                      "TIMOTHEOS_WAIT": std::env::var("TIMOTHEOS_WAIT").ok() } })
}

/// test hook: the page reports its result in a file; whoever started the program takes the picture and ends it
#[tauri::command]
fn test_report(app: tauri::AppHandle, text: String) {
    if let Ok(p) = std::env::var("TIMOTHEOS_READY") { let _ = fs::write(p, text); }
    std::thread::spawn(move || { std::thread::sleep(std::time::Duration::from_secs(30)); app.exit(0); });
}

#[tauri::command]
fn quit(app: tauri::AppHandle) { app.exit(0); }

/// Android: the chosen file is read by the page piece by piece and put into the app's own folder
#[tauri::command]
fn write_b64(path: String, data: String, append: bool) -> Result<(), String> {
    let bytes = STANDARD.decode(data).map_err(|e| e.to_string())?;
    if let Some(d) = Path::new(&path).parent() { let _ = fs::create_dir_all(d); }
    let mut o = fs::OpenOptions::new();
    if append { o.append(true).create(true); } else { o.write(true).create(true).truncate(true); }
    o.open(&path).and_then(|mut f| f.write_all(&bytes)).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> { fs::read_to_string(path).map_err(|e| e.to_string()) }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(target_os = "android")]
    let builder = builder.plugin(tauri_plugin_tts::init());
    builder
        .manage(Dbs::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .register_asynchronous_uri_scheme_protocol("tfs", |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            std::thread::spawn(move || {
                let dbs = app.state::<Dbs>();
                let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| handle(&dbs, request)))
                    .unwrap_or_else(|_| fail("EIO", "internal error while reading"));
                responder.respond(r);
            });
        })
        .setup(|app| {
            // test hook: run a script in the page 3 seconds after the start
            if let Ok(path) = std::env::var("TIMOTHEOS_SCRIPT") {
                if let Some(w) = app.get_webview_window("main") {
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_secs(3));
                        if let Ok(code) = fs::read_to_string(path) { let _ = w.eval(&code); }
                    });
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![host_info, test_report, read_text_file, quit, write_b64])
        .run(tauri::generate_context!())
        .expect("error while running Timotheos");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn text_that_is_not_utf8_does_not_stop_the_program() {
        let f = std::env::temp_dir().join("timotheos-utf8-test.sqlite");
        let _ = fs::remove_file(&f);
        let c = Connection::open(&f).unwrap();
        c.execute_batch("create table t(a text); insert into t values (cast(x'41424344e9ff41' as text)); insert into t values ('ok');").unwrap();
        drop(c);
        let dbs = Dbs::default();
        let mut p = HashMap::new(); p.insert("p".to_string(), f.to_string_lossy().to_string());
        let r = sql_op(&dbs, "open", &p);
        let id = serde_json::from_slice::<Value>(r.body()).unwrap()["id"].as_u64().unwrap();
        let mut q = HashMap::new(); q.insert("id".to_string(), id.to_string());
        q.insert("d".to_string(), URL_SAFE_NO_PAD.encode(json!({"sql":"select a from t"}).to_string()));
        let r = sql_op(&dbs, "all", &q);
        let v: Value = serde_json::from_slice(r.body()).unwrap();
        assert_eq!(v["r"][1][0], "ok");
        assert!(v["r"][0][0].as_str().unwrap().starts_with("ABCD"));
    }
}
