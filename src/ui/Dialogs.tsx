/**
 * 应用内对话框（替代 window.prompt / window.confirm）：
 * WebView 原生对话框的标题会显示 tauri.localhost，也没法跟随主题，
 * 所以统一用本组件 —— 一块抬升面 + 遮罩 + 居中排版。
 *
 * 本轮补上的无障碍缺口（都是"看不见但会伤到人"的那一类）：
 *   · 面板缺 role="dialog" / aria-modal / aria-labelledby ——
 *     读屏软件不知道这里出现了一个对话，也不知道它叫什么名字。
 *   · ConfirmDialog 原来完全不接管焦点：打开后焦点还留在触发它的
 *     那个按钮上，Tab 会一路走到遮罩背后的主界面里去。
 *   · 关闭后焦点不归还 —— 键盘用户被丢在文档开头。
 * 现在进入时把焦点移进面板、Tab 在面板内循环、关闭时归还给原元素。
 */

import { useEffect, useId, useRef, useState } from "react";
import { useDialogFocus } from "./useDialogFocus";

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
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (req) setValue("");
  }, [req]);

  // Esc 任意位置可退出（不依赖焦点落在哪里）
  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") req.resolve(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [req]);

  useDialogFocus(Boolean(req), panelRef, inputRef);

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
      <div
        className="qbox surface-raised sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={panelRef}
      >
        <h3 id={titleId}>{req.title}</h3>
        <input
          ref={inputRef}
          className="field"
          value={value}
          placeholder={req.placeholder}
          spellCheck={false}
          aria-labelledby={titleId}
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
  const panelRef = useRef<HTMLDivElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") req.resolve(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [req]);

  // 焦点默认落在确认键上 —— 这是一次"要不要做"的问句，
  // 停在"取消"上会让连续确认的操作者每次都要多按一次 Tab。
  useDialogFocus(Boolean(req), panelRef, confirmRef);

  if (!req) return null;
  const done = (ok: boolean) => req.resolve(ok);
  return (
    <div
      className="qmodal scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) done(false);
      }}
    >
      <div
        className="qbox surface-raised sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={panelRef}
      >
        <h3 id={titleId}>{req.title}</h3>
        {req.body ? <p className="confirm-body">{req.body}</p> : null}
        <div className="a-form-actions">
          <button className="btn btn-quiet" onClick={() => done(false)}>
            取消
          </button>
          <button
            ref={confirmRef}
            className={req.danger ? "btn btn-danger" : "btn btn-accent"}
            onClick={() => done(true)}
          >
            {req.confirmLabel ?? "确定"}
          </button>
        </div>
      </div>
    </div>
  );
}