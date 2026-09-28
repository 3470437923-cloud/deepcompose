//! 文件系统能力层。
//!
//! 只做「纯原语」：读写/列举/改名/复制/删除/stat。
//! **路径分级授权不在这里**——业务层（TS 的 pathGuard）负责判定
//! projectRoot / skillsDir / booksRoot 三授权根，Rust 侧不重复实现策略。
//! 这样规则只有一份，测试也只测一份。

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    /// 相对查询目录的路径（'\' 分隔）
    pub rel: String,
    /// 绝对路径
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub mtime_ms: u64,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StatInfo {
    pub is_dir: bool,
    pub size: u64,
    pub mtime_ms: u64,
}

fn io_err<E: std::fmt::Display>(e: E) -> String {
    format!("{e}")
}

fn mtime_ms(md: &fs::Metadata) -> u64 {
    md.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[tauri::command]
pub fn fs_read_text(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("读取失败 {path}: {}", io_err(e)))
}

#[tauri::command]
pub fn fs_write_text(path: String, content: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("建目录失败 {}: {}", parent.display(), io_err(e)))?;
    }
    fs::write(&p, content).map_err(|e| format!("写入失败 {path}: {}", io_err(e)))
}

#[tauri::command]
pub fn fs_append_text(path: String, content: String) -> Result<(), String> {
    use std::io::Write;
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("建目录失败 {}: {}", parent.display(), io_err(e)))?;
    }
    let mut f = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&p)
        .map_err(|e| format!("打开失败 {path}: {}", io_err(e)))?;
    f.write_all(content.as_bytes())
        .map_err(|e| format!("追加失败 {path}: {}", io_err(e)))
}

/// 列出目录的直接子项；目录不存在时返回空表（与 TS 侧测试替身同行为）
#[tauri::command]
pub fn fs_list(dir: String) -> Result<Vec<DirEntry>, String> {
    let base = Path::new(&dir);
    let rd = match fs::read_dir(base) {
        Ok(rd) => rd,
        Err(_) => return Ok(vec![]),
    };
    let mut out = Vec::new();
    for ent in rd.flatten() {
        let path = ent.path();
        let md = match ent.metadata() {
            Ok(md) => md,
            Err(_) => continue,
        };
        let name = ent.file_name().to_string_lossy().to_string();
        out.push(DirEntry {
            rel: name.clone(),
            path: path.to_string_lossy().to_string(),
            is_dir: md.is_dir(),
            size: if md.is_dir() { 0 } else { md.len() },
            mtime_ms: mtime_ms(&md),
            name,
        });
    }
    // 稳定顺序：目录在前，再按名称（大小写不敏感）
    out.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(out)
}

#[tauri::command]
pub fn fs_exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists())
}

#[tauri::command]
pub fn fs_mkdir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("建目录失败 {path}: {}", io_err(e)))
}

#[tauri::command]
pub fn fs_remove(path: String, recursive: bool) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Ok(());
    }
    let r = if p.is_dir() {
        if recursive {
            fs::remove_dir_all(p)
        } else {
            fs::remove_dir(p)
        }
    } else {
        fs::remove_file(p)
    };
    r.map_err(|e| format!("删除失败 {path}: {}", io_err(e)))
}

#[tauri::command]
pub fn fs_rename(from: String, to: String) -> Result<(), String> {
    let t = PathBuf::from(&to);
    if let Some(parent) = t.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("建目录失败 {}: {}", parent.display(), io_err(e)))?;
    }
    fs::rename(&from, &t).map_err(|e| format!("改名失败 {from} → {to}: {}", io_err(e)))
}

#[tauri::command]
pub fn fs_copy(from: String, to: String) -> Result<(), String> {
    let src = Path::new(&from);
    let dst = PathBuf::from(&to);
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("建目录失败 {}: {}", parent.display(), io_err(e)))?;
    }
    if src.is_dir() {
        copy_dir(src, &dst).map_err(io_err)
    } else {
        fs::copy(src, &dst).map(|_| ()).map_err(|e| format!("复制失败 {from} → {to}: {}", io_err(e)))
    }
}

fn copy_dir(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for ent in fs::read_dir(src)? {
        let ent = ent?;
        let from = ent.path();
        let to = dst.join(ent.file_name());
        if from.is_dir() {
            copy_dir(&from, &to)?;
        } else {
            fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn fs_stat(path: String) -> Result<Option<StatInfo>, String> {
    match fs::metadata(&path) {
        Ok(md) => Ok(Some(StatInfo {
            is_dir: md.is_dir(),
            size: if md.is_dir() { 0 } else { md.len() },
            mtime_ms: mtime_ms(&md),
        })),
        Err(_) => Ok(None),
    }
}
