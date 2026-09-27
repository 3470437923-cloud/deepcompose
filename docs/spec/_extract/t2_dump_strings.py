import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
import ev

TOOLS = ["file_read","file_write","file_manage","edit_file","terminal",
         "web_search","skill_lookup","create_skill","update_skill",
         "create_project","question","rank_data_query"]

for key in ("strings", "keyhits"):
    print("#" * 78)
    print("## FILE:", ev.FILES[key])
    print("#" * 78)
    for t in TOOLS:
        hits = ev.search(key, t)
        if not hits:
            continue
        print("\n----- %s  (%d hits) -----" % (t, len(hits)))
        for off, content in hits:
            print("[%s] len=%d" % (off, len(content)))
            print(repr(content))
            print()
