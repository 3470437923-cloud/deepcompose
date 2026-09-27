# -*- coding: utf-8 -*-
"""不依赖视觉能力，从截图里"量"出界面结构。

原理：UI 截图是像素数据，布局信息以「颜色区块 + 边界」形式客观存在，
可以用投影分析、颜色量化、边缘检测精确测量，精度高于人眼估读。
"""
import collections
import sys

from PIL import Image
import numpy as np

SRC = r"C:\Users\Administrator\Desktop\14499e02de07325863177fa4883554e8.png"


def load(path):
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(np.int16)
    return im, a


def hexc(rgb):
    return "#%02X%02X%02X" % (int(rgb[0]), int(rgb[1]), int(rgb[2]))


def color_census(a):
    """全局颜色统计：找出主色板。"""
    h, w, _ = a.shape
    flat = a.reshape(-1, 3)
    # 量化到 8 级，降低噪声
    q = (flat // 8) * 8
    keys = q[:, 0].astype(np.int32) * 65536 + q[:, 1].astype(np.int32) * 256 + q[:, 2].astype(np.int32)
    cnt = collections.Counter(keys.tolist())
    total = len(keys)
    print("=== 全局主色板（量化到 8 级）===")
    for k, c in cnt.most_common(14):
        r, g, b = (k >> 16) & 255, (k >> 8) & 255, k & 255
        print("  %s  %6.2f%%  (%d 像素)" % (hexc((r, g, b)), c * 100.0 / total, c))


def vertical_bands(a, bg_thresh=10):
    """列投影：找垂直分隔（面板边界）。

    对每一列，统计该列"颜色接近纯背景色"的比例；
    比例突变处即为面板边界。
    """
    h, w, _ = a.shape
    # 用最左侧 3 列的中位色作为背景参考
    ref = np.median(a[:, 0:3, :].reshape(-1, 3), axis=0)
    print("\n左边缘参考色: %s" % hexc(ref))
    # 每列与参考色的差异
    diff = np.abs(a - ref).sum(axis=2)          # (h, w)
    uniform = (diff < bg_thresh).mean(axis=0)   # (w,) 该列中"是背景色"的比例
    # 找 uniform 接近 1 的连续列区间（=空白分隔带）
    gaps = []
    start = None
    for x in range(w):
        if uniform[x] > 0.92:
            if start is None:
                start = x
        else:
            if start is not None and x - start >= 2:
                gaps.append((start, x - 1, x - start))
            start = None
    if start is not None and w - start >= 2:
        gaps.append((start, w - 1, w - start))
    print("\n=== 垂直方向「纯背景列」带（面板分隔候选）===")
    for s, e, n in gaps:
        print("  x = %4d .. %4d  (宽 %d)" % (s, e, n))
    return uniform, gaps


def horizontal_bands(a):
    """行投影：找水平分隔（标题栏/工具栏/状态栏）。"""
    h, w, _ = a.shape
    ref = np.median(a[:, 0:3, :].reshape(-1, 3), axis=0)
    diff = np.abs(a - ref).sum(axis=2)
    uniform = (diff < 10).mean(axis=1)   # (h,)
    bands = []
    start = None
    for y in range(h):
        if uniform[y] > 0.92:
            if start is None:
                start = y
        else:
            if start is not None and y - start >= 2:
                bands.append((start, y - 1, y - start))
            start = None
    if start is not None and h - start >= 2:
        bands.append((start, h - 1, h - start))
    print("\n=== 水平方向「纯背景行」带（横向分隔候选）===")
    for s, e, n in bands:
        print("  y = %4d .. %4d  (高 %d)" % (s, e, n))
    return uniform, bands


def region_palette(a, boxes):
    """按给定矩形区域取主色。"""
    print("\n=== 各区域主色 ===")
    for name, (x0, y0, x1, y1) in boxes.items():
        sub = a[y0:y1, x0:x1].reshape(-1, 3)
        q = (sub // 8) * 8
        keys = q[:, 0].astype(np.int32) * 65536 + q[:, 1].astype(np.int32) * 256 + q[:, 2].astype(np.int32)
        cnt = collections.Counter(keys.tolist())
        total = len(keys)
        out = []
        for k, c in cnt.most_common(3):
            r, g, b = (k >> 16) & 255, (k >> 8) & 255, k & 255
            out.append("%s %.1f%%" % (hexc((r, g, b)), c * 100.0 / total))
        print("  %-14s (%4d,%4d)-(%4d,%4d)  %s" % (name, x0, y0, x1, y1, " | ".join(out)))


def accent_scan(a):
    """找高饱和度的强调色（按钮/选中态）。"""
    h, w, _ = a.shape
    f = a.reshape(-1, 3).astype(np.float32)
    mx = f.max(axis=1)
    mn = f.min(axis=1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    mask = (sat > 0.45) & (mx > 70)
    print("\n=== 高饱和像素统计（强调色候选）===")
    print("  高饱和像素占比: %.2f%%" % (mask.mean() * 100))
    if mask.sum() > 0:
        sel = f[mask]
        q = (sel // 8 * 8).astype(np.int32)
        keys = q[:, 0] * 65536 + q[:, 1] * 256 + q[:, 2]
        cnt = collections.Counter(keys.tolist())
        for k, c in cnt.most_common(10):
            r, g, b = (k >> 16) & 255, (k >> 8) & 255, k & 255
            print("  %s  %d 像素" % (hexc((r, g, b)), c))


def edge_columns(a, top=40):
    """列方向差分：找竖直边缘（面板边框、控件边界）。"""
    h, w, _ = a.shape
    g = np.abs(np.diff(a.astype(np.float32), axis=1)).sum(axis=2)  # (h, w-1)
    col = g.mean(axis=0)
    idx = np.argsort(col)[::-1][:top]
    print("\n=== 最强竖直边缘 top %d（面板/控件边界候选）===" % top)
    seen = []
    for x in sorted(idx.tolist()):
        if seen and x - seen[-1] < 3:
            continue
        seen.append(x)
    for x in seen:
        print("  x = %4d   强度 %.2f" % (x, col[x]))


def main():
    im, a = load(SRC)
    h, w, _ = a.shape
    print("图像: %d x %d" % (w, h))
    print("=== 图像整体 ===")
    color_census(a)
    vu, vgaps = vertical_bands(a)
    hu, hbands = horizontal_bands(a)
    accent_scan(a)
    edge_columns(a)


if __name__ == "__main__":
    main()
