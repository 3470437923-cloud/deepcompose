import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
import ev2

r = ev2.R("r_param_desc.txt")

PATTERNS = [
    "The complete question to ask the user",
    "The available choices for this question",
    "Optional bundled resource files",
    "Path of the bundled resource",
    "The path to",
    "Absolute or relative",
    "skill_name",
    "reference_name",
    "reference_content",
    "replace_all",
    "delete_lines",
    "start_line",
    "end_line",
    "old_text",
    "new_text",
    "search_text",
    "new_path",
    "offset",
    "limit",
    "workdir",
    "command (",
    "operation to perform",
    "The ",
]
r("#" * 74)
r("# targeted parameter-description search across ALL layers")
r("#" * 74)
for p in PATTERNS:
    r("\n######## %r ########" % p)
    for k in ("full_obj", "obj_all", "zh_ui", "zh_class", "full_str", "strings", "keyhits"):
        hits = ev2.search(k, p)
        # keep only sentence-like records
        keep = [(o, c) for o, c in hits if 20 <= len(c) <= 700]
        if not keep:
            continue
        r("  -- %s : %d --" % (ev2.FILES[k][1], len(keep)))
        for o, c in keep[:25]:
            r("    [%s] len=%d %s" % (o, len(c), c[:420]))

r.close()
print("done")
