/**
 * 对话控制器：把配置 / 目录 / 工具 / 会话串成一次可用对话。
 * 界面只需要调用 send()，把事件流渲染出来即可。
 *
 * 装配顺序（send）：系统提示词（含项目块/技能块）→ 上下文自动压缩（可选）→
 * runAgent 工具循环 → 会话落盘。压缩只影响发给 AI 的请求序列，
 * 落盘的 messages 始终是完整原始记录（会话文件不删任何消息）。
 *
 * 落盘时机：runAgent 返回后一次性 saveSession（正常/出错/中止都会落盘，
 * 因为 runAgent 保证不 reject 且 added 始终含本轮新消息）；saveSession 自身
 * 失败（磁盘错误）会向上抛，由界面兜底提示。
 */

import type { AppDirs } from "../dirs";
import { getFs } from "../fsbridge";
import type { Prefs } from "../prefs";
import { lookupSkill } from "../skills/registry";
import type { QuestionItem } from "../tools/exec";
import { IMPLEMENTED_TOOLS } from "../tools/spec";
import { runAgent, type AgentEvent, type StreamTransport } from "./agent";
import { AI_ERRORS } from "./errors";
import { buildSystemPrompt } from "./prompt";
import { maybeCompress } from "./compress";
import type { ChatMessage, ProviderConfig } from "./protocol";
import {
  loadIndex,
  newSession,
  saveSession,
  titleFromText,
  type SessionFile,
} from "../store/session";
import { isoMicros } from "../ids";

/** 当前注册给模型的工具（web_search/terminal/rank_data_query 尚未实现，故不在其中） */
export const ENABLED_TOOLS = IMPLEMENTED_TOOLS.map((t) => t.name);

/**
 * 从用户配置装配供应商参数；三要素（baseUrl/apiKey/model）缺一即返回 null，
 * 调用方须以 AI_ERRORS.invalidKey 逐字文案拒绝发送。
 */
export function providerOf(prefs: Prefs): ProviderConfig | null {
  if (!prefs.llmBaseUrl || !prefs.apiKey || !prefs.model) return null;
  return {
    baseUrl: prefs.llmBaseUrl,
    apiKey: prefs.apiKey,
    model: prefs.model,
    temperature: prefs.temperature,
    useAnthropicFormat: prefs.useAnthropicFormat,
    reservedOutputTokens: prefs.reservedOutputTokens,
    // maxOutputTokens <= 0 视为未设置：交给协议层用 DEFAULT_MAX_TOKENS
    maxTokens: prefs.maxOutputTokens > 0 ? prefs.maxOutputTokens : undefined,
  };
}

/** send() 的输入（一次完整对话发送） */
export interface SendOptions {
  dirs: AppDirs;
  prefs: Prefs;
  /** 当前会话；null 时内部新建（首条用户消息触发标题派生） */
  session: SessionFile | null;
  projectRoot: string | null;
  userText: string;
  transport: StreamTransport;
  onEvent?: (e: AgentEvent) => void;
  /** question 工具的界面回调（弹窗提问 → 用户选择 → resolve 答案） */
  askQuestions?: (questions: QuestionItem[]) => Promise<string[][]>;
  signal?: { aborted: boolean };
}

export interface SendResult {
  /** 已落盘的最新会话（含本轮全部新消息；即使 error 存在也已保存） */
  session: SessionFile;
  error?: string;
}

/**
 * 发送一条用户消息并跑完整工具循环。
 * 契约：runAgent 层面的失败/中止不抛异常，折算在 SendResult.error 里，
 * 会话（含用户消息与部分正文）照常落盘。
 */
export async function send(opts: SendOptions): Promise<SendResult> {
  const fs = getFs();
  const cfg = providerOf(opts.prefs);
  const session = opts.session ?? newSession(opts.projectRoot ?? "");

  if (!cfg) {
    const message = AI_ERRORS.invalidKey;
    opts.onEvent?.({ type: "error", message });
    return { session, error: message };
  }

  const systemPrompt = buildSystemPrompt({
    basePrompt: opts.prefs.systemPrompt,
    projectRoot: opts.projectRoot,
    skills: opts.prefs.skillList,
    activeSkillIds: opts.prefs.activeSkillIds,
    enabledTools: ENABLED_TOOLS,
  });

  // 上下文自动压缩：只影响发给 AI 的请求序列，会话记录保持完整
  let requestMessages: ChatMessage[] = session.messages;
  if (opts.prefs.autoClearContext) {
    try {
      const compressed = await maybeCompress({
        cfg,
        transport: opts.transport,
        messages: session.messages,
        contextLimit: opts.prefs.contextLimit,
        reservedOutputTokens: opts.prefs.reservedOutputTokens,
        sessionId: session.id,
        // 压缩的观测信息（失败/拒绝原因）借 error 事件通道浮出：非致命，对话继续
        onNotice: (m) => opts.onEvent?.({ type: "error", message: m }),
      });
      if (compressed) requestMessages = compressed.requestMessages;
    } catch {
      // 压缩失败不阻断对话：按完整上下文发送
    }
  }

  const result = await runAgent({
    cfg,
    systemPrompt,
    tools: IMPLEMENTED_TOOLS,
    messages: requestMessages,
    userText: opts.userText,
    // 轮次上限来自用户设置，钳制到 1..50（0/负数按 12 兜底，见 `|| 12`）
    maxToolRounds: Math.max(1, Math.min(50, opts.prefs.toolRoundLimit || 12)),
    transport: opts.transport,
    onEvent: opts.onEvent,
    signal: opts.signal,
    toolCtx: {
      fs,
      roots: {
        projectRoot: opts.projectRoot,
        skillsDir: opts.dirs.skillsDir,
        booksRoot: opts.dirs.booksRoot,
      },
      booksRoot: opts.dirs.booksRoot,
      snapshotsDir: opts.dirs.snapshotsDir,
      sessionId: session.id,
      askQuestions: opts.askQuestions,
      lookupSkill: (name) => lookupSkill(fs, opts.prefs.skillList, name),
    },
  });

  // 落盘用完整原始记录（session.messages）+ 本轮新增；压缩产物不进会话文件
  const messages: ChatMessage[] = [...session.messages, ...result.added];
  // 标题派生：仍是默认「New Chat …」时取首条用户消息前 30 字
  const firstUser = messages.find((m) => m.role === "user");
  const title =
    session.title.startsWith("New Chat") && firstUser
      ? titleFromText(firstUser.text) || session.title
      : session.title;

  const next: SessionFile = {
    ...session,
    title,
    projectPath: session.projectPath || opts.projectRoot || "",
    updatedAt: isoMicros(),
    messages,
  };

  await saveSession(fs, opts.dirs.sessionsDir, next);
  return { session: next, error: result.error };
}

/** 重读会话索引（界面在落盘后刷新会话列表用） */
export async function reloadIndex(dirs: AppDirs) {
  return loadIndex(getFs(), dirs.sessionsDir);
}

// ────────────────────────────── 隔离会话（冷读） ──────────────────────────────

/** sendIsolated() 的输入（冷读专用；调用方负责新建会话与装配隔离系统提示词） */
export interface IsolatedSendOptions {
  dirs: AppDirs;
  prefs: Prefs;
  /** 调用方新建的会话（标题已设好，不会走 New Chat 派生） */
  session: SessionFile;
  /** 隔离系统提示词（不装配项目块/技能块） */
  systemPrompt: string;
  userText: string;
  transport: StreamTransport;
  onEvent?: (e: AgentEvent) => void;
  signal?: { aborted: boolean };
}

/**
 * 隔离会话：零工具、零技能、零项目上下文（冷读专用）。
 * 隔离由代码保证——不注册任何文件工具，模型物理上无法读取项目文件。
 * 回归锁：tests/ai/coldread.test.ts 锁定「tools=[] 时请求体不含 tools 键」，
 * 本函数不得传入任何工具、不得经 buildSystemPrompt 装配项目块/技能块。
 */
export async function sendIsolated(opts: IsolatedSendOptions): Promise<SendResult> {
  const fs = getFs();
  const cfg = providerOf(opts.prefs);

  if (!cfg) {
    const message = AI_ERRORS.invalidKey;
    opts.onEvent?.({ type: "error", message });
    return { session: opts.session, error: message };
  }

  const result = await runAgent({
    cfg,
    systemPrompt: opts.systemPrompt,
    tools: [], // 零工具：请求体无 tools 键（隔离的物理保证）
    messages: [], // 零上下文：不继承任何历史对话
    userText: opts.userText,
    maxToolRounds: 1, // 单回合：无工具可循环
    transport: opts.transport,
    onEvent: opts.onEvent,
    signal: opts.signal,
    toolCtx: {
      fs,
      // projectRoot: null —— 路径守卫不放行任何项目内路径
      roots: { projectRoot: null, skillsDir: opts.dirs.skillsDir, booksRoot: opts.dirs.booksRoot },
      booksRoot: opts.dirs.booksRoot,
      snapshotsDir: opts.dirs.snapshotsDir,
      sessionId: opts.session.id,
      snapshot: false, // 冷读不写文件，也就不产生快照
    },
  });

  const messages: ChatMessage[] = [...opts.session.messages, ...result.added];
  const next: SessionFile = {
    ...opts.session,
    updatedAt: isoMicros(),
    messages,
  };
  await saveSession(fs, opts.dirs.sessionsDir, next);
  return { session: next, error: result.error };
}
