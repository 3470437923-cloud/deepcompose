import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
import ev

TOOLS = ["file_read","file_write","file_manage","edit_file","terminal",
         "web_search","skill_lookup","create_skill","update_skill",
         "create_project","question","rank_data_query"]

# Long records in obj_all, sorted by length desc
print("=== obj_all: records > 120 chars ===")
longs = [(off, c) for off, c in ev.records("obj_all") if len(c) > 120]
print("count:", len(longs))
longs.sort(key=lambda x: -len(x[1]))
for off, c in longs:
    head = c[:100].replace("\n", "\\n")
    print("[%s] len=%d  %s" % (off, len(c), head))
