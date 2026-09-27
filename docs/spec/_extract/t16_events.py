import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
import ev2

r = ev2.R("r_events.txt")

EVENTS = ["ai_run_started", "ai_tool_started", "ai_tool_calls_received", "ai_tool_completed",
          "ai_text_started", "ai_thinking_started", "ai_run_finished", "ai_error"]

r("#" * 74)
r("# 1. STREAM EVENT NAMES")
r("#" * 74)
for e in EVENTS:
    r("\n---- %s ----" % e)
    any_hit = False
    for k in ("strings", "full_str", "keyhits", "obj_all", "full_obj", "zh_ui", "zh_class"):
        for off, c in ev2.search(k, e):
            any_hit = True
            r("  [%s] len=%d  %s" % (ev2.ev(off, k), len(c), c[:300]))
    if not any_hit:
        r("  NOT FOUND")

r("\n\n" + "#" * 74)
r("# 2. ai_* / *Event name enumeration (regex)")
r("#" * 74)
for k in ("strings", "full_str"):
    hits = ev2.search(k, r"\bai_[a-z_]{3,40}\b", regex=True)
    r("\n-- %s : %d hits --" % (ev2.FILES[k][1], len(hits)))
    seen = set()
    for off, c in hits:
        if c in seen:
            continue
        seen.add(c)
        r("  [%s] %s" % (off, c))

r.close()
print("done")
