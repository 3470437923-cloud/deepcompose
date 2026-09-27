#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""本地 mock 供应商：OpenAI 兼容 SSE。

用途：在没有真实 API Key 的情况下端到端验证 writerD 的
「Rust 流式转发 → 协议解析 → 工具调度 → 落盘 → 界面渲染」全链路。

行为：第一次请求 → 回一个 file_read 工具调用；带 tool 结果的第二次请求 → 回文本并收尾。
"""
import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8899


def chunk(delta, finish=None):
    return {"choices": [{"index": 0, "delta": delta, "finish_reason": finish}]}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.0"  # 关闭长连接：SSE 结束即断，客户端才不会挂住

    def log_message(self, fmt, *args):  # 静音访问日志
        pass

    def do_POST(self):
        n = int(self.headers.get("content-length", 0))
        raw = self.rfile.read(n)
        try:
            req = json.loads(raw)
        except Exception:
            req = {}
        msgs = req.get("messages", [])
        has_tool_result = any(m.get("role") == "tool" for m in msgs)
        model = req.get("model", "")

        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.send_header("cache-control", "no-cache")
        self.send_header("connection", "close")
        self.end_headers()
        self.close_connection = True

        if not has_tool_result:
            # 第一步：请求工具调用（分片下发，验证拼接）
            parts = [
                chunk({"tool_calls": [{"index": 0, "id": "call_mock_1",
                                       "function": {"name": "file_read", "arguments": ""}}]}),
                chunk({"tool_calls": [{"index": 0, "function": {"arguments": '{"operation":'}}]}),
                chunk({"tool_calls": [{"index": 0, "function": {"arguments": '"list","path":"章节内容"}'}}]}),
                chunk({}, "tool_calls"),
            ]
        else:
            # 第二步：拿到工具结果后给正文
            text = f"已读取目录（model={model}）。接下来可以开始写第一章了。"
            parts = [chunk({"content": text})]
            parts.append(chunk({}, "stop"))
            parts.append({"choices": [], "usage": {"prompt_tokens": 123, "completion_tokens": 45}})

        for p in parts:
            self.wfile.write(("data: " + json.dumps(p, ensure_ascii=False) + "\n\n").encode("utf-8"))
            self.wfile.flush()
        self.wfile.write(b"data: [DONE]\n\n")
        self.wfile.flush()


if __name__ == "__main__":
    srv = HTTPServer(("127.0.0.1", PORT), Handler)
    print(f"mock provider on http://127.0.0.1:{PORT}", flush=True)
    srv.serve_forever()
