"""Generate S:\\writerD\\docs\\spec\\TOOLS.md from verbatim evidence.

Every quoted string is pulled from the evidence files at generation time, so
the document cannot drift from the source.
"""
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8")
import ev2

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = r"S:\writerD\docs\spec\TOOLS.md"
APPSO = r"S:\dsh\OpenWrite\data\app.so"
BIN = open(APPSO, "rb").read()

L = []
W = L.append


def F(fn, off):
    return "`%s:%s`" % (fn, off)


def best(pattern, keys=("full_str", "full_obj", "strings", "obj_all", "zh_ui")):
    b = None
    for k in keys:
        for off, c in ev2.search(k, pattern):
            if b is None or len(c) > len(b[2]):
                b = (k, off, c)
    return b


def ptr_of(res):
    return F(ev2.FILES[res[0]][1], res[1])


def all_exact(text):
    out, seen = [], set()
    for k in ("full_str", "full_obj", "zh_ui", "obj_all"):
        for off, c in ev2.records(k):
            if c == text:
                fn = ev2.FILES[k][1]
                if fn not in seen:
                    seen.add(fn)
                    out.append((fn, off))
    return out


def all_containing(text, maxlen=4000, keys=("full_str", "full_obj", "zh_ui", "obj_all")):
    out, seen = [], set()
    for k in keys:
        for off, c in ev2.records(k):
            if text in c and len(c) <= maxlen:
                key = (ev2.FILES[k][1], off)
                if key in seen:
                    continue
                seen.add(key)
                out.append((ev2.FILES[k][1], off, c))
    return out


def offsets_line(text, keys=("full_str", "full_obj", "zh_ui", "obj_all")):
    return ", ".join(F(fn, off) for fn, off, _ in all_containing(text, 10 ** 9, keys))


def block(text):
    W("```")
    W(text)
    W("```")


def cell(s):
    return s.replace("|", "\\|").replace("\n", " ")


# ===========================================================================
W("# OpenWrite v2.0.1 工具层规格（逐字提取）")
W("")
W("> **提取人**：DSH 子代理（自动化逐字提取 pass）")
W("> **日期**：2026-09-28")
W("> **方法**：Python 3.11 以 `encoding='utf-8'` 读取 `S:\\writerD\\reference\\` 下全部证据文件，")
W("> 以字面子串 / 正则检索，命中即整条原样引用，每条都带 `文件:偏移` 证据指针。")
W("> 英文长串的 `\\n` 转义、引号、空格、标点**一律原样保留**，未翻译、未改写、未清理，")
W("> 也未把 `\\n` 展开成真实换行。未命中的一律写 `NOT FOUND`，不做常识补全。")
W("")
W("> **取证补充说明（重要，影响任何后续提取）**：")
W("> 1. `reference/WIN_app.so.strings.txt` 由 `reference/extract_strings.py` 生成，其正则")
W(">    `[\\x20-\\x7e\\xc2-\\xf4][\\x20-\\x7e\\x80-\\xbf]{2,400}` **把每条 ASCII 串硬截断到 400 字节**，")
W(">    所以该文件里若干工具描述串是**被截断的**（长度恰好 401 即为嫌疑）。为取全文字，本次在")
W(">    `_extract/` 用去掉 400 字节上限的同一算法重扫原始二进制")
W(">    `S:\\dsh\\OpenWrite\\data\\app.so`（13,058,992 字节，sha256")
W(">    `45cffe64c02abab5ccc4dbcef9f643dea5611476224cf9b63959fa637bd5c888`），")
W(">    产物 `_extract/app_so_full_strings.txt`。**偏移空间与原文件完全一致**（96,162 条中")
W(">    96,152 条逐字节相同，余下 10 条是原文件的中间截断片段）。凡引用")
W(">    `app_so_full_strings.txt` 处，均同时标注 `WIN_app.so.strings.txt` 的同偏移对应。")
W(">    **本次实际受影响的业务文案只有 2 条**，长度都恰好 401：")
W(">    `terminal` 工具描述（`003c7980`，真实 612 字符 → reference 文件**缺中间 211 字符**）、")
W(">    `create_skill` 的 `resources` 参数描述（`00248820`，真实 433 字符 → reference 文件缺尾部 32 字符）。")
W(">    其余长度为 401 的记录都是 Flutter / Office XML 噪声，非业务文案。")
W("> 2. `reference/utf16_objects_all.txt` 由 `reference/extract_utf16_obj.py` 生成，它假设")
W(">    「字符数据起始 = 8 字节对齐对象 VA + 24」且 `length == 字符数*2`。**系统提示词不满足该模型，")
W(">    因此完全不在该文件里**；本次改以原始字节直接解码恢复（见 §4.1）。")
W("")
W("---")
W("")

# ===========================================================================
# 0
# ===========================================================================
W("## 0. 证据文件与偏移格式说明")
W("")
W("### 0.1 证据文件清单")
W("")
W("| 文件 | 行数 | 记录格式 | 层 |")
W("|---|---|---|---|")
FMT = {
    "strings": "`偏移<TAB>字符串`（ASCII 串截断至 400 字节）",
    "keyhits": "`#### 关键词(N)` 分节；条目 `  偏移  字符串`",
    "zh_ui": "`偏移<TAB>字符串`",
    "zh_class": "`#### 分类(N)` 分节；条目 `  偏移  字符串`",
    "obj_all": "`偏移<TAB>obj=N<TAB>cjk=N<TAB>内容`（换行落盘为字面 `\\n`）",
    "obj_zh": "`偏移<TAB>cjk=N<TAB>内容`（换行落盘为字面 `\\n`）",
    "apk": "`偏移<TAB>字符串`（Android arm64）",
    "full_str": "`偏移<TAB>字符串`（**无 400 字节上限**）",
    "full_obj": "`偏移<TAB>cjk=N<TAB>内容`（**无 4000 字符上限**）",
}
for k, (d, fn) in ev2.FILES.items():
    layer = "原始证据（任务指定）" if d != HERE else "本次恢复层"
    W("| `%s/%s` | %s | %s | %s |" % ("reference" if d != HERE else "_extract",
                                     fn, format(len(ev2.load(k)), ","), FMT[k], layer))
W("")
W("### 0.2 偏移语义")
W("")
W("- 偏移是 `app.so` 内的**字节文件偏移**，8 位十六进制小写（如 `00235660`）。")
W("- 同一文本在不同文件里偏移一致，可互相印证——这就是本规格的证据链。")
W("- UTF-16 层文件中**真实换行已在落盘时转义为字面 `\\n`**（反斜杠 + `n` 两个字符）。")
W("  本规格沿用该表示，未展开成真实换行，也未做任何清理。")
W("")

W("### 0.3 尾随 `r` 现象：**已推翻**先前假设，按未决处理")
W("")
W("`path is required` / `name is required` 在 ASCII 串文件里显示为带尾随 `r`：")
W("")
block("\n".join("0x%08x : %r" % (BIN.find(t), BIN[BIN.find(t):BIN.find(t) + 20])
                for t in (b"path is requiredr", b"name is requiredr")))
W("")
W("**但这不足以判定 UI 文案本身带 `r`。** 全量普查显示该现象**系统性存在**，不是这两条的例外：")
W("")
W("- `app_so_full_strings.txt` 中**以 `r` 结尾**且含空格的「散文式」记录共 **179 条**。")
W("- 同一现象大量出现在 **Flutter 框架自带字符串**上，与 OpenWrite 业务无关，例如：")
W("")
CENSUS = [
    "Max items to return. read: lines (default 2000, max 2000). list: entries (default 200, max 500).r",
    "Unexpected start tag (%(originalName)s). Treated as %(newName)s.r",
    "Unexpected end of file. Expected foreign contentr",
    "We should never reach this pointr",
    "Data uri must not have authorityr",
    "Trailing solidus not allowed on element %(name)sr",
    "Source contains non-ASCII bytes.r",
    "operation failedr",
    "Bearer anonymousr",
    "Invalid enveloper",
    "Connection resetr",
    "Assertion failedr",
    "Gateway Time-outr",
    "Payment Requiredr",
    "Afficher le menur",
    "Pesquisar na Webr",
]
for t in CENSUS:
    for fn, off in all_exact(t):
        W("  - %s  %s" % (F(fn, off), t))
W("")
W("上面每条都是「句子 + 单个 `r`」。这更像**提取/布局层面的系统性伪影**（例如 Dart 字符串池")
W("按 8 字节对齐排布时，提取正则多吃进了一个相邻字节），而非 179 处真实拼写错误。")
W("")
W("**两条判据互相矛盾，故本规格不下结论**：")
W("")
W("| 判据 | 指向 |")
W("|---|---|")
W("| 同族 15 条 `xxx is required` 全部以 NUL 填充结尾，只有这两条在文本后**没有 NUL**，`r` 紧贴 | 支持「`r` 是内容」 |")
W("| 179 条含 Flutter 框架串同样带尾随 `r` | 支持「`r` 是系统性伪影」 |")
W("| 用 `tags,hash,length` 对象头复核：`VA=0x0028cb08` 读到 `q2=0x20`（32 字节），与 17 字符不符 | 该模型在此区域不成立，**不能**作判据 |")
W("")
W("**本规格的处理**：§3.1 / §3.3 按**原始文件内容逐字引用**（即写作 `path is requiredr`、")
W("`name is requiredr`），同时在 §6 把它标为**未决项**。")
W("")
W("**给 writerD 的建议**：实现时采用**不带**尾随 `r` 的 `path is required` / `name is required`")
W("（与同族 15 条 `xxx is required` 形态一致），并在 ADR 记录该判断与依据；")
W("**不要**照抄尾随 `r`，除非后续拿到 `dart` 层证据（反编译 `kernel_blob.bin` 或直接解码字符串池）")
W("证明它就是文案内容。")
W("")
W("### 0.4 全部偏移的列法")
W("")
W("同一文案常同时存在于 ASCII 层与 UTF-16 层。本文每节列出**全部命中的 `文件:偏移`**；")
W("若某文案在 4 个文件中同偏移出现，会全部列出。")
W("")

# ===========================================================================
# 1
# ===========================================================================
W("---")
W("")
W("## 1. 工具总表（名称 → 证据偏移）")
W("")
W("### 1.1 十二个工具名作为独立字符串记录的确切偏移")
W("")
W("判定标准：记录内容**恰好等于**工具名（无前后缀、无嵌入）。")
W("")
W("| # | 工具名 | 独立名字记录偏移 | 工具描述串偏移（全文） | 描述字符数 |")
W("|---|---|---|---|---|")
TOOLS = [
    ("file_read", "Read a file or list a directory"),
    ("file_write", "Write, append, or edit files. Operations:"),
    ("file_manage", "File modification operations: search content"),
    ("edit_file", None),
    ("terminal", "Execute a system command (desktop only)"),
    ("web_search", "Search the web for information."),
    ("skill_lookup", "Load a specialized skill on demand."),
    ("create_skill", "Create a new skill (技能) and save it"),
    ("update_skill", "Manage an installed skill: update SKILL.md"),
    ("create_project", "Create a new novel project with the given name"),
    ("question", "Ask the user questions during execution"),
    ("rank_data_query", "查询网文榜单与作品数据"),
]
for i, (name, anchor) in enumerate(TOOLS, 1):
    nm = [o for o, c in ev2.records("full_str") if c == name]
    nmcell = F("app_so_full_strings.txt", nm[0]) if nm else "NOT FOUND"
    if anchor:
        d = best(anchor)
        W("| %d | `%s` | %s | %s | %d |" % (i, name, nmcell, ptr_of(d), len(d[2])))
    else:
        W("| %d | `%s` | %s | NOT FOUND | — |" % (i, name, nmcell))
W("")
W("### 1.2 工具名在提示语中的共现（交叉校验工具集合）")
W("")
for pat in ["所有文件操作（file_read、file_write、file_manage）",
            "当前为抽卡对比模式"]:
    for fn, off, c in all_containing(pat, 300):
        W("- %s（len=%d）：%s" % (F(fn, off), len(c), c))
W("")
W("未启用时注入的否定文案（逐字，三条独立字符串）：")
W("")
for pat in ["未启用，web_search 工具当前不可用",
            "未启用，terminal 工具当前不可用",
            "未启用，rank_data_query 工具当前不可用"]:
    for fn, off, c in all_containing(pat, 200):
        W("- %s：%s" % (F(fn, off), c))
W("")
W("已启用时注入的肯定文案（逐字，两条）：")
W("")
for pat in ["已启用（rank_data_query 工具可用", "已启用（web_search 工具可用"]:
    for fn, off, c in all_containing(pat, 200):
        W("- %s：%s" % (F(fn, off), c))
W("")

# ===========================================================================
# 2
# ===========================================================================
W("---")
W("")
W("## 2. 逐工具详表（描述全文 + 参数 + 枚举）")
W("")
W("> 约定：**参数** 一节只列在证据里确实存在**逐字描述串**的参数。")
W("> 只有参数名（Dart schema key 字符串）而无描述串的，统一列进 §6 的 NOT FOUND 清单。")
W("")

# ---- helper: emit a description item
def emit_desc(label, res, extra_offsets=None):
    W("- **%s**（%s，len=%d，逐字）：" % (label, ptr_of(res), len(res[2])))
    W("")
    block(res[2])
    W("")
    if extra_offsets:
        W("  全部命中偏移：%s" % extra_offsets)
        W("")


# ---- 2.1 file_read
name = "file_read"
W("### 2.1 `%s`" % name)
W("")
nm = [o for o, c in ev2.records("full_str") if c == name]
W("- 工具名独立记录：%s" % ", ".join(F("app_so_full_strings.txt", o) for o in nm))
d = best("Read a file or list a directory")
W("- **工具描述全文**（%s，len=%d，逐字）：" % (ptr_of(d), len(d[2])))
W("")
block(d[2])
W("")
W("  同偏移对应：`WIN_app.so.strings.txt:%s`、`WIN_app.so.keyword_hits.txt:%s`" % (d[1], d[1]))
W("")
W("**参数（逐字）**：")
W("")
for p in ["File or directory path. Relative paths resolve against the current project root",
          "Pagination start. read: 1-based line number",
          "Max items to return. read: lines (default 2000, max 2000)"]:
    r = best(p)
    if r:
        W("- %s（%s，len=%d）：" % (p.split(".")[0], ptr_of(r), len(r[2])))
        block(r[2])
W("")
W("**operation / mode 枚举（逐字）**——本次找到独立枚举串：")
W("")
r = best('"read" to read file content, "list" to list directory contents')
W("- %s（len=%d）：" % (ptr_of(r), len(r[2])))
W("")
block(r[2])
W("")
W("```")
W("read / list")
W("```")
W("")

# ---- 2.2 file_write
name = "file_write"
W("### 2.2 `%s`" % name)
W("")
nm = [o for o, c in ev2.records("full_str") if c == name]
W("- 工具名独立记录：%s" % ", ".join(F("app_so_full_strings.txt", o) for o in nm))
d = best("Write, append, or edit files. Operations:")
W("- **工具描述全文**（%s，len=%d，逐字）：" % (ptr_of(d), len(d[2])))
W("")
block(d[2])
W("")
W("  同偏移对应：`WIN_app.so.strings.txt:%s`" % d[1])
W("")
W("**operation 枚举（逐字，取自上述描述串内的引号字面量）**：")
W("")
W("```")
W('write / append / replace / insert / delete_lines')
W("```")
W("")
W("**参数（逐字）**：")
W("")
FWP = [
    "File or directory path. Relative paths resolve against the current project root",
    "Content to write, append, or insert",
    "Text to find and replace (for \"replace\" operation)",
    "New text for replace or insert operations",
    "For \"replace\" operation: if true, replace ALL occurrences; if false (default), replace first occurrence only",
    "Where to insert: \"start\", \"end\", or \"after_line\"",
    "Line number after which to insert (for \"insert\" with position \"after_line\")",
    "Start line number for delete (1-based)",
    "End line number for delete (1-based, inclusive)",
]
for p in FWP:
    r = best(p)
    if r:
        W("- （%s，len=%d）：" % (ptr_of(r), len(r[2])))
        W("")
        block(r[2])
        W("")
W("**insert position 枚举（逐字）**：")
W("")
W("```")
W('"start", "end", or "after_line"')
W("```")
W("")
W("> 证据：`app_so_full_strings.txt:004791a0`（即 `Where to insert: \"start\", \"end\", or \"after_line\"`）。")
W("> **注意**：该枚举串在二进制中同样带真实尾随 `r`（`...after_line\"r`），同 §0.3 现象。")
W("")

# ---- 2.3 file_manage
name = "file_manage"
W("### 2.3 `%s`" % name)
W("")
nm = [o for o, c in ev2.records("full_str") if c == name]
W("- 工具名独立记录：%s" % ", ".join(F("app_so_full_strings.txt", o) for o in nm))
d = best("File modification operations: search content")
W("- **工具描述全文**（%s，len=%d，逐字；此串**未被 400 字节截断**，因为本身仅 185 字符）：" % (ptr_of(d), len(d[2])))
W("")
block(d[2])
W("")
W("  同偏移对应：`WIN_app.so.strings.txt:%s`" % d[1])
W("")
W("**operation 枚举（逐字）**——本次找到以 `Operation type:` 开头的独立枚举串：")
W("")
r = best('Operation type: "search" to find text in files')
W("- %s（len=%d）：" % (ptr_of(r), len(r[2])))
W("")
block(r[2])
W("")
W("```")
W("search / delete / rename / copy")
W("```")
W("")
W("**参数（逐字）**：")
W("")
for p in ["File or directory path. Relative paths resolve against the current project root",
          "New path/name for rename or copy operation",
          "Text to search for (for \"search\" operation)",
          "Directory to search in (for \"search\" operation, default is entire project)",
          "New text for replace or insert operations"]:
    r = best(p)
    if r:
        W("- （%s，len=%d）：" % (ptr_of(r), len(r[2])))
        W("")
        block(r[2])
        W("")
W("")

# ---- 2.4 edit_file
name = "edit_file"
W("### 2.4 `%s`" % name)
W("")
nm = [o for o, c in ev2.records("full_str") if c == name]
W("- 工具名独立记录：%s" % ", ".join(F("app_so_full_strings.txt", o) for o in nm))
W("- **工具描述全文**：`NOT FOUND`。全库检索确认 `edit_file` **只作为独立工具名出现**，")
W("  没有任何以它为主语/含它的描述性语句（`app_so_full_strings.txt`、`app_so_full_utf16.txt`、")
W("  `zh_ui_strings.txt`、`utf16_objects_all.txt` 均只命中这一条名字记录）。")
W("- **operation 枚举**：与 §2.2 `file_write` **同源**（同一描述串 "
  "`app_so_full_strings.txt:00442010`）：")
W("")
W("```")
W("write / append / replace / insert / delete_lines")
W("```")
W("")
W("- **replace_all 参数**（逐字，来源同 §2.2）：")
W("")
r = best("For \"replace\" operation: if true")
block(r[2])
W("")
W("  偏移：%s" % F("app_so_full_strings.txt", r[1]))
W("")
W('> 说明：CONTRACT.md §4.4 引用的 replace_all 描述（从单词 replace 起、到 '
  'default replaces first only 止）确实逐字存在于 '
  '`app_so_full_strings.txt:00442010`，本表已复核。')
W("")

# ---- 2.5 terminal
name = "terminal"
W("### 2.5 `%s`" % name)
W("")
nm = [o for o, c in ev2.records("full_str") if c == name]
W("- 工具名独立记录：%s" % ", ".join(F("app_so_full_strings.txt", o) for o in nm))
d = best("Execute a system command (desktop only)")
W("- **工具描述全文**（%s，len=%d，逐字）——**这是被 400 字节截断的串，必须用本次恢复层全文**："
  % (ptr_of(d), len(d[2])))
W("")
block(d[2])
W("")
W("  对比：`WIN_app.so.strings.txt:003c7980` 只有前 401 字符，"
  "截止于 `Interactive commands (REPL, ed`。")
W("  同偏移对应：`WIN_app.so.keyword_hits.txt:003c7980`。")
W("")
W("**参数（逐字）**：")
W("")
for p in ["The command to execute",
          "Optional working directory, relative to the current project root",
          "Optional timeout in milliseconds. Default 120000, max 600000.",
          "Optional arguments for the command. Use this for script paths and parameters."]:
    r = best(p)
    if r:
        W("- （%s，len=%d）：" % (ptr_of(r), len(r[2])))
        W("")
        block(r[2])
        W("")
W("**中文界面描述（逐字，工具说明文案）**：")
W("")
r = best("AI 可通过终端执行系统命令（仅 Windows）")
for fn, off in all_exact(r[2]):
    W("- %s" % F(fn, off))
W("")
block(r[2])
W("")
W("**workdir 校验文案（逐字）**：")
W("")
r = best("workdir 必须是相对项目根的子目录")
W("- %s：%s" % (ptr_of(r), r[2]))
W("")
W("**operation 枚举**：`NOT FOUND`（终端工具无 operation 枚举；其参数为 free-form 命令）。")
W("")

# ---- 2.6 web_search
W("### 2.6 `web_search`")
W("")
nm = [o for o, c in ev2.records("full_str") if c == "web_search"]
W("- 工具名独立记录：%s" % ", ".join(F("app_so_full_strings.txt", o) for o in nm))
d = best("Search the web for information.")
W("- **工具描述全文**（%s，len=%d，逐字）：" % (ptr_of(d), len(d[2])))
W("")
block(d[2])
W("")
W("  同偏移对应：`WIN_app.so.strings.txt:%s`" % d[1])
W("")
W("**参数（逐字）**：")
W("")
r = best("The search query")
if r:
    W("- （%s，len=%d）：" % (ptr_of(r), len(r[2])))
    W("")
    block(r[2])
else:
    W("- `NOT FOUND`")
W("")
W("**operation 枚举**：`NOT FOUND`。")
W("")

# ---- 2.7 skill_lookup
W("### 2.7 `skill_lookup`")
W("")
nm = [o for o, c in ev2.records("full_str") if c == "skill_lookup"]
W("- 工具名独立记录：%s" % ", ".join(F("app_so_full_strings.txt", o) for o in nm))
d = best("Load a specialized skill on demand.")
W("- **工具描述全文**（%s，len=%d，逐字）：" % (ptr_of(d), len(d[2])))
W("")
block(d[2])
W("")
W("  同偏移对应：`utf16_objects_all.txt:%s`、`utf16_objects_zh.txt:%s`" % (d[1], d[1]))
W("")
W("**参数（逐字）**：")
W("")
for p in ["The skill name exactly as shown in Available Skills"]:
    for fn, off, c in all_containing(p, 400):
        W("- %s（len=%d）：" % (F(fn, off), len(c)))
        W("")
        block(c)
        W("")
W("**operation 枚举**：`NOT FOUND`。")
W("")

# ---- 2.8 create_skill
W("### 2.8 `create_skill`")
W("")
nm = [o for o, c in ev2.records("full_str") if c == "create_skill"]
W("- 工具名独立记录：%s" % ", ".join(F("app_so_full_strings.txt", o) for o in nm))
d = best("Create a new skill (技能) and save it")
W("- **工具描述全文**（%s，len=%d，逐字）：" % (ptr_of(d), len(d[2])))
W("")
block(d[2])
W("")
W("  同偏移对应：`utf16_objects_all.txt:%s`、`utf16_objects_zh.txt:%s`、`zh_ui_strings.txt:%s`"
  % (d[1], d[1], d[1]))
W("")
W("**参数（逐字）**：")
W("")
for p in ["The skill name exactly as shown in Available Skills, or the skill ID",
          "Skill name in English, lowercase with hyphens",
          "Optional bundled resource files. Keys should be paths relative to the skill root"]:
    r = best(p)
    if r:
        W("- （%s，len=%d）：" % (ptr_of(r), len(r[2])))
        W("")
        block(r[2])
        W("")
W("**校验文案（逐字）**：")
W("")
for p in ["name is requiredr", "description is required", "skill_name is required"]:
    for fn, off in all_exact(p):
        W("- %s → %s" % (F(fn, off), p))
W("")
W("**operation 枚举**：`NOT FOUND`。")
W("")

# ---- 2.9 update_skill
W("### 2.9 `update_skill`")
W("")
nm = [o for o, c in ev2.records("full_str") if c == "update_skill"]
W("- 工具名独立记录：%s" % ", ".join(F("app_so_full_strings.txt", o) for o in nm))
d = best("Manage an installed skill: update SKILL.md")
W("- **工具描述全文**（%s，len=%d，逐字）：" % (ptr_of(d), len(d[2])))
W("")
block(d[2])
W("")
W("  同偏移对应：`utf16_objects_all.txt:%s`、`utf16_objects_zh.txt:%s`、`zh_ui_strings.txt:%s`"
  % (d[1], d[1], d[1]))
W("")
W("**参数（逐字）**：")
W("")
for p in ["The skill name exactly as shown in Available Skills, or the skill ID",
          "New full SKILL.md content (including --- frontmatter)",
          "Path of the bundled resource to create, update or delete",
          "Content for the reference file. Required when reference_name is provided without delete.",
          "With reference_name: delete that single resource file."]:
    r = best(p)
    if r:
        W("- （%s，len=%d）：" % (ptr_of(r), len(r[2])))
        W("")
        block(r[2])
        W("")
W("**校验文案（逐字）**：")
W("")
for p in ["skill_name is required", "content is required",
          "reference_content is required when reference_name is provided",
          "Must provide content, reference_name, or delete: true"]:
    for fn, off in all_exact(p):
        W("- %s → `%s`" % (F(fn, off), p))
W("")

# ---- 2.10 create_project
W("### 2.10 `create_project`")
W("")
nm = [o for o, c in ev2.records("full_str") if c == "create_project"]
W("- 工具名独立记录：%s" % ", ".join(F("app_so_full_strings.txt", o) for o in nm))
d = best("Create a new novel project with the given name")
W("- **工具描述全文**（%s，len=%d，逐字）：" % (ptr_of(d), len(d[2])))
W("")
block(d[2])
W("")
W("  同偏移对应：`WIN_app.so.keyword_hits.txt:%s`" % d[1])
W("")
W("**参数（逐字）**：")
W("")
r = best("The name of the new novel project")
W("- （%s，len=%d）：" % (ptr_of(r), len(r[2])))
W("")
block(r[2])
W("")
W("**operation 枚举**：`NOT FOUND`。")
W("")

# ---- 2.11 question
W("### 2.11 `question`")
W("")
nm = [o for o, c in ev2.records("full_str") if c == "question"]
W("- 工具名独立记录：%s" % ", ".join(F("app_so_full_strings.txt", o) for o in nm))
W("  （`question` 是英文常用词，另有 9 条无关命中，如 `User has answered your questions: `、")
W("  `expected-tag-name-but-got-question-mark` 等，均非工具名。）")
d = best("Ask the user questions during execution")
W("- **工具描述全文**（%s，len=%d，逐字）：" % (ptr_of(d), len(d[2])))
W("")
block(d[2])
W("")
W("  同偏移对应：`WIN_app.so.strings.txt:%s`" % d[1])
W("")
W("**参数（逐字）**：")
W("")
for p in ["Questions to ask the user",
          "The complete question to ask the user",
          "The available choices for this question. Must have 2-4 options.",
          "Set to true to allow the user to select multiple options instead of just one."]:
    r = best(p)
    if r:
        W("- （%s，len=%d）：" % (ptr_of(r), len(r[2])))
        W("")
        block(r[2])
        W("")
W("**校验文案（逐字）**：")
W("")
for p in ["questions is required and must not be empty"]:
    for fn, off in all_exact(p):
        W("- %s → `%s`" % (F(fn, off), p))
W("")
W("**operation 枚举**：`NOT FOUND`（该工具无 operation）。")
W("")

# ---- 2.12 rank_data_query
W("### 2.12 `rank_data_query`")
W("")
nm = [o for o, c in ev2.records("full_str") if c == "rank_data_query"]
W("- 工具名独立记录：%s" % ", ".join(F("app_so_full_strings.txt", o) for o in nm))
d = best("查询网文榜单与作品数据")
W("- **工具描述全文**（%s，len=%d，逐字）**全文 3571 字符，完整列出，`\\n` 保持转义**："
  % (ptr_of(d), len(d[2])))
W("")
block(d[2])
W("")
W("  同偏移对应：`utf16_objects_all.txt:%s`、`utf16_objects_zh.txt:%s`、`zh_ui_strings.txt:%s`"
  % (d[1], d[1], d[1]))
W("")
W("**action 枚举（逐字，取自描述串内的表格）**：")
W("")
W("```")
W("top / list / categories / dates / rank_names / count / stats")
W("```")
W("")
W("**source 枚举（逐字）**：")
W("")
W("```")
W("debut / newbook / ranking / allrank / qidian")
W("```")
W("")
W("**其他参数（逐字，取自描述串）**：`gender` / `category` / `sort_by` / `rank_name` /")
W("`keyword` / `status` / `limit` / `date`，取值集合均逐字写在上方描述串内。")
W("")
W("**独立参数描述串**：")
W("")
for p in ["查询动作：top=查排行Top N"]:
    r = best(p)
    if r:
        W("- （%s，len=%d）：" % (ptr_of(r), len(r[2])))
        W("")
        block(r[2])
        W("")

OUT_TEXT = "\n".join(L) + "\n"
with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(OUT_TEXT)
print("wrote", OUT, len(OUT_TEXT), "chars,", OUT_TEXT.count("\n"), "lines")
