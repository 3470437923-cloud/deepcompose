import sys, os, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
import ev2

r = ev2.R("r_zh_tools.txt")

PATS = ["不能超过 50KB", "不能超过 3MB", "文件包体积超过上限", "已识别",
        "50KB", "3MB", "5\\u4e07\\u5b57", "万字（已识别",
        "抽卡对比模式", "不可用（调用会收到错误结果）",
        "未绑定具体小说项目", "请先使用file_read", "请先使用",
        "直接调用 file_write", "file_write 工具", "create_skill 工具保存",
        "update_skill 更新", "使用 question 工具询问", "路径在项目/skill 目录外",
        "始终允许将授权目录", "所有文件操作",
        "已启用（", "工具可用，用法详见工具说明"]
for p in PATS:
    r("\n  ---- %r ----" % p)
    found = False
    seen = set()
    for k in ("full_obj", "obj_all", "obj_zh", "zh_ui", "zh_class", "full_str", "strings"):
        for off, c in ev2.search(k, p, regex=False):
            if len(c) > 600 or c in seen:
                continue
            seen.add(c)
            found = True
            r("    [%s] len=%d  %s" % (ev2.ev(off, k), len(c), c))
    if not found:
        r("    NOT FOUND")

# Reference-vs-contract check for key contract strings
r("\n\n" + "#" * 74)
r("# CONTRACT cross-check: does each CONTRACT-quoted tool string exist verbatim?")
r("#" * 74)
CHECKS = [
    "请先使用file_read工具读取文件：",
    "直接调用 file_write 工具",
    "file_read、file_write、file_manage",
    "create_skill 工具保存",
    "update_skill 更新",
    "使用 question 工具询问",
    "path is required",
    "content is required for write operation",
    "content is required for append operation",
    "old_text is required for replace operation",
    "new_text is required for insert operation",
    "search_text is required for search operation",
    "new_path is required for copy operation",
    "new_path is required for rename operation",
    "start_line and end_line are required for delete_lines operation",
    "Unknown operation: ",
    "content is required",
    "reference_content is required when reference_name is provided",
    "Must provide content, reference_name, or delete: true",
]
for c in CHECKS:
    hits = []
    for k in ("full_str", "full_obj", "zh_ui", "obj_all"):
        for off, cc in ev2.search(k, c):
            hits.append((ev2.FILES[k][1], off, cc == c, len(cc)))
    r("\n%r" % c)
    if not hits:
        r("   NOT FOUND")
    for fn, off, exact, ln in hits:
        r("   %s:%s  exact=%s rec_len=%d" % (fn, off, exact, ln))

r.close()
print("done")
