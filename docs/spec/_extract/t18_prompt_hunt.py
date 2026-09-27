import sys, os, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
import ev2

r = ev2.R("r_prompt_hunt.txt")

# 1. Object pool CJK map: which offsets hold long CJK strings?
r("#" * 74)
r("# 1. TwoByteString objects with cjk>=8, sorted by offset (map of the pool)")
r("#" * 74)
rows = []
for line in ev2.load("full_obj"):
    m = re.match(r"^([0-9a-f]+)\tcjk=(\d+)\t(.*)$", line)
    if not m:
        continue
    off, cjk, content = int(m.group(1), 16), int(m.group(2)), m.group(3)
    if cjk >= 8:
        rows.append((off, cjk, content))
rows.sort()
r("count = %d" % len(rows))
# bucket by 0x10000 zone
from collections import Counter
cnt = Counter("%02x" % (o >> 16) for o, _, _ in rows)
r("zone histogram (high 16 bits of offset): %s" % dict(sorted(cnt.items())))

r("\n--- all cjk>=8 objects in 0x00240000..0x00260000 (around claimed 002498f0) ---")
for o, cjk, c in rows:
    if 0x00240000 <= o < 0x00260000:
        r("[%08x] cjk=%d len=%d  %s" % (o, cjk, len(c), c[:300]))

r("\n--- all cjk>=8 objects in 0x00390000..0x003b0000 (around ## Available Skills) ---")
for o, cjk, c in rows:
    if 0x00390000 <= o < 0x003b0000:
        r("[%08x] cjk=%d len=%d  %s" % (o, cjk, len(c), c[:300]))

# 2. system prompt candidate anchors
r("\n\n" + "#" * 74)
r("# 2. candidate system-prompt anchors")
r("#" * 74)
ANCH = ["现在是", "未绑定", "禁止", "不要输出", "写作助手", "默认提示词", "system_prompt",
        "回答必须", "用中文输出", "输出格式", "工具调用", "你可以", "身份", "角色"]
for a in ANCH:
    hits = [(o, c) for o, c in ev2.records("full_obj") if a in c and len(c) >= 6]
    if hits:
        r("\n---- %r : %d hits ----" % (a, len(hits)))
        for o, c in sorted(hits, key=lambda x: x[0])[:40]:
            r("  [%s] len=%d %s" % (ev2.ev(o, "full_obj"), len(c), c[:260]))

r.close()
print("done")
