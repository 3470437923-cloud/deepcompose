# DeepCompose

**长篇中文小说 AI 写作工作台。** 桌面端应用（Tauri 2 + React 19 + TypeScript + Rust），作品以本地 Markdown 文件为唯一数据源，AI 通过工具调用直接读写作品目录。

> **与 DeepSeek 官方无关联声明**：DeepCompose 是独立的第三方本地软件，由本项目自行开发与维护，
> 与杭州深度求索人工智能基础技术研究有限公司（DeepSeek）**没有任何隶属、赞助或背书关系**。
> 软件内置 DeepSeek 官方 API 的接入预设，只是因为它是一个常用的模型服务；软件本身不是 DeepSeek 的产品。
> 「DeepSeek」为其权利人的商标，本项目仅在「说明兼容哪家接口」的意义上使用该名称。

- 版本：`1.1.0`（前身 writerD 3.0.0 → KeepCompose 1.0.0，2026 年二次更名交付）　平台：Windows（WebView2）
- 产物：`release\DeepCompose.exe`（免安装单文件），`npm run package` 一键重建并刷新桌面快捷方式
- 存储哲学：**格式优先**——用户改过的文档格式不被程序覆盖，回写只做追加与节内替换
- 工作流：**单主线管线**——恢复状态 → 最小读取 → 完整初稿 → 逐段修改 → 全文复读 → 唯一候选 → 用户采用 → 正式回写 → 归档推进
- 界面只展示**已实现**的能力：没有的功能不做占位按钮（同步/备份一类入口不存在）

## 能力

| 模块 | 说明 |
|---|---|
| 作品与章节 | 扫描/新建作品（14 件套文档模板一次生成）；正式正文 `章节内容\第N章.md`、候选稿 `待确认\第N章-v*.md`、归档 `待确认\已处理\`；中文/全角章号解析与数值排序 |
| 通用内容树 | 左栏递归列出作品内全部内容与资料文件（系统目录 `writerd_*`、`.openwrite_*` 隐藏），文件夹可折叠 |
| 编辑器 | 资料文档**单槽一读**（切换自动保存并关闭）；正文/候选**多标签堆叠、默认只读**，点「修改」进入编辑，点「完成」自动保存并**触发回流** |
| 回流 | 用户手改结束 → 自动审稿（报告制，不静默改写用户文字）→ 审用户操作 → 学习记录落盘 `小说资料\个人改稿\`；轻改动（≤24 字符且数字未变）只记日志；候选稿改动**禁止**回写事实 |
| 个人改稿学习 | AI 对比交付版与用户手改版，沉淀改稿判断；跨章重复的条目经 `question` 逐条确认后晋升进 `06-写作规则.md`「个人文风（学习沉淀）」节 |
| 冷读 | 独立审读会话：零工具、零设定、零作者上下文（代码级物理隔离），像陌生读者一样只读正文，报告自动存 `小说资料\审核\`；目标二选一：叙述清晰度 / 节奏与追读欲 |
| 采用门 | 「采用为正文」按钮 → 确认 → AI 执行五步回写：登记采用版本 → 保存正式正文 → 增量回写追踪表与章节摘要 → 逐项核对 → 旧稿移入已处理、清指针、推进章节 |
| 操作日志 | 每个用户操作（打开/编辑/保存/采用/冷读/回流…）落盘 `writerd_oplog\log.jsonl`，既是学习原料也可追溯 |
| AI 对话 | 流式正文与思考渲染、工具调用行内展示、**停止生成（真中断上游连接）**、会话按日分组；回流跑在后台专属会话，不打断当前对话 |
| 工具调用 | `file_read` / `file_write` / `file_manage` / `create_project` / `question` / `skill_lookup`；写入前自动落快照 |
| 技能系统 | `SKILL.md` 三级渐进加载；首次扫描只默认开启内置白名单（novel-writer / skill-creator） |
| 上下文压缩 | 超阈值把旧对话压成摘要，只影响发给模型的请求序列，**不删聊天记录** |
| 备忘录 | 单文件分类备忘录，可挂边常显；分类删除时条目迁入「默认」（不丢条目） |
| 作品删除 | **两段式**：先「移入回收站」（可还原，同时删除该作品的会话），再「彻底删除」/「清空回收站」；四道安全门按结构保证（见 `docs/DECISIONS.md` D-001–D-003、D-032） |
| 用量与余额 | 标题栏鲸鱼 + 面板：今日 token 汇总、本次会话累计、闲时/忙时倒计时、账户余额；统计数据落 `usage_stats.json`（只加不减，90 天滚动） |
| 设置 | AI 提供商（**DeepSeek 官方 / 硅基流动 / 自定义**，Base URL 内置可改；每个「名称 + URL + Key」可具名保存并一键切换；OpenAI / Anthropic 双协议、模型清单检测 + 手填）、思考档位、参数、Skill 开关、三套主题 + 强调色 + 字号、**存储位置更改/打开**、数据概览、关于（名称版本取自产物） |

## 快速开始

```powershell
npm.cmd install                 # 本机 PowerShell 下用 npm.cmd，不用 npm.ps1
npm.cmd run dev                 # 前端热更新（vite，端口 5183）
npm.cmd run tauri:dev           # 完整桌面端调试

npm.cmd run typecheck           # tsc --noEmit
npm.cmd test                    # vitest run
npm.cmd run package             # 打包：vite build → cargo build --release → 复制 → 刷新桌面快捷方式
```

更细的构建、验收与环境坑见 [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)；
给维护 agent 的契约与代码地图见 [`AGENTS.md`](AGENTS.md)；
已知边界与缺陷账本见 [`docs/KNOWN-LIMITS.md`](docs/KNOWN-LIMITS.md)；
改造裁决与 DeepSeek 接口事实基线见 [`docs/DECISIONS.md`](docs/DECISIONS.md)。

## 目录结构

```
DeepCompose/
├─ src/
│  ├─ App.tsx                应用外壳（主界面 ⇄ 设置屏两屏切换）
│  ├─ core/                  核心层（纯逻辑，可单测）
│  │  ├─ app.ts dirs.ts fsbridge.ts ids.ts prefs.ts
│  │  ├─ ai/                 protocol agent controller prompt transport compress reflow coldread errors models platforms profiles thinking balance
│  │  ├─ store/              project templates oplog manifest markdown chapter snapshot session memo recycle names
│  │  ├─ skills/             registry scan
│  │  ├─ usage/              stats peak persist view
│  │  └─ tools/              spec exec pathGuard
│  ├─ ui/                    MainWorkbench / MemoModal / Dialogs / RecycleBin / TitlebarWhale / UsagePanel / motion / useMaximized / useDialogFocus
│  ├─ screens/               SettingsScreen（6 分页）
│  ├─ preview/               dev-only 浏览器预览沙箱（内存文件系统替身）
│  └─ styles/                tokens.css（主题令牌）/ surface.css（材质）/ app.css（布局）/ fonts.css
├─ src-tauri/src/            sys.rs（目录与配置）fs.rs（文件桥）ai.rs（流式转发 + 中断）winstate.rs（窗口几何）
├─ tests/                    单元测试（vitest）
├─ tools/                    打包、截屏验收、e2e、预览取证脚本
├─ assets/builtin-skills/    内置技能（novel-writer / novel-deslop / novel-structure-quality-coordinator / skill-creator / token-optimizer）
└─ release/DeepCompose.exe   交付产物
```

## 磁盘格式契约（禁止改名）

下面这些名字是**已经落盘的既有格式**，改名会破坏用户已有作品与配置，属于兼容契约。
**产品两代更名（writerD → KeepCompose → DeepCompose）不改变其中任何一个名字**：

| 位置 | 名称 |
|---|---|
| 作品根 | `小说资料\`、`章节内容\`、`待确认\`、`.openwrite_manifest.json`、`.openwrite_recycle\`、`recycle_manifest.json` |
| 作品根（扩展） | `待确认\已处理\`、`小说资料\审核\`、`小说资料\个人改稿\`、`writerd_oplog\log.jsonl` |
| 小说资料 14 件套 | `00-项目状态.md`、`01-开书定位.md`、`02-核心设定.md`、`03-全书大纲.md`、`04-分卷大纲.md`、`05-滚动细纲.md`、`06-写作规则.md`、`人物库.md`、`章节摘要.md`、`追踪-伏笔.md`、`追踪-角色状态.md`、`追踪-时间线.md`、`追踪-资源与权限.md`、`追踪-废弃设定.md` |
| 作品根默认值 | `%USERPROFILE%\AI写小说` |
| 文档目录 | `writerd_sessions\`、`writerd_snapshots\`、`writerd_memos.json`、`skills\` |
| 配置 | `%APPDATA%\com.writerd\writerD\shared_preferences.json`（键名保留 `flutter.` 前缀） |
| 运行时状态 | `%APPDATA%\com.writerd\writerD\window_state.json`（窗口几何，可随时删除） |
| 运行时统计（新增） | `%APPDATA%\com.writerd\writerD\usage_stats.json`（token 按日分桶、余额快照与最近错误；可随时删除） |

配置模型是**封闭键集合**：商业化键（`vip_*` / `device_id`）读到也忽略、永不写出；
同步类键（`is_connected` / `webdav_config` / `webdav_sync_meta`）UI 已下线，仅保留往返不丢旧配置数据。
新增配置键必须走 ADR 记录并同步 `src/core/prefs.ts`。

## 改代码前必读

1. **证据先行**：声称「完成/修复/通过」之前，必须拿出当场跑出的闸门输出。
2. **不臆造**：拿不到的数值/文案标 `[待实测]`，不要用常识补全。
3. **格式优先**：维护文档回写只做 `append` 与节内替换，禁止整体重写（`markdown.ts` 有回归锁）。
4. **写前快照**：任何回写先落快照（`snapshot.ts`），手动保存与冷读报告同样落。
5. **路径分级**：作品根 / 技能根 / 作品目录三个授权根内直读，根外必须用户确认（`pathGuard.ts`，TS 与 Rust 不重复实现）。
6. **密钥不入库**：API Key 只存在于运行时配置，绝不写进仓库、测试或提交。
7. **绝不用 PowerShell 写中文源码**：Windows PowerShell 5.1 按 GBK 解码 UTF-8，会吃掉后续字符、毁文件（本项目已发生过）。
8. **候选未采用不得回写**：`待确认\` 里的情节永远不进追踪表与章节摘要（`reflow.ts` 与 novel-writer 技能双重锁定）。
9. **用户手改是最高权威**：回流审稿只出报告，动用户文字必须过 `question`；AI 永不静默改写用户稿。
10. **冷读隔离是代码保证**：`sendIsolated` 零工具、零项目块、零技能（`coldread.ts` 有回归锁），不得为"方便"给它加任何工具或上下文。
11. **只展示已实现的功能**：不写「后续批次提供」式占位按钮；做不了就不放入口。
