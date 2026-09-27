# -*- coding: utf-8 -*-
"""把 reference/ui-mock.html 的静态实现转成 React 组件。

依据：用户已给出 HTML 代码基础，禁止自行创新 —— 本脚本只做机械转换，
不改变任何类名、尺寸、文案、结构。
"""
import io
import os
import re

SRC = r"S:\writerD\reference\ui-mock.html"
OUT = r"S:\writerD\src"

# SVG / HTML 属性名 → React 属性名
ATTR_MAP = {
    "viewbox": "viewBox",
    "stroke-width": "strokeWidth",
    "stroke-linecap": "strokeLinecap",
    "stroke-linejoin": "strokeLinejoin",
    "stroke-dasharray": "strokeDasharray",
    "fill-rule": "fillRule",
    "clip-rule": "clipRule",
    "stroke-opacity": "strokeOpacity",
    "fill-opacity": "fillOpacity",
    "stop-color": "stopColor",
    "stop-opacity": "stopOpacity",
    "class": "className",
    "for": "htmlFor",
    "tabindex": "tabIndex",
    "xmlns:xlink": "xmlnsXlink",
    "xlink:href": "xlinkHref",
}


def style_to_obj(s):
    """style="left:56px;top:2px" → {{left:"56px",top:"2px"}}"""
    parts = []
    for decl in s.split(";"):
        decl = decl.strip()
        if not decl or ":" not in decl:
            continue
        k, v = decl.split(":", 1)
        k = k.strip()
        v = v.strip().replace('"', '\\"')
        # 驼峰化
        camel = re.sub(r"-([a-z])", lambda m: m.group(1).upper(), k)
        if re.fullmatch(r"-?\d+(\.\d+)?", v):
            val = v
        else:
            val = '"%s"' % v
        parts.append("%s: %s" % (camel, val))
    return "{{%s}}" % ", ".join(parts)


def conv_attrs(tag_attrs: str) -> str:
    """转换标签内的所有属性。"""
    out = []
    # 逐个属性匹配：name="value" 或 name={...}
    for m in re.finditer(r'([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*"([^"]*)"', tag_attrs):
        name, val = m.group(1), m.group(2)
        low = name.lower()
        if low == "style":
            out.append("style=%s" % style_to_obj(val))
        elif low == "class":
            out.append('className="%s"' % val)
        elif low in ATTR_MAP:
            out.append('%s="%s"' % (ATTR_MAP[low], val))
        else:
            out.append('%s="%s"' % (name, val))
    # 处理 onClick（mock 里的 onclick）
    return " ".join(out)


def convert(html: str) -> str:
    # 去注释
    html = re.sub(r"<!--.*?-->", "", html, flags=re.S)
    # 属性转换：对每个开标签单独处理
    def repl_tag(m):
        full = m.group(0)
        inner = full[1:-1] if full.endswith("/>") else full[1:-1]
        closing = "/>" if full.endswith("/>") else ">"
        # 分离标签名
        mm = re.match(r"([a-zA-Z][-a-zA-Z0-9]*)(\s*)(.*)$", inner, re.S)
        if not mm:
            return full
        tag, _, attrs = mm.group(1), mm.group(2), mm.group(3)
        if tag.lower() == "svg" and "viewbox" in attrs.lower():
            attrs = re.sub(r'viewBox=', 'viewBox=', attrs, flags=re.I)
        newattrs = conv_attrs(attrs)
        return "<%s%s%s%s" % (tag, " " if newattrs else "", newattrs, closing)

    html = re.sub(r"<[a-zA-Z][^>]*>", repl_tag, html, flags=re.S)

    # onclick → onClick（mock 里只有一处）
    html = html.replace(
        'onclick="document.body.dataset.view=\'a\';syncSwitch()"',
        'onClick={onOpenSettings}',
    )
    html = html.replace('style="font-style:normal"', 'style={{ fontStyle: "normal" }}')
    # 自闭合修正：<path ...></path> 已是合法 JSX
    return html


def extract_block(src: str, anchor: str) -> str:
    """从 anchor（形如 id="screenA"）所在的 div 起，提取配对的 <div> 块。"""
    i = src.index(anchor)
    j = src.rindex("<div", 0, i + 1)
    depth = 0
    k = j
    while k < len(src):
        if src.startswith("</div>", k):
            depth -= 1
            k += 6
            if depth == 0:
                return src[j:k]
        elif src.startswith("<div", k):
            depth += 1
            k += 4
        else:
            k += 1
    raise ValueError("未找到配对 div: " + anchor)


def brand(js: str) -> str:
    """品牌替换：OpenWrite 的紫色渐变占位标 → 用户提供的 writerD logo。

    只改「品牌标识」这一处，不动任何尺寸、色值、结构、文案（除产品名）。
    logo 由用户提供：S:\\writerD\\IMG_8741.PNG → src/assets/logo.png（带透明通道）。
    """
    js2 = re.sub(
        r'(<div className="brand-mark">)\s*<svg.*?</svg>',
        r'\1<img src={logo} alt="" />',
        js,
        flags=re.S,
    )
    if js2 == js:
        raise SystemExit("品牌替换失败：未在转换结果中找到 .brand-mark 的 svg")
    js2 = js2.replace(
        '<div className="brand-name">OpenWrite</div>',
        '<div className="brand-name">writerD</div>',
    )
    # 主界面中部的空态 hero 也带一处旧品牌标与旧产品名
    js2 = re.sub(
        r'(<div className="b-hero-logo">)\s*<svg.*?</svg>',
        r'\1<img src={logo} alt="" />',
        js2,
        flags=re.S,
    )
    js2 = js2.replace("<h2>OpenWrite</h2>", "<h2>writerD</h2>")
    return js2


def main():
    import sys
    css_only = "--css-only" in sys.argv[1:]
    src = io.open(SRC, encoding="utf-8").read()

    # ---- 1. 提取 CSS ----
    css = re.search(r"<style>(.*?)</style>", src, re.S).group(1)
    # 去掉演示用的 view 切换规则（React 用状态控制）
    css = re.sub(r"\[data-view=\"[ab]\"\][^}]*\}", "", css)
    # 去掉演示外壳：html/body 背景与 padding、.stage 布局、.win-frame 装饰、.switcher
    # 真实应用中窗口即画布，这些装饰会露出窗口底色
    # 注意 body{padding:24px 24px 72px} 是 mock 的展示留白，必须一并删除，
    # 否则整个界面会右移 24px、底部空出 72px。
    #
    # ⚠️ 曾经的事故（已修）：此处原来写的是 r"body\{[^}]*\}"（无边界），
    #    selectors 里的 ".b-body{" 和 ".b-editor-body{" 都含子串 "body{"，
    #    因而被一并删掉，各留下 ".b-" 与 ".b-editor-" 两个悬挂碎片；
    #    碎片会与紧随其后的选择器拼成后代选择器（".b- .b-left"），
    #    使 .b-left 与 .b-editor-body h1 两条规则也一起失效。
    #    现在要求 body 前必须是行首（可选 html,），杜绝误伤。
    css = re.sub(r"(?m)^[ \t]*(?:html[ \t]*,[ \t]*)?body[ \t]*\{[^}]*\}", "", css)
    css = re.sub(r"\.stage\{[^}]*\}", "", css)
    css = re.sub(r"\.win-frame\{[^}]*\}", "", css)
    css = re.sub(r"\.switcher[^{]*\{[^}]*\}", "", css)
    css = re.sub(r"\.switcher \.[^{]*\{[^}]*\}", "", css)
    css = re.sub(r"\[data-view=[^\]]*\][^{]*\{[^}]*\}", "", css)
    os.makedirs(os.path.join(OUT, "styles"), exist_ok=True)
    io.open(os.path.join(OUT, "styles", "screens.css"), "w", encoding="utf-8").write(
        "/* 从 reference/ui-mock.html 机械转换，禁止手改尺寸与色值。\n"
        "   已剔除演示外壳（html/body 背景、.stage、.win-frame、.switcher），\n"
        "   因为这些是 mock 的展示脚手架，不属于应用界面本体。 */\n"
        + css.strip() + "\n"
    )
    print("写入 styles/screens.css  (%d 字节)" % len(css))

    # 守卫：转换结果不得出现「悬挂选择器碎片」（整行只剩 .xxx-）。
    # 碎片会与紧随其后的规则拼成后代选择器（".b- .b-left"），使其静默失效。
    for ln, line in enumerate(css.splitlines(), 1):
        if re.fullmatch(r"\.[A-Za-z0-9_-]+-[ \t]*", line):
            raise SystemExit("转换出错：CSS 第 %d 行出现悬挂选择器碎片 %r" % (ln, line))

    # ---- 2. 提取两个界面 ----
    if css_only:
        # screens/*.tsx 已被数据驱动实现取代（src/ui/MainWorkbench.tsx、
        # src/screens/SettingsScreen.tsx），重跑转换只为刷新 screens.css；
        # 覆盖它们会销毁手写的数据绑定，因此此模式只出 CSS。
        print("--css-only：跳过 TSX 输出")
        return

    a = extract_block(src, 'id="screenA"')
    b = extract_block(src, 'id="screenB"')
    print("界面 A: %d 字节" % len(a))
    print("界面 B: %d 字节" % len(b))

    ja, jb = brand(convert(a)), brand(convert(b))

    os.makedirs(os.path.join(OUT, "screens"), exist_ok=True)

    io.open(os.path.join(OUT, "screens", "SettingsScreen.tsx"), "w", encoding="utf-8").write(
        "// 设置 / AI 提供商 —— 由 reference/ui-mock.html 机械转换\n"
        'import logo from "../assets/logo.png";\n'
        "export default function SettingsScreen() {\n  return (\n    <>%s</>\n  );\n}\n" % ja
    )
    io.open(os.path.join(OUT, "screens", "MainScreen.tsx"), "w", encoding="utf-8").write(
        "// 主界面 —— 由 reference/ui-mock.html 机械转换\n"
        'import logo from "../assets/logo.png";\n'
        "export default function MainScreen({ onOpenSettings }: { onOpenSettings: () => void }) {\n"
        "  return (\n    <>%s</>\n  );\n}\n" % jb
    )
    print("写入 screens/SettingsScreen.tsx (%d 字节)" % len(ja))
    print("写入 screens/MainScreen.tsx (%d 字节)" % len(jb))


if __name__ == "__main__":
    main()
