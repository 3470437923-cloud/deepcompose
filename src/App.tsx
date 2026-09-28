import { useEffect, useState } from "react";
import MainWorkbench from "./ui/MainWorkbench";
import SettingsScreen from "./screens/SettingsScreen";

type View = "main" | "settings";

// 布局为流体式（见 base.css 流体布局段）：窗口即画布，随窗口尺寸自适应，
// 不再做整体 transform 缩放（等比缩放会产生黑边且文字发虚）。

export default function App() {
  const [view, setView] = useState<View>("main");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // 输入法组词中的 Esc 是取消组词，不是退出界面
      if (e.isComposing) return;
      // 有对话框打开时，Esc 只关对话框（由 Dialogs 自行处理）
      if (document.querySelector(".qmodal")) return;
      setView("main");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app-shell">
      {view === "settings" ? (
        <SettingsScreen onBack={() => setView("main")} />
      ) : (
        <MainWorkbench onOpenSettings={() => setView("settings")} />
      )}
    </div>
  );
}
