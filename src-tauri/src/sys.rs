//! 系统目录与配置存储。
//!
//! 目录口径（**磁盘契约名一个字不改，只换基目录**）：
//!   Windows 配置：%APPDATA%\com.writerd\writerD\shared_preferences.json
//!   macOS   配置：~/Library/Application Support/com.writerd/writerD/shared_preferences.json
//!   Linux   配置：$XDG_DATA_HOME/com.writerd/writerD/shared_preferences.json（缺省 ~/.local/share）
//!   Windows 作品根默认：%USERPROFILE%\AI写小说
//!   macOS   作品根默认：~/AI写小说
//!
//! `com.writerd` / `writerD` / `shared_preferences.json` 是**磁盘冻结名**，
//! 各平台逐字相同 —— 它们已在用户机器上落盘，改名即失联。
//!
//! Windows 口径刻意**逐字保持不变**（USERPROFILE / APPDATA / home\Documents），
//! 只给非 Windows 分支接入系统 API。理由见各函数注释。

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SysDirs {
    pub home: String,
    pub documents: String,
    /// Windows: %APPDATA%；macOS: ~/Library/Application Support
    pub app_data: String,
    /// 配置目录（已建好）
    pub prefs_dir: String,
    pub prefs_file: String,
}

/// 用户主目录。
///
/// Windows：`USERPROFILE` 优先（既有口径，逐字不变），缺失时退回 `current_exe()`
/// 所在目录（受损环境的兜底，见 N-52）。
///
/// 非 Windows：`HOME` / tauri 的 `home_dir()`（= `$HOME`）。
/// **绝不**回退到 `current_exe().parent()` —— macOS 上那是
/// `/Applications/DeepCompose.app/Contents/MacOS/`，即**应用包内部**：
/// 配置与作品根会落进已签名的 bundle，既可能因只读而直接报错，
/// 又会在可写时破坏代码签名（下次启动 Gatekeeper 报「已损坏」）。
fn home_dir(app: &AppHandle) -> PathBuf {
    #[cfg(windows)]
    {
        if let Some(p) = std::env::var_os("USERPROFILE").map(PathBuf::from) {
            if !p.as_os_str().is_empty() {
                return p;
            }
        }
    }
    #[cfg(not(windows))]
    {
        if let Some(p) = std::env::var_os("HOME").map(PathBuf::from) {
            if !p.as_os_str().is_empty() {
                return p;
            }
        }
    }
    if let Ok(p) = app.path().home_dir() {
        return p;
    }
    #[cfg(windows)]
    {
        // USERPROFILE 缺失（极少见的受损环境）：退回可执行文件所在目录，
        // 而不是 "." —— CWD 取决于启动方式，配置/作品根落到不可预期的位置
        if let Some(p) = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|x| x.to_path_buf()))
        {
            return p;
        }
    }
    // 非 Windows 的最终兜底用 "." 而不是 exe 目录：exe 在 .app 包内，写不得
    PathBuf::from(".")
}

/// 应用数据（漫游配置）基目录。
///
/// Windows：`%APPDATA%`（既有口径，逐字不变）。tauri 的 `data_dir()` 在 Windows 上
/// 就是 `{FOLDERID_RoamingAppData}`，与 `APPDATA` 同值，只作为缺失时的兜底。
///
/// 非 Windows：tauri 的 `data_dir()` → macOS 的 `~/Library/Application Support`。
/// **绝不** `home_dir().join("AppData\\Roaming")` —— macOS 上 `\` 是**合法文件名字符**，
/// 那会建出一个名叫 `AppData\Roaming` 的**单层目录**。
fn appdata_dir(app: &AppHandle) -> PathBuf {
    #[cfg(windows)]
    {
        if let Some(p) = std::env::var_os("APPDATA").map(PathBuf::from) {
            if !p.as_os_str().is_empty() {
                return p;
            }
        }
    }
    if let Ok(p) = app.path().data_dir() {
        return p;
    }
    #[cfg(target_os = "macos")]
    let fallback = home_dir(app).join("Library").join("Application Support");
    #[cfg(not(any(windows, target_os = "macos")))]
    let fallback = home_dir(app).join(".local").join("share");
    #[cfg(windows)]
    let fallback = home_dir(app).join("AppData").join("Roaming");
    fallback
}

/// 文档目录（`writerd_sessions` / `writerd_snapshots` / `writerd_memos.json` /
/// `skills` / `writerd_quick_prompts.json` 的父目录）。
///
/// Windows：保持既有口径 `home\Documents`（逐字不变）。**刻意不换成
/// `document_dir()`** —— 它在 Windows 上走 `{FOLDERID_Documents}`，
/// 而 Documents 被 OneDrive 等重定向的机器上那是另一个位置；
/// 换过去会让既有 `writerd_sessions` 等目录集体"消失"（数据还在，只是找不到）。
///
/// 非 Windows：走系统口径（`$HOME/Documents`，尊重系统/ iCloud 重定向），
/// 不再硬拼字符串。
fn documents_dir(app: &AppHandle) -> PathBuf {
    #[cfg(windows)]
    let p = home_dir(app).join("Documents");
    #[cfg(not(windows))]
    let p = app
        .path()
        .document_dir()
        .unwrap_or_else(|_| home_dir(app).join("Documents"));
    p
}

/// 配置目录的**冻结段**（磁盘契约）：这两个目录名已在用户机器上落盘，逐字不可改。
/// 提到常量是为了让「改名」这件事在测试里立刻可见（见本文件 tests）。
pub const PREFS_DIR_SEGMENTS: [&str; 2] = ["com.writerd", "writerD"];
/// 配置文件名（磁盘契约，逐字不可改）
pub const PREFS_FILE_NAME: &str = "shared_preferences.json";

/// 配置单文件的绝对路径。
/// **只换基目录**：`com.writerd` / `writerD` / `shared_preferences.json` 逐字不动。
pub fn prefs_path(app: &AppHandle) -> PathBuf {
    let mut p = appdata_dir(app);
    for seg in PREFS_DIR_SEGMENTS {
        p = p.join(seg);
    }
    p.join(PREFS_FILE_NAME)
}

#[tauri::command]
pub fn app_dirs(app: AppHandle) -> Result<SysDirs, String> {
    let prefs_file = prefs_path(&app);
    let prefs_dir = prefs_file.parent().map(PathBuf::from).unwrap_or_default();
    fs::create_dir_all(&prefs_dir).map_err(|e| format!("建配置目录失败: {e}"))?;
    Ok(SysDirs {
        home: home_dir(&app).to_string_lossy().to_string(),
        documents: documents_dir(&app).to_string_lossy().to_string(),
        app_data: appdata_dir(&app).to_string_lossy().to_string(),
        prefs_dir: prefs_dir.to_string_lossy().to_string(),
        prefs_file: prefs_file.to_string_lossy().to_string(),
    })
}

/// 读取配置原文；**仅"文件不存在"**返回空对象。
/// 其它读取错误（占用/权限/磁盘）必须报错上抛：吞成 "{}" 会让前端按默认值启动，
/// 随后 prefs_save 把真实配置覆盖掉 —— 读失败与"还没有配置"是两件事。
/// UTF-8 BOM 在此剥离（外部编辑器/PowerShell 5.1 可能写入 BOM）。
#[tauri::command]
pub fn prefs_load(app: AppHandle) -> Result<String, String> {
    let p = prefs_path(&app);
    match fs::read_to_string(&p) {
        Ok(s) => Ok(s.trim_start_matches('\u{feff}').to_string()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok("{}".to_string()),
        Err(e) => Err(format!("配置读取失败 {}: {}", p.display(), e)),
    }
}

#[tauri::command]
pub fn prefs_save(app: AppHandle, json: String) -> Result<(), String> {
    let p = prefs_path(&app);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("建配置目录失败: {e}"))?;
    }
    fs::write(&p, json).map_err(|e| format!("写配置失败: {e}"))
}

/// 用系统文件管理器打开指定目录（设置页「打开目录」用）。
///
/// 为什么不用 opener 插件的 open_path：它的授权 scope 是**静态白名单**，
/// 而作品根可由用户改到任意盘符路径，静态白名单覆盖不了；这里改为
/// 运行时校验"确实是目录"后直接拉起系统文件管理器，行为可控且无需配置 scope。
///
/// 平台：Windows `explorer <path>`；macOS `open <path>`；其它 unix `xdg-open`。
/// （macOS 上没有 `explorer` 命令，照旧写法会让「打开目录」**永久失败**。）
#[tauri::command]
pub fn open_dir(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.is_dir() {
        return Err(format!("目录不存在：{path}"));
    }
    #[cfg(windows)]
    let prog = "explorer";
    #[cfg(target_os = "macos")]
    let prog = "open";
    #[cfg(all(unix, not(target_os = "macos")))]
    let prog = "xdg-open";
    std::process::Command::new(prog)
        .arg(&p)
        .spawn()
        .map_err(|e| format!("打开目录失败: {e}"))?;
    Ok(())
}

/// 用系统默认浏览器打开一个 https 链接（关于页/首启弹窗的作者主页入口）。
///
/// 不加 opener 插件（多一个依赖多一份攻击面）；走系统默认浏览器。
/// 只放行 https、不含空白与引号的 URL —— 参数以数组形式直传，不经 shell 拼接。
/// 平台：Windows `cmd /C start "" <url>`；macOS `open <url>`；Linux `xdg-open <url>`。
/// （macOS 上没有 `cmd`，照旧写法会让这个入口**永久失败**。）
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    let u = url.trim();
    if !u.starts_with("https://") || u.len() > 300 || u.chars().any(|c| c.is_whitespace() || c == '"') {
        return Err("只允许打开 https 链接".to_string());
    }
    #[cfg(windows)]
    let mut cmd = {
        let mut c = std::process::Command::new("cmd");
        c.args(["/C", "start", "", u]);
        c
    };
    #[cfg(not(windows))]
    let mut cmd = {
        let mut c = std::process::Command::new(if cfg!(target_os = "macos") { "open" } else { "xdg-open" });
        c.arg(u);
        c
    };
    cmd.spawn().map_err(|e| format!("拉起浏览器失败: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 磁盘冻结名清单：这些名字跨平台逐字相同，任何重构都不许改。
    /// 用字符串常量断言（不依赖 AppHandle），改名即测试失败。
    #[test]
    fn frozen_names_are_literal() {
        assert_eq!(PREFS_DIR_SEGMENTS, ["com.writerd", "writerD"]);
        assert_eq!(PREFS_FILE_NAME, "shared_preferences.json");
        // 逐字拼出来就是磁盘上的既有形态（Windows `\`、macOS `/` 只差分隔符）
        let tail = ["com.writerd", "writerD", "shared_preferences.json"].join("/");
        assert_eq!(tail, "com.writerd/writerD/shared_preferences.json");
    }

    /// https 白名单校验：逻辑原样保留，改动 open_url 的平台分支不该动它。
    #[test]
    fn open_url_rejects_non_https() {
        assert!(open_url("http://example.com".into()).is_err());
        assert!(open_url("file:///etc/passwd".into()).is_err());
        assert!(open_url("https://exa mple.com".into()).is_err());
        assert!(open_url(format!("https://{}.example", "a".repeat(400)).into()).is_err());
    }
}
