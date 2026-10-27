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

const MODULE_EXT: &[&str] = &[".ont", ".ot", ".nt", ".bblx", ".bbli", ".twm", ".dctx", ".dcti", ".lexx", ".lexi", ".cmtx", ".cmti", ".ontx", ".otx", ".ntx"];

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
                ValueRef::Text(t) => serde_json::Value::String(String::from_utf8_lossy(t).to_string()),
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

/** test hook: a test script reports its results here (printed on the console) */
#[tauri::command]
fn test_report(text: String) { println!("RESULT {}", text); }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(Store::default())
        .invoke_handler(tauri::generate_handler![scan, ont_info, ont_slice, sql, modules_dir, import_bytes, settings_load, settings_save, ud_load, ud_save, legacy_data, test_report])
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
