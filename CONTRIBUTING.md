# 参与 DeepCompose

欢迎提交能够复现的问题与小范围修复。本项目以 GPL-3.0-only 发布；提交贡献前请确认你拥有相应代码、文档及素材的授权。

## 本地开发

安装 Node.js 22.12+、Rust stable 以及 Tauri 2 对应平台的系统依赖，运行 `npm ci` 和 `npm run tauri:dev`。Linux 说明见 [docs/LINUX.md](docs/LINUX.md)，macOS 说明见 [README-macOS.md](README-macOS.md)。

提交前执行：

```sh
npm run typecheck
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

跨平台修改还应执行相应平台模拟测试，并在原生系统验证文件读写、保存、回收站及窗口行为。模拟测试不能证明桌面程序已通过原生编译或运行验收。不要使用 `cargo test --release`。

## 兼容契约

请先阅读 [AGENTS.md](AGENTS.md) 和 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。`writerd_*`、`.openwrite_*`、中文作品目录和 `com.writerd/writerD` 是冻结的磁盘名称，品牌更名不授权修改这些名称。保留写前快照、作者确认与冷读隔离；修复缺陷时附上能够在修复前失败的回归测试。

## 提交问题与改动

问题报告请写明系统、架构、应用版本、复现步骤、预期行为和实际结果。优先使用虚构的最小作品复现。请勿附带 API Key、真实小说全文、配置文件、会话历史或未脱敏的日志。

拉取请求应说明问题、最终行为和验证结果；将功能修复与无关重构分开。源代码保留 UTF-8，代码注释说明原因和兼容契约。界面运行时依赖限定为 React、React DOM 与 Tauri 官方 API。

安全问题请按 [SECURITY.md](SECURITY.md) 处理。
