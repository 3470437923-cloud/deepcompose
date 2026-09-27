# -*- coding: utf-8 -*-
"""把 openwrite-mock/index.html 的声明尺寸 与 截图实测值 做交叉校验。"""
import io
import re

MOCK = r"S:\dsh\openwrite-mock\index.html"
SHOT = r"C:\Users\Administrator\Desktop\14499e02de07325863177fa4883554e8.png"

# 上一轮从 1421x886 截图实测出的值（已按 1920 画布换算：截图是 1421 宽，画布是 1920）
# 实测截图: 左面板 0..209, 主区 220..1215, 右侧条 1260..1421, 顶栏 0..45
# 若截图是 1920 画布的等比缩放：scale = 1421/1920 = 0.7401
S = 1421.0 / 1920.0
print("缩放系数 = %.4f（截图 1421 / 画布 1920）" % S)

shot = {
    "左面板右边界": 209,
    "主区左边界": 220,
    "主区右边界": 1215,
    "右侧条左边界": 1260,
    "顶栏高度(含线)": 46,
}
print("\n=== 截图实测值 → 换算到 1920 画布 ===")
for k, v in shot.items():
    print("  %-16s 截图 %4d px  →  画布 %6.1f px" % (k, v, v / S))

src = io.open(MOCK, encoding="utf-8").read()

print("\n=== mock 声明值（界面 B）===")
checks = [
    ("左面板宽", r"\.b-left\{[^}]*?width:\s*(\d+)px"),
    ("主区左偏移", r"\.b-chat\{[^}]*?left:\s*(\d+)px"),
    ("主区宽", r"\.b-chat\{[^}]*?width:\s*(\d+)px"),
    ("右面板左偏移", r"\.b-right\{[^}]*?left:\s*(\d+)px"),
    ("右面板宽", r"\.b-right\{[^}]*?width:\s*(\d+)px"),
    ("标题栏高", r"\.titlebar\{[^}]*?height:\s*(\d+)px"),
    ("窗口宽", r"\.win\{[^}]*?width:\s*(\d+)px"),
    ("窗口高", r"\.win\{[^}]*?height:\s*(\d+)px"),
]
declared = {}
for name, pat in checks:
    m = re.search(pat, src, re.S)
    declared[name] = int(m.group(1)) if m else None
    print("  %-12s %s px" % (name, declared[name]))

print("\n=== 对比：画布值 vs mock 声明值 ===")
pairs = [
    ("左面板右边界", 209 / S, declared.get("左面板宽")),
    ("主区左边界", 220 / S, declared.get("主区左偏移")),
    ("主区右边界", 1215 / S, (declared.get("主区左偏移") or 0) + (declared.get("主区宽") or 0)),
    ("右侧条左边界", 1260 / S, declared.get("右面板左偏移")),
    ("顶栏高度", 46 / S, declared.get("标题栏高")),
]
print("  %-16s %12s %12s %10s" % ("项", "画布实测", "mock 声明", "偏差"))
for name, a, b in pairs:
    if b is None:
        print("  %-16s %12.1f %12s" % (name, a, "N/A"))
        continue
    print("  %-16s %12.1f %12d %+10.1f" % (name, a, b, b - a))

# 色板对比
print("\n=== 色值对比 ===")
shot_colors = {
    "#0E0E16": "面板/栏底色（左面板 87.9%）",
    "#12121A": "主内容区底色（90.4%）",
    "#1A1A25": "卡片/浮层",
    "#7C6AFF": "强调色",
    "#222036": "边框色",
    "#E8E8F0": "主文本",
    "#9898B0": "次文本",
}
mock_vars = dict(re.findall(r"--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})", src))
print("  mock CSS 变量: %s" % ", ".join("%s=%s" % kv for kv in list(mock_vars.items())[:14]))
print()
for k, meaning in shot_colors.items():
    hit = [n for n, v in mock_vars.items() if v.upper() == k.upper()]
    inline = src.upper().count(k)
    print("  截图 %s (%-22s)  mock 变量命中 %-16s 源码出现 %d 次"
          % (k, meaning, (",".join(hit) if hit else "—"), inline))

# 文案对比
print("\n=== 文案对接（mock 中文 vs 快照 1501 条）===")
snap = set()
for line in io.open(r"S:\dsh\work\reverse-openwrite\zh_ui_strings.txt", encoding="utf-8"):
    p = line.rstrip("\n").split("\t", 1)
    if len(p) == 2:
        snap.add(p[1])
mock_text = re.findall(r">([^<>{}]*[\u4e00-\u9fff][^<>{}]*)<", src)
mock_text = [t.strip() for t in mock_text if t.strip()]
matched = [t for t in mock_text if t in snap]
print("  mock 中文文本节点 %d 条（去重 %d）" % (len(mock_text), len(set(mock_text))))
print("  能在快照 1501 条中精确命中的: %d 条" % len(matched))
for t in matched[:20]:
    print("    ✓ %s" % t)
