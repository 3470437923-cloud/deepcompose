# -*- coding: utf-8 -*-
"""把截图降采样成 ASCII 结构图，用色值分类直接"看"出布局。"""
from PIL import Image
import numpy as np

SRC = r"C:\Users\Administrator\Desktop\14499e02de07325863177fa4883554e8.png"

# 目标色 -> 字符
PALETTE = [
    ((0x0E, 0x0E, 0x16), ":"),   # 栏/面板底色
    ((0x12, 0x12, 0x1A), "."),   # 主内容区
    ((0x1A, 0x1A, 0x25), "o"),   # 卡片/浮层
    ((0x7C, 0x6A, 0xFF), "#"),   # 强调色
    ((0x21, 0x1E, 0x3A), "s"),   # 强调软色
    ((0x22, 0x20, 0x36), "="),   # 边框
]


def classify(px):
    """返回字符。"""
    r, g, b = int(px[0]), int(px[1]), int(px[2])
    lum = (r * 299 + g * 587 + b * 114) // 1000
    # 亮色文本
    if lum > 140:
        return "*"
    # 高饱和（强调）
    mx, mn = max(r, g, b), min(r, g, b)
    if mx > 60 and (mx - mn) * 100 // max(mx, 1) > 35:
        if b > r and b > g:
            return "#"
        if g > r and g > b:
            return "+"
        return "%"
    # 按调色板最近匹配
    best, bch = 1e9, " "
    for (tr, tg, tb), ch in PALETTE:
        d = (r - tr) ** 2 + (g - tg) ** 2 + (b - tb) ** 2
        if d < best:
            best, bch = d, ch
    return bch if best < 900 else " "


def main():
    im = Image.open(SRC).convert("RGB")
    a = np.asarray(im)
    h, w, _ = a.shape
    B = 10  # 块大小
    rows = []
    print("列标尺: 每字符 = %d px" % B)
    header = "     " + "".join(("%d" % ((x // B) // 10 % 10)) if (x % (B * 10) == 0) else " " for x in range(0, w, B))
    print(header)
    for y in range(0, h, B):
        line = []
        for x in range(0, w, B):
            blk = a[y:y + B, x:x + B].reshape(-1, 3)
            # 取该块中"最有信息量"的像素：优先非背景
            chars = [classify(p) for p in blk[::7]]
            # 优先显示非空格、非纯背景
            pri = [c for c in chars if c not in (" ", ".", ":")]
            line.append(pri[0] if pri else chars[len(chars) // 2])
        rows.append("".join(line))
        print("%4d %s" % (y, rows[-1]))

    # 保存
    with open(r"S:\dsh\work\reverse-openwrite\shot_ascii.txt", "w", encoding="utf-8") as f:
        f.write("图例: ':'=#0E0E16栏底  '.'=#12121A主区  'o'=#1A1A25卡片  '#'=强调色  '='=边框  '*'=亮文本  ' '%s=其他\n\n" % '"')
        f.write(header + "\n")
        for y, line in zip(range(0, h, B), rows):
            f.write("%4d %s\n" % (y, line))
    print("\n写入: S:\\dsh\\work\\reverse-openwrite\\shot_ascii.txt")


if __name__ == "__main__":
    main()
