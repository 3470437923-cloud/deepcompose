"""Anchor-based recovery -> UTF-8 report written by Python (no PowerShell)."""
import sys
import os
import io

HERE = os.path.dirname(os.path.abspath(__file__))
APP = r"S:\dsh\OpenWrite\data\app.so"
data = open(APP, "rb").read()
out = io.open(os.path.join(HERE, "r_anchors.txt"), "w", encoding="utf-8", newline="\n")


def P(*a):
    print(*a, file=out)


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
    return data[p] | (data[p + 1] << 8)


def run_at(anchor_off):
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
    "小说项目目录",
    "读取现有章节",
]

for a in ANCHORS:
    b = a.encode("utf-16-le")
    P("=" * 78)
    P("ANCHOR %r" % a)
    P("=" * 78)
    s = 0
    found = False
    while True:
        i = data.find(b, s)
        if i < 0:
            break
        found = True
        start, end, txt = run_at(i)
        P("  raw hit 0x%08x -> run [0x%08x, 0x%08x) len=%d chars" % (i, start, end, len(txt)))
        P("    %r" % txt)
        P("")
        s = i + 1
    if not found:
        P("  NOT FOUND")
    P("")

out.close()
print("done")
