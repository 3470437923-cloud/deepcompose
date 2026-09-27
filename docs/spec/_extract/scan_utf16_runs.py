"""Alignment-agnostic UTF-16LE string scanner over app.so.

The reference pool extractor (utf16_objects_all.txt) assumes every string's
character data begins at an 8-byte-aligned "object VA + 24". That model MISSES
in-place strings (verified: the default system prompt at 0x2498f0 is absent
from utf16_objects_all.txt but present in the raw bytes).

This scanner instead slides a 2-byte window over the whole file and keeps
maximal runs of "text-like" code points, which recovers both objects.
"""
import sys
import os
import io

sys.stdout.reconfigure(encoding="utf-8")
APP = r"S:\dsh\OpenWrite\data\app.so"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "app_so_utf16_runs.txt")
OUTZ = os.path.join(HERE, "app_so_utf16_runs_zh.txt")


def is_text_cp(cp):
    if cp in (0x0A, 0x0D, 0x09):
        return True
    if 0x20 <= cp <= 0x7E:
        return True
    if 0x2000 <= cp <= 0x2FFF:
        return True
    if 0x3000 <= cp <= 0x303F:
        return True
    if 0x4E00 <= cp <= 0x9FFF:
        return True
    if 0xF900 <= cp <= 0xFAFF:
        return True
    if 0xFF00 <= cp <= 0xFFEF:
        return True
    return False


def main():
    data = open(APP, "rb").read()
    n = len(data)
    runs = []
    p = 0
    while p + 2 <= n:
        b = data[p:p+2]
        # decode a single UTF-16 code unit
        cu = b[0] | (b[1] << 8)
        if not is_text_cp(cu):
            p += 2
            continue
        # extend run
        q = p
        while q + 2 <= n:
            cu2 = data[q] | (data[q+1] << 8)
            if not is_text_cp(cu2):
                break
            q += 2
        raw = data[p:q]
        try:
            s = raw.decode("utf-16-le")
        except UnicodeDecodeError:
            p += 2
            continue
        runs.append((p, s))
        p = q

    # keep runs with >= 2 chars (drop single-char alignment noise)
    runs = [(o, s) for o, s in runs if len(s) >= 2]
    print("runs (len>=2):", len(runs))

    with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
        for o, s in runs:
            f.write("%08x\t%s\n" % (o, s.replace("\n", "\\n")))
    zh = [(o, s) for o, s in runs if any(0x4E00 <= ord(c) <= 0x9FFF for c in s)]
    with io.open(OUTZ, "w", encoding="utf-8", newline="\n") as f:
        for o, s in zh:
            f.write("%08x\t%s\n" % (o, s.replace("\n", "\\n")))
    print("written:", OUT, "and", OUTZ)
    print("runs containing CJK:", len(zh))


main()
