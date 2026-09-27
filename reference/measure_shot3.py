# -*- coding: utf-8 -*-
"""第三轮：卡片/分隔线/控件边界 + 与 shared_preferences 配置值交叉验证。"""
import collections

from PIL import Image
import numpy as np

SRC = r"C:\Users\Administrator\Desktop\14499e02de07325863177fa4883554e8.png"


def hexc(rgb):
    return "#%02X%02X%02X" % tuple(int(v) for v in rgb)


def argb_to_hex(v):
    return "#%08X" % (v & 0xFFFFFFFF)


def main():
    im = Image.open(SRC).convert("RGB")
    a = np.asarray(im).astype(np.int16)
    h, w, _ = a.shape

    # ---- 与配置交叉验证 ----
    cfg = 4286343935
    print("=== 配置值交叉验证 ===")
    print("  shared_preferences.flutter.custom_accent_color = %d = %s" % (cfg, argb_to_hex(cfg)))
    print("  解出 RGB = #%02X%02X%02X" % ((cfg >> 16) & 255, (cfg >> 8) & 255, cfg & 255))
    print("  截图中实测强调色 = #7C6AFF")
    print("  → %s" % ("完全一致 ✓" if ((cfg >> 16) & 255, (cfg >> 8) & 255, cfg & 255) == (0x7C, 0x6A, 0xFF) else "不一致"))

    # ---- 卡片色 #1A1A25 的空间分布（找出卡片矩形）----
    card = np.all(np.abs(a - np.array([26, 26, 37])) < 4, axis=2)
    print("\n=== 卡片色 #1A1A25 分布 ===")
    print("  像素数: %d  (%.2f%%)" % (card.sum(), card.mean() * 100))
    ys, xs = np.where(card)
    if len(xs):
        print("  范围: x %d..%d  y %d..%d" % (xs.min(), xs.max(), ys.min(), ys.max()))
        # 按行统计，找卡片的 y 区间
        rowc = card.sum(axis=1)
        segs = []
        st = None
        for y in range(h):
            if rowc[y] > 20:
                if st is None:
                    st = y
            else:
                if st is not None and y - st >= 3:
                    segs.append((st, y - 1))
                st = None
        if st is not None:
            segs.append((st, h - 1))
        print("  卡片行区间: %s" % segs[:20])
        for s, e in segs[:12]:
            band = card[s:e + 1]
            colc = band.sum(axis=0)
            xseg = []
            stx = None
            for x in range(w):
                if colc[x] > 0:
                    if stx is None:
                        stx = x
                else:
                    if stx is not None and x - stx >= 5:
                        xseg.append((stx, x - 1))
                    stx = None
            if stx is not None:
                xseg.append((stx, w - 1))
            print("    y %3d..%3d (高%2d)  x 区间 %s" % (s, e, e - s + 1, xseg[:6]))

    # ---- 强调色 #7C6AFF 的空间分布（按钮/选中态）----
    acc = np.all(np.abs(a - np.array([124, 106, 255])) < 12, axis=2)
    print("\n=== 强调色 #7C6AFF 分布 ===")
    rowc = acc.sum(axis=1)
    segs = []
    st = None
    for y in range(h):
        if rowc[y] > 3:
            if st is None:
                st = y
        else:
            if st is not None and y - st >= 2:
                segs.append((st, y - 1))
            st = None
    if st is not None:
        segs.append((st, h - 1))
    print("  强调色行区间 %d 个:" % len(segs))
    for s, e in segs[:20]:
        band = acc[s:e + 1]
        colc = band.sum(axis=0)
        xseg = []
        stx = None
        for x in range(w):
            if colc[x] > 0:
                if stx is None:
                    stx = x
            else:
                if stx is not None and x - stx >= 4:
                    xseg.append((stx, x - 1))
                stx = None
        if stx is not None:
            xseg.append((stx, w - 1))
        print("    y %3d..%3d (高%2d)  x %s" % (s, e, e - s + 1, xseg[:6]))

    # ---- 面板边框色 #222036 ----
    bd = np.all(np.abs(a - np.array([34, 32, 54])) < 10, axis=2)
    print("\n=== 边框色 #222036 分布（分隔线）===")
    colc = bd.sum(axis=0)
    edges = [(x, int(colc[x])) for x in range(w) if colc[x] > h * 0.5]
    print("  竖直长线 x: %s" % [(x, n) for x, n in edges][:20])
    rowc2 = bd.sum(axis=1)
    hedges = [(y, int(rowc2[y])) for y in range(h) if rowc2[y] > w * 0.3]
    print("  水平长线 y: %s" % [(y, n) for y, n in hedges][:20])

    # ---- 主文本/次文本取色 ----
    print("\n=== 文本层级色 ===")
    for name, target in [("主文本", (232, 232, 240)), ("次文本", (152, 152, 176)), ("危险", (248, 113, 113))]:
        m = np.all(np.abs(a - np.array(target)) < 8, axis=2)
        print("  %-6s %s  %d px" % (name, hexc(target), m.sum()))

    # ---- 顶栏结构 ----
    print("\n=== 顶栏（y 0..39）内部结构 ===")
    top = a[0:39]
    for y in range(39):
        row = top[y]
        nz = np.where(np.any(np.abs(row - np.array([14, 14, 22])) > 12, axis=1))[0]
        if len(nz) > 0 and y % 4 == 0:
            print("  y=%2d  非背景 x 段: %d..%d（%d 像素）" % (y, nz.min(), nz.max(), len(nz)))
    # 顶栏分隔
    print("\n  顶栏下边界检测:")
    for y in range(36, 50):
        row = a[y]
        ref = np.array([14, 14, 22])
        diff = np.abs(row - ref).sum(axis=1)
        print("    y=%2d  与背景均差 %.1f  非背景像素 %d" % (y, diff.mean(), (diff > 15).sum()))


if __name__ == "__main__":
    main()
