import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
import ev2

r = ev2.R("r_params.txt")

PATTERNS = [
    # (label, pattern, regex?)
    ("question params", "The complete question to ask the user", False),
    ("question params", "The available choices for this question", False),
    ("question params", "single or multiple selection", False),
    ("resource params", "Optional bundled resource files", False),
    ("resource params", "Path of the bundled resource", False),
    ("param keyword: required", r"[A-Za-z_][A-Za-z0-9_]* is required", True),
    ("param keyword: must be", r"must be (?:one of|provided|a |an |non-empty)", True),
    ("param keyword: The ", r"^The [a-z]", True),
    ("operation enum", r'"(write|append|replace|insert|delete_lines|search|delete|rename|copy)"', True),
    ("operation keyword", "operation", False),
    ("action keyword", "action=", False),
]

for label, pat, isre in PATTERNS:
    r("=" * 78)
    r("### %s   pattern=%r regex=%s" % (label, pat, isre))
    r("=" * 78)
    for k in ("strings", "full_str", "obj_all", "full_obj", "zh_ui", "keyhits"):
        hits = ev2.search(k, pat, regex=isre)
        if not hits:
            continue
        r("\n-- %s : %d hits --" % (ev2.FILES[k][1], len(hits)))
        for off, c in hits:
            r("  [%s] len=%d" % (off, len(c)))
            r("      %s" % c[:600])
    r("")

r.close()
print("done")
