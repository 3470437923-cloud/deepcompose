import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
import ev

TOOLS = ["file_read","file_write","file_manage","edit_file","terminal",
         "web_search","skill_lookup","create_skill","update_skill",
         "create_project","question","rank_data_query"]

print("=== occurrence counts per file (substring match) ===")
for t in TOOLS:
    row = []
    for k in ev.FILES:
        n = len(ev.search(k, t))
        row.append("%s=%d" % (k, n))
    print("%-18s %s" % (t, "  ".join(row)))
