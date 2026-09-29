/**
 * 模态焦点管理（Dialogs.tsx 与 MemoModal.tsx 共用）。
 *
 * 只做三件事，但这三件都是键盘用户真正会撞到的问题：
 *   1. 打开时把焦点移进面板（否则它还在触发按钮上，从此 Tab 一路
 *      走进遮罩背后的主界面 —— 视觉上"弹了个框"，键盘上什么也没变）；
 *   2. Tab / Shift+Tab 在面板内循环（模态之外的东西不该被 Tab 到）；
 *   3. 关闭时把焦点还给打开前的那个元素（不还的话焦点掉回文档开头，
 *      连续操作的人每次都得重新摸一遍）。
 *
 * 用 rAF 而不是直接 focus()：面板此时还没挂载进 DOM。
 */

import { useEffect } from "react";
import type { RefObject } from "react";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialogFocus(
  active: boolean,
  panelRef: RefObject<HTMLElement | null>,
  initialRef?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!active) return;
    const prev = document.activeElement as HTMLElement | null;

    const raf = requestAnimationFrame(() => {
      const target = initialRef?.current ?? panelRef.current;
      target?.focus();
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const cur = document.activeElement as HTMLElement | null;
      const inside = cur ? panel.contains(cur) : false;
      if (e.shiftKey && (!inside || cur === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || cur === last)) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      // 面板已经卸载，焦点会掉到 body —— 主动还回去
      prev?.focus?.();
    };
  }, [active, panelRef, initialRef]);
}