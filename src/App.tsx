import { useEffect, useState } from "react";
import MainWorkbench from "./ui/MainWorkbench";
import SettingsScreen from "./screens/SettingsScreen";

type View = "main" | "settings";

// 界面画布定标：mock 声明 1920×1032，与真机窗口一致（CONTRACT §1/§2）。
// 窗口尺寸变化时等比缩放整个画布，保证任何窗口下都与 mock/真机比例一致。
const CANVAS_W = 1920;
const CANVAS_H = 1032;

export default function App() {
  const [view, setView] = useState<View>("main");

  useEffect(() => {
    const fit = () => {
      const s = Math.min(window.innerWidth / CANVAS_W, window.innerHeight / CANVAS_H);
      document.documentElement.style.setProperty("--fit", String(s));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setView("main");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app-shell">
      {view === "settings" ? (
        <SettingsScreen />
      ) : (
        <MainWorkbench onOpenSettings={() => setView("settings")} />
      )}
    </div>
  );
}
