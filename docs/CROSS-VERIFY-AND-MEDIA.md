# 交叉验证、截图与宣传视频交接

## 项目与产物

项目绝对路径：`/Users/Admin/dsh/DeepCompose`。请先阅读 AGENTS.md、docs/PRE-RELEASE-REVIEW.md 和 docs/LICENSE-SOURCES.md。用户授权本地交叉验证、截图和宣传视频，禁止上传 GitHub 或发布。

本轮 macOS Apple Silicon 产物收集位置：

- `/Users/Admin/dsh/DeepCompose/release/DeepCompose.app`
- `/Users/Admin/dsh/DeepCompose/release/DeepCompose_1.1.0_aarch64.dmg`

本轮实际构建完成时间：2026-10-16 22:08（本机时间）。DMG 9.39 MiB，arm64；hdiutil verify 已通过，应用内三份许可已核实。当前仅 ad-hoc 签名，无 Developer ID/Apple 公证。使用前核对构建时间和 release/SHA256SUMS-macos.txt。Windows `/Users/Admin/dsh/DeepCompose/release/DeepCompose.exe` 是 10 月 13 日旧包，不包含本轮修复，不用于验证本轮改动。Linux 尚未生成发行包，原生编译/桌面验收未完成。

## 交叉验证

使用虚构作品和占位凭据；不删除或覆盖用户作品、会话、配置，不在日志和截图中暴露 API Key。当前工作树大量历史改动尚未提交，不要 reset/clean 或替换成旧 HEAD。

1. 从上面的 .app 启动，确认关于页的版本和构建信息，避免误开 /Applications 或旧 Dock 项。
2. 检查欢迎窗、关于页与帮助页脚：作者 Liumorrow；QQ 群 1071188925；群号可复制；抖音链接正确。不再显示仅在用户勾选后持久化。若本机已关闭欢迎窗，不擅改用户偏好；用独立测试账户或先说明受限。
3. 检查欢迎文案说明本地保存与 AI 请求外发材料，不宣称 Key 和作品永不离开本机。
4. 虚构作品测试保存中继续编辑、保存失败切书、AI 改盘后旧标签保存冲突、采用前保存、回流失败和中断。失败时应保留稿件或 pending。
5. 检查目录链接访问拒绝、非空目录删除拒绝、目录合并复制拒绝；用专用临时目录，不碰真实作品。
6. 检查明暗主题、表格编辑、窗口缩放/关闭重开、网页参考栏与键盘焦点。
7. 对源码独立运行 npm test、npm run build、cargo test --manifest-path src-tauri/Cargo.toml --lib；不要 cargo test --release。最近基线前端 710 pass/4平台skip，Rust34 pass。
8. 核对 .app/Contents/Resources/licenses 三份许可均存在；用 hdiutil verify 验证 DMG。未用 Developer ID 签名或 Apple 公证，不要写已公证。

报告需区分静态审查、模拟测试和原生窗口实际结果，附复现步骤、系统/架构与截图。

## 截图建议

使用明确标记为演示的虚构小说，素材优先来自实际桌面应用。至少留 5 张：欢迎窗（作者/群号）、完整工作台、正文与 AI 协作、资料表格、设置关于页。工作台分别取明暗主题。画面中无真实 Key、真实私稿、账号、余额或不相关桌面通知。成图建议 PNG，宽度至少1920，文字保持清晰；输出 `release/media/screenshots/`。

预览沙箱截图如使用必须标记为演示，不能冒充原生验证证据。真实模型调用会产生费用，默认用 mock 或已有虚构演示，不擅用运行时真实 Key。

## 宣传视频交接文案

目标：30–45 秒中文产品介绍，16:9 1920×1080、30fps、H.264 MP4。根据工具可用性采用真实录屏或截图动效；使用截图时明确是界面演示，不伪造现场生成效果或速度。音乐仅用自制/已授权素材。

- 0–5秒：DeepCompose；长篇中文小说 AI 写作工作台。
- 5–12秒：作品就是本地 Markdown；材料、章节、候选分开管理。
- 12–22秒：AI 协作、冷读与资料回流，作者决定采用什么。
- 22–30秒：正文手改、资料表格、明暗主题，展示真实可用交互。
- 30–38秒：作者 Liumorrow；QQ 群1071188925；开源许可GPL-3.0-only；与DeepSeek官方无关联。
- 尾卡：Windows/macOS；Linux适配准备中。GitHub仓库已建立，源码及安装包尚未发布，不能写“现已上线下载”。

不宣传未实现的云同步、零风险、防丢稿绝对保证、完全离线 AI 或 Linux 已适配。有关本地保存的文字同时说明调用 AI 会发送所需材料到配置的模型服务。

视频与封面输出 `release/media/`，附制作工程/脚本、使用素材及来源、字幕和最终文件路径。保留无音乐版本便于后续调整。
