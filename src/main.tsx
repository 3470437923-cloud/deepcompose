import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/screens.css";

// 临时诊断：把运行时错误写进窗口标题（capture.ps1 会抓取 MainWindowTitle）
window.onerror = (msg, src, line, col) => {
  document.title = "ERR: " + String(msg).slice(0, 120) + " @" + line + ":" + col;
  return false;
};
window.onunhandledrejection = (e) => {
  document.title = "REJ: " + String(e.reason).slice(0, 140);
};

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
