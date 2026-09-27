import sys, os, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
import ev2

r = ev2.R("r_desc_sweep.txt")

# Known tool/adjective leads used by Dart tool-schema descriptions
LEADS = [
    "The skill name exactly as shown",
    "The name of the new novel project",
    "The command to execute",
    "Content for the reference file",
    "With reference_name:",
    "Path of the file",
    "The path",
    "Absolute path",
    "Relative path",
    "Whether to",
    "Set to true",
    "Name of the",
    "Name of ",
    "Operation to",
    "List of ",
    "The list of",
    "Skill name",
    "New name",
    "Search ",
    "Text to",
    "Line number",
    "Number of ",
    "1-based",
]
r("#" * 74)
r("# sweep: short (<700) records whose text starts with a description lead")
r("#" * 74)
for lead in LEADS:
    rows = []
    for k in ("full_str", "full_obj", "obj_all", "zh_ui", "keyhits"):
        for off, c in ev2.search(k, lead):
            if 15 <= len(c) <= 700:
                rows.append((k, off, c))
    if not rows:
        continue
    r("\n#### %r : %d ####" % (lead, len(rows)))
    seen = set()
    for k, off, c in rows:
        if c in seen:
            continue
        seen.add(c)
        r("  [%s] len=%d  %s" % (ev2.ev(off, k), len(c), c))

r("\n\n" + "#" * 74)
r("# ALL records (any layer) that look like a tool PARAMETER description:")
r("# 15..250 chars, starts uppercase or Chinese, contains no ' is required'")
r("#" * 74)
r.close()
print("done")
