import sys, os, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
import ev2

r = ev2.R("r_sentence_sweep.txt")

# Description-shaped sentences: start capital, contain a verb-ish word,
# 20..200 chars, no framework noise markers.
NOISE = re.compile(
    r"(Exception|Error|error|Flutter|Widget|Scaffold|BuildContext|HttpClient|"
    r"Dart|dart:|pub\.dev|schema|xmlns|SCH_|_Get|::|@\d|package:|"
    r"\.dart|Plugin|plugin|RenderBox|Element|Node|Parser|Parser|token)"
)
pat = re.compile(r"^[A-Z][a-z][^.!?]{15,190}[.]$")
rows = []
for k in ("full_str", "full_obj"):
    for off, c in ev2.records(k):
        if pat.match(c) and not NOISE.search(c):
            rows.append((k, off, c))
r("candidate description sentences: %d" % len(rows))
seen = set()
for k, off, c in sorted(rows, key=lambda x: x[1]):
    if c in seen:
        continue
    seen.add(c)
    r("[%s] len=%d  %s" % (ev2.ev(off, k), len(c), c))

r.close()
print("done")
