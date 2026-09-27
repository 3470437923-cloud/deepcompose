import sys
sys.stdout.reconfigure(encoding='utf-8')
APP = r"S:\dsh\OpenWrite\data\app.so"
data = open(APP, "rb").read()

for needle in [b"path is required", b"name is required", b"description is required",
               b"command is required", b"operation is required", b"query is required",
               b"skill_name is required", b"content is required"]:
    print("=" * 66)
    print("NEEDLE %r" % needle)
    start = 0
    while True:
        i = data.find(needle, start)
        if i < 0:
            break
        print("  off=0x%08x  ctx=%r" % (i, data[i:i + len(needle) + 14]))
        start = i + 1
