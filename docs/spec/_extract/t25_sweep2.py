import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
import ev2

r = ev2.R("r_sweep2.txt")

r("#" * 74)
r("# A. FULL DUMP of WIN_app.so.keyword_hits.txt (all 555 lines, verbatim)")
r("#" * 74)
for off, c in ev2.records("keyhits"):
    r("%s\t%s" % (off or "-", c))

r("\n\n" + "#" * 74)
r("# B. description-lead sweep, part 2")
r("#" * 74)
LEADS = ["Whether ", "Optional ", "New ", "New name", "Target ", "Destination ",
         "Source ", "Old ", "Query ", "The query", "The search", "The line",
         "End line", "Start line", "Insert ", "Position", "Mode", "If ",
         "Defaults to", "Default ", "Delete ", "Delete flag", "List of the",
         "The choices", "The options", "Options for", "Question", "Questions",
         "Answer", "Multiple", "Allow ", "Ref "]
for lead in LEADS:
    seen = set()
    rows = []
    for k in ("full_str", "full_obj", "obj_all", "zh_ui", "keyhits"):
        for off, c in ev2.search(k, lead):
            if 12 <= len(c) <= 400 and c not in seen:
                seen.add(c)
                rows.append((k, off, c))
    if rows:
        r("\n#### %r ####" % lead)
        for k, off, c in rows[:18]:
            r("  [%s] len=%d  %s" % (ev2.ev(off, k), len(c), c))

r.close()
print("done")
