import { useEffect, useState } from "react";
import MainWorkbench from "./ui/MainWorkbench";
import SettingsScreen from "./screens/SettingsScreen";

type View = "main" | "settings";

/**
 * 应用外壳。
 *
 * 这里现在只剩两件事：换屏，和换屏的方向。旧版本在外壳上叠了三样装饰 ——
 * 环境光壁纸（.ambient 漂移光斑）、颗粒层（.grain）、以及跟随指针游移的
 * 镜面反光（.glint）——它们都属于"液态玻璃"那套叙事：面板必须是半透明的，
 * 才需要底下有风景可透、才需要表面有高光可动。实色体系下这三样全部失去
 * 前提，因此整块删除，而不是留着调低透明度。
 *
 * 顺带省掉的成本：一张 58vmax 的模糊光斑层 + 每帧 q 一次 getBoundingClientRect
 * 的指针监听 + 一条 74–104s 的不停歇 CSS 动画。这个界面要连续开几个小时。
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

  return (
    <div className="app-shell">
      {view === "settings" ? (
        <SettingsScreen onBack={() => go("main")} />
      ) : (
        <MainWorkbench onOpenSettings={() => go("settings")} />
      )}
    </div>
  );
}