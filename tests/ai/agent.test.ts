/**
 * 工具调度循环：验证事件序列、工具真正落盘、结果回填、错误分类。
 */
import { promises as fsp } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNodeFs } from "../support/nodeFs";
import { runAgent, type AgentEvent, type RunOptions, type StreamTransport } from "../../src/core/ai/agent";
import type { HttpRequest, ProviderConfig } from "../../src/core/ai/protocol";
import { AI_ERRORS } from "../../src/core/ai/errors";
import { IMPLEMENTED_TOOLS } from "../../src/core/tools/spec";

const cfg: ProviderConfig = {
  baseUrl: "https://example.cn",
  apiKey: "K",
  model: "m",
  temperature: 0.8,
  useAnthropicFormat: false,
};

let root: string;
let snapshotsDir: string;
const fs = createNodeFs();

/** 可编程传输层：按调用次序吐出预设的 SSE 行 */
function fakeTransport(scripts: string[][]): { transport: StreamTransport; requests: HttpRequest[] } {
  const requests: HttpRequest[] = [];
  let i = 0;
  const transport: StreamTransport = {
    async stream(req, handlers) {
      requests.push(req);
      const lines = scripts[Math.min(i, scripts.length - 1)];
      i++;
      for (const l of lines) handlers.onLine(l);
    },
  };
  return { transport, requests };
}

function toolCallScript(callId: string, name: string, argsJson: string): string[] {
  return [
    `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"${callId}","function":{"name":"${name}"}}]}}]}`,
    `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":${JSON.stringify(argsJson)}}}]}}]}`,
    'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
    "data: [DONE]",
  ];
}

function textScript(text: string): string[] {
  return [
    `data: {"choices":[{"delta":{"content":${JSON.stringify(text)}}}]}`,
    'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
    'data: {"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":20}}',
    "data: [DONE]",
  ];
}

function baseOpts(transport: StreamTransport, onEvent: (e: AgentEvent) => void): RunOptions {
  return {
    cfg,
    systemPrompt: "系统",
    tools: IMPLEMENTED_TOOLS,
    messages: [],
    userText: "看看目录里有什么",
    transport,
    onEvent,
    toolCtx: {
      fs,
      roots: { projectRoot: root, skillsDir: path.join(root, "..", "skills"), booksRoot: path.join(root, "..") },
      booksRoot: path.join(root, ".."),
      snapshotsDir,
      sessionId: "s1",
    },
  };
}

beforeAll(async () => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), "writerd-agent-"));
  root = path.join(base, "书");
  snapshotsDir = path.join(base, "snapshots");
  await fsp.mkdir(path.join(root, "章节内容"), { recursive: true });
  await fsp.mkdir(snapshotsDir, { recursive: true });
  await fsp.writeFile(path.join(root, "章节内容", "第1章.md"), "正文一\n", "utf8");
});

afterAll(async () => {
  await fsp.rm(path.dirname(root), { recursive: true, force: true });
});

describe("一轮工具调用后收尾", () => {
  it("事件序列与工具结果回填正确", async () => {
    const events: AgentEvent[] = [];
    const { transport, requests } = fakeTransport([
      toolCallScript("call_1", "file_read", '{"operation":"list","path":"章节内容"}'),
      textScript("目录里有第1章.md"),
    ]);

    const res = await runAgent(baseOpts(transport, (e) => events.push(e)));
    expect(res.error).toBeUndefined();

    const kinds = events.map((e) => e.type);
    expect(kinds[0]).toBe("run_started");
    expect(kinds).toContain("tool_calls_received");
    expect(kinds).toContain("tool_started");
    expect(kinds).toContain("tool_completed");
    expect(kinds).toContain("text_started");
    expect(kinds[kinds.length - 1]).toBe("run_completed");

    // assistant 消息带 toolCalls 且 result 是真实工具结果
    const assistant = res.added.find((m) => m.role === "assistant" && (m.toolCalls?.length ?? 0) > 0)!;
    const call = assistant.toolCalls![0];
    expect(call.name).toBe("file_read");
    expect(call.callId).toBe("call_1");
    const parsed = JSON.parse(call.result!) as { files: { name: string }[] };
    expect(parsed.files[0].name).toBe("第1章.md");

    // 第二轮请求把工具结果带回去了
    expect(requests).toHaveLength(2);
    const msgs2 = (requests[1].body as Record<string, unknown>).messages as Record<string, unknown>[];
    expect(msgs2.some((m) => m.role === "tool")).toBe(true);

    // 最终文本
    const last = res.added[res.added.length - 1];
    expect(last.text).toBe("目录里有第1章.md");
  });

  it("text_delta 逐字累积，thinking 单独成流", async () => {
    const events: AgentEvent[] = [];
    const { transport } = fakeTransport([
      [
        'data: {"choices":[{"delta":{"reasoning_content":"先想一下"}}]}',
        'data: {"choices":[{"delta":{"content":"甲"}}]}',
        'data: {"choices":[{"delta":{"content":"乙"}}]}',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
        "data: [DONE]",
      ],
    ]);
    const res = await runAgent(baseOpts(transport, (e) => events.push(e)));
    const m = res.added[res.added.length - 1];
    expect(m.text).toBe("甲乙");
    expect(m.thinking).toBe("先想一下");
    expect(events.map((e) => e.type)).toContain("thinking_started");
  });
});

describe("写入类工具真的落盘", () => {
  it("file_write 写入章节并留快照", async () => {
    const events: AgentEvent[] = [];
    const { transport } = fakeTransport([
      toolCallScript("call_w", "file_write", '{"operation":"write","path":"章节内容/第2章.md","content":"第二章正文"}'),
      textScript("已写入第二章"),
    ]);
    const res = await runAgent(baseOpts(transport, (e) => events.push(e)));
    expect(res.error).toBeUndefined();
    expect(await fsp.readFile(path.join(root, "章节内容", "第2章.md"), "utf8")).toBe("第二章正文");
    const snap = await fsp.readFile(path.join(snapshotsDir, "s1.json"), "utf8");
    expect(snap).toContain("章节内容/第2章.md");
    expect(snap).toContain("call_w");
  });
});

describe("错误路径", () => {
  it("HTTP 401 → 逐字 API Key 文案", async () => {
    const events: AgentEvent[] = [];
    const { transport } = fakeTransport([["__HTTP_ERROR__401|{\"error\":\"bad key\"}"]]);
    const res = await runAgent(baseOpts(transport, (e) => events.push(e)));
    expect(res.error).toBe(AI_ERRORS.invalidKey);
    expect(events.some((e) => e.type === "error" && e.message === AI_ERRORS.invalidKey)).toBe(true);
  });

  it("HTTP 429 → 逐字 429 文案", async () => {
    const { transport } = fakeTransport([["__HTTP_ERROR__429|{}"]]);
    const res = await runAgent(baseOpts(transport, () => {}));
    expect(res.error).toBe(AI_ERRORS.rateLimited);
  });

  it("HTTP 400 提到 temperature → 逐字温度文案", async () => {
    const { transport } = fakeTransport([
      ['__HTTP_ERROR__400|{"error":{"message":"temperature is not supported"}}'],
    ]);
    const res = await runAgent(baseOpts(transport, () => {}));
    expect(res.error).toBe(AI_ERRORS.temperatureUnsupported);
  });

  it("流中断 → 归类为网络类文案", async () => {
    const transport: StreamTransport = {
      async stream(_req, handlers) {
        handlers.onError("connection reset by peer");
      },
    };
    const res = await runAgent(baseOpts(transport, () => {}));
    expect(res.error).toBe("connection reset by peer");
  });

  it("工具轮次超上限时停止", async () => {
    const { transport } = fakeTransport([toolCallScript("c", "file_read", '{"operation":"list","path":"."}')]);
    const opts = baseOpts(transport, () => {});
    opts.maxToolRounds = 3;
    const res = await runAgent(opts);
    expect(res.error).toContain("超过工具轮次上限");
  });
});
