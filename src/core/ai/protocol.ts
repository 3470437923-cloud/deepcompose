/**
 * 双协议（OpenAI 兼容 / Anthropic 兼容）的请求构造与 SSE 解析。
 *
 * 端点、鉴权与版本头（逐字）：
 *   OpenAI 格式：   /v1/chat/completions
 *   Anthropic 格式：/v1/messages 或 /messages（无 v1）
 *   鉴权：          authorization: Bearer <key>   |   x-api-key: <key>
 *   Anthropic 版本头：anthropic-version: 2023-06-01
 *   协议开关：      use_anthropic_format
 * 参数默认值：max_tokens 两种协议都发送，默认 32000（DEFAULT_MAX_TOKENS，
 *   可经 ProviderConfig.maxTokens 覆盖；上游拒绝时由 errors.ts 给出 max_tokens 文案）。
 */

/** 会话消息角色（既有落盘格式：system 只出现在请求构造里，会话文件仅存 user/assistant） */
export type Role = "system" | "user" | "assistant";

/** 一次工具调用（既有会话落盘格式：arguments/result 都是 JSON 字符串原文） */
export interface ToolCall {
  /** 上游返回的调用 id（回填 tool 结果时必须原样带回） */
  callId: string;
  name: string;
  /** 原始 JSON 字符串（与既有会话落盘格式一致） */
  arguments: string;
  /** 工具执行结果（同样为 JSON 字符串）；未执行时为 undefined */
  result?: string;
}

/** 会话消息（落盘形态，字段名与既有会话文件一致，不得改） */
export interface ChatMessage {
  id: string;
  role: Role;
  text: string;
  /** 思考流文本（reasoning/thinking 增量拼接；无则为 undefined，不写空串） */
  thinking?: string;
  toolCalls?: ToolCall[];
  /** isoMicros 格式（本地时间微秒，见 core/ids.ts） */
  createdAt: string;
}

/** 注册给模型的工具 schema（两种协议共用同一份中间形态） */
export interface ToolSchema {
  name: string;
  description: string;
  /** JSON Schema（object 根） */
  parameters: Record<string, unknown>;
}

/** 一次对话请求所需的供应商配置（由 controller.providerOf 从 Prefs 装配） */
export interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  useAnthropicFormat: boolean;
  /** 单次回复 max_tokens（两种协议都发送）；缺省用 DEFAULT_MAX_TOKENS（32000） */
  maxTokens?: number;
  reservedOutputTokens?: number;
}

/** 传输层中立的请求描述（transport.ts 负责实际发出） */
export interface HttpRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** Anthropic 版本头取值（逐字，上游契约） */
const ANTHROPIC_VERSION = "2023-06-01";
/** max_tokens 缺省值（既有默认 32K；测试锁定 32000） */
export const DEFAULT_MAX_TOKENS = 32000;

/** 去掉 baseUrl 末尾的连续 '/'，避免拼出 //v1 */
function trimSlash(u: string): string {
  return u.replace(/\/+$/, "");
}

/** OpenAI 兼容端点：<base>/v1/chat/completions */
export function openAiUrl(baseUrl: string): string {
  const base = trimSlash(baseUrl);
  // base 已带 /v1 时不再重复（用户两种填写习惯都兼容）
  if (/\/v1$/.test(base)) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

/** Anthropic 兼容端点：<base>/v1/messages，或 base 已含 /v1 时 <base>/messages */
export function anthropicUrl(baseUrl: string): string {
  const base = trimSlash(baseUrl);
  if (/\/v1$/.test(base)) return `${base}/messages`;
  return `${base}/v1/messages`;
}

/**
 * 按 cfg.useAnthropicFormat 分派到对应协议的请求构造。
 * 契约：返回的 body 一律 stream: true；tools 为空时不带 tools 键
 * （冷读隔离依赖这一点：零工具请求体里物理上没有 tools）。
 */
export function buildRequest(
  cfg: ProviderConfig,
  messages: ChatMessage[],
  tools: ToolSchema[],
  systemPrompt: string,
): HttpRequest {
  if (cfg.useAnthropicFormat) return buildAnthropic(cfg, messages, tools, systemPrompt);
  return buildOpenAi(cfg, messages, tools, systemPrompt);
}

/**
 * OpenAI 兼容形态：system 作为首条消息；assistant.toolCalls 展开为
 * tool_calls 数组 + 每个调用一条 role:"tool" 结果消息（顺序紧随 assistant）。
 */
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
      // 纯工具调用回合 text 为空：OpenAI 规范要求 content 为 null 而非空串
      const entry: Record<string, unknown> = { role: "assistant", content: m.text || null };
      if (toolCalls.length > 0) {
        entry.tool_calls = toolCalls.map((t) => ({
          id: t.callId,
          type: "function",
          function: { name: t.name, arguments: t.arguments },
        }));
      }
      msgs.push(entry);
      // 每个 tool_call 必须有一条对应 id 的 tool 消息，否则严格上游会 400；
      // 未执行的调用（result undefined）以空串占位
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
    // 让上游在流末尾附带 usage 统计块（choices 为空、含 prompt/completion tokens）
    stream_options: { include_usage: true },
    max_tokens: cfg.maxTokens ?? DEFAULT_MAX_TOKENS,
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

/**
 * Anthropic 兼容形态：system 走顶层 system 字段；assistant.toolCalls 转
 * tool_use 块，工具结果转紧随其后的 user 消息（tool_result 块）。
 */
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
          // tool_use.input 是对象而非字符串；历史里存的 arguments 是 JSON 串，
          // 解析失败时以空对象兜底（不让整次请求构造抛异常）
          input: safeParse(t.arguments),
        });
      }
      // Anthropic 不接受空 content 数组：无文本无调用时补一个空 text 块
      if (blocks.length === 0) blocks.push({ type: "text", text: "" });
      msgs.push({ role: "assistant", content: blocks });

      // 工具结果必须放在下一条 user 消息里，与 tool_use 一一配对
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

/** JSON.parse 安全版：失败回退空对象（用于历史工具参数回放） */
function safeParse(s: string): unknown {
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return {};
  }
}

// ────────────────────────────── SSE 解析 ──────────────────────────────

/**
 * 协议中立的流式内部事件（两种协议的 SSE 都归一化成这一组）：
 *  - text_delta / thinking_delta：正文与思考流增量；
 *  - tool_call_delta：工具调用分片（按 index 归并；id/name 首片携带，args 逐片拼接）；
 *  - usage：token 用量统计（OpenAI 在流末尾一次性给出；Anthropic 分 message_start/message_delta 两次）；
 *  - stop：收尾信号（reason 为上游 finish_reason / stop_reason / "done"）。
 */
export type StreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "thinking_delta"; text: string }
  | { type: "tool_call_delta"; index: number; id?: string; name?: string; argsDelta?: string }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "stop"; reason: string };

/** 一行 SSE 的解析产物：event: 行给出事件名，data: 行给出负载（二者都只出现一个） */
export interface RawSse {
  event?: string;
  data?: string;
}

/** 解析一行 SSE；非 `event:`/`data:` 行返回 null（心跳注释行、空行、retry: 等一律忽略） */
export function parseSseLine(line: string): RawSse | null {
  if (!line) return null;
  if (line.startsWith("event:")) return { event: line.slice(6).trim() };
  if (line.startsWith("data:")) return { data: line.slice(5).trim() };
  return null;
}

/** 数值安全提取：非有限数字（缺失/null/NaN）一律按 0 计 */
function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** 提取 data JSON 里的 type 字段（Anthropic 规范中与 event: 行同义，用作中继丢行时的回退） */
function jsonTypeName(json: unknown): string | undefined {
  if (json && typeof json === "object") {
    const t = (json as Record<string, unknown>).type;
    if (typeof t === "string" && t !== "") return t;
  }
  return undefined;
}

/**
 * OpenAI 兼容流式片段 → 内部事件。
 * 兼容点：思考流字段 reasoning_content（DeepSeek 系）与 reasoning 都认；
 * usage 块（stream_options.include_usage 的末尾统计）choices 为空也要放行。
 */
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
  // 只消费第一个 choice（本产品单生成并发，n>1 无意义）
  const c0 = choices[0] as Record<string, unknown>;
  const delta = (c0.delta ?? {}) as Record<string, unknown>;

  const reasoning = delta.reasoning_content ?? delta.reasoning;
  if (typeof reasoning === "string" && reasoning !== "") {
    out.push({ type: "thinking_delta", text: reasoning });
  }
  if (typeof delta.content === "string" && delta.content !== "") {
    out.push({ type: "text_delta", text: delta.content });
  }

  // 工具调用是增量协议：首片带 index+id+name，后续片只带 index+arguments 片段
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

  // finish_reason 出现在最后一个 choice 分片（stop/tool_calls/length 等）
  const finish = c0.finish_reason;
  if (typeof finish === "string" && finish !== "") out.push({ type: "stop", reason: finish });
  return out;
}

/**
 * Anthropic 兼容事件 → 内部事件。
 * 覆盖：content_block_start（tool_use 块头，携带 id/name）、content_block_delta
 * （text/thinking/input_json 三种增量）、message_start（输入 usage）、
 * message_delta（累计输出 usage + stop_reason）。其余事件（ping 等）忽略。
 */
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
        // 工具入参 JSON 的裸片段：按 index 归并后再整体 parse
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
      // message_delta 的 output_tokens 是全消息累计值（非增量）
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

/**
 * 流式状态机：喂 SSE 行，吐内部事件（协议由构造参数决定）。
 *
 * 契约与边界：
 *  - 逐行喂入（Rust 侧按 '\n' 切好，UTF-8 完整字符由 Rust 缓冲保证）；
 *  - `data: [DONE]`（OpenAI 习惯）→ stop/done；Anthropic 的 message_stop → stop/end_turn；
 *  - 每条 data 行按「单行完整 JSON」解析（两大协议实际都这么发）；解析失败静默跳过该行；
 *  - Anthropic 的 event: 行与 data 行配对缓存在 buffer 里；部分中继只发 data 不发
 *    event: 行，此时回退用 data JSON 的 type 字段（规范中二者同义），避免整流静默丢事件；
 *  - 真正的流结束以传输层的 done 信号为准（agent 不依赖 stop 事件收尾）。
 */
export class StreamParser {
  /** 暂存最近一条 event: 行（Anthropic 事件名与随后的 data 行配对） */
  private buffer: RawSse = {};
  /** 原始行累积（仅排错用；随解析器同生命周期，回合结束即释放） */
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
      // 半截 JSON / 非 JSON 负载：跳过（上游偶发脏行不应中断整流）
      return [];
    }

    if (!this.useAnthropic) {
      const evts = mapOpenAiChunk(json);
      // OpenAI 的单条消息可能同时携带 stop；保持原样返回
      if (evts.some((e) => e.type === "stop")) this.buffer = {};
      return evts;
    }

    // Anthropic：优先用 event: 行；中继丢行时回退 data JSON 的 type 字段
    const evtName = this.buffer.event ?? jsonTypeName(json);
    this.buffer = {};
    if (evtName === "message_stop") return [{ type: "stop", reason: "end_turn" }];
    return mapAnthropicEvent(evtName, json);
  }

  /** 原始流（排错用） */
  rawText(): string {
    return this.raw;
  }
}
