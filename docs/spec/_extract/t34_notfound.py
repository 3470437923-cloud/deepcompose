"""Formal NOT FOUND / uncertainty sweep for section 6."""
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8")
import ev2

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "r_notfound.txt")
L = []
W = L.append


def hunt(label, needles, keys=("full_str", "full_obj", "zh_ui", "obj_all", "keyhits", "apk", "strings")):
    W("### %s" % label)
    for n in needles:
        hits = []
        for k in keys:
            for off, c in ev2.search(k, n):
                hits.append((ev2.FILES[k][1], off, len(c)))
        if hits:
            seen = set()
            W("  PRESENT %r" % n)
            for fn, off, ln in hits:
                if (fn, off) in seen:
                    continue
                seen.add((fn, off))
                W("      %s:%s (len=%d)" % (fn, off, ln))
        else:
            W("  NOT FOUND  %r" % n)
    W("")


hunt("A. CONTRACT-referenced tool strings", [
    "请先使用file_read工具读取文件：",
    "直接调用 file_write 工具",
    "file_read、file_write、file_manage",
    "create_skill 工具保存",
    "update_skill 更新",
    "使用 question 工具询问",
    "网页搜索功能未启用，请在设置中开启后使用。",
    "终端功能未启用，请在设置中开启后使用。",
    "网文扫榜功能未启用，请在设置中开启后使用。",
    "未启用，web_search 工具当前不可用（调用会被拒绝），请勿声称具备该能力或尝试调用",
    "未启用，terminal 工具当前不可用（调用会被拒绝），请勿声称具备该能力或尝试调用",
    "未启用，rank_data_query 工具当前不可用（调用会被拒绝），请勿声称具备该能力或尝试调用",
    "【高危命令】命中内置风险词表，请逐字核对命令内容后再允许",
    "（无白名单条目，添加后 AI 执行时不再确认）",
])

hunt("B. per-tool operations / enums claimed by task list", [
    '"read"', '"list"', '"search"', '"delete"', '"rename"', '"copy"',
    "mode: \"read\"", "\"read\"/\"list\"",
])

hunt("C. parameter descriptions that could not be located", [
    "The operation to perform",
    "Operation to perform",
    "The file content",
    "Content to write",
    "The path of the file",
    "Absolute path of the file",
    "The name of the skill",
    "The new name",
    "delete flag",
    "Name of the new novel project",
])

hunt("D. streaming events", [
    "ai_run_finished", "ai_error", "ai_thinking_completed", "ai_text_completed",
    "ai_tool_failed", "ai_run_failed",
])

hunt("E. default system prompt location", [
    "你是一个创意小说写作助手",
])

# object-header truth for the two 'r' strings
W("### F. object header decode for path/name is required")
import struct
BIN = open(r"S:\dsh\OpenWrite\data\app.so", "rb").read()
for va, label in ((0x0028cb08, "path is requiredr"), (0x002ea188, "name is requiredr")):
    tags, h, ln = struct.unpack_from("<QQQ", BIN, va)
    body = BIN[va + 24: va + 24 + ln]
    W("  VA=0x%08x tags=%d hash=0x%x length=%d" % (va, tags, h, ln))
    W("     body=%r" % body)
    try:
        W("     ascii=%r" % body.decode("utf-8"))
    except Exception as e:
        W("     ascii decode fail: %s" % e)
W("")

# how many tool-description strings were truncated in the reference file
W("### G. reference-file truncation census")
trunc = 0
tot = 0
for off, c in ev2.records("strings"):
    tot += 1
    if len(c) == 401:
        trunc += 1
W("  WIN_app.so.strings.txt records = %d ; records of length exactly 401 = %d" % (tot, trunc))
BIG = [(o, c) for o, c in ev2.records("full_str") if len(c) > 401]
W("  app_so_full_strings.txt records longer than 401 = %d" % len(BIG))
W("  --- the ones that look like app text (not framework/base64/xml) ---")
import re
for o, c in sorted(BIG, key=lambda x: -len(x[1])):
    if re.search(r"(tool|command|skill|file|project|search|question|description|path|content)", c, re.I) \
       and not re.search(r"(xmlns|schemeClr|Uint8|Scaffold|src:)", c):
        W("    [%s] len=%d  %s" % (o, len(c), c[:200].replace("\n", "\\n")))

with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write("\n".join(L))
print("done")
