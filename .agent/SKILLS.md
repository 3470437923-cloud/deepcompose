# writerD 构建用到的 Agent Skill 清单

> 上一轮 AI 在 DSH（DeepSeek Harness）环境下构建本项目时实际涉及的技能。
> 本机技能目录：`C:\Users\Administrator\.dsh\skills\<name>\SKILL.md`。
> 若换新环境/新窗口，按 §3 的方法恢复或重建。

---

## 1. 核心技能（与项目强相关）

### inkwell-dev ★最重要
- **位置**：`C:\Users\Administrator\.dsh\skills\inkwell-dev\SKILL.md`
- **本地副本**：`.agent/skills/inkwell-dev.md`（已随项目入库，换机直接读它）
- **内容**：姊妹项目 Inkwell 的完整工作手册——同一委托方、同一对标物 OpenWrite v2.0.1。技术栈裁决、6 条硬约束、环境坑表、证据纪律、分批工作方式。
- **何时用**：任何时候。拿不准先查它；它的坑表（§7）每一条都是真金白银换的。
- **writerD 与 Inkwell 的差异**（读副本时别混淆）：
  | 维度 | Inkwell | writerD |
  |---|---|---|
  | 包管理 | pnpm | npm（用 `npm.cmd`） |
  | 样式 | Tailwind 4 | 纯 CSS 设计令牌（`src/styles/`） |
  | 存储 | Markdown + SQLite + keyring | Markdown + shared_preferences.json（对齐真机） |
  | 复刻策略 | 行为对标、允许差异化创新 | **逐字/逐像素对齐真机，不创新** |

### 其它按需加载的本机技能
这些在 `C:\Users\Administrator\.dsh\skills\` 下，DSH 会话会在需要时自动加载：

| 技能 | 何时触发 | 对 writerD 的用途 |
|---|---|---|
| `verification-before-completion` | 声称"完成/修复/通过"前 | 证据红线：先跑验收命令、拿到实测输出再说完成 |
| `systematic-debugging` | 遇到 bug / 测试失败 / 异常行为 | 根因分析，不靠猜（如"窗口空白"→高度链断裂 + 转换器删 CSS） |
| `test-driven-development` / `superpowers-test-driven-development` | 写任何逻辑前 | 回归锁先行（markdown.ts 的 LCS diff 锁、casePreservation 锁） |
| `writing-plans` | 多步任务动代码前 | 把复刻项拆成可验收的小批 |
| `incremental-implementation` | 改动 >1 文件 | 分批落地，每批 tsc+vitest 全绿再提交 |
| `token-triage` | 大库探索 / 读长文档前 | 少读、读准（reference/ 有 161 万字节字符串，必须有策略地查） |
| `dispatching-parallel-agents` / `subagent-driven-development` | ≥2 个独立任务 | 逆向证据扫描、规格提取可并行 |
| `requesting-code-review` / `receiving-code-review` | 完成任务 / 收到评审 | 复刻逐字性适合同行评审 |
| `reverse-skill` | 逆向 / 抓包 / 反编译 | 真机证据提取方法论（app.so 字符串、utf16 池对象） |
| `binary-analysis-patterns` | 分析 exe/dll/so | OpenWrite `app.so` 静态分析 |
| `docx` / `xlsx` / `pptx` / `pdf` | 对应文件格式 | §9 导出 docx 时用 docx 技能的 OOXML 知识 |

---

## 2. 本项目自创的"事实标准"工作法（已沉淀为项目文档，无需外部技能）

| 方法 | 沉淀位置 |
|---|---|
| 契约唯一真源 + ADR 变更流程 | `docs/CONTRACT.md` + `docs/ADR/001-004` |
| 逐字规格带 `文件:偏移` 证据 | `docs/spec/TOOLS.md`、`docs/spec/PREFS.md` |
| 机械转换 + 悬挂选择器守卫（mock→React） | `tools/convert_mock.py` |
| 像素级定标（截图→色板/尺寸三方验证） | `reference/measure_shot*.py`、`crosscheck_mock.py` |
| 端到端实证（mock provider + SendKeys + 会话留证） | `tools/mock_provider.py`、`tools/e2e_chat.ps1` |
| 一键打包 + 桌面快捷方式刷新 | `tools/package.ps1` |

---

## 3. 换机/换窗口后如何恢复技能

**情况 A：还是这台机器（推荐）**
什么都不用装。`C:\Users\Administrator\.dsh\skills\` 是全局的，新 DSH 会话自动可用。只需把 `.agent/skills/inkwell-dev.md` 的内容喂给新 AI（或让它自己读）。

**情况 B：换了机器，但有 DSH**
1. 把本目录 `.agent/` 整个交给新 AI。
2. `inkwell-dev` 技能本体在 `S:\dsh\inkwell` 项目里也有等价物（`D.doctor` 指挥渠道）；如果没有 DSH 技能系统，直接让 AI 把 `.agent/skills/inkwell-dev.md` 当系统提示读即可——它是自包含的。
3. 其它技能（verification-before-completion 等）是通用方法论，可在新环境用 `skill-creator` 技能按 `.agent/METHODS.md` 的描述重建，或直接把 METHODS.md 当工作纪律执行——**这些技能的本质内容都已浓缩进 METHODS.md，不依赖特定平台**。

**情况 C：没有技能系统的裸环境**
读 `.agent/README.md` → `.agent/METHODS.md` → `.agent/skills/inkwell-dev.md`，三份文件包含了全部纪律与方法，可当纯文档执行。
