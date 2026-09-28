/**
 * 工具调度循环（agent loop）。
 *
 * 事件名逐字（既有格式，不得改）：
 *   ai_run_started / ai_tool_started / ai_tool_calls_received / ai_tool_completed /
 *   ai_text_started / ai_thinking_started / ai_cleanup_started / ai_cleanup_completed /
 *   ai_run_completed
 *
 * 循环结构（「读结构化设定 → 读最近 N 章 → 生成 → 提炼摘要 → 回写」的机制底座）：
 *   流式回合 → 若模型请求工具 → 逐个执行（写前快照）→ 结果回填 → 再开一回合，
 *   直到模型不再请求工具或达到轮次上限。
 */

import { isoMicros } from "../ids";
import { executeTool, type QuestionItem, type ToolContext } from "../tools/exec";
import { AI_ERRORS, classifyHttpError, classifyStreamError } from "./errors";
import {
  StreamParser,
  buildRequest,
  type ChatMessage,
  type HttpRequest,
  type ProviderConfig,
  type StreamEvent,
  type ToolCall,
  type ToolSchema,
} from "./protocol";

export const EVENT_NAMES = {
  runStarted: "ai_run_started",
  textStarted: "ai_text_started",
  thinkingStarted: "ai_thinking_started",
  toolCallsReceived: "ai_tool_calls_received",
  toolStarted: "ai_tool_started",
  toolCompleted: "ai_tool_completed",
  cleanupStarted: "ai_cleanup_started",
  cleanupCompleted: "ai_cleanup_completed",
  runCompleted: "ai_run_completed",
} as const;

/** 单次运行最多几轮工具调用。既有数值未取到，此为自定值。 */
export const DEFAULT_MAX_TOOL_ROUNDS = 12;

export type AgentEvent =
  | { type: "run_started"; runId: string }
  | { type: "thinking_started" }
  | { type: "thinking_delta"; text: string }
  | { type: "text_started" }
  | { type: "text_delta"; text: string }
  | { type: "tool_calls_received"; calls: ToolCall[] }
  | { type: "tool_started"; call: ToolCall }
  | { type: "tool_completed"; call: ToolCall }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "cleanup_started" }
  | { type: "cleanup_completed" }
  | { type: "run_completed"; message: ChatMessage }
  | { type: "error"; message: string; detail?: string };

/** 传输层抽象：生产走 Tauri 事件，测试注入固定 SSE 行 */
export interface StreamTransport {
  /** 返回 true 表示流正常结束；false 表示已通过 onError 报错 */
  stream(
    req: HttpRequest,
    handlers: { onLine: (line: string) => void; onError: (message: string) => void },
  ): Promise<void>;
}

export interface RunOptions {
  cfg: ProviderConfig;
  systemPrompt: string;
  tools: ToolSchema[];
  /** 已有对话（不含本轮用户消息） */
  messages: ChatMessage[];
  /** 本轮用户消息 */
  userText: string;
  toolCtx: ToolContext;
  transport: StreamTransport;
  maxToolRounds?: number;
  onEvent?: (e: AgentEvent) => void;
  /** 中止信号 */
  signal?: { aborted: boolean };
}

export interface RunResult {
  /** 本轮新增的全部消息（assistant + 工具结果挂在 assistant.toolCalls 上） */
  added: ChatMessage[];
  error?: string;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `m_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

/** 累积中的工具调用（流式片段拼装） */
interface PendingCall {
  index: number;
  callId: string;
  name: string;
  args: string;
}

/** 把流式事件累加成一个 assistant 回合 */
class TurnAccumulator {
  text = "";
  thinking = "";
  calls = new Map<number, PendingCall>();
  inputTokens = 0;
  outputTokens = 0;

  apply(events: StreamEvent[]): StreamEvent[] {
    const passthrough: StreamEvent[] = [];
    for (const e of events) {
      switch (e.type) {
        case "text_delta":
          this.text += e.text;
          passthrough.push(e);
          break;
        case "thinking_delta":
          this.thinking += e.text;
          passthrough.push(e);
          break;
        case "tool_call_delta": {
          const cur = this.calls.get(e.index) ?? { index: e.index, callId: "", name: "", args: "" };
          if (e.id) cur.callId = e.id;
          if (e.name) cur.name = e.name;
          if (e.argsDelta) cur.args += e.argsDelta;
          this.calls.set(e.index, cur);
          break;
        }
        case "usage":
          this.inputTokens += e.inputTokens;
          this.outputTokens += e.outputTokens;
          passthrough.push(e);
          break;
        case "stop":
          break;
      }
    }
    return passthrough;
  }

  toolCalls(): ToolCall[] {
    return [...this.calls.values()]
      .filter((c) => c.name !== "")
      .sort((a, b) => a.index - b.index)
      .map((c) => ({
        callId: c.callId || `call_${c.index}_${Math.floor(Math.random() * 1e6)}`,
        name: c.name,
        arguments: c.args === "" ? "{}" : c.args,
      }));
  }

  message(): ChatMessage {
    const calls = this.toolCalls();
    const m: ChatMessage = {
      id: newId(),
      role: "assistant",
      text: this.text,
      createdAt: isoMicros(),
    };
    if (this.thinking !== "") m.thinking = this.thinking;
    if (calls.length > 0) m.toolCalls = calls;
    return m;
  }
}

/** 跑一轮对话（自动处理工具调用循环） */
export async function runAgent(opts: RunOptions): Promise<RunResult> {
  const emit = opts.onEvent ?? (() => {});
  const added: ChatMessage[] = [];
  const maxRounds = opts.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS;

  const runId = newId();
  emit({ type: "run_started", runId });

  const userMsg: ChatMessage = {
    id: newId(),
    role: "user",
    text: opts.userText,
    createdAt: isoMicros(),
  };
  added.push(userMsg);

  let history = [...opts.messages, userMsg];
  let textStarted = false;
  let thinkingStarted = false;

  for (let round = 0; round < maxRounds; round++) {
    if (opts.signal?.aborted) {
      emit({ type: "error", message: "已中止" });
      return { added, error: "已中止" };
    }

    const req = buildRequest(opts.cfg, history, opts.tools, opts.systemPrompt);
    const parser = new StreamParser(opts.cfg.useAnthropicFormat);
    const acc = new TurnAccumulator();
    let streamError: string | null = null;
    let httpStatus: number | null = null;

    await opts.transport.stream(req, {
      onLine: (line) => {
        if (line.startsWith("__HTTP_ERROR__")) {
          const rest = line.slice("__HTTP_ERROR__".length);
          const sep = rest.indexOf("|");
          httpStatus = parseInt(rest.slice(0, sep), 10);
          streamError = classifyHttpError(httpStatus, rest.slice(sep + 1));
          return;
        }
        for (const e of acc.apply(parser.feed(line))) {
          if (e.type === "text_delta") {
            if (!textStarted) {
              textStarted = true;
              emit({ type: "text_started" });
            }
            emit({ type: "text_delta", text: e.text });
          } else if (e.type === "thinking_delta") {
            if (!thinkingStarted) {
              thinkingStarted = true;
              emit({ type: "thinking_started" });
            }
            emit({ type: "thinking_delta", text: e.text });
          } else if (e.type === "usage") {
            emit({ type: "usage", inputTokens: e.inputTokens, outputTokens: e.outputTokens });
          }
        }
      },
      onError: (message) => {
        streamError = classifyStreamError(message);
      },
    });

    if (streamError !== null) {
      const msg = streamError as string;
      emit({ type: "error", message: msg, detail: httpStatus === null ? undefined : `HTTP ${httpStatus}` });
      return { added, error: msg };
    }

    const assistant = acc.message();
    added.push(assistant);
    history = [...history, assistant];
    const calls = assistant.toolCalls ?? [];

    if (calls.length === 0) {
      emit({ type: "run_completed", message: assistant });
      return { added };
    }

    emit({ type: "tool_calls_received", calls });

    for (const call of calls) {
      emit({ type: "tool_started", call });
      const ctx = { ...opts.toolCtx, currentCallId: call.callId };
      let resultJson: string;
      try {
        resultJson = await executeTool(ctx, call.name, call.arguments);
      } catch (e) {
        resultJson = JSON.stringify({ error: String(e instanceof Error ? e.message : e) });
      }
      call.result = resultJson;
      emit({ type: "tool_completed", call });
    }
  }

  emit({
    type: "error",
    message: `工具调用轮次超过上限（${maxRounds}），已停止`,
  });
  return { added, error: `超过工具轮次上限 ${maxRounds}` };
}

/** 供界面兜底：没有可用配置时给出逐字错误 */
export function missingConfigError(): string {
  return AI_ERRORS.invalidKey;
}

export type { QuestionItem };
export { executeTool };
