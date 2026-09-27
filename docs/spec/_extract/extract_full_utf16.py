"""Extract full TwoByteString objects from app.so, preserving real newlines.

Same object-header validation as reference/extract_utf16_obj.py, but:
  - no 4000-char cap
  - real characters kept (reference file escaped "\n" -> "\\n")
"""
import struct
import sys
import os
import io

sys.stdout.reconfigure(encoding="utf-8")

APP = r"S:\dsh\OpenWrite\data\app.so"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "app_so_full_utf16.txt")

TEXT_OFF = 0x0
TEXT_END = 0xc74000


def try_string(data, obj_va):
    if obj_va < 0 or obj_va + 24 > len(data):
        return None
    tags, hashv, length = struct.unpack_from("<QQQ", data, obj_va)
    if tags != 0:
        return None
    if length == 0 or length % 2 != 0:
        return None
    nchars = length // 2
    if nchars < 1 or nchars > 200000:
        return None
    p = obj_va + 24
    if p + length > len(data):
        return None
    raw = data[p:p + length]
    try:
        s = raw.decode("utf-16-le")
    except UnicodeDecodeError:
        return None
    for ch in s:
        cp = ord(ch)
        if cp == 0:
            return None
        if not (0x20 <= cp <= 0x7E or 0x2000 <= cp <= 0x2FFF or 0x3000 <= cp <= 0x9FFF
                or 0xF900 <= cp <= 0xFAFF or 0xFF00 <= cp <= 0xFFEF or cp in (0x0A, 0x0D, 0x09)):
            return None
    return s


def main():
    data = open(APP, "rb").read()
    found = {}
    for off in range(TEXT_OFF, min(TEXT_END, len(data)) - 24, 8):
        s = try_string(data, off)
        if s is None:
            continue
        found[off] = s
    print("TwoByteString objects:", len(found), " (reference all=21728, zh=20039)")
    with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
        for off in sorted(found):
            s = found[off]
            cjk = sum(1 for c in s if 0x4E00 <= ord(c) <= 0x9FFF)
            # escape only real newlines for one-record-per-line storage
            f.write("%08x\tcjk=%d\t%s\n" % (off, cjk, s.replace("\n", "\\n")))
    print("written:", OUT)


main()
