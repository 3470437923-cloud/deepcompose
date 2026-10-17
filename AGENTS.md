# AGENTS.md —— DeepCompose 维护手册（给接手 agent）

本文件是**接手即读**的一页纸：契约、代码地图、闸门、环境坑。细节在
`README.md`（产品与磁盘契约）、`docs/DEVELOPMENT.md`（构建与验收）、`docs/MATERIALS-STYLE.md`（小说资料的写法与体量契约）、`DESIGN.md`（视觉体系）、`PRODUCT.md`（产品定位）。

## 0. 一句话产品

本地优先的长篇中文小说 AI 写作台：作品 = 本地 Markdown 目录；AI 用工具读写作品目录；
作者的意志高于 AI 的输出（回流只出报告、候选未采用不回写、冷读物理隔离）。

## 1. 改名历史与冻结名（最重要）

产品 2026 年经历**两代更名**：**writerD 3.0.0** → **KeepCompose 1.0.0** → **DeepCompose 1.1.0**
（第二代已于 B9 批次执行完毕；仓库目录 `S:\KeepCompose` → `S:\DeepCompose`）。
**两代更名都只改品牌面**（界面文案、窗口标题、exe 名、crate 名、identifier：
`DeepCompose.exe` / `deepcompose` / `com.deepcompose.desktop`），
**以下磁盘契约名全部冻结，任何重构都不得改**：

- 作品内：`小说资料\ 章节内容\ 待确认\ 已处理\ 审核\ 个人改稿\`、`.openwrite_manifest.json`、`.openwrite_recycle\`、`recycle_manifest.json`、`.openwrite_backup\`（压缩归档，`.` 前缀不进内容树）、`writerd_oplog\`
- 应用数据：`writerd_sessions\`、`writerd_snapshots\`、`writerd_memos.json`、`skills\`
- 配置：`%APPDATA%\com.writerd\writerD\shared_preferences.json`（`flutter.` 前缀键名、封闭键集合）、同目录 `window_state.json`
- 主题键值：`dark` / `light`（dsblue 已于 2026-10-06 撤下，旧配置在 parsePrefs 迁移为 dark；强调色默认 `customAccentColor=0` = 跟随主题的黑白墨）
- 判定函数：`isSystemEntryName` 的 `writerd_` 前缀、`.` 前缀、`recycle_manifest.json`

看到代码里出现 `writerd_*` / `com.writerd` **不是遗漏，是契约**。

**新增契约（additive，不改旧名）**：`%APPDATA%\com.writerd\writerD\usage_stats.json` —— token 按日分桶、
余额快照与最近错误，B2 批次起使用，**可随时删除**（丢了只是没统计，不影响作品与配置）。
`Documents\writerd_quick_prompts.json` —— 快捷提示词清单（B17），additive，可随时删除（丢了回默认清单）。
`welcome_dismissed`（prefs 扩展键，B19/D-053）—— 首启欢迎弹窗「不再显示」，已读纪律与 D-030 同款。

**D-043 新作品结构（additive，只在新建作品生效）**：核心 7 件里 `04-粗纲.md`、`06-写作风格.md`、
`细纲\` 栏目（`第N-M章细纲.md` / 完成态加「（已完成）」）、`个人改稿\规则台账.md` 是新名；
旧 14 件套名只在老作品里继续存在，老作品一个字不动。00 头部新增 `- 启用模块：` 行（追踪模块声明），
manifest 新增可选字段 `reflowMode` / `viewMode`（缺省 = 老作品行为）。

## 2. 代码地图

```
src/core/ai/        双协议 SSE 解析(protocol) · 工具循环(agent) · 会话装配(controller)
                    提示词(prompt) · Tauri 事件桥(transport) · 上下文压缩(compress)
                    回流(reflow，资料/风格双通道 + 四态路由 + 建仓) · 冷读(coldread，零工具隔离) · 错误分类(errors) · 模型清单(models)
                    AI 三态模式(mode，B15：只读/写作/开发，双闸=tools 过滤 + exec 路径硬拦)
src/core/store/     作品目录协议(project，校验器结构感知) · 模板(templates：核心 7 件 + 追踪模块 + 旧 14 件套兼容) · 开书引导填充(onboarding，含模块建议)
                    操作日志+diff+回流队列配对(oplog) · 清单(manifest，含 reflowMode/viewMode) · 格式优先回写(markdown，回归锁)
                    章号解析(chapter) · 写前快照(snapshot) · 会话(session) · 备忘录(memo)
                    状态文档结构化读取(status，含启用模块) · 伏笔统计核对(tracking) · 资料形态体检(style，D-038)
                    细纲栏目(xigang，D-043) · 配对对照(pairedDiff) · 规则台账(ledger)
                    写入落点校验(docschema，B6 + 旧结构名禁建 + isManagedDocName 受管名判定) · 表格视图解析(doctable，B7；B13 起位置感知 + 通用回落全覆盖 + 行级手术)
                    快捷提示词(quickPrompts，B17) · 统一引号(quotes，D-055：英文双引号→中文，逐行交替配对)
                    自然序文件名比较在 project.naturalCompareNames（B20：细纲跨数量级排序修复）
src/core/tools/     工具 schema(spec) · 执行(exec，含落点校验接线) · 路径分级(pathGuard，唯一策略源)
src/core/skills/    SKILL.md 解析与注册(registry) · 目录扫描与合并(scan) · 内置资产释放(builtin，A-8：构建期内联 + 启动只补缺失)
src/core/           启动装配(app) · 目录权威(dirs) · 配置模型(prefs) · 文件桥(fsbridge) · id(ids) · 作者信息(author,B19:只读 Rust app_info) · 使用教程内容(help,B19)
src/ui/             主工作台(MainWorkbench) · 开书向导(NewBookWizard，含追踪模块步) · 标题栏用量入口(TitlebarUsage，D-044 文字按键) · 用量面板(UsagePanel) · 回收站(RecycleBin) · 备忘录(MemoModal) · 对话框(Dialogs)
                    冷读悬浮面板(ColdReadPanel，D-045：无遮罩/可拖动/问题成行/勾选交 AI 修复；D-058：独立生成槽——coldAbortRef + 独立传输实例，不占聊天 busy) · 资料表格视图(DocTable，B14 起可手改) · 追踪模块管理(ModulesDialog，建仓入口)
                    网页版参考栏(WebColumn，D-057：白名单子 webview 的几何同步与生命周期)
                    快捷提示词栏(QuickPromptBar，B17：可展开/增删改，持久化 writerd_quick_prompts.json) · 使用教程弹层(HelpModal，B19/D-053) · 首启欢迎弹窗(WelcomeModal，B19：「不再显示」落 welcome_dismissed) · 渲染错误边界(ErrorBoundary，B19：KL-UI-11 白屏路的通用防线) · 流式合批(useStreamBatcher，B19/D-054：每帧一次 setState，flush/drop/dispose 时序契约)
                    弹簧动效(motion) · 最大化跟踪(useMaximized) · 模态焦点(useDialogFocus)
src/screens/        设置屏(SettingsScreen，7 分页：提供商/Skill/参数/主题/数据/使用教程/关于；
                    提供商分页含只能点选的模型选择框 ModelSelect，全屏改动走防抖自动保存)
src/preview/        浏览器预览沙箱（内存 FS 替身，dev-only，不进产物）
src-tauri/src/      lib(app_info 署名/构建烙印 + open_url,B19/D-053:署名唯一真源) · sys(目录/配置/open_dir) · fs(文件原语) · ai(SSE 转发+中断) · winstate(窗口几何) · web(D-057：网页版参考栏，白名单子 webview；tauri unstable 的 add_child，三命令全 async) ;build.rs 把同一组常量写进 PE 版本资源
tests/              vitest；与 src 同构目录
tools/              package.ps1(打包+快捷方式) · capture.ps1(真机截屏) · preview_*.py(预览取证) · ds_probe.py(真实 Key P0 探针) · e2e_*.ps1
                    审计类：_a11y_check / _contrast_audit / _style_audit / _css_coverage
                    （退出码统一：0 通过 / 1 有问题 / 2 **判不了**——含基线丢失、媒体态无法建立、一条都没量到）
                    真机类：_shot_flow.py(截图流程+CDP 公共库) · _compare_sheet.py · cdp_probe.py · uiwalk.ps1 · probe_window.ps1 · probe_win_style.ps1
                    **全量清单与用法见 docs/DEVELOPMENT.md §9**（新加脚本必须补进那一节）
```

> **已落地（B0–B9 全部完成，规划注记已删）**：`src/core/usage/stats|peak|persist|view.ts`（B2/B6）、
> `src/core/ai/platforms.ts`（B1）、`src/core/ai/profiles.ts` + `platformNotice.ts`（B3）、
> `src/core/ai/thinking.ts`（B4，思考档位模型；档位是**会话级内存值**，见 D-028）、
> `src/core/ai/balance.ts`（余额查询）、`src/ui/TitlebarWhale.tsx` + `UsagePanel.tsx`（B6）、
> `src/core/store/recycle.ts` + `names.ts` + `src/ui/RecycleBin.tsx`（B7：两段式删除；
> 安全门与受限删除命令见 D-032；Rust 侧 `fs_remove_child`）、快照纪律统一（B8：先落快照再动盘，
> 见 D-034）与备忘录分类迁移（B8，见 D-035）。
>
> **B10（复盘与润色批）**：主界面首条发言崩溃修复（`newId` 未定义 → `uuid()`，乐观会话与落盘会话
> 同 id）；思考档位浮层挂 `useDismiss` + 输入区按钮行允许换行（"思考 UI 堆叠"）；设置屏模型
> datalist 换成自绘组合框（B11 起为**只能点选**的 `ModelSelect` + `filterModelOptions`，回归锁
> `tests/ai/models.test.ts`；B10 那版叫 `ModelCombo` 且可手填，**现码中不存在** —— 见 KNOWN-LIMITS KL-UI-03/08）；
> 设置屏全屏防抖自动保存（唯一落盘出口 `doSave(formRef.current)`，卸载兜底）；
> 回收站常驻入口（侧栏底部 `.foot-recycle`，作品下拉里那份保留）；
> 生成中禁止新建/切换会话（防跑完被 `setSession` 拽回旧会话）。
>
> **B11（最终复盘批）**：模型选择改**只能点选**的 `ModelSelect`（手填与已选值混用必致"当前用哪个
> 模型靠猜"；弹层筛选只缩小列表、不改已选值，回归锁沿用 `tests/ai/models.test.ts`）；
> 流式滚动锁死修复（弹簧写 scrollTop 触发 scroll 事件被当成用户滚动 → `springScrollToBottom`
> 新增 beforeWrite 程序写入守卫；上翻让位并浮出「回到底部」钮，点它或自己发言重新接管跟随）；
> 开书引导 `NewBookWizard`（三步：书名与方式 → 故事定位 → 世界与开局；答案经
> `core/store/onboarding.ts` 只替换模板「待填写」整行填进 01/02 文档，留空保持占位，可跳过走
> 空白开书；`createProject` 第四参 overrides 仍走同一个 `renderTemplate` 出口；
> 回归锁 `tests/store/onboarding.test.ts`）。复审再销 8 条（KL-UI-11~18）：null 会话触发回流的
> `session!` 白屏、关窗守卫丢稿/关不掉、「重置数据」被自动保存回滚、温度/字号越界与清零落盘、
> usage_stats 读改写串行化、回流队列停止团灭、备忘录写盘乱序。

> **B21（2026-10-11 表格视图列宽批）**：用户逐表点名列宽与观感问题，裁决 D-061~D-066。
> ① **切换钮改内容驱动**（`hasRealTable`：有 grid/kv 才给钮）——人物库与 03-全书大纲是纯散文，
> 给了钮点进去还是同一段话，属误导，现不给钮；`docTableFor` 仍永不返回 null，改的只是入口可见性。
> ② **列宽按表声明**（`COLUMN_WEIGHTS`，100 分制 → `<colgroup>` + `table-layout:fixed`），
> **只对用户点名的表启用**，细纲/粗纲/00/01/02 保持内容自适应一个像素不动；列集必须完全一致，
> 部分匹配整体放弃（首版漏了这条，被新回归锁当场抓住）。③ **grid 表去掉行末空列**（原 `.dt-rowact`
> 删钮列正是"最右边多余空白列"），删钮改悬停浮在行右端，所有 grid 表统一。④ **状态值符号化**
> （√/×/?，只改显示层，文件仍存中文；顺带修正台账点选词表——旧表只有「候选/已晋升/已否决」，
> 与盘上在用的「待观察」「已晋升（附条件）」不符）。⑤ **章节摘要两列化**（`###` 章块 → 一行一章）。
> ⑥ 清理一份真实作品审核目录中的冷读遗留；作品名和正文不进入公开文档。另有作品审核目录存放现行有效裁决，未改动。
> 回归锁：`tests/store/doctable.test.ts`（列宽/门控/章节摘要）+ `tests/ui/docTable.test.ts`（符号表、
> 词表耦合、空列不许回来）。**批 3 待办**：06「风格规则」表格化要改文件本体格式，见 KL-UI-23。

> **B22（2026-10-11 批 3：06 写作风格真表格化）**：用户批 3 开工并授权自主决断、直接出包。裁决 D-067~D-069。
> ① **06「风格规则」改成 `### SR-编号` 块 + 三行字段**（规则分类/规则来源/具体内容），于是四列
> grid 真的出现（`[10,15,10,65]`，实测两主题逐列命中）。**列名与字段名逐字相同**，加行走通用
> `buildEntryBlock`（它拿列名当字段名）。② **新旧双认**：`styleRuleBlocks()` 切不出 SR 块时，
> 「风格规则」整节回落成散文卡——老书不迁移照旧读，写入校验 `STYLE_SR_RULE` 对自然段格式直接放行
> （真盘实测：新格式与旧格式**都放行**）。③ **06 默认表格视图**（与规则台账/追踪表同档）。
> ④ 迁移脚本 `tools/migrate_style_sr.py`：规则文字从原文件切出，不由人手重打；拼回必须与原文逐字节相同才允许写盘。真实作品的字数统计不进入公开文档。
> ⑤ **踩坑记录**：`buildEntryBlock` 曾按文件名放行 06，于是「禁用列表」也会长出一个「＋新条目」
> 钮、生成出错的块——被新回归锁当场抓住，改成**按列结构判**（`columns[0] === "规则编号"`）。
> ⑥ 另两本书的 `审核\` **保留**：那是冻结契约里「过程记录归档」的登记位置（`prompt.ts` /
> `style.ts` / `reflow.ts` / 技能都在指它），且里面是**现行有效裁决**，删掉既丢依据又破契约。
> 回归锁：`tests/store/doctable.test.ts`（SR 解析/改格/加行/默认视图/双认）+ `style.test.ts`（模板例外）。
> **06 预算 6000 → 8000**（SR 块带三行字段名，同量文字必然变长；只诊断不自动改写）。

数据流：`MainWorkbench` 只依赖 `core/*` 的纯函数 + `fsbridge`；Rust 只做三件事——
文件原语、SSE 转发、窗口几何。**业务策略（路径分级、格式优先、快照）全部在 TS 侧且有单测**。

## 3. 闸门（声称完成前必跑，全绿才算）

```powershell
.\node_modules\.bin\tsc.cmd --noEmit      # exit 0
.\node_modules\.bin\vitest.cmd run        # 全绿
cd src-tauri; cargo test --lib            # 全绿（禁止 --release：lto 会压爆 rustc）
```

当前基线（2026-10-18 工程故障维护实测）：vitest 默认 **723 通过 + 9 跳过 / 55 文件**（3 平台专有 + 6 需显式本地目录的只读集成）；指定真实作品、技能与书库目录时 **729 通过 + 3 平台跳过**。macOS 宿主 cargo **34 例通过**、`tsc` 干净；macOS/Linux 模拟同为 723 通过 + 9 跳过。修复与证据见 `docs/BUGFIX-2026-10-18.md`。Linux 原生编译与桌面验收仍待执行，模拟不等于原生支持。
基线数字随批次滚动 —— 动过测试就把它更新成本次实测值（旧值曾出现 404/390 两处不一致）。

> **B13–B18（2026-10-06 表格全覆盖与手改批）**：doctable 位置感知化 + 通用回落解析器
> （任何 md 都有表格视图）+ 展开实测溢出修复（旧 60 字符启发式与可视截断是两套判定）；
> 表格手改（单元格编辑/加删行，行级手术复用既有保存管线）；docschema 禁止新建旧结构文件名；
> AI 三态模式（mode.ts：只读/写作/开发，默认开发、内存态、采用门与回流在非开发模式弹窗）；
> 工具轮次滑杆（最右端 = 无上限，落盘 0）；快捷提示词栏（writerd_quick_prompts.json）；
> 编辑器底部四键（只读态仅复制全文）。
>
> **B19（2026-10-08 帮助署名与流式崩溃修复批）**:1 **D-053 帮助与署名**——使用教程一份内容两处渲染（`core/help.ts` → 标题栏「帮助」弹层 HelpModal + 设置屏第 7 分页「使用教程」）;首启欢迎弹窗（`WelcomeModal`，「不再显示」落 prefs `welcome_dismissed`，已读纪律与 D-030 同款）;作者/QQ 群/抖音唯一真源在 Rust `lib.rs` 编译期常量经 `app_info` 下发（`core/author.ts` 只读不写），`build.rs` 同一组常量写进 PE 版本资源 + 构建烙印（提交号@构建时间）;开源许可 GPL-3.0 三件套（`LICENSE` + `LICENSE.third-party.txt` + Cargo.toml/tauri.conf 一致）;2 **D-054 流式渲染崩溃修复（KL-PF-01）**——`useStreamBatcher` 每帧合批（flush/drop/dispose 时序契约）+ `ChatMessageRow` memo + 主界面/设置屏两座 `ErrorBoundary`。验收链见 `docs/DEVELOPMENT.md` §9.4，署名与许可核对见 §10。
已知边界与缺陷账本见 `docs/KNOWN-LIMITS.md`；
本轮改造的逐项裁决（含 DeepSeek 官方接口事实基线）见 `docs/DECISIONS.md`；
D-043 结构改造的完整设计见 `docs/DESIGN-STRUCTURE-2026.md`；
B12 全量修复进度见 `docs/FIX-LEDGER-2026-10-02.md`。

**真实 Key 实测探针**：`python tools/ds_probe.py --only <balance|replay|anthropic|anth2|openai2|effort2|keepalive|stream|cache|limits>`。
它只读本机 prefs 里的 Key（`%APPDATA%\com.writerd\writerD\shared_preferences.json`），**绝不打印 Key**
（输出统一过 `redact()`），请求都压在几百 token 量级。KL-DF-01/02/03/04/05 的 `[已实测]` 结论都由它产生。

回归锁（改坏即产品事故）：
- `tests/store/markdown.test.ts` —— 格式优先（只 append / 节内替换）
- `tests/ai/coldread.test.ts` —— 冷读零工具/零项目块/零技能
- `tests/tools/exec.test.ts` —— 路径分级三授权根、根外确认
- `src-tauri` winstate 单测 —— 窗口几何夹屏规则

## 4. 硬纪律

1. 绝不用 PowerShell 写/改源码（GBK 毁中文，不可逆）；`.ps1` 保持纯 ASCII。
2. 密钥不入库：API Key 只进运行时配置，不进仓库/测试/证据。
3. 写前快照；候选未采用不回写；用户手改是最高权威（动文字必须过 `question`）。
4. 配置封闭键集合：新增键走 ADR + 同步 `prefs.ts`；`vip_*`/`device_id` 永不写出。
5. 零 UI 运行时依赖：只允许 react / react-dom / @tauri-apps/*；图标自绘内联 SVG，字体本地自托管。
6. 只展示已实现的功能；占位按钮（"后续批次提供"）视为缺陷。
7. 注释口径：中文；说"为什么"与契约，不逐行复述代码；过时注释随实现一起改。
8. 小说资料形态：写 `小说资料/` 下任何文档遵守 `docs/MATERIALS-STYLE.md`（预算与判定在 `src/core/store/style.ts`）；默认自然段与必要井号标题，不生成非必需列表、表格、加粗、引用标记、箭头或斜杠概念链；00状态、01与02开书引导精确字段、五份追踪字段保留最少标记，路径与链接语法不删；过程记录放 `小说资料/审核/`。**预算只用于诊断，不授权自动删除或改写**；整理存量资料须在用户授权范围内保留事实、来源与可检索归档，体检只报告。

## 5. 环境坑（本机实测）

| 坑 | 规避 |
|---|---|
| 只有 Windows PowerShell 5.1，执行策略拦 `npm.ps1` | 用 `npm.cmd`；脚本走 `-NoProfile -ExecutionPolicy Bypass -File` |
| PowerShell 写 UTF-8 源码毁文件（GBK 吞字节） | 只用文件工具写；`.ps1` 存 ASCII |
| vite dev server 开着时改项目内文件 → vite 致命退出 | 改文件前先停 dev server |
| `cargo test --release` 压爆 rustc | 只用 `cargo test --lib` |
| 提交内存耗尽（FreeVirtualMemory < 500MB） | 关掉吃提交的大户再跑闸门 |
| 无头环境截 WebView2 白图 | 截屏前 `SetForegroundWindow` 并等 0.5–1s（`tools/capture.ps1` 已处理） |
| 读运行时配置回显密钥 | 用 `python -c json.load(...)`，别用 PS 裸读 |
| **项目目录改名**（writerD→KeepCompose→DeepCompose） | cargo 指纹里存着旧绝对路径，报 `failed to read plugin permissions ... os error 3`（**B9 实测复现**：`\\?\S:\KeepCompose\...\permissions\app\autogenerated\commands\app_hide.toml`）；**改名后必须删 `src-tauri\target` 再冷编译**（release 冷编译实测约 3 分 37 秒） |
| 目录改名报 `Access to the path ... is denied` | 有进程把这个目录当工作目录/占着文件：**上一次真机截屏留下的旧 exe 进程**（`KeepCompose.exe`）最典型，其次是残留的 pwsh/node 运行器。清掉再改；子目录改名能成功而根目录不行，就是这个症状 |
| identifier 变更（更名连带） | WebView2 profile 会重置一次；用户作品与配置在自定义路径，**不受影响** |

## 6. 交付流程

```powershell
npm.cmd run package     # tsc --noEmit 类型闸门 → vite build → cargo build --release → release\DeepCompose.exe → 桌面快捷方式 DeepCompose.lnk
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\capture.ps1   # 真机截屏取证到 shots\
```

快捷方式由 `tools/package.ps1` 维护（会先删旧的 `writerD.lnk` 与 `KeepCompose.lnk`）。改完代码 → 闸门全绿 → 打包 → 截屏核对 → 原子提交。

> **第二代更名（B9）已完成**：仓库目录 `S:\DeepCompose`，产物 `release\DeepCompose.exe`、快捷方式
> `DeepCompose.lnk`，crate `deepcompose` / `deepcompose_lib`，identifier `com.deepcompose.desktop`。
> 改名当批**先删 `src-tauri\target` 再冷编译**（cargo 指纹里存着旧绝对路径，实测确实报 os error 3）；
> 改名本身被拒时先清掉旧 exe 进程与残留运行器（见第 5 节坑表）。
