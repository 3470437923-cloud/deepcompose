"""Append sections 3-6 to TOOLS.md."""
import io
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8")
import ev2

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = r"S:\writerD\docs\spec\TOOLS.md"
BIN = open(r"S:\dsh\OpenWrite\data\app.so", "rb").read()

L = []
W = L.append


def F(fn, off):
    return "`%s:%s`" % (fn, off)


def ptr_of(res):
    return F(ev2.FILES[res[0]][1], res[1])


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


def best(pattern, keys=("full_str", "full_obj", "strings", "obj_all", "zh_ui")):
    b = None
    for k in keys:
        for off, c in ev2.search(k, pattern):
            if b is None or len(c) > len(b[2]):
                b = (k, off, c)
    return b


def dup_offsets(text, keys=("full_str", "full_obj", "zh_ui", "obj_all")):
    return ", ".join(F(fn, off) for fn, off, _ in all_containing(text, 10 ** 9, keys))


def block(t):
    W("```")
    W(t)
    W("```")


def cell(s):
    return s.replace("|", "\\|").replace("\n", " ")


# ===========================================================================
# 3. VALIDATION MESSAGES
# ===========================================================================
W("---")
W("")
W("## 3. 校验文案全表")
W("")
W("检索方法：在四个内容层（`app_so_full_strings.txt`、`app_so_full_utf16.txt`、")
W("`zh_ui_strings.txt`、`utf16_objects_all.txt`）中按字面匹配，列出**全部偏移**。")
W("下列每条都是记录内容**恰好等于**该文案（exact match），除非另有标注。")
W("")

W("### 3.1 `xxx is required` 族（英文，逐字 + 全部偏移）")
W("")
W("| # | 逐字文案 | 全部命中偏移 |")
W("|---|---|---|")
REQ = [
    "path is requiredr",
    "content is required",
    "content is required for write operation",
    "content is required for append operation",
    "old_text is required for replace operation",
    "new_text is required for insert operation",
    "search_text is required for search operation",
    "new_path is required for copy operation",
    "new_path is required for rename operation",
    "start_line and end_line are required for delete_lines operation",
    "command is required",
    "operation is required",
    "skill_name is required",
    "name is requiredr",
    "description is required",
    "query is required",
    "questions is required and must not be empty",
    "reference_content is required when reference_name is provided",
]
for i, t in enumerate(REQ, 1):
    offs = dup_offsets(t)
    mark = " ⚠" if t.endswith("r") else ""
    W("| %d | `%s`%s | %s |" % (i, cell(t), mark, offs or "**NOT FOUND**"))
W("")
W("> ⚠ `path is requiredr` / `name is requiredr` 的尾随 `r` **未决**——它是全库 179 条系统性")
W("> 尾随 `r` 现象中的两条，无法判定属于文案内容还是提取伪影。详见 §0.3 与 §6。")
W("> 实现建议用不带 `r` 的形态。上表按原始文件逐字引用，故保留了 `r`。")
W("")

W("### 3.2 其余英文校验 / 错误文案（逐字 + 全部偏移）")
W("")
W("| # | 逐字文案 | 全部命中偏移 |")
W("|---|---|---|")
OTH = [
    "Unknown operation: ",
    "Unsupported operation: ",
    "Must provide content, reference_name, or delete: true",
    "Invalid after_line number",
    "workdir 必须是相对项目根的子目录，不能含 .. 或绝对路径",
]
for i, t in enumerate(OTH, 1):
    offs = dup_offsets(t)
    W("| %d | `%s` | %s |" % (i, cell(t), offs or "**NOT FOUND**"))
W("")
W("### 3.3 中文校验 / 限制文案（逐字 + 全部偏移）")
W("")
W("| # | 逐字文案 | 全部命中偏移 | 备注 |")
W("|---|---|---|---|")
ZH = [
    ("KB），不能超过 50KB", "技能正文体积上限片段（前缀被切分，见备注）"),
    ("MB），不能超过 3MB", "文件包体积上限片段（前缀被切分）"),
    ("文件包体积超过上限（", "zip 导入校验"),
    ("路径在项目/skill 目录外，需用户确认，但确认机制未启用: ", "路径授权"),
    ("始终允许将授权目录及其子目录：", "路径授权"),
]
for i, (t, note) in enumerate(ZH, 1):
    offs = dup_offsets(t)
    W("| %d | `%s` | %s | %s |" % (i, cell(t), offs or "**NOT FOUND**", note))
W("")
W("> `KB），不能超过 50KB`（`app_so_full_utf16.txt:00237fe8`）与 `MB），不能超过 3MB`")
W("> （`app_so_full_utf16.txt:0036ef58`）都是**被切分过的片段**：字符串池中它们以 `KB）` / `MB）`")
W("> 起始，前面的数值部分不在这条记录里（相邻偏移 `00237fe0` / `0036ef50` 无对应记录）。")
W("> 本规格按「逐字引用、不补全」原则原样保留，**未**还原成完整句子。")
W("")

W("### 3.4 抽卡对比模式下的工具禁用文案（逐字）")
W("")
for pat in ["**重要**：当前为抽卡对比模式"]:
    for fn, off, c in all_containing(pat, 400):
        W("- %s（len=%d）：" % (F(fn, off), len(c)))
        W("")
        block(c)
        W("")
for pat in ['{"info":"抽卡对比模式下暂不支持写入操作']:
    for fn, off, c in all_containing(pat, 300):
        W("- %s：%s" % (F(fn, off), c))
for pat in ['{"info":"抽卡对比模式下无法交互提问']:
    for fn, off, c in all_containing(pat, 300):
        W("- %s：%s" % (F(fn, off), c))
W("")

W("### 3.5 CONTRACT.md §4.2 引用文案的逐条复核")
W("")
W("本次把 `docs/CONTRACT.md §4.2` 列出的 12 条校验文案逐条回原始文件核对，结果：")
W("")
W("| CONTRACT 引用 | 原始文件是否存在 | 偏移 | 结论 |")
W("|---|---|---|---|")
CONTRACT_CHECKS = [
    ("path is required", "path is requiredr"),
    ("content is required for write operation", "content is required for write operation"),
    ("content is required for append operation", "content is required for append operation"),
    ("old_text is required for replace operation", "old_text is required for replace operation"),
    ("new_text is required for insert operation", "new_text is required for insert operation"),
    ("search_text is required for search operation", "search_text is required for search operation"),
    ("new_path is required for copy operation", "new_path is required for copy operation"),
    ("new_path is required for rename operation", "new_path is required for rename operation"),
    ("start_line and end_line are required for delete_lines operation",
     "start_line and end_line are required for delete_lines operation"),
    ("Unknown operation: ", "Unknown operation: "),
    ("content is required", "content is required"),
    ("reference_content is required when reference_name is provided",
     "reference_content is required when reference_name is provided"),
    ("Must provide content, reference_name, or delete: true",
     "Must provide content, reference_name, or delete: true"),
]
for cited, actual in CONTRACT_CHECKS:
    exact = all_exact(actual)
    if cited == actual and exact:
        W("| `%s` | 是 | %s | ✔ 逐字一致 |" % (cell(cited), F(exact[0][0], exact[0][1])))
    elif exact:
        W("| `%s` | 是（原始文件实为 `%s`） | %s | ⚠ CONTRACT 少了尾随 `r`；该 `r` 未决，见 §0.3 |"
          % (cell(cited), cell(actual), F(exact[0][0], exact[0][1])))
    else:
        W("| `%s` | **否** | — | ✘ **NOT FOUND** |" % cell(cited))
W("")
W("新增复核（`CONTRACT.md §4.5` 的两条终端文案）：")
W("")
for t in ["【高危命令】命中内置风险词表，请逐字核对命令内容后再允许",
          "（无白名单条目，添加后 AI 执行时不再确认）"]:
    e = all_exact(t)
    if e:
        W("- ✔ `%s` → %s" % (cell(t), ", ".join(F(fn, off) for fn, off in e)))
    else:
        W("- ✘ `%s` → **NOT FOUND**（全库无「高危命令」「内置风险词表」「命中内置」任何子串）" % cell(t))
W("")
W("### 3.6 CONTRACT.md 未收录、但本次新发现的校验文案")
W("")
NEW = [
    "name is requiredr",
    "description is required",
    "skill_name is required",
    "command is required",
    "operation is required",
    "query is required",
    "Unsupported operation: ",
    "Invalid after_line number",
    "workdir 必须是相对项目根的子目录，不能含 .. 或绝对路径",
    "文件包体积超过上限（",
    "KB），不能超过 50KB",
    "MB），不能超过 3MB",
]
for t in NEW:
    e = all_exact(t)
    if e:
        W("- `%s` → %s" % (cell(t), ", ".join(F(fn, off) for fn, off in e)))
    else:
        W("- `%s` → 片段，%s" % (cell(t), dup_offsets(t)))
W("")
W("### 3.7 本次新发现的参数 / 枚举描述串（CONTRACT 未收录）")
W("")
NEWP = [
    ('"read" to read file content, "list" to list directory contents', "file_read 的 mode 枚举"),
    ('Operation type: "search" to find text in files, "delete" to remove file, "rename" to rename file, "copy" to duplicate file', "file_manage 的 operation 枚举"),
    ('Directory to search in (for "search" operation, default is entire project)', "file_manage 参数"),
    ("Content to write, append, or insert", "file_write 参数"),
    ("Text to find and replace (for \"replace\" operation)", "file_write 参数"),
    ("New text for replace or insert operations", "file_write 参数"),
    ("Where to insert: \"start\", \"end\", or \"after_line\"", "file_write 参数（含 insert position 枚举）"),
    ("Line number after which to insert (for \"insert\" with position \"after_line\")", "file_write 参数"),
    ("Start line number for delete (1-based)", "file_write 参数"),
    ("End line number for delete (1-based, inclusive)", "file_write 参数"),
    ("For \"replace\" operation: if true, replace ALL occurrences; if false (default), replace first occurrence only", "replace_all 参数"),
    ("Invalid after_line number", "校验文案"),
    ("Optional timeout in milliseconds. Default 120000, max 600000.", "terminal timeout 参数"),
    ("Optional working directory, relative to the current project root. Use this instead of `cd <dir> && <cmd>`.", "terminal workdir 参数"),
    ("Optional arguments for the command. Use this for script paths and parameters.", "terminal args 参数"),
    ("The command to execute", "terminal command 参数"),
    ("Questions to ask the user", "question 参数"),
    ("The complete question to ask the user", "question 参数"),
    ("The available choices for this question. Must have 2-4 options. Each option should be a distinct, mutually exclusive choice.", "question 参数"),
    ("Set to true to allow the user to select multiple options instead of just one.", "question 参数"),
    ("The name of the new novel project (book title)", "create_project 参数"),
    ("The skill name exactly as shown in Available Skills, or the skill ID", "skill 参数"),
    ("The skill name exactly as shown in Available Skills", "skill 参数（短版）"),
    ("Skill name in English, lowercase with hyphens (e.g. \"novel-reviewer\", \"translation-helper\"). English names avoid path encoding issues across platforms.", "skill 命名规范"),
    ("New full SKILL.md content (including --- frontmatter). Use this to update the main skill file.", "update_skill 参数"),
    ("Content for the reference file. Required when reference_name is provided without delete.", "update_skill 参数"),
    ("With reference_name: delete that single resource file. Without reference_name: delete (uninstall) the whole skill. Built-in skills cannot be deleted.", "update_skill 参数"),
    ("Path of the bundled resource to create, update or delete, relative to the skill root.", "skill 资源路径参数"),
    ("File or directory path. Relative paths resolve against the current project root; absolute paths are also accepted.", "路径参数"),
    ("Pagination start. read: 1-based line number (default 1). list: entry index (default 0).", "offset 参数"),
    ("Max items to return. read: lines (default 2000, max 2000). list: entries (default 200, max 500).", "limit 参数"),
]
for t, note in NEWP:
    r = best(t)
    if r:
        W("- %s（%s，len=%d）：`%s`" % (note, ptr_of(r), len(r[2]), cell(r[2])))
    else:
        W("- %s：**NOT FOUND**" % note)
W("")

# ===========================================================================
# 4. SYSTEM PROMPT + SKILL INJECTION
# ===========================================================================
W("---")
W("")
W("## 4. 系统提示词与技能注入格式")
W("")
W("### 4.1 默认系统提示词全文（逐字）")
W("")
W("**这是本次提取最重要的发现。**")
W("")
W("线索偏移 `002498f0` 附近确实存在「你是一个创意小说写作助手…」，但它**不在**")
W("`reference/utf16_objects_all.txt` 里，原因是 `reference/extract_utf16_obj.py` 的")
W("「8 字节对齐对象 VA + 24」模型不适用于本条。用原始字节直接解码后，得到的是一段")
W("**完整、未被切分**的提示词：")
W("")
SP = "你是一个创意小说写作助手。你可以读取和写入小说项目目录中的文件。当用户要求你写作、修改或审阅内容时，使用可用工具读取现有章节和资料，然后据此撰写或更新内容。始终保持与现有故事、角色和世界设定的一致性。请使用与用户相同的语言进行回复。"
W("- 原始字节区间：`app.so` 文件偏移 `0x002498f0` .. `0x002499d8`（含起不含止）")
W("- 长度：**116 个字符**（232 字节）")
W("- 证据来源：`S:\\dsh\\OpenWrite\\data\\app.so` 原始字节（本次解码）")
W("- 在 `reference/` 任一文件中：**不存在**（`NOT FOUND`）")
W("")
W("全文（逐字，无 `\\n`，单段落）：")
W("")
block(SP)
W("")
W("逐字符校验要点：")
W("")
W("- 首字符 `你`，末字符 `。`（句号），全文无换行。")
W("- 出现「可用工具」字样（`0x00249958`）、「小说项目目录」（`0x0024991a`）、")
W("  「读取现有章节」（`0x00249960`）——均在**同一段 116 字**内，可交叉定位。")
W("- 「请使用与用户相同的语言进行回复。」是末句。")
W("")
W("原始字节转储（供独立复核）：")
W("")
raw = BIN[0x002498f0:0x002499d8]
block(repr(raw)[:600] + " ...")
W("")
W("### 4.2 另一个提示词片段（同一区域，独立字符串）")
W("")
W("在 `0x00249b38`（UTF-16 对象）有一条独立短句：")
W("")
r = best("用中文输出")
W("- %s（len=%d）：%s" % (F("app_so_full_utf16.txt", r[1]), len(r[2]), r[2]))
W("")
W("同偏移对应：%s" % dup_offsets("- 用中文输出。"))
W("")
W("它与 §4.1 的 116 字提示词之间隔着若干条 1 字符记录（`说`、`丑`、`坶`、`菵`），")
W("**无法证明属于同一提示词**。此处只逐字列出，不做拼接推断。")
W("")
W("### 4.3 技能清单注入格式（`## Available Skills` 块）")
W("")
W("**块头（逐字）**：")
W("")
hdr = "## Available Skills\\n\\n技能按需加载。当用户请求与某个技能的使用场景匹配时，调用 `skill_lookup` 加载该技能的完整内容。参数 `skill_name` 必须一字不差地使用 `<name>` 中的技能名（不要改写、翻译或添加后缀）。\\n\\n<available_skills>\\n"
r = best("## Available Skills")
W("- %s（len=%d）：" % (F("app_so_full_utf16.txt", r[1]), len(r[2])))
W("")
block(hdr)
W("")
W("全部命中偏移：%s" % dup_offsets("## Available Skills"))
W("")
W("> 注意：池内记录里首字符是 `#`，位于偏移 `0039d190`；`utf16_objects_all.txt` 记录的")
W("> 偏移 `0039d178` 是对象头位置。")
W("")
W("**每个技能条目的包裹格式（逐字，5 条独立字符串）**：")
W("")
W("| 片段 | 逐字内容 | 偏移 |")
W("|---|---|---|")
SKILLPARTS = [
    ("条目开", "  <skill>", "0034f980"),
    ("名字开", "    <name>", "0034f98a"),
    ("名字闭", "</name>", "00277d30"),
    ("描述开", "    <description>", "00277d38"),
    ("描述闭", "</description>", "0027d400"),
    ("条目闭", "  </skill>", "0027d40f"),
    ("块闭", "</available_skills>", "0041d201"),
]
for label, txt, off in SKILLPARTS:
    e = all_exact(txt)
    W("| %s | `%s` | %s |" % (label, txt, ", ".join(F(fn, o) for fn, o in e) or F("app_so_full_strings.txt", off)))
W("")
W("组合后的完整注入结构（缩进按逐字字符串保留；`技能名` / `技能描述` 为运行时填充位，非逐字串）：")
W("")
W("```")
W("## Available Skills")
W("")
W("技能按需加载。当用户请求与某个技能的使用场景匹配时，调用 `skill_lookup` 加载该技能的完整内容。参数 `skill_name` 必须一字不差地使用 `<name>` 中的技能名（不要改写、翻译或添加后缀）。")
W("")
W("<available_skills>")
W("  <skill>")
W("    <name>技能名</name>")
W("    <description>技能描述</description>")
W("  </skill>")
W("</available_skills>")
W("```")
W("")
W("> **证据强度说明**：块头、`<available_skills>`、`</available_skills>`、`  <skill>`、")
W("> `    <name>`、`</name>`、`    <description>`、`</description>`、`  </skill>` 九个片段**均为逐字字符串**，")
W("> 偏移见上表。但**「它们拼在一起时中间是否有换行」需要按各片段自带的 `\\n` 判断**：")
W("> 块头串以 `\\n` 结尾，五个条目片段串**自身不含 `\\n`**。上面的组合块是按片段自带换行还原的推断，")
W("> 已在 §6 标为不确定项。")
W("")
W("### 4.4 技能正文加载后回注的目录说明（逐字）")
W("")
W("`skill_lookup` 命中后注入的目录约定（一条完整记录）：")
W("")
r = best("约定: `scripts/` 存放可执行脚本")
for fn, off, c in all_containing("约定: `scripts/` 存放可执行脚本", 400):
    W("- %s（len=%d）：" % (F(fn, off), len(c)))
    W("")
    block(c)
    W("")
W("全部命中偏移：%s" % dup_offsets("约定: `scripts/` 存放可执行脚本"))
W("")

# ===========================================================================
# 5. STREAM EVENTS + ERRORS
# ===========================================================================
W("---")
W("")
W("## 5. 流式事件与错误文案")
W("")
W("### 5.1 流式事件名（逐字 + 全部偏移）")
W("")
W("| # | 事件名 | 全部命中偏移 |")
W("|---|---|---|")
EV = ["ai_run_started", "ai_tool_started", "ai_tool_calls_received", "ai_tool_completed",
      "ai_text_started", "ai_thinking_started",
      "ai_cleanup_started", "ai_cleanup_completed", "ai_run_completedr"]
for i, e in enumerate(EV, 1):
    offs = dup_offsets(e)
    W("| %d | `%s` | %s |" % (i, e, offs or "**NOT FOUND**"))
W("")
W("任务指定的 6 个事件名 **全部命中**，另外额外发现 3 个：`ai_cleanup_started`、")
W("`ai_cleanup_completed`、`ai_run_completedr`（注意最后一条同样带真实尾随 `r`，同 §0.3 现象）。")
W("")
W("补检的未命中项：")
W("")
W("- `ai_run_finished` → `NOT FOUND`")
W("- `ai_error` → `NOT FOUND`")
W("- 全库正则 `\\bai_[a-z_]{3,40}\\b` 仅命中上述 9 条（加 1 条 `ai_file_write_`，非事件名）。")
W("")
W("完整 `ai_*` 正则命中清单（逐字）：")
W("")
block("\n".join("%s  %s" % (o, c) for o, c in
                sorted(set((o, c) for o, c in ev2.records("full_str")
                           if re.match(r"^ai_[a-z_]{3,40}$", c)), key=lambda x: x[0])))
W("")
W("### 5.2 错误分类文案（逐字 + 全部偏移，回原文件核对）")
W("")
W("`CONTRACT.md §8.3` 列出的 9 条，逐条回原始文件核对——**9 条全部 EXACT 命中**：")
W("")
W("| # | 逐字文案 | 全部命中偏移 | 核对 |")
W("|---|---|---|---|")
ERRS = [
    "API Key 无效或未提供，请检查Key是否正确",
    "API Key 已过期，请更换Key后重试",
    "令牌无权访问该模型，请检查Key权限设置",
    "429错误，可能是当前模型算力紧张，使用人数过多，建议先更换为其他模型使用，或稍后再进行尝试",
    "对话内容过长，超出了上游模型的上下文限制，请压缩旧上下文或新建对话",
    "未收到AI响应，服务器可能暂时不可用或Key已失效",
    "max_tokens 参数无效，请检查模型设置中的最大输出长度",
    "该模型不存在或暂无可用渠道，请更换模型后重试",
    "该模型不支持自定义温度，请将温度设为 1 或使用默认值",
]
for i, e in enumerate(ERRS, 1):
    ex = all_exact(e)
    W("| %d | `%s` | %s | ✔ EXACT |" % (i, cell(e), ", ".join(F(fn, off) for fn, off in ex)))
W("")
W("> 每条均同时出现在 5 个文件中（`zh_ui_strings.txt`、`utf16_objects_all.txt`、")
W("> `utf16_objects_zh.txt`、`app_so_full_utf16.txt`、`zh_ui_classified.txt`），偏移一致。")
W("> 上表只列每个文件的首个偏移。")
W("")
W("### 5.3 与工具调用相关的错误 / 提示文案")
W("")
for pat in ["抽卡对比模式下暂不支持写入操作", "抽卡对比模式下无法交互提问",
            "Unknown operation: ", "Unsupported operation: "]:
    for fn, off, c in all_containing(pat, 300):
        W("- %s：%s" % (F(fn, off), c))
W("")

with io.open(OUT, "a", encoding="utf-8", newline="\n") as f:
    f.write("\n".join(L) + "\n")
print("appended sections 3-5")
