// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
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
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
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

fn le16(b: &[u8], off: usize) -> u16 { u16::from_le_bytes([b[off], b[off + 1]]) }
fn le32(b: &[u8], off: usize) -> u32 { u32::from_le_bytes([b[off], b[off + 1], b[off + 2], b[off + 3]]) }

fn safe_zip_rel(name: &str) -> Option<PathBuf> {
    let mut rel = PathBuf::new();
    for part in name.split('/') {
        if part.is_empty() || part == "." { continue; }
        if part == ".." || part.contains('\0') || part.contains(':') { return None; }
        rel.push(part);
    }
    if rel.as_os_str().is_empty() { None } else { Some(rel) }
}

fn stream_copy_limited<R: Read, W: Write>(mut r: R, mut w: W, buf: &mut [u8], written_total: &mut u64, max_total: u64) -> Result<u64, String> {
    let mut entry_bytes: u64 = 0;
    loop {
        let n = r.read(buf).map_err(|e| format!("could not unpack: {e}"))?;
        if n == 0 { break; }
        *written_total = written_total.saturating_add(n as u64);
        if max_total > 0 && *written_total > max_total {
            return Err(format!("the archive unpacks to more than {} MB", max_total / 1_048_576));
        }
        w.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        entry_bytes += n as u64;
    }
    w.flush().map_err(|e| e.to_string())?;
    Ok(entry_bytes)
}

struct ZipEnt {
    name: String,
    rel: PathBuf,
    method: u16,
    comp_size: u64,
    local_off: u64,
}

fn unzip_to_dir(zip_path: &Path, out_dir: &Path, max_total: u64) -> Result<Value, String> {
    let mut f = fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let file_len = f.metadata().map_err(|e| e.to_string())?.len();
    if file_len < 22 { return Ok(json!({ "ok": false, "code": "FALLBACK" })); }
    let tail_len = file_len.min(65557) as usize;
    f.seek(SeekFrom::Start(file_len - tail_len as u64)).map_err(|e| e.to_string())?;
    let mut tail = vec![0u8; tail_len];
    f.read_exact(&mut tail).map_err(|e| e.to_string())?;

    let mut eocd: Option<usize> = None;
    let mut i = tail_len - 22;
    loop {
        if le32(&tail, i) == 0x0605_4b50 {
            let clen = le16(&tail, i + 20) as usize;
            if i + 22 + clen == tail_len { eocd = Some(i); break; }
        }
        if i == 0 { break; }
        i -= 1;
    }
    let Some(e) = eocd else { return Ok(json!({ "ok": false, "code": "FALLBACK" })); };
    let disk = le16(&tail, e + 4);
    let cd_disk = le16(&tail, e + 6);
    let count_disk = le16(&tail, e + 8);
    let count = le16(&tail, e + 10);
    let cd_size = le32(&tail, e + 12) as u64;
    let cd_offset = le32(&tail, e + 16) as u64;
    if disk != 0 || cd_disk != 0 || count_disk != count || count == 0xFFFF || cd_size == 0xFFFF_FFFF || cd_offset == 0xFFFF_FFFF {
        return Ok(json!({ "ok": false, "code": "FALLBACK" }));
    }
    if cd_size > 64 * 1024 * 1024 || cd_offset.saturating_add(cd_size) > file_len {
        return Ok(json!({ "ok": false, "code": "FALLBACK" }));
    }

    f.seek(SeekFrom::Start(cd_offset)).map_err(|e| e.to_string())?;
    let mut cd = vec![0u8; cd_size as usize];
    f.read_exact(&mut cd).map_err(|e| e.to_string())?;

    let mut p: usize = 0;
    let mut entries: Vec<ZipEnt> = Vec::with_capacity(count as usize);
    let mut total_uncomp: u64 = 0;
    for _ in 0..count {
        if p + 46 > cd.len() || le32(&cd, p) != 0x0201_4b50 {
            return Ok(json!({ "ok": false, "code": "FALLBACK" }));
        }
        let flags = le16(&cd, p + 8);
        let method = le16(&cd, p + 10);
        let comp_size = le32(&cd, p + 20);
        let uncomp_size = le32(&cd, p + 24);
        let nlen = le16(&cd, p + 28) as usize;
        let xlen = le16(&cd, p + 30) as usize;
        let clen = le16(&cd, p + 32) as usize;
        let local_off = le32(&cd, p + 42);
        let name_end = p + 46 + nlen;
        let next_p = name_end + xlen + clen;
        if next_p > cd.len() { return Ok(json!({ "ok": false, "code": "FALLBACK" })); }
        if (flags & 1) != 0 { return Ok(json!({ "ok": false, "code": "PASSWORD" })); }
        if comp_size == 0xFFFF_FFFF || uncomp_size == 0xFFFF_FFFF || local_off == 0xFFFF_FFFF || (method != 0 && method != 8) {
            return Ok(json!({ "ok": false, "code": "FALLBACK" }));
        }
        let raw_name = &cd[p + 46..name_end];
        let decoded = if (flags & 0x0800) != 0 {
            String::from_utf8_lossy(raw_name).into_owned()
        } else {
            raw_name.iter().map(|&b| b as char).collect()
        };
        let norm_name = decoded.replace('\\', "/");
        p = next_p;
        if norm_name.ends_with('/') { continue; }
        let Some(rel) = safe_zip_rel(&norm_name) else {
            return Ok(json!({ "ok": false, "code": "FALLBACK" }));
        };
        total_uncomp = total_uncomp.saturating_add(uncomp_size as u64);
        if max_total > 0 && total_uncomp > max_total {
            return Ok(json!({
                "ok": false,
                "code": "ERROR",
                "error": format!("the archive unpacks to {} MB; the limit is {} MB", total_uncomp / 1_048_576, max_total / 1_048_576)
            }));
        }
        entries.push(ZipEnt {
            name: norm_name,
            rel,
            method,
            comp_size: comp_size as u64,
            local_off: local_off as u64,
        });
    }

    fs::create_dir_all(out_dir).map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; 64 * 1024];
    let mut written_total: u64 = 0;
    let mut out_entries: Vec<Value> = Vec::with_capacity(entries.len());
    for ent in entries {
        if ent.local_off.saturating_add(30) > file_len {
            let _ = fs::remove_dir_all(out_dir);
            return Ok(json!({ "ok": false, "code": "FALLBACK" }));
        }
        f.seek(SeekFrom::Start(ent.local_off)).map_err(|e| e.to_string())?;
        let mut lh = [0u8; 30];
        f.read_exact(&mut lh).map_err(|e| e.to_string())?;
        if le32(&lh, 0) != 0x0403_4b50 {
            let _ = fs::remove_dir_all(out_dir);
            return Ok(json!({ "ok": false, "code": "FALLBACK" }));
        }
        let ln = le16(&lh, 26) as u64;
        let lx = le16(&lh, 28) as u64;
        let data_start = ent.local_off + 30 + ln + lx;
        if data_start.saturating_add(ent.comp_size) > file_len {
            let _ = fs::remove_dir_all(out_dir);
            return Ok(json!({ "ok": false, "code": "FALLBACK" }));
        }
        f.seek(SeekFrom::Start(data_start)).map_err(|e| e.to_string())?;
        let dest = out_dir.join(&ent.rel);
        if let Some(parent) = dest.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
        let out_file = fs::File::create(&dest).map_err(|e| e.to_string())?;
        let res = if ent.method == 0 {
            stream_copy_limited((&mut f).take(ent.comp_size), out_file, &mut buf, &mut written_total, max_total)
        } else {
            stream_copy_limited(flate2::read::DeflateDecoder::new((&mut f).take(ent.comp_size)), out_file, &mut buf, &mut written_total, max_total)
        };
        match res {
            Ok(sz) => {
                let dest_fwd = dest.to_string_lossy().replace('\\', "/");
                out_entries.push(json!({ "name": ent.name, "path": dest_fwd, "size": sz }));
            }
            Err(msg) => {
                let _ = fs::remove_dir_all(out_dir);
                return Ok(json!({ "ok": false, "code": "ERROR", "error": msg }));
            }
        }
    }
    Ok(json!({ "ok": true, "entries": out_entries }))
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
        "real" => match fs::canonicalize(&p) {
            Ok(r) => json_ok(json!(r.to_string_lossy().replace('\\', "/"))),
            Err(_) => json_ok(json!(p.to_string_lossy().replace('\\', "/"))),
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
        "reveal" => {
            match reveal_in_file_manager(&p) {
                Ok(_) => json_ok(json!(true)),
                Err(e) => fail("EIO", e),
            }
        }
        "unzip" => {
            let to = PathBuf::from(q(&pairs, "to"));
            let max: u64 = q(&pairs, "max").parse().unwrap_or(0);
            match unzip_to_dir(&p, &to, max) {
                Ok(v) => json_ok(v),
                Err(e) => fail("EIO", e),
            }
        }
        _ => fail("EINVAL", format!("unknown route {route}")),
    }
}


fn reveal_in_file_manager(p: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = std::process::Command::new("explorer");
        if p.is_dir() { cmd.arg(p); } else { cmd.arg(format!("/select,{}", p.to_string_lossy())); }
        cmd.spawn().map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        let mut cmd = std::process::Command::new("open");
        if !p.is_dir() { cmd.arg("-R"); }
        cmd.arg(p);
        cmd.spawn().map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(all(unix, not(target_os = "macos"), not(target_os = "android")))]
    {
        let dir = if p.is_dir() { p } else { p.parent().unwrap_or(p) };
        let canon = fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf());
        let mut uri = String::from("file://");
        for b in canon.to_string_lossy().as_bytes() {
            match *b {
                b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'/' | b'-' | b'_' | b'.' | b'~' => uri.push(*b as char),
                _ => uri.push_str(&format!("%{:02X}", b)),
            }
        }
        // 1. Ask the running desktop's real file manager via Freedesktop FileManager1 D-Bus (selects the file, never launches baobab)
        let dbus_method = if p.is_dir() { "org.freedesktop.FileManager1.ShowFolders" } else { "org.freedesktop.FileManager1.ShowItems" };
        if let Ok(st) = std::process::Command::new("dbus-send")
            .args([
                "--session", "--print-reply", "--dest=org.freedesktop.FileManager1",
                "/org/freedesktop/FileManager1", dbus_method,
                &format!("array:string:{}", uri), "string:",
            ])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
        {
            if st.success() { return Ok(()); }
        }
        // 2. Check xdg-mime default for inode/directory, skipping disk analyzers (baobab, filelight, qdirstat, kdirstat)
        if let Ok(out) = std::process::Command::new("xdg-mime").args(["query", "default", "inode/directory"]).output() {
            if out.status.success() {
                let desk = String::from_utf8_lossy(&out.stdout).trim().to_string();
                let low = desk.to_lowercase();
                if !desk.is_empty() && !low.contains("baobab") && !low.contains("disk") && !low.contains("filelight") && !low.contains("dirstat") {
                    if std::process::Command::new("gtk-launch").arg(&desk).arg(dir).spawn().is_ok() {
                        return Ok(());
                    }
                }
            }
        }
        // 3. Fall back directly to installed Linux file managers (never baobab)
        for fm in ["nautilus", "nemo", "dolphin", "thunar", "caja", "pcmanfm-qt", "pcmanfm", "cosmic-files", "pantheon-files", "spacefm"] {
            if std::process::Command::new(fm).arg(dir).spawn().is_ok() {
                return Ok(());
            }
        }
        // 4. Last resort
        std::process::Command::new("xdg-open").arg(dir).spawn().map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "android")]
    {
        let _ = p;
        Err("Not supported on Android".into())
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
    if let Ok(rd) = fs::read_dir(&tmp) {
        for e in rd.filter_map(|e| e.ok()) {
            let name = e.file_name();
            let s = name.to_string_lossy();
            if (s.starts_with("import-") || s.starts_with("timotheos-import-")) && e.path().is_dir() {
                let _ = fs::remove_dir_all(e.path());
            }
        }
    }
    let os = if cfg!(target_os = "android") { "android" } else if cfg!(target_os = "windows") { "win32" } else if cfg!(target_os = "macos") { "darwin" } else { "linux" };
    let hostname = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| fs::read_to_string("/etc/hostname").ok().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()))
        .or_else(|| {
            #[cfg(not(target_os = "android"))]
            {
                std::process::Command::new("hostname").output().ok()
                    .filter(|o| o.status.success())
                    .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
                    .filter(|s| !s.is_empty())
            }
            #[cfg(target_os = "android")]
            { None }
        })
        .unwrap_or_else(|| os.to_string());
    let fwd = |s: String| s.replace('\\', "/");
    let (data, exe, home, tmp) = (fwd(data), fwd(exe), fwd(home), fwd(tmp));
    json!({ "dataDir": data, "exeDir": exe, "home": home, "tmp": tmp, "platform": os, "hostname": hostname, "appImage": std::env::var("APPIMAGE").ok().filter(|x| !x.is_empty()), "version": env!("CARGO_PKG_VERSION"),
            "env": { "TIMOTHEOS_SCRIPT": std::env::var("TIMOTHEOS_SCRIPT").ok(), "TIMOTHEOS_MODULES": std::env::var("TIMOTHEOS_MODULES").ok(), "TIMOTHEOS_PORTABLE_DIR": std::env::var("TIMOTHEOS_PORTABLE_DIR").ok(),
                      "TIMOTHEOS_WAIT": std::env::var("TIMOTHEOS_WAIT").ok(), "TIMOTHEOS_REPOS": std::env::var("TIMOTHEOS_REPOS").ok() } })
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
#[tauri::command(async)]
fn write_b64(path: String, data: String, append: bool) -> Result<(), String> {
    let bytes = STANDARD.decode(data).map_err(|e| e.to_string())?;
    if let Some(d) = Path::new(&path).parent() { let _ = fs::create_dir_all(d); }
    let mut o = fs::OpenOptions::new();
    if append { o.append(true).create(true); } else { o.write(true).create(true).truncate(true); }
    o.open(&path).and_then(|mut f| f.write_all(&bytes)).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> { fs::read_to_string(path).map_err(|e| e.to_string()) }

/* ---------- the internet: only the "Download modules" window uses it, and only when the user asks ---------- */
static NET_DONE: AtomicU64 = AtomicU64::new(0);
static NET_TOTAL: AtomicU64 = AtomicU64::new(0);
static NET_STOP: AtomicBool = AtomicBool::new(false);

fn temp_dir_of(app: &tauri::AppHandle) -> PathBuf {
    if cfg!(target_os = "android") { app.path().app_cache_dir().unwrap_or_default() } else { std::env::temp_dir() }
}
/// https only; a test build may also read from this computer itself (http://127.0.0.1), which is how the tests run
fn net_url_ok(u: &str) -> bool {
    let p = match url::Url::parse(u) { Ok(p) => p, Err(_) => return false };
    if p.scheme() == "https" && p.host_str().is_some() { return true; }
    cfg!(debug_assertions) && p.scheme() == "http" && p.host_str() == Some("127.0.0.1")
}
/// Names are looked up by the system first. When that fails (on Android a VPN switched on or off while Timotheos was open
/// can leave the app unable to look names up until it is restarted), it waits a moment and tries again, and then asks a
/// public DNS-over-HTTPS service by its number (Cloudflare 1.1.1.1, then Google 8.8.8.8), which needs no name lookup itself.
struct NetResolver;
fn doh_lookup(host: &str) -> Vec<std::net::IpAddr> {
    let q: String = url::form_urlencoded::byte_serialize(host.as_bytes()).collect();
    let agent = ureq::AgentBuilder::new().https_only(true).timeout_connect(std::time::Duration::from_secs(8))
        .timeout_read(std::time::Duration::from_secs(10)).user_agent(concat!("Timotheos/", env!("CARGO_PKG_VERSION"))).build();
    for base in ["https://1.1.1.1/dns-query", "https://8.8.8.8/resolve"] {
        let r = agent.get(&format!("{base}?name={q}&type=A")).set("Accept", "application/dns-json").call();
        let Ok(resp) = r else { continue };
        let Ok(txt) = resp.into_string() else { continue };
        let Ok(v) = serde_json::from_str::<Value>(&txt) else { continue };
        let ips: Vec<std::net::IpAddr> = v["Answer"].as_array().map(|a| a.iter()
            .filter(|x| x["type"].as_u64() == Some(1))
            .filter_map(|x| x["data"].as_str().and_then(|d| d.parse().ok())).collect()).unwrap_or_default();
        if !ips.is_empty() { return ips; }
    }
    Vec::new()
}
/// Order resolved socket addresses with IPv4 before IPv6 so VPNs/mobile networks without IPv6 routing
/// do not fail immediately with ENETUNREACH (os error 101). If system DNS returns only IPv6, also query DoH A records.
fn order_addrs_ipv4_first(addrs: Vec<std::net::SocketAddr>, host: &str, port: u16) -> Vec<std::net::SocketAddr> {
    let mut v4: Vec<std::net::SocketAddr> = addrs.iter().copied().filter(|a| a.is_ipv4()).collect();
    let v6: Vec<std::net::SocketAddr> = addrs.into_iter().filter(|a| a.is_ipv6()).collect();
    if v4.is_empty() && host.parse::<std::net::IpAddr>().is_err() {
        for ip in doh_lookup(host) {
            if ip.is_ipv4() { v4.push(std::net::SocketAddr::new(ip, port)); }
        }
    }
    v4.extend(v6);
    v4
}
struct DohIpv4Resolver;
impl ureq::Resolver for DohIpv4Resolver {
    fn resolve(&self, netloc: &str) -> std::io::Result<Vec<std::net::SocketAddr>> {
        use std::net::ToSocketAddrs;
        let (host, port) = match netloc.rsplit_once(':') { Some((h, p)) => (h.trim_matches(|c| c == '[' || c == ']'), p.parse().unwrap_or(443)), None => (netloc, 443) };
        let mut v4: Vec<std::net::SocketAddr> = if host.parse::<std::net::IpAddr>().is_err() {
            doh_lookup(host).into_iter().filter(|ip| ip.is_ipv4()).map(|ip| std::net::SocketAddr::new(ip, port)).collect()
        } else { Vec::new() };
        if v4.is_empty() {
            if let Ok(iter) = netloc.to_socket_addrs() {
                v4.extend(iter.filter(|a| a.is_ipv4()));
            }
        }
        if !v4.is_empty() { Ok(v4) } else { Err(std::io::Error::new(std::io::ErrorKind::NotFound, "no IPv4 address for this name")) }
    }
}
impl ureq::Resolver for NetResolver {
    fn resolve(&self, netloc: &str) -> std::io::Result<Vec<std::net::SocketAddr>> {
        use std::net::ToSocketAddrs;
        let (host, port) = match netloc.rsplit_once(':') { Some((h, p)) => (h.trim_matches(|c| c == '[' || c == ']'), p.parse().unwrap_or(443)), None => (netloc, 443) };
        let sys = || netloc.to_socket_addrs().map(|i| i.collect::<Vec<_>>());
        if let Ok(a) = sys() {
            let ordered = order_addrs_ipv4_first(a, host, port);
            if !ordered.is_empty() { return Ok(ordered); }
        }
        std::thread::sleep(std::time::Duration::from_millis(800));
        let first = match sys() {
            Ok(a) if !a.is_empty() => {
                let ordered = order_addrs_ipv4_first(a, host, port);
                if !ordered.is_empty() { return Ok(ordered); }
                None
            }
            Ok(_) => None,
            Err(e) => Some(e),
        };
        if host.parse::<std::net::IpAddr>().is_err() {
            let ips = doh_lookup(host);
            if !ips.is_empty() { return Ok(ips.into_iter().map(|ip| std::net::SocketAddr::new(ip, port)).collect()); }
        }
        Err(first.unwrap_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "no address for this name")))
    }
}
#[derive(Clone, serde::Serialize, serde::Deserialize)]
struct CachedHttp {
    etag: String,
    body: String,
}
static HTTP_CACHE: std::sync::OnceLock<Mutex<HashMap<String, CachedHttp>>> = std::sync::OnceLock::new();

fn is_github_api(url: &str) -> bool {
    url::Url::parse(url).ok().and_then(|p| p.host_str().map(|h| h.eq_ignore_ascii_case("api.github.com"))).unwrap_or(false)
}
fn apply_net_headers(mut req: ureq::Request, url: &str, etag: Option<&str>) -> ureq::Request {
    if is_github_api(url) {
        req = req.set("Accept", "application/vnd.github+json").set("X-GitHub-Api-Version", "2022-11-28");
    }
    if let Some(e) = etag {
        if !e.is_empty() { req = req.set("If-None-Match", e); }
    }
    req
}
fn load_http_cache(cache_file: Option<&Path>) -> &'static Mutex<HashMap<String, CachedHttp>> {
    HTTP_CACHE.get_or_init(|| {
        let map = cache_file
            .and_then(|p| fs::read_to_string(p).ok())
            .and_then(|s| serde_json::from_str::<HashMap<String, CachedHttp>>(&s).ok())
            .unwrap_or_default();
        Mutex::new(map)
    })
}
fn save_http_cache(cache_file: Option<&Path>, map: &HashMap<String, CachedHttp>) {
    let Some(p) = cache_file else { return; };
    if let Some(dir) = p.parent() { let _ = fs::create_dir_all(dir); }
    if let Ok(json_str) = serde_json::to_string(map) {
        let _ = fs::write(p, json_str);
    }
}
fn make_net_agent<R: ureq::Resolver + 'static>(r: R) -> ureq::Agent {
    ureq::AgentBuilder::new()
        .resolver(r)
        .https_only(!cfg!(debug_assertions))
        .timeout_connect(std::time::Duration::from_secs(25))
        .timeout_read(std::time::Duration::from_secs(60))
        .redirects(5)
        .user_agent(concat!("Timotheos/", env!("CARGO_PKG_VERSION")))
        .build()
}
fn net_fetch_text(cache_file: Option<&Path>, url: &str) -> Result<String, String> {
    if !net_url_ok(url) { return Err("Only https addresses can be downloaded.".into()); }
    let cache_lock = load_http_cache(cache_file);
    let cached = cache_lock.lock().ok().and_then(|m| m.get(url).cloned());
    let etag = cached.as_ref().map(|c| c.etag.as_str()).filter(|s| !s.is_empty());
    let first_try = apply_net_headers(make_net_agent(NetResolver).get(url), url, etag).call();
    let res = match first_try {
        Err(ureq::Error::Transport(_)) => apply_net_headers(make_net_agent(DohIpv4Resolver).get(url), url, etag).call(),
        other => other,
    };
    match res {
        Ok(resp) => {
            if resp.status() == 304 {
                if let Some(c) = cached { return Ok(c.body); }
            }
            let new_etag = resp.header("ETag").unwrap_or("").to_string();
            let mut body = String::new();
            let mut rd = resp.into_reader().take(20 << 20);
            rd.read_to_string(&mut body).map_err(|e| format!("The download broke off: {e}"))?;
            if (!new_etag.is_empty() || is_github_api(url)) && !body.is_empty() {
                if let Ok(mut m) = cache_lock.lock() {
                    if m.len() >= 80 && !m.contains_key(url) { m.clear(); }
                    m.insert(url.to_string(), CachedHttp { etag: new_etag, body: body.clone() });
                    save_http_cache(cache_file, &m);
                }
            }
            Ok(body)
        }
        Err(ureq::Error::Status(304, _)) => {
            cached.map(|c| c.body).ok_or_else(|| "The site answered with error 304.".into())
        }
        Err(ureq::Error::Status(c, resp)) => {
            if matches!(c, 403 | 429) && is_github_api(url) {
                if let Some(c_hit) = cached { return Ok(c_hit.body); }
                if resp.header("X-RateLimit-Remaining") == Some("0") {
                    return Err(format!("GitHub API rate limit exceeded (error {c})."));
                }
            }
            Err(format!("The site answered with error {c}."))
        }
        Err(ureq::Error::Transport(t)) => Err(format!("No connection: {t}")),
    }
}
fn net_fetch(url: &str, dest: &Path, max: u64) -> Result<u64, String> {
    if !net_url_ok(url) { return Err("Only https addresses can be downloaded.".into()); }
    let first_try = apply_net_headers(make_net_agent(NetResolver).get(url), url, None).call();
    let resp = match first_try {
        Ok(r) => r,
        Err(ureq::Error::Transport(_)) => apply_net_headers(make_net_agent(DohIpv4Resolver).get(url), url, None).call().map_err(|e| match e {
            ureq::Error::Status(c, _) => format!("The site answered with error {c}."),
            ureq::Error::Transport(t) => format!("No connection: {t}"),
        })?,
        Err(ureq::Error::Status(c, _)) => return Err(format!("The site answered with error {c}.")),
    };
    let total: u64 = resp.header("Content-Length").and_then(|v| v.parse().ok()).unwrap_or(0);
    if max > 0 && total > max { return Err("The file is larger than Timotheos downloads.".into()); }
    NET_TOTAL.store(total, Ordering::Relaxed);
    if let Some(d) = dest.parent() { fs::create_dir_all(d).map_err(|e| e.to_string())?; }
    let part = PathBuf::from(format!("{}.part", dest.to_string_lossy()));
    let mut out = fs::File::create(&part).map_err(|e| e.to_string())?;
    let mut rd = resp.into_reader();
    let mut buf = vec![0u8; 64 * 1024];
    let mut done: u64 = 0;
    let res: Result<(), String> = loop {
        if NET_STOP.load(Ordering::Relaxed) { break Err("Stopped.".into()); }
        match rd.read(&mut buf) {
            Ok(0) => break Ok(()),
            Ok(n) => {
                done += n as u64;
                if max > 0 && done > max { break Err("The file is larger than Timotheos downloads.".into()); }
                if let Err(e) = out.write_all(&buf[..n]) { break Err(e.to_string()); }
                NET_DONE.store(done, Ordering::Relaxed);
            }
            Err(e) => break Err(format!("The download broke off: {e}")),
        }
    };
    drop(out);
    if let Err(e) = res { let _ = fs::remove_file(&part); return Err(e); }
    if total > 0 && done != total { let _ = fs::remove_file(&part); return Err("The download broke off before the end.".into()); }
    let _ = fs::remove_file(dest);
    fs::rename(&part, dest).map_err(|e| e.to_string())?;
    Ok(done)
}
/// fetch small text (catalogs, release lists, JSON) directly with GitHub ETag caching without touching download-* temp folders
#[tauri::command(async)]
fn net_text(app: tauri::AppHandle, url: String) -> Result<String, String> {
    let cache_file = temp_dir_of(&app).join("timotheos-http-cache.json");
    net_fetch_text(Some(&cache_file), &url)
}
/// fetch one file into the temporary folder of Timotheos (nowhere else), for the "Download modules" window
#[tauri::command(async)]
fn net_get(app: tauri::AppHandle, url: String, dest: String, max: u64) -> Result<u64, String> {
    let tmp = temp_dir_of(&app);
    let d = PathBuf::from(&dest);
    if !d.starts_with(&tmp) || d.components().any(|c| matches!(c, std::path::Component::ParentDir)) { return Err("Downloads go to the temporary folder only.".into()); }
    // what earlier downloads left in the temporary folder is cleared away first (the import keeps its own copy)
    if let Ok(rd) = fs::read_dir(&tmp) {
        for e in rd.filter_map(|e| e.ok()) {
            let p = e.path();
            if e.file_name().to_string_lossy().starts_with("download-") && p.is_dir() && Some(p.as_path()) != d.parent() { let _ = fs::remove_dir_all(&p); }
        }
    }
    NET_DONE.store(0, Ordering::Relaxed); NET_TOTAL.store(0, Ordering::Relaxed); NET_STOP.store(false, Ordering::Relaxed);
    net_fetch(&url, &d, max)
}
#[tauri::command]
fn net_progress() -> Value { json!({ "done": NET_DONE.load(Ordering::Relaxed), "total": NET_TOTAL.load(Ordering::Relaxed) }) }
#[tauri::command]
fn net_stop() { NET_STOP.store(true, Ordering::Relaxed); }

/// the file must lie inside a "download-…" folder of the temporary folder of Timotheos (what net_get fills)
fn tmp_download(app: &tauri::AppHandle, path: &str) -> Result<PathBuf, String> {
    let tmp = temp_dir_of(app).canonicalize().map_err(|e| e.to_string())?;
    let f = PathBuf::from(path).canonicalize().map_err(|_| "The downloaded file is not there.".to_string())?;
    let ok = f.is_file() && f.starts_with(&tmp) && f.parent().and_then(|d| d.file_name()).map(|n| n.to_string_lossy().starts_with("download-")).unwrap_or(false);
    if ok { Ok(f) } else { Err("That file is not one Timotheos downloaded.".into()) }
}
/// SHA-256 of a downloaded file, as lower-case hex (an update is compared with the fingerprint GitHub lists before it is run)
#[tauri::command(async)]
fn net_sha256(app: tauri::AppHandle, path: String) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    let f = tmp_download(&app, &path)?;
    let mut rd = fs::File::open(&f).map_err(|e| e.to_string())?;
    let mut h = Sha256::new(); let mut buf = vec![0u8; 64 * 1024];
    loop { let n = rd.read(&mut buf).map_err(|e| e.to_string())?; if n == 0 { break; } h.update(&buf[..n]); }
    Ok(h.finalize().iter().map(|b| format!("{:02x}", b)).collect())
}
/// Start the downloaded installer. Windows: the setup program (Timotheos closes so it can be replaced). Linux: installed in place
/// and Timotheos starts again by itself (see linux_update). Android installs through its own screen (TwFiles.install in the activity).
#[tauri::command(async)]
fn update_run(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let f = tmp_download(&app, &path)?;
    let name = f.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
    if cfg!(target_os = "windows") {
        if !name.ends_with(".exe") { return Err("That is not a Windows installer.".into()); }
        std::process::Command::new(&f).spawn().map_err(|e| format!("The installer could not be started: {e}"))?;
        Ok("started".into())
    } else if cfg!(target_os = "linux") {
        linux_update(&f, &name)
    } else { Err("This system installs updates in another way.".into()) }
}

/// Start `exe` again in a couple of seconds, from a process that outlives this one (the old Timotheos has closed by then).
/// What the old AppImage put into the environment (paths inside its own mount) is taken out, so the new one starts clean.
#[cfg(target_os = "linux")]
fn relaunch(exe: &std::path::Path) -> Result<(), String> {
    let mut c = std::process::Command::new("sh");
    c.args(["-c", "nohup sh -c 'sleep 2.5; exec \"$0\"' \"$1\" >/dev/null 2>&1 &", "x"]).arg(exe)
        .stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
    if let Ok(dir) = std::env::var("APPDIR") {
        for (k, v) in std::env::vars() {
            if !dir.is_empty() && v.contains(&dir) {
                let kept: Vec<&str> = v.split(':').filter(|x| !x.contains(&dir)).collect();
                if kept.is_empty() || !v.contains(':') { c.env_remove(&k); } else { c.env(&k, kept.join(":")); }
            }
        }
        for k in ["APPDIR", "APPIMAGE", "ARGV0", "OWD"] { c.env_remove(k); }
    }
    c.spawn().map(|_| ()).map_err(|e| format!("Timotheos could not be started again: {e}"))
}

/// Linux: an AppImage replaces the file it runs from; a .deb is installed with the system's package tool after the administrator
/// password is asked for (pkexec). Then Timotheos starts again by itself. Answers "restarting", "cancelled" or "folder" (nothing
/// installable here: the folder with the file is shown instead).
#[cfg(target_os = "linux")]
fn linux_update(f: &std::path::Path, name: &str) -> Result<String, String> {
    use std::os::unix::fs::PermissionsExt;
    let show_folder = || -> Result<String, String> {
        let d = f.parent().map(|p| p.to_path_buf()).unwrap_or_default();
        std::process::Command::new("xdg-open").arg(&d).spawn().map_err(|e| format!("The folder could not be opened: {e}"))?;
        Ok("folder".into())
    };
    if name.ends_with(".appimage") {
        let target = match std::env::var("APPIMAGE") { Ok(t) if !t.is_empty() => PathBuf::from(t), _ => return show_folder() };
        let side = PathBuf::from(format!("{}.update", target.to_string_lossy()));
        fs::copy(f, &side).map_err(|e| format!("The new version could not be saved next to {}: {e}", target.display()))?;
        let r = fs::set_permissions(&side, fs::Permissions::from_mode(0o755)).and_then(|_| fs::rename(&side, &target));
        if let Err(e) = r { let _ = fs::remove_file(&side); return Err(format!("The AppImage {} could not be replaced: {e}", target.display())); }
        relaunch(&target)?;
        Ok("restarting".into())
    } else if name.ends_with(".deb") {
        let has = |t: &str| std::env::var("PATH").unwrap_or_default().split(':').any(|d| std::path::Path::new(d).join(t).is_file());
        if !has("pkexec") || !has("apt-get") { return show_folder(); }
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let exe = PathBuf::from(exe.to_string_lossy().trim_end_matches(" (deleted)").to_string());
        let out = std::process::Command::new("pkexec")
            .args(["env", "DEBIAN_FRONTEND=noninteractive", "apt-get", "install", "-y", "--reinstall", "--allow-downgrades"]).arg(f)
            .stdin(std::process::Stdio::null()).output().map_err(|e| format!("The installer could not be started: {e}"))?;
        match out.status.code() {
            Some(0) => {}
            Some(126) | Some(127) => return Ok("cancelled".into()),   // pkexec: the password was not given / not allowed
            _ => {
                let t = String::from_utf8_lossy(&out.stderr); let t = t.trim();
                let tail: Vec<&str> = t.lines().rev().take(4).collect::<Vec<_>>().into_iter().rev().collect();
                return Err(format!("The package tool said: {}", if tail.is_empty() { "it did not finish".to_string() } else { tail.join(" ") }));
            }
        }
        // the installed program (the old file may be gone now): /usr/bin/<same name> when there is one
        let again = exe.file_name().map(|n| PathBuf::from("/usr/bin").join(n)).filter(|p| p.is_file()).unwrap_or(exe);
        relaunch(&again)?;
        Ok("restarting".into())
    } else { show_folder() }
}
#[cfg(not(target_os = "linux"))]
fn linux_update(_f: &std::path::Path, _name: &str) -> Result<String, String> { Err("This system installs updates in another way.".into()) }

/// HTTPS request helper for PC cloud config sync (Google Drive, Dropbox, Microsoft OneDrive)
#[tauri::command]
fn net_request(method: String, url: String, headers: std::collections::HashMap<String, String>, body: String) -> Result<Value, String> {
    if !net_url_ok(&url) { return Err("Only https addresses are allowed.".into()); }
    let agent = ureq::AgentBuilder::new()
        .resolver(NetResolver)
        .https_only(!cfg!(debug_assertions))
        .timeout_connect(std::time::Duration::from_secs(15))
        .timeout_read(std::time::Duration::from_secs(30))
        .build();
    let mut req = agent.request(&method.to_uppercase(), &url).set("User-Agent", "Timotheos/1.0");
    for (k, v) in headers { req = req.set(&k, &v); }
    let res = if body.is_empty() && matches!(method.to_uppercase().as_str(), "GET" | "HEAD" | "DELETE") {
        req.call()
    } else {
        req.send_string(&body)
    };
    match res {
        Ok(r) => {
            let status = r.status();
            let text = r.into_string().unwrap_or_default();
            Ok(json!({ "status": status, "body": text }))
        }
        Err(ureq::Error::Status(code, r)) => {
            let text = r.into_string().unwrap_or_default();
            Err(format!("HTTP {code}: {}", text.chars().take(240).collect::<String>()))
        }
        Err(ureq::Error::Transport(t)) => Err(format!("No connection: {t}")),
    }
}

/// Bind a local loopback listener on 127.0.0.1:0, open the OAuth URL in the default browser, and wait for the callback code.
#[tauri::command]
async fn oauth_auth(auth_url_template: String, timeout_secs: Option<u64>) -> Result<Value, String> {
    #[cfg(target_os = "android")]
    {
        let _ = (auth_url_template, timeout_secs);
        return Err("OAuth desktop sync is only available on PC.".into());
    }
    #[cfg(not(target_os = "android"))]
    {
        let secs = timeout_secs.unwrap_or(180).clamp(15, 300);
        tauri::async_runtime::spawn_blocking(move || -> Result<Value, String> {
            use std::io::{Read, Write};
            let listener = std::net::TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
            let port = listener.local_addr().map_err(|e| e.to_string())?.port();
            let redirect_uri = format!("http://127.0.0.1:{port}/callback");
            let encoded_redir = url::form_urlencoded::byte_serialize(redirect_uri.as_bytes()).collect::<String>();
            let full_url = auth_url_template.replace("__REDIRECT_URI__", &encoded_redir);
            if !net_url_ok(&full_url) { return Err("Invalid OAuth URL.".into()); }
            #[cfg(target_os = "windows")]
            { let _ = std::process::Command::new("cmd").args(["/C", "start", "", &full_url]).spawn(); }
            #[cfg(target_os = "macos")]
            { let _ = std::process::Command::new("open").arg(&full_url).spawn(); }
            #[cfg(all(unix, not(target_os = "macos")))]
            { let _ = std::process::Command::new("xdg-open").arg(&full_url).spawn(); }

            listener.set_nonblocking(true).map_err(|e| e.to_string())?;
            let deadline = std::time::Instant::now() + std::time::Duration::from_secs(secs);
            loop {
                match listener.accept() {
                    Ok((mut stream, _)) => {
                        let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(5)));
                        let mut buf = [0u8; 4096];
                        let n = stream.read(&mut buf).unwrap_or(0);
                        let req_line = String::from_utf8_lossy(&buf[..n]).lines().next().unwrap_or("").to_string();
                        let path_q = req_line.split_whitespace().nth(1).unwrap_or("/");
                        let parsed = url::Url::parse(&format!("http://127.0.0.1:{port}{path_q}")).map_err(|e| e.to_string())?;
                        let mut code = String::new();
                        let mut state = String::new();
                        let mut err = String::new();
                        for (k, v) in parsed.query_pairs() {
                            if k == "code" { code = v.to_string(); }
                            else if k == "state" { state = v.to_string(); }
                            else if k == "error" { err = v.to_string(); }
                        }
                        let html = if err.is_empty() && !code.is_empty() {
                            "<html><body style='font-family:sans-serif;text-align:center;padding:48px'><h2>Signed in to Timotheos</h2><p>You can close this browser tab and return to Timotheos.</p></body></html>"
                        } else {
                            "<html><body style='font-family:sans-serif;text-align:center;padding:48px'><h2>Sign-in cancelled</h2><p>You can close this tab and return to Timotheos.</p></body></html>"
                        };
                        let resp = format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", html.len(), html);
                        let _ = stream.write_all(resp.as_bytes());
                        if !err.is_empty() { return Err(format!("Sign-in failed: {err}")); }
                        if code.is_empty() { return Err("No authorization code received.".into()); }
                        return Ok(json!({ "code": code, "state": state, "redirectUri": redirect_uri }));
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        if std::time::Instant::now() >= deadline {
                            return Err("Sign-in timed out. Please try again.".into());
                        }
                        std::thread::sleep(std::time::Duration::from_millis(120));
                    }
                    Err(e) => return Err(e.to_string()),
                }
            }
        }).await.map_err(|e| e.to_string())?
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Linux: WebKitGTK's GPU compositing shows soft, blurred text while scrolling. Software compositing keeps it sharp.
    // Set before any web view exists; a value the user already set (even "0") is respected.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() {
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }
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
        .invoke_handler(tauri::generate_handler![host_info, test_report, read_text_file, quit, write_b64, net_text, net_get, net_progress, net_stop, net_sha256, update_run, net_request, oauth_auth])
        .run(tauri::generate_context!())
        .expect("error while running Timotheos");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_https_addresses_are_downloaded() {
        assert!(net_url_ok("https://ebible.org/Scriptures/translations.csv"));
        assert!(!net_url_ok("http://ebible.org/x"));
        assert!(!net_url_ok("file:///etc/passwd"));
        assert!(!net_url_ok("ftp://example.org/x"));
        assert!(!net_url_ok("nonsense"));
        assert!(is_github_api("https://api.github.com/users/SalitaNgDiyos/repos"));
        assert!(!is_github_api("https://github.com/SalitaNgDiyos/Timotheos"));
    }
    /// needs the internet: run with `cargo test -- --ignored` (the build on GitHub does)
    #[test]
    #[ignore]
    fn the_ebible_list_can_be_fetched_over_https() {
        let f = std::env::temp_dir().join("timotheos-net-test.csv");
        let n = net_fetch("https://ebible.org/Scriptures/translations.csv", &f, 20 << 20).unwrap();
        assert!(n > 100_000);
        assert!(fs::read_to_string(&f).unwrap().contains("translationId"));
    }
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
    #[test]
    fn unzip_to_dir_streams_stored_and_deflated_and_rejects_limits() {
        use flate2::{write::DeflateEncoder, Compression};
        fn crc32(data: &[u8]) -> u32 {
            let mut c: u32 = 0xFFFF_FFFF;
            for &b in data {
                c ^= b as u32;
                for _ in 0..8 { c = if (c & 1) != 0 { 0xEDB8_8320 ^ (c >> 1) } else { c >> 1 }; }
            }
            !c
        }
        fn build_zip(items: &[(&str, &[u8], u16, u16)]) -> Vec<u8> {
            let mut locals = Vec::new();
            let mut central = Vec::new();
            let mut off: u32 = 0;
            for &(name, raw, method, flags) in items {
                let comp = if method == 8 {
                    let mut enc = DeflateEncoder::new(Vec::new(), Compression::default());
                    enc.write_all(raw).unwrap();
                    enc.finish().unwrap()
                } else {
                    raw.to_vec()
                };
                let crc = crc32(raw);
                let nm = name.as_bytes();
                let mut h = Vec::with_capacity(30 + nm.len());
                h.extend_from_slice(&0x0403_4b50u32.to_le_bytes());
                h.extend_from_slice(&20u16.to_le_bytes());
                h.extend_from_slice(&(flags | 0x0800).to_le_bytes());
                h.extend_from_slice(&method.to_le_bytes());
                h.extend_from_slice(&0u32.to_le_bytes());
                h.extend_from_slice(&crc.to_le_bytes());
                h.extend_from_slice(&(comp.len() as u32).to_le_bytes());
                h.extend_from_slice(&(raw.len() as u32).to_le_bytes());
                h.extend_from_slice(&(nm.len() as u16).to_le_bytes());
                h.extend_from_slice(&0u16.to_le_bytes());
                h.extend_from_slice(nm);

                let mut c = Vec::with_capacity(46 + nm.len());
                c.extend_from_slice(&0x0201_4b50u32.to_le_bytes());
                c.extend_from_slice(&20u16.to_le_bytes());
                c.extend_from_slice(&20u16.to_le_bytes());
                c.extend_from_slice(&(flags | 0x0800).to_le_bytes());
                c.extend_from_slice(&method.to_le_bytes());
                c.extend_from_slice(&0u32.to_le_bytes());
                c.extend_from_slice(&crc.to_le_bytes());
                c.extend_from_slice(&(comp.len() as u32).to_le_bytes());
                c.extend_from_slice(&(raw.len() as u32).to_le_bytes());
                c.extend_from_slice(&(nm.len() as u16).to_le_bytes());
                c.extend_from_slice(&0u16.to_le_bytes());
                c.extend_from_slice(&0u16.to_le_bytes());
                c.extend_from_slice(&0u16.to_le_bytes());
                c.extend_from_slice(&0u16.to_le_bytes());
                c.extend_from_slice(&0u32.to_le_bytes());
                c.extend_from_slice(&off.to_le_bytes());
                c.extend_from_slice(nm);

                off += (h.len() + comp.len()) as u32;
                locals.extend_from_slice(&h);
                locals.extend_from_slice(&comp);
                central.extend_from_slice(&c);
            }
            let mut eocd = Vec::with_capacity(22);
            eocd.extend_from_slice(&0x0605_4b50u32.to_le_bytes());
            eocd.extend_from_slice(&0u32.to_le_bytes());
            eocd.extend_from_slice(&(items.len() as u16).to_le_bytes());
            eocd.extend_from_slice(&(items.len() as u16).to_le_bytes());
            eocd.extend_from_slice(&(central.len() as u32).to_le_bytes());
            eocd.extend_from_slice(&off.to_le_bytes());
            eocd.extend_from_slice(&0u16.to_le_bytes());
            locals.extend_from_slice(&central);
            locals.extend_from_slice(&eocd);
            locals
        }

        let dir = std::env::temp_dir().join("timotheos-unzip-test");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        let big_payload = vec![b'A'; 128 * 1024];
        let z1 = dir.join("ok.zip");
        fs::write(&z1, build_zip(&[
            ("plain.txt", b"stored-hello", 0, 0),
            ("sub/big.bin", &big_payload, 8, 0),
        ])).unwrap();
        let out1 = dir.join("out1");
        let res1 = unzip_to_dir(&z1, &out1, 800 * 1024 * 1024).unwrap();
        assert_eq!(res1["ok"], true);
        assert_eq!(fs::read(out1.join("plain.txt")).unwrap(), b"stored-hello");
        assert_eq!(fs::read(out1.join("sub/big.bin")).unwrap(), big_payload);

        let out_lim = dir.join("out_lim");
        let res_lim = unzip_to_dir(&z1, &out_lim, 1024).unwrap();
        assert_eq!(res_lim["ok"], false);
        assert_eq!(res_lim["code"], "ERROR");

        let z_enc = dir.join("enc.zip");
        fs::write(&z_enc, build_zip(&[("secret.txt", b"xyz", 0, 1)])).unwrap();
        let out_enc = dir.join("out_enc");
        let res_enc = unzip_to_dir(&z_enc, &out_enc, 800 * 1024 * 1024).unwrap();
        assert_eq!(res_enc["ok"], false);
        assert_eq!(res_enc["code"], "PASSWORD");

        let _ = fs::remove_dir_all(&dir);
    }
}
