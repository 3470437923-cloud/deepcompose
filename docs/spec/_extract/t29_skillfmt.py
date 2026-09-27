import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
import ev2

r = ev2.R("r_skillfmt.txt")

CANDS = ["<available_skills", "<skill", "</skill", "<name>", "</name>", "<description>",
         "</description>", "<skills>", "</skills>", "<available_skill"]
for c in CANDS:
    r("\n#### %r ####" % c)
    found = False
    for k in ("full_str", "strings", "full_obj", "obj_all", "zh_ui", "keyhits"):
        for off, cc in ev2.search(k, c):
            if len(cc) > 900:
                continue
            found = True
            r("  [%s] len=%d  %r" % (ev2.ev(off, k), len(cc), cc))
    if not found:
        r("  NOT FOUND")

r("\n\n" + "#" * 74)
r("# raw byte context around </available_skills> at 0041d201")
r("#" * 74)
data = open(r"S:\dsh\OpenWrite\data\app.so", "rb").read()
t = 0x0041d201
r("before: %r" % data[t-120:t])
r("the tag: %r" % data[t:t+19])
r("after : %r" % data[t+19:t+200])

r("\n\n" + "#" * 74)
r("# raw byte context around the UTF-16 <available_skills> in 0039d178 object")
r("#" * 74)
b = "<available_skills>".encode("utf-16-le")
s = 0
while True:
    i = data.find(b, s)
    if i < 0:
        break
    r("  hit at 0x%08x ; context: %r" % (i, data[i-40:i+120]))
    s = i + 1

r.close()
print("done")
