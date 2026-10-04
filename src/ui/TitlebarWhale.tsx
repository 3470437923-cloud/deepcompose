/**
 * 标题栏鲸鱼（DeepCompose 的吉祥物 + 用量面板入口）。
 *
 * 形态（D-039，2026-10 起）：**固定静止**，不再游动也不起伏——鲸鱼钉在走廊
 * 中点（走廊 = 面板开关簇右缘 + 24px 到设置齿轮左缘 − 24px），悬停/聚焦时
 * 面板仍在它正下方展开。闲置停游开关随之移除（没有可停的东西了）；
 * `whale_idle_pause` 配置键按封闭键集合纪律保留往返（prefs.ts），只是没有 UI。
 *
 * 交互契约：
 *  - 悬停：120ms 后展开面板；离开后 250ms 才收起（悬停意图，避免穿过标题栏时误弹）；
 *  - 键盘：鲸鱼是 `<button>`，聚焦即展开（无延迟），Tab 离开即收起，Esc 关闭；
 *  - 鲸鱼是按钮：标题栏的拖拽/双击最大化处理器都已排除 `button`，不会误触窗口拖动。
 *
 * 图形是自绘的胖蓝鲸（实心身体 + 双叶尾鳍 + 胸鳍 + 眼 + 嘴 + 喷气），
 * 不引用任何外部素材；`prefers-reduced-motion` 下它本来就不动，无需额外降级。
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { AppDirs } from "../core/dirs";
import type { Prefs } from "../core/prefs";
import type { UsageTotals } from "../core/usage/stats";
import UsagePanel from "./UsagePanel";

interface Props {
  dirs: AppDirs | null;
  prefs: Prefs | null;
  sessionUsage: UsageTotals;
}

/** 悬停意图延时：进 120ms / 出 250ms */
const OPEN_DELAY = 120;
const CLOSE_DELAY = 250;
/** 面板宽度（与 CSS `.usage-pop` 保持一致；只用于计算是否需要向左让位） */
const PANEL_W = 344;

export default function TitlebarWhale({ dirs, prefs, sessionUsage }: Props) {
  const laneRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const whaleRef = useRef<HTMLButtonElement | null>(null);
  /** 面板相对鲸鱼位置的偏移 + 右缘让位量（都在展开那一刻按实际矩形算） */
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
  const [pinned, setPinned] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const open = hoverOpen || pinned || focusOpen;
  const openTimer = useRef(0);
  const closeTimer = useRef(0);
  /** open 的 ref 镜像：ResizeObserver 回调里读"此刻是否展开"（见下方 anchor effect） */
  const openRef = useRef(false);
  openRef.current = open;

  /** 面板展开期间走廊宽度变化（开合文件/会话面板）→ 面板锚点跟着重算，不与鲸鱼脱开 */
  useEffect(() => {
    const lane = laneRef.current;
    if (!lane) return;
    const ro = new ResizeObserver(() => {
      if (openRef.current) measureAnchor();
    });
    ro.observe(lane);
    return () => ro.disconnect();
    // measureAnchor 是 useCallback([])，不会造成 observer 反复重建
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  /** 展开前按鲸鱼当前位置定位面板：先摆在它正下方，再按需向左让位避免越出窗口 */
  const measureAnchor = useCallback(() => {
    const rect = whaleRef.current?.getBoundingClientRect();
    const wrapRect = wrapRef.current?.getBoundingClientRect();
    if (!rect || !wrapRect) return;
    setPanelLeft(Math.round(rect.left - wrapRect.left));
    const overflow = rect.left + PANEL_W - (window.innerWidth - 14);
    setShift(overflow > 0 ? -Math.round(overflow) : 0);
  }, []);

  const onEnter = useCallback(() => {
    cancelClose();
    openTimer.current = window.setTimeout(() => {
      measureAnchor();
      setHoverOpen(true);
    }, OPEN_DELAY);
  }, [cancelClose, measureAnchor]);

  const onLeave = useCallback(() => {
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

  return (
    <div className="whale-lane" ref={laneRef}>
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
          className="whale-btn"
          title="DeepCompose 用量与余额（悬停预览，点一下钉住）"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="用量与余额"
          onClick={onTogglePin}
        >
          {/* 胖蓝鲸（头在右）：实心浑圆身体 + 双叶尾鳍 + 胸鳍。
              要点是"蓝鲸"而不是"鱼"：身体是个头圆肚满的纺锤（鱼是两头尖），
              尾巴是两叶分开的尾鳍（留出 V 形缺口，合画就退化成单片三角）。 */}
          <svg viewBox="0 0 40 24" className="whale-svg" aria-hidden="true">
            {/* 尾鳍上下两叶，中间自然留出深 V 缺口 */}
            <path className="whale-tail" d="M6.1 11.5 1.2 4.4 3.7 11.9Z" />
            <path className="whale-tail" d="M6.1 12.9 1.2 20 3.7 12.5Z" />
            {/* 身体：头圆肚满，尾部收进尾柄 */}
            <path
              className="whale-body"
              d="M6 12.2C6.3 6.4 13.4 3 21 3c7.6 0 14.4 4.1 14.4 9.2 0 5.1-6.8 9-14.4 9-7.6 0-14.7-3.4-15-9z"
            />
            {/* 胸鳍：身体下侧的桨状鳍 */}
            <path className="whale-fin" d="M25.6 17.2c2.4 2.4 1.5 5-2.2 4.4 1.7-1.3 2-2.9 2.2-4.4z" />
            <circle className="whale-eye" cx="29.4" cy="10" r="1.1" />
            {/* 嘴：一条微弯的短线 */}
            <path className="whale-smile" d="M28.7 14.7c1.9 1.1 3.8 1 4.9-.4" />
            {/* 喷气：三缕短斜线组成的水柱（两根细线在大尺寸下会被读成触角） */}
            <path className="whale-spout" d="M29.6 5.2c-.9-.9-.9-2.1.2-3.1" />
            <path className="whale-spout" d="M31.4 4.7c-.3-1.3.1-2.3 1.1-3" />
            <path className="whale-spout" d="M33.4 4.6c.3-1.2 1-2 2-2.4" />
          </svg>
        </button>

        {open ? <UsagePanel dirs={dirs} prefs={prefs} sessionUsage={sessionUsage} /> : null}
      </div>
    </div>
  );
}
