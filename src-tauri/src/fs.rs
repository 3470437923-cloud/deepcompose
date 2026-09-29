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
    /// 是否为链接 / junction（reparse point）。删除流程据此拒绝穿透（KL-DF-10）。
    pub is_link: bool,
}

/// 是否 reparse point（Windows：文件属性带 FILE_ATTRIBUTE_REPARSE_POINT）。
/// 用 `symlink_metadata` 的属性判断，而不是 `is_symlink()` —— 后者只覆盖符号链接，
/// 目录 junction（挂载点）在属性层面同样是 reparse point。
fn is_reparse(md: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
        return md.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0;
    }
    #[cfg(not(windows))]
    {
        md.file_type().is_symlink()
    }
}

/// Windows 保留设备名（含带扩展名形态：`NUL.txt` 同样是设备）。
/// 这些名字在 Windows 上无法作为真实文件/目录存在，出现即视为攻击面（KL-DF-10）。
fn is_reserved_device_name(name: &str) -> bool {
    let stem = name.split('.').next().unwrap_or("").trim_end_matches(' ');
    let up = stem.to_ascii_uppercase();
    if matches!(up.as_str(), "CON" | "PRN" | "AUX" | "NUL") {
        return true;
    }
    // COM1-9 / LPT1-9（COM0、LPT0 不是保留名；COM¹ 之类的上标形态这里不追）
    let bytes = up.as_bytes();
    if bytes.len() == 4 && (up.starts_with("COM") || up.starts_with("LPT")) {
        return (b'1'..=b'9').contains(&bytes[3]);
    }
    false
}

/// 单个路径段校验：删除类命令只接受"父目录 + 一个名字"，从结构上排除路径穿越。
/// 拒绝：空 / `.` / `..` / 含分隔符或 `:`（ADS）/ 通配符 / 控制字符 / 保留设备名。
pub fn valid_child_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name == "." || name == ".." {
        return Err(format!("非法名称：{name:?}"));
    }
    if name.contains(['\\', '/', ':', '*', '?', '"', '<', '>', '|']) {
        return Err(format!("名称含非法字符：{name}"));
    }
    if name.chars().any(|c| (c as u32) < 0x20) {
        return Err(format!("名称含控制字符：{name:?}"));
    }
    if name.ends_with(' ') || name.ends_with('.') {
        return Err(format!("名称不能以空格或点结尾：{name:?}"));
    }
    if is_reserved_device_name(name) {
        return Err(format!("名称是 Windows 保留设备名：{name}"));
    }
    Ok(())
}

/// 清掉只读属性（Windows 上只读文件会让 remove_dir_all 直接 "Access is denied"）。
/// 目录一并处理：只读目录同样会挡住删除。失败不致命（真删不掉时后续会报错）。
fn clear_readonly(path: &Path) {
    if let Ok(md) = fs::symlink_metadata(path) {
        if is_reparse(&md) {
            return; // 不动链接目标的属性
        }
        let mut perm = md.permissions();
        if perm.readonly() {
            perm.set_readonly(false);
            let _ = fs::set_permissions(path, perm);
        }
        if md.is_dir() {
            if let Ok(rd) = fs::read_dir(path) {
                for ent in rd.flatten() {
                    clear_readonly(&ent.path());
                }
            }
        }
    }
}

/// 稳健删除：清只读 → 删除 → 失败重试（杀软/预览程序短暂占用是常态）。
/// reparse point 只删链接本身，绝不跟随目标；不存在视为已达成（幂等）。
fn remove_path_robust(path: &Path, recursive: bool) -> Result<(), String> {
    let md = match fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(_) => return Ok(()),
    };
    let display = path.display().to_string();
    if is_reparse(&md) {
        clear_readonly(path);
        return fs::remove_file(path)
            .or_else(|_| fs::remove_dir(path))
            .map_err(|e| format!("删除链接失败 {display}: {}", io_err(e)));
    }
    let is_dir = md.is_dir();
    let mut last = String::new();
    for attempt in 0..3 {
        clear_readonly(path);
        let r = if is_dir {
            if recursive {
                fs::remove_dir_all(path)
            } else {
                fs::remove_dir(path)
            }
        } else {
            fs::remove_file(path)
        };
        match r {
            Ok(()) => return Ok(()),
            Err(e) => {
                last = io_err(e);
                if attempt < 2 {
                    std::thread::sleep(std::time::Duration::from_millis(120));
                }
            }
        }
    }
    Err(format!("删除失败 {display}: {last}"))
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
    remove_path_robust(Path::new(&path), recursive)
}

/// 受限删除：只删 `<parent>\<name>`，且 `name` 必须是**单个路径段**。
/// 删除作品 / 清空回收站都走这里 —— 目标由"父目录 + 一个名字"拼出，
/// 路径穿越、ADS（`name:stream`）、保留设备名在结构上就不成立（KL-DF-10 的结构面）。
#[tauri::command]
pub fn fs_remove_child(parent: String, name: String, recursive: bool) -> Result<(), String> {
    valid_child_name(&name)?;
    let p = Path::new(&parent).join(&name);
    remove_path_robust(&p, recursive)
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
    // symlink_metadata：看链接本身而不是目标 —— metadata 会跟随 junction，
    // 那样删除流程就看不到"这是个链接"，安全门形同虚设。
    match fs::symlink_metadata(&path) {
        Ok(md) => Ok(Some(StatInfo {
            is_dir: md.is_dir(),
            size: if md.is_dir() { 0 } else { md.len() },
            mtime_ms: mtime_ms(&md),
            is_link: is_reparse(&md),
        })),
        Err(_) => Ok(None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_normal_names_and_recycle_ids() {
        for ok in ["星海拾梦", "book", "第1章.md", "a b", "20260704170528_1783155928889255"] {
            assert!(valid_child_name(ok).is_ok(), "应接受：{ok}");
        }
    }

    #[test]
    fn rejects_traversal_and_separators() {
        for bad in ["", ".", "..", "a\\b", "a/b", "..\\..", "./x"] {
            assert!(valid_child_name(bad).is_err(), "应拒绝：{bad:?}");
        }
    }

    #[test]
    fn rejects_ads_and_wildcards() {
        // 冒号 = NTFS 备用数据流；通配符会在旧 API 下被展开
        for bad in ["book:secret", "a*b", "a?b", "a\"b", "a<b", "a>b", "a|b"] {
            assert!(valid_child_name(bad).is_err(), "应拒绝：{bad:?}");
        }
    }

    #[test]
    fn rejects_reserved_device_names_with_extension() {
        for bad in ["CON", "con", "NUL", "NUL.txt", "com1", "LPT9.md", "aux"] {
            assert!(valid_child_name(bad).is_err(), "应拒绝：{bad:?}");
        }
        // 不是保留名的不许误伤
        for ok in ["COM0", "LPT0", "COM10", "console", "auxiliary", "nulll"] {
            assert!(valid_child_name(ok).is_ok(), "应接受：{ok}");
        }
    }

    #[test]
    fn rejects_control_chars_and_trailing_dots() {
        for bad in ["a\u{1}b", "book.", "book ", "a\nb"] {
            assert!(valid_child_name(bad).is_err(), "应拒绝：{bad:?}");
        }
    }

    #[test]
    fn robust_remove_is_idempotent_and_clears_readonly() {
        let base = std::env::temp_dir().join(format!("deepcompose-fs-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let deep = base.join("书").join("章节内容");
        fs::create_dir_all(&deep).unwrap();
        let f = deep.join("第1章.md");
        fs::write(&f, "正文").unwrap();
        // 只读文件在 Windows 上会挡住 remove_dir_all —— clear_readonly 必须先把它解开
        let mut perm = fs::metadata(&f).unwrap().permissions();
        perm.set_readonly(true);
        fs::set_permissions(&f, perm).unwrap();

        remove_path_robust(&base.join("书"), true).unwrap();
        assert!(!base.join("书").exists());
        // 幂等：再删一次仍然 Ok
        remove_path_robust(&base.join("书"), true).unwrap();
        let _ = fs::remove_dir_all(&base);
    }
}
