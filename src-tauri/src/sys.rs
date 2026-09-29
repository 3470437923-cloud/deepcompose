//! 系统目录与配置存储。
//!
//! 目录口径：
//!   配置：%APPDATA%\com.writerd\writerD\shared_preferences.json
//!   作品根默认：%USERPROFILE%\AI写小说

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SysDirs {
    pub home: String,
    pub documents: String,
    /// %APPDATA%
    pub app_data: String,
    /// 配置目录（已建好）
    pub prefs_dir: String,
    pub prefs_file: String,
}

fn home_dir() -> PathBuf {
    std::env::var_os("USERPROFILE")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

fn appdata_dir() -> PathBuf {
    std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| home_dir().join("AppData\\Roaming"))
}

fn documents_dir() -> PathBuf {
    home_dir().join("Documents")
}

pub fn prefs_path() -> PathBuf {
    appdata_dir().join("com.writerd").join("writerD").join("shared_preferences.json")
}

#[tauri::command]
pub fn app_dirs() -> Result<SysDirs, String> {
    let prefs_file = prefs_path();
    let prefs_dir = prefs_file.parent().map(PathBuf::from).unwrap_or_default();
    fs::create_dir_all(&prefs_dir).map_err(|e| format!("建配置目录失败: {e}"))?;
    Ok(SysDirs {
        home: home_dir().to_string_lossy().to_string(),
        documents: documents_dir().to_string_lossy().to_string(),
        app_data: appdata_dir().to_string_lossy().to_string(),
        prefs_dir: prefs_dir.to_string_lossy().to_string(),
        prefs_file: prefs_file.to_string_lossy().to_string(),
    })
}

/// 读取配置原文；文件不存在时返回空对象
#[tauri::command]
pub fn prefs_load() -> Result<String, String> {
    let p = prefs_path();
    match fs::read_to_string(&p) {
        Ok(s) => Ok(s),
        Err(_) => Ok("{}".to_string()),
    }
}

#[tauri::command]
pub fn prefs_save(json: String) -> Result<(), String> {
    let p = prefs_path();
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("建配置目录失败: {e}"))?;
    }
    fs::write(&p, json).map_err(|e| format!("写配置失败: {e}"))
}

/// 在 Windows 资源管理器中打开指定目录（设置页「打开目录」用）。
///
/// 为什么不用 opener 插件的 open_path：它的授权 scope 是**静态白名单**，
/// 而作品根可由用户改到任意盘符路径，静态白名单覆盖不了；这里改为
/// 运行时校验"确实是目录"后直接拉起 explorer，行为可控且无需配置 scope。
#[tauri::command]
pub fn open_dir(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.is_dir() {
        return Err(format!("目录不存在：{path}"));
    }
    std::process::Command::new("explorer")
        .arg(&p)
        .spawn()
        .map_err(|e| format!("拉起资源管理器失败: {e}"))?;
    Ok(())
}
