# Product

<!-- impeccable:product-schema 1 -->

> 记录方式说明：本文件由 agent 依据仓库既有文档（`README.md`、`docs/DEVELOPMENT.md`）与源码推断撰写，
> **未经用户访谈**（用户明确指示本轮自主推进）。凡属推断的条目均以 `[推断]` 标注，属用户
> 明确指示的条目以 `[用户指令]` 标注。未验证的推断在被用户确认前不得当作既定事实扩展。

## Platform

web

（Tauri 2 桌面包体，界面由 WebView2 渲染 web 技术。按 impeccable 口径：原生外壳不使设计语言变成原生，
故记为 `web`。）`[推断]`

## Users

- 主要用户：**单人长篇中文小说作者**，在自己的 Windows 桌面上连续数小时写作。`[推断]`
- 使用场景：不是"写完一章就走"，而是长时段驻留——左栏翻资料、中栏改正文、右栏与 AI 讨论，三个动作
  在同一屏内高频来回。`[推断]`
- 用户要完成的工作：把一部几十万字的长篇**持续推进下去**，且**作者的意志不被 AI 覆盖**。`[推断]`

## Product Purpose

本地优先的 AI 长篇写作工作台。作品以**本地 Markdown 文件为唯一数据源**，AI 通过工具调用直接读写
作品目录，不引入数据库与云端副本。成功 = 作者能长期、可控地把长篇写下去，且 AI 的每次介入都可追溯、
可拒绝、可回退。

## Positioning

三件邻家产品无法如实照抄的机制：

1. **格式优先**——用户改过的文档格式永不被程序覆盖，维护文档回写只做追加与节内替换（`markdown.ts` 有回归锁）。
2. **用户手改是最高权威**——回流审稿只出报告；AI 永不静默改写用户文字，动用户文字必须过 `question` 确认。
3. **冷读物理隔离**——独立审读会话在代码级做到零工具、零设定、零作者上下文（`coldread.ts` 有回归锁）。

配套机制：候选稿未采用**不得**回写事实（`待确认\` 里的情节永不进追踪表与章节摘要）。

## Operating Context

- 3.0 单主线管线：恢复状态 → 最小读取 → 完整初稿 → 逐段修改 → 全文复读 → 唯一候选 → 用户采用 →
  正式回写 → 归档推进。用户的心智模型是**一条线**，不是并行分支。
- 磁盘目录即产品形态：`小说资料\`（14 件套维护文档）、`章节内容\`（正式正文 `第N章.md`）、
  `待确认\`（候选稿 `第N章-v*.md`）、`待确认\已处理\`（归档）。
- 长驻会话：AI 对话、回流、冷读各自落在专属标题会话中，互不打断。
- 全部用户操作落盘 `writerd_oplog\log.jsonl`，既是学习原料也是追溯凭据。
- 每次写入前先落快照（`writerd_snapshots\`）。

## Capabilities and Constraints

**功能**：作品与章节扫描、通用内容树、资料文档单槽一读、正文/候选多标签且默认只读、回流学习、
个人改稿学习（经 `question` 逐条确认后晋升进 `06-写作规则.md`）、冷读、采用门五步回写、操作日志、
流式 AI 对话（可真中断上游连接）、工具调用（`file_read` / `file_write` / `file_manage` /
`create_project` / `question` / `skill_lookup`）、技能三级渐进加载、上下文压缩（不删聊天记录）、
备忘录、设置（AI 提供商双协议 / 参数 / Skill / 主题 / 强调色 / 字号）。

**硬约束（改动前必读，违反即破坏兼容）**：

- **磁盘格式契约禁止改名**：`小说资料\`、`章节内容\`、`待确认\`、`已处理\`、`审核\`、`个人改稿\`、
  `.openwrite_manifest.json`、`writerd_*` 目录、`writerd_memos.json`、`shared_preferences.json`
  及其 `flutter.` 前缀键名。
- **配置是封闭键集合**：商业化键（`vip_*` / `device_id`）读到即忽略、永不写出；新增配置键必须走 ADR
  并同步 `src/core/prefs.ts`。
- **路径分级**：作品根 / 技能根 / 作品目录三个授权根内直读，根外必须用户确认（`pathGuard.ts`）。
- **密钥不入库**：API Key 只存在于运行时配置，绝不写进仓库、测试或提交。
- **禁止用 PowerShell 写中文源码**：Windows PowerShell 5.1 按 GBK 解码 UTF-8，会毁文件（已发生过）。
- **零 UI 运行时依赖**：除 `react` / `react-dom` / `@tauri-apps/*` 外不引入运行时依赖；图标为自绘内联
  SVG，动效为 CSS + 自写 `ui/motion.ts` 弹簧，字体本地自托管。产物是免安装单文件 exe。`[推断：这是刻意的打包体积与离线约束，非偶然]`
- **证据先行**：声称"完成/修复/通过"前必须给出当场跑出的闸门输出；拿不到的数值标 `[待实测]`。
- **闸门**：`tsc --noEmit`（exit 0）+ `vitest run`（当前 174 项 / 14 文件全绿）；Rust 侧 `cargo test --lib`。
  **不得**用 `cargo test --release --lib`（会压爆 rustc）。

## Brand Commitments

- 产品名：**writerD**（设置页历史文案曾误写 2.0.1，实际版本 3.0.0）。
- **三套主题是绑定契约**，键名必须保留：`dark` / `light` / `dsblue`。设置页展示名为
  曜石黑 / 晨雾白 / DS 蓝。
- **强调色契约**：`core/app.ts` 只把 `--accent` 本体写成 `documentElement` 内联样式；
  `--accent-2 / -text / -soft / -fill / -line` 等派生色一律由 `color-mix(var(--accent))` 派生，
  用户换强调色时全站即时联动。
- **品牌色**：`#4D6BFE`（DS 蓝）为默认强调色。
- **字体**：Inter Variable 出拉丁与数字，MiSans VF 出汉字，均本地自托管并随包携带许可证
  （Inter = OFL-1.1，MiSans = Apache-2.0）。
- `[用户指令]` **绑定视觉约束（本轮重做的前提）**：去除玻璃材质与渐变材质；改为清爽简约、高级感；
  动效可做得更好；**三套主题必须保留**。

## Evidence on Hand

- `README.md`（能力表、磁盘格式契约、改代码前必读 10 条）、`docs/DEVELOPMENT.md`（闸门、打包、验收、环境坑）。
- `tools/` 下的真实取证链：`capture.ps1`（真实 exe 截屏）、`preview_shot.py`（三主题×三尺寸）、
  `preview_diag.py`（页面异常原文）、`_style_audit.py`（裸奔元素）、`_contrast_audit.py`
  （玻璃合成色下的 WCAG 比值）、`_a11y_check.py`（prefers-* 计算样式断言）、`_css_coverage.py`（类名落点）。
- `shots/` 下真实截屏；`assets/logo.png` 为 logo；`assets/builtin-skills/` 为内置技能。
- **不存在**的素材（后续工作不得编造）：用户量、客户案例、性能基准、定价、商业指标。

## Product Principles

1. **作者的意志高于 AI 的输出。** 任何自动化都不得静默改写用户文字或事实。
2. **磁盘格式就是契约。** 兼容性优先于整洁；改名即破坏。
3. **一切可追溯。** 写前快照 + 操作日志，任何一次介入都能回看。
4. **证据先于断言。** 没有当场跑出的输出，就不说"完成"。
5. **长驻不打扰。** 用户是连续写作数小时的人；界面必须让任务消失，而不是让用户等待编排。

## Accessibility & Inclusion

- 既有承诺，必须保持：`prefers-reduced-motion`（装饰动效无条件让路）、
  `prefers-reduced-transparency`、`prefers-contrast: more` 三个信号**各自独立**降级。
- 键盘可达：`:focus-visible` 实心焦点环分两级（指针聚焦 vs 键盘聚焦）。
- 中文界面（`lang="zh-CN"`），正文与路径必须可选中复制。
- 已知缺口（本轮可一并处理）：折叠面板未移出焦点序列；模态缺 Esc 退出与焦点管理；
  表单 `label` 未与控件关联；无 `aria-live` 状态播报。