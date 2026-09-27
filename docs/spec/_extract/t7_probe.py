import sys, os, io
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
import ev

PROBES = [
    "This tool CANNOT list directories",
    "file modification operations",
    "File modification operations",
    "Use the `workdir` parameter",
    "Interactive commands",
    "Dangerous commands",
    "the tail is returned with an output_path",
    "Read a file or list a directory",
]
OUT = io.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "r_probe.txt"), "w", encoding="utf-8")
def p(*a): print(*a, file=OUT)

for pr in PROBES:
    p("=" * 74)
    p("PROBE: %r" % pr)
    p("=" * 74)
    for k in ev.FILES:
        hits = ev.search(k, pr)
        for off, c in hits:
            p("  %s:%s  len=%d" % (ev.FILES[k], off, len(c)))
            p("      %s" % c)
    p("")
OUT.close()
print("done")
