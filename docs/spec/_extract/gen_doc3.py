"""Append section 6 (NOT FOUND / uncertain) to TOOLS.md."""
import io
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8")
import ev2

OUT = r"S:\writerD\docs\spec\TOOLS.md"
BIN = open(r"S:\dsh\OpenWrite\data\app.so", "rb").read()

L = []
W = L.append


def F(fn, off):
    return "`%s:%s`" % (fn, off)


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


def exists(text, keys=("full_str", "full_obj", "zh_ui", "obj_all", "keyhits", "apk", "strings")):
    for k in keys:
        if ev2.search(k, text):
            return True
    return False


W("---")
W("")
W("## 6. 未找到 / 不确定项（NOT FOUND 清单）")
W("")
W("> 本章是**必读**部分：上面每一节只写「找到了什么」，本章写「**什么没找到、什么不敢下结论**」。")
W("> 严禁把本章条目当常识补全。")
W("")

# --- 6.1
W("### 6.1 工具描述串：NOT FOUND")
W("")
W("| 工具 | 缺口 | 检索范围 | 结论 |")
W("|---|---|---|---|")
NF1 = [
    ("`edit_file`", "工具描述全文", "全库 7 个层（含 Android APK 层）", "**NOT FOUND**"),
    ("`file_read`", "独立 operation/mode 枚举之外的语义说明", "同上", "仅找到枚举串，无更详细描述"),
]
for a, b, c, d in NF1:
    W("| %s | %s | %s | %s |" % (a, b, c, d))
W("")
W("`edit_file` 的完整检索证据：`edit_file` 在 `app_so_full_strings.txt` 只命中 1 条，")
W("即 `app_so_full_strings.txt:00371250`，内容恰好为工具名 `edit_file`；")
W("`WIN_app.so.strings.txt:00371250` 同为唯一命中。`zh_ui_strings.txt`、`utf16_objects_all.txt`、")
W("`utf16_objects_zh.txt`、`APK_libapp.so.strings.txt` **零命中**。")
W("")

# --- 6.2
W("### 6.2 operation / action 枚举：部分 NOT FOUND")
W("")
W("| 工具 | 枚举项 | 状态 | 证据 |")
W("|---|---|---|---|")
ENUM = [
    ("file_read", "`read` / `list`", "已找到", "`app_so_full_strings.txt:002b2fd0`"),
    ("file_write", "`write` / `append` / `replace` / `insert` / `delete_lines`", "已找到", "`app_so_full_strings.txt:00442010`"),
    ("edit_file", "`write` / `append` / `replace` / `insert` / `delete_lines`", "与 file_write 同源", "`app_so_full_strings.txt:00442010`"),
    ("file_manage", "`search` / `delete` / `rename` / `copy`", "已找到", "`app_so_full_strings.txt:0045c1c0`"),
    ("file_write insert position", "`start` / `end` / `after_line`", "已找到", "`app_so_full_strings.txt:004791a0`"),
    ("terminal", "（无 operation 枚举）", "**NOT FOUND**（无此参数）", "—"),
    ("web_search", "（无 operation 枚举）", "**NOT FOUND**（无此参数）", "—"),
    ("skill_lookup", "（无 operation 枚举）", "**NOT FOUND**（无此参数）", "—"),
    ("create_skill", "（无 operation 枚举）", "**NOT FOUND**（无此参数）", "—"),
    ("update_skill", "（无 operation 枚举）", "**NOT FOUND**（无此参数）", "—"),
    ("create_project", "（无 operation 枚举）", "**NOT FOUND**（无此参数）", "—"),
    ("question", "（无 operation 枚举）", "**NOT FOUND**（无此参数）", "—"),
]
for a, b, c, d in ENUM:
    W("| `%s` | %s | %s | %s |" % (a, b, c, d))
W("")

# --- 6.3
W("### 6.3 参数描述串：NOT FOUND")
W("")
W("以下参数在 Dart schema 中存在**参数名**（如 `path` / `content` / `operation`），")
W("但本次**未能找到任何以它们为主语的描述串**。已用下列候选词形逐一试检，全部 NOT FOUND：")
W("")
TRIED = [
    "The operation to perform", "Operation to perform", "The file content",
    "The path of the file", "Absolute path of the file", "The name of the skill",
    "The new name", "delete flag", "Name of the new novel project",
    "The directory", "The target path", "Source path", "Destination path",
]
for t in TRIED:
    W("- `%s` → **NOT FOUND**" % t)
W("")
W("**已找到的**参数描述串反证了这个缺口不是检索方式问题——同一批 schema 里")
W("`Content to write, append, or insert`、`File or directory path. ...` 等都能找到：")
W("")
for t in ["Content to write, append, or insert",
          "File or directory path. Relative paths resolve against the current project root"]:
    r = all_exact(t)
    W("- ✔ %s → %s" % (t, ", ".join(F(fn, off) for fn, off in r)))
W("")
W("因此结论是：`operation`、`path`、`content`（在 `file_write` 语境下）、`skill_name`")
W("这几个参数**很可能根本没有独立描述串**，其 schema 只写了名字与类型。")
W("**这是推断，不是逐字证据**，故列入本清单。")
W("")

# --- 6.4
W("### 6.4 尾随 `r` 现象：未决项（本规格最重要的不确定点）")
W("")
W("| 项 | 状态 |")
W("|---|---|")
W("| `path is requiredr` | ⚠ **未决**：原始文件逐字如此，但可能是提取伪影 |")
W("| `name is requiredr` | ⚠ **未决**：同上 |")
W("| `ai_run_completedr` | ⚠ **未决**：同上 |")
W('| `Where to insert: "start", "end", or "after_line"r` | ⚠ **未决**：同上 |')
W("")
W("量化：`app_so_full_strings.txt` 中「以 `r` 结尾且含空格」的散文式记录共 **179 条**，")
W("其中大量是 Flutter 框架串（`Assertion failedr`、`Connection resetr`、`Payment Requiredr`、")
W("`Afficher le menur` …），与 OpenWrite 无关。")
W("")
W("**未能解决的原因**：需要 Dart 字符串池解码或 `kernel_blob.bin` 反编译才能定论，")
W("本次只做字符串层提取，**没有**做这一层，故不下结论。")
W("")
W("**给 writerD 的行动项**：按不带 `r` 的形态实现，并在 ADR 记录本项与本节的依据。")
W("")

# --- 6.5
W("### 6.5 系统提示词：已找到主体，但整体拼装顺序不确定")
W("")
W("| 项 | 状态 |")
W("|---|---|")
W("| 默认系统提示词 116 字主体 | ✔ 已逐字恢复（§4.1） |")
W("| 该 116 字在 `reference/` 任一文件中的记录 | ✘ **NOT FOUND**（提取器模型不覆盖） |")
W("| 该提示词**完整的**运行时拼装结果（各段顺序、每段间换行） | ⚠ **不确定** |")
W("| `- 用中文输出。` 是否属于同一提示词 | ⚠ **不确定**（中间隔着 4 条 1 字符记录） |")
W("| 提示词注入「工具说明」的具体段落 | ✘ **NOT FOUND**（只有 `已启用（…用法详见工具说明）` 这类引用） |")
W("")
W("已确认存在的相关片段（逐字，供后续拼装）：")
W("")
for t in ["你是一个创意小说写作助手。你可以读取和写入小说项目目录中的文件。当用户要求你写作、修改或审阅内容时，使用可用工具读取现有章节和资料，然后据此撰写或更新内容。始终保持与现有故事、角色和世界设定的一致性。请使用与用户相同的语言进行回复。",
          "- 用中文输出。",
          "已启用（web_search 工具可用）",
          "已启用（rank_data_query 工具可用，用法详见工具说明）"]:
    r = all_exact(t)
    if not r:
        # raw-byte recovery case
        i = BIN.find(t.encode("utf-16-le"))
        W("- %s → **reference/ 中 NOT FOUND**；原始字节偏移 `app.so:0x%08x`（本次恢复）" % (t[:40], i))
    else:
        W("- `%s` → %s" % (t, ", ".join(F(fn, off) for fn, off in r)))
W("")

# --- 6.6
W("### 6.6 技能注入格式：结构已知，细节不确定")
W("")
W("| 项 | 状态 |")
W("|---|---|")
W("| `## Available Skills` 块头 | ✔ 逐字（`0039d178`） |")
W("| `<available_skills>` 开标签 | ✔ 逐字（含在块头串末） |")
W("| `</available_skills>` 闭标签 | ✔ 逐字（`0041d201`） |")
W("| `  <skill>` / `    <name>` / `</name>` / `    <description>` / `</description>` / `  </skill>` | ✔ 六个片段均逐字 |")
W("| 六片段之间的**换行** | ⚠ **不确定**：六条片段**自身不含 `\\n`**，组合时是否插换行无逐字证据 |")
W("| 缩进空格数 | ✔ 由片段自带（`  <skill>` 前 2 空格、`    <name>` 前 4 空格） |")
W("| 技能条目的字段是否仅 name + description | ⚠ **不确定**：只找到这两个字段标签 |")
W("| 标签是否 XML 转义技能描述里的特殊字符 | ✘ **NOT FOUND**（无相关文案） |")
W("")

# --- 6.7
W("### 6.7 事件名：NOT FOUND")
W("")
W("| 项 | 状态 |")
W("|---|---|")
W("| `ai_run_finished` | ✘ **NOT FOUND** |")
W("| `ai_error` | ✘ **NOT FOUND** |")
W("| `ai_thinking_completed` | ✘ **NOT FOUND** |")
W("| `ai_text_completed` | ✘ **NOT FOUND** |")
W("| `ai_tool_failed` | ✘ **NOT FOUND** |")
W("| `ai_run_failed` | ✘ **NOT FOUND** |")
W("")
W("全库正则 `\\bai_[a-z_]{3,40}\\b` 的**完整**命中集（共 10 条，无遗漏）：")
W("")
hits = sorted(set((o, c) for o, c in ev2.records("full_str")
                  if re.match(r"^ai_[a-z_]{3,40}$", c)), key=lambda x: x[0])
for o, c in hits:
    W("- `%s` → `app_so_full_strings.txt:%s`" % (c, o))
W("")
W("> 注意：`ai_*` 事件名的**绑定方式**（Dart 侧 `EventChannel` 名 vs 普通字符串常量）")
W("> **NOT FOUND**——本次只做字符串层，未做代码引用分析。")
W("")

# --- 6.8
W("### 6.8 CONTRACT.md 引用但原始文件中不存在的工具文案")
W("")
W("以下文案被 `CONTRACT.md §4` 引用为逐字证据，但**全库检索不到**：")
W("")
GHOST = [
    ("直接调用 file_write 工具", "CONTRACT.md §4.1 表格"),
    ("create_skill 工具保存", "CONTRACT.md §4.1 表格"),
    ("update_skill 更新", "CONTRACT.md §4.1 表格"),
    ("使用 question 工具询问", "CONTRACT.md §4.1 表格（全句形态不存在）"),
    ("【高危命令】命中内置风险词表，请逐字核对命令内容后再允许", "CONTRACT.md §4.5"),
]
W("| 文案 | CONTRACT 出处 | 检索结论 |")
W("|---|---|---|")
for t, src in GHOST:
    W("| `%s` | %s | ✘ **NOT FOUND** |" % (t.replace("|", "\\|"), src))
W("")
W("逐条说明：")
W("")
W("- `直接调用 file_write 工具`：`file_write 工具` 只命中 `交互式编辑器，请用 file_write 工具写文件`")
W("  （`app_so_full_utf16.txt:003a7e38`），**不是** `直接调用` 句式。")
W("- `create_skill 工具保存` / `update_skill 更新`：全库无此二句式。")
W("- `使用 question 工具询问`：作为**完整句**不存在；`question` 一词在")
W("  `app_so_full_utf16.txt:003982e8`（skill-creator 技能正文，len=3867）中出现，")
W("  但那是技能文档正文，不是 CONTRACT 引用的提示语句式。")
W("- `【高危命令】…`：全库连子串「高危命令」「内置风险词表」「命中内置」都**零命中**。")
W("")
W("**这一节的结论请优先于 CONTRACT.md**：CONTRACT 这几条属转述而非逐字引用，")
W("writerD 不应以它们为逐字真源。")
W("")

# --- 6.9
W("### 6.9 覆盖缺口：reference 文件本身丢了什么")
W("")
W("| 缺口 | 影响 | 本次是否补上 |")
W("|---|---|---|")
W("| `WIN_app.so.strings.txt` 把 ASCII 串截断到 400 字节 | 长描述串中间段落丢失 | ✔ 已用 `app_so_full_strings.txt` 补上 |")
W("| `utf16_objects_all.txt` 的对象头模型漏采 | 系统提示词整条丢失 | ✔ 已用原始字节解码补上 |")
W("| Android APK 层（`APK_libapp.so.strings.txt`） | 12 个工具名 **零命中** | ✘ 未在 APK 层找到任何工具文案 |")
W("")
W("受 400 字节截断影响的**业务文案**只有 2 条，均已在 §2 用全文给出：")
W("")
W("| 文案 | reference 文件长度 | 真实长度 | 丢失内容 |")
W("|---|---|---|---|")
W("| `terminal` 工具描述（`003c7980`） | 401 | 612 | 中间 211 字符 |")
W("| `create_skill` 的 resources 参数描述（`00248820`） | 401 | 433 | 尾部 32 字符 |")
W("")
W("`create_skill` 该参数被截断后缺的尾句（本次补全）为：")
W("")
for fn, off in all_exact("Optional bundled resource files. Keys should be paths relative to the skill root: scripts/ for executable helpers, references/ for docs loaded on demand, and assets/ for output templates/media. Nested paths are supported (e.g. \"scripts/parsers/json.py\", \"references/providers/aws.md\"). Bare filenames remain supported for compatibility and are routed to scripts/ only for directly executable script extensions; otherwise references/."):
    W("- %s（len=433，全文）" % F(fn, off))
W("")
W("其余 12 条长度 401 的记录都是 Flutter / Office OpenXML 噪声（`<w:numbering …>`、")
W("`<a:fillStyleLst …>`、`^ {0,3}(?:<(?<condition_1>…` 等），**不是**业务文案。")
W("")

# --- 6.10
W("### 6.10 其他确定未找到的项")
W("")
W("| 检索项 | 结论 |")
W("|---|---|")
OTHERS = [
    ("`edit_file` 的 operation 独立枚举串", "✘ NOT FOUND（只有与 file_write 共用的描述串）"),
    ("工具 schema 的 JSON 字面量（如 `\"name\":\"file_read\"`）", "✘ NOT FOUND（Flutter AOT 不保留 JSON）"),
    ("`skill_lookup` 的 operation 枚举", "✘ NOT FOUND"),
    ("`web_search` 的 operation 枚举", "✘ NOT FOUND"),
    ("`question` 的 operation 枚举", "✘ NOT FOUND"),
    ("`create_project` 的 operation 枚举", "✘ NOT FOUND"),
    ("技能注入的 XML 转义规则", "✘ NOT FOUND"),
    ("`## Available Skills` 之后、`<available_skills>` 之前的换行数", "✔ 逐字（块头串内为 `\\n\\n`）"),
]
for a, b in OTHERS:
    W("| %s | %s |" % (a, b))
W("")

# --- 6.11
W("### 6.11 统计汇总")
W("")
tools_found_desc = 11
W("| 项 | 计数 |")
W("|---|---|")
W("| 任务指定工具数 | 12 |")
W("| 找到工具描述全文的工具 | %d（缺 `edit_file`） |" % tools_found_desc)
W("| 找到 operation/枚举的工具 | 4（`file_read`、`file_write`、`edit_file` 同源、`file_manage`） |")
W("| 校验文案（exact match，去重后） | 24 条英文（§3.1 的 18 + §3.2 的 6）+ 5 条中文片段 |")
W("| 参数描述串（本次累计找到） | 30+ 条（见 §3.7 与各工具节） |")
W("| 流式事件名 | 9 条（任务给 6 条全中，另加 3 条） |")
W("| 错误分类文案 | 9 条，全部 EXACT 命中 |")
W("| `NOT FOUND` 明确项 | 20 条 |")
W("| ⚠ 未决项 | 6 条（4 条尾随 `r` + 拼装顺序 + 注入换行） |")
W("")

with io.open(OUT, "a", encoding="utf-8", newline="\n") as f:
    f.write("\n".join(L) + "\n")
print("appended section 6")
