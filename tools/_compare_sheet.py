"""把 before/after 截图拼成并排对比图，作为改版验收证据。

前提：
    先用 preview_shot.py 分别产出两套截图到 shots/preview-before 与
    shots/preview-after（--label before / --label after，文件名需与下方
    PAIRS 对应）；pip install pillow。
用法：
    python tools/_compare_sheet.py     # 在仓库根目录下运行
产出：
    shots/compare/<name>.png      每套主题一张「左旧右新」
    shots/compare/overview.png    三套主题叠成一张总览
已知坑：
    - 输入缺文件是「跳过」不是「报错」：产出变少不等于验收全过。
    - PAIRS 写死了截图文件名；改 preview_shot 的 --label / --sizes 后
      要同步这里。
    - 中文标题依赖微软雅黑/黑体；都找不到时回退 PIL 默认字体，中文
      会渲染成方块。
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BEFORE = os.path.join(ROOT, "shots", "preview-before")
AFTER = os.path.join(ROOT, "shots", "preview-after")
OUT = os.path.join(ROOT, "shots", "compare")

PAIRS = [
    ("鲸鱼蓝 · 主界面", "before-dsblue-1600x1000.png", "after-dsblue-1600x1000.png"),
    ("护眼白 · 主界面", "before-light-1600x1000.png", "after-light-1600x1000.png"),
    ("暗影黑 · 主界面", "before-dark-1600x1000.png", "after-dark-1600x1000.png"),
    ("鲸鱼蓝 · 设置", "before-settings-dsblue-1600x1000.png", "after-settings-dsblue-1600x1000.png"),
    ("护眼白 · 设置", "before-settings-light-1600x1000.png", "after-settings-light-1600x1000.png"),
    ("暗影黑 · 设置", "before-settings-dark-1600x1000.png", "after-settings-dark-1600x1000.png"),
]

BAR = 46          # 标题条高度
GAP = 14          # 图间距
PAD = 18          # 外边距
BG = (24, 24, 26)
FG = (236, 236, 240)
DIM = (150, 150, 158)
ACCENT = (109, 140, 255)


def font(size, bold=False):
    for name in (("msyhbd.ttc" if bold else "msyh.ttc"), "simhei.ttf", "arial.ttf"):
        for base in (r"C:\Windows\Fonts", "/usr/share/fonts/truetype/dejavu"):
            p = os.path.join(base, name)
            if os.path.exists(p):
                try:
                    return ImageFont.truetype(p, size)
                except OSError:
                    pass
    return ImageFont.load_default()


def sheet(title, before_p, after_p, scale=0.46):
    a, b = Image.open(before_p).convert("RGB"), Image.open(after_p).convert("RGB")
    w = int(a.width * scale)
    h = int(a.height * scale)
    a, b = a.resize((w, h), Image.LANCZOS), b.resize((w, h), Image.LANCZOS)

    W = PAD * 3 + w * 2
    H = PAD * 2 + BAR + h
    canvas = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(canvas)
    d.text((PAD, PAD), title, font=font(19, True), fill=FG)
    d.text((W - PAD, PAD + 4), "左：改版前     右：改版后", font=font(14), fill=DIM, anchor="ra")

    y = PAD + BAR
    canvas.paste(a, (PAD, y))
    canvas.paste(b, (PAD * 2 + w, y))
    for x, label, col in ((PAD, "BEFORE", DIM), (PAD * 2 + w, "AFTER", ACCENT)):
        d.rectangle([x, y, x + w - 1, y + h - 1], outline=(58, 58, 62), width=1)
        d.text((x + 8, y + h - 22), label, font=font(13, True), fill=col)
    return canvas


def main():
    os.makedirs(OUT, exist_ok=True)
    made = []
    for title, bp, ap in PAIRS:
        b, a = os.path.join(BEFORE, bp), os.path.join(AFTER, ap)
        if not (os.path.exists(b) and os.path.exists(a)):
            print("  跳过（缺文件）: %s" % title)
            continue
        img = sheet(title, b, a)
        p = os.path.join(OUT, ap.replace("after-", "").replace(".png", "") + "-vs-before.png")
        img.save(p)
        made.append((title, img))
        print("  已生成 %s" % os.path.relpath(p, ROOT))

    if made:
        cols = 2
        rows = (len(made) + cols - 1) // cols
        cw = max(i.width for _, i in made)
        ch = max(i.height for _, i in made)
        ov = Image.new("RGB", (cw * cols + PAD * (cols + 1), ch * rows + PAD * (rows + 1)), BG)
        for n, (_, img) in enumerate(made):
            ov.paste(img, (PAD + (n % cols) * (cw + PAD), PAD + (n // cols) * (ch + PAD)))
        ov = ov.resize((ov.width // 2, ov.height // 2), Image.LANCZOS)
        p = os.path.join(OUT, "overview.png")
        ov.save(p)
        print("  已生成 %s  (%d 组总览)" % (os.path.relpath(p, ROOT), len(made)))


if __name__ == "__main__":
    main()