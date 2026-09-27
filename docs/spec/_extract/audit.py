"""Audit TOOLS.md: verify every fenced verbatim block actually exists in evidence."""
import io
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8")
import ev2

DOC = r"S:\writerD\docs\spec\TOOLS.md"
text = io.open(DOC, encoding="utf-8").read()
lines = text.split("\n")

# collect fenced blocks
blocks = []
i = 0
while i < len(lines):
    if lines[i].strip() == "```":
        j = i + 1
        buf = []
        while j < len(lines) and lines[j].strip() != "```":
            buf.append(lines[j])
            j += 1
        blocks.append((i + 1, "\n".join(buf)))
        i = j + 1
    else:
        i += 1

print("fenced blocks found:", len(blocks))

# build a haystack of every record content
hay = {}
for k in ("full_str", "full_obj", "zh_ui", "obj_all", "keyhits", "strings"):
    for off, c in ev2.records(k):
        hay.setdefault(c, []).append((ev2.FILES[k][1], off))

BIN = open(r"S:\dsh\OpenWrite\data\app.so", "rb").read()

ok = 0
fail = []
for lineno, b in blocks:
    if b.strip() == "":
        continue
    if b in hay:
        ok += 1
        continue
    # raw-byte recovered?
    if b.encode("utf-16-le") in BIN or b.encode("utf-8") in BIN:
        ok += 1
        continue
    # composed / explanatory blocks are allowed if they are clearly synthetic
    fail.append((lineno, b[:90]))

print("blocks verifiable as evidence (exact record or raw bytes):", ok)
print("blocks NOT directly verifiable:", len(fail))
for lineno, head in fail:
    print("   line %d: %r" % (lineno, head))
