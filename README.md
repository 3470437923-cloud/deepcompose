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
| 作品与章节 | 扫描/新建作品（**核心 7 件套**：00-项目状态/01-开书定位/02-核心设定/03-全书大纲/04-粗纲/06-写作风格/人物库 + `细纲\` 栏目；**五份追踪表为可选模块**，开书向导勾选、中途可建仓）；正式正文 `章节内容\第N章.md`、单份候选 `待确认\第N章-候选.md`（同文件起草、修改、复读，兼容旧 `v*` 命名）、归档 `待确认\已处理\`；中文/全角章号解析与数值排序；**老作品的旧 14 件套结构原样兼容** |
| 通用内容树 | 左栏递归列出作品内全部内容与资料文件（系统目录 `writerd_*`、`.openwrite_*` 隐藏），文件夹可折叠 |
| 资料表格视图 | 资料文档可按表格查看（追踪表逐条成表、00 字段两栏、粗纲/细纲/写作风格/规则台账分栏；**任何文档都有表格视图**——不认识的走通用回落分节卡），**且可直接手改**：单元格点编辑（封闭字段点选）、追踪表/台账可加删行，行级手术写回 md、写前快照与 oplog 照常；「原文/表格」按书记住，解析失败的块节级回落为原文 |
| 写入落点校验 | AI 经 file_write 写 `小说资料\` 受管文件先过该文件的格式 schema：结构违规硬拒（报错带正确格式，AI 重写即可）、语义错位软警告、存量违规不背锅（变坏才拦）；`审核\` 与正文/候选不受限 |
| 资料体检 | 打开作品即逐份体检 `小说资料/`：体量预算、框线图与装饰符号、表格占比、过程性标注（导入说明/核对证据/（约N字）等）；结果汇总到状态条，**只报告不改写**（契约见 [`docs/MATERIALS-STYLE.md`](docs/MATERIALS-STYLE.md)） |
| 编辑器 | 资料文档**单槽一读**（切换自动保存并关闭）；正文/候选**多标签堆叠、默认只读**，点「修改」进入编辑，点「完成」自动保存并**按四态设置触发回流** |
| 回流（两路） | 编辑器四态选择（全部回流/仅资料回流/仅风格回流/不回流保存，**按书记住**）：资料回流=自动审稿（报告制）+事实回写；风格回流=「AI 稿 → 用户最终稿」**配对对照**学习（段落级原句→改后句），沉淀进 `小说资料\个人改稿\规则台账.md`，跨章 ≥2 次命中经 `question` 逐条确认后晋升进 `06-写作风格.md` 禁用列表；**采用门固定带风格对照**；轻改动（≤24 字符且数字未变）走仅风格通道；候选稿改动**禁止**回写事实；**队列落盘**（oplog pending 配对，关窗重开自动补跑） |
| 冷读 | **悬浮审读面板**（不占聊天界面、无遮罩、可拖动，边看问题边改正文）：两通道——剧情·完全冷（零工具零设定，只查连贯度/硬性 bug/状态矛盾/信息缺失）与风格·对照档案（注入 `06-写作风格.md`，只查禁用词/句式节奏/语气/人设声线）；问题按类别成行（定位跳转/勾选/删除），勾选的交给主聊天修复（先甄别成不成立，成功才从清单移除）；退出即弃，材料不落盘，oplog 留一行计数 |
| 采用门 | 「采用为正文」按钮 → 一次确认 → 先保存当前手改稿（失败则停止）→ AI 登记采用版本、保存正式正文、按启用模块增量回写、候选归档推进；细纲弧段完成时细纲改名「（已完成）」充当历史索引；已明确采用的同一版本不重复询问 |
| 追踪模块管理 | 作品菜单「追踪模块…」：启用/停用写 00 的「启用模块」行；启用而文件未建可发起**建仓**（AI 分段读取重构，产物先落 `待确认\` 过目） |
| 操作日志 | 每个用户操作（打开/编辑/保存/采用/冷读/回流…）落盘 `writerd_oplog\log.jsonl`，既是学习原料也可追溯 |
| AI 三态模式 | 输入框内切换只读/写作/开发：只读=AI 只能读；写作=只能改正文与候选、不动小说资料；开发=完全权限。默认开发、不持久化；非开发模式下采用门与回流跳弹窗提示 |
| AI 对话 | 流式正文与思考渲染、工具调用行内展示、**停止生成（真中断上游连接）**、会话按日分组；回流跑在后台专属会话，不打断当前对话；**截断自动续写**（撞 max_tokens 自动「继续」拼成一整条，至多 3 程）与**瞬时错误自动重试**（429/5xx/断流，空回合退避重试 2 次） |
| 工具调用 | `file_read` / `file_write` / `file_manage` / `create_project` / `question` / `skill_lookup`；写入前自动落快照 |
| 技能系统 | `SKILL.md` 三级渐进加载；内置技能（5 个：novel-writer / novel-deslop / novel-structure-quality-coordinator / skill-creator / token-optimizer）随应用发布，首次启动自动释放到技能目录（只补缺失、不覆盖用户改过的副本，见 `docs/DECISIONS.md` D-037），首次扫描默认全部开启 |
| 上下文压缩 | 超阈值把旧对话压成摘要，只影响发给模型的请求序列，**不删聊天记录** |
| 备忘录 | 单文件分类备忘录，可挂边常显；分类删除时条目迁入「默认」（不丢条目） |
| 快捷提示词栏 | 聊天输入区上方的可编辑提示词栏（内置写下一章/补齐开书材料等默认条目，可新建/修改/删除，点击填入输入框），持久化 `writerd_quick_prompts.json` |
| 编辑器快捷键 | 编辑器底部一行：复制全文（常显）/ 剪切全文 / 选中全文 / 粘贴（后三者仅可编辑态出现） |
| 作品删除 | **两段式**：先「移入回收站」（可还原，同时删除该作品的会话），再「彻底删除」/「清空回收站」；四道安全门按结构保证（见 `docs/DECISIONS.md` D-001–D-003、D-032） |
| 用量与余额 | 标题栏「用量」按键 + 面板：今日 token 汇总、本次会话累计、闲时/忙时倒计时、账户余额；统计数据落 `usage_stats.json`（只加不减，90 天滚动） |
| 设置 | AI 提供商（**DeepSeek 官方 / 硅基流动 / 自定义**，Base URL 内置可改；每个「名称 + URL + Key」可具名保存并一键切换；OpenAI / Anthropic 双协议、模型清单检测 + **只能点选**的模型选择框 `ModelSelect`，不支持手填）、思考档位、参数、Skill 开关、**两套主题（曜石黑/晨雾白）+ 灰阶强调色（默认跟随主题）** + 字号、**存储位置更改/打开**、数据概览、关于（名称版本取自产物） |

## 快速开始

```powershell
npm.cmd install                 # 本机 PowerShell 下用 npm.cmd，不用 npm.ps1
npm.cmd run dev                 # 前端热更新（vite，端口 5183）
npm.cmd run tauri:dev           # 完整桌面端调试

npm.cmd run typecheck           # tsc --noEmit
npm.cmd test                    # vitest run
npm.cmd run package             # 打包：tsc 类型闸门 → vite build → cargo build --release → 复制 → 刷新桌面快捷方式
```

更细的构建、验收与环境坑见 [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)；
给维护 agent 的契约与代码地图见 [`AGENTS.md`](AGENTS.md)；
**小说资料的写法与体量契约见 [`docs/MATERIALS-STYLE.md`](docs/MATERIALS-STYLE.md)**（判据在 `src/core/store/style.ts`）；
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
│  │  ├─ store/              project templates status tracking style chapter markdown manifest snapshot session memo recycle names oplog
│  │  │                        xigang（细纲栏目）pairedDiff（配对对照）ledger（规则台账）docschema（写入落点校验）doctable（表格视图解析）onboarding
│  │  ├─ skills/             registry scan
│  │  ├─ usage/              stats peak persist view
│  │  └─ tools/              spec exec pathGuard
│  ├─ ui/                    MainWorkbench / MemoModal / Dialogs / RecycleBin / TitlebarWhale / UsagePanel / DocTable / ModulesDialog / NewBookWizard / motion / useMaximized / useDialogFocus
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
| 作品根 | `小说资料\`、`章节内容\`、`待确认\`、`.openwrite_manifest.json`、`.openwrite_recycle\`、`recycle_manifest.json`、`.openwrite_backup\`（压缩归档，`.` 前缀不进内容树） |
| 作品根（扩展） | `待确认\已处理\`、`小说资料\审核\`、`小说资料\个人改稿\`、`小说资料\细纲\`、`writerd_oplog\log.jsonl` |
| 小说资料 14 件套（旧结构，老作品） | `00-项目状态.md`、`01-开书定位.md`、`02-核心设定.md`、`03-全书大纲.md`、`04-分卷大纲.md`、`05-滚动细纲.md`、`06-写作规则.md`、`人物库.md`、`章节摘要.md`、`追踪-伏笔.md`、`追踪-角色状态.md`、`追踪-时间线.md`、`追踪-资源与权限.md`、`追踪-废弃设定.md` |
| 小说资料核心件（新结构，D-043 起新作品） | 旧名中的 `00/01/02/03` 与 `人物库.md` 不变；新增 `04-粗纲.md`、`06-写作风格.md`、`细纲\第N-M章细纲.md`（完成态加「（已完成）」）、`个人改稿\规则台账.md`；追踪表五份改为按 00「启用模块」声明创建的可选模块（文件名不变） |
| 作品根默认值 | `%USERPROFILE%\AI写小说` |
| 文档目录 | `writerd_sessions\`、`writerd_snapshots\`、`writerd_memos.json`、`skills\` |
| 配置 | `%APPDATA%\com.writerd\writerD\shared_preferences.json`（键名保留 `flutter.` 前缀） |
| 运行时状态 | `%APPDATA%\com.writerd\writerD\window_state.json`（窗口几何，可随时删除） |
| 运行时统计（新增） | `%APPDATA%\com.writerd\writerD\usage_stats.json`（token 按日分桶、余额快照与最近错误；可随时删除） |
| 快捷提示词（新增） | `Documents\writerd_quick_prompts.json`（提示词清单；可随时删除，删除后回默认清单） |

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
12. **资料形态契约**：写 `小说资料/` 下任何文档前先看 [`docs/MATERIALS-STYLE.md`](docs/MATERIALS-STYLE.md)——体量预算与判定在 `src/core/store/style.ts`，作品校验会在打开作品时逐份体检并在状态条提示（**只报告、绝不改写**）。
