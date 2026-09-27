import sys, os, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
import ev2

r = ev2.R("r_skillfmt2.txt")
data = open(r"S:\dsh\OpenWrite\data\app.so", "rb").read()


def dump_region(start, end, label):
    r("\n--- %s  [0x%x, 0x%x) ---" % (label, start, end))
    for off, c in ev2.records("full_str"):
        o = int(off, 16)
        if start <= o < end:
            r("  [%s] len=%d %r" % (off, len(c), c))


r("#" * 74)
r("# region 0x00277c00..0x00277e00  (</name>, <description>)")
r("#" * 74)
dump_region(0x00277c00, 0x00277e00, "A")

r("\n" + "#" * 74)
r("# region 0x0027d300..0x0027d500  (</description>, </skill>)")
r("#" * 74)
dump_region(0x0027d300, 0x0027d500, "B")

r("\n" + "#" * 74)
r("# region 0x0034f900..0x0034fb00  (<skill>, <name>)")
r("#" * 74)
dump_region(0x0034f900, 0x0034fb00, "C")

r("\n" + "#" * 74)
r("# region 0x0041d100..0x0041d300  (</available_skills>)")
r("#" * 74)
dump_region(0x0041d100, 0x0041d300, "D")

r("\n" + "#" * 74)
r("# raw window 0x0041d180..0x0041d230 printable")
r("#" * 74)
w = data[0x0041d180:0x0041d240]
r(repr(w))
r("".join(chr(b) if 32 <= b < 127 else "." for b in w))

r.close()
print("done")
