/**
 * 应用内对话框（替代 window.prompt / window.confirm）：
 * WebView 原生对话框样式与应用深色主题不符（且标题显示 tauri.localhost），
 * 统一用本组件，风格沿用 qmodal。
 */

import { useEffect, useRef, useState } from "react";

export interface InputRequest {
  title: string;
  placeholder?: string;
  resolve: (value: string | null) => void;
}

export interface ConfirmRequest {
  title: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

export function InputDialog({ req }: { req: InputRequest | null }) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (req) {
      setValue("");
      // 等模态挂载后聚焦
      requestAnimationFrame(() => inputRef.current?.focus());
      // Esc 任意位置可退出（不依赖焦点）
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") req.resolve(null);
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
  }, [req]);

  if (!req) return null;
  const done = (v: string | null) => {
    req.resolve(v);
  };
  return (
    <div
      className="qmodal"
      onClick={(e) => {
        if (e.target === e.currentTarget) done(null);
      }}
    >
      <div className="qbox" style={{ width: 460 }}>
        <h3>{req.title}</h3>
        <input
          ref={inputRef}
          className="a-form-input"
          value={value}
          placeholder={req.placeholder}
          spellCheck={false}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.key === "Process") return;
            if (e.key === "Enter") done(value.trim() === "" ? null : value.trim());
            if (e.key === "Escape") done(null);
          }}
        />
        <div className="a-form-actions">
          <button className="a-btn-primary" onClick={() => done(value.trim() === "" ? null : value.trim())}>
            确定
          </button>
          <button className="a-toolbtn" onClick={() => done(null)}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

export function ConfirmDialog({ req }: { req: ConfirmRequest | null }) {
  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") req.resolve(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [req]);

  if (!req) return null;
  const done = (ok: boolean) => req.resolve(ok);
  return (
    <div
      className="qmodal"
      onClick={(e) => {
        if (e.target === e.currentTarget) done(false);
      }}
    >
      <div className="qbox" style={{ width: 460 }}>
        <h3>{req.title}</h3>
        {req.body ? <p className="confirm-body">{req.body}</p> : null}
        <div className="a-form-actions">
          <button
            className={req.danger ? "a-btn-danger" : "a-btn-primary"}
            onClick={() => done(true)}
            style={req.danger ? { marginLeft: 0 } : undefined}
          >
            {req.confirmLabel ?? "确定"}
          </button>
          <button className="a-toolbtn" onClick={() => done(false)}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
