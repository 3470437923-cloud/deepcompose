# ADR-004 CONTRACT 逐字性更正（依 TOOLS.md 全量复核）

- 状态：已采纳
- 日期：2026-09-28
- 证据：`docs/spec/TOOLS.md`（1,227 行，逐字提取，每条带 `文件:偏移`）
- 触发：工具层规格提取时发现 CONTRACT 有 **5 条转述性伪逐字引用**——原文在二进制里不存在。

## 更正清单（CONTRACT 引用 → 实际）

| # | CONTRACT 的位置与引文 | 复核结论 | 处理 |
|---|---|---|---|
| 1 | §4.1 `file_write` 行「文案 `直接调用 file_write 工具`」 | NOT FOUND。实际存在的相邻句是 `交互式编辑器，请用 file_write 工具写文件` | 更正 |
| 2 | §4.1 `create_skill` 行「文案 `create_skill 工具保存`」 | NOT FOUND，无此句式 | 更正 |
| 3 | §4.1 `update_skill` 行「文案 `update_skill 更新`」 | NOT FOUND，无此句式 | 更正 |
| 4 | §4.1 `question` 行「文案 `使用 question 工具询问`」 | NOT FOUND，完整句不存在 | 更正 |
| 5 | §4.5「命中高危词表时的确认理由（逐字）：`【高危命令】命中内置风险词表…`」 | 连子串「高危命令」「内置风险词表」都零命中 | 更正 |

> 同节另一条 `（无白名单条目，添加后 AI 执行时不再确认）` 经复核**存在**
> （`app_so_full_utf16.txt:002dbcc8`），保留。

## 同时确认的三件事实（写入实现口径）

1. **默认系统提示词可逐字恢复**：116 字，位于 `app.so` 原始字节 `0x002498f0..0x002499d8`。
   但依 CONTRACT §6 红线（不复制对标产品提示词原文），writerD **自写语义等价的提示词**，
   见 `src/core/prefs.ts` 的 `DEFAULT_SYSTEM_PROMPT` 及其注释。**不搬运原文。**
2. **尾随 `r` 是提取伪影，不是文案内容**：全库有 179 条「句子+r」，含大量 Flutter 框架串
   （`Assertion failedr`、`Payment Requiredr`…）。实现时**一律不带 `r`**。
   故 CONTRACT §4.2 的 `path is required` 等 13 条校验文案**按不带 r 实现**。
3. **`reference/WIN_app.so.strings.txt` 把 ASCII 串硬截断到 400 字节**（`extract_strings.py` 的
   `{2,400}` 正则），实际影响 2 条业务文案：`terminal` 工具描述（真实 612 字符，缺中间 211）、
   `create_skill` 的 `resources` 参数描述（真实 433，缺尾 32）。
   补齐后的全文在 `TOOLS.md`；**后续凡引用长英文串，以 `TOOLS.md` 为准，不再以 reference 的 strings 文件为准。**

## 决定

1. 在 CONTRACT §4.1、§4.5 就地加「更正」标记，指向本 ADR 与 `TOOLS.md`。
2. 建立口径优先级：**原始二进制偏移 > `docs/spec/*.md`（逐字提取）> `docs/CONTRACT.md`（契约汇编）**。
   CONTRACT 仍是「唯一接口真源」，但凡与逐字证据冲突，以逐字证据为准并回写 CONTRACT。
3. 工具实现（下一批）以 `TOOLS.md` 的 §2/§3 为准；`TOOLS.md` §6 的 NOT FOUND 清单即"未知项"，
   **不得用常识补全**。
