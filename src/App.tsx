import { useEffect, useState } from "react";
import MainWorkbench from "./ui/MainWorkbench";
import SettingsScreen from "./screens/SettingsScreen";

type View = "main" | "settings";

/**
 * 应用外壳：环境光壁纸（.ambient 漂移光斑 + .grain 颗粒）铺满窗口，
 * 两个屏幕的液态玻璃面板悬浮其上（材质见 styles/glass.css）。
 *
 * 指针镜面反光（.glint）：委托监听 pointermove，把光斑坐标写进
 * 目标元素的 --mx/--my —— 玻璃表面的高光随指针游移（iOS Liquid Glass
 * 的动态镜面反射的低成本仿真）。
 */
export default function App() {
  const [view, setView] = useState<View>("main");

  /**
   * 视图切换。除了换屏，还要在 <html> 上记下导航方向：
   * 前进（进设置）→ 新屏从右侧推入；返回 → 从左侧推入。
   * 位移方向与"用户往哪走"一致，回来时才不会像又往前走了一次。
   */
  const go = (next: View) => {
    document.documentElement.dataset.nav = next === "settings" ? "forward" : "back";
    setView(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // 输入法组词中的 Esc 是取消组词，不是退出界面
      if (e.isComposing) return;
      // 有模态打开时，Esc 只关模态（由模态自行处理，不冒泡到这里生效）
      if (document.querySelector(".qmodal, .memo-modal:not(.dock-wrap)")) return;
      document.documentElement.dataset.nav = "back";
      setView("main");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 指针镜面反光（.glint）：委托监听 pointermove，把光斑坐标写进目标元素的
  // --mx/--my。用 rAF 合帧：pointermove 在高刷鼠标上可达 1000Hz，而每帧最多
  // 只需要一次测量 + 一次写入，否则会在移动中反复触发布局计算。
  useEffect(() => {
    let pending: PointerEvent | null = null;
    let raf = 0;
    const flush = () => {
      raf = 0;
      const e = pending;
      pending = null;
      if (!e) return;
      const el = (e.target as HTMLElement | null)?.closest?.(".glint") as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      el.style.setProperty("--mx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
      el.style.setProperty("--my", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
    };
    const onMove = (e: PointerEvent) => {
      pending = e;
      if (!raf) raf = requestAnimationFrame(flush);
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="app-shell">
      {/* 环境光壁纸：玻璃透出的"风景"，三主题各自的色相（tokens.css --orb-*） */}
      <div className="ambient" aria-hidden="true">
        <span className="orb" />
        <span className="orb" />
        <span className="orb" />
        <span className="orb" />
      </div>
      <div className="grain" aria-hidden="true" />

      {view === "settings" ? (
        <SettingsScreen onBack={() => go("main")} />
      ) : (
        <MainWorkbench onOpenSettings={() => go("settings")} />
      )}
    </div>
  );
}
