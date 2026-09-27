import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
import ev2

r = ev2.R("r_misc.txt")

SETS = {
    "disabled-tool notices": ["未启用，", "工具当前不可用", "调用会被拒绝"],
    "operation enum refs": ['"write"', '"append"', '"replace"', '"insert"', '"delete_lines"',
                            "operation:", "operation（", "operation "],
    "file_manage ops": ["search content in files", "delete file/directory", "rename file/directory"],
    "rank actions": ["action=top", "action=list", "action=categories", "action=dates",
                     "action=rank_names", "action=count", "action=stats"],
    "edit_file mentions": ["edit_file", "replace_all"],
    "tool-limit strings": ["默认 2000", "上限 2000", "默认 200", "上限 500", "500 行", "50KB",
                           "10 分钟", "120000", "600000"],
}
for label, pats in SETS.items():
    r("\n" + "#" * 74)
    r("# %s" % label)
    r("#" * 74)
    for p in pats:
        r("\n  ---- %r ----" % p)
        found = False
        for k in ("full_obj", "obj_all", "obj_zh", "zh_ui", "zh_class", "full_str", "strings", "keyhits"):
            for off, c in ev2.search(k, p):
                if len(c) > 1800:
                    continue
                found = True
                r("    [%s] len=%d  %s" % (ev2.ev(off, k), len(c), c))
        if not found:
            r("    NOT FOUND")

r.close()
print("done")
