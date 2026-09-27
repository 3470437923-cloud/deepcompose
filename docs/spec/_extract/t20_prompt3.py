import sys, os, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
import ev2

r = ev2.R("r_prompt3.txt")
data = open(r"S:\dsh\OpenWrite\data\app.so", "rb").read()

r("#" * 74)
r("# A. raw-byte search for prompt-ish CJK fragments (independent of the pool extractor)")
r("#" * 74)
FRAG = ["写作助手", "你是一个", "创意小说", "用中文输出", "小说写作", "遵循", "你的任务",
        "可用工具", "工具说明", "系统提示", "助手提示"]
for f in FRAG:
    b = f.encode("utf-16-le")
    idx = []
    s = 0
    while True:
        i = data.find(b, s)
        if i < 0:
            break
        idx.append(i)
        s = i + 1
    r("\n%r (utf16le) -> %d occurrences: %s" % (f, len(idx), [hex(x) for x in idx[:12]]))
    b8 = f.encode("utf-8")
    idx8 = []
    s = 0
    while True:
        i = data.find(b8, s)
        if i < 0:
            break
        idx8.append(i)
        s = i + 1
    r("   (utf8) -> %d occurrences: %s" % (len(idx8), [hex(x) for x in idx8[:12]]))

r("\n\n" + "#" * 74)
r("# B. exhaustive dump of ALL TwoByteString objects in 0x00249a00..0x00249c00")
r("#" * 74)
for off, c in sorted(ev2.records("full_obj"), key=lambda x: x[0]):
    o = int(off, 16)
    if 0x00249a00 <= o <= 0x00249c00:
        r("[%08x] len=%d %r" % (o, len(c), c))

r("\n\n" + "#" * 74)
r("# C. every object containing '用中文' or '中文输出'")
r("#" * 74)
for k in ("full_obj", "obj_all", "zh_ui", "zh_class", "full_str", "strings"):
    for off, c in ev2.search(k, "中文输出"):
        r("[%s] len=%d %r" % (ev2.ev(off, k), len(c), c))
for k in ("full_obj", "obj_all", "zh_ui", "zh_class"):
    for off, c in ev2.search(k, "用中文"):
        r("[%s] len=%d %r" % (ev2.ev(off, k), len(c), c))

r("\n\n" + "#" * 74)
r("# D. zh_ui_classified.txt section headers (what the earlier pass bucketed)")
r("#" * 74)
for line in ev2.load("zh_class"):
    if line.startswith("####"):
        r(line)

r.close()
print("done")
