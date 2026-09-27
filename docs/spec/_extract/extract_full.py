"""Re-extract ASCII/UTF-8 string runs from the original app.so WITHOUT the
400-byte truncation applied by reference/extract_strings.py.

Output is byte-identical in offset space: offsets are file offsets in app.so,
the same offsets used by WIN_app.so.strings.txt (verified by comparison).
"""
import re
import sys
import os
import io

sys.stdout.reconfigure(encoding="utf-8")

APP = r"S:\dsh\OpenWrite\data\app.so"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "app_so_full_strings.txt")
OUTOBJ = os.path.join(HERE, "app_so_full_utf16.txt")

CAP = 20000  # generous; a single Dart string will not exceed this


def extract_utf8(data):
    out = []
    pat = re.compile(rb"[\x20-\x7e\xc2-\xf4][\x20-\x7e\x80-\xbf]{%d,}" % 2)
    for m in pat.finditer(data):
        if m.end() - m.start() > CAP:
            continue
        try:
            s = m.group(0).decode("utf-8")
        except UnicodeDecodeError:
            continue
        out.append((m.start(), s))
    return out


def main():
    data = open(APP, "rb").read()
    print("app.so size =", len(data))
    strs = extract_utf8(data)
    print("untruncated utf8 runs:", len(strs))
    with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
        for off, s in strs:
            f.write("%08x\t%s\n" % (off, s))
    print("written:", OUT)

    # Verify against the reference file on overlapping offsets
    import ev
    ref = {}
    for off, c in ev.records("strings"):
        if off:
            ref[int(off, 16)] = c
    mine = {off: s for off, s in strs}
    same = 0
    diff = 0
    for off, c in ref.items():
        if off in mine:
            if mine[off] == c:
                same += 1
            else:
                # reference may be a truncation of mine
                if mine[off].startswith(c):
                    diff += 1
                else:
                    diff += 1
    print("verify: overlapping offsets identical=%d, differs/truncated=%d" % (same, diff))
    missing = [o for o in ref if o not in mine]
    print("verify: ref offsets absent from mine =", len(missing))
    for o in missing[:10]:
        print("   missing %08x : %r" % (o, ref[o][:80]))


main()
