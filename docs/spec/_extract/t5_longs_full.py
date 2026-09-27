import sys, os, io
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
import ev

OUT = io.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "r_longs.txt"),
              "w", encoding="utf-8")

def p(*a):
    print(*a, file=OUT)

# --- A. ALL long records in obj_all, full content ---
p("=" * 78)
p("A. utf16_objects_all.txt : records with len > 100")
p("=" * 78)
longs = [(off, c) for off, c in ev.records("obj_all") if len(c) > 100]
p("count = %d" % len(longs))
longs.sort(key=lambda x: -len(x[1]))
for off, c in longs:
    p("\n[%s] len=%d" % (off, len(c)))
    p(c)

OUT.close()
print("done")
