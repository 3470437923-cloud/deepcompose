/**
 * 工具调度循环：验证事件序列、工具真正落盘、结果回填、错误分类、中止传播。
 *
 * 传输层用可编程替身（fakeTransport）注入固定 SSE 行，
 * 文件系统用 node 实现（tests/support/nodeFs.ts），全程不碰 Tauri。
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
      // 脚本用尽后重复最后一组（工具循环多轮时持续供给同一响应）
      const lines = scripts[Math.min(i, scripts.length - 1)];
      i++;
      for (const l of lines) handlers.onLine(l);
    },
  };
  return { transport, requests };
}

/** 一轮「模型请求单个工具调用」的 OpenAI 形态 SSE 脚本 */
function toolCallScript(callId: string, name: string, argsJson: string): string[] {
  return [
    `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"${callId}","function":{"name":"${name}"}}]}}]}`,
    `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":${JSON.stringify(argsJson)}}}]}}]}`,
    'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
    "data: [DONE]",
  ];
}

/** 一轮「模型纯文本收尾」的 SSE 脚本（含 usage 统计块） */
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
  // 临时目录前缀属产品命名语境：keepcompose-
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), "keepcompose-agent-"));
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

    // 事件序列骨架：run_started 开头、run_completed 收尾，中间含工具三事件与正文开始
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
    // 正文与思考流分开累积：text 拼 delta，thinking 拼 reasoning_content
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
    // 真实写盘 + 写前快照（快照按 sessionId 落 s1.json，含相对路径与 callId）
    expect(await fsp.readFile(path.join(root, "章节内容", "第2章.md"), "utf8")).toBe("第二章正文");
    const snap = await fsp.readFile(path.join(snapshotsDir, "s1.json"), "utf8");
    expect(snap).toContain("章节内容/第2章.md");
    expect(snap).toContain("call_w");
  });
});

describe("错误路径", () => {
  it("HTTP 401 → 逐字 API Key 文案", async () => {
    const events: AgentEvent[] = [];
    // Rust 侧 http_error 折成哨兵行：__HTTP_ERROR__<status>|<body>
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
    // 归不了类的网络消息保留原文（errors.ts 的兜底语义）
    expect(res.error).toBe("connection reset by peer");
  });

  it("传输层自身抛异常 → 折算为错误结果，用户消息不丢", async () => {
    // runAgent 的全函数契约：不 reject；异常折算进 RunResult.error，added 仍含用户消息
    const transport: StreamTransport = {
      async stream() {
        throw new Error("ipc broken");
      },
    };
    const res = await runAgent(baseOpts(transport, () => {}));
    expect(res.error).toBe("ipc broken");
    expect(res.added.some((m) => m.role === "user" && m.text === "看看目录里有什么")).toBe(true);
  });

  it("工具轮次超上限时停止", async () => {
    // 脚本只有一组且用尽后重复：模型每轮都请求工具，循环必然打满上限
    const { transport } = fakeTransport([toolCallScript("c", "file_read", '{"operation":"list","path":"."}')]);
    const opts = baseOpts(transport, () => {});
    opts.maxToolRounds = 3;
    const res = await runAgent(opts);
    expect(res.error).toContain("超过工具轮次上限");
  });
});

describe("中止传播（「停止生成」语义）", () => {
  it("流被截断后：不执行工具、保留部分正文、未执行调用回填中止说明", async () => {
    const events: AgentEvent[] = [];
    const signal = { aborted: false };
    // 传输替身：吐半截正文 + 一个 file_write 调用后置位 aborted，
    // 模拟用户点「停止」→ Rust 截断上游 → 照常发 done 收尾
    const transport: StreamTransport = {
      async stream(_req, handlers) {
        handlers.onLine('data: {"choices":[{"delta":{"content":"写了一半"}}]}');
        handlers.onLine(
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c_abort","function":{"name":"file_write","arguments":"{\\"operation\\":\\"write\\",\\"path\\":\\"章节内容/第9章.md\\",\\"content\\":\\"不该出现\\"}"}}]}}]}',
        );
        signal.aborted = true;
      },
    };
    const opts = baseOpts(transport, (e) => events.push(e));
    opts.signal = signal;

    const res = await runAgent(opts);
    expect(res.error).toBe("已中止");

    // 部分正文保留入库（「停止」截断流，不丢已收内容）
    const assistant = res.added[res.added.length - 1];
    expect(assistant.role).toBe("assistant");
    expect(assistant.text).toBe("写了一半");

    // 写入类工具的副作用没有发生：第9章.md 未落盘
    await expect(fsp.readFile(path.join(root, "章节内容", "第9章.md"), "utf8")).rejects.toThrow();

    // 未执行的调用回填了中止说明（会话里每条 toolCalls 都有 result，下轮请求可配对）
    expect(assistant.toolCalls![0].result).toContain("已中止");

    // 从未进入工具执行（无 tool_started），错误事件已发
    expect(events.some((e) => e.type === "tool_started")).toBe(false);
    expect(events.some((e) => e.type === "error" && e.message === "已中止")).toBe(true);
  });

  it("工具执行期间中止：同轮剩余调用不再执行", async () => {
    const events: AgentEvent[] = [];
    const signal = { aborted: false };
    // 一轮里请求两个工具调用（index 0 / 1）
    const { transport } = fakeTransport([
      [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"file_read","arguments":"{\\"operation\\":\\"list\\",\\"path\\":\\".\\"}"}}]}}]}',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"c2","function":{"name":"file_read","arguments":"{\\"operation\\":\\"list\\",\\"path\\":\\"章节内容\\"}"}}]}}]}',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
        "data: [DONE]",
      ],
    ]);
    const opts = baseOpts(transport, (e) => {
      events.push(e);
      // 模拟：第一个工具执行完（例如 question 弹窗刚被回答）时用户点了「停止」
      if (e.type === "tool_completed" && e.call.callId === "c1") signal.aborted = true;
    });
    opts.signal = signal;

    const res = await runAgent(opts);
    expect(res.error).toBe("已中止");

    const assistant = res.added[res.added.length - 1];
    const calls = assistant.toolCalls!;
    expect(calls).toHaveLength(2);
    // 第一个调用已真实执行（有目录清单结果）；第二个未执行，回填中止说明
    expect(JSON.parse(calls[0].result!).files).toBeDefined();
    expect(calls[1].result).toContain("已中止");
    // 只执行了一个工具
    expect(events.filter((e) => e.type === "tool_started")).toHaveLength(1);
  });
});
