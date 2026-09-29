/**
 * 双协议请求构造与 SSE 解析（实测样本实证）。
 *
 * 锁定的契约：
 *  - 端点拼接（/v1 后缀两种习惯都兼容）与鉴权头（Bearer vs x-api-key + 版本头）；
 *  - OpenAI 形态：system 首条消息、tool_calls 展开 + tool 结果消息、stream_options；
 *  - Anthropic 形态：system 顶层字段、tool_use/tool_result 块、max_tokens 默认 32000；
 *  - SSE：event:/data: 行解析、[DONE]、工具调用分片按 index 归并、
 *    Anthropic event 行缺失时回退 data JSON 的 type 字段。
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
    // 中转站常见的子路径形态（/anthropic）同样只在末尾补一次 /v1
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
    // 历史回放契约：每个 tool_call 必须紧跟一条同 id 的 role:"tool" 结果消息
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
    // system 不再出现在 messages 里（顶层字段唯一）
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
    // Anthropic 历史回放契约：tool_use 块在 assistant 消息里，
    // 结果作为紧随其后的 user 消息（tool_result 块），id 一一配对
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
    // 心跳注释行与空行（事件边界）都被忽略
    expect(parseSseLine(": heartbeat")).toBeNull();
    expect(parseSseLine("")).toBeNull();
  });

  it("OpenAI：文本增量 / 思考增量 / 工具调用分片 / usage", () => {
    expect(mapOpenAiChunk({ choices: [{ delta: { content: "你好" } }] })).toEqual([
      { type: "text_delta", text: "你好" },
    ]);
    // reasoning_content（DeepSeek 系字段）→ thinking_delta
    expect(mapOpenAiChunk({ choices: [{ delta: { reasoning_content: "想…" } }] })).toEqual([
      { type: "thinking_delta", text: "想…" },
    ]);
    expect(
      mapOpenAiChunk({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "file_read", arguments: '{"op' } }] } }] }),
    ).toEqual([{ type: "tool_call_delta", index: 0, id: "c1", name: "file_read", argsDelta: '{"op' }]);
    // usage 统计块（choices 为空）也要放行
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
    // 首片带 id+name、后续片带 args 片段：都按 index 归一成 tool_call_delta
    expect(out).toContainEqual({ type: "tool_call_delta", index: 0, id: "c1", name: "file_read", argsDelta: undefined });
    expect(out).toContainEqual({ type: "tool_call_delta", index: 0, id: undefined, name: undefined, argsDelta: '{"path":"."}' });
    expect(out[out.length - 1]).toEqual({ type: "stop", reason: "done" });
  });

  it("Anthropic：event 行 + data 行配对，message_stop 收尾", () => {
    const p = new StreamParser(true);
    // event: 行只进缓存不出事件；随后的 data 行配对消费
    expect(p.feed("event: content_block_delta")).toEqual([]);
    expect(p.feed('data: {"delta":{"type":"text_delta","text":"丙"}}')).toEqual([
      { type: "text_delta", text: "丙" },
    ]);
    expect(p.feed("event: message_stop")).toEqual([]);
    expect(p.feed("data: {}")).toEqual([{ type: "stop", reason: "end_turn" }]);
  });

  it("Anthropic：event 行缺失时回退 data JSON 的 type 字段（中继丢行兜底）", () => {
    // 非标准中继可能只转发 data 行；type 字段与 event 名同义（Anthropic 规范），
    // 缺了 event 行也不能整流静默丢事件
    const p = new StreamParser(true);
    expect(p.feed('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"丁"}}')).toEqual([
      { type: "text_delta", text: "丁" },
    ]);
    expect(p.feed('data: {"type":"message_stop"}')).toEqual([{ type: "stop", reason: "end_turn" }]);
  });
});
