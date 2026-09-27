import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
import ev2

r = ev2.R("r_trailr.txt")

# Neighbourhood dump around offsets whose strings ended with a bare 'r'
TARGETS = ["0028cb20", "002ea1a0", "002c38f1", "003a9e90", "004aa3e0"]
recs = ev2.records("full_str")
offs = [o for o, c in recs]
byoff = {o: c for o, c in recs}

r("=== neighbourhood of suspicious offsets in app_so_full_strings.txt ===")
for t in TARGETS:
    ti = int(t, 16)
    r("\n--- around %s ---" % t)
    for o, c in recs:
        oi = int(o, 16)
        if ti - 120 <= oi <= ti + 120:
            mark = "  <== TARGET" if o == t else ""
            r("  %s  (len=%3d) %r%s" % (o, len(c), c, mark))

# Does the raw byte stream really contain the 'r'?
r("\n=== raw byte check on app.so ===")
data = open(r"S:\dsh\OpenWrite\data\app.so", "rb").read()
for t in TARGETS:
    ti = int(t, 16)
    r("  %s  bytes: %r" % (t, data[ti:ti + 40]))

# Look for siblings: does 'path is required' exist without trailing r?
r("\n=== search exact 'path is required' variants in raw bytes ===")
for needle in [b"path is required", b"name is required", b"path is required\x01", b"path is requiredr"]:
    idx = []
    start = 0
    while True:
        i = data.find(needle, start)
        if i < 0:
            break
        idx.append(i)
        start = i + 1
    r("  %r -> %d occurrences at %s" % (needle, len(idx), [hex(x) for x in idx[:10]]))

r.close()
print("done")
