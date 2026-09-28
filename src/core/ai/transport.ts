/**
 * 传输层：把 Rust 侧 `ai_stream` 转发的 SSE 行接成 StreamTransport。
 * Rust 只转发原始行；HTTP 错误用 `__HTTP_ERROR__<status>|<body>` 前缀传回，
 * 由 agent 侧统一做逐字错误分类（errors.ts）。
 */

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { HttpRequest } from "./protocol";
import type { StreamTransport } from "./agent";

export const HTTP_ERROR_PREFIX = "__HTTP_ERROR__";

interface AiChunk {
  requestId: string;
  kind: "line" | "http_error" | "stream_error" | "done";
  data: string;
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `req_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

/** 当前活跃流（单生成并发；「停止生成」用） */
let activeRequestId: string | null = null;

/** 中断当前流：Rust 侧截断上游连接，已收到的部分正文保留 */
export function abortActiveStream(): void {
  const id = activeRequestId;
  if (id) void invoke("ai_abort", { requestId: id });
}

export function createTauriTransport(): StreamTransport {
  return {
    async stream(req: HttpRequest, handlers): Promise<void> {
      const requestId = uuid();
      activeRequestId = requestId;
      let finish: () => void = () => {};
      const finished = new Promise<void>((resolve) => {
        finish = resolve;
      });

      const unlisten = await listen<AiChunk>("ai_chunk", (event) => {
        const p = event.payload;
        if (p.requestId !== requestId) return;
        switch (p.kind) {
          case "line":
            handlers.onLine(p.data);
            break;
          case "http_error":
            handlers.onLine(HTTP_ERROR_PREFIX + p.data);
            break;
          case "stream_error":
            handlers.onError(p.data);
            break;
          case "done":
            finish();
            break;
        }
      });

      try {
        await invoke("ai_stream", {
          request: { requestId, url: req.url, headers: req.headers, body: req.body },
        });
        await finished;
      } finally {
        unlisten();
        if (activeRequestId === requestId) activeRequestId = null;
      }
    },
  };
}
