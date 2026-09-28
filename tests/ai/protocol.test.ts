/**
 * 双协议请求构造与 SSE 解析（实测样本实证）。
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_TOKENS,
  StreamParser,
  anthropicUrl,
  buildRequest,
  mapAnthropicEvent,
  mapOpenAiChunk,
  openAiUrl,
  parseSseLine,
  type ChatMessage,
  type ProviderConfig,
} from "../../src/core/ai/protocol";

const openaiCfg: ProviderConfig = {
  baseUrl: "https://newapi.example.cn",
  apiKey: "K",
  model: "deepseek-v4-pro",
  temperature: 0.8,
  useAnthropicFormat: false,
};

const anthropicCfg: ProviderConfig = {
  ...openaiCfg,
  baseUrl: "https://api.anthropic.com",
  useAnthropicFormat: true,
};

const msgs: ChatMessage[] = [
  { id: "1", role: "user", text: "写第一章", createdAt: "2026-01-01T00:00:00.000000" },
];

describe("端点拼接", () => {
  it("OpenAI：<base>/v1/chat/completions；base 已带 /v1 时不重复", () => {
    expect(openAiUrl("https://newapi.example.cn")).toBe("https://newapi.example.cn/v1/chat/completions");
    expect(openAiUrl("https://newapi.example.cn/")).toBe("https://newapi.example.cn/v1/chat/completions");
    expect(openAiUrl("https://x.cn/v1")).toBe("https://x.cn/v1/chat/completions");
  });

  it("Anthropic：/v1/messages，或 base 已含 /v1 时 /messages", () => {
    expect(anthropicUrl("https://api.anthropic.com")).toBe("https://api.anthropic.com/v1/messages");
    expect(anthropicUrl("https://api.deepseek.com/anthropic")).toBe(
      "https://api.deepseek.com/anthropic/v1/messages",
    );
    expect(anthropicUrl("https://api.deepseek.com/anthropic/v1")).toBe(
      "https://api.deepseek.com/anthropic/v1/messages",
    );
  });
});

describe("OpenAI 请求体", () => {
  const req = buildRequest(openaiCfg, msgs, [], "系统提示");

  it("鉴权用 authorization: Bearer", () => {
    expect(req.headers.authorization).toBe("Bearer K");
    expect(req.headers["content-type"]).toBe("application/json");
  });

  it("system 提示作为首条消息；包含 temperature / stream / usage 选项", () => {
    const b = req.body as Record<string, unknown>;
    expect(b.model).toBe("deepseek-v4-pro");
    expect(b.temperature).toBe(0.8);
    expect(b.stream).toBe(true);
    expect(b.stream_options).toEqual({ include_usage: true });
    const list = b.messages as Record<string, unknown>[];
    expect(list[0]).toEqual({ role: "system", content: "系统提示" });
    expect(list[1]).toEqual({ role: "user", content: "写第一章" });
  });

  it("工具转成 function 形态", () => {
    const r2 = buildRequest(
      openaiCfg,
      msgs,
      [{ name: "file_read", description: "d", parameters: { type: "object", properties: {} } }],
      "",
    );
    const tools = (r2.body as Record<string, unknown>).tools as Record<string, unknown>[];
    expect(tools[0].type).toBe("function");
    expect((tools[0].function as Record<string, unknown>).name).toBe("file_read");
  });

  it("assistant 的 toolCalls 展开为 tool_calls + 后续 tool 消息", () => {
    const withTools: ChatMessage[] = [
      {
        id: "a",
        role: "assistant",
        text: "",
        createdAt: "t",
        toolCalls: [{ callId: "call_1", name: "file_read", arguments: '{"operation":"list"}', result: '{"ok":1}' }],
      },
    ];
    const r = buildRequest(openaiCfg, withTools, [], "");
    const list = (r.body as Record<string, unknown>).messages as Record<string, unknown>[];
    expect(list[0].role).toBe("assistant");
    expect((list[0].tool_calls as Record<string, unknown>[])[0]).toMatchObject({
      id: "call_1",
      type: "function",
    });
    expect(list[1]).toEqual({ role: "tool", tool_call_id: "call_1", content: '{"ok":1}' });
  });
});

describe("Anthropic 请求体", () => {
  const req = buildRequest(anthropicCfg, msgs, [], "系统提示");

  it("鉴权用 x-api-key + anthropic-version", () => {
    expect(req.headers["x-api-key"]).toBe("K");
    expect(req.headers["anthropic-version"]).toBe("2023-06-01");
    expect(req.headers.authorization).toBeUndefined();
  });

  it("system 走顶层字段；max_tokens 默认 32K（32000）", () => {
    const b = req.body as Record<string, unknown>;
    expect(b.system).toBe("系统提示");
    expect(b.max_tokens).toBe(DEFAULT_MAX_TOKENS);
    expect(b.max_tokens).toBe(32000);
    const list = b.messages as Record<string, unknown>[];
    expect(list.some((m) => m.role === "system")).toBe(false);
  });

  it("工具转成 input_schema 形态", () => {
    const r2 = buildRequest(
      anthropicCfg,
      msgs,
      [{ name: "file_write", description: "d", parameters: { type: "object", properties: {} } }],
      "",
    );
    const tools = (r2.body as Record<string, unknown>).tools as Record<string, unknown>[];
    expect(tools[0].name).toBe("file_write");
    expect(tools[0].input_schema).toBeDefined();
  });

  it("assistant 的 toolCalls 转 tool_use + tool_result(user)", () => {
    const withTools: ChatMessage[] = [
      {
        id: "a",
        role: "assistant",
        text: "先看看目录",
        createdAt: "t",
        toolCalls: [{ callId: "toolu_1", name: "file_read", arguments: '{"path":"."}', result: '{"files":[]}' }],
      },
    ];
    const r = buildRequest(anthropicCfg, withTools, [], "");
    const list = (r.body as Record<string, unknown>).messages as Record<string, unknown>[];
    const first = list[0].content as Record<string, unknown>[];
    expect(first[0]).toEqual({ type: "text", text: "先看看目录" });
    expect(first[1]).toMatchObject({ type: "tool_use", id: "toolu_1", name: "file_read" });
    const second = list[1].content as Record<string, unknown>[];
    expect(second[0]).toMatchObject({ type: "tool_result", tool_use_id: "toolu_1" });
  });
});

describe("SSE 行解析", () => {
  it("识别 event: 与 data:，忽略其余行", () => {
    expect(parseSseLine("event: content_block_delta")).toEqual({ event: "content_block_delta" });
    expect(parseSseLine("data: {\"a\":1}")).toEqual({ data: '{"a":1}' });
    expect(parseSseLine(": heartbeat")).toBeNull();
    expect(parseSseLine("")).toBeNull();
  });

  it("OpenAI：文本增量 / 思考增量 / 工具调用分片 / usage", () => {
    expect(mapOpenAiChunk({ choices: [{ delta: { content: "你好" } }] })).toEqual([
      { type: "text_delta", text: "你好" },
    ]);
    expect(mapOpenAiChunk({ choices: [{ delta: { reasoning_content: "想…" } }] })).toEqual([
      { type: "thinking_delta", text: "想…" },
    ]);
    expect(
      mapOpenAiChunk({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "file_read", arguments: '{"op' } }] } }] }),
    ).toEqual([{ type: "tool_call_delta", index: 0, id: "c1", name: "file_read", argsDelta: '{"op' }]);
    expect(mapOpenAiChunk({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 7 } })).toEqual([
      { type: "usage", inputTokens: 12, outputTokens: 7 },
    ]);
  });

  it("Anthropic：content_block_delta 的 text/thinking/input_json", () => {
    expect(
      mapAnthropicEvent("content_block_delta", { delta: { type: "text_delta", text: "甲" } }),
    ).toEqual([{ type: "text_delta", text: "甲" }]);
    expect(
      mapAnthropicEvent("content_block_delta", { delta: { type: "thinking_delta", thinking: "乙" } }),
    ).toEqual([{ type: "thinking_delta", text: "乙" }]);
    expect(
      mapAnthropicEvent("content_block_delta", { index: 2, delta: { type: "input_json_delta", partial_json: "{" } }),
    ).toEqual([{ type: "tool_call_delta", index: 2, argsDelta: "{" }]);
  });
});

describe("StreamParser 状态机", () => {
  it("OpenAI：累积工具调用分片并识别 [DONE]", () => {
    const p = new StreamParser(false);
    const out: unknown[] = [];
    out.push(...p.feed('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"file_read"}}]}}]}'));
    out.push(...p.feed('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"path\\":\\".\\"}"}}]}}]}'));
    out.push(...p.feed("data: [DONE]"));
    expect(out).toContainEqual({ type: "tool_call_delta", index: 0, id: "c1", name: "file_read", argsDelta: undefined });
    expect(out).toContainEqual({ type: "tool_call_delta", index: 0, id: undefined, name: undefined, argsDelta: '{"path":"."}' });
    expect(out[out.length - 1]).toEqual({ type: "stop", reason: "done" });
  });

  it("Anthropic：event 行 + data 行配对，message_stop 收尾", () => {
    const p = new StreamParser(true);
    expect(p.feed("event: content_block_delta")).toEqual([]);
    expect(p.feed('data: {"delta":{"type":"text_delta","text":"丙"}}')).toEqual([
      { type: "text_delta", text: "丙" },
    ]);
    expect(p.feed("event: message_stop")).toEqual([]);
    expect(p.feed("data: {}")).toEqual([{ type: "stop", reason: "end_turn" }]);
  });
});
