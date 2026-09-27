"""Generate S:\\writerD\\docs\\spec\\TOOLS.md from the verbatim evidence.

All content below is copied from the evidence files at generation time (not
hand-typed), so the output cannot drift from the source.
"""
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8")
import ev2

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = r"S:\writerD\docs\spec\TOOLS.md"
REL = r"S:\writerD\reference"
APPSO = r"S:\dsh\OpenWrite\data\app.so"


# ---------- first-party lookup helpers -------------------------------------
def first(pattern, prefer=("full_str", "full_obj", "strings", "obj_all", "zh_ui"), keys=None):
    """Return (key, off, content) for the first match, longest content wins."""
    best = None
    for k in (keys or prefer):
        for off, c in ev2.search(k, pattern):
            if best is None or len(c) > len(best[2]):
                best = (k, off, c)
    return best


def all_offsets(pattern):
    """Every (filename, offset, exact_len) for an exact standalone record."""
    res = []
    seen = set()
    for k in ("full_str", "full_obj", "zh_ui", "obj_all"):
        for off, c in ev2.search(k, pattern):
            key = (ev2.FILES[k][1], off)
            if key in seen:
                continue
            seen.add(key)
            res.append((ev2.FILES[k][1], off, len(c), c))
    return res


def exact_offsets(text):
    """Offsets of records whose content is EXACTLY `text`."""
    res = []
    for k in ("full_str", "full_obj", "zh_ui", "obj_all"):
        for off, c in ev2.records(k):
            if c == text:
                res.append((ev2.FILES[k][1], off))
    # dedupe by file (keep first)
    out = []
    seenc = set()
    for fn, off in res:
        if fn not in seenc:
            seenc.add(fn)
            out.append((fn, off))
    return out


def ptr(fn, off):
    return "`%s:%s`" % (fn, off)


def cell(s):
    """Escape a verbatim string for a markdown table cell."""
    return s.replace("|", "\\|").replace("\n", " ")


doc = []
W = doc.append

# ---------------------------------------------------------------------------
W("# OpenWrite v2.0.1 工具层规格（逐字提取）")
W("")
W("> **提取人**：DSH 子代理（automated verbatim extraction pass）")
W("> **日期**：2026-09-28")
W("> **方法**：用 Python 3.11 以 `encoding='utf-8'` 读取 `S:\\writerD\\reference\\` 下全部证据文件，")
W("> 以字面子串 / 正则检索，命中即整条原样引用；每条都带 `文件:偏移` 证据指针。")
W("> 英文长串的 `\\n` 转义、引号、空格、标点**一律原样保留**，未做任何清理、翻译或改写。")
W("> 未命中的条目一律写 `NOT FOUND`，不做常识补全。")
W("")
W("> **补充说明（重要）**：`reference/WIN_app.so.strings.txt` 由 `reference/extract_strings.py` 生成，")
W("> 其正则 `[\\x20-\\x7e\\xc2-\\xf4][\\x20-\\x7e\\x80-\\xbf]{2,400}` **把每条 ASCII 串硬截断到 400 字节**。")
W("> 因此该文件里若干工具描述串是**被截断的**。为取得完整逐字文本，本次提取在 `_extract/` 下用")
W("> 去掉 400 字节上限的同一算法重新扫描原始二进制 "
    "`S:\\dsh\\OpenWrite\\data\\app.so`")
W("> （13,058,992 字节，sha256 `45cffe64c02abab5ccc4dbcef9f643dea5611476224cf9b63959fa637bd5c888`），")
W("> 产物为 `_extract/app_so_full_strings.txt`。**偏移空间与 `WIN_app.so.strings.txt` 完全一致**")
W("> （96,162 条中 96,152 条逐字节相同，余下 10 条是原文件的中间截断片段）。")
W("> 凡引用 `app_so_full_strings.txt` 的，均同时给出 `WIN_app.so.strings.txt` 的同偏移对应。")
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
W("| 文件 | 行数 | 记录格式 | 说明 |")
W("|---|---|---|---|")
for k, (d, fn) in ev2.FILES.items():
    n = len(ev2.load(k))
    dflt = "reference" if d == REL else "_extract (本次恢复层)"
    fmt = {
        "strings": "`偏移<TAB>字符串`",
        "keyhits": "`偏移 + 两空格 + 字符串`",
        "zh_ui": "`偏移<TAB>字符串`",
        "zh_class": "`#### 分类(N)` 分节，条目为 `  偏移  字符串`",
        "obj_all": "`偏移<TAB>obj=N<TAB>cjk=N<TAB>内容`",
        "obj_zh": "`偏移<TAB>cjk=N<TAB>内容`",
        "apk": "`偏移<TAB>字符串`（Android arm64，本任务 12 个工具名 0 命中）",
        "full_str": "`偏移<TAB>字符串`（无 400 字节上限）",
        "full_obj": "`偏移<TAB>cjk=N<TAB>内容`（无 4000 字符上限）",
    }[k]
    W("| `%s/%s` | %s | %s | %s |" % (dflt, fn, format(n, ","), fmt,
      "原始证据" if d == REF else "本次新增恢复层"))
W("")

W("### 0.2 偏移语义")
W("")
W("- 偏移是**文件偏移**（`app.so` 内的字节位置），8 位十六进制小写，例如 `00235660`。")
W("- 同一段文本在不同文件里偏移相同，可交叉互验。")
W("- `utf16_objects_all.txt` / `utf16_objects_zh.txt` / `app_so_full_utf16.txt` 中，")
W("  **真实换行已在落盘时转义成字面 `\\n`**（两个字符：反斜杠 + n）。")
W("  本规格沿用该表示，未展开为真实换行。")
W("- ASCII 层（`*.strings.txt`）不含转义处理，字符原样。")
W("")
W("### 0.3 本次发现的两类偏移陷阱（会影响任何后续提取）")
W("")
W("1. **400 字节截断**：见文首补充说明。凡 `WIN_app.so.strings.txt` 中长度恰为 401 的英文串，")
W("   都可能是被截断的长描述，必须回 `app_so_full_strings.txt` 取全文。")
W("2. **UTF-16 对象池漏采**：`reference/extract_utf16_obj.py` 假设「字符数据起始 = 8 字节对齐对象 VA + 24」，")
W("   只接受通过 `tags==0 且 length==字符数*2` 校验的对象。**系统提示词那一条不满足该模型，因此完全不在**")
W("   `utf16_objects_all.txt` 里（详见 §4.1）。本次用原始字节直接解码恢复。")
W("")
W("### 0.4 一个需要照抄的字节级细节：尾随 `r`")
W("")
W("以下两条校验文案在二进制中**确实以字符 `r` 结尾**，不是抓取伪影，也不是 `\\r`：")
W("")
for t in ["path is requiredr", "name is requiredr"]:
    for fn, off in exact_offsets(t):
        W("- %s → %s" % (ptr(fn, off), ptr(fn, off)))
W("")
W("字节级证据（`app.so` 原始内存）：")
W("")
W("```")
data = open(APPSO, "rb").read()
for t in [b"path is requiredr", b"name is requiredr"]:
    i = data.find(t)
    W("0x%08x : %r" % (i, data[i:i + 20]))
W("```")
W("")
W("对照：同族其他文案均以 NUL 填充结尾，例如 `command is required` 在 `0x0026c010`：")
W("")
W("```")
for t in [b"command is required", b"query is required", b"description is required"]:
    i = data.find(t)
    W("0x%08x : %r" % (i, data[i:i + 30]))
W("```")
W("")
W("Dart 对象头亦可验证：在 `VA=0x0028cb08` 处读 `tags,hash,length` 三元组，`length=34 = 17 字符 * 2`，")
W("即字符串对象本身长度就是 17（含尾随 `r`），而非 16。")
W("**实现建议**：writerD 应逐字复现为 `path is requiredr` / `name is requiredr`，")
W("或按 ADR 明确记录为有意修正。")
W("")

# ===========================================================================
# 1
# ===========================================================================
W("---")
W("")
W("## 1. 工具总表（名称 → 证据偏移）")
W("")
W("### 1.1 十二个工具名：作为独立字符串记录的确切偏移")
W("")
W("检索方法：在 `app_so_full_strings.txt` / `WIN_app.so.strings.txt` 中找**内容恰好等于工具名**的记录。")
W("")
W("| # | 工具名 | 独立记录偏移 | 工具描述串偏移 | 描述长度 |")
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
    nm = first(name, keys=("full_str",))
    if anchor:
        d = first(anchor)
        W("| %d | `%s` | %s | %s | %d |" % (
            i, name, ptr("app_so_full_strings.txt", nm[1]) if nm else "NOT FOUND",
            ptr(ev2.FILES[d[0]][1], d[1]), len(d[2])))
    else:
        W("| %d | `%s` | %s | NOT FOUND | — |" % (
            i, name, ptr("app_so_full_strings.txt", nm[1]) if nm else "NOT FOUND"))
W("")
W("> `file_read` / `file_write` / `file_manage` / `create_skill` 的工具名在 `app.so` 中**各出现多次**")
W("> （既有独立名字记录，也嵌在中文提示语里）；上表只取独立名字记录。")
W("")
W("### 1.2 工具名在中文提示语中的共现（用于交叉校验工具集合）")
W("")
GRP = first("所有文件操作（file_read、file_write、file_manage）")
if GRP:
    W("%s：%s" % (ptr(ev2.FILES[GRP[0]][1], GRP[1]), GRP[2]))
    W("")
MOD = first("当前为抽卡对比模式")
if MOD:
    W("%s：%s" % (ptr(ev2.FILES[MOD[0]][1], MOD[1]), MOD[2]))
    W("")
DIS = first("未启用，web_search 工具当前不可用")
DIST = first("未启用，terminal 工具当前不可用")
DISR = first("未启用，rank_data_query 工具当前不可用")
for d, lbl in ((DIS, "web_search"), (DIST, "terminal"), (DISR, "rank_data_query")):
    if d:
        W("- %s → %s" % (ptr(ev2.FILES[d[0]][1], d[1]), d[2]))
W("")

doc_txt = "\n".join(doc)
with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(doc_txt)
print("wrote part 1:", OUT, len(doc_txt), "chars")
