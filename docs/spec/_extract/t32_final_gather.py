import sys, os, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
import ev2

r = ev2.R("r_final.txt")

# 1. FULL rank_data_query (no truncation)
r("#" * 74)
r("# FULL rank_data_query description  (utf16_objects_all.txt:003c3048)")
r("#" * 74)
for off, c in ev2.search("full_obj", "查询网文榜单与作品数据"):
    r("[%s] len=%d" % (ev2.ev(off, "full_obj"), len(c)))
    r(c)
    r("")

# 2. size-limit / validation rule strings
r("\n" + "#" * 74)
r("# size-limit and validation rule strings")
r("#" * 74)
PATS = ["KB），不能超过", "不能超过", "超过上限", "文件过大", "行数超过", "超出限制",
        "SKILL.md 正文", "技能正文", "最多", "上限", "长度超过"]
for p in PATS:
    r("\n  ---- %r ----" % p)
    found = False
    seen = set()
    for k in ("full_obj", "obj_all", "obj_zh", "zh_ui", "zh_class", "full_str", "strings"):
        for off, c in ev2.search(k, p):
            if len(c) > 400 or c in seen:
                continue
            seen.add(c)
            found = True
            r("    [%s] len=%d  %s" % (ev2.ev(off, k), len(c), c))
    if not found:
        r("    NOT FOUND")

# 3. exhaustive tool-name token inventory
r("\n" + "#" * 74)
r("# tool-name token inventory: every snake_case token in app_so_full_strings.txt")
r("# that is <= 20 chars and matches ^[a-z][a-z0-9_]+$")
r("#" * 74)
KNOWN = ["file_read", "file_write", "file_manage", "edit_file", "terminal", "web_search",
         "skill_lookup", "create_skill", "update_skill", "create_project", "question",
         "rank_data_query"]
tok = re.compile(r"^[a-z][a-z0-9_]{2,19}$")
seen = set()
for off, c in ev2.records("full_str"):
    if tok.match(c) and ("_" in c):
        seen.add(c)
r("total snake_case tokens: %d" % len(seen))
r("\n-- our 12 target tools present as exact standalone token --")
for t in KNOWN:
    hits = [o for o, c in ev2.records("full_str") if c == t]
    r("  %-18s %s" % (t, ", ".join(hits) if hits else "NOT FOUND as standalone record"))
r("\n-- other *_* tokens that look tool-ish (exclude framework) --")
filt = re.compile(r"(read|write|file|skill|project|search|query|terminal|tool|manage|edit|rank|data)")
for t in sorted(seen):
    if filt.search(t) and t not in KNOWN:
        r("  %s" % t)

r.close()
print("done")
