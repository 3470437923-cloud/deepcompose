import sys, os, io, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
import ev

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = io.open(os.path.join(HERE, "r_str_long.txt"), "w", encoding="utf-8")
def p(*a): print(*a, file=OUT)

for key in ("strings", "apk"):
    p("=" * 78)
    p("%s : records with len > 200" % ev.FILES[key])
    p("=" * 78)
    longs = [(off, c) for off, c in ev.records(key) if len(c) > 200]
    p("count = %d" % len(longs))
    longs.sort(key=lambda x: -len(x[1]))
    for off, c in longs:
        p("\n[%s] len=%d" % (off, len(c)))
        p(c)
    p("\n")

OUT.close()
print("done")
