//! Tanglaw's native side is deliberately thin: it finds module files, reads theWord text Bibles line by
//! line, answers read-only SQLite queries, and stores settings. Everything that understands the module
//! formats lives in TypeScript, shared by every platform (Windows, Linux, Android).
//! Encrypted modules are never decoded: the TypeScript side recognises and skips them.
use base64::Engine;
use rusqlite::{types::ValueRef, Connection, OpenFlags};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{Manager, State};

#[derive(Default)]
struct Store {
    ont: Mutex<HashMap<String, std::sync::Arc<Vec<String>>>>,
    db: Mutex<HashMap<String, Connection>>,
}

#[derive(Serialize)]
struct ModFile { path: String, name: String, size: u64 }

const MODULE_EXT: &[&str] = &[".ont", ".ot", ".nt", ".bblx", ".bbli", ".twm", ".dctx", ".dcti", ".lexx", ".lexi", ".cmtx", ".cmti", ".topx", ".topi", ".refx", ".refi", ".devx", ".devi", ".ontx", ".otx", ".ntx"];

fn walk(dir: &Path, depth: u32, out: &mut Vec<ModFile>) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        let name = e.file_name().to_string_lossy().to_string();
        if p.is_dir() {
            if depth < 4 && !name.starts_with('-') && !name.starts_with('.') { walk(&p, depth + 1, out); }
            continue;
        }
        let low = name.to_lowercase();
        if MODULE_EXT.iter().any(|x| low.ends_with(x)) {
            let size = e.metadata().map(|m| m.len()).unwrap_or(0);
            out.push(ModFile { path: p.to_string_lossy().to_string(), name, size });
        }
    }
}

/** module files in the given folders (4 levels deep, like theWord) */
#[tauri::command]
fn scan(folders: Vec<String>) -> Vec<ModFile> {
    let mut out = Vec::new();
    for f in folders { walk(Path::new(&f), 0, &mut out); }
    out
}

fn decode(bytes: Vec<u8>) -> String {
    let b = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) { &bytes[3..] } else { &bytes[..] };
    match std::str::from_utf8(b) {
        Ok(s) => s.to_string(),
        // not UTF-8: Windows-1252 (bytes 0x80–0x9F as their Unicode letters)
        Err(_) => b.iter().map(|&c| {
            const HI: [u16; 32] = [0x20AC, 0x81, 0x201A, 0x192, 0x201E, 0x2026, 0x2020, 0x2021, 0x2C6, 0x2030, 0x160, 0x2039, 0x152, 0x8D, 0x17D, 0x8F,
                0x90, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, 0x2DC, 0x2122, 0x161, 0x203A, 0x153, 0x9D, 0x17E, 0x178];
            if (0x80..0xA0).contains(&c) { char::from_u32(HI[(c - 0x80) as usize] as u32).unwrap_or('?') } else { c as char }
        }).collect(),
    }
}

fn ont_lines(store: &Store, path: &str) -> Result<std::sync::Arc<Vec<String>>, String> {
    let mut m = store.ont.lock().unwrap();
    if let Some(l) = m.get(path) { return Ok(l.clone()); }
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    let text = decode(bytes);
    let lines: Vec<String> = text.split('\n').map(|l| l.strip_suffix('\r').unwrap_or(l).to_string()).collect();
    let arc = std::sync::Arc::new(lines);
    if m.len() > 6 { m.clear(); }
    m.insert(path.to_string(), arc.clone());
    Ok(arc)
}

/** number of lines of a theWord text Bible, and the lines after `skip` (its properties) */
#[tauri::command]
fn ont_info(store: State<Store>, path: String, skip: usize) -> Result<(usize, Vec<String>), String> {
    let l = ont_lines(&store, &path)?;
    Ok((l.len(), l.iter().skip(skip).cloned().collect()))
}

/** `count` lines of a theWord text Bible starting at line `start` (0-based) */
#[tauri::command]
fn ont_slice(store: State<Store>, path: String, start: usize, count: usize) -> Result<Vec<String>, String> {
    let l = ont_lines(&store, &path)?;
    Ok(l.iter().skip(start).take(count).cloned().collect())
}

#[derive(Serialize)]
struct QueryResult { columns: Vec<String>, rows: Vec<Vec<serde_json::Value>> }

/** read-only SQLite query; blobs come back as {"$b64": "..."}; a file that is not SQLite gives an error */
#[tauri::command]
fn sql(store: State<Store>, path: String, query: String, params: Vec<serde_json::Value>) -> Result<QueryResult, String> {
    let mut m = store.db.lock().unwrap();
    if !m.contains_key(&path) {
        let mut head = [0u8; 16];
        use std::io::Read;
        fs::File::open(&path).and_then(|mut f| f.read_exact(&mut head)).map_err(|e| e.to_string())?;
        if &head[..15] != b"SQLite format 3" { return Err("not a readable database (encrypted or unknown format)".into()); }
        let c = Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX).map_err(|e| e.to_string())?;
        if m.len() > 24 { m.clear(); }
        m.insert(path.clone(), c);
    }
    let c = m.get(&path).unwrap();
    let mut st = c.prepare(&query).map_err(|e| e.to_string())?;
    let columns: Vec<String> = st.column_names().iter().map(|s| s.to_string()).collect();
    let n = columns.len();
    let ps: Vec<rusqlite::types::Value> = params.iter().map(|p| match p {
        serde_json::Value::Number(x) if x.is_i64() => rusqlite::types::Value::Integer(x.as_i64().unwrap()),
        serde_json::Value::Number(x) => rusqlite::types::Value::Real(x.as_f64().unwrap_or(0.0)),
        serde_json::Value::String(s) => rusqlite::types::Value::Text(s.clone()),
        serde_json::Value::Bool(b) => rusqlite::types::Value::Integer(*b as i64),
        _ => rusqlite::types::Value::Null,
    }).collect();
    let mut rows = st.query(rusqlite::params_from_iter(ps.iter())).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    while let Some(r) = rows.next().map_err(|e| e.to_string())? {
        let mut row = Vec::with_capacity(n);
        for i in 0..n {
            row.push(match r.get_ref(i).map_err(|e| e.to_string())? {
                ValueRef::Null => serde_json::Value::Null,
                ValueRef::Integer(x) => serde_json::json!(x),
                ValueRef::Real(x) => serde_json::json!(x),
                // text that is not UTF-8 (e.g. Windows-1252, or zlib data stored as text) goes over as bytes, unchanged
                ValueRef::Text(t) => match std::str::from_utf8(t) {
                    Ok(x) => serde_json::Value::String(x.to_string()),
                    Err(_) => serde_json::json!({ "$b64": base64::engine::general_purpose::STANDARD.encode(t) }),
                },
                ValueRef::Blob(b) => serde_json::json!({ "$b64": base64::engine::general_purpose::STANDARD.encode(b) }),
            });
        }
        out.push(row);
    }
    Ok(QueryResult { columns, rows: out })
}

fn data_dir(app: &tauri::AppHandle) -> PathBuf {
    let d = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = fs::create_dir_all(d.join("modules"));
    d
}

/** Tanglaw's own module folder (imported modules go here) */
#[tauri::command]
fn modules_dir(app: tauri::AppHandle) -> String { data_dir(&app).join("modules").to_string_lossy().to_string() }

/** save an imported module (bytes come from the file picker, which on Android gives no path) */
#[tauri::command]
fn import_bytes(app: tauri::AppHandle, name: String, b64: String) -> Result<String, String> {
    let safe: String = name.chars().filter(|c| !matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|')).collect();
    let bytes = base64::engine::general_purpose::STANDARD.decode(b64).map_err(|e| e.to_string())?;
    let p = data_dir(&app).join("modules").join(safe);
    fs::write(&p, bytes).map_err(|e| e.to_string())?;
    Ok(p.to_string_lossy().to_string())
}

/* ------------------------------------------------------------ importing with a report */
fn safe_name(name: &str) -> String { name.chars().filter(|c| !matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|')).collect() }
/** put a file to be imported in a waiting place (not yet among the modules); the TypeScript side checks it */
#[tauri::command]
fn import_stage(app: tauri::AppHandle, name: String, b64: String) -> Result<String, String> {
    let bytes = base64::engine::general_purpose::STANDARD.decode(b64).map_err(|e| e.to_string())?;
    let dir = data_dir(&app).join("modules").join(".incoming");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let p = dir.join(safe_name(&name));
    fs::write(&p, bytes).map_err(|e| e.to_string())?;
    Ok(p.to_string_lossy().to_string())
}
/** move a checked file into Tanglaw's module folder: "imported", "updated" (replaced a different file of
 *  the same name) or "already" (the same file was there) */
#[tauri::command]
fn import_commit(app: tauri::AppHandle, store: State<Store>, staged: String) -> Result<(String, String), String> {
    let src = PathBuf::from(&staged);
    let inc = data_dir(&app).join("modules").join(".incoming");
    if src.parent() != Some(inc.as_path()) { return Err("not a waiting import".into()); }
    let dest = data_dir(&app).join("modules").join(src.file_name().ok_or("no name")?);
    let ds = dest.to_string_lossy().to_string();
    forget(&store, &staged);
    let status = if dest.exists() {
        if fs::read(&dest).map_err(|e| e.to_string())? == fs::read(&src).map_err(|e| e.to_string())? { "already" } else { "updated" }
    } else { "imported" };
    if status == "already" { fs::remove_file(&src).map_err(|e| e.to_string())?; }
    else { forget(&store, &ds); fs::rename(&src, &dest).map_err(|e| e.to_string())?; }
    Ok((ds, status.into()))
}
#[tauri::command]
fn import_discard(app: tauri::AppHandle, store: State<Store>, staged: String) -> Result<(), String> {
    let src = PathBuf::from(&staged);
    if src.parent() != Some(data_dir(&app).join("modules").join(".incoming").as_path()) { return Err("not a waiting import".into()); }
    forget(&store, &staged);
    let _ = fs::remove_file(src);
    Ok(())
}

#[tauri::command]
fn settings_load(app: tauri::AppHandle) -> serde_json::Value {
    fs::read_to_string(data_dir(&app).join("settings.json")).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(serde_json::json!({}))
}

#[tauri::command]
fn settings_save(app: tauri::AppHandle, settings: serde_json::Value) -> Result<(), String> {
    let p = data_dir(&app).join("settings.json");
    let tmp = p.with_extension("tmp");
    fs::write(&tmp, serde_json::to_vec_pretty(&settings).unwrap()).map_err(|e| e.to_string())?;
    fs::rename(tmp, p).map_err(|e| e.to_string())
}

/** the user's study data (highlights, notes, bookmarks, lists, plans): one JSON file, written safely,
 *  with a copy kept for each of the last 7 days */
#[tauri::command]
fn ud_load(app: tauri::AppHandle) -> serde_json::Value {
    fs::read_to_string(data_dir(&app).join("my-study-data.json")).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(serde_json::json!({}))
}

#[tauri::command]
fn ud_save(app: tauri::AppHandle, data: serde_json::Value) -> Result<(), String> {
    let dir = data_dir(&app);
    let p = dir.join("my-study-data.json");
    if p.exists() {
        let day = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() / 86400).unwrap_or(0);
        let bdir = dir.join("backups");
        let _ = fs::create_dir_all(&bdir);
        let today = bdir.join(format!("my-study-data.day{}.json", day));
        if !today.exists() {
            let _ = fs::copy(&p, &today);
            if let Ok(rd) = fs::read_dir(&bdir) {
                let mut olds: Vec<PathBuf> = rd.flatten().map(|e| e.path()).filter(|x| x.to_string_lossy().contains("my-study-data.day")).collect();
                olds.sort();
                while olds.len() > 7 { let _ = fs::remove_file(olds.remove(0)); }
            }
        }
    }
    let tmp = p.with_extension("tmp");
    fs::write(&tmp, serde_json::to_vec(&data).unwrap()).map_err(|e| e.to_string())?;
    fs::rename(tmp, p).map_err(|e| e.to_string())
}

/** settings and study data of the Electron edition of Tanglaw, if it was used on this computer
 *  (its folder is "Tanglaw Bible" in the user's application-data folder) */
#[tauri::command]
fn legacy_data(app: tauri::AppHandle) -> serde_json::Value {
    let Ok(cfg) = app.path().config_dir() else { return serde_json::Value::Null };
    for name in ["Tanglaw Bible", "tanglaw-bible"] {
        let d = cfg.join(name);
        let st = d.join("settings.json");
        if st.exists() {
            let read = |f: &str| fs::read_to_string(d.join(f)).ok().and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok()).unwrap_or(serde_json::Value::Null);
            let modules = d.join("modules");
            return serde_json::json!({ "folder": d.to_string_lossy(), "settings": read("settings.json"), "study": read("my-study-data.json"),
                "modules": if modules.exists() { serde_json::Value::String(modules.to_string_lossy().to_string()) } else { serde_json::Value::Null } });
        }
    }
    serde_json::Value::Null
}

/** the user's own cross-references, in theWord's .xrefs.twm format (so theWord can use them too).
 *  Created on first use; taken over from Tanglaw 0.4 if that left one. Returns the file's path. */
fn user_xrefs_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let p = data_dir(app).join("My cross-references.xrefs.twm");
    if !p.exists() {
        if let Ok(cfg) = app.path().config_dir() {
            let old = cfg.join("Tanglaw Bible").join("My cross-references.xrefs.twm");
            if old.exists() { fs::copy(&old, &p).map_err(|e| e.to_string())?; return Ok(p); }
        }
        let c = Connection::open(&p).map_err(|e| e.to_string())?;
        c.execute_batch("create table xrefs(id integer primary key, vi1 int, vi2 int);
            create table config(name text, value text);
            create index xrefs_idx_vi1 on xrefs(vi1); create index xrefs_idx_vi2 on xrefs(vi2);
            insert into config values ('table.xrefs','xrefs'),('tables.xrefs.description','My cross-references (Tanglaw)'),('type','10');").map_err(|e| e.to_string())?;
    }
    Ok(p)
}

#[tauri::command]
fn user_xrefs(app: tauri::AppHandle) -> Result<String, String> { Ok(user_xrefs_file(&app)?.to_string_lossy().to_string()) }

/** add (op "add") or remove (op "remove") the cross-reference vi1 → vi2 in the user's own set */
#[tauri::command]
fn user_xref_change(app: tauri::AppHandle, store: State<Store>, op: String, vi1: i64, vi2: i64) -> Result<usize, String> {
    let p = user_xrefs_file(&app)?;
    store.db.lock().unwrap().remove(&p.to_string_lossy().to_string()); // the read-only copy is out of date now
    let c = Connection::open(&p).map_err(|e| e.to_string())?;
    let n = if op == "add" {
        let has: i64 = c.query_row("select count(*) from xrefs where vi1 = ? and vi2 = ?", [vi1, vi2], |r| r.get(0)).map_err(|e| e.to_string())?;
        if has > 0 { 0 } else { c.execute("insert into xrefs(vi1, vi2) values (?, ?)", [vi1, vi2]).map_err(|e| e.to_string())? }
    } else {
        // vi2 may carry a span; match it on book, chapter and verse only
        c.execute("delete from xrefs where vi1 = ? and (vi2 >> 8) = (? >> 8)", [vi1, vi2]).map_err(|e| e.to_string())?
    };
    Ok(n)
}

/* ------------------------------------------------------------ module properties (editing a module file) */
const BACKUP: &str = ".tanglaw-backup";
/** only unlocked module files may be changed */
fn editable_module(path: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(path);
    let low = path.to_lowercase();
    let ok = [".ont", ".ot", ".nt", ".twm", ".bblx", ".bbli", ".dctx", ".dcti", ".lexx", ".lexi", ".cmtx", ".cmti", ".refx", ".refi", ".topx", ".topi", ".devx", ".devi"]
        .iter().any(|e| low.ends_with(e));
    if !ok || !p.is_file() { return Err("not a module file Tanglaw can change".into()); }
    Ok(p)
}
fn forget(store: &Store, path: &str) { store.ont.lock().unwrap().remove(path); store.db.lock().unwrap().remove(path); }
fn backup_once(p: &Path) -> Result<bool, String> {
    let b = PathBuf::from(format!("{}{}", p.to_string_lossy(), BACKUP));
    if b.exists() { return Ok(false); }
    fs::copy(p, &b).map_err(|e| format!("could not keep a copy of the original: {e}"))?;
    Ok(true)
}
#[derive(Serialize)]
struct FileState { size: u64, writable: bool, backup: Option<String> }
#[tauri::command]
fn mod_file(path: String) -> Result<FileState, String> {
    let md = fs::metadata(&path).map_err(|e| e.to_string())?;
    let b = format!("{path}{BACKUP}");
    let writable = !md.permissions().readonly() && fs::OpenOptions::new().append(true).open(&path).is_ok();
    Ok(FileState { size: md.len(), writable, backup: if Path::new(&b).exists() { Some(b) } else { None } })
}
/** the whole file, base64 (theWord text Bibles, for editing their properties) */
#[tauri::command]
fn mod_read(path: String) -> Result<String, String> {
    let p = editable_module(&path)?;
    Ok(base64::engine::general_purpose::STANDARD.encode(fs::read(p).map_err(|e| e.to_string())?))
}
/** replace a text Bible with new contents (base64); the original is kept once as <file>.tanglaw-backup */
#[tauri::command]
fn mod_write(store: State<Store>, path: String, b64: String) -> Result<bool, String> {
    let p = editable_module(&path)?;
    let data = base64::engine::general_purpose::STANDARD.decode(b64).map_err(|e| e.to_string())?;
    let made = backup_once(&p)?;
    let tmp = PathBuf::from(format!("{path}.tanglaw-tmp"));
    fs::write(&tmp, data).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &p).map_err(|e| e.to_string())?;
    forget(&store, &path);
    Ok(made)
}
fn to_value(p: &serde_json::Value) -> rusqlite::types::Value {
    match p {
        serde_json::Value::Number(x) if x.is_i64() => rusqlite::types::Value::Integer(x.as_i64().unwrap()),
        serde_json::Value::Number(x) => rusqlite::types::Value::Real(x.as_f64().unwrap_or(0.0)),
        serde_json::Value::String(s) => rusqlite::types::Value::Text(s.clone()),
        serde_json::Value::Bool(b) => rusqlite::types::Value::Integer(*b as i64),
        serde_json::Value::Object(o) => match o.get("$b64").and_then(|v| v.as_str()) {
            Some(b) => rusqlite::types::Value::Blob(base64::engine::general_purpose::STANDARD.decode(b).unwrap_or_default()),
            None => rusqlite::types::Value::Null,
        },
        _ => rusqlite::types::Value::Null,
    }
}
/** change a database module: run the statements on a copy, compact it if asked, then put the copy in place.
 *  The original is kept once as <file>.tanglaw-backup. Returns (size before, size after, backup made now). */
#[tauri::command]
fn mod_sql_write(store: State<Store>, path: String, statements: Vec<(String, Vec<serde_json::Value>)>, vacuum: bool) -> Result<(u64, u64, bool), String> {
    let p = editable_module(&path)?;
    let before = fs::metadata(&p).map_err(|e| e.to_string())?.len();
    let tmp = PathBuf::from(format!("{path}.tanglaw-tmp"));
    fs::copy(&p, &tmp).map_err(|e| e.to_string())?;
    let res = (|| -> Result<(), String> {
        let mut c = Connection::open(&tmp).map_err(|e| e.to_string())?;
        let tx = c.transaction().map_err(|e| e.to_string())?;
        for (q, ps) in &statements {
            let vals: Vec<rusqlite::types::Value> = ps.iter().map(to_value).collect();
            tx.execute(q, rusqlite::params_from_iter(vals.iter())).map_err(|e| format!("{e} ({q})"))?;
        }
        tx.commit().map_err(|e| e.to_string())?;
        if vacuum { c.execute_batch("VACUUM").map_err(|e| e.to_string())?; }
        Ok(())
    })();
    if let Err(e) = res { let _ = fs::remove_file(&tmp); return Err(e); }
    forget(&store, &path);
    let made = backup_once(&p)?;
    fs::rename(&tmp, &p).map_err(|e| e.to_string())?;
    let after = fs::metadata(&p).map_err(|e| e.to_string())?.len();
    Ok((before, after, made))
}
/** put the copy kept before the first change back */
#[tauri::command]
fn mod_restore(store: State<Store>, path: String) -> Result<(), String> {
    let p = editable_module(&path)?;
    let b = PathBuf::from(format!("{path}{BACKUP}"));
    if !b.exists() { return Err("there is no copy of the original of this module".into()); }
    forget(&store, &path);
    fs::copy(&b, &p).map_err(|e| e.to_string())?;
    fs::remove_file(&b).map_err(|e| e.to_string())?;
    Ok(())
}

/** test hook: a test script reports its results here (printed on the console) */
#[tauri::command]
fn test_report(text: String) { println!("RESULT {}", text); }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(Store::default())
        .invoke_handler(tauri::generate_handler![scan, ont_info, ont_slice, sql, modules_dir, import_bytes, settings_load, settings_save, ud_load, ud_save, legacy_data, user_xrefs, user_xref_change, mod_file, mod_read, mod_write, mod_sql_write, mod_restore, import_stage, import_commit, import_discard, test_report])
        .setup(|app| {
            // test hook (like the Electron version's): TANGLAW_SCRIPT runs a script in the window after start
            if let (Ok(sz), Some(w)) = (std::env::var("TANGLAW_SIZE"), app.get_webview_window("main")) {
                let v: Vec<f64> = sz.split('x').filter_map(|x| x.parse().ok()).collect();
                if v.len() == 2 { let _ = w.set_min_size(Some(tauri::LogicalSize::new(v[0], v[1]))); let _ = w.set_size(tauri::LogicalSize::new(v[0], v[1])); }
            }
            if let Ok(p) = std::env::var("TANGLAW_SCRIPT") {
                if let (Ok(js), Some(w)) = (fs::read_to_string(p), app.get_webview_window("main")) {
                    std::thread::spawn(move || { std::thread::sleep(std::time::Duration::from_millis(3000)); let _ = w.eval(&js); });
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Tanglaw");
}
