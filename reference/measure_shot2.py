# -*- coding: utf-8 -*-
"""精确测量：分区主色、精确色值、面板边界复核、文本行密度。"""
import collections

from PIL import Image
import numpy as np

SRC = r"C:\Users\Administrator\Desktop\14499e02de07325863177fa4883554e8.png"


def hexc(rgb):
    return "#%02X%02X%02X" % tuple(int(v) for v in rgb)


def main():
    im = Image.open(SRC).convert("RGB")
    a = np.asarray(im).astype(np.int16)
    h, w, _ = a.shape

    # 精确主色（不量化）：取出现次数最多的原始三元组
    flat = a.reshape(-1, 3)
    keys = flat[:, 0].astype(np.int32) * 65536 + flat[:, 1].astype(np.int32) * 256 + flat[:, 2].astype(np.int32)
    cnt = collections.Counter(keys.tolist())
    total = len(keys)
    print("=== 精确主色 top 16（未量化）===")
    for k, c in cnt.most_common(16):
        r, g, b = (k >> 16) & 255, (k >> 8) & 255, k & 255
        print("  %s   %7d px  %6.3f%%" % (hexc((r, g, b)), c, c * 100.0 / total))

    # 分区（依据上一轮测得的边界）
    regions = {
        "左面板": (0, 0, 209, h),
        "主区": (220, 46, 1215, h),
        "右侧条": (1260, 0, 1421, h),
        "顶栏_左": (0, 0, 209, 39),
        "顶栏_中": (220, 0, 1215, 39),
    }
    print("\n=== 分区精确主色 top5 ===")
    for name, (x0, y0, x1, y1) in regions.items():
        sub = a[y0:y1, x0:x1].reshape(-1, 3)
        k2 = sub[:, 0].astype(np.int32) * 65536 + sub[:, 1].astype(np.int32) * 256 + sub[:, 2].astype(np.int32)
        c2 = collections.Counter(k2.tolist())
        t2 = len(k2)
        parts = []
        for k, c in c2.most_common(5):
            r, g, b = (k >> 16) & 255, (k >> 8) & 255, k & 255
            parts.append("%s %.1f%%" % (hexc((r, g, b)), c * 100.0 / t2))
        uniq = len(c2)
        print("  %-8s (%4d,%4d)-(%4d,%4d) 唯一色 %5d  %s" % (name, x0, y0, x1, y1, uniq, "  ".join(parts)))

    # 强调色精确取（#7868F8 附近的高饱和像素）
    f = a.reshape(-1, 3)
    mx = f.max(axis=1)
    mn = f.min(axis=1)
    sat = np.where(mx > 0, (mx.astype(np.float32) - mn) / np.maximum(mx, 1), 0)
    mask = (sat > 0.5) & (mx > 120)
    print("\n=== 强调色（高饱和高亮）精确 top 8 ===")
    sel = f[mask]
    ks = sel[:, 0].astype(np.int32) * 65536 + sel[:, 1].astype(np.int32) * 256 + sel[:, 2].astype(np.int32)
    for k, c in collections.Counter(ks.tolist()).most_common(8):
        r, g, b = (k >> 16) & 255, (k >> 8) & 255, k & 255
        print("  %s  %d px" % (hexc((r, g, b)), c))
    # 强调色出现的位置范围
    ys, xs = np.where(mask.reshape(h, w))
    if len(xs):
        print("  强调色分布: x %d..%d   y %d..%d" % (xs.min(), xs.max(), ys.min(), ys.max()))

    # 亮色文字像素（前景文本）
    bright = (a.min(axis=2) > 150)
    print("\n=== 亮色像素（文本前景）按列分布 top ===")
    colsum = bright.sum(axis=0)
    segs = []
    st = None
    for x in range(w):
        if colsum[x] > 0:
            if st is None:
                st = x
        else:
            if st is not None and x - st >= 8:
                segs.append((st, x - 1, int(colsum[st:x].sum())))
            st = None
    if st is not None:
        segs.append((st, w - 1, int(colsum[st:].sum())))
    print("  文本列段数: %d" % len(segs))
    for s, e, n in segs[:40]:
        print("    x %4d..%4d  亮像素 %6d" % (s, e, n))

    # 文本行（水平）
    rowsum = bright.sum(axis=1)
    rows = []
    st = None
    for y in range(h):
        if rowsum[y] > 2:
            if st is None:
                st = y
        else:
            if st is not None and y - st >= 6:
                rows.append((st, y - 1, y - st))
            st = None
    print("\n=== 文本行段（行高推断）===")
    print("  文本行数: %d" % len(rows))
    hs = [n for _, _, n in rows]
    if hs:
        print("  行高: 最小 %d  最大 %d  中位 %d" % (min(hs), max(hs), sorted(hs)[len(hs) // 2]))
    for s, e, n in rows[:30]:
        print("    y %4d..%4d  高 %2d" % (s, e, n))


if __name__ == "__main__":
    main()
