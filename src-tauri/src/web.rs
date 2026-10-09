//! 网页版参考栏（D-057，2026-10-09 用户裁决）：白名单站点内嵌为主窗口的子 webview。
//!
//! 隔离纪律（用户原话「不能支持这个浏览器ai接入任何东西」）：
//!  - URL 白名单**编译期硬编码**，前端只能传 key，任何其它输入直接拒绝 ——
//!    应用没有"任意地址浏览器"这条攻击面；
//!  - 远程页面零 IPC：capabilities 不给任何远程源开口，子 webview 的 JS
//!    调不动本应用的任何命令（fs/ai/prefs 全部不可达）；
//!  - 独立 WebView2 数据目录（与主窗口互不影响），登录态属于用户自己的网页会话；
//!  - 应用不注入脚本、不抓取内容、不回读任何数据。
//!
//! 已知坑（tauri 文档）：Windows 上 add_child 在同步命令/事件处理器里会死锁
//! （wry#583）—— 本模块三个命令全部是 async，务必保持。
//!
//! 生命周期：子 webview 不随前端 DOM 卸载自动消失，前端的栏位组件负责在
//! 栏收起 / 进设置屏 / 组件卸载时显式调 web_close；开过的栏重开时 web_open
//! 复用已存在的子视图（只挪几何 + 聚焦，不重载页面）。

use std::path::PathBuf;
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewUrl};

/// key → URL 白名单（编译期常量；加站点 = 改这里 + 重编译）。
/// 两个入口的语义：
///  - deepseek：DeepSeek 网页版（参考对话，与 API 配置无关）
///  - zhuque：腾讯朱雀 AI 检测（AI 生成内容鉴别，https://matrix.tencent.com/ai-detect/ai_gen）
pub fn allowed_url(key: &str) -> Option<&'static str> {
    match key {
        "deepseek" => Some("https://chat.deepseek.com/"),
        "zhuque" => Some("https://matrix.tencent.com/ai-detect/ai_gen"),
        _ => None,
    }
}

fn label_of(key: &str) -> String {
    format!("web-{key}")
}

/// 子视图的独立数据目录（登录态与主窗口隔离）：<配置目录>\webview-sessions\<key>
fn data_dir(key: &str) -> PathBuf {
    crate::sys::prefs_path()
        .with_file_name("webview-sessions")
        .join(key)
}

#[tauri::command]
pub async fn web_open(app: AppHandle, key: String, x: f64, y: f64, w: f64, h: f64) -> Result<(), String> {
    let Some(url) = allowed_url(&key) else {
        return Err(format!("未知的网页入口：{key}"));
    };
    let label = label_of(&key);
    // 已存在 = 复用：挪到最新几何并聚焦，不重载页面（登录态与浏览位置都保留）
    if let Some(wv) = app.get_webview(&label) {
        wv.set_position(LogicalPosition::new(x, y)).map_err(|e| e.to_string())?;
        wv.set_size(LogicalSize::new(w, h)).map_err(|e| e.to_string())?;
        wv.show().map_err(|e| e.to_string())?;
        return Ok(());
    }
    let window = app.get_window("main").ok_or("主窗口不存在")?;
    let parsed = url.parse().map_err(|e| format!("白名单 URL 解析失败（不该发生）：{e}"))?;
    let builder = tauri::webview::WebviewBuilder::new(label, WebviewUrl::External(parsed))
        .data_directory(data_dir(&key));
    window
        .add_child(builder, LogicalPosition::new(x, y), LogicalSize::new(w, h))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn web_move(app: AppHandle, key: String, x: f64, y: f64, w: f64, h: f64) -> Result<(), String> {
    if allowed_url(&key).is_none() {
        return Err(format!("未知的网页入口：{key}"));
    }
    if let Some(wv) = app.get_webview(&label_of(&key)) {
        wv.set_position(LogicalPosition::new(x, y)).map_err(|e| e.to_string())?;
        wv.set_size(LogicalSize::new(w, h)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn web_close(app: AppHandle, key: String) -> Result<(), String> {
    if allowed_url(&key).is_none() {
        return Err(format!("未知的网页入口：{key}"));
    }
    if let Some(wv) = app.get_webview(&label_of(&key)) {
        wv.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn whitelist_allows_only_the_two_entries() {
        assert_eq!(allowed_url("deepseek"), Some("https://chat.deepseek.com/"));
        assert_eq!(allowed_url("zhuque"), Some("https://matrix.tencent.com/ai-detect/ai_gen"));
    }

    #[test]
    fn whitelist_rejects_everything_else() {
        // 完整 URL、大小写变体、空串、带 NUL 的注入串：一律拒绝
        assert_eq!(allowed_url("https://evil.example/"), None);
        assert_eq!(allowed_url("DeepSeek"), None);
        assert_eq!(allowed_url(""), None);
        assert_eq!(allowed_url("deepseek\0zhuque"), None);
    }
}
