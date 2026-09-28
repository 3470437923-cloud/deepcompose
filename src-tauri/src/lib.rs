use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;

mod ai;
mod fs;
mod sys;

#[derive(Serialize, Clone)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
}

#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        name: "writerD".into(),
        version: env!("CARGO_PKG_VERSION").into(),
    }
}

pub fn run() {
    tauri::Builder::default()
        .manage(ai::AbortMap(Mutex::new(HashMap::new())))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            app_info,
            sys::app_dirs,
            sys::prefs_load,
            sys::prefs_save,
            fs::fs_read_text,
            fs::fs_write_text,
            fs::fs_append_text,
            fs::fs_list,
            fs::fs_exists,
            fs::fs_mkdir,
            fs::fs_remove,
            fs::fs_rename,
            fs::fs_copy,
            fs::fs_stat,
            ai::ai_stream,
            ai::ai_models,
            ai::ai_abort,
        ])
        .run(tauri::generate_context!())
        .expect("writerD 启动失败");
}
