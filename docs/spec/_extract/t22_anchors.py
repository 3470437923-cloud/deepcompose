"""Anchor-based recovery: for a known anchor string, walk outward in the raw
bytes (2-byte stride) to recover the maximal UTF-16LE text run containing it."""
import sys
import os

sys.stdout.reconfigure(encoding="utf-8")
APP = r"S:\dsh\OpenWrite\data\app.so"
data = open(APP, "rb").read()

def ok(cp):
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
    if 0x3400 <= cp <= 0x4DBF:
        return True
    return False


def cu_at(p):
    return data[p] | (data[p+1] << 8)


def run_at(anchor_off):
    """anchor_off must be even (start of a code unit)."""
    p = anchor_off
    while p - 2 >= 0 and ok(cu_at(p - 2)):
        p -= 2
    q = anchor_off
    n = len(data)
    while q + 2 <= n and ok(cu_at(q)):
        q += 2
    return p, q, data[p:q].decode("utf-16-le", "replace")


ANCHORS = [
    "你是一个创意小说写作助手",
    "可用工具",
    "工具说明",
    "用中文输出",
    "## Available Skills",
    "小说写作助手",
    "你的 AI 小说写作助手",
    "AI 小说写作助手",
]

for a in ANCHORS:
    b = a.encode("utf-16-le")
    print("=" * 78)
    print("ANCHOR %r" % a)
    print("=" * 78)
    s = 0
    found = False
    while True:
        i = data.find(b, s)
        if i < 0:
            break
        found = True
        start, end, txt = run_at(i)
        print("  raw hit 0x%08x -> run [0x%08x, 0x%08x) len=%d chars" % (i, start, end, len(txt)))
        print("    %r" % txt)
        print()
        s = i + 1
    if not found:
        print("  NOT FOUND")
    print()
