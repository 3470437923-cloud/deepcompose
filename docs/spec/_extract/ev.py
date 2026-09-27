"""OpenWrite v2.0.1 evidence retrieval toolkit.

All reference files are UTF-8. This module loads them once and offers
verbatim (raw) retrieval by literal substring / regex, reporting
file:offset evidence pointers.

Offset conventions discovered:
  WIN_app.so.strings.txt      "<hex-offset>\t<string>"      (TAB separated)
  WIN_app.so.keyword_hits.txt "  <hex-offset>  <string>"    (2 spaces)
  zh_ui_strings.txt           "<hex-offset>\t<string>"      (TAB)
  utf16_objects_all.txt       "<hex-offset>\tobj=N\tcjk=N\t<content>"  (TAB)
  utf16_objects_zh.txt        "<hex-offset>\tcjk=N\t<content>"         (TAB)
"""
import io
import os
import re
import sys

REF = r"S:\writerD\reference"

FILES = {
    "strings": "WIN_app.so.strings.txt",
    "keyhits": "WIN_app.so.keyword_hits.txt",
    "zh_ui": "zh_ui_strings.txt",
    "zh_class": "zh_ui_classified.txt",
    "obj_all": "utf16_objects_all.txt",
    "obj_zh": "utf16_objects_zh.txt",
    "apk": "APK_libapp.so.strings.txt",
}

_cache = {}


def load(key):
    """Return list of (offset_str_or_None, raw_line_without_newline)."""
    if key in _cache:
        return _cache[key]
    path = os.path.join(REF, FILES[key])
    with io.open(path, "r", encoding="utf-8", newline="") as fh:
        raw = fh.read()
    out = []
    for line in raw.split("\n"):
        line = line.rstrip("\r")
        if line == "":
            continue
        out.append(line)
    _cache[key] = out
    return out


_OFF_TAB = re.compile(r"^([0-9a-fA-F]{6,10})\t(.*)$", re.S)
_OFF_SP = re.compile(r"^\s*([0-9a-fA-F]{6,10})\s\s(.*)$", re.S)


def split_line(key, line):
    """-> (offset_or_None, content_verbatim)"""
    if key == "zh_class":
        m = _OFF_SP.match(line)
        if m:
            return m.group(1), m.group(2)
        return None, line
    m = _OFF_TAB.match(line)
    if m:
        return m.group(1), m.group(2)
    m = _OFF_SP.match(line)
    if m:
        return m.group(1), m.group(2)
    return None, line


def split_obj(content):
    """utf16_objects_* : strip leading 'obj=N\tcjk=N\t' metadata."""
    parts = content.split("\t")
    meta = []
    i = 0
    while i < len(parts) and re.match(r"^(obj=\d+|cjk=\d+)$", parts[i]):
        meta.append(parts[i])
        i += 1
    return "\t".join(meta), "\t".join(parts[i:])


def records(key):
    """Yield (offset, content_verbatim) with object-pool metadata stripped."""
    for line in load(key):
        off, content = split_line(key, line)
        if key in ("obj_all", "obj_zh") and off is not None:
            _, content = split_obj(content)
        yield off, content


def search(key, pattern, regex=False, flags=0, limit=None):
    """Search one file. Returns list of (offset, content)."""
    rx = re.compile(pattern, flags) if regex else None
    hits = []
    for off, content in records(key):
        if rx.search(content) if regex else (pattern in content):
            hits.append((off, content))
            if limit and len(hits) >= limit:
                break
    return hits


def search_all(pattern, regex=False, keys=None, flags=0, limit=None):
    keys = keys or list(FILES)
    out = {}
    for k in keys:
        h = search(k, pattern, regex=regex, flags=flags, limit=limit)
        if h:
            out[k] = h
    return out


def fmt(off, content, key=None, maxlen=None):
    """Format one evidence line for the report."""
    where = "%s:%s" % (FILES.get(key, key), off)
    body = content if maxlen is None else content[:maxlen]
    return "- `%s`  →  `%s`" % (where, body)


def dump(hits_by_key, maxlen=None):
    lines = []
    for k, hits in hits_by_key.items():
        for off, content in hits:
            lines.append(fmt(off, content, k, maxlen))
    return lines


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    for k in FILES:
        print(k, len(load(k)), "lines")
