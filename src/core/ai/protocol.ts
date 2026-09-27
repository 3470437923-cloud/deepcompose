/**
 * 双协议（OpenAI 兼容 / Anthropic 兼容）的请求构造与 SSE 解析。
 *
 * 依据 CONTRACT §8.1（逐字）：
 *   OpenAI 格式：   /v1/chat/completions
 *   Anthropic 格式：/v1/messages 或 /messages（无 v1）
 *   鉴权：          authorization: Bearer <key>   |   x-api-key: <key>
 *   Anthropic 版本头：anthropic-version: 2023-06-01
 *   协议开关：      use_anthropic_format
 * 参数默认值（CONTRACT §6.7）：max_tokens 默认 32K（仅 Anthropic 格式）。
 */

export type Role = "system" | "user" | "assistant";

export interface ToolCall {
  /** 上游返回的调用 id（回填 tool 结果时必须原样带回） */
  callId: string;
  name: string;
  /** 原始 JSON 字符串（与真机会话落盘格式一致） */
  arguments: string;
  /** 工具执行结果（同样为 JSON 字符串）；未执行时为 undefined */
  result?: string;
}

export interface ChatMessage {
  id: string;
  role: Role;
  text: string;
  thinking?: string;
  toolCalls?: ToolCall[];
  createdAt: string;
}

export interface ToolSchema {
  name: string;
  description: string;
  /** JSON Schema（object 根） */
  parameters: Record<string, unknown>;
}

export interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  useAnthropicFormat: boolean;
  /** 仅 Anthropic 格式使用；默认 32768 */
  maxTokens?: number;
  reservedOutputTokens?: number;
}

export interface HttpRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

const ANTHROPIC_VERSION = "2023-06-01";
export const DEFAULT_MAX_TOKENS = 32768;

function trimSlash(u: string): string {
  return u.replace(/\/+$/, "");
}

/** OpenAI 兼容端点：<base>/v1/chat/completions */
export function openAiUrl(baseUrl: string): string {
  const base = trimSlash(baseUrl);
  if (/\/v1$/.test(base)) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

/** Anthropic 兼容端点：<base>/v1/messages，或 base 已含 /v1 时 <base>/messages */
export function anthropicUrl(baseUrl: string): string {
  const base = trimSlash(baseUrl);
  if (/\/v1$/.test(base)) return `${base}/messages`;
  return `${base}/v1/messages`;
}

export function buildRequest(
  cfg: ProviderConfig,
  messages: ChatMessage[],
  tools: ToolSchema[],
  systemPrompt: string,
): HttpRequest {
  if (cfg.useAnthropicFormat) return buildAnthropic(cfg, messages, tools, systemPrompt);
  return buildOpenAi(cfg, messages, tools, systemPrompt);
}

function buildOpenAi(
  cfg: ProviderConfig,
  messages: ChatMessage[],
  tools: ToolSchema[],
  systemPrompt: string,
): HttpRequest {
  const msgs: Record<string, unknown>[] = [];
  if (systemPrompt.trim() !== "") msgs.push({ role: "system", content: systemPrompt });

  for (const m of messages) {
    if (m.role === "assistant") {
      const toolCalls = m.toolCalls ?? [];
      const entry: Record<string, unknown> = { role: "assistant", content: m.text || null };
      if (toolCalls.length > 0) {
        entry.tool_calls = toolCalls.map((t) => ({
          id: t.callId,
          type: "function",
          function: { name: t.name, arguments: t.arguments },
        }));
      }
      msgs.push(entry);
      for (const t of toolCalls) {
        msgs.push({ role: "tool", tool_call_id: t.callId, content: t.result ?? "" });
      }
      continue;
    }
    msgs.push({ role: m.role, content: m.text });
  }

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: msgs,
    temperature: cfg.temperature,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (tools.length > 0) {
    body.tools = tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }

  return {
    url: openAiUrl(cfg.baseUrl),
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.apiKey}`,
    },
    body,
  };
}

function buildAnthropic(
  cfg: ProviderConfig,
  messages: ChatMessage[],
  tools: ToolSchema[],
  systemPrompt: string,
): HttpRequest {
  const msgs: Record<string, unknown>[] = [];
  for (const m of messages) {
    if (m.role === "system") continue; // system 走顶层 system 字段
    if (m.role === "assistant") {
      const blocks: Record<string, unknown>[] = [];
      if (m.text) blocks.push({ type: "text", text: m.text });
      for (const t of m.toolCalls ?? []) {
        blocks.push({
          type: "tool_use",
          id: t.callId,
          name: t.name,
          input: safeParse(t.arguments),
        });
      }
      if (blocks.length === 0) blocks.push({ type: "text", text: "" });
      msgs.push({ role: "assistant", content: blocks });

      const results = (m.toolCalls ?? []).map((t) => ({
        type: "tool_result",
        tool_use_id: t.callId,
        content: t.result ?? "",
      }));
      if (results.length > 0) msgs.push({ role: "user", content: results });
      continue;
    }
    msgs.push({ role: "user", content: [{ type: "text", text: m.text }] });
  }

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: msgs,
    temperature: cfg.temperature,
    stream: true,
    max_tokens: cfg.maxTokens ?? DEFAULT_MAX_TOKENS,
  };
  if (systemPrompt.trim() !== "") body.system = systemPrompt;
  if (tools.length > 0) {
    body.tools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }

  return {
    url: anthropicUrl(cfg.baseUrl),
    headers: {
      "content-type": "application/json",
      "x-api-key": cfg.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body,
  };
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return {};
  }
}

// ────────────────────────────── SSE 解析 ──────────────────────────────

export type StreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "thinking_delta"; text: string }
  | { type: "tool_call_delta"; index: number; id?: string; name?: string; argsDelta?: string }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "stop"; reason: string };

export interface RawSse {
  event?: string;
  data?: string;
}

/** 解析一行 SSE；非 `event:`/`data:` 行返回 null */
export function parseSseLine(line: string): RawSse | null {
  if (!line) return null;
  if (line.startsWith("event:")) return { event: line.slice(6).trim() };
  if (line.startsWith("data:")) return { data: line.slice(5).trim() };
  return null;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** OpenAI 兼容流式片段 → 内部事件 */
export function mapOpenAiChunk(json: unknown): StreamEvent[] {
  const out: StreamEvent[] = [];
  if (!json || typeof json !== "object") return out;
  const o = json as Record<string, unknown>;

  const usage = o.usage as Record<string, unknown> | undefined;
  if (usage) {
    out.push({
      type: "usage",
      inputTokens: num(usage.prompt_tokens),
      outputTokens: num(usage.completion_tokens),
    });
  }

  const choices = o.choices;
  if (!Array.isArray(choices) || choices.length === 0) return out;
  const c0 = choices[0] as Record<string, unknown>;
  const delta = (c0.delta ?? {}) as Record<string, unknown>;

  const reasoning = delta.reasoning_content ?? delta.reasoning;
  if (typeof reasoning === "string" && reasoning !== "") {
    out.push({ type: "thinking_delta", text: reasoning });
  }
  if (typeof delta.content === "string" && delta.content !== "") {
    out.push({ type: "text_delta", text: delta.content });
  }

  const tcs = delta.tool_calls;
  if (Array.isArray(tcs)) {
    for (const raw of tcs) {
      const t = raw as Record<string, unknown>;
      const fn = (t.function ?? {}) as Record<string, unknown>;
      out.push({
        type: "tool_call_delta",
        index: num(t.index),
        id: typeof t.id === "string" ? t.id : undefined,
        name: typeof fn.name === "string" ? fn.name : undefined,
        argsDelta: typeof fn.arguments === "string" ? fn.arguments : undefined,
      });
    }
  }

  const finish = c0.finish_reason;
  if (typeof finish === "string" && finish !== "") out.push({ type: "stop", reason: finish });
  return out;
}

/** Anthropic 兼容事件 → 内部事件 */
export function mapAnthropicEvent(event: string | undefined, json: unknown): StreamEvent[] {
  const out: StreamEvent[] = [];
  if (!json || typeof json !== "object") return out;
  const o = json as Record<string, unknown>;

  switch (event) {
    case "content_block_start": {
      const block = (o.content_block ?? {}) as Record<string, unknown>;
      if (block.type === "tool_use") {
        out.push({
          type: "tool_call_delta",
          index: num(o.index),
          id: typeof block.id === "string" ? block.id : undefined,
          name: typeof block.name === "string" ? block.name : undefined,
        });
      }
      break;
    }
    case "content_block_delta": {
      const d = (o.delta ?? {}) as Record<string, unknown>;
      if (d.type === "text_delta" && typeof d.text === "string") {
        out.push({ type: "text_delta", text: d.text });
      } else if (d.type === "thinking_delta" && typeof d.thinking === "string") {
        out.push({ type: "thinking_delta", text: d.thinking });
      } else if (d.type === "input_json_delta" && typeof d.partial_json === "string") {
        out.push({ type: "tool_call_delta", index: num(o.index), argsDelta: d.partial_json });
      }
      break;
    }
    case "message_start": {
      const msg = (o.message ?? {}) as Record<string, unknown>;
      const usage = (msg.usage ?? {}) as Record<string, unknown>;
      out.push({ type: "usage", inputTokens: num(usage.input_tokens), outputTokens: num(usage.output_tokens) });
      break;
    }
    case "message_delta": {
      const usage = (o.usage ?? {}) as Record<string, unknown>;
      if (usage.output_tokens !== undefined) {
        out.push({ type: "usage", inputTokens: 0, outputTokens: num(usage.output_tokens) });
      }
      const d = (o.delta ?? {}) as Record<string, unknown>;
      if (typeof d.stop_reason === "string" && d.stop_reason !== "") {
        out.push({ type: "stop", reason: d.stop_reason });
      }
      break;
    }
    default:
      break;
  }
  return out;
}

/** 流式状态机：喂 SSE 行，吐内部事件（协议由 cfg 决定） */
export class StreamParser {
  private buffer: RawSse = {};
  private raw = "";

  constructor(private useAnthropic: boolean) {}

  feed(line: string): StreamEvent[] {
    this.raw += line;
    const parsed = parseSseLine(line);
    if (parsed === null) return [];
    if (parsed.event !== undefined) this.buffer.event = parsed.event;
    if (parsed.data === undefined) return [];
    const data = parsed.data;
    if (data === "[DONE]") return [{ type: "stop", reason: "done" }];

    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      return [];
    }

    if (!this.useAnthropic) {
      const evts = mapOpenAiChunk(json);
      // OpenAI 的单条消息可能同时携带 stop；保持原样返回
      if (evts.some((e) => e.type === "stop")) this.buffer = {};
      return evts;
    }

    const evtName = this.buffer.event;
    this.buffer = {};
    if (evtName === "message_stop") return [{ type: "stop", reason: "end_turn" }];
    return mapAnthropicEvent(evtName, json);
  }

  /** 原始流（排错用） */
  rawText(): string {
    return this.raw;
  }
}
