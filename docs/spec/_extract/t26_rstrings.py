import sys, os, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
import ev2

r = ev2.R("r_rstrings.txt")

r("#" * 74)
r("# Every record ENDING in a bare 'r' (candidate in-place string boundary)")
r("#" * 74)
seen = set()
for k in ("full_str", "full_obj", "obj_all", "zh_ui"):
    for off, c in ev2.records(k):
        if c.endswith("r") and not c.endswith(" r") and len(c) >= 10:
            if c in seen:
                continue
            seen.add(c)
            r("[%s] len=%d  %r" % (ev2.ev(off, k), len(c), c))

r.close()
print("done")
