/**
 * 应用内对话框（替代 window.prompt / window.confirm）：
 * WebView 原生对话框与液态玻璃主题不符（且标题显示 tauri.localhost），
 * 统一用本组件 —— iOS 风格玻璃 alert：毛玻璃遮罩 + 浮起玻璃片 + 居中排版。
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
      className="qmodal scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) done(null);
      }}
    >
      <div className="qbox glass sheet">
        <h3>{req.title}</h3>
        <input
          ref={inputRef}
          className="field"
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
          <button className="btn btn-quiet" onClick={() => done(null)}>
            取消
          </button>
          <button className="btn btn-accent" onClick={() => done(value.trim() === "" ? null : value.trim())}>
            确定
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
      className="qmodal scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) done(false);
      }}
    >
      <div className="qbox glass sheet">
        <h3>{req.title}</h3>
        {req.body ? <p className="confirm-body">{req.body}</p> : null}
        <div className="a-form-actions">
          <button className="btn btn-quiet" onClick={() => done(false)}>
            取消
          </button>
          <button className={req.danger ? "btn btn-danger" : "btn btn-accent"} onClick={() => done(true)}>
            {req.confirmLabel ?? "确定"}
          </button>
        </div>
      </div>
    </div>
  );
}
