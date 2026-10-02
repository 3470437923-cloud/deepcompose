/**
 * 标题栏鲸鱼（DeepCompose 的吉祥物 + 用量面板入口）。
 *
 * 行为契约（D-030 与用户裁决）：
 *  - 游动走廊 = 「面板开关簇」右缘 + 24px 到「设置齿轮」左缘 − 24px；
 *    走廊由 CSS 的 `--whale-gutter` 定义，JS 只**测量**实际可用跨度（ResizeObserver），
 *    所以窗口拉宽/收窄、面板开关簇宽度变化都不会让它游出走廊；
 *  - 悬停：立刻停下游动，120ms 后展开面板；离开后 250ms 才收起（悬停意图，
 *    避免穿过标题栏时误弹面板）；
 *  - 键盘：鲸鱼是 `<button>`，聚焦即展开（无延迟），Tab 离开即收起，Esc 关闭；
 *  - 「闲置时停下游动」默认开：45 秒没有输入（指针/键盘/滚轮）就停下；开关在面板页脚（D-030）；
 *  - `prefers-reduced-motion` 下**完全不游动**（动效优先级低于无障碍）；
 *  - 鲸鱼是按钮：标题栏的拖拽/双击最大化处理器都已排除 `button`，不会误触窗口拖动。
 *
 * 图形是自绘的最小鲸鱼（三段 path + 一只眼睛），不引用任何外部素材。
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { AppDirs } from "../core/dirs";
import type { Prefs } from "../core/prefs";
import type { UsageTotals } from "../core/usage/stats";
import { IDLE_AFTER_MS, isIdle } from "../core/usage/view";
import UsagePanel from "./UsagePanel";

interface Props {
  dirs: AppDirs | null;
  prefs: Prefs | null;
  sessionUsage: UsageTotals;
  idlePause: boolean;
  onToggleIdlePause: (next: boolean) => void;
}

/** 悬停意图延时：进 120ms / 出 250ms */
const OPEN_DELAY = 120;
const CLOSE_DELAY = 250;
/** 面板宽度（与 CSS `.usage-pop` 保持一致；只用于计算是否需要向左让位） */
const PANEL_W = 344;

export default function TitlebarWhale({ dirs, prefs, sessionUsage, idlePause, onToggleIdlePause }: Props) {
  const laneRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const whaleRef = useRef<HTMLButtonElement | null>(null);
  /** 走廊实际跨度（lane 内容宽 − 鲸鱼宽），写进 CSS 变量给关键帧用 */
  const [span, setSpan] = useState(0);
  const [idle, setIdle] = useState(false);
  /** 面板相对鲸鱼当前位置的偏移 + 右缘让位量（都在展开那一刻按实际矩形算） */
  const [panelLeft, setPanelLeft] = useState(0);
  const [shift, setShift] = useState(0);
  /**
   * 展开状态分三个来源，`open` 是它们的并集 —— 这样"鼠标点一下"与"键盘聚焦"
   * 不会互相打架（早先版本用单个 open + 点击取反：聚焦先开、紧接着的 click 又把它关掉，
   * 于是鼠标点鲸鱼反而什么都没弹出）：
   *   hoverOpen —— 悬停预览（移开自动收）；
   *   pinned    —— 点击钉住（移开也留着，再点一次或 Esc 收起）；
   *   focusOpen —— 键盘聚焦（Tab 到它即展开，焦点离开即收）。
   */
  const [hoverOpen, setHoverOpen] = useState(false);
  /** 指针在鲸鱼（或面板）上 —— 只用于"停下游动"（悬停即停） */
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const open = hoverOpen || pinned || focusOpen;
  const openTimer = useRef(0);
  const closeTimer = useRef(0);
  const lastActivity = useRef(Date.now());
  /** open 的 ref 镜像：ResizeObserver 回调里读"此刻是否展开"（见下方 measure） */
  const openRef = useRef(false);
  openRef.current = open;

  /** 走廊测量：窗口缩放、开关簇变化、字体变化都会触发 */
  useEffect(() => {
    const lane = laneRef.current;
    const whale = whaleRef.current;
    if (!lane || !whale) return;
    const measure = () => {
      const gutter = parseFloat(getComputedStyle(lane).getPropertyValue("--whale-gutter")) || 24;
      // 鲸鱼是绝对定位的，所以量它自己的宽度（wrap 会塌成 0 宽）
      const usable = lane.clientWidth - gutter * 2 - whale.offsetWidth;
      setSpan(Math.max(0, Math.round(usable)));
      // D-3b：面板展开期间走廊宽度变化（开合文件/会话面板、右侧开关簇增减）→
      // 鲸鱼停点随之改变，面板锚点跟着重算 —— 否则面板留在旧位置，与鲸鱼脱开
      if (openRef.current) measureAnchor();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(lane);
    return () => ro.disconnect();
    // measureAnchor 是 useCallback([])，不会造成 observer 反复重建
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 闲置检测：活动只更新 ref，状态每秒才比对一次（避免每次 pointermove 重渲染） */
  useEffect(() => {
    const bump = () => {
      lastActivity.current = Date.now();
    };
    const events: (keyof WindowEventMap)[] = ["pointermove", "pointerdown", "keydown", "wheel"];
    for (const e of events) window.addEventListener(e, bump, { passive: true });
    const t = window.setInterval(() => {
      const next = isIdle(lastActivity.current, Date.now(), IDLE_AFTER_MS);
      setIdle((cur) => (cur === next ? cur : next));
    }, 1000);
    return () => {
      for (const e of events) window.removeEventListener(e, bump);
      window.clearInterval(t);
    };
  }, []);

  const cancelClose = useCallback(() => {
    window.clearTimeout(closeTimer.current);
    window.clearTimeout(openTimer.current);
  }, []);

  const scheduleClose = useCallback(() => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setHoverOpen(false), CLOSE_DELAY);
  }, []);

  /**
   * 展开前按鲸鱼当前位置定位面板：先摆在它正下方，再按需向左让位避免越出窗口。
   * 用 `requestAnimationFrame` 之外的时机读取：鲸鱼被 `paused` 冻住后再量，位置才是它停下的地方。
   */
  const measureAnchor = useCallback(() => {
    const rect = whaleRef.current?.getBoundingClientRect();
    const wrapRect = wrapRef.current?.getBoundingClientRect();
    if (!rect || !wrapRect) return;
    setPanelLeft(Math.round(rect.left - wrapRect.left));
    const overflow = rect.left + PANEL_W - (window.innerWidth - 14);
    setShift(overflow > 0 ? -Math.round(overflow) : 0);
  }, []);

  const onEnter = useCallback(() => {
    // 悬停立刻停下（用户已经瞄上它了），再等 120ms 展开面板
    setHovered(true);
    cancelClose();
    openTimer.current = window.setTimeout(() => {
      measureAnchor();
      setHoverOpen(true);
    }, OPEN_DELAY);
  }, [cancelClose, measureAnchor]);

  const onLeave = useCallback(() => {
    setHovered(false);
    scheduleClose();
  }, [scheduleClose]);

  /** 点一下钉住/取消钉住；取消时连悬停预览一起收掉（否则指针还在上面，看着像"点了没反应"） */
  const onTogglePin = useCallback(() => {
    cancelClose();
    measureAnchor();
    if (pinned) {
      setPinned(false);
      setHoverOpen(false);
    } else {
      setPinned(true);
    }
  }, [pinned, cancelClose, measureAnchor]);

  /** 收起（Esc / 焦点离开）：三个来源一起清 */
  const closeAll = useCallback(() => {
    cancelClose();
    setHoverOpen(false);
    setPinned(false);
    setFocusOpen(false);
  }, [cancelClose]);

  useEffect(() => () => cancelClose(), [cancelClose]);

  /**
   * 让位校正：上面的 `measureAnchor` 是"预测"（rect.left + 面板宽度），
   * 预测会受圆角、缩放、字体度量影响；面板真挂上去之后按它的**真实矩形**再修一次，
   * 保证左右两边都不越出窗口。layout effect 里改，用户看不到中间态。
   */
  useLayoutEffect(() => {
    if (!open) return;
    const pop = wrapRef.current?.querySelector<HTMLElement>(".usage-pop");
    if (!pop) return;
    const r = pop.getBoundingClientRect();
    const overRight = r.right - (window.innerWidth - 12);
    const overLeft = 12 - r.left;
    if (overRight > 0) setShift((s) => s - Math.round(overRight));
    else if (overLeft > 0) setShift((s) => s + Math.round(overLeft));
  }, [open]);

  const paused = hovered || open || (idlePause && idle);

  return (
    <div
      className="whale-lane"
      ref={laneRef}
      style={{ "--whale-span": `${span}px` } as CSSProperties}
    >
      <div
        className="whale-wrap"
        ref={wrapRef}
        style={{ "--panel-left": `${panelLeft}px`, "--usage-shift": `${shift}px` } as CSSProperties}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onFocus={(e) => {
          // 鼠标点击也会触发 focus；那种情况交给 hover/click（`pinned`）逻辑，
          // 只有键盘聚焦（:focus-visible）才在这里直接展开
          if (!(e.target as HTMLElement).matches(":focus-visible")) return;
          cancelClose();
          measureAnchor();
          setFocusOpen(true);
        }}
        onBlur={(e) => {
          // 焦点离开整个鲸鱼+面板区域才收起（面板内部的 Tab 不算离开）
          if (!wrapRef.current?.contains(e.relatedTarget as Node | null)) setFocusOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.stopPropagation();
            closeAll();
          }
        }}
      >
        <button
          ref={whaleRef}
          className={`whale-btn${paused ? " paused" : ""}`}
          title="DeepCompose 用量与余额（悬停预览，点一下钉住）"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="用量与余额"
          onClick={onTogglePin}
        >
          <span className="whale-bob">
            {/* 自绘最小鲸鱼（朝右；返程由 scaleX(-1) 镜像）。要点是"鲸"而不是"鱼"：
                身体是头圆、尾根收成一点的泪滴形（鱼是两头尖的纺锤形），
                尾巴是两叶内凹的尾鳍（不是单片三角），再加一片胸鳍。 */}
            <svg viewBox="0 0 40 24" className="whale-svg" aria-hidden="true">
              {/* 尾鳍：两片分开画，中间自然留出深 V 缺口（合在一起画就会退化成单片三角） */}
              <path className="whale-tail" d="M12.8 11.8 2.2 3.2 4.6 12Z" />
              <path className="whale-tail" d="M12.8 13 2.2 21.2 4.6 12.4Z" />
              {/* 身体：头圆、尾根收成一点（泪滴形） */}
              <path
                className="whale-body"
                d="M36.6 12.2c0-3.8-4.6-6.8-11.2-6.8-6 0-10 2.6-12.4 6.8 2.4 4.2 6.4 6.8 12.4 6.8 6.6 0 11.2-3 11.2-6.8z"
              />
              {/* 背鳍 */}
              <path
                className="whale-fin"
                d="M21.6 5.6c1.5 1.1 2.7 2.4 3.4 3.9-1.7-.8-3.4-1.3-5-1.5.6-.8 1-1.6 1.6-2.4z"
              />
              {/* 胸鳍：身体下侧的桨状鳍 */}
              <path className="whale-fin" d="M27.2 17.4c2.2 2.4 1.4 5-2 4.2 1.8-1.2 2-2.8 2-4.2z" />
              <circle className="whale-eye" cx="32.2" cy="10.8" r="1.1" />
              {/* 喷气：三缕短斜线组成的水柱（两根细线在大尺寸下会被读成触角） */}
              <path className="whale-spout" d="M29.6 5.2c-.9-.9-.9-2.1.2-3.1" />
              <path className="whale-spout" d="M31.4 4.7c-.3-1.3.1-2.3 1.1-3" />
              <path className="whale-spout" d="M33.4 4.6c.3-1.2 1-2 2-2.4" />
            </svg>
          </span>
        </button>

        {open ? (
          <UsagePanel
            dirs={dirs}
            prefs={prefs}
            sessionUsage={sessionUsage}
            idlePause={idlePause}
            onToggleIdlePause={onToggleIdlePause}
          />
        ) : null}
      </div>
    </div>
  );
}