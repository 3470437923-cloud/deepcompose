import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
import ev2

r = ev2.R("r_errors.txt")

ERRORS = [
    "API Key 无效或未提供，请检查Key是否正确",
    "API Key 已过期，请更换Key后重试",
    "令牌无权访问该模型，请检查Key权限设置",
    "429错误，可能是当前模型算力紧张，使用人数过多，建议先更换为其他模型使用，或稍后再进行尝试",
    "对话内容过长，超出了上游模型的上下文限制，请压缩旧上下文或新建对话",
    "未收到AI响应，服务器可能暂时不可用或Key已失效",
    "max_tokens 参数无效，请检查模型设置中的最大输出长度",
    "该模型不存在或暂无可用渠道，请更换模型后重试",
    "该模型不支持自定义温度，请将温度设为 1 或使用默认值",
]
r("#" * 74)
r("# 1. CONTRACT 8.3 error messages - verbatim offset verification")
r("#" * 74)
for e in ERRORS:
    r("\n---- %r ----" % e)
    any_hit = False
    for k in ("zh_ui", "obj_all", "full_obj", "obj_zh", "zh_class", "full_str", "strings"):
        for off, c in ev2.search(k, e):
            any_hit = True
            exact = "EXACT" if c == e else "PARTIAL(len=%d)" % len(c)
            r("  [%s] %s  %s" % (ev2.ev(off, k), exact, "" if c == e else repr(c)))
    if not any_hit:
        r("  NOT FOUND")

r("\n\n" + "#" * 74)
r("# 2. Unknown operation / Must provide validation strings")
r("#" * 74)
for pat in ["Unknown operation", "Must provide content", "is required", "must not be empty",
            "Invalid operation", "not allowed", "cannot be empty"]:
    r("\n---- %r ----" % pat)
    seen = set()
    for k in ("full_str", "strings", "zh_ui", "full_obj", "obj_all", "keyhits"):
        for off, c in ev2.search(k, pat):
            key = (off, c)
            if key in seen:
                continue
            seen.add(key)
            if len(c) < 200:
                r("  [%s] %r" % (ev2.ev(off, k), c))

r.close()
print("done")
