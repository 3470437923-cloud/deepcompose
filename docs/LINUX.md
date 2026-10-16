# Linux 构建与验证

状态：已提供最小原生 Debian 包入口和 Linux 平台分支回归；**尚未完成 Linux 原生编译、安装或桌面真机验收**。本次开发宿主为 Apple Silicon macOS，宿主测试不能替代 Linux。

## 构建基线

建议先在 Ubuntu 22.04/24.04 或 Debian 12+ 的完整桌面环境验证，使用发行版可用的 WebKitGTK 4.1 开发包。当前入口接受本机 `x86_64-unknown-linux-gnu` 或 `aarch64-unknown-linux-gnu`，每种架构都需分别在 Linux 上构建和验收。构建基线只是建议，尚不能列为已支持发行版。glibc 产物通常应在拟支持的最老发行版构建，再向更新版本验证。

需 Node.js 22 LTS（22.12+）或 24 LTS（同时满足 Vite 7 与 Vitest 5）、npm、Rust stable/Cargo、C 编译工具链、pkg-config 和 dpkg-deb。在 Linux 上安装系统依赖（以下是待在目标机执行的命令，本次未执行）：

```bash
sudo apt-get update
sudo apt-get install -y build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev libssl-dev librsvg2-dev libayatana-appindicator3-dev patchelf dpkg-dev xdg-utils ca-certificates
npm ci
bash tools/package-linux.sh --preflight
npm run typecheck
npm test
cargo test --manifest-path src-tauri/Cargo.toml --lib
bash tools/package-linux.sh
```

脚本先检查 Linux 宿主、GNU Rust 目标、构建工具和 `gtk+-3.0` / `webkit2gtk-4.1` / `libsoup-3.0`，再执行 `tauri build --target <宿主目标> --bundles deb`。`beforeBuildCommand` 负责类型检查及前端构建；Tauri 自动合并 `src-tauri/tauri.linux.conf.json`，覆盖基础配置中的 Windows NSIS 目标。没有改安装器、注册桌面快捷方式或自动提权。

默认产物在 `src-tauri/target/<宿主目标>/release/bundle/deb/`；如设置 `CARGO_TARGET_DIR`，以脚本最终打印的目录为准。用 `dpkg-deb --info <实际包名>.deb` 检查架构和运行依赖，再在测试机执行 `sudo apt install ./<实际包名>.deb`。从应用菜单和终端分别启动，记录首次启动输出。打包成功不等于安装或界面通过。

本轮选择 deb 作为最小交付格式。没有承诺 AppImage、RPM、musl、跨架构交叉编译或免系统 WebKitGTK 运行时；如后续扩展这些格式，需要独立验证。不要通过给 macOS 的 Cargo 添加 Linux target 就宣称 Linux 构建成功：还需要 Linux 系统库、链接器及目标环境。

## 跨宿主检查

```bash
bash -n tools/package-linux.sh
bash tools/package-linux.sh --help
bash tools/package-linux.sh --check
node_modules/.bin/vitest run --config vitest.linux-sim.config.ts
```

`--check` 只运行类型检查和前端构建，允许 macOS/Windows 的 Bash 环境使用。正常打包及 `--preflight` 在非 Linux 返回退出码 2，避免把宿主产物误认为 Linux 产物。缺依赖或构建失败返回非零。

模拟配置在测试加载前将 `process.platform` 设为 `linux`。它只覆盖 TS 平台分支，真实文件系统仍是宿主，不能验证 ext4 大小写、权限、符号链接真实行为或 GTK。`tests/core/linux.test.ts` 还独立模拟 Linux Node/WebKitGTK UA、XDG 派生目录、大小写不同根的授权与会话隔离，并保留 Windows 大小写不敏感断言。

## 目录与路径契约

| 内容 | Linux 位置 |
| --- | --- |
| 默认作品根 | `$HOME/AI写小说` |
| 配置与窗口状态 | `$XDG_DATA_HOME/com.writerd/writerD/`，缺省 `$HOME/.local/share/com.writerd/writerD/` |
| 会话、快照、备忘录、技能、快捷提示词 | 系统文档目录下原有 `writerd_*` / `skills` 名；无系统文档目录时回退 `$HOME/Documents` |
| 子网页登录数据 | 配置目录下 `webview-sessions/deepseek` 与 `webview-sessions/zhuque` |

这里使用 Tauri `data_dir()`，对应 XDG **数据**目录，并非 `$XDG_CONFIG_HOME`；冻结的 `com.writerd/writerD/shared_preferences.json` 名称保持不变。系统目录 API 失败时，Linux 退回 `.local/share`，不再退回 macOS 的 `Library/Application Support`。系统文档目录来自 Tauri `document_dir()`，可指向本地化的「文档」目录。

POSIX 路径身份比较保留大小写：`Books` 与 `books` 是不同目录；Windows 继续不区分大小写。此规则同时用于相对项目路径、工具授权、会话过滤/删除与回收站安全门。授权归一化还保留 POSIX 前导 `/`，避免把绝对路径误认成相对授权根。目录树中的磁盘冻结名及文件名不得改写大小写。仍兼容旧会话中的反斜杠协议路径，故 POSIX 文件名应避免字面反斜杠；这类名字可能与协议分隔符歧义。

## WebKitGTK 与桌面验收

Linux 使用系统 WebKitGTK，不能用 macOS WKWebView 或 Windows WebView2 替代。前端构建目标调整为仅 Windows 使用 `chrome110`，其余使用保守 `safari16` 目标以生成 WebKit CSS 前缀；该目标不能证明每个 WebKitGTK 版本都兼容。

已核对本地锁定依赖的实现：Tauri 2.12.0 的桌面 `Window::add_child` 在 `unstable` 特性下提供；wry 0.57.0 的 WebKitGTK `WebContextImpl::new` 将 `data_directory` 用于 WebsiteDataManager 的数据、缓存和 cookies。`data_store_identifier` 在 Linux 不生效。应用已同时设置两者，因此本轮无需改动网页栏代码；登录隔离的实际效果仍待 Linux 真机确认。

原生桌面验收至少覆盖：

- 在 X11 和 Wayland 各记录会话类型、发行版、架构、WebKitGTK 版本；验证首启、显示、无白屏、关闭及重启窗口恢复、最大化、缩放和自绘标题栏拖动。
- 新建中文作品、导入旧作品、编辑与保存、候选采用、回收站移入/还原；在大小写敏感卷中建立 `Book` / `book`，确认会话及授权不串。
- 原生目录选择器及拖放、中文输入法、剪贴板、系统文档目录重定向；「打开目录」及作者 HTTPS 链接应由 `xdg-open` 启动默认应用。
- DeepSeek/朱雀子网页打开、几何更新、隐藏、关闭、重开、登录持久化及两个站点隔离；弹窗和第三方登录可能受 WebKitGTK 站点兼容性影响。
- 真实 API 小流量请求、流式响应、中断和错误处理；测试密钥只使用运行时配置，不写入报告。

## 本次命令与结果

以下为本次 macOS 宿主实际执行记录；读取源码、技能与文本检索不计为编译验证。未安装虚拟机或容器工具，未访问远程仓库，未提交或推送。

| 命令/检查 | 结果及边界 |
| --- | --- |
| `pwd` | exit 0，工作区 `/Users/Admin/dsh` |
| `uname -a` | exit 0，Darwin arm64 |
| `command -v` 探测 docker/podman/colima/limactl/orb/multipass/qemu-system-x86_64/qemu-system-aarch64 | 均未找到；探测循环 exit 0（单项缺失由 `|| true` 收集），无可用 Linux 运行时 |
| `rustup target list --installed` | exit 0，仅 `aarch64-apple-darwin` |
| `bash -n tools/package-linux.sh`、`--help` | exit 0 |
| `bash tools/package-linux.sh --preflight` | exit 2，按预期拒绝 Darwin；未执行 Linux 依赖检查或编译 |
| `bash tools/package-linux.sh --check` | exit 0，tsc 与 Vite 构建完成；有既有 prefs 静态/动态导入同包提示 |
| 初次 `vitest run tests/core/linux.test.ts` | exit 1，4 例中 2 例失败，复现大小写与前导斜杠问题 |
| 修复目录与授权后针对 dirs/pathGuard/Linux 三文件运行 | exit 0，28 通过、3 Windows 专有跳过 |
| 新增会话/回收站用例后 `vitest run tests/core/linux.test.ts` | exit 1，7 例中 2 例失败，复现异大小写作品串会话与回收站根误认 |
| 修复后针对 Linux/session/recycle 三文件运行 | Linux 7 例通过；既有测试 3 例因强制 Windows 大小写语义失败，随后改为平台对应期望 |
| `vitest run --config vitest.linux-sim.config.ts`（第一次，尚未新增其它代理测试时） | exit 0，49 文件，679 通过、4 跳过；当时 Linux 专属 4 例 |
| 并行修复期间的全量 Linux 模拟与宿主 vitest | 曾 exit 1，失败来自当时尚在红测阶段的编辑器持久化测试；不作为最终结果 |
| 集成后 `npm run test:linux-sim` / `npm run test:macos-sim` | 均 exit 0，52 文件，710 通过、4 个平台专有跳过，共 714 例；仍只验证 TS 分支 |
| `tsc --noEmit`（最终核心修复后） | exit 0 |
| `cargo test --lib`（src-tauri，macOS） | exit 0，25 通过；只证明宿主 Rust 回归，不覆盖 Linux cfg 编译 |
| 全仓及独占文件 `git diff --check` | exit 2，现有 CRLF 行尾被默认 whitespace 规则报为 trailing whitespace；不在本轮批量改行尾 |
| `git -c core.whitespace=cr-at-eol diff --check -- <独占文件>` | exit 0，承认现有 CRLF 行尾后无补丁空白错误 |
| 最终 Linux/dirs/pathGuard/session/recycle 五文件回归 | exit 0，67 通过、3 Windows 专有跳过，共 70 例 |

Linux 原生依赖探测、Rust 编译、deb 生成和安装、X11/Wayland、WebKitGTK 子网页等均未执行。父代理应在所有并行变更完成后重新运行全量闸门，再在 Linux 机补齐上述原生证据，才能改变本文件的验证状态。
