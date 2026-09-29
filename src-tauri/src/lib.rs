use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::Manager;

mod ai;
mod fs;
mod sys;
mod winstate;

/// 应用身份信息（名称 + 版本），供设置屏「关于」分节展示。
/// 版本取自 Cargo.toml（env! 编译期注入），保证界面显示与产物版本永远一致。
#[derive(Serialize, Clone)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
}

#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        name: "KeepCompose".into(),
        version: env!("CARGO_PKG_VERSION").into(),
    }
}

pub fn run() {
    tauri::Builder::default()
        .manage(ai::AbortMap(Mutex::new(HashMap::new())))
        .manage(winstate::Tracker::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            app_info,
            sys::app_dirs,
            sys::prefs_load,
            sys::prefs_save,
            sys::open_dir,
            fs::fs_read_text,
            fs::fs_write_text,
            fs::fs_append_text,
            fs::fs_list,
            fs::fs_exists,
            fs::fs_mkdir,
            fs::fs_remove,
            fs::fs_remove_child,
            fs::fs_rename,
            fs::fs_copy,
            fs::fs_stat,
            ai::ai_stream,
            ai::ai_models,
            ai::ai_balance,
            ai::ai_abort,
        ])
        .setup(|app| {
            // tauri.conf.json 里窗口是 visible:false —— 先把记忆的几何摆好再显示，
            // 否则窗口会先在居中的默认位置闪一下、再跳到上次的位置。
            // 顺序依据：tauri 2.11.6 app.rs:2531 先建配置窗口、2536 才跑 setup。
            // 只能用 get_webview_window：Manager trait 上没有 get_window。
            if let Some(win) = app.get_webview_window("main") {
                let tracker = app.state::<winstate::Tracker>();
                // 注意：restore 内部负责 show()。有记忆几何时它会先补偿尺寸、
                // 该最大化就最大化，全部落定后再显示（否则会看到尺寸跳一下）。
                winstate::restore(&win, &tracker);

                // 兜底：万一上面的恢复任务没能走到 show()，这里无条件补一次
                // （重复 show 是幂等的）。宁可多显示一次，也不能让窗口永不出现。
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_millis(1200)).await;
                    let _ = win.show();
                });
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // on_window_event 给的是 &Window，几何方法两边都有，但几何模块统一收
            // &WebviewWindow，故在此按 label 取回同一个窗口。
            let Some(win) = window.app_handle().get_webview_window(window.label()) else {
                return;
            };
            let tracker = win.state::<winstate::Tracker>();
            match event {
                tauri::WindowEvent::Resized(_) | tauri::WindowEvent::Moved(_) => {
                    winstate::track_soon(&win, &tracker)
                }
                // 关窗有两条路径（前端守卫确认后 destroy()，以及直接 CloseRequested），
                // 两条都落盘，保证无论怎么关都能记住几何。
                tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed => {
                    winstate::persist(&win, &tracker)
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("KeepCompose 启动失败");
}
