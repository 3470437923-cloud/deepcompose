import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
import ev2

r = ev2.R("r_tooldesc.txt")

ANCHORS = [
    # (label, anchor substring)
    ("terminal", "Execute a system command (desktop only)"),
    ("file_read", "Read a file or list a directory"),
    ("file_write", 'Write, append, or edit files. Operations:'),
    ("file_manage", "File modification operations: search content"),
    ("web_search", "Search the web for information"),
    ("skill_lookup", "Load a specialized skill on demand"),
    ("create_skill", "Create a new skill (技能) and save it"),
    ("update_skill", "Manage an installed skill: update SKILL.md"),
    ("create_project", "Create a new novel project with the given name"),
    ("question", "Ask the user questions during execution"),
    ("rank_data_query", "查询网文榜单与作品数据"),
]

for label, anchor in ANCHORS:
    r("=" * 78)
    r("### TOOL: %s" % label)
    r("ARGS anchor: %r" % anchor)
    r("=" * 78)
    found = False
    for k in ("full_str", "full_obj", "strings", "obj_all", "obj_zh", "zh_ui", "keyhits", "apk"):
        for off, c in ev2.search(k, anchor):
            found = True
            r("\n--- %s  (len=%d) ---" % (ev2.ev(off, k), len(c)))
            r(c)
    if not found:
        r("NOT FOUND for anchor %r" % anchor)
    r("")

r.close()
print(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "r_tooldesc.txt"), encoding="utf-8").read()[:200])
print("done")
