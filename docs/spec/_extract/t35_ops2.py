import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
import ev2

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "r_ops2.txt")
L = []
W = L.append

W("#" * 74)
W("# Newly discovered operation/enum strings - FULL content")
W("#" * 74)
for off in ("002b2fd0", "002eb240", "0045c1c0", "00356f20", "00405540", "004791a0"):
    for k in ("full_str",):
        for o, c in ev2.records(k):
            if o == off:
                W("\n[%s] len=%d" % (o, len(c)))
                W(repr(c))
                W(c)

W("\n\n" + "#" * 74)
W("# every record containing the quoted literal  \"search\"  or  \"rename\"  or  \"copy\"")
W("#" * 74)
for pat in ['"search"', '"rename"', '"copy"', '"delete"', '"read"', '"list"', '"write"',
            '"append"', '"replace"', '"insert"', '"delete_lines"']:
    W("\n#### %s ####" % pat)
    seen = set()
    for k in ("full_str", "full_obj"):
        for off, c in ev2.search(k, pat):
            if c in seen or len(c) > 400:
                continue
            seen.add(c)
            W("  [%s] len=%d  %s" % (ev2.ev(off, k), len(c), c))

W("\n\n" + "#" * 74)
W("# CORRECTION CHECK: object header at 0x0028cb08 - what is that VA really?")
W("#" * 74)
import struct
BIN = open(r"S:\dsh\OpenWrite\data\app.so", "rb").read()
for va in (0x0028cb08, 0x0028cb00, 0x0028cb10, 0x0028cb18, 0x0028cb20):
    tags, h, ln = struct.unpack_from("<QQQ", BIN, va)
    W("  VA=0x%08x  q0=0x%016x q1=0x%016x q2=0x%016x" % (va, tags, h, ln))
W("")
W("  => the ';header' model does NOT cleanly apply here. Note as UNVERIFIED.")
W("")
W("  Byte-level fact that DOES hold (independent of any header model):")
i = BIN.find(b"path is requiredr")
W("    '%s' at 0x%08x, immediately followed by %r" % ("path is requiredr", i, BIN[i+17:i+30]))
j = BIN.find(b"name is requiredr")
W("    '%s' at 0x%08x, immediately followed by %r" % ("name is requiredr", j, BIN[j+17:j+30]))
W("    and the NUL-padded siblings prove the padding convention:")
for t in (b"command is required", b"query is required"):
    x = BIN.find(t)
    W("      '%s' at 0x%08x -> %r" % (t.decode(), x, BIN[x:x+26]))

with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write("\n".join(L))
print("done")
