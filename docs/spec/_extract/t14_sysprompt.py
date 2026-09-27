import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
import ev2

r = ev2.R("r_sysprompt.txt")

print("=== hunting default system prompt ===")
ANCHORS = [
    "你是一个创意小说写作助手",
    "创意小说写作助手",
]
for a in ANCHORS:
    r("#" * 74)
    r("ANCHOR %r" % a)
    r("#" * 74)
    for k in ("full_obj", "obj_all", "obj_zh", "zh_ui", "zh_class", "full_str", "strings"):
        hits = ev2.search(k, a)
        for off, c in hits:
            r("\n[%s] len=%d" % (ev2.ev(off, k), len(c)))
            r(c)
    r("")

r("=" * 74)
r("=== UTF-16 objects near 002498f0 (window +-0x400) ===")
r("=" * 74)
tgt = 0x002498f0
for off, c in ev2.records("full_obj"):
    o = int(off, 16)
    if tgt - 0x400 <= o <= tgt + 0x400:
        r("[%s] len=%d %s" % (ev2.ev(off, "full_obj"), len(c), c[:300]))

r.close()
print("done")
