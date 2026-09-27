import sys, os, struct
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')

APP = r"S:\dsh\OpenWrite\data\app.so"
data = open(APP, "rb").read()

def hdr(va):
    if va + 24 > len(data):
        return None
    tags, hashv, length = struct.unpack_from("<QQQ", data, va)
    return tags, hashv, length

def show(va, note=""):
    h = hdr(va)
    if h is None:
        print("  %08x  <can't read>" % va)
        return
    tags, hashv, length = h
    print("  %08x  tags=0x%x hash=0x%x length=%d  %s" % (va, tags, hashv, length, note))
    body = data[va+24: va+24+length]
    print("        body bytes : %r" % body)
    try:
        s = body.decode("utf-16-le")
        print("        as utf16le : %r" % s)
    except UnicodeDecodeError as e:
        print("        utf16le    : FAIL %s" % e)
    try:
        s2 = body.decode("utf-8")
        print("        as utf8    : %r" % s2)
    except UnicodeDecodeError as e:
        print("        utf8       : FAIL %s" % e)

print("=" * 70)
print("Candidate object VAs for 'path is required' family")
print("=" * 70)
for va in (0x28cb20, 0x2686f0, 0x2a9e30):
    show(va, "(%r at body start)" % data[va+24:va+40])

print()
print("=" * 70)
print("Everything at 8-byte alignment in 0x28cb00..0x28cb60")
print("=" * 70)
for va in range(0x28cb00, 0x28cb68, 8):
    show(va)

print()
print("=" * 70)
print("Everything at 8-byte alignment in 0x2ea180..0x2ea1e0")
print("=" * 70)
for va in range(0x2ea180, 0x2ea1e0, 8):
    show(va)
