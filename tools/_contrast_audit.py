"""对比度审计：按 WCAG 2.1 计算每套主题里文字与它实际落在的面之间的对比度。

难点在于面板是半透明玻璃 —— 文字并不是落在"某个色值"上，而是落在
「玻璃 tint 叠加壁纸」的合成色上。本脚本在真实浏览器里读取令牌，
按 alpha 合成算出面板的有效底色，再和文字色求对比度，因此给的是
屏幕上真实成立的数字，而不是猜的。

用法：
    python tools/_contrast_audit.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _shot_flow import CDP  # noqa: E402

CONTRAST_JS = r"""
(() => {
  const root = document.documentElement;

  const parse = (c) => {
    const m = String(c).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };

  // 关键：自定义属性读出来是「原始令牌文本」（可能是 #hex 或 color-mix(...)），
  // 不是解析后的颜色。把它写进一个真实属性，再读回计算值，才能拿到真色。
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px';
  document.body.appendChild(probe);
  const tok = (name) => {
    probe.style.color = '';
    probe.style.color = 'var(' + name + ')';
    return parse(getComputedStyle(probe).color);
  };

  const over = (src, dst) => ({
    r: src.r * src.a + dst.r * (1 - src.a),
    g: src.g * src.a + dst.g * (1 - src.a),
    b: src.b * src.a + dst.b * (1 - src.a),
    a: 1,
  });
  const chan = (x) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const lum = (c) => 0.2126 * chan(c.r) + 0.7152 * chan(c.g) + 0.0722 * chan(c.b);
  const ratio = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  // 壁纸取渐变两端的中值；面板 = glass-tint-a 叠在壁纸上；控件面/输入井再叠一层
  const bgA = tok('--bg-base'), bgB = tok('--bg-base-2');
  const wall = { r: (bgA.r + bgB.r) / 2, g: (bgA.g + bgB.g) / 2, b: (bgA.b + bgB.b) / 2, a: 1 };
  const panel = over(tok('--glass-tint-a'), wall);
  const ctl = over(tok('--ctl-fill'), panel);
  const inset = over(tok('--inset-bg'), panel);
  const surface = tok('--surface-a');
  const accentSolid = tok('--accent');

  const pairs = [
    ['tx-1 / 面板', tok('--tx-1'), panel],
    ['tx-2 / 面板', tok('--tx-2'), panel],
    ['tx-3 / 面板', tok('--tx-3'), panel],
    ['tx-dim / 面板', tok('--tx-dim'), panel],
    ['tx-1 / 模态面', tok('--tx-1'), surface],
    ['tx-3 / 模态面', tok('--tx-3'), surface],
    ['tx-dim / 模态面', tok('--tx-dim'), surface],
    ['tx-1 / 控件面', tok('--tx-1'), ctl],
    ['tx-3 / 控件面', tok('--tx-3'), ctl],
    ['tx-1 / 输入井', tok('--tx-1'), inset],
    ['tx-dim / 输入井', tok('--tx-dim'), inset],
    ['ok / 面板', tok('--ok'), panel],
    ['bad / 面板', tok('--bad'), panel],
    ['warn / 面板', tok('--warn'), panel],
    ['白字 / 强调色', { r: 255, g: 255, b: 255, a: 1 }, accentSolid],
  ];

  const out = pairs.map(([name, fg, bg]) => {
    if (!fg || !bg) return { name: name, ratio: null };
    const f = fg.a < 1 ? over(fg, bg) : fg;
    return { name: name, ratio: Math.round(ratio(f, bg) * 100) / 100 };
  });
  probe.remove();
  out.push({ name: '__panel', rgb: [Math.round(panel.r), Math.round(panel.g), Math.round(panel.b)] });
  out.push({ name: '__wall', rgb: [Math.round(wall.r), Math.round(wall.g), Math.round(wall.b)] });
  return JSON.stringify(out);
})()
"""


def grade(r):
    """WCAG 2.1：正文 4.5:1，大字/次要 3:1"""
    if r is None:
        return "??"
    if r >= 7:
        return "AAA"
    if r >= 4.5:
        return "AA "
    if r >= 3:
        return "AA大字"
    return "不足"


def main():
    c = CDP(9223)
    c.cmd("Emulation.setDeviceMetricsOverride", width=1600, height=1000, deviceScaleFactor=1, mobile=False)
    for theme in ("dsblue", "light", "dark"):
        c.cmd("Page.navigate", url="http://localhost:5183/preview.html?theme=%s" % theme)
        if not c.wait_ready(min_text=60):
            print("FAIL %s" % theme)
            continue
        rows = json.loads(c.eval(CONTRAST_JS))
        meta = {r["name"]: r.get("rgb") for r in rows if r["name"].startswith("__")}
        print("\n===== %s =====" % theme)
        print("  壁纸≈rgb(%d,%d,%d)  面板≈rgb(%d,%d,%d)"
              % (*meta["__wall"], *meta["__panel"]))
        for r in rows:
            if r["name"].startswith("__"):
                continue
            print("  %-22s %6.2f:1   %s" % (r["name"], r["ratio"], grade(r["ratio"])))


if __name__ == "__main__":
    main()