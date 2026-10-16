# DeepCompose 1.1.0：首次开源发布说明草稿

状态：本地草稿，尚未创建 GitHub Release。应在发布阻断问题关闭、对应源码与安装包完成核验后使用本文。

DeepCompose 是面向长篇中文小说的本地 AI 写作工作台。作品由普通 Markdown 文件组成，作者可以直接查看、编辑、备份自己的内容；AI 在写作流程中通过工具读取和整理所需材料。

## 主要能力

- 从开书定位、核心设定到全书大纲、粗纲和细纲，按作品组织写作材料。
- 正文与候选稿分开，采用后推进归档；手改、快照与操作记录便于追溯。
- 资料与风格两路回流，候选未采用不回写事实。
- 冷读面板独立生成，剧情冷读不携带作品设定、技能或工具。
- OpenAI 与 Anthropic 接口格式，内置 DeepSeek 和硅基流动接入预设，用户自备 API Key。
- 流式对话、上下文压缩、技能管理、资料表格编辑、用量统计及明暗主题。

## 平台

| 平台 | 首次开源口径 |
|---|---|
| Windows | 已有原生桌面版，使用 WebView2；本轮修复后的发布包仍需在 Windows 重建与验收 |
| macOS | 已完成平台适配，最低 macOS 14；当前已有 Apple Silicon 产物，本轮修复后需重新打包验收 |
| Linux | 提供移植代码、构建入口及验证步骤；原生编译与桌面验收尚未完成，暂不宣称正式支持 |

## 数据与隐私

作品保持本地 Markdown 格式。AI 请求会把所需材料发送到用户配置的模型服务；请在使用前了解其服务条款。API Key 当前保存在本机配置中，应避免分享配置和未脱敏日志。

writerD、KeepCompose 老用户的 `writerd_*`、`.openwrite_*` 及中文目录名保持兼容，不因品牌更名重命名数据。升级前请备份作品与应用数据。

## 许可与反馈

应用源码以 GPL-3.0-only 发布，第三方组件沿用各自许可。详情见根目录 LICENSE 与 LICENSE.third-party.txt。DeepCompose 为独立第三方项目，与 DeepSeek 官方无隶属、赞助或背书关系。

仓库：https://github.com/3470437923-cloud/deepcompose

问题反馈请附系统、架构、版本和最小复现；不要提交真实 API Key、作品全文或配置文件。

## 正式发布时的附件要求

只附与发布 tag 对应源码重新构建的 Windows/macOS 包，附上 SHA-256 校验值、架构、最低系统要求和第三方许可材料。Windows 便携包请将 EXE 与 LICENSE、LICENSE.third-party.txt、THIRD-PARTY-NOTICES.txt 一同压缩，不能只上传单 EXE；macOS/Linux 安装包通过 Tauri 资源配置携带同一组许可。Linux 包须完成原生验收后再加入。现有本地历史包不能直接当成本轮修复后的产物。
