import sys, os, struct
sys.stdout.reconfigure(encoding='utf-8')

APP = r"S:\dsh\OpenWrite\data\app.so"
data = open(APP, "rb").read()

def one(va):
    tags, hashv, length = struct.unpack_from("<QQQ", data, va)
    body = data[va+24: va+24+length]
    return tags, hashv, length, body

print("=== hypothesis: body = VA+24, VA 8-aligned, OneByteString ===")
for va in (0x28cb18, 0x28cb20, 0x28cb28, 0x28cb30):
    tags, hashv, length, body = one(va)
    ok = ""
    if tags == 0 and 0 < length < 200 and va + 24 + length <= len(data):
        try:
            s = body.decode("utf-8")
            ok = repr(s)
        except Exception as e:
            ok = "decodefail"
    print("  VA=%08x tags=%d hash=0x%x len=%d body=%r -> %s" % (va, tags, hashv, length, body[:40], ok))

print()
print("=== dump 48 bytes before the 'path is requiredr' text ===")
t = data.find(b"path is requiredr")
print("  text file offset = 0x%x" % t)
print("  bytes [t-48, t+32] = %r" % data[t-48:t+32])

print()
print("=== is 0x28cb20 the VA and 0x28cb20+24 = 0x28cb38 the body? ===")
print("  text at file offset 0x%x is %r" % (t, data[t:t+24]))
print("  so text starts at file offset 0x%x; VA+24 would be 0x%x" % (t, 0x28cb20+24))
print("  difference =", t - (0x28cb20+24))
