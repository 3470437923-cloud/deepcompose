# AGENTS.md —— KeepCompose 维护手册（给接手 agent）

本文件是**接手即读**的一页纸：契约、代码地图、闸门、环境坑。细节在
`README.md`（产品与磁盘契约）、`docs/DEVELOPMENT.md`（构建与验收）、`DESIGN.md`（视觉体系）、`PRODUCT.md`（产品定位）。

## 0. 一句话产品

本地优先的长篇中文小说 AI 写作台：作品 = 本地 Markdown 目录；AI 用工具读写作品目录；
作者的意志高于 AI 的输出（回流只出报告、候选未采用不回写、冷读物理隔离）。

## 1. 改名历史与冻结名（最重要）

产品 2026 年经历**两代更名**：**writerD 3.0.0** → **KeepCompose 1.0.0** → **DeepCompose 1.1.0**
（第二代在 B9 批次执行）。**两代更名都只改品牌面**（界面文案、窗口标题、exe 名、crate 名、identifier：
`DeepCompose.exe` / `deepcompose` / `com.deepcompose.desktop`），
**以下磁盘契约名全部冻结，任何重构都不得改**：

- 作品内：`小说资料\ 章节内容\ 待确认\ 已处理\ 审核\ 个人改稿\`、`.openwrite_manifest.json`、`.openwrite_recycle\`、`recycle_manifest.json`、`writerd_oplog\`
- 应用数据：`writerd_sessions\`、`writerd_snapshots\`、`writerd_memos.json`、`skills\`
- 配置：`%APPDATA%\com.writerd\writerD\shared_preferences.json`（`flutter.` 前缀键名、封闭键集合）、同目录 `window_state.json`
- 主题键值：`dark` / `light` / `dsblue`
- 判定函数：`isSystemEntryName` 的 `writerd_` 前缀、`.` 前缀、`recycle_manifest.json`

看到代码里出现 `writerd_*` / `com.writerd` **不是遗漏，是契约**。

**新增契约（additive，不改旧名）**：`%APPDATA%\com.writerd\writerD\usage_stats.json` —— token 按日分桶、
余额快照与最近错误，B2 批次起使用，**可随时删除**（丢了只是没统计，不影响作品与配置）。

## 2. 代码地图

```
src/core/ai/        双协议 SSE 解析(protocol) · 工具循环(agent) · 会话装配(controller)
                    提示词(prompt) · Tauri 事件桥(transport) · 上下文压缩(compress)
                    回流(reflow) · 冷读(coldread，零工具隔离) · 错误分类(errors) · 模型清单(models)
src/core/store/     作品目录协议(project) · 14 件套模板(templates) · 操作日志+diff(oplog)
                    清单(manifest) · 格式优先回写(markdown，回归锁) · 章号解析(chapter)
                    写前快照(snapshot) · 会话(session) · 备忘录(memo)
src/core/tools/     工具 schema(spec) · 执行(exec) · 路径分级(pathGuard，唯一策略源)
src/core/skills/    SKILL.md 解析与注册(registry) · 目录扫描与合并(scan)
src/core/           启动装配(app) · 目录权威(dirs) · 配置模型(prefs) · 文件桥(fsbridge) · id(ids)
src/ui/             主工作台(MainWorkbench) · 标题栏鲸鱼(TitlebarWhale) · 用量面板(UsagePanel) · 回收站(RecycleBin) · 备忘录(MemoModal) · 对话框(Dialogs)
                    弹簧动效(motion) · 最大化跟踪(useMaximized) · 模态焦点(useDialogFocus)
src/screens/        设置屏(SettingsScreen，6 分页：提供商/Skill/参数/主题/数据/关于)
src/preview/        浏览器预览沙箱（内存 FS 替身，dev-only，不进产物）
src-tauri/src/      sys(目录/配置/open_dir) · fs(文件原语) · ai(SSE 转发+中断) · winstate(窗口几何)
tests/              vitest；与 src 同构目录
tools/              package.ps1(打包+快捷方式) · capture.ps1(真机截屏) · preview_*.py(预览取证) · ds_probe.py(真实 Key P0 探针) · e2e_*.ps1
```

> **本轮改造（B0–B9）计划新增**：`src/core/usage/`（token 统计与闲时判定）、`src/core/store/recycle.ts`（回收站）、
> 标题栏鲸鱼与统计面板（`src/ui/`）、设置页平台预设与具名配置。落地后本节同步更新。
>
> **已落地（逐批更新）**：`src/core/usage/stats|peak|persist.ts`（B2）、`src/core/ai/platforms.ts`（B1）、
> `src/core/ai/profiles.ts` + `platformNotice.ts`（B3）、`src/core/ai/thinking.ts`（B4，思考档位模型；
> 档位是**会话级内存值**，见 D-028）、`src/core/ai/balance.ts`（余额查询，面板用）、
> `src/core/usage/view.ts` + `src/ui/TitlebarWhale.tsx` + `src/ui/UsagePanel.tsx`（B6：鲸鱼游动与用量面板；
> 几何与交互裁决见 D-031，闲置开关见 D-030）、`src/core/store/recycle.ts` + `src/core/store/names.ts`
> + `src/ui/RecycleBin.tsx`（B7：两段式删除；安全门与受限删除命令见 D-032，名字规则单一来源见
> 落地补注；Rust 侧新增 `fs_remove_child`）。

数据流：`MainWorkbench` 只依赖 `core/*` 的纯函数 + `fsbridge`；Rust 只做三件事——
文件原语、SSE 转发、窗口几何。**业务策略（路径分级、格式优先、快照）全部在 TS 侧且有单测**。

## 3. 闸门（声称完成前必跑，全绿才算）

```powershell
.\node_modules\.bin\tsc.cmd --noEmit      # exit 0
.\node_modules\.bin\vitest.cmd run        # 全绿
cd src-tauri; cargo test --lib            # 全绿（禁止 --release：lto 会压爆 rustc）
```

当前基线：vitest **379 例**、cargo **19 例**、`tsc` 干净。已知边界与缺陷账本见 `docs/KNOWN-LIMITS.md`；
本轮改造的逐项裁决（含 DeepSeek 官方接口事实基线）见 `docs/DECISIONS.md`。

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
| **项目目录改名**（writerD→KeepCompose→DeepCompose） | cargo 指纹里存着旧绝对路径，报 `failed to read plugin permissions ... os error 3`；**改名前后必须删 `src-tauri\target` 再冷编译**（release 冷编译实测约 3 分 37 秒） |
| identifier 变更（更名连带） | WebView2 profile 会重置一次；用户作品与配置在自定义路径，**不受影响** |

## 6. 交付流程

```powershell
npm.cmd run package     # vite build → cargo build --release → release\KeepCompose.exe → 桌面快捷方式 KeepCompose.lnk
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\capture.ps1   # 真机截屏取证到 shots\
```

快捷方式由 `tools/package.ps1` 维护（会先删旧的 `writerD.lnk`）。改完代码 → 闸门全绿 → 打包 → 截屏核对 → 原子提交。

> **第二代更名（B9）后**：产物为 `release\DeepCompose.exe`、快捷方式 `DeepCompose.lnk`（打包脚本改为删旧
> `KeepCompose.lnk`），本节命令与文字在 B9 同步更新。改名当批必须先删 `src-tauri\target` 再冷编译。
