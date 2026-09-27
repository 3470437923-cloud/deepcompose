import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
import ev2

r = ev2.R("r_zones.txt")

ZONES = [
    ("zone A around 0039d178 (## Available Skills)", 0x0039d178),
    ("zone B around 004aa3e0 (file_read / tool names)", 0x004aa3e0),
    ("zone C around 002498f0 (claimed system prompt)", 0x002498f0),
]
for label, tgt in ZONES:
    r("#" * 74)
    r("%s   window +-0x300" % label)
    r("#" * 74)
    rows = []
    for off, c in ev2.records("full_obj"):
        o = int(off, 16)
        if tgt - 0x300 <= o <= tgt + 0x300:
            rows.append((o, c))
    for o, c in rows:
        r("[%08x] len=%4d  %s" % (o, len(c), c.replace("\n", "\\n")[:220]))
    r("")

r.close()
print("done")
