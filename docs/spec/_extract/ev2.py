"""Unified retrieval over BOTH evidence layers.

Layer 1 (primary, byte-identical to the task's evidence files):
    S:\\writerD\\reference\\WIN_app.so.strings.txt        (UTF-8 runs, CAPPED 400 bytes)
    S:\\writerD\\reference\\utf16_objects_all.txt         (UTF-16 objs, newline-escaped)
    S:\\writerD\\reference\\zh_ui_strings.txt             (Chinese UI strings)
    S:\\writerD\\reference\\WIN_app.so.keyword_hits.txt

Layer 2 (recovery layer, added by this extraction because layer 1 truncates):
    _extract/app_so_full_strings.txt   (same offsets, NO 400-byte cap)
    _extract/app_so_full_utf16.txt     (same offsets, NO 4000-char cap)

Every offset printed in the report exists in BOTH layers (verified for the
ASCII layer: 96152/96162 records byte-identical).
"""
import io
import os
import re
import sys

REF = r"S:\writerD\reference"
HERE = os.path.dirname(os.path.abspath(__file__))

FILES = {
    "strings": (REF, "WIN_app.so.strings.txt"),
    "keyhits": (REF, "WIN_app.so.keyword_hits.txt"),
    "zh_ui": (REF, "zh_ui_strings.txt"),
    "zh_class": (REF, "zh_ui_classified.txt"),
    "obj_all": (REF, "utf16_objects_all.txt"),
    "obj_zh": (REF, "utf16_objects_zh.txt"),
    "apk": (REF, "APK_libapp.so.strings.txt"),
    # recovery layer
    "full_str": (HERE, "app_so_full_strings.txt"),
    "full_obj": (HERE, "app_so_full_utf16.txt"),
}

_c = {}
_OFF_TAB = re.compile(r"^([0-9a-fA-F]{6,10})\t(.*)$", re.S)
_OFF_SP = re.compile(r"^\s*([0-9a-fA-F]{6,10})\s\s(.*)$", re.S)


def load(key):
    if key in _c:
        return _c[key]
    d, fn = FILES[key]
    with io.open(os.path.join(d, fn), "r", encoding="utf-8", newline="") as fh:
        raw = fh.read()
    out = [l.rstrip("\r") for l in raw.split("\n") if l.strip() != ""]
    _c[key] = out
    return out


def split_obj(content):
    parts = content.split("\t")
    i = 0
    meta = []
    while i < len(parts) and re.match(r"^(obj=\d+|cjk=\d+)$", parts[i]):
        meta.append(parts[i])
        i += 1
    return "\t".join(meta), "\t".join(parts[i:])


def records(key):
    """-> list of (offset_or_None, verbatim_content)"""
    res = []
    for line in load(key):
        if key == "zh_class":
            m = _OFF_SP.match(line)
            off, content = (m.group(1), m.group(2)) if m else (None, line)
        else:
            m = _OFF_TAB.match(line)
            if not m:
                m = _OFF_SP.match(line)
            off, content = (m.group(1), m.group(2)) if m else (None, line)
        if key in ("obj_all", "obj_zh", "full_obj") and off is not None:
            _, content = split_obj(content)
        res.append((off, content))
    return res


def search(key, pattern, regex=False, flags=0, limit=None):
    rx = re.compile(pattern, flags) if regex else None
    hits = []
    for off, c in records(key):
        ok = rx.search(c) if regex else (pattern in c)
        if ok:
            hits.append((off, c))
            if limit and len(hits) >= limit:
                break
    return hits


def search_all(pattern, regex=False, keys=None, flags=0, limit=None):
    out = {}
    for k in (keys or list(FILES)):
        h = search(k, pattern, regex=regex, flags=flags, limit=limit)
        if h:
            out[k] = h
    return out


def ev(off, key):
    """Evidence pointer string."""
    return "%s:%s" % (FILES[key][1], off)


class R:
    """Report writer (UTF-8, no PowerShell involved)."""

    def __init__(self, name):
        self.p = os.path.join(HERE, name)
        self.f = io.open(self.p, "w", encoding="utf-8", newline="\n")

    def __call__(self, *a):
        print(*a, file=self.f)

    def close(self):
        self.f.close()
        return self.p


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    for k in FILES:
        print(k, len(load(k)))
