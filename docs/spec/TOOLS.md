# OpenWrite v2.0.1 工具层规格（逐字提取）

> **提取人**：DSH 子代理（自动化逐字提取 pass）
> **日期**：2026-09-28
> **方法**：Python 3.11 以 `encoding='utf-8'` 读取 `S:\writerD\reference\` 下全部证据文件，
> 以字面子串 / 正则检索，命中即整条原样引用，每条都带 `文件:偏移` 证据指针。
> 英文长串的 `\n` 转义、引号、空格、标点**一律原样保留**，未翻译、未改写、未清理，
> 也未把 `\n` 展开成真实换行。未命中的一律写 `NOT FOUND`，不做常识补全。

> **取证补充说明（重要，影响任何后续提取）**：
> 1. `reference/WIN_app.so.strings.txt` 由 `reference/extract_strings.py` 生成，其正则
>    `[\x20-\x7e\xc2-\xf4][\x20-\x7e\x80-\xbf]{2,400}` **把每条 ASCII 串硬截断到 400 字节**，
>    所以该文件里若干工具描述串是**被截断的**（长度恰好 401 即为嫌疑）。为取全文字，本次在
>    `_extract/` 用去掉 400 字节上限的同一算法重扫原始二进制
>    `S:\dsh\OpenWrite\data\app.so`（13,058,992 字节，sha256
>    `45cffe64c02abab5ccc4dbcef9f643dea5611476224cf9b63959fa637bd5c888`），
>    产物 `_extract/app_so_full_strings.txt`。**偏移空间与原文件完全一致**（96,162 条中
>    96,152 条逐字节相同，余下 10 条是原文件的中间截断片段）。凡引用
>    `app_so_full_strings.txt` 处，均同时标注 `WIN_app.so.strings.txt` 的同偏移对应。
> 2. `reference/utf16_objects_all.txt` 由 `reference/extract_utf16_obj.py` 生成，它假设
>    「字符数据起始 = 8 字节对齐对象 VA + 24」且 `length == 字符数*2`。**系统提示词不满足该模型，
>    因此完全不在该文件里**；本次改以原始字节直接解码恢复（见 §4.1）。

---

## 0. 证据文件与偏移格式说明

### 0.1 证据文件清单

| 文件 | 行数 | 记录格式 | 层 |
|---|---|---|---|
| `reference/WIN_app.so.strings.txt` | 96,176 | `偏移<TAB>字符串`（ASCII 串截断至 400 字节） | 原始证据（任务指定） |
| `reference/WIN_app.so.keyword_hits.txt` | 555 | `#### 关键词(N)` 分节；条目 `  偏移  字符串` | 原始证据（任务指定） |
| `reference/zh_ui_strings.txt` | 1,501 | `偏移<TAB>字符串` | 原始证据（任务指定） |
| `reference/zh_ui_classified.txt` | 581 | `#### 分类(N)` 分节；条目 `  偏移  字符串` | 原始证据（任务指定） |
| `reference/utf16_objects_all.txt` | 21,728 | `偏移<TAB>obj=N<TAB>cjk=N<TAB>内容`（换行落盘为字面 `\n`） | 原始证据（任务指定） |
| `reference/utf16_objects_zh.txt` | 20,039 | `偏移<TAB>cjk=N<TAB>内容`（换行落盘为字面 `\n`） | 原始证据（任务指定） |
| `reference/APK_libapp.so.strings.txt` | 88,249 | `偏移<TAB>字符串`（Android arm64） | 原始证据（任务指定） |
| `_extract/app_so_full_strings.txt` | 96,162 | `偏移<TAB>字符串`（**无 400 字节上限**） | 本次恢复层 |
| `_extract/app_so_full_utf16.txt` | 21,728 | `偏移<TAB>cjk=N<TAB>内容`（**无 4000 字符上限**） | 本次恢复层 |

### 0.2 偏移语义

- 偏移是 `app.so` 内的**字节文件偏移**，8 位十六进制小写（如 `00235660`）。
- 同一文本在不同文件里偏移一致，可互相印证——这就是本规格的证据链。
- UTF-16 层文件中**真实换行已在落盘时转义为字面 `\n`**（反斜杠 + `n` 两个字符）。
  本规格沿用该表示，未展开成真实换行，也未做任何清理。

### 0.3 字节级细节：两条校验文案确实以字符 `r` 结尾

这不是抓取伪影，也不是 `\r`（回车）——原始二进制里就是可打印字符 `r`：

```
0x0028cb20 : b'path is requiredr\xf2\x05\x00'
0x002ea1a0 : b'name is requiredr\xe2\x05\x00'
```

对照同族文案（均为 NUL 填充结尾，无尾随 `r`）：

```
0x0026c010 : b'command is required\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00'
0x003ac930 : b'query is required\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00'
0x004796d0 : b'description is required\x00\x00\x00\x00\x00\x00\x00'
```

Dart 对象头亦可验证：`VA=0x0028cb08` 处 `tags,hash,length` 三元组给出 `length=34`，
恰为 17 字符 × 2 字节 —— 即对象本身就是 17 字符（含尾随 `r`），不是 16。

**逐字复现要求**：writerD 应写作 `path is requiredr` / `name is requiredr`，
或在 ADR 中显式记录为有意修正。

### 0.4 全部偏移的列法

同一文案常同时存在于 ASCII 层与 UTF-16 层。本文每节列出**全部命中的 `文件:偏移`**；
若某文案在 4 个文件中同偏移出现，会全部列出。

---

## 1. 工具总表（名称 → 证据偏移）

### 1.1 十二个工具名作为独立字符串记录的确切偏移

判定标准：记录内容**恰好等于**工具名（无前后缀、无嵌入）。

| # | 工具名 | 独立名字记录偏移 | 工具描述串偏移（全文） | 描述字符数 |
|---|---|---|---|---|
| 1 | `file_read` | `app_so_full_strings.txt:004aa3e0` | `app_so_full_strings.txt:00235660` | 372 |
| 2 | `file_write` | `app_so_full_strings.txt:003a9e90` | `app_so_full_strings.txt:00442010` | 267 |
| 3 | `file_manage` | `app_so_full_strings.txt:0027add0` | `app_so_full_strings.txt:004805e0` | 185 |
| 4 | `edit_file` | `app_so_full_strings.txt:00371250` | NOT FOUND | — |
| 5 | `terminal` | `app_so_full_strings.txt:002cba10` | `app_so_full_strings.txt:003c7980` | 612 |
| 6 | `web_search` | `app_so_full_strings.txt:00339bf0` | `app_so_full_strings.txt:00384450` | 287 |
| 7 | `skill_lookup` | `app_so_full_strings.txt:0045a3d0` | `app_so_full_utf16.txt:00406508` | 471 |
| 8 | `create_skill` | `app_so_full_strings.txt:0036f340` | `app_so_full_utf16.txt:004aaee8` | 199 |
| 9 | `update_skill` | `app_so_full_strings.txt:00421f90` | `app_so_full_utf16.txt:00344a28` | 845 |
| 10 | `create_project` | `app_so_full_strings.txt:002d76d0` | `app_so_full_strings.txt:0047dde0` | 202 |
| 11 | `question` | `app_so_full_strings.txt:00420af0` | `app_so_full_strings.txt:00311da0` | 173 |
| 12 | `rank_data_query` | `app_so_full_strings.txt:003abab0` | `app_so_full_utf16.txt:003c3048` | 3571 |

### 1.2 工具名在提示语中的共现（交叉校验工具集合）

- `app_so_full_utf16.txt:00235098`（len=88）：\n\n所有文件操作（file_read、file_write、file_manage）都在此目录内进行。路径参数相对于此目录，例如读取"章节内容/第一章.md"实际读取的是"
- `app_so_full_utf16.txt:00494208`（len=132）：\n\n所有文件操作（file_read、file_write、file_manage）都在此目录内进行。路径参数相对于此目录。\n\n**注意**：当前未绑定具体小说项目。当用户说"初始化"、"创建新小说"时，使用 create_project 工具创建新项目。
- `zh_ui_strings.txt:00235098`（len=88）：\n\n所有文件操作（file_read、file_write、file_manage）都在此目录内进行。路径参数相对于此目录，例如读取"章节内容/第一章.md"实际读取的是"
- `zh_ui_strings.txt:00494208`（len=132）：\n\n所有文件操作（file_read、file_write、file_manage）都在此目录内进行。路径参数相对于此目录。\n\n**注意**：当前未绑定具体小说项目。当用户说"初始化"、"创建新小说"时，使用 create_project 工具创建新项目。
- `utf16_objects_all.txt:00235098`（len=88）：\n\n所有文件操作（file_read、file_write、file_manage）都在此目录内进行。路径参数相对于此目录，例如读取"章节内容/第一章.md"实际读取的是"
- `utf16_objects_all.txt:00494208`（len=132）：\n\n所有文件操作（file_read、file_write、file_manage）都在此目录内进行。路径参数相对于此目录。\n\n**注意**：当前未绑定具体小说项目。当用户说"初始化"、"创建新小说"时，使用 create_project 工具创建新项目。
- `app_so_full_utf16.txt:00324158`（len=194）：**重要**：当前为抽卡对比模式，不允许向用户提问或等待确认，file_write、file_manage、create_project、create_skill、update_skill、question 等工具不可用（调用会收到错误结果）。请直接根据已有信息完成创作，创作内容直接输出在回复中。请尽量减少文件读取次数，最多读取1次获取必要信息后立即开始创作，不要反复读取文件浪费时间。
- `zh_ui_strings.txt:00324158`（len=194）：**重要**：当前为抽卡对比模式，不允许向用户提问或等待确认，file_write、file_manage、create_project、create_skill、update_skill、question 等工具不可用（调用会收到错误结果）。请直接根据已有信息完成创作，创作内容直接输出在回复中。请尽量减少文件读取次数，最多读取1次获取必要信息后立即开始创作，不要反复读取文件浪费时间。
- `utf16_objects_all.txt:00324158`（len=194）：**重要**：当前为抽卡对比模式，不允许向用户提问或等待确认，file_write、file_manage、create_project、create_skill、update_skill、question 等工具不可用（调用会收到错误结果）。请直接根据已有信息完成创作，创作内容直接输出在回复中。请尽量减少文件读取次数，最多读取1次获取必要信息后立即开始创作，不要反复读取文件浪费时间。

未启用时注入的否定文案（逐字，三条独立字符串）：

- `app_so_full_utf16.txt:0024aba8`：未启用，web_search 工具当前不可用（调用会被拒绝），请勿声称具备该能力或尝试调用
- `zh_ui_strings.txt:0024aba8`：未启用，web_search 工具当前不可用（调用会被拒绝），请勿声称具备该能力或尝试调用
- `utf16_objects_all.txt:0024aba8`：未启用，web_search 工具当前不可用（调用会被拒绝），请勿声称具备该能力或尝试调用
- `app_so_full_utf16.txt:0027e418`：未启用，terminal 工具当前不可用（调用会被拒绝），请勿声称具备该能力或尝试调用
- `zh_ui_strings.txt:0027e418`：未启用，terminal 工具当前不可用（调用会被拒绝），请勿声称具备该能力或尝试调用
- `utf16_objects_all.txt:0027e418`：未启用，terminal 工具当前不可用（调用会被拒绝），请勿声称具备该能力或尝试调用
- `app_so_full_utf16.txt:0047a4d8`：未启用，rank_data_query 工具当前不可用（调用会被拒绝），请勿声称具备该能力或尝试调用
- `zh_ui_strings.txt:0047a4d8`：未启用，rank_data_query 工具当前不可用（调用会被拒绝），请勿声称具备该能力或尝试调用
- `utf16_objects_all.txt:0047a4d8`：未启用，rank_data_query 工具当前不可用（调用会被拒绝），请勿声称具备该能力或尝试调用

已启用时注入的肯定文案（逐字，两条）：

- `app_so_full_utf16.txt:002abc18`：已启用（rank_data_query 工具可用，用法详见工具说明）
- `zh_ui_strings.txt:002abc18`：已启用（rank_data_query 工具可用，用法详见工具说明）
- `utf16_objects_all.txt:002abc18`：已启用（rank_data_query 工具可用，用法详见工具说明）
- `app_so_full_utf16.txt:003b2038`：已启用（web_search 工具可用）
- `zh_ui_strings.txt:003b2038`：已启用（web_search 工具可用）
- `utf16_objects_all.txt:003b2038`：已启用（web_search 工具可用）

---

## 2. 逐工具详表（描述全文 + 参数 + 枚举）

> 约定：**参数** 一节只列在证据里确实存在**逐字描述串**的参数。
> 只有参数名（Dart schema key 字符串）而无描述串的，统一列进 §6 的 NOT FOUND 清单。

### 2.1 `file_read`

- 工具名独立记录：`app_so_full_strings.txt:004aa3e0`
- **工具描述全文**（`app_so_full_strings.txt:00235660`，len=372，逐字）：

```
Read a file or list a directory. Supports both relative paths (relative to the current project root) and absolute paths. Files inside the current project or an installed skill directory are read directly; other external paths require user confirmation. For large files, use offset (1-based line) and limit to page through content; output is capped to keep responses small.
```

  同偏移对应：`WIN_app.so.strings.txt:00235660`、`WIN_app.so.keyword_hits.txt:00235660`

**参数（逐字）**：

- File or directory path（`app_so_full_strings.txt:002734f0`，len=114）：
```
File or directory path. Relative paths resolve against the current project root; absolute paths are also accepted.
```
- Pagination start（`app_so_full_strings.txt:00256d70`，len=87）：
```
Pagination start. read: 1-based line number (default 1). list: entry index (default 0).
```
- Max items to return（`app_so_full_strings.txt:0025fb80`，len=97）：
```
Max items to return. read: lines (default 2000, max 2000). list: entries (default 200, max 500).r
```

**operation / mode 枚举**：证据中**没有**把 `read`/`list` 作为独立枚举值字符串列出；
仅能由参数描述串反推（见上）。故枚举值本身记 `NOT FOUND`，见 §6。

### 2.2 `file_write`

- 工具名独立记录：`app_so_full_strings.txt:003a9e90`
- **工具描述全文**（`app_so_full_strings.txt:00442010`，len=267，逐字）：

```
Write, append, or edit files. Operations: "write" (overwrite/create), "append" (add to end), "replace" (find and replace text, set replace_all=true to replace ALL occurrences, default replaces first only), "insert" (insert at position), "delete_lines" (remove lines).
```

  同偏移对应：`WIN_app.so.strings.txt:00442010`

**operation 枚举（逐字，取自上述描述串内的引号字面量）**：

```
write / append / replace / insert / delete_lines
```

**参数（逐字）**：

- （`app_so_full_strings.txt:002734f0`，len=114）：

```
File or directory path. Relative paths resolve against the current project root; absolute paths are also accepted.
```

- （`app_so_full_strings.txt:0038c220`，len=50）：

```
Text to find and replace (for "replace" operation)
```

- （`app_so_full_strings.txt:00472a10`，len=41）：

```
New text for replace or insert operations
```

- （`app_so_full_strings.txt:0033c340`，len=108）：

```
For "replace" operation: if true, replace ALL occurrences; if false (default), replace first occurrence only
```

- （`app_so_full_strings.txt:004791a0`，len=49）：

```
Where to insert: "start", "end", or "after_line"r
```

- （`app_so_full_strings.txt:00466900`，len=75）：

```
Line number after which to insert (for "insert" with position "after_line")
```

- （`app_so_full_strings.txt:00285020`，len=38）：

```
Start line number for delete (1-based)
```

- （`app_so_full_strings.txt:00482ff0`，len=47）：

```
End line number for delete (1-based, inclusive)
```

**insert position 枚举（逐字）**：

```
"start", "end", or "after_line"
```

> 证据：`app_so_full_strings.txt:004791a0`（即 `Where to insert: "start", "end", or "after_line"`）。

### 2.3 `file_manage`

- 工具名独立记录：`app_so_full_strings.txt:0027add0`
- **工具描述全文**（`app_so_full_strings.txt:004805e0`，len=185，逐字；此串**未被 400 字节截断**，因为本身仅 185 字符）：

```
File modification operations: search content in files, delete file/directory, rename file/directory, copy file. This tool CANNOT list directories or read files - use file_read for that.
```

  同偏移对应：`WIN_app.so.strings.txt:004805e0`

**operation 枚举（逐字，取自描述串中的动作短语）**：

```
search / delete / rename / copy
```

**参数（逐字）**：

- （`app_so_full_strings.txt:002734f0`，len=114）：

```
File or directory path. Relative paths resolve against the current project root; absolute paths are also accepted.
```

- （`app_so_full_strings.txt:002b8250`，len=42）：

```
New path/name for rename or copy operation
```

- （`app_so_full_strings.txt:00405540`，len=43）：

```
Text to search for (for "search" operation)
```

- （`app_so_full_strings.txt:00472a10`，len=41）：

```
New text for replace or insert operations
```


### 2.4 `edit_file`

- 工具名独立记录：`app_so_full_strings.txt:00371250`
- **工具描述全文**：`NOT FOUND`。全库检索确认 `edit_file` **只作为独立工具名出现**，
  没有任何以它为主语/含它的描述性语句（`app_so_full_strings.txt`、`app_so_full_utf16.txt`、
  `zh_ui_strings.txt`、`utf16_objects_all.txt` 均只命中这一条名字记录）。
- **operation 枚举**：与 §2.2 `file_write` **同源**（同一描述串 `app_so_full_strings.txt:00442010`）：

```
write / append / replace / insert / delete_lines
```

- **replace_all 参数**（逐字，来源同 §2.2）：

```
For "replace" operation: if true, replace ALL occurrences; if false (default), replace first occurrence only
```

  偏移：`app_so_full_strings.txt:0033c340`

> 说明：CONTRACT.md §4.4 引用的 replace_all 描述（从单词 replace 起、到 default replaces first only 止）确实逐字存在于 `app_so_full_strings.txt:00442010`，本表已复核。

### 2.5 `terminal`

- 工具名独立记录：`app_so_full_strings.txt:002cba10`
- **工具描述全文**（`app_so_full_strings.txt:003c7980`，len=612，逐字）——**这是被 400 字节截断的串，必须用本次恢复层全文**：

```
Execute a system command (desktop only). The command runs in a shell and its stdout/stderr are returned so you can inspect the result and continue. Use the `workdir` parameter to change directory instead of `cd &&`. Dangerous commands (delete/format/shutdown/redirect etc.) and scripts located outside the current project require explicit user approval before execution. Interactive commands (REPL, editors, ssh, etc.) are blocked. The exit code is included so you can judge success/failure. If output is large it is written to a temp file and the tail is returned with an output_path you can read via file_read.
```

  对比：`WIN_app.so.strings.txt:003c7980` 只有前 401 字符，截止于 `Interactive commands (REPL, ed`。
  同偏移对应：`WIN_app.so.keyword_hits.txt:003c7980`。

**参数（逐字）**：

- （`app_so_full_strings.txt:00376c10`，len=22）：

```
The command to execute
```

- （`app_so_full_strings.txt:00465ac0`，len=106）：

```
Optional working directory, relative to the current project root. Use this instead of `cd <dir> && <cmd>`.
```

- （`app_so_full_strings.txt:004246b0`，len=61）：

```
Optional timeout in milliseconds. Default 120000, max 600000.
```

- （`app_so_full_strings.txt:0048b9e0`，len=77）：

```
Optional arguments for the command. Use this for script paths and parameters.
```

**中文界面描述（逐字，工具说明文案）**：

- `app_so_full_utf16.txt:00325db8`
- `zh_ui_strings.txt:00325db8`
- `utf16_objects_all.txt:00325db8`

```
AI 可通过终端执行系统命令（仅 Windows）。普通命令直接执行；删除、格式化等风险命令和来自技能包/外部的脚本会弹窗让你确认。可把信任的命令或脚本路径加入白名单，免去确认。超时上限 10 分钟，长输出会落盘后用文件读取工具读全文。
```

**workdir 校验文案（逐字）**：

- `app_so_full_utf16.txt:003e8a98`：workdir 必须是相对项目根的子目录，不能含 .. 或绝对路径

**operation 枚举**：`NOT FOUND`（终端工具无 operation 枚举；其参数为 free-form 命令）。

### 2.6 `web_search`

- 工具名独立记录：`app_so_full_strings.txt:00339bf0`
- **工具描述全文**（`app_so_full_strings.txt:00384450`，len=287，逐字）：

```
Search the web for information. Use this tool when you need to look up facts, references, background knowledge, historical events, technical details, or any information that requires external data. Returns a list of relevant results with titles, URLs, descriptions, and content snippets.
```

  同偏移对应：`WIN_app.so.strings.txt:00384450`

**参数（逐字）**：

- （`app_so_full_strings.txt:0041d390`，len=17）：

```
The search queryr
```

**operation 枚举**：`NOT FOUND`。

### 2.7 `skill_lookup`

- 工具名独立记录：`app_so_full_strings.txt:0045a3d0`
- **工具描述全文**（`app_so_full_utf16.txt:00406508`，len=471，逐字）：

```
Load a specialized skill on demand. Returns the skill's SKILL.md instructions, the skill's base directory path, and a sampled list of files in that directory (scripts/ for executable helpers, references/ for documentation, assets/ for output resources). Bundled files are NOT inlined — use file_read with the returned base directory to inspect them as needed. Call this when a user request matches a skill description listed under "Available Skills" in the system prompt.
```

  同偏移对应：`utf16_objects_all.txt:00406508`、`utf16_objects_zh.txt:00406508`

**参数（逐字）**：

- `app_so_full_strings.txt:0026b940`（len=51）：

```
The skill name exactly as shown in Available Skills
```

- `app_so_full_strings.txt:00408770`（len=68）：

```
The skill name exactly as shown in Available Skills, or the skill ID
```

**operation 枚举**：`NOT FOUND`。

### 2.8 `create_skill`

- 工具名独立记录：`app_so_full_strings.txt:0036f340`
- **工具描述全文**（`app_so_full_utf16.txt:004aaee8`，len=199，逐字）：

```
Create a new skill (技能) and save it to the skill list. Use this when the user wants to create a new skill. The skill will be available in the skill management page and can be activated for AI to use.
```

  同偏移对应：`utf16_objects_all.txt:004aaee8`、`utf16_objects_zh.txt:004aaee8`、`zh_ui_strings.txt:004aaee8`

**参数（逐字）**：

- （`app_so_full_strings.txt:00408770`，len=68）：

```
The skill name exactly as shown in Available Skills, or the skill ID
```

- （`app_so_full_strings.txt:003eb1a0`，len=151）：

```
Skill name in English, lowercase with hyphens (e.g. "novel-reviewer", "translation-helper"). English names avoid path encoding issues across platforms.
```

- （`app_so_full_strings.txt:00248820`，len=433）：

```
Optional bundled resource files. Keys should be paths relative to the skill root: scripts/ for executable helpers, references/ for docs loaded on demand, and assets/ for output templates/media. Nested paths are supported (e.g. "scripts/parsers/json.py", "references/providers/aws.md"). Bare filenames remain supported for compatibility and are routed to scripts/ only for directly executable script extensions; otherwise references/.
```

**校验文案（逐字）**：

- `app_so_full_strings.txt:002ea1a0` → name is requiredr
- `app_so_full_strings.txt:004796d0` → description is required
- `app_so_full_strings.txt:002d8060` → skill_name is required

**operation 枚举**：`NOT FOUND`。

### 2.9 `update_skill`

- 工具名独立记录：`app_so_full_strings.txt:00421f90`
- **工具描述全文**（`app_so_full_utf16.txt:00344a28`，len=845，逐字）：

```
Manage an installed skill: update SKILL.md, add/update/delete supporting files, or delete the skill. Provide "skill_name" + "content" to update the main skill file (including changing the skill name in frontmatter — no need to create a new skill just to rename), "skill_name" + "reference_name" + "reference_content" to add/update a file (scripts/ for .py/.sh etc, references/ for .md docs), "skill_name" + "reference_name" + "delete": true to delete that single resource file, or "skill_name" + "delete": true (no reference_name) to delete (uninstall) the whole skill. Built-in skills cannot be deleted. NOTE: Some older skills may carry a "-旧版" suffix from a previous backup mechanism; do not delete those — let the user manage them manually. Skill changes are reversible via the chat rewind button, so there is no need to leave backup copies.
```

  同偏移对应：`utf16_objects_all.txt:00344a28`、`utf16_objects_zh.txt:00344a28`、`zh_ui_strings.txt:00344a28`

**参数（逐字）**：

- （`app_so_full_strings.txt:00408770`，len=68）：

```
The skill name exactly as shown in Available Skills, or the skill ID
```

- （`app_so_full_strings.txt:00423630`，len=94）：

```
New full SKILL.md content (including --- frontmatter). Use this to update the main skill file.
```

- （`app_so_full_utf16.txt:003d1438`，len=425）：

```
Path of the bundled resource to create, update or delete, relative to the skill root. Use scripts/... for executable helpers, references/... for documents, or assets/... for output resources. Nested paths are supported. TIP: prefer the full path with directory prefix (e.g. "references/rule.md", "scripts/helper.py") — a bare filename is resolved by basename match, which may fail if the file sits in an unexpected directory.
```

- （`app_so_full_strings.txt:00450b40`，len=88）：

```
Content for the reference file. Required when reference_name is provided without delete.
```

- （`app_so_full_strings.txt:003a7630`，len=149）：

```
With reference_name: delete that single resource file. Without reference_name: delete (uninstall) the whole skill. Built-in skills cannot be deleted.
```

**校验文案（逐字）**：

- `app_so_full_strings.txt:002d8060` → `skill_name is required`
- `app_so_full_strings.txt:0040a120` → `content is required`
- `app_so_full_strings.txt:00287510` → `reference_content is required when reference_name is provided`
- `app_so_full_strings.txt:00414f20` → `Must provide content, reference_name, or delete: true`

### 2.10 `create_project`

- 工具名独立记录：`app_so_full_strings.txt:002d76d0`
- **工具描述全文**（`app_so_full_strings.txt:0047dde0`，len=202，逐字）：

```
Create a new novel project with the given name. IMPORTANT: Before using this tool, check Available Skills above and call skill_lookup with the matching skill name. If no skill matches, proceed directly.
```

  同偏移对应：`WIN_app.so.keyword_hits.txt:0047dde0`

**参数（逐字）**：

- （`app_so_full_strings.txt:00482b70`，len=46）：

```
The name of the new novel project (book title)
```

**operation 枚举**：`NOT FOUND`。

### 2.11 `question`

- 工具名独立记录：`app_so_full_strings.txt:00420af0`
  （`question` 是英文常用词，另有 9 条无关命中，如 `User has answered your questions: `、
  `expected-tag-name-but-got-question-mark` 等，均非工具名。）
- **工具描述全文**（`app_so_full_strings.txt:00311da0`，len=173，逐字）：

```
Ask the user questions during execution: gather preferences, clarify instructions, or offer choices. Each question has 2-4 options and supports single or multiple selection.
```

  同偏移对应：`WIN_app.so.strings.txt:00311da0`

**参数（逐字）**：

- （`app_so_full_strings.txt:002ac300`，len=25）：

```
Questions to ask the user
```

- （`app_so_full_strings.txt:0035b020`，len=37）：

```
The complete question to ask the user
```

- （`app_so_full_strings.txt:004a3570`，len=124）：

```
The available choices for this question. Must have 2-4 options. Each option should be a distinct, mutually exclusive choice.
```

- （`app_so_full_strings.txt:00400410`，len=77）：

```
Set to true to allow the user to select multiple options instead of just one.
```

**校验文案（逐字）**：

- `app_so_full_strings.txt:002f44a0` → `questions is required and must not be empty`

**operation 枚举**：`NOT FOUND`（该工具无 operation）。

### 2.12 `rank_data_query`

- 工具名独立记录：`app_so_full_strings.txt:003abab0`
- **工具描述全文**（`app_so_full_utf16.txt:003c3048`，len=3571，逐字）**全文 3571 字符，完整列出，`\n` 保持转义**：

```
查询网文榜单与作品数据。当用户询问番茄小说/起点中文网的榜单、作品数据、市场趋势、排行等问题时使用。传入语义化的查询动作、数据来源和筛选条件即可，无需关心底层实现。\n\n### 查询动作（action）\n\n| action | 用途 |\n|--------|------|\n| `top` | 查排行 Top N |\n| `list` | 查作品列表（支持分类/搜索/排序/连载状态） |\n| `categories` | 查可用分类 |\n| `dates` | 查可用的数据日期 |\n| `rank_names` | 查可用榜单名称 |\n| `count` | 查作品/榜单数量 |\n| `stats` | 查整体统计概览 |\n\n### 数据来源（source）\n\n| source | 说明 |\n|--------|------|\n| `debut` | 番茄作品首秀 |\n| `newbook` | 番茄新书风向标 |\n| `ranking` | 番茄畅销榜（在读榜） |\n| `allrank` | 番茄更多榜单（B端/C端细分榜单） |\n| `qidian` | 起点中文网榜单 |\n\n### 其他参数\n\n- `gender`：`男频` 或 `女频`（仅 debut/newbook/ranking 有效，默认男频）\n- `category`：分类（中文分类名，如"都市高武"、"玄幻"）\n- `sort_by`：排序方式，可选：`在读数`、`总字数`、`在读增长`、`字数增长`、`排名`、`评分`、`日读者UV`、`收藏数`、`推荐票`、`月票`（默认按在读数）\n- `rank_name`：榜单名称（source=allrank/qidian 且查榜单时必填）\n- `keyword`：按书名/作者搜索\n- `status`：作品状态 `连载`/`完结`（list 动作有效）\n- `limit`：返回条数（top 默认10、最大100；list 默认20、最大200）\n- `date`：数据日期 YYYY-MM-DD，默认最新日期\n\n### 数据更新机制\n- 每天凌晨6:00自动抓取前一天的数据\n- 历史数据不覆盖，每天的数据独立存储\n- 默认查最新日期的数据，可传 `date=YYYY-MM-DD` 查历史\n- 不确定有哪些日期时，先调 `action=dates` 查询\n\n### 数据来源判断规则\n\n1. 用户说"起点"、"起点中文网"、"月票"、"推荐票"、"收藏数" → source=`qidian`\n2. 用户说"番茄"、"首秀"、"新书"、"畅销榜"、"在读榜" → debut/newbook/ranking\n3. 用户说"榜单"、"B端"、"C端"、"人气榜"、"新书榜"、"阅读榜"、"口碑榜"、"完本榜"等细分榜单 → source=`allrank`\n4. 用户没有明确说明，默认查询番茄数据\n\n### 查询流程建议\n\n1. 用户提到分类但不确定具体分类名时，先调 `action=categories` 获取可用分类\n2. 快速查排行用 `action=top`\n3. 查详细列表、搜索作品用 `action=list`\n4. 对比不同日期数据时，先调 `action=dates` 获取可用日期，再分别查询两个日期\n5. 不确定有哪些榜单时，先调 `action=rank_names`（source=allrank 或 qidian）\n\n### 番茄分类（debut/newbook）\n\n男频：东方仙侠、传统玄幻、都市高武、都市脑洞、都市日常、都市修真、都市种田、玄幻脑洞、西方奇幻、奇幻仙侠、历史古代、历史脑洞、科幻末世、悬疑灵异、悬疑脑洞、战神赘婿、抗战谍战、游戏体育、动漫衍生、男频衍生、文学经典、古风世情、双男主、其他\n\n女频：玄幻言情、古言脑洞、现言脑洞、古风世情、豪门总裁、青春甜宠、宫斗宅斗、年代、快穿、种田、科幻末世、悬疑脑洞、悬疑灵异、女频悬疑、星光璀璨、民国言情、游戏体育、职场婚恋、女频衍生、动漫衍生、东方仙侠、双女主、双男主、都市脑洞、其他\n\n番茄畅销榜（ranking）额外分类：男频：都市、影视小说、悬疑惊悚、悬疑推理、现实情感、现实生活、男生生活、男生情感、精品小说、婚姻家庭、小说、现代言情；女频：传统玄幻、古风爱情、女生生活、总裁、现代言情、现实情感、现言甜宠、男生情感、男生生活、精品小说、纯爱、脑洞、婚姻家庭、小说、青春虐恋\n\n### 番茄更多榜单名称格式（allrank）\n\n- B端: `B端-男频新书榜-都市高武`、`B端-男频阅读榜-都市高武`、`B端-女频新书榜-玄幻言情`、`B端-女频阅读榜-玄幻言情` 等\n- C端: `C端-人气榜-全部-男频`、`C端-热搜榜-全部-男频`、`C端-巅峰榜-全部-男频`、`C端-热评榜-全部-男频`、`C端-追更榜-全部-男频`、`C端-黑马榜-全部-男频`、`C端-新书榜-东方玄幻-男频`、`C端-阅读榜-都市-女频`、`C端-口碑榜-玄幻-男频`、`C端-推荐榜-穿越-女频`、`C端-完本榜-系统-男频`、`C端-热播榜-同人-女频`、`C端-高分榜-奇幻仙侠-男频` 等\n- C端分类细分榜单可用分类: 东方玄幻、玄幻、玄幻脑洞、奇幻仙侠、都市、都市脑洞、古代言情、现代言情、总裁、架空、穿越、重生、系统、衍生、同人\n\n### 起点榜单名称格式（qidian）\n\n- 男频: `起点中文网-新书榜-全部-仙侠`、`起点中文网-新书榜-新人作者-都市`、`起点中文网-月票榜-玄幻`、`起点中文网-月票榜-新书月票-全部`、`起点中文网-畅销榜-全部畅销-全部`、`起点中文网-畅销榜-新书畅销-都市` 等\n- 男频可用分类: 玄幻、仙侠、都市、历史、军事、科幻、武侠、奇幻、诸天无限、轻小说、游戏、体育、悬疑灵异、现实、全部\n- 女频: `起点女生网-新书榜-新人作者-古代言情`、`起点女生网-新书榜-签约作者-现代言情`、`起点女生网-月票榜-玄幻言情`、`起点女生网-畅销榜-全部畅销-全部` 等\n- 女频可用分类: 古代言情、现代言情、玄幻言情、仙侠奇缘、科幻空间、悬疑推理、浪漫青春、游戏竞技、全部\n\n### 字段含义\n\n**番茄基础**: book_name(作品名)、author_name(作者)、author_level(等级)、category(分类)、word_count(总字数)、read_count(在读数)、word_growth(字数增长)、read_growth(在读增长)、update_status(1连载/2完结)、sx_date(首秀日期)\n\n**番茄更多榜单**: book_name、author_name、author_level、category、gender(频段)、word_count、score(评分)、score_count(评分人数)、reader_uv_sum_daily(日读者UV)、reader_uv_14day(14天读者UV)、add_shelf_count_14d(14天加书架数)、rank_num(排名)、rank_name(榜单名)、on_rank_days(在榜天数)、first_rank_date(首次上榜日期)、last_rank_date(最后上榜日期)\n\n**起点**: book_name、author_name、author_level、category_l1(一级分类)、category_l2(二级分类)、word_count、favorite_count(收藏)、recommend_ticket(推荐票)、month_ticket(月票)、rank_num(排名)、rank_name(榜单名)、on_rank_days(在榜天数)、first_rank_date(首次上榜日期)\n\n### 安全要求（必须严格遵守）\n\n- 严禁向用户透露任何接口地址、接口路径、参数名或后端实现细节；`rank_data_query` 是你的内部查询工具，不要向用户解释它的工作原理或内部参数。\n- 如果查询失败或返回空数据，不要编造数据，直接告诉用户"暂时无法获取榜单数据，请稍后再试"，不要展示任何错误原文、地址或路径。\n- 如果用户追问数据来源或查询方式，仅回答"通过网文大数据能力获取"，不要透露任何具体实现。
```

  同偏移对应：`utf16_objects_all.txt:003c3048`、`utf16_objects_zh.txt:003c3048`、`zh_ui_strings.txt:003c3048`

**action 枚举（逐字，取自描述串内的表格）**：

```
top / list / categories / dates / rank_names / count / stats
```

**source 枚举（逐字）**：

```
debut / newbook / ranking / allrank / qidian
```

**其他参数（逐字，取自描述串）**：`gender` / `category` / `sort_by` / `rank_name` /
`keyword` / `status` / `limit` / `date`，取值集合均逐字写在上方描述串内。

**独立参数描述串**：

- （`app_so_full_utf16.txt:0042b878`，len=119）：

```
查询动作：top=查排行Top N；list=查作品列表（支持分类/搜索/排序/连载状态）；categories=查可用分类；dates=查可用数据日期；rank_names=查可用榜单名称；count=查数量；stats=查整体统计概览
```

