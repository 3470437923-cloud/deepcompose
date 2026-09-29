"""无障碍降级断言 + 扁平度审计。

截图只能证明"看起来没坏"，证明不了 prefers-* 分支被命中，也证明不了
"整屏没有玻璃和渐变"。这里直接读计算样式做断言。

三件容易自欺的事，本脚本都绕开了：
  1. matchMedia 必须在设置仿真"之后"再读，否则读到的是上一状态。
  2. 断言要针对该块真正改动的属性。只探测 :root 令牌、而那个块改的是
     .panel 的 box-shadow，会得到"没变化"的假阴性。因此对比类断言
     一律拿"基准值 vs 降级值"来比，而不是对降级值凭空设一个期望。
  3. 元素要真的在 DOM 里。气泡要有会话，.cw-tip 只在欢迎空态 ——
     两者不可能同屏，所以探针按所需状态分组，各测一轮。

另外说明一件事：旧版本这里还有一个 prefers-reduced-transparency 分支的
断言组（玻璃不再模糊 / 面板转实色 / 光斑隐藏）。新版整屏在默认状态下
就是实色、无模糊、无光斑，那个分支已无对象（CSS 里也整块删除了），
所以这里不再仿真它，改为下面那段**扁平度审计** —— 它检验的正是
"旧分支要处理的问题在新体系里是否根本不存在"。
"""

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _shot_flow import CDP, FLOWS, run_flow  # noqa: E402

# (说明, 选择器, 伪元素, 计算属性, 断言(now, base), 需要先切到有消息的会话)
P = [
    ("进场动画关闭", ".win", None, "animationName", lambda v, b: v == "none", True),
    ("欢迎提示不动", ".cw-tip", None, "animationName", lambda v, b: v == "none", False),
    ("消息不动", ".msg", None, "animationName", lambda v, b: v == "none", True),
    ("打字点不动", ".typing i", None, "animationName", lambda v, b: v == "none", True),
    # 生成中的行进线在降级态换成"整宽静止实线"：动效没了，状态还在。
    ("生成行进线静止", ".panel-chat.streaming", "::before", "animationName",
     lambda v, b: v == "none", True),
    ("行进线转整宽静止", ".panel-chat.streaming", "::before", "width",
     lambda v, b: float(v.rstrip("px")) > float(b.rstrip("px")), True),
    ("过渡压到极短", ".btn", None, "transitionDuration",
     lambda v, b: all(float(x.strip().rstrip("s") or 0) <= 0.05 for x in v.split(",")), True),
]

PROBES = {
    "prefers-reduced-motion:reduce": P,
    "prefers-contrast:more": [
        ("面板描边加深", ".surface-sheet", None, "borderTopColor",
         lambda v, b: v != b, True),
        ("气泡加描边", ".bubble", None, "boxShadow", lambda v, b: "inset" in v, True),
        ("按钮加描边", ".btn", None, "boxShadow", lambda v, b: "inset" in v, True),
        ("发丝线令牌加深", ".statusbar", None, "borderTopColor",
         lambda v, b: v != b, True),
    ],
}

JS = """
(([sel, pseudo, prop]) => {
  const el = document.querySelector(sel);
  if (!el) return '__missing__';
  return String(getComputedStyle(el, pseudo || undefined)[prop]);
})(%s)
"""

# ── 扁平度审计 ──
# 目标态是"零玻璃、零渐变、零模糊"。逐元素扫（含 ::before/::after ——
# 旧体系里最漂亮的那处 conic 流光正好挂在伪元素上，只扫元素会漏掉）。
FLAT_JS = """
(() => {
  const label = (el) => {
    const cls = (el.className && String(el.className).trim().split(/\\s+/).slice(0, 3).join('.')) || '';
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '');
  };
  const blur = [], grad = [], filt = [];
  const nodes = Array.from(document.querySelectorAll('*'));
  for (const el of nodes) {
    for (const pseudo of [null, '::before', '::after']) {
      const s = getComputedStyle(el, pseudo || undefined);
      const where = label(el) + (pseudo || '');
      const bf = s.backdropFilter || s.webkitBackdropFilter;
      if (bf && bf !== 'none') blur.push(where + ' -> ' + bf);
      if (/gradient/.test(s.backgroundImage || '')) grad.push(where + ' -> ' + s.backgroundImage.slice(0, 90));
      if (/blur\\(/.test(s.filter || '')) filt.push(where + ' -> ' + s.filter);
    }
  }
  return JSON.stringify({
    blur: blur.slice(0, 12), grad: grad.slice(0, 12), filt: filt.slice(0, 12),
    counts: { blur: blur.length, grad: grad.length, filt: filt.length, elements: nodes.length },
  });
})()
"""


def pair(p):
    return json.dumps([p[1], p[2], p[3]])


def load(c, url, seed):
    """seed=True 先切到预置会话（才有 .msg/.bubble），再真发一条
    （才有 .streaming 与打字点）；seed=False 留在欢迎空态（才有 .cw-tip）。"""
    c.cmd("Page.navigate", url=url)
    if not c.wait_ready(min_text=60):
        return False
    if seed:
        run_flow(c, FLOWS["chat"], verbose=False)
    run_flow(c, FLOWS["stream"], verbose=False)
    return True


def media_checks(c, base_url, theme):
    """按主题逐套验。必须逐主题跑：三套主题的令牌定义在选择器
    `:root` 与 `html[data-theme="..."]` 上，特异性不同 —— 曾经就有
    一个 @media (prefers-contrast) 块只写 `:root`，于是对 light/dark
    完全失效、只在 dsblue 上碰巧命中。只在默认主题上验会漏掉它。"""
    url = "%s?theme=%s" % (base_url, theme)
    bad = 0
    for feature, probes in PROBES.items():
        name, _, value = feature.partition(":")
        for seed in (False, True):
            group = [p for p in probes if p[5] == seed]
            if not group:
                continue
            print("\n===== %s / %s  [%s] =====" % (theme, feature, "有会话" if seed else "欢迎空态"))

            c.cmd("Emulation.setEmulatedMedia", features=[])
            if not load(c, url, seed):
                print("  FAIL 基准页面未就绪")
                bad += 1
                continue
            base = {p[0]: c.eval(JS % pair(p)) for p in group}

            c.cmd("Emulation.setEmulatedMedia", features=[{"name": name, "value": value}])
            if not load(c, url, seed):
                print("  FAIL 降级页面未就绪")
                bad += 1
                continue
            hits = c.eval("matchMedia(%s).matches" % json.dumps("(%s: %s)" % (name, value)))
            print("  降级态媒体查询命中: %s" % hits)
            if not hits:
                bad += 1

            for p in group:
                label, now = p[0], c.eval(JS % pair(p))
                passed = now != "__missing__" and p[4](now, base.get(label) or "")
                if not passed:
                    bad += 1
                print("  %-4s %-14s %-40s -> %s"
                      % ("PASS" if passed else "FAIL", label, (base.get(label) or "")[:40], now[:40]))
    c.cmd("Emulation.setEmulatedMedia", features=[])
    return bad


def flat_checks(c, base_url):
    """扁平度审计：默认状态下整屏应当零模糊、零渐变、零 filter:blur()。

    必须**逐视图**扫，不能只扫主工作台。曾经漏过一次：设置屏的强调色色板
    用内联 `linear-gradient` 画了一块渐变，而主工作台视图里看不到它，
    只扫主视图的审计给不出任何异常。
    """
    print("\n===== 扁平度审计（默认状态，含伪元素）=====")
    views = [
        # (视图名, 进入该视图的点击序列)
        ("主工作台", []),
        ("设置·提供商", [".wbtn"]),
        ("设置·主题", [".wbtn", ".a-nav-item:nth-of-type(4)"]),
        ("设置·参数", [".wbtn", ".a-nav-item:nth-of-type(3)"]),
        ("设置·数据", [".wbtn", ".a-nav-item:nth-of-type(6)"]),
        ("设置·关于", [".wbtn", ".a-nav-item:nth-of-type(7)"]),
        ("备忘录", ['.tb-btn[title="备忘录"]']),
    ]
    bad = 0
    c.cmd("Emulation.setEmulatedMedia", features=[])
    for theme in ("dsblue", "light", "dark"):
        for view, clicks in views:
            u = "%s?theme=%s" % (base_url, theme)
            c.cmd("Page.navigate", url=u)
            if not c.wait_ready(min_text=60):
                print("  FAIL %s/%s 未就绪" % (theme, view))
                bad += 1
                continue
            for sel in clicks:
                c.eval("(() => { const el=document.querySelector(%s);"
                       " if (el) el.click(); return 1; })()" % json.dumps(sel))
                time.sleep(0.7)
            raw = c.eval(FLAT_JS)
            try:
                r = json.loads(raw) if isinstance(raw, str) else raw
            except Exception:
                print("  FAIL %s/%s 审计脚本未返回可解析结果: %s" % (theme, view, str(raw)[:120]))
                bad += 1
                continue
            n = r["counts"]
            ok = n["blur"] == 0 and n["grad"] == 0 and n["filt"] == 0
            print("  %-4s %-7s %-14s 元素=%d backdrop-filter=%d 渐变=%d filter:blur=%d"
                  % ("PASS" if ok else "FAIL", theme, view, n["elements"], n["blur"], n["grad"], n["filt"]))
            if not ok:
                bad += 1
                for key in ("blur", "grad", "filt"):
                    for item in r[key][:6]:
                        print("        %s: %s" % (key, item))
    return bad


# 过渡存活检查：一个未定义的自定义属性会让整条 transition 简写在计算值
# 阶段失效，于是该元素**完全没有过渡** —— 页面上看不出来，截图看不出
# 来，但它把全站的悬停/按压反馈一次性拿掉了。这个探针专门盯这一类：
# 引用了消失令牌的元素，其 transitionDuration 会塌成 0s。
# 探针必须选**真正携带 transition 的那个元素**。曾经把 .composer-input 列进来
# 并判成失败 —— 其实它按设计就没有过渡，过渡挂在父级 .composer 的 box-shadow
# 上（聚焦时整块输入区亮一圈强调色）。选错元素会把"探针写错"报成"代码有缺陷"，
# 和漏报一样糟。
ALIVE = [
    ("按钮有过渡", ".btn"),
    ("树节点有过渡", ".tnode"),
    ("页签有过渡", ".tab"),
    ("输入区聚焦有过渡", ".composer"),
    ("胶囊有过渡", ".chip"),
]


def alive_checks(c, base_url):
    print("\n===== 过渡存活（多套主题）=====")
    bad = 0
    c.cmd("Emulation.setEmulatedMedia", features=[])
    for theme in ("dsblue", "light", "dark"):
        c.cmd("Page.navigate", url="%s?theme=%s" % (base_url, theme))
        if not c.wait_ready(min_text=60):
            print("  FAIL %s 未就绪" % theme)
            bad += 1
            continue
        run_flow(c, FLOWS["editor"], verbose=False)
        for label, sel in ALIVE:
            v = c.eval(JS % json.dumps([sel, None, "transitionDuration"]))
            if v == "__missing__":
                print("  SKIP %-7s %-14s 页面上没有这个元素" % (theme, label))
                continue
            vals = [float(x.strip().rstrip("s") or 0) for x in v.split(",")]
            ok = max(vals) > 0.02
            if not ok:
                bad += 1
            print("  %-4s %-7s %-14s %s" % ("PASS" if ok else "FAIL", theme, label, v))
    return bad


def main():
    c = CDP(9223)
    url = "http://localhost:5183/preview.html"
    c.cmd("Emulation.setDeviceMetricsOverride", width=1600, height=1000,
          deviceScaleFactor=1, mobile=False)

    bad = 0
    for theme in ("dsblue", "light", "dark"):
        bad += media_checks(c, url, theme)
    bad += flat_checks(c, url)
    bad += alive_checks(c, url)
    print("\n%s" % ("全部通过" if bad == 0 else "有 %d 项未通过" % bad))
    return 0 if bad == 0 else 1


if __name__ == "__main__":
    sys.exit(main())