# -*- coding: utf-8 -*-
"""测量 writerD 窗口截图，验证界面渲染正确性。

与 OpenWrite 原版截图做同口径比对：
- 色板命中
- 面板边界
- 与设计令牌的一致性
"""
import collections
import io
import sys

from PIL import Image
import numpy as np

SHOT = sys.argv[1] if len(sys.argv) > 1 else r"S:\writerD\reference\shot-writerd.png"


def hexc(rgb):
    return "#%02X%02X%02X" % tuple(int(v) for v in rgb)


TOKENS = {
    "#7C6AFF": "accent 强调色",
    "#0E0E16": "bg-bar 栏底",
    "#12121A": "bg-panel 主区",
    "#1A1A25": "bg-rail 卡片",
    "#E8E8F0": "tx-1 主文本",
    "#9898B0": "tx-2 次文本",
}


def main():
    im = Image.open(SHOT).convert("RGB")
    a = np.asarray(im).astype(np.int16)
    h, w, _ = a.shape
    print("截图: %d x %d  (%s)" % (w, h, SHOT))

    flat = a.reshape(-1, 3)
    keys = flat[:, 0].astype(np.int32) * 65536 + flat[:, 1].astype(np.int32) * 256 + flat[:, 2].astype(np.int32)
    cnt = collections.Counter(keys.tolist())
    total = len(keys)

    print("\n=== 实测主色 top 12 ===")
    for k, c in cnt.most_common(12):
        r, g, b = (k >> 16) & 255, (k >> 8) & 255, k & 255
        tag = TOKENS.get(hexc((r, g, b)), "")
        print("  %s  %7d px %6.3f%%   %s" % (hexc((r, g, b)), c, c * 100.0 / total, tag))

    print("\n=== 设计令牌命中校验 ===")
    ok = 0
    for tok, meaning in TOKENS.items():
        k = int(tok[1:3], 16) << 16 | int(tok[3:5], 16) << 8 | int(tok[5:7], 16)
        n = cnt.get(k, 0)
        hit = n > 0
        ok += 1 if hit else 0
        print("  %s %-20s %7d px   %s" % ("[OK] " if hit else "[MISS]", tok, n, meaning))
    print("  → 命中 %d / %d" % (ok, len(TOKENS)))

    # 面板边界（列投影找纯背景带）
    ref = np.median(a[:, 2:8, :].reshape(-1, 3), axis=0)
    diff = np.abs(a - ref).sum(axis=2)
    uniform = (diff < 12).mean(axis=0)
    print("\n=== 垂直背景列带（面板分隔）===")
    st = None
    for x in range(w):
        if uniform[x] > 0.90:
            if st is None:
                st = x
        else:
            if st is not None and x - st >= 2:
                print("  x = %4d .. %4d  (宽 %d)" % (st, x - 1, x - st))
            st = None
    if st is not None and w - st >= 2:
        print("  x = %4d .. %4d  (宽 %d)" % (st, w - 1, w - st))

    # 水平
    uni2 = (diff < 12).mean(axis=1)
    print("\n=== 水平背景行带（横向分隔）===")
    st = None
    for y in range(h):
        if uni2[y] > 0.90:
            if st is None:
                st = y
        else:
            if st is not None and y - st >= 2:
                print("  y = %4d .. %4d  (高 %d)" % (st, y - 1, y - st))
            st = None
    if st is not None and h - st >= 2:
        print("  y = %4d .. %4d  (高 %d)" % (st, h - 1, h - st))

    # 亮像素（文本）
    bright = (a.min(axis=2) > 150)
    print("\n=== 文本像素统计 ===")
    print("  亮像素总数: %d  (%.2f%%)" % (bright.sum(), bright.mean() * 100))
    rows = bright.sum(axis=1)
    nrows = (rows > 2).sum()
    print("  含文本的行数: %d" % nrows)

    # 关键结论
    print("\n=== 判定 ===")
    has_accent = cnt.get(0x7C6AFF, 0) > 0
    has_bg = cnt.get(0x0E0E16, 0) > 0
    has_text = bright.sum() > 500
    print("  强调色渲染: %s" % ("是" if has_accent else "否"))
    print("  栏底色渲染: %s" % ("是" if has_bg else "否"))
    print("  文本渲染:   %s (%d px)" % ("是" if has_text else "否", bright.sum()))
    if has_accent and has_bg and has_text:
        print("  → 界面已正确渲染")
    else:
        print("  → 界面可能未渲染（检查前端是否加载）")


if __name__ == "__main__":
    main()
