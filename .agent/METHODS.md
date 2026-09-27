# writerD 构建方法论（上一轮 AI 的实战记录）

> 这不是泛泛的最佳实践清单——每条都附本项目里的真实案例。按此执行即可复现上一轮的工作质量。

---

## 1. 复刻工程的总原则：证据驱动的「三段式」

每一段工作都按这个顺序走：

```
① 取证（reference/）→ ② 定规（docs/CONTRACT.md + docs/spec/）→ ③ 实现 + 实测留证
```

**真实案例**：工具层实现前，先从 127 个真实会话文件（`Documents\openwrite_sessions\`）里提取 1,729 条工具调用结果，归纳出结果 JSON 的字段与形态，写进 `docs/spec/TOOLS.md`（每条带 `文件:偏移`），然后才写 `src/core/tools/exec.ts`。**绝不反过来**——先写代码再去"对齐"，一定会变成自创新。

---

## 2. 逆向取证的四种手法（都已在本项目验证）

| 手法 | 工具 | 产出 |
|---|---|---|
| 字符串提取（ASCII/UTF-16 池对象） | `reference/extract_strings.py`、`extract_utf16_obj.py` | `WIN_app.so.strings.txt`、`utf16_objects_zh.txt` |
| UI 文案聚类 | `reference/filter_zh.py` | `zh_ui_strings.txt`（1,501 条带偏移）、`zh_ui_classified.txt` |
| 像素级测量 | `reference/measure_shot*.py`、`ascii_shot.py` | 色板、尺寸三方验证（截图/mock/配置一致） |
| 真机行为录制 | 运行真机 + 观察落盘文件 | 会话/快照/备忘录/recycle_manifest 格式 |

**关键教训**：`WIN_app.so.strings.txt` 把 ASCII 串硬截断到 400 字节，导致 2 条业务文案被截。AI 生成的长英文串**一律以 `docs/spec/TOOLS.md` 为准**（红线 §8）。

---

## 3. 界面复刻：机械转换，不改一个像素

**流程**：
1. `reference/ui-mock.html`（从真机截图手工复刻的 HTML/CSS，已三方验证）
2. `tools/convert_mock.py` 机械转换为 React TSX（正则替换，**不改尺寸/色值**）
3. 转换产物 `src/styles/screens.css` **禁止手改**——要加样式去 `base.css`
4. 转换器有"悬挂选择器碎片"守卫（防止正则误删规则后静默通过）

**真实案例（ADR-001 空窗缺陷）**：转换器正则误删 4 条 CSS 规则 + `.win-frame` 高度链断裂 → 窗口只剩 48px 标题栏。修复方式不是改 screens.css，而是在 `base.css` 补齐 `.app-shell .win-frame` 尺寸链。**教训：mock 转换层与自有样式层严格分离。**

---

## 4. 数据格式：逐字节对齐真机

| 格式 | 对齐级别 | 证据 |
|---|---|---|
| 新建作品三件套 + manifest | 逐字节 | 与真机产物 diff |
| 会话文件 + index.json | 逐字 | `store/session.ts` 对照真实会话 |
| 快照 | 逐字 | `store/snapshot.ts` |
| 维护文档回写 | 只 append / 节内替换 | `store/markdown.ts` LCS diff 回归锁 |
| ID / 时间戳 | 逐字格式（微秒 6 位） | `core/ids.ts` |

**novel_projects 键的坑**：真机里它是 `\n` 分隔的绝对路径文本，**不是 JSON**——`prefs.ts` 的 `JSON_KEYS` 集合里特意排除它。这类"看起来应该是 JSON 但不是"的键，只有看真机配置文件才能发现。

---

## 5. 配置层：与真机同构

- 键名保留 `flutter.` 前缀，配置文件与真机**同构**——用户可以直接把 OpenWrite 的 `shared_preferences.json` 拿过来用。
- 商业化键（vip_* / device_id）**读到也忽略、永不写出**（`prefs.ts` 的 `CUT_KEYS`）。
- **BOM 容错**：Windows PowerShell 写 JSON 会带 UTF-8 BOM，`JSON.parse` 直接抛错 → 整份配置被静默忽略。`parsePrefs` 先剥 BOM。这个坑曾导致"配置没生效"的误判，排查了半天。

---

## 6. AI 层：双协议 + 逐字事件名

- `protocol.ts` 同时构造 OpenAI 兼容与 Anthropic 兼容请求（`use_anthropic_format` 开关），SSE 解析是显式状态机。
- **工具调用的流式分片拼装**：mock provider 故意把 arguments JSON 拆成 3 片发送，验证拼装逻辑——这是端到端实证的一部分，不是单元测试的点缀。
- 事件名（`ai_run_started` 等 7 个）逐字对齐真机，因为界面渲染按事件名分发。
- 错误文案 9 条逐字（HTTP 状态 + 响应体分类），只有单测覆盖，**未在真实端点验证过**——这是诚实清单里明确标注的缺口。

---

## 7. 端到端实证的标准做法

```
tools/mock_provider.py 8899   （本地 OpenAI 兼容 SSE，剧本化响应）
+ tools/e2e_chat.ps1          （写配置 → 启动 exe → 点击 → SendKeys → 截屏）
+ 检查 Documents\writerd_sessions\ 的真实落盘
```

**证据 = 会话文件原文**，逐字引用在交接报告 §4。注意两个已知缺陷：SendKeys 吞字（"List chapters"→"LISt"）、截屏前缺 `SetForegroundWindow` 会拿到白图。

**为什么用 mock 不用真实端点**：可重复、确定性、不烧额度、能精确控制分片边界。真实端点验证留给委托方提供的 key 手动做——且 key 绝不入库。

---

## 8. 分批推进 + 原子提交

每批工作：
1. 动代码前先想清楚：这批的验收命令是什么？
2. 改完跑 `tsc --noEmit` + `vitest run`（必须全绿）
3. 原子提交，提交信息写清**做了什么 + 验证结果**
4. 交接报告同步更新（它是唯一入口，不能过期）

**git 提交历史就是工作日志**：
```
ea2c064 Rust 能力层 + 维护文档行级编辑（格式优先回归锁）
c9171e2 配置模型 + 作品目录协议（55 tests）
6d997cc 界面接真数据 + 启动层 + 快照 + CONTRACT 逐字性更正
936d684 AI 接入层 + 工具调度循环 + 对话界面 + 交接清理
385f403 设置屏接线：AI 提供商 + 参数分节数据驱动化
28fc813 交接清理：删 target/dist/重复 logo，更新交接报告
```

---

## 9. 诚实清单纪律

- 交接报告 §5 按「阻断性 / 功能缺口 / 小缺陷」三级如实列出，**包括自己刚做的东西的缺陷**（例：设置屏表单样式是新增外推，非 mock 逐像素来源——已如实标注）。
- 「完成」的定义 = 有当场实测输出。计划做的、做了没验证的，都不算完成。
- 不知道的事标 `[待实测]`，绝不用常识补全（CONTRACT 的 NOT FOUND 清单就是合法的"未知项"）。

---

## 10. 环境操作速查（Windows PowerShell 5.1）

```powershell
# 闸门（每次声称完成前必跑）
.\node_modules\.bin\tsc.cmd --noEmit
.\node_modules\.bin\vitest.cmd run

# 打包（首次 cargo 全量编译 10-15 分钟）
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\package.ps1

# 截图验证渲染
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\capture.ps1

# 端到端对话实证
python tools\mock_provider.py 8899   # 先开这个
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\e2e_chat.ps1
```

**绝不**：用 PowerShell 的 `Set-Content`/`Add-Content`/`>` 写中文源码或 JSON（BOM/GBK 双重陷阱，不可逆）。
**永远**：用文件工具（write/edit）改源码；`.ps1` 脚本保持纯 ASCII（或 UTF-8 带 BOM）。
