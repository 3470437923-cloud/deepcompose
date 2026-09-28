"""无障碍降级断言：确认三个媒体查询不只是写着好看，而是真的改变了计算样式。

截图只能证明"看起来没坏"，证明不了 prefers-* 分支被命中。这里直接读计算值，
对每档做方向性断言。三个容易自欺的地方，本脚本都绕开了：

  1. matchMedia 必须在设置仿真"之后"再读，否则读到的是上一状态。
  2. 断言要针对该块真正改动的属性。若只探测 :root 上的令牌，而那个块改的是
     .panel 的 box-shadow，就会得到"没变化"的假阴性。
  3. 元素要真的在 DOM 里。气泡要有会话，.cw-tip 只在欢迎空态 —— 两者不可能
     同屏，所以探针按所需状态分组，各测一轮。

用法：
    python tools/_a11y_check.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _shot_flow import CDP, FLOWS, run_flow  # noqa: E402

# (说明, 选择器, 伪元素, 计算属性, 通过条件, 需要先切到有消息的会话)
P = [
    ("光晕停止漂移", ".orb", None, "animationName", lambda v: v == "none", True),
    ("欢迎提示不动", ".cw-tip", None, "animationName", lambda v: v == "none", False),
    ("消息不动", ".msg", None, "animationName", lambda v: v == "none", True),
    ("打字点不动", ".typing i", None, "animationName", lambda v: v == "none", True),
    ("生成光晕停转", ".panel-chat.streaming", "::before", "animationName",
     lambda v: v == "none", True),
    ("过渡压到极短", ".btn", None, "transitionDuration",
     lambda v: all(float(x.strip().rstrip("s") or 0) <= 0.05 for x in v.split(",")), True),
]

PROBES = {
    "prefers-reduced-motion:reduce": P,
    "prefers-reduced-transparency:reduce": [
        ("玻璃不再模糊", ".glass", None, "backdropFilter", lambda v: v in ("none", ""), True),
        ("面板变实色", ".panel-files", None, "backgroundColor",
         lambda v: not v.startswith("rgba") or v.endswith(", 1)"), True),
        ("环境光球隐藏", ".orb", None, "display", lambda v: v == "none", True),
        ("呼吸层隐藏", ".panel-chat.streaming", "::after", "display",
         lambda v: v == "none", True),
    ],
    "prefers-contrast:more": [
        ("玻璃转实色", ".glass", None, "backdropFilter", lambda v: v in ("none", ""), True),
        ("环境光球隐藏", ".orb", None, "display", lambda v: v == "none", True),
        ("面板加描边", ".panel", None, "boxShadow",
         lambda v: "inset" not in v and v != "none", True),
        ("气泡加描边", ".bubble", None, "boxShadow", lambda v: "inset" in v, True),
        ("按钮加描边", ".btn", None, "boxShadow", lambda v: "inset" in v, True),
    ],
}

JS = """
(([sel, pseudo, prop]) => {
  const el = document.querySelector(sel);
  if (!el) return '__missing__';
  return String(getComputedStyle(el, pseudo || undefined)[prop]);
})(%s)
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


def main():
    c = CDP(9223)
    url = "http://localhost:5183/preview.html?theme=dsblue"
    c.cmd("Emulation.setDeviceMetricsOverride", width=1600, height=1000,
          deviceScaleFactor=1, mobile=False)
    bad = 0

    for feature, probes in PROBES.items():
        name, _, value = feature.partition(":")
        for seed in (False, True):
            group = [p for p in probes if p[5] == seed]
            if not group:
                continue
            print("\n===== %s  [%s] =====" % (feature, "有会话" if seed else "欢迎空态"))

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
                passed = now != "__missing__" and p[4](now)
                if not passed:
                    bad += 1
                print("  %-4s %-14s %-44s -> %s"
                      % ("PASS" if passed else "FAIL", label, (base.get(label) or "")[:44], now[:44]))

    print("\n%s" % ("全部通过" if bad == 0 else "有 %d 项未通过" % bad))
    return 0 if bad == 0 else 1


if __name__ == "__main__":
    sys.exit(main())