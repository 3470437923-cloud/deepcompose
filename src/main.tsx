import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/screens.css";

// 运行时错误只进控制台（打包版不污染窗口标题）
window.onerror = (msg, src, line, col) => {
  console.error("ERR:", String(msg), src, line, col);
  return false;
};
window.onunhandledrejection = (e) => {
  console.error("REJ:", String(e.reason));
};



createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
