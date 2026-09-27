import sys, re, struct
sys.stdout.reconfigure(encoding='utf-8')
APP = r"S:\dsh\OpenWrite\data\app.so"
data = open(APP, "rb").read()

def hexdump_utf16(start, end):
    print("--- UTF-16LE decode of [0x%x, 0x%x) (%d bytes) ---" % (start, end, end - start))
    raw = data[start:end]
    try:
        s = raw.decode("utf-16-le")
    except UnicodeDecodeError as e:
        print("   decode fail:", e)
        return
    print(repr(s))
    print()
    print(s)
    print()

print("=" * 78)
print("A. RAW UTF-16LE around the claimed system prompt (0x2498f0 .. 0x249bc0)")
print("=" * 78)
hexdump_utf16(0x2498f0, 0x249bc0)

print("=" * 78)
print("B. where does the UTF-16 printable region actually start/end?")
print("=" * 78)
# walk backwards from 0x2498f0 while valid CJK/ASCII
p = 0x2498f0
while p - 2 >= 0:
    ch = data[p-2:p]
    try:
        c = ch.decode("utf-16-le")
    except Exception:
        break
    cp = ord(c)
    if 0x20 <= cp <= 0x7E or 0x4E00 <= cp <= 0x9FFF or 0x3000 <= cp <= 0x303F or 0xFF00 <= cp <= 0xFFEF:
        p -= 2
    else:
        break
print("  printable UTF-16 run starts at 0x%x" % p)
q = 0x2498f0
while q + 2 <= len(data):
    ch = data[q:q+2]
    try:
        c = ch.decode("utf-16-le")
    except Exception:
        break
    cp = ord(c)
    if 0x20 <= cp <= 0x7E or 0x4E00 <= cp <= 0x9FFF or 0x3000 <= cp <= 0x303F or 0xFF00 <= cp <= 0xFFEF or cp in (0x0A, 0x0D):
        q += 2
    else:
        break
print("  printable UTF-16 run ends   at 0x%x  (length %d chars)" % (q, (q - p) // 2))

print()
print("=" * 78)
print("C. Full run decoded")
print("=" * 78)
raw = data[p:q]
print(repr(raw.decode("utf-16-le")))
print()
print(raw.decode("utf-16-le"))
