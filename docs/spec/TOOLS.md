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
>    **本次实际受影响的业务文案只有 2 条**，长度都恰好 401：
>    `terminal` 工具描述（`003c7980`，真实 612 字符 → reference 文件**缺中间 211 字符**）、
>    `create_skill` 的 `resources` 参数描述（`00248820`，真实 433 字符 → reference 文件缺尾部 32 字符）。
>    其余长度为 401 的记录都是 Flutter / Office XML 噪声，非业务文案。
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

### 0.3 尾随 `r` 现象：**已推翻**先前假设，按未决处理

`path is required` / `name is required` 在 ASCII 串文件里显示为带尾随 `r`：

```
0x0028cb20 : b'path is requiredr\xf2\x05\x00'
0x002ea1a0 : b'name is requiredr\xe2\x05\x00'
```

**但这不足以判定 UI 文案本身带 `r`。** 全量普查显示该现象**系统性存在**，不是这两条的例外：

- `app_so_full_strings.txt` 中**以 `r` 结尾**且含空格的「散文式」记录共 **179 条**。
- 同一现象大量出现在 **Flutter 框架自带字符串**上，与 OpenWrite 业务无关，例如：

  - `app_so_full_strings.txt:0025fb80`  Max items to return. read: lines (default 2000, max 2000). list: entries (default 200, max 500).r
  - `app_so_full_strings.txt:00245570`  Unexpected start tag (%(originalName)s). Treated as %(newName)s.r
  - `app_so_full_strings.txt:0028b6c0`  Unexpected end of file. Expected foreign contentr
  - `app_so_full_strings.txt:0028d3c0`  We should never reach this pointr
  - `app_so_full_strings.txt:002b1750`  Data uri must not have authorityr
  - `app_so_full_strings.txt:002e63b0`  Trailing solidus not allowed on element %(name)sr
  - `app_so_full_strings.txt:002e40c0`  Source contains non-ASCII bytes.r
  - `app_so_full_strings.txt:0024a6a0`  operation failedr
  - `app_so_full_strings.txt:0028d8c0`  Bearer anonymousr
  - `app_so_full_strings.txt:0028d980`  Invalid enveloper
  - `app_so_full_strings.txt:002ec7f0`  Connection resetr
  - `app_so_full_strings.txt:002dd9d0`  Assertion failedr
  - `app_so_full_strings.txt:002bc380`  Gateway Time-outr
  - `app_so_full_strings.txt:002ce470`  Payment Requiredr
  - `app_so_full_strings.txt:0026be50`  Afficher le menur
  - `app_so_full_strings.txt:002ceb10`  Pesquisar na Webr

上面每条都是「句子 + 单个 `r`」。这更像**提取/布局层面的系统性伪影**（例如 Dart 字符串池
按 8 字节对齐排布时，提取正则多吃进了一个相邻字节），而非 179 处真实拼写错误。

**两条判据互相矛盾，故本规格不下结论**：

| 判据 | 指向 |
|---|---|
| 同族 15 条 `xxx is required` 全部以 NUL 填充结尾，只有这两条在文本后**没有 NUL**，`r` 紧贴 | 支持「`r` 是内容」 |
| 179 条含 Flutter 框架串同样带尾随 `r` | 支持「`r` 是系统性伪影」 |
| 用 `tags,hash,length` 对象头复核：`VA=0x0028cb08` 读到 `q2=0x20`（32 字节），与 17 字符不符 | 该模型在此区域不成立，**不能**作判据 |

**本规格的处理**：§3.1 / §3.3 按**原始文件内容逐字引用**（即写作 `path is requiredr`、
`name is requiredr`），同时在 §6 把它标为**未决项**。

**给 writerD 的建议**：实现时采用**不带**尾随 `r` 的 `path is required` / `name is required`
（与同族 15 条 `xxx is required` 形态一致），并在 ADR 记录该判断与依据；
**不要**照抄尾随 `r`，除非后续拿到 `dart` 层证据（反编译 `kernel_blob.bin` 或直接解码字符串池）
证明它就是文案内容。

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

**operation / mode 枚举（逐字）**——本次找到独立枚举串：

- `app_so_full_strings.txt:002b2fd0`（len=62）：

```
"read" to read file content, "list" to list directory contents
```

```
read / list
```

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

- （`app_so_full_strings.txt:00356f20`，len=35）：

```
Content to write, append, or insert
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
> **注意**：该枚举串在二进制中同样带真实尾随 `r`（`...after_line"r`），同 §0.3 现象。

### 2.3 `file_manage`

- 工具名独立记录：`app_so_full_strings.txt:0027add0`
- **工具描述全文**（`app_so_full_strings.txt:004805e0`，len=185，逐字；此串**未被 400 字节截断**，因为本身仅 185 字符）：

```
File modification operations: search content in files, delete file/directory, rename file/directory, copy file. This tool CANNOT list directories or read files - use file_read for that.
```

  同偏移对应：`WIN_app.so.strings.txt:004805e0`

**operation 枚举（逐字）**——本次找到以 `Operation type:` 开头的独立枚举串：

- `app_so_full_strings.txt:0045c1c0`（len=122）：

```
Operation type: "search" to find text in files, "delete" to remove file, "rename" to rename file, "copy" to duplicate file
```

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

- （`app_so_full_strings.txt:002eb240`，len=74）：

```
Directory to search in (for "search" operation, default is entire project)
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

---

## 3. 校验文案全表

检索方法：在四个内容层（`app_so_full_strings.txt`、`app_so_full_utf16.txt`、
`zh_ui_strings.txt`、`utf16_objects_all.txt`）中按字面匹配，列出**全部偏移**。
下列每条都是记录内容**恰好等于**该文案（exact match），除非另有标注。

### 3.1 `xxx is required` 族（英文，逐字 + 全部偏移）

| # | 逐字文案 | 全部命中偏移 |
|---|---|---|
| 1 | `path is requiredr` ⚠ | `app_so_full_strings.txt:0028cb20` |
| 2 | `content is required` | `app_so_full_strings.txt:0027e040`, `app_so_full_strings.txt:00287510`, `app_so_full_strings.txt:003d56e0`, `app_so_full_strings.txt:0040a120` |
| 3 | `content is required for write operation` | `app_so_full_strings.txt:003d56e0` |
| 4 | `content is required for append operation` | `app_so_full_strings.txt:0027e040` |
| 5 | `old_text is required for replace operation` | `app_so_full_strings.txt:003f7e30` |
| 6 | `new_text is required for insert operation` | `app_so_full_strings.txt:003968b0` |
| 7 | `search_text is required for search operation` | `app_so_full_strings.txt:0043ee00` |
| 8 | `new_path is required for copy operation` | `app_so_full_strings.txt:002686f0` |
| 9 | `new_path is required for rename operation` | `app_so_full_strings.txt:002a9e30` |
| 10 | `start_line and end_line are required for delete_lines operation` | `app_so_full_strings.txt:002ad350` |
| 11 | `command is required` | `app_so_full_strings.txt:0026c010` |
| 12 | `operation is required` | `app_so_full_strings.txt:0027a9c0` |
| 13 | `skill_name is required` | `app_so_full_strings.txt:002d8060` |
| 14 | `name is requiredr` ⚠ | `app_so_full_strings.txt:002ea1a0` |
| 15 | `description is required` | `app_so_full_strings.txt:004796d0` |
| 16 | `query is required` | `app_so_full_strings.txt:003ac930` |
| 17 | `questions is required and must not be empty` | `app_so_full_strings.txt:002f44a0` |
| 18 | `reference_content is required when reference_name is provided` | `app_so_full_strings.txt:00287510` |

> ⚠ `path is requiredr` / `name is requiredr` 的尾随 `r` **未决**——它是全库 179 条系统性
> 尾随 `r` 现象中的两条，无法判定属于文案内容还是提取伪影。详见 §0.3 与 §6。
> 实现建议用不带 `r` 的形态。上表按原始文件逐字引用，故保留了 `r`。

### 3.2 其余英文校验 / 错误文案（逐字 + 全部偏移）

| # | 逐字文案 | 全部命中偏移 |
|---|---|---|
| 1 | `Unknown operation: ` | `app_so_full_strings.txt:0034cc50` |
| 2 | `Unsupported operation: ` | `app_so_full_strings.txt:00257670` |
| 3 | `Must provide content, reference_name, or delete: true` | `app_so_full_strings.txt:00414f20` |
| 4 | `Invalid after_line number` | `app_so_full_strings.txt:0043d690` |
| 5 | `workdir 必须是相对项目根的子目录，不能含 .. 或绝对路径` | `app_so_full_utf16.txt:003e8a98`, `zh_ui_strings.txt:003e8a98`, `utf16_objects_all.txt:003e8a98` |

### 3.3 中文校验 / 限制文案（逐字 + 全部偏移）

| # | 逐字文案 | 全部命中偏移 | 备注 |
|---|---|---|---|
| 1 | `KB），不能超过 50KB` | `app_so_full_utf16.txt:00237fe8`, `zh_ui_strings.txt:00237fe8`, `utf16_objects_all.txt:00237fe8` | 技能正文体积上限片段（前缀被切分，见备注） |
| 2 | `MB），不能超过 3MB` | `app_so_full_utf16.txt:0036ef58`, `zh_ui_strings.txt:0036ef58`, `utf16_objects_all.txt:0036ef58` | 文件包体积上限片段（前缀被切分） |
| 3 | `文件包体积超过上限（` | `app_so_full_utf16.txt:0032dcc8`, `zh_ui_strings.txt:0032dcc8`, `utf16_objects_all.txt:0032dcc8` | zip 导入校验 |
| 4 | `路径在项目/skill 目录外，需用户确认，但确认机制未启用: ` | `app_so_full_utf16.txt:00316a38`, `zh_ui_strings.txt:00316a38`, `utf16_objects_all.txt:00316a38` | 路径授权 |
| 5 | `始终允许将授权目录及其子目录：` | `app_so_full_utf16.txt:00316ec8`, `zh_ui_strings.txt:00316ec8`, `utf16_objects_all.txt:00316ec8` | 路径授权 |

> `KB），不能超过 50KB`（`app_so_full_utf16.txt:00237fe8`）与 `MB），不能超过 3MB`
> （`app_so_full_utf16.txt:0036ef58`）都是**被切分过的片段**：字符串池中它们以 `KB）` / `MB）`
> 起始，前面的数值部分不在这条记录里（相邻偏移 `00237fe0` / `0036ef50` 无对应记录）。
> 本规格按「逐字引用、不补全」原则原样保留，**未**还原成完整句子。

### 3.4 抽卡对比模式下的工具禁用文案（逐字）

- `app_so_full_utf16.txt:00324158`（len=194）：

```
**重要**：当前为抽卡对比模式，不允许向用户提问或等待确认，file_write、file_manage、create_project、create_skill、update_skill、question 等工具不可用（调用会收到错误结果）。请直接根据已有信息完成创作，创作内容直接输出在回复中。请尽量减少文件读取次数，最多读取1次获取必要信息后立即开始创作，不要反复读取文件浪费时间。
```

- `zh_ui_strings.txt:00324158`（len=194）：

```
**重要**：当前为抽卡对比模式，不允许向用户提问或等待确认，file_write、file_manage、create_project、create_skill、update_skill、question 等工具不可用（调用会收到错误结果）。请直接根据已有信息完成创作，创作内容直接输出在回复中。请尽量减少文件读取次数，最多读取1次获取必要信息后立即开始创作，不要反复读取文件浪费时间。
```

- `utf16_objects_all.txt:00324158`（len=194）：

```
**重要**：当前为抽卡对比模式，不允许向用户提问或等待确认，file_write、file_manage、create_project、create_skill、update_skill、question 等工具不可用（调用会收到错误结果）。请直接根据已有信息完成创作，创作内容直接输出在回复中。请尽量减少文件读取次数，最多读取1次获取必要信息后立即开始创作，不要反复读取文件浪费时间。
```

- `app_so_full_utf16.txt:002bb038`：{"info":"抽卡对比模式下暂不支持写入操作，请根据已有信息创作"}
- `zh_ui_strings.txt:002bb038`：{"info":"抽卡对比模式下暂不支持写入操作，请根据已有信息创作"}
- `utf16_objects_all.txt:002bb038`：{"info":"抽卡对比模式下暂不支持写入操作，请根据已有信息创作"}
- `app_so_full_utf16.txt:003d6a98`：{"info":"抽卡对比模式下无法交互提问，请直接创作"}
- `zh_ui_strings.txt:003d6a98`：{"info":"抽卡对比模式下无法交互提问，请直接创作"}
- `utf16_objects_all.txt:003d6a98`：{"info":"抽卡对比模式下无法交互提问，请直接创作"}

### 3.5 CONTRACT.md §4.2 引用文案的逐条复核

本次把 `docs/CONTRACT.md §4.2` 列出的 12 条校验文案逐条回原始文件核对，结果：

| CONTRACT 引用 | 原始文件是否存在 | 偏移 | 结论 |
|---|---|---|---|
| `path is required` | 是（原始文件实为 `path is requiredr`） | `app_so_full_strings.txt:0028cb20` | ⚠ CONTRACT 少了尾随 `r`；该 `r` 未决，见 §0.3 |
| `content is required for write operation` | 是 | `app_so_full_strings.txt:003d56e0` | ✔ 逐字一致 |
| `content is required for append operation` | 是 | `app_so_full_strings.txt:0027e040` | ✔ 逐字一致 |
| `old_text is required for replace operation` | 是 | `app_so_full_strings.txt:003f7e30` | ✔ 逐字一致 |
| `new_text is required for insert operation` | 是 | `app_so_full_strings.txt:003968b0` | ✔ 逐字一致 |
| `search_text is required for search operation` | 是 | `app_so_full_strings.txt:0043ee00` | ✔ 逐字一致 |
| `new_path is required for copy operation` | 是 | `app_so_full_strings.txt:002686f0` | ✔ 逐字一致 |
| `new_path is required for rename operation` | 是 | `app_so_full_strings.txt:002a9e30` | ✔ 逐字一致 |
| `start_line and end_line are required for delete_lines operation` | 是 | `app_so_full_strings.txt:002ad350` | ✔ 逐字一致 |
| `Unknown operation: ` | 是 | `app_so_full_strings.txt:0034cc50` | ✔ 逐字一致 |
| `content is required` | 是 | `app_so_full_strings.txt:0040a120` | ✔ 逐字一致 |
| `reference_content is required when reference_name is provided` | 是 | `app_so_full_strings.txt:00287510` | ✔ 逐字一致 |
| `Must provide content, reference_name, or delete: true` | 是 | `app_so_full_strings.txt:00414f20` | ✔ 逐字一致 |

新增复核（`CONTRACT.md §4.5` 的两条终端文案）：

- ✘ `【高危命令】命中内置风险词表，请逐字核对命令内容后再允许` → **NOT FOUND**（全库无「高危命令」「内置风险词表」「命中内置」任何子串）
- ✔ `（无白名单条目，添加后 AI 执行时不再确认）` → `app_so_full_utf16.txt:002dbcc8`, `zh_ui_strings.txt:002dbcc8`, `utf16_objects_all.txt:002dbcc8`

### 3.6 CONTRACT.md 未收录、但本次新发现的校验文案

- `name is requiredr` → `app_so_full_strings.txt:002ea1a0`
- `description is required` → `app_so_full_strings.txt:004796d0`
- `skill_name is required` → `app_so_full_strings.txt:002d8060`
- `command is required` → `app_so_full_strings.txt:0026c010`
- `operation is required` → `app_so_full_strings.txt:0027a9c0`
- `query is required` → `app_so_full_strings.txt:003ac930`
- `Unsupported operation: ` → `app_so_full_strings.txt:00257670`
- `Invalid after_line number` → `app_so_full_strings.txt:0043d690`
- `workdir 必须是相对项目根的子目录，不能含 .. 或绝对路径` → `app_so_full_utf16.txt:003e8a98`, `zh_ui_strings.txt:003e8a98`, `utf16_objects_all.txt:003e8a98`
- `文件包体积超过上限（` → `app_so_full_utf16.txt:0032dcc8`, `zh_ui_strings.txt:0032dcc8`, `utf16_objects_all.txt:0032dcc8`
- `KB），不能超过 50KB` → `app_so_full_utf16.txt:00237fe8`, `zh_ui_strings.txt:00237fe8`, `utf16_objects_all.txt:00237fe8`
- `MB），不能超过 3MB` → `app_so_full_utf16.txt:0036ef58`, `zh_ui_strings.txt:0036ef58`, `utf16_objects_all.txt:0036ef58`

### 3.7 本次新发现的参数 / 枚举描述串（CONTRACT 未收录）

- file_read 的 mode 枚举（`app_so_full_strings.txt:002b2fd0`，len=62）：`"read" to read file content, "list" to list directory contents`
- file_manage 的 operation 枚举（`app_so_full_strings.txt:0045c1c0`，len=122）：`Operation type: "search" to find text in files, "delete" to remove file, "rename" to rename file, "copy" to duplicate file`
- file_manage 参数（`app_so_full_strings.txt:002eb240`，len=74）：`Directory to search in (for "search" operation, default is entire project)`
- file_write 参数（`app_so_full_strings.txt:00356f20`，len=35）：`Content to write, append, or insert`
- file_write 参数（`app_so_full_strings.txt:0038c220`，len=50）：`Text to find and replace (for "replace" operation)`
- file_write 参数（`app_so_full_strings.txt:00472a10`，len=41）：`New text for replace or insert operations`
- file_write 参数（含 insert position 枚举）（`app_so_full_strings.txt:004791a0`，len=49）：`Where to insert: "start", "end", or "after_line"r`
- file_write 参数（`app_so_full_strings.txt:00466900`，len=75）：`Line number after which to insert (for "insert" with position "after_line")`
- file_write 参数（`app_so_full_strings.txt:00285020`，len=38）：`Start line number for delete (1-based)`
- file_write 参数（`app_so_full_strings.txt:00482ff0`，len=47）：`End line number for delete (1-based, inclusive)`
- replace_all 参数（`app_so_full_strings.txt:0033c340`，len=108）：`For "replace" operation: if true, replace ALL occurrences; if false (default), replace first occurrence only`
- 校验文案（`app_so_full_strings.txt:0043d690`，len=25）：`Invalid after_line number`
- terminal timeout 参数（`app_so_full_strings.txt:004246b0`，len=61）：`Optional timeout in milliseconds. Default 120000, max 600000.`
- terminal workdir 参数（`app_so_full_strings.txt:00465ac0`，len=106）：`Optional working directory, relative to the current project root. Use this instead of `cd <dir> && <cmd>`.`
- terminal args 参数（`app_so_full_strings.txt:0048b9e0`，len=77）：`Optional arguments for the command. Use this for script paths and parameters.`
- terminal command 参数（`app_so_full_strings.txt:00376c10`，len=22）：`The command to execute`
- question 参数（`app_so_full_strings.txt:002ac300`，len=25）：`Questions to ask the user`
- question 参数（`app_so_full_strings.txt:0035b020`，len=37）：`The complete question to ask the user`
- question 参数（`app_so_full_strings.txt:004a3570`，len=124）：`The available choices for this question. Must have 2-4 options. Each option should be a distinct, mutually exclusive choice.`
- question 参数（`app_so_full_strings.txt:00400410`，len=77）：`Set to true to allow the user to select multiple options instead of just one.`
- create_project 参数（`app_so_full_strings.txt:00482b70`，len=46）：`The name of the new novel project (book title)`
- skill 参数（`app_so_full_strings.txt:00408770`，len=68）：`The skill name exactly as shown in Available Skills, or the skill ID`
- skill 参数（短版）（`app_so_full_strings.txt:00408770`，len=68）：`The skill name exactly as shown in Available Skills, or the skill ID`
- skill 命名规范（`app_so_full_strings.txt:003eb1a0`，len=151）：`Skill name in English, lowercase with hyphens (e.g. "novel-reviewer", "translation-helper"). English names avoid path encoding issues across platforms.`
- update_skill 参数（`app_so_full_strings.txt:00423630`，len=94）：`New full SKILL.md content (including --- frontmatter). Use this to update the main skill file.`
- update_skill 参数（`app_so_full_strings.txt:00450b40`，len=88）：`Content for the reference file. Required when reference_name is provided without delete.`
- update_skill 参数（`app_so_full_strings.txt:003a7630`，len=149）：`With reference_name: delete that single resource file. Without reference_name: delete (uninstall) the whole skill. Built-in skills cannot be deleted.`
- skill 资源路径参数（`app_so_full_utf16.txt:003d1438`，len=425）：`Path of the bundled resource to create, update or delete, relative to the skill root. Use scripts/... for executable helpers, references/... for documents, or assets/... for output resources. Nested paths are supported. TIP: prefer the full path with directory prefix (e.g. "references/rule.md", "scripts/helper.py") — a bare filename is resolved by basename match, which may fail if the file sits in an unexpected directory.`
- 路径参数（`app_so_full_strings.txt:002734f0`，len=114）：`File or directory path. Relative paths resolve against the current project root; absolute paths are also accepted.`
- offset 参数（`app_so_full_strings.txt:00256d70`，len=87）：`Pagination start. read: 1-based line number (default 1). list: entry index (default 0).`
- limit 参数（`app_so_full_strings.txt:0025fb80`，len=97）：`Max items to return. read: lines (default 2000, max 2000). list: entries (default 200, max 500).r`

---

## 4. 系统提示词与技能注入格式

### 4.1 默认系统提示词全文（逐字）

**这是本次提取最重要的发现。**

线索偏移 `002498f0` 附近确实存在「你是一个创意小说写作助手…」，但它**不在**
`reference/utf16_objects_all.txt` 里，原因是 `reference/extract_utf16_obj.py` 的
「8 字节对齐对象 VA + 24」模型不适用于本条。用原始字节直接解码后，得到的是一段
**完整、未被切分**的提示词：

- 原始字节区间：`app.so` 文件偏移 `0x002498f0` .. `0x002499d8`（含起不含止）
- 长度：**116 个字符**（232 字节）
- 证据来源：`S:\dsh\OpenWrite\data\app.so` 原始字节（本次解码）
- 在 `reference/` 任一文件中：**不存在**（`NOT FOUND`）

全文（逐字，无 `\n`，单段落）：

```
你是一个创意小说写作助手。你可以读取和写入小说项目目录中的文件。当用户要求你写作、修改或审阅内容时，使用可用工具读取现有章节和资料，然后据此撰写或更新内容。始终保持与现有故事、角色和世界设定的一致性。请使用与用户相同的语言进行回复。
```

逐字符校验要点：

- 首字符 `你`，末字符 `。`（句号），全文无换行。
- 出现「可用工具」字样（`0x00249958`）、「小说项目目录」（`0x0024991a`）、
  「读取现有章节」（`0x00249960`）——均在**同一段 116 字**内，可交叉定位。
- 「请使用与用户相同的语言进行回复。」是末句。

原始字节转储（供独立复核）：

```
b"`O/f\x00N*N\x1bR\x0fa\x0f\\\xf4\x8b\x99Q\\O\xa9RKb\x020`O\xefS\xe5N\xfb\x8b\xd6S\x8cT\x99QeQ\x0f\\\xf4\x8by\x98\xeev\xeevU_-N\x84v\x87e\xf6N\x020S_(u7b\x81\x89Bl`O\x99Q\\O\x010\xeeO9e\x16b\xa1[\x05\x96\x85Q\xb9[\xf6e\x0c\xff\x7fO(u\xefS(u\xe5]wQ\xfb\x8b\xd6S\xb0s\tg\xe0z\x82\x82\x8cTD\x8d\x99e\x0c\xff6q\x0eTncdk\xb0d\x99Q\x16b\xf4f\xb0e\x85Q\xb9[\x020\xcbY\xc8~\xddO\x01c\x0eN\xb0s\tgEe\x8bN\x010\xd2\x89r\x82\x8cT\x16NLu\xbe\x8b\x9a[\x84v\x00N\xf4\x81'`\x020\xf7\x8b\x7fO(u\x0eN(u7b\xf8v\x0cT\x84v\xed\x8b\x00\x8a\xdb\x8fL\x88\xdeV\rY\x020" ...
```

### 4.2 另一个提示词片段（同一区域，独立字符串）

在 `0x00249b38`（UTF-16 对象）有一条独立短句：

- `app_so_full_utf16.txt:00249b38`（len=8）：- 用中文输出。

同偏移对应：`app_so_full_utf16.txt:00249b38`, `zh_ui_strings.txt:00249b38`, `utf16_objects_all.txt:00249b38`

它与 §4.1 的 116 字提示词之间隔着若干条 1 字符记录（`说`、`丑`、`坶`、`菵`），
**无法证明属于同一提示词**。此处只逐字列出，不做拼接推断。

### 4.3 技能清单注入格式（`## Available Skills` 块）

**块头（逐字）**：

- `app_so_full_utf16.txt:0039d178`（len=157）：

```
## Available Skills\n\n技能按需加载。当用户请求与某个技能的使用场景匹配时，调用 `skill_lookup` 加载该技能的完整内容。参数 `skill_name` 必须一字不差地使用 `<name>` 中的技能名（不要改写、翻译或添加后缀）。\n\n<available_skills>\n
```

全部命中偏移：`app_so_full_utf16.txt:0039d178`, `zh_ui_strings.txt:0039d178`, `utf16_objects_all.txt:0039d178`

> 注意：池内记录里首字符是 `#`，位于偏移 `0039d190`；`utf16_objects_all.txt` 记录的
> 偏移 `0039d178` 是对象头位置。

**每个技能条目的包裹格式（逐字，5 条独立字符串）**：

| 片段 | 逐字内容 | 偏移 |
|---|---|---|
| 条目开 | `  <skill>` | `app_so_full_strings.txt:0034f980` |
| 名字开 | `    <name>` | `app_so_full_strings.txt:0034f98a` |
| 名字闭 | `</name>` | `app_so_full_strings.txt:00277d30` |
| 描述开 | `    <description>` | `app_so_full_strings.txt:00277d38` |
| 描述闭 | `</description>` | `app_so_full_strings.txt:0027d400` |
| 条目闭 | `  </skill>` | `app_so_full_strings.txt:0027d40f` |
| 块闭 | `</available_skills>` | `app_so_full_strings.txt:0041d201` |

组合后的完整注入结构（缩进按逐字字符串保留；`技能名` / `技能描述` 为运行时填充位，非逐字串）：

```
## Available Skills

技能按需加载。当用户请求与某个技能的使用场景匹配时，调用 `skill_lookup` 加载该技能的完整内容。参数 `skill_name` 必须一字不差地使用 `<name>` 中的技能名（不要改写、翻译或添加后缀）。

<available_skills>
  <skill>
    <name>技能名</name>
    <description>技能描述</description>
  </skill>
</available_skills>
```

> **证据强度说明**：块头、`<available_skills>`、`</available_skills>`、`  <skill>`、
> `    <name>`、`</name>`、`    <description>`、`</description>`、`  </skill>` 九个片段**均为逐字字符串**，
> 偏移见上表。但**「它们拼在一起时中间是否有换行」需要按各片段自带的 `\n` 判断**：
> 块头串以 `\n` 结尾，五个条目片段串**自身不含 `\n`**。上面的组合块是按片段自带换行还原的推断，
> 已在 §6 标为不确定项。

### 4.4 技能正文加载后回注的目录说明（逐字）

`skill_lookup` 命中后注入的目录约定（一条完整记录）：

- `app_so_full_utf16.txt:0027c0a8`（len=127）：

```
\n- 约定: `scripts/` 存放可执行脚本，`references/` 存放按需读取的文档，`assets/` 存放输出资源。\n- 该目录下的相对路径都基于此目录。\n- 可用文件(排除 SKILL.md，最多10个，完整列表可读目录):\n
```

- `zh_ui_strings.txt:0027c0a8`（len=127）：

```
\n- 约定: `scripts/` 存放可执行脚本，`references/` 存放按需读取的文档，`assets/` 存放输出资源。\n- 该目录下的相对路径都基于此目录。\n- 可用文件(排除 SKILL.md，最多10个，完整列表可读目录):\n
```

- `utf16_objects_all.txt:0027c0a8`（len=127）：

```
\n- 约定: `scripts/` 存放可执行脚本，`references/` 存放按需读取的文档，`assets/` 存放输出资源。\n- 该目录下的相对路径都基于此目录。\n- 可用文件(排除 SKILL.md，最多10个，完整列表可读目录):\n
```

全部命中偏移：`app_so_full_utf16.txt:0027c0a8`, `zh_ui_strings.txt:0027c0a8`, `utf16_objects_all.txt:0027c0a8`

---

## 5. 流式事件与错误文案

### 5.1 流式事件名（逐字 + 全部偏移）

| # | 事件名 | 全部命中偏移 |
|---|---|---|
| 1 | `ai_run_started` | `app_so_full_strings.txt:0043c3a0` |
| 2 | `ai_tool_started` | `app_so_full_strings.txt:00462b40` |
| 3 | `ai_tool_calls_received` | `app_so_full_strings.txt:00391ce0` |
| 4 | `ai_tool_completed` | `app_so_full_strings.txt:002efde0` |
| 5 | `ai_text_started` | `app_so_full_strings.txt:003b8520` |
| 6 | `ai_thinking_started` | `app_so_full_strings.txt:0036bc30` |
| 7 | `ai_cleanup_started` | `app_so_full_strings.txt:0035f260` |
| 8 | `ai_cleanup_completed` | `app_so_full_strings.txt:002acfb0` |
| 9 | `ai_run_completedr` | `app_so_full_strings.txt:00322ef0` |

任务指定的 6 个事件名 **全部命中**，另外额外发现 3 个：`ai_cleanup_started`、
`ai_cleanup_completed`、`ai_run_completedr`（注意最后一条同样带真实尾随 `r`，同 §0.3 现象）。

补检的未命中项：

- `ai_run_finished` → `NOT FOUND`
- `ai_error` → `NOT FOUND`
- 全库正则 `\bai_[a-z_]{3,40}\b` 仅命中上述 9 条（加 1 条 `ai_file_write_`，非事件名）。

完整 `ai_*` 正则命中清单（逐字）：

```
002acfb0  ai_cleanup_completed
002efde0  ai_tool_completed
00322ef0  ai_run_completedr
0035f260  ai_cleanup_started
0036bc30  ai_thinking_started
00391ce0  ai_tool_calls_received
003b8520  ai_text_started
0043c3a0  ai_run_started
00462b40  ai_tool_started
004a5160  ai_file_write_
```

### 5.2 错误分类文案（逐字 + 全部偏移，回原文件核对）

`CONTRACT.md §8.3` 列出的 9 条，逐条回原始文件核对——**9 条全部 EXACT 命中**：

| # | 逐字文案 | 全部命中偏移 | 核对 |
|---|---|---|---|
| 1 | `API Key 无效或未提供，请检查Key是否正确` | `app_so_full_utf16.txt:00276198`, `zh_ui_strings.txt:00276198`, `utf16_objects_all.txt:00276198` | ✔ EXACT |
| 2 | `API Key 已过期，请更换Key后重试` | `app_so_full_utf16.txt:002a3598`, `zh_ui_strings.txt:002a3598`, `utf16_objects_all.txt:002a3598` | ✔ EXACT |
| 3 | `令牌无权访问该模型，请检查Key权限设置` | `app_so_full_utf16.txt:002e8208`, `zh_ui_strings.txt:002e8208`, `utf16_objects_all.txt:002e8208` | ✔ EXACT |
| 4 | `429错误，可能是当前模型算力紧张，使用人数过多，建议先更换为其他模型使用，或稍后再进行尝试` | `app_so_full_utf16.txt:002c0ea8`, `zh_ui_strings.txt:002c0ea8`, `utf16_objects_all.txt:002c0ea8` | ✔ EXACT |
| 5 | `对话内容过长，超出了上游模型的上下文限制，请压缩旧上下文或新建对话` | `app_so_full_utf16.txt:002818f8`, `zh_ui_strings.txt:002818f8`, `utf16_objects_all.txt:002818f8` | ✔ EXACT |
| 6 | `未收到AI响应，服务器可能暂时不可用或Key已失效` | `app_so_full_utf16.txt:003add48`, `zh_ui_strings.txt:003add48`, `utf16_objects_all.txt:003add48` | ✔ EXACT |
| 7 | `max_tokens 参数无效，请检查模型设置中的最大输出长度` | `app_so_full_utf16.txt:002bd888`, `zh_ui_strings.txt:002bd888`, `utf16_objects_all.txt:002bd888` | ✔ EXACT |
| 8 | `该模型不存在或暂无可用渠道，请更换模型后重试` | `app_so_full_utf16.txt:002a2638`, `zh_ui_strings.txt:002a2638`, `utf16_objects_all.txt:002a2638` | ✔ EXACT |
| 9 | `该模型不支持自定义温度，请将温度设为 1 或使用默认值` | `app_so_full_utf16.txt:0036c318`, `zh_ui_strings.txt:0036c318`, `utf16_objects_all.txt:0036c318` | ✔ EXACT |

> 每条均同时出现在 5 个文件中（`zh_ui_strings.txt`、`utf16_objects_all.txt`、
> `utf16_objects_zh.txt`、`app_so_full_utf16.txt`、`zh_ui_classified.txt`），偏移一致。
> 上表只列每个文件的首个偏移。

### 5.3 与工具调用相关的错误 / 提示文案

- `app_so_full_utf16.txt:002bb038`：{"info":"抽卡对比模式下暂不支持写入操作，请根据已有信息创作"}
- `zh_ui_strings.txt:002bb038`：{"info":"抽卡对比模式下暂不支持写入操作，请根据已有信息创作"}
- `utf16_objects_all.txt:002bb038`：{"info":"抽卡对比模式下暂不支持写入操作，请根据已有信息创作"}
- `app_so_full_utf16.txt:003d6a98`：{"info":"抽卡对比模式下无法交互提问，请直接创作"}
- `zh_ui_strings.txt:003d6a98`：{"info":"抽卡对比模式下无法交互提问，请直接创作"}
- `utf16_objects_all.txt:003d6a98`：{"info":"抽卡对比模式下无法交互提问，请直接创作"}
- `app_so_full_strings.txt:0034cc50`：Unknown operation: 
- `app_so_full_strings.txt:00257670`：Unsupported operation: 

---

## 6. 未找到 / 不确定项（NOT FOUND 清单）

> 本章是**必读**部分：上面每一节只写「找到了什么」，本章写「**什么没找到、什么不敢下结论**」。
> 严禁把本章条目当常识补全。

### 6.1 工具描述串：NOT FOUND

| 工具 | 缺口 | 检索范围 | 结论 |
|---|---|---|---|
| `edit_file` | 工具描述全文 | 全库 7 个层（含 Android APK 层） | **NOT FOUND** |
| `file_read` | 独立 operation/mode 枚举之外的语义说明 | 同上 | 仅找到枚举串，无更详细描述 |

`edit_file` 的完整检索证据：`edit_file` 在 `app_so_full_strings.txt` 只命中 1 条，
即 `app_so_full_strings.txt:00371250`，内容恰好为工具名 `edit_file`；
`WIN_app.so.strings.txt:00371250` 同为唯一命中。`zh_ui_strings.txt`、`utf16_objects_all.txt`、
`utf16_objects_zh.txt`、`APK_libapp.so.strings.txt` **零命中**。

### 6.2 operation / action 枚举：部分 NOT FOUND

| 工具 | 枚举项 | 状态 | 证据 |
|---|---|---|---|
| `file_read` | `read` / `list` | 已找到 | `app_so_full_strings.txt:002b2fd0` |
| `file_write` | `write` / `append` / `replace` / `insert` / `delete_lines` | 已找到 | `app_so_full_strings.txt:00442010` |
| `edit_file` | `write` / `append` / `replace` / `insert` / `delete_lines` | 与 file_write 同源 | `app_so_full_strings.txt:00442010` |
| `file_manage` | `search` / `delete` / `rename` / `copy` | 已找到 | `app_so_full_strings.txt:0045c1c0` |
| `file_write insert position` | `start` / `end` / `after_line` | 已找到 | `app_so_full_strings.txt:004791a0` |
| `terminal` | （无 operation 枚举） | **NOT FOUND**（无此参数） | — |
| `web_search` | （无 operation 枚举） | **NOT FOUND**（无此参数） | — |
| `skill_lookup` | （无 operation 枚举） | **NOT FOUND**（无此参数） | — |
| `create_skill` | （无 operation 枚举） | **NOT FOUND**（无此参数） | — |
| `update_skill` | （无 operation 枚举） | **NOT FOUND**（无此参数） | — |
| `create_project` | （无 operation 枚举） | **NOT FOUND**（无此参数） | — |
| `question` | （无 operation 枚举） | **NOT FOUND**（无此参数） | — |

### 6.3 参数描述串：NOT FOUND

以下参数在 Dart schema 中存在**参数名**（如 `path` / `content` / `operation`），
但本次**未能找到任何以它们为主语的描述串**。已用下列候选词形逐一试检，全部 NOT FOUND：

- `The operation to perform` → **NOT FOUND**
- `Operation to perform` → **NOT FOUND**
- `The file content` → **NOT FOUND**
- `The path of the file` → **NOT FOUND**
- `Absolute path of the file` → **NOT FOUND**
- `The name of the skill` → **NOT FOUND**
- `The new name` → **NOT FOUND**
- `delete flag` → **NOT FOUND**
- `Name of the new novel project` → **NOT FOUND**
- `The directory` → **NOT FOUND**
- `The target path` → **NOT FOUND**
- `Source path` → **NOT FOUND**
- `Destination path` → **NOT FOUND**

**已找到的**参数描述串反证了这个缺口不是检索方式问题——同一批 schema 里
`Content to write, append, or insert`、`File or directory path. ...` 等都能找到：

- ✔ Content to write, append, or insert → `app_so_full_strings.txt:00356f20`
- ✔ File or directory path. Relative paths resolve against the current project root → 

因此结论是：`operation`、`path`、`content`（在 `file_write` 语境下）、`skill_name`
这几个参数**很可能根本没有独立描述串**，其 schema 只写了名字与类型。
**这是推断，不是逐字证据**，故列入本清单。

### 6.4 尾随 `r` 现象：未决项（本规格最重要的不确定点）

| 项 | 状态 |
|---|---|
| `path is requiredr` | ⚠ **未决**：原始文件逐字如此，但可能是提取伪影 |
| `name is requiredr` | ⚠ **未决**：同上 |
| `ai_run_completedr` | ⚠ **未决**：同上 |
| `Where to insert: "start", "end", or "after_line"r` | ⚠ **未决**：同上 |

量化：`app_so_full_strings.txt` 中「以 `r` 结尾且含空格」的散文式记录共 **179 条**，
其中大量是 Flutter 框架串（`Assertion failedr`、`Connection resetr`、`Payment Requiredr`、
`Afficher le menur` …），与 OpenWrite 无关。

**未能解决的原因**：需要 Dart 字符串池解码或 `kernel_blob.bin` 反编译才能定论，
本次只做字符串层提取，**没有**做这一层，故不下结论。

**给 writerD 的行动项**：按不带 `r` 的形态实现，并在 ADR 记录本项与本节的依据。

### 6.5 系统提示词：已找到主体，但整体拼装顺序不确定

| 项 | 状态 |
|---|---|
| 默认系统提示词 116 字主体 | ✔ 已逐字恢复（§4.1） |
| 该 116 字在 `reference/` 任一文件中的记录 | ✘ **NOT FOUND**（提取器模型不覆盖） |
| 该提示词**完整的**运行时拼装结果（各段顺序、每段间换行） | ⚠ **不确定** |
| `- 用中文输出。` 是否属于同一提示词 | ⚠ **不确定**（中间隔着 4 条 1 字符记录） |
| 提示词注入「工具说明」的具体段落 | ✘ **NOT FOUND**（只有 `已启用（…用法详见工具说明）` 这类引用） |

已确认存在的相关片段（逐字，供后续拼装）：

- 你是一个创意小说写作助手。你可以读取和写入小说项目目录中的文件。当用户要求你写作 → **reference/ 中 NOT FOUND**；原始字节偏移 `app.so:0x002498f0`（本次恢复）
- `- 用中文输出。` → `app_so_full_utf16.txt:00249b38`, `zh_ui_strings.txt:00249b38`, `utf16_objects_all.txt:00249b38`
- `已启用（web_search 工具可用）` → `app_so_full_utf16.txt:003b2038`, `zh_ui_strings.txt:003b2038`, `utf16_objects_all.txt:003b2038`
- `已启用（rank_data_query 工具可用，用法详见工具说明）` → `app_so_full_utf16.txt:002abc18`, `zh_ui_strings.txt:002abc18`, `utf16_objects_all.txt:002abc18`

### 6.6 技能注入格式：结构已知，细节不确定

| 项 | 状态 |
|---|---|
| `## Available Skills` 块头 | ✔ 逐字（`0039d178`） |
| `<available_skills>` 开标签 | ✔ 逐字（含在块头串末） |
| `</available_skills>` 闭标签 | ✔ 逐字（`0041d201`） |
| `  <skill>` / `    <name>` / `</name>` / `    <description>` / `</description>` / `  </skill>` | ✔ 六个片段均逐字 |
| 六片段之间的**换行** | ⚠ **不确定**：六条片段**自身不含 `\n`**，组合时是否插换行无逐字证据 |
| 缩进空格数 | ✔ 由片段自带（`  <skill>` 前 2 空格、`    <name>` 前 4 空格） |
| 技能条目的字段是否仅 name + description | ⚠ **不确定**：只找到这两个字段标签 |
| 标签是否 XML 转义技能描述里的特殊字符 | ✘ **NOT FOUND**（无相关文案） |

### 6.7 事件名：NOT FOUND

| 项 | 状态 |
|---|---|
| `ai_run_finished` | ✘ **NOT FOUND** |
| `ai_error` | ✘ **NOT FOUND** |
| `ai_thinking_completed` | ✘ **NOT FOUND** |
| `ai_text_completed` | ✘ **NOT FOUND** |
| `ai_tool_failed` | ✘ **NOT FOUND** |
| `ai_run_failed` | ✘ **NOT FOUND** |

全库正则 `\bai_[a-z_]{3,40}\b` 的**完整**命中集（共 10 条，无遗漏）：

- `ai_cleanup_completed` → `app_so_full_strings.txt:002acfb0`
- `ai_tool_completed` → `app_so_full_strings.txt:002efde0`
- `ai_run_completedr` → `app_so_full_strings.txt:00322ef0`
- `ai_cleanup_started` → `app_so_full_strings.txt:0035f260`
- `ai_thinking_started` → `app_so_full_strings.txt:0036bc30`
- `ai_tool_calls_received` → `app_so_full_strings.txt:00391ce0`
- `ai_text_started` → `app_so_full_strings.txt:003b8520`
- `ai_run_started` → `app_so_full_strings.txt:0043c3a0`
- `ai_tool_started` → `app_so_full_strings.txt:00462b40`
- `ai_file_write_` → `app_so_full_strings.txt:004a5160`

> 注意：`ai_*` 事件名的**绑定方式**（Dart 侧 `EventChannel` 名 vs 普通字符串常量）
> **NOT FOUND**——本次只做字符串层，未做代码引用分析。

### 6.8 CONTRACT.md 引用但原始文件中不存在的工具文案

以下文案被 `CONTRACT.md §4` 引用为逐字证据，但**全库检索不到**：

| 文案 | CONTRACT 出处 | 检索结论 |
|---|---|---|
| `直接调用 file_write 工具` | CONTRACT.md §4.1 表格 | ✘ **NOT FOUND** |
| `create_skill 工具保存` | CONTRACT.md §4.1 表格 | ✘ **NOT FOUND** |
| `update_skill 更新` | CONTRACT.md §4.1 表格 | ✘ **NOT FOUND** |
| `使用 question 工具询问` | CONTRACT.md §4.1 表格（全句形态不存在） | ✘ **NOT FOUND** |
| `【高危命令】命中内置风险词表，请逐字核对命令内容后再允许` | CONTRACT.md §4.5 | ✘ **NOT FOUND** |

逐条说明：

- `直接调用 file_write 工具`：`file_write 工具` 只命中 `交互式编辑器，请用 file_write 工具写文件`
  （`app_so_full_utf16.txt:003a7e38`），**不是** `直接调用` 句式。
- `create_skill 工具保存` / `update_skill 更新`：全库无此二句式。
- `使用 question 工具询问`：作为**完整句**不存在；`question` 一词在
  `app_so_full_utf16.txt:003982e8`（skill-creator 技能正文，len=3867）中出现，
  但那是技能文档正文，不是 CONTRACT 引用的提示语句式。
- `【高危命令】…`：全库连子串「高危命令」「内置风险词表」「命中内置」都**零命中**。

**这一节的结论请优先于 CONTRACT.md**：CONTRACT 这几条属转述而非逐字引用，
writerD 不应以它们为逐字真源。

### 6.9 覆盖缺口：reference 文件本身丢了什么

| 缺口 | 影响 | 本次是否补上 |
|---|---|---|
| `WIN_app.so.strings.txt` 把 ASCII 串截断到 400 字节 | 长描述串中间段落丢失 | ✔ 已用 `app_so_full_strings.txt` 补上 |
| `utf16_objects_all.txt` 的对象头模型漏采 | 系统提示词整条丢失 | ✔ 已用原始字节解码补上 |
| Android APK 层（`APK_libapp.so.strings.txt`） | 12 个工具名 **零命中** | ✘ 未在 APK 层找到任何工具文案 |

受 400 字节截断影响的**业务文案**只有 2 条，均已在 §2 用全文给出：

| 文案 | reference 文件长度 | 真实长度 | 丢失内容 |
|---|---|---|---|
| `terminal` 工具描述（`003c7980`） | 401 | 612 | 中间 211 字符 |
| `create_skill` 的 resources 参数描述（`00248820`） | 401 | 433 | 尾部 32 字符 |

`create_skill` 该参数被截断后缺的尾句（本次补全）为：

- `app_so_full_strings.txt:00248820`（len=433，全文）

其余 12 条长度 401 的记录都是 Flutter / Office OpenXML 噪声（`<w:numbering …>`、
`<a:fillStyleLst …>`、`^ {0,3}(?:<(?<condition_1>…` 等），**不是**业务文案。

### 6.10 其他确定未找到的项

| 检索项 | 结论 |
|---|---|
| `edit_file` 的 operation 独立枚举串 | ✘ NOT FOUND（只有与 file_write 共用的描述串） |
| 工具 schema 的 JSON 字面量（如 `"name":"file_read"`） | ✘ NOT FOUND（Flutter AOT 不保留 JSON） |
| `skill_lookup` 的 operation 枚举 | ✘ NOT FOUND |
| `web_search` 的 operation 枚举 | ✘ NOT FOUND |
| `question` 的 operation 枚举 | ✘ NOT FOUND |
| `create_project` 的 operation 枚举 | ✘ NOT FOUND |
| 技能注入的 XML 转义规则 | ✘ NOT FOUND |
| `## Available Skills` 之后、`<available_skills>` 之前的换行数 | ✔ 逐字（块头串内为 `\n\n`） |

### 6.11 统计汇总

| 项 | 计数 |
|---|---|
| 任务指定工具数 | 12 |
| 找到工具描述全文的工具 | 11（缺 `edit_file`） |
| 找到 operation/枚举的工具 | 4（`file_read`、`file_write`、`edit_file` 同源、`file_manage`） |
| 校验文案（exact match，去重后） | 24 条英文（§3.1 的 18 + §3.2 的 6）+ 5 条中文片段 |
| 参数描述串（本次累计找到） | 30+ 条（见 §3.7 与各工具节） |
| 流式事件名 | 9 条（任务给 6 条全中，另加 3 条） |
| 错误分类文案 | 9 条，全部 EXACT 命中 |
| `NOT FOUND` 明确项 | 20 条 |
| ⚠ 未决项 | 6 条（4 条尾随 `r` + 拼装顺序 + 注入换行） |

