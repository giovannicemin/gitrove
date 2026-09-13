//! The native shell.
//!
//! The whole interface is four commands the web page cannot do for itself:
//! ask the user for a file, read one, write one, and notice when one changes
//! underneath us. Everything else — parsing, layout, drawing — is JavaScript
//! in `ui/`.

use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::DialogExt;

/// The file we are watching, and the modification time we last saw on it.
#[derive(Default)]
struct Watched {
    path: Option<String>,
    seen: Option<SystemTime>,
}

type Watch = Arc<Mutex<Watched>>;

fn mtime(path: &str) -> Option<SystemTime> {
    std::fs::metadata(path).ok()?.modified().ok()
}

#[tauri::command]
fn read_project(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("{path}: {e}"))
}

/// Write via a temporary file in the same directory, then rename over the
/// original. A crash mid-write then leaves the old file intact rather than a
/// half-written one.
#[tauri::command]
fn write_project(path: String, text: String, watch: State<'_, Watch>) -> Result<(), String> {
    let tmp = format!("{path}.gitrove-tmp");
    std::fs::write(&tmp, &text).map_err(|e| format!("{tmp}: {e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("{path}: {e}"))?;
    // our own write must not come back as an external change
    if let Ok(mut w) = watch.lock() {
        if w.path.as_deref() == Some(path.as_str()) {
            w.seen = mtime(&path);
        }
    }
    Ok(())
}

/// Native file picker. Runs off the main thread: the blocking dialog would
/// deadlock the event loop otherwise.
#[tauri::command]
async fn pick_project(app: AppHandle, save: bool) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dialog = app.dialog().file().add_filter("org files", &["org"]);
        let picked = if save {
            dialog.set_file_name("project.org").blocking_save_file()
        } else {
            dialog.blocking_pick_file()
        };
        picked.map(|p| p.to_string())
    })
    .await
    .map_err(|e| e.to_string())
}

/// Watch one file. Polling its mtime once a second is plenty for a file a
/// person edits by hand, and costs nothing in dependencies or surprises.
#[tauri::command]
fn watch_project(app: AppHandle, path: String, watch: State<'_, Watch>) -> Result<(), String> {
    let first = {
        let mut w = watch.lock().map_err(|e| e.to_string())?;
        let already = w.path.is_some();
        w.path = Some(path.clone());
        w.seen = mtime(&path);
        !already
    };
    if !first {
        return Ok(()); // one poller is enough; it reads whatever path is current
    }
    let state: Watch = Arc::clone(&watch);
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(1));
        let (path, seen) = match state.lock() {
            Ok(w) => match &w.path {
                Some(p) => (p.clone(), w.seen),
                None => continue,
            },
            Err(_) => continue,
        };
        let now = mtime(&path);
        if now.is_some() && now != seen {
            if let Ok(mut w) = state.lock() {
                w.seen = now;
            }
            let _ = app.emit("project-changed", path);
        }
    });
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Watch::default())
        .invoke_handler(tauri::generate_handler![
            read_project,
            write_project,
            pick_project,
            watch_project
        ])
        .run(tauri::generate_context!())
        .expect("error while running gitrove");
}
