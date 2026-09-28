"""类名覆盖校验：旧 CSS 的每个类 token 必须在新 CSS 里有落点。"""
import os
import re
import subprocess

ROOT = r"S:\writerD"
STYLES = os.path.join(ROOT, "src", "styles")

COMMENT = re.compile(r"/\*[\s\S]*?\*/")


def tokens_of(text):
    text = COMMENT.sub("", text)
    return set(re.findall(r"\.([a-zA-Z][a-zA-Z0-9_-]*)", text))


def git_show(path):
    out = subprocess.run(
        ["git", "-C", ROOT, "show", "HEAD:" + path],
        capture_output=True,
    )
    return out.stdout.decode("utf-8", "replace")


old = set()
for p in ("src/styles/app.css", "src/styles/glass.css", "src/styles/tokens.css"):
    old |= tokens_of(git_show(p))

new = set()
for name in sorted(os.listdir(STYLES)):
    if name.endswith(".css"):
        with open(os.path.join(STYLES, name), encoding="utf-8") as fh:
            new |= tokens_of(fh.read())

# JSX 里也可能出现旧 CSS 未覆盖的类（新增组件）
tsx = set()
for base, _dirs, files in os.walk(os.path.join(ROOT, "src")):
    for fn in files:
        if not fn.endswith(".tsx"):
            continue
        with open(os.path.join(base, fn), encoding="utf-8") as fh:
            src = fh.read()
        for m in re.finditer(r'className="([^"]*)"', src):
            tsx |= set(m.group(1).split())
        for m in re.finditer(r"className=\{([^}]*)\}", src):
            for q in re.finditer(r'"([^"]*)"', m.group(1)):
                tsx |= set(q.group(1).split())

IGNORE = {"org", "w3"}  # data-URI 里 http://www.w3.org 的误报

missing_old = sorted(old - new - IGNORE)
missing_jsx = sorted(tsx - new - IGNORE)

print("旧 CSS token 数: %d" % len(old - IGNORE))
print("JSX  token 数: %d" % len(tsx - IGNORE))
print("新 CSS token 数: %d" % len(new))

print("\n!! 旧 CSS 有、新 CSS 没有（漏掉的组件）: %d" % len(missing_old))
for t in missing_old:
    print("   .%s" % t)

print("\n!! JSX 用、新 CSS 没有（会裸奔）: %d" % len(missing_jsx))
for t in missing_jsx:
    print("   .%s" % t)

# 新 CSS 里定义了但没人用的（冗余，仅提示）
unused = sorted(new - old - tsx)
print("\n-- 新 CSS 定义但无人引用（%d，新增设施或冗余）--" % len(unused))
for t in unused:
    print("   .%s" % t)