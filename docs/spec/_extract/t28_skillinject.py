import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
import ev2

r = ev2.R("r_skill_inject.txt")

CANDS = [
    "1. **元数据**", "2. **SKILL.md 正文**", "3. **配套资源**",
    "可用文件(排除 SKILL.md", "约定: `scripts/` 存放可执行脚本",
    "该目录下的相对路径都基于此目录",
    "绝对路径都基于此目录", "相对路径都基于此目录",
    "SKILL.md 正文", "最多10个", "完整列表可读目录",
]
for c in CANDS:
    r("\n######## %r ########" % c)
    found = False
    for k in ("full_obj", "obj_all", "obj_zh", "zh_ui", "zh_class", "full_str", "strings"):
        for off, cc in ev2.search(k, c):
            found = True
            r("  [%s] len=%d  %s" % (ev2.ev(off, k), len(cc), repr(cc)))
    if not found:
        r("  NOT FOUND")

r("\n\n" + "#" * 74)
r("# FULL dump of every object containing 'SKILL.md' or '技能' near 0027c0a8")
r("#" * 74)
for k in ("full_obj",):
    for off, cc in ev2.records(k):
        o = int(off, 16)
        if 0x0027c000 <= o <= 0x0027c200:
            r("[%s] len=%d %r" % (ev2.ev(off, k), len(cc), cc))

r("\n\n" + "#" * 74)
r("# every record containing '<available_skills>' or '</available_skills>'")
r("#" * 74)
for pat in ["<available_skills>", "</available_skills>", "available_skills"]:
    r("\n#### %r ####" % pat)
    for k in ("full_obj", "obj_all", "zh_ui", "zh_class", "full_str", "strings"):
        for off, cc in ev2.search(k, pat):
            r("  [%s] len=%d  %r" % (ev2.ev(off, k), len(cc), cc[:400]))

r.close()
print("done")
