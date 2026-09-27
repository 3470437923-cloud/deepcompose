import sys, os, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
import ev2

r = ev2.R("r_prompt2.txt")

r("#" * 74)
r("# All TwoByteString objects (cjk>=8) containing markdown heading or bullet markers")
r("#" * 74)
pat = re.compile(r"(^|\n)#{1,4} |(^|\n)- |【")
count = 0
for off, c in sorted(ev2.records("full_obj"), key=lambda x: x[0]):
    cjk = sum(1 for ch in c if 0x4E00 <= ord(ch) <= 0x9FFF)
    if cjk < 8:
        continue
    if pat.search(c):
        count += 1
        r("\n[%s] len=%d cjk=%d" % (ev2.ev(off, "full_obj"), len(c), cjk))
        r(c[:1500])
r("\nTOTAL = %d" % count)

r("\n\n" + "#" * 74)
r("# Objects whose content ENDS with a bullet-ish newline-dash continuation")
r("# (system prompts are split into sentence-per-literal chunks)")
r("#" * 74)
n = 0
for off, c in sorted(ev2.records("full_obj"), key=lambda x: x[0]):
    cjk = sum(1 for ch in c if 0x4E00 <= ord(ch) <= 0x9FFF)
    if cjk < 6:
        continue
    if "\n-" in c or c.endswith("\n") or c.startswith("\n"):
        n += 1
        if n <= 60:
            r("[%s] len=%d  %r" % (ev2.ev(off, "full_obj"), len(c), c[:200]))
r("count = %d" % n)

r.close()
print("done")
