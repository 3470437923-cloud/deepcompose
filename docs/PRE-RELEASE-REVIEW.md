# DeepCompose 开源前审查

审查对象是当前本地工作树，包含此前未提交的 Windows/macOS 适配，不只旧 HEAD。当前版本 1.1.0，GPL-3.0-only。GitHub 只创建空公共仓库并配置 origin，没有推送、tag、Release 或附件上传。

## 已复现并处理的问题

| 级别 | 问题与触发 | 本轮处理 | 回归证据 |
|---|---|---|---|
| P1 | 保存 IPC 等待中继续输入，旧写入完成后把新稿清为已保存 | 只确认实际写入版本；新输入继续保持 dirty，阻止关窗、关标签、切书和采用继续消费旧版 | editorPersistence/workbenchPersistence 测试，包含真实工作台闭包执行 |
| P1 | 切作品忽略自动保存 false，直接清空标签 | 两个切书入口检查失败与等待后的实时脏稿，失败保留当前作品 | 工作台闭包回归 |
| P1 | AI 更新磁盘后，旧标签继续保存会覆盖新版且快照漏掉新版 | 保存前读取实际磁盘并留快照；版本冲突明确报错，保留编辑稿；快照后再次核对磁盘 | helper 与工作台接线回归 |
| P2 | 回流网络/中止/会话落盘失败仍登记完成 | 检查 sendChat 结果与中止状态，失败保留 pending | helper/工作台回归 |
| P1 | AI 路径词法在根内，但祖先 symlink/junction 指向根外 | 授权后逐级检查根以下路径，拒绝链接访问（包括新建目标祖先） | 临时目录测试：修前 3 项文件安全回归均失败，修后通过 |
| P1 | 删除非空目录只留下空壳快照，子文件不可恢复 | AI 禁止删除非空目录；空目录使用非递归删除，防检查后新增文件被递归清除 | releaseSafety 与原 exec 回归 |
| P1 | 复制到既有目录合并覆盖旧子文件，快照不含旧内容 | 拒绝目录合并覆盖；目录复制使用新目标；工具说明同步 | releaseSafety 与 exec 回归 |
| P1 | Anthropic x-api-key 可随跨源 3xx 跳转泄漏，307/308 还会重放稿件 | 三条 AI 客户端统一禁用自动重定向，保留原始 HTTP 错误 | localhost 两端口复现泄漏，修后 5 种状态 × 4 路径均不访问目标 |
| P2 | 错误响应不结束时无法停止生成，SSE 无换行可撑大内存 | 错误体 64 KiB/JSON 4 MiB/SSE 单行 8 MiB 限额；错误体监听中止并单独设 15 秒期限，正常 SSE 不设总时限 | localhost 有限 chunk 不发 EOF、显式中止、实际 models/balance 入口及 UTF-8/CRLF/边界兼容回归 |
| P2 | 直接截断写可能毁掉原稿或整份快照 JSON | 同目录安全临时文件写完并 sync 后原子替换；保留原权限，拒绝只读文件和末级链接；Unix 同步父目录 | 注入部分写入后错误，旧文件与目录条目保持不变；覆盖成功/只读拒绝回归 |
| P1/Linux | POSIX 统一转小写导致越权及异大小写作品会话串用/误删 | Windows 保持大小写不敏感，POSIX 保留大小写；统一会话/回收站比较；授权保留前导 / | Linux 专属 7 例 + dirs/pathGuard/session/recycle 回归 |
| P2/Linux | Linux fallback 使用 macOS Library，链接调用 macOS open，构建目标按 Chromium | 改 Linux .local/share 与 xdg-open，非 Windows 使用 WebKit 保守构建目标 | Linux 分支测试、类型检查、前端构建；未替代 Linux 原生验证 |
| 依赖 | npm 审计 source-map-js 旧版存在 1 项 high 公告 | 仅升级至补丁版 1.2.2 | npm audit：0 项已知公告 |

## 关键边界

- 路径检查能阻止已存在的祖先链接穿透；检查与实际文件 I/O 之间仍有 TOCTOU 窗口，不承诺抵御恶意本机进程并发替换目录。授权根本身可以是用户明确选择的链接目录。
- 编辑器版本检查不是操作系统原子 compare-and-swap，最后核对与写入之间仍有极短并发窗口。出现冲突时不自动合并、不覆盖作者稿；可先复制编辑内容，再对照外部磁盘新版处理。
- 原子替换防止暂存写入失败破坏旧文件；替换提交后若父目录 sync 失败，会报告错误但磁盘已是新版，不能声称所有错误都保证原件未变。不保证所有文件系统、网络盘和设备掉电行为完全相同。Windows 替换语义需在原生系统复核。
- API Key 当前为本地明文偏好数据，是现有设计边界，已在 SECURITY.md 说明。本轮未读取真实配置或调用付费模型。
- Rust 接受绝对路径是公开分层契约，不能仅据此判为漏洞。远程网页 capability 没有配置文件/AI IPC 权限；本轮没有验证出参考网页绕过 IPC 的证据。

## 验证范围

最终集成实测：`npm test`、`npm run test:macos-sim`、`npm run test:linux-sim` 各 52 文件，710 通过、4 个平台专有跳过（714 总数）；`npm run build`（含 tsc）exit 0；macOS 宿主 `cargo test --lib` 33 通过、0 失败；`cargo check` exit 0；`npm audit --json` exit 0，0 个已知公告。新增用例曾先失败后修复，并对旧关闭逻辑做了反向改回验证。没有执行 RustSec 全依赖漏洞数据库审计。

四项平台跳过为原有 Windows 专有行为，未为本轮修复新增跳过。Vite 保留原有 prefs 静态/动态混用的打包提示，不影响构建。完整差异空白检查还命中一处既有历史审计文档尾空格，未为此批量改写旧文件；本轮文件按既有 CRLF 口径检查。

Tauri 环境信息确认 Xcode Command Line Tools 已安装、完整 Xcode 未安装；本轮未重建 macOS .app/.dmg，不把配置解析或 cargo check 当作签名/安装验证。

Linux 尚无可用运行时：本机为 Darwin arm64，未发现 Docker、Podman 或常用 Linux VM 命令。原生 Linux Rust 编译、deb 生成安装及 X11/Wayland/WebKitGTK 桌面验收未执行，不能标为 Linux 正式支持。Windows 本轮修复后的重建和真机验收也未执行。

## 发布前还需确认

1. Linux 原生验收完成后才能对外宣称正式支持；也可首次先发布 Windows/macOS，并将 Linux 标为实验性移植。
2. 对最终源码提交重新构建 Windows/macOS 发行包，验证保存/采用/回收站/中断及窗口生命周期。当前旧包不包含本轮修复。
3. 许可正文已收集 473 组件（5 npm、466 Cargo、2 字体），`collect-notices.py --check` 与 `--self-test` 均通过；Tauri 包配置和 Windows 便携脚本携带许可文件，encoding_rs/WHATWG 声明已修正。此项只完成材料与来源核对：objc2 官方原文保留 Apple SDK 派生分发的授权疑问，MPL 等组件仍须满足对应源码可获得性等义务，素材来源及最终发行物需人工核对。详见 LICENSE-SOURCES.md，不宣称法律合规审计已完成。
4. 首次公开必须审核导出文件清单；旧历史已跟踪 exe，.gitignore 不清理历史。本轮没有扫描所有历史提交，也没有改写历史。源码工作树常见 Key/私钥扫描命中预览占位符，不构成完整秘密审计。

结论：已定位并修复多项会影响文稿与凭据的实际问题；源码上传、正式二进制发布和 Linux 支持声明应分别验收，不能用宿主单测通过替代三平台发行验收。
