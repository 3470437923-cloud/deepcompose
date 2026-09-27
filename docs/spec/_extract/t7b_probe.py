import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
import ev

PROBES = [
    "This tool CANNOT list directories",
    "File modification operations",
    "Use the `workdir` parameter",
    "the tail is returned with an output_path",
]
for pr in PROBES:
    print("=" * 74)
    print("PROBE: %r" % pr)
    for k in ev.FILES:
        for off, c in ev.search(k, pr):
            print("  %s:%s  len=%d" % (ev.FILES[k], off, len(c)))
            print("      %s" % c)
