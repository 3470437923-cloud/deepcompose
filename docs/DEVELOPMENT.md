# DeepCompose 开发与验收手册

本文件是构建、验证、排障的操作手册。改动代码前请先读 `README.md` 的「改代码前必读」与根目录 `AGENTS.md`。

---

## 1. 闸门（每次声称完成前必跑）

```powershell
cd S:\DeepCompose
.\node_modules\.bin\tsc.cmd --noEmit        # 期望 exit 0
.\node_modules\.bin\vitest.cmd run          # 期望全部通过
```

Rust 侧单测：

```powershell
cd S:\DeepCompose\src-tauri
cargo test --lib                            # 期望全绿
```

> ⚠️ **不要用 `cargo test --release --lib`**：release profile 带 `lto=true + codegen-units=1`，
> 在测试目标下会把 rustc 压爆（`STATUS_STACK_BUFFER_OVERRUN (0xc0000409)`，报
> `could not compile tokio`）。正式产物仍用 `cargo build --release`，那条路径是正常的。

> ⚠️ **项目目录改过名（writerD → KeepCompose → DeepCompose）时必须先删 `src-tauri\target`**：
> cargo 指纹里存着旧绝对路径，会报 `failed to read plugin permissions … os error 3`（错误信息里指向旧目录）。
> 删 target 冷编译即可恢复（release 冷编译实测约 3 分 37 秒）。改名本身若报
> `Access to the path … is denied`，先清掉上一次截屏留下的旧 exe 进程与残留运行器。

## 2. 打包

```powershell
npm.cmd run package
```

`tools/package.ps1` 的动作顺序：杀掉运行中的 `deepcompose` 进程（否则 cargo 无法替换 exe，
`failed to remove deepcompose.exe`，os error 5）→ `vite build` → `cargo build --release` →
复制 exe 到 `release\DeepCompose.exe` → 删除旧 `writerD.lnk` 与 `KeepCompose.lnk` → 刷新桌面快捷方式 `DeepCompose.lnk`。
脚本根目录从自身位置推导（不硬编码盘符路径）。cargo 缓存热时约 2 分钟；**删掉 `target` 后的 release 冷编译实测 3 分 37 秒**（改动项目目录名之后必须走这条路）。

> 目录与产物名以 `S:\DeepCompose` / `DeepCompose.exe` 为准（第二代更名 writerD → KeepCompose → DeepCompose 已完成）。

## 3. 桌面端验收（真实 exe，会话锁定屏幕时也能做）

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\capture.ps1
```

`capture.ps1` 默认截 `src-tauri\target\release\deepcompose.exe`（cargo 直出产物，可用 `-Exe` 覆盖；
`probe_win_style.ps1` / `probe_window.ps1` 默认截打包产物 `release\DeepCompose.exe`）：按 pid 挑最大的可见窗口
（避开 WebView2 辅助窗口）、必要时 `ShowWindow(SW_RESTORE)`、发一次 `ESC` 固定回主界面再截图
（否则齿轮被误点就会截到设置屏），输出到 `shots\`。

- 启动即最小化（截到 `160×28 @ (-32000,-32000)`）是已知现象，脚本已处理。
- `PrintWindow` 对未聚焦的 WebView2 会返回白图：截屏前必须 `SetForegroundWindow` 并等 0.5–1 秒。
- 运行中的 `deepcompose` 会占用 exe，重新打包前先关掉。

## 4. 浏览器预览沙箱（三主题取证，免 Playwright）

`preview.html` + `src/preview/`（内存文件系统替身劫持 `__TAURI_INTERNALS__`）让界面脱离 Tauri
直接在浏览器里跑，`?theme=dark|light|dsblue` 切主题、`?fail=prefs` 注入启动故障。dev-only，不进构建产物。

```powershell
.\node_modules\.bin\vite.cmd --port 5183 --strictPort      # 后台常驻
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" `
  --headless=new --remote-debugging-port=9223 --remote-allow-origins=* `
  --user-data-dir="$env:TEMP\deepcompose-edge" --window-size=1600,1000 `
  --enable-unsafe-swiftshader about:blank                  # 后台常驻
python tools\preview_shot.py                               # 三主题 × 三尺寸截图 + 几何断言
python tools\preview_shot.py --view settings
python tools\preview_diag.py --click ".wbtn"               # 抓页面异常原文
```

预览走 CDP + `websocket-client`，不依赖 Playwright。替身对未实现的命令会
`console.warn("[preview] 未实现命令…")` 留痕——跑 `preview_diag.py` 就能看出还缺什么。

## 5. 端到端对话验证

```powershell
python tools\mock_provider.py 8899                          # 另开一个窗口常驻
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\e2e_chat.ps1
```

`e2e_chat.ps1` 会把配置**覆写为本地 mock**，跑完记得恢复真实配置；
`e2e_live.ps1` 不覆写配置，用现有配置直连真实端点。

已知工具缺陷（非产品缺陷）：`SendKeys` 会吞字；**中文输入法会把整串按键截成未提交组合串**
——`e2e_chat.ps1` 已改为 `clip.exe` 粘贴 + 点击发送按钮；截屏前缺 `SetForegroundWindow` 会拿到白图。

## 6. 本机环境坑（都是实际踩过的）

| 坑 | 现象 | 规避 |
|---|---|---|
| 没有 `pwsh` | `pwsh : 无法识别` | 只有 Windows PowerShell 5.1；`.ps1` 走 `-NoProfile -ExecutionPolicy Bypass -File` |
| 执行策略拦脚本 | `npm` / `npm.ps1` 被拦 | 用 `npm.cmd` |
| PowerShell 写文件带 BOM | `JSON.parse` 失败 → 整份配置被静默忽略 | 产品侧 `parsePrefs` 已剥 BOM；脚本用 `[System.IO.File]::WriteAllText(..., UTF8Encoding($false))` |
| **PowerShell 写中文源码会毁文件** | GBK 双字节吃掉紧随的 ASCII 字符，脚本直接语法错误 | **绝不用 PowerShell 改源码**，一律用文件工具；`.ps1` 保持 ASCII |
| **vite dev server 开着时改项目内文件 → vite 致命退出** | `EBUSY: resource busy or locked` | **改文件前先停 dev server** |
| PS 传参给原生程序吞双引号 | `python x.py --eval '{"a":"b"}'` 报 `unrecognized arguments` | 传给 python/node 的表达式改用单引号 |
| 读运行时配置乱码且回显密钥 | PS 无 `-Encoding` 读 UTF-8 → 乱码 + 把整份配置（含 key）回显到 stderr | 一律 `python -c`（`json.load(open(p, encoding='utf-8'))`）或 `Get-Content -Encoding utf8` |
| React 19 + 新 JSX transform | `JSX.Element` 报 `Cannot find namespace 'JSX'` | 用 `ReactElement`（`import type { ReactElement } from "react"`） |
| Windows 窗口几何 | `set_size` 是**客户区**口径；窗口创建后第一次 `set_size` 会多一个标题栏高度 | 位置存外框、尺寸存 `inner_size()`；读回不一致就用同一个值重试（最多 3 次）；**反向按差额补偿是错的** |
| **系统提交内存耗尽** | vitest/vite/cargo 起不来：`VirtualAlloc failed` / `Out of memory`，而物理内存还有空闲 | 看 `Win32_OperatingSystem.FreeVirtualMemory`（提交余量，<500MB 必炸）；关掉吃提交的大户再跑闸门 |
| **项目目录改名后 cargo 崩** | `failed to read plugin permissions: failed to read file '\\?\S:\<旧目录名>\src-tauri\target\...' (os error 3)` | 指纹里存着旧绝对路径；**删掉 `src-tauri\target` 冷编译**（release 实测 3 分 37 秒） |

## 7. 数据与配置位置

| 内容 | 路径 |
|---|---|
| 作品根（默认） | `%USERPROFILE%\AI写小说\`（设置「数据」页可改，prefs `custom_novels_dir`） |
| 会话 / 快照 / 备忘录 / 技能 | `%USERPROFILE%\Documents\{writerd_sessions, writerd_snapshots, writerd_memos.json, skills}` |
| 配置 | `%APPDATA%\com.writerd\writerD\shared_preferences.json` |
| 窗口几何 | `%APPDATA%\com.writerd\writerD\window_state.json` |
| 运行时统计（新增） | `%APPDATA%\com.writerd\writerD\usage_stats.json`（token 按日分桶与余额快照，可随时删除） |

以上名字是**磁盘契约**（见 README 契约表），产品更名不改它们。

## 8. 批次工作方式

1. 动代码前先想清楚：**这批的验收命令是什么**。
2. 改完跑闸门（`tsc` + `vitest`，必要时 Rust 单测），必须全绿。
3. 原子提交，提交信息写清**做了什么 + 验证结果**。
4. 每批只做一件事；跨多文件的重构拆成可独立验收的小批。
5. 修掉某条已知边界时，同步更新 `docs/KNOWN-LIMITS.md` 的「处置」列并留下回归锁（销项规则见该文件 §6）；
   改动涉及用户拍板的裁决时，先在 `docs/DECISIONS.md` 追加条目再动代码。
