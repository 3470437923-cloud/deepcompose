# Inkwell · 项目工作手册

> 来源：`C:\Users\Administrator\.dsh\skills\inkwell-dev\SKILL.md`（本机 agent skill，原样转存供接手方使用）
> 为什么它对 writerD 重要：**Inkwell 与 writerD 是同一委托方、同一对标物（OpenWrite v2.0.1）的两个复刻工程**，Inkwell 进度更靠前（335 测试 / 7 分节设置 / 导出 / 同步都已实现）。它的技术栈裁决、硬约束、环境坑、证据纪律几乎全部直接适用于 writerD。**改这个项目之前，先读完本文档。**

- 产品仓库：`S:\dsh\inkwell`（git 本地仓库，无远端）
- 指挥渠道：`C:\Users\Administrator\Desktop\D.doctor`（**只放文档/规格/证据，不放产品源码**）
- 对标物：OpenWrite 写作助手 v2.0.1（Flutter/Dart，仅行为对照）

---

## 1. 这个产品是什么

把「规划 → 写作 → 审稿 → 回写记忆 → 成稿导出」放进同一条长期生产线的桌面写作台。三条产品信条：

1. **确定性优于智能** —— 记忆不放在对话里，放在文件里；每章落盘即确定事实。
2. **作者可控优于全自动** —— 何时固化记忆、让模型看哪些文件、何时重置上下文，显式暴露给作者。
3. **上下文长度是要管理的预算** —— 到点提醒、可重置、开新窗不掉记忆。

差异化（要守住）：记忆人类可读且可 diff / 提示词可测试 / 上下文预算可视化 / 导出无损（批注→docx comments）/ 无商业化层。

---

## 2. 技术栈（已裁决 D-002，不要改）

Tauri 2 + React 19 + TypeScript + Tailwind 4 + Vite + pnpm；正文编辑器 **CodeMirror 6**（裁定未执行前是 textarea）；存储 Markdown 文件 + SQLite（rusqlite）；凭据存 Windows 凭据库（keyring 4.x）；不用 Electron、不用 Flutter。

> writerD 对照：writerD 用 Tauri 2 + React 19 + TS + Vite + npm（非 pnpm）、无 Tailwind（纯 CSS 令牌）、编辑器 textarea、存储 Markdown + JSON（无 SQLite）、凭据直接写 shared_preferences.json（OpenWrite 真机即如此，与 Inkwell 的 keyring 不同——writerD 以真机行为为准）。

---

## 3. 常用命令（S: 盘工作）

```powershell
cd S:\dsh\inkwell; .\node_modules\.bin\vitest.cmd run     # TS 测试（当前 335 例 / 34 文件）
cd S:\dsh\inkwell; .\node_modules\.bin\tsc.cmd --noEmit   # 类型检查
cd S:\dsh\inkwell\src-tauri; cargo test                   # Rust 测试（23 例）
cd S:\dsh\inkwell; .\node_modules\.bin\tauri.cmd build    # 生产构建 → src-tauri\target\release\inkwell.exe
```

运行时自检（触发后产出 evidence JSON，会写文件）：
`INKWELL_WORKBENCH_CHECK=1`（三栏工作台 19/19）、`INKWELL_SETTINGS_CHECK=1`（设置 21/21）、`INKWELL_FATFISH_CHECK=1`（大肥鱼 18/18）。

发布：构建后把产物复制到 `S:\dsh\inkwell\release\Inkwell.exe`，桌面快捷方式 `C:\Users\Administrator\Desktop\Inkwell.lnk` 指向它，**重新打包后必须更新快捷方式**。

---

## 4. 真实端点（验收用）

- 协议：**Anthropic 格式**（`x-api-key` + `anthropic-version`），模型 `kimi-k3`，原生返回 thinking 块。
- 参数放在**用户级环境变量**：`INKWELL_LLM_BASE_URL` / `INKWELL_LLM_KEY` / `INKWELL_LLM_MODEL`（应用 `env_read` 已放行 `INKWELL_` 前缀）。
- 坑：这些变量在**新会话的进程环境里可能读不到**，需要显式注入：
  ```powershell
  $env:INKWELL_LLM_KEY = [Environment]::GetEnvironmentVariable('INKWELL_LLM_KEY','User')
  $env:INKWELL_LLM_BASE_URL = [Environment]::GetEnvironmentVariable('INKWELL_LLM_BASE_URL','User')
  $env:INKWELL_LLM_MODEL = 'kimi-k3'
  ```
- **key 严禁写进任何文件、证据、提交（含测试用例）**。

---

## 5. 代码地图

```
src/core/ai/       双协议 provider、SSE、工具调度循环 runner、上下文压缩 context、用量
src/core/tools/    read/write/edit/ask_questions/create_project/skill_lookup/skill_crud + pathGuard（路径分级）
src/core/store/    BookStore：作品目录协议、维护文档读写、快照、回收站、markdown 格式优先
src/core/skills/   SKILL.md 解析、CRUD、ZIP 导入导出、回收站、内置技能
src/core/comments/ 批注锚定与重锚定
src/core/export/   docx(OXML)/epub/txt/md
src/core/sync/     backup/conflict/lifecycle/lan
src/core/dirs.ts   唯一目录权威（resolveDirs/getAppDirs/getDemoBase）
src/ui/            三栏工作台、设置（7 分节）、Usage、ChapterEditor、各 P*Panel 自检面板
src-tauri/src/     commands.rs(IPC) / guard.rs(路径守卫) / store.rs(SQLite+keyring) / ai_http.rs / lan.rs
docs/CONTRACT.md   **接口契约唯一真源**（改它必须走 ADR）
docs/ADR/          ADR-001..004（存储接口 / books-root+会话+工具快照 / 路径大小写+技能存储 / 编辑器导出同步）
skills/            内置技能源（novel-writer）
tests/             vitest；tests/mock/*.py 是替身 provider
scripts/           probe_endpoint.py、verify_export.py（docx 结构双实现校验）
```

---

## 6. 不可违反的硬约束

1. **格式优先**：维护文档回写只做追加/节内局部更新，禁止整体重写、禁止恢复模板（`markdown.ts`，靠 LCS diff 测试锁）。
2. **写前快照**：任何回写先留快照可回滚；模型侧通用 `write`/`edit` 也要走工具层快照。
3. **路径分级三个授权根**：`projectRoot` / `skillsDir` / `booksRoot` 内直读，之外必须用户确认（`NEEDS_CONFIRMATION:`）。TS 与 Rust **双实现同规则**，改一侧必须同步另一侧并跑两边测试。
4. **I/O 保留调用方大小写**：归一化只用于判定；写盘用小写会把 `SKILL.md` 变成 `skill.md`（回归锁 `tests/casePreservation.test.ts`）。
5. **确认先行**：未确认不得写文件；模型不得先写后问。
6. **红线**：不复制对标软件的源码/提示词原文/中文文案/图标/素材；不实现破解、授权绕过、设备绑定、支付发卡。`D.doctor\reference\upstream-captured\` 是**行为规格**，不是素材（`novel-writer-UPSTREAM-DO-NOT-SHIP.zip` 严禁进产品）。
7. **证据纪律**：每个声称完成的功能必须附「验证方式 + 实测输出」；没有证据的「已完成」不算完成。
8. **质量闸门不许跌破**：TS 335+ 全绿、`tsc --noEmit` 干净、Rust 23+ 全绿。

---

## 7. 工具坑与环境（踩过的）

| 坑 | 现象 | 规避 |
|---|---|---|
| 进程环境缺 `INKWELL_*` | 端点读不到 | 见 §4 显式注入 |
| `cargo check/test` 偶发 `STATUS_STACK_BUFFER_OVERRUN` | rustc 崩在编译依赖 | 重试即过；`CARGO_BUILD_JOBS=4` |
| PowerShell `Add-Content` 被环境拦截 | 写文件失败 | 一律用文件工具（write/edit）写 |
| **PowerShell 写 UTF-8 源码会毁文件**（本机 5.1 + 代码页 936/GBK） | 中文变乱码；**GBK 前导字节吞掉换行 → 两行并成一行、字符串字面量断裂**（`TS1002: Unterminated string literal`）。**不可逆** —— 已因此毁掉 `src-tauri/src/webdav.rs` 与 `tests/skills/metadata.test.ts` | **绝不用 PowerShell 改源码**；发 `.ps1` 必须存 **UTF-8 带 BOM**（`scripts/package.ps1` 已是） |
| PowerShell 读中文文件显示乱码 | `Get-Content` 按 ANSI 读（**只是显示层**，文件可能是好的） | 用 read 工具复核；**别急着"修"一个其实没坏的文件**（`skills/skill-creator/SKILL.md`、`tests/prefs.test.ts` 都曾被误判） |
| 早期 harness 的 ripgrep 在 S: 盘返回空 | 误判「不存在」 | 当前 grep 工具在 S: 正常；必要时用 `Select-String` 交叉验证 |
| 根目录散落 `*.log`/`*.done`/`*-evidence.json` | 过期日志会误导（曾出现 exit=1 的旧测试记录） | 只信当场实测；新证据落 `docs/evidence/` |
| 本机无 Word/WPS/LibreOffice | docx 无法人工打开 | 用 `scripts/verify_export.py` 双实现结构校验 + OOXML 断言 |
| S 盘空间紧张（target 10 GB 级） | 构建失败 | 留意剩余空间，及时清 target/旧产物 |

---

## 8. 已知缺口与缺陷账本（销项后请更新本节）

> **当前状态以 `D.doctor\STATUS.md` 为准**（闸门实测数字、剩余缺口、下一步第一件事）。
> 交接文档地图：`D.doctor\handoff\INDEX.md`。

**交接时的缺口（2026-09-26）**：

- **收尾未做**：打包 + 更新桌面快捷方式 —— 一条命令 `pwsh -File scripts\package.ps1`。
- **已实现但未挂载界面（各 1–3 行）**：`DiagnosticsSection.tsx`、`DrawPanel.tsx`、提示音播放未接到 AI 运行结束点、`FontsSection.tsx` 仍调旧 `installFont`（应换 `installFontVerified`）。
- **未开始**：无边框窗口 + 自绘标题栏(#48)、拖拽导入(#49)、全局快捷键接线(#50)。
- **需重写**：`tests/skills/metadata.test.ts`（被 PowerShell 编码陷阱毁掉后删除；被测实现 `src/core/skills/metadata.ts` 完好）。
- **视觉与窗口行为全部未在真机验证过**（无头环境拿不到证据）：行号对齐、字体/字号热更新、深浅主题、中文 IME 输入、拖拽覆盖层。

---

## 9. 工作方式

- **分批推进**：每批结束跑「tsc + vitest + cargo test」→ 提交一次 git（原子提交，信息写清批次与验证结果）。
- **文件所有权**（并行时）：CORE-RUST 只碰 `src-tauri/**`，AI 只碰 `src/core/ai/**`+`src/core/tools/**`，DATA 只碰 `src/core/store/**`+`src/core/sync/**`，UI 只碰 `src/ui/**`，QA 只碰 `tests/**`。改契约 → 提出 → LEAD 裁决 → 记 ADR。
- **交接**：产出说明写到 `D.doctor\handoff\P<期>-<角色>-<简述>.md`，含「实现了什么 / 验证方式 / 实测输出 / 未决点 / 改了哪些文件」。
- **文档口径**：功能数统一用「61+5 项、A 类 41 项」；矩阵正文与统计行的旧分歧以裁决为准。
