/**
 * 对话控制器：把配置 / 目录 / 工具 / 会话串成一次可用对话。
 * 界面只需要调用 send()，把事件流渲染出来即可。
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

export function providerOf(prefs: Prefs): ProviderConfig | null {
  if (!prefs.llmBaseUrl || !prefs.apiKey || !prefs.model) return null;
  return {
    baseUrl: prefs.llmBaseUrl,
    apiKey: prefs.apiKey,
    model: prefs.model,
    temperature: prefs.temperature,
    useAnthropicFormat: prefs.useAnthropicFormat,
    reservedOutputTokens: prefs.reservedOutputTokens,
    maxTokens: prefs.maxOutputTokens > 0 ? prefs.maxOutputTokens : undefined,
  };
}

export interface SendOptions {
  dirs: AppDirs;
  prefs: Prefs;
  session: SessionFile | null;
  projectRoot: string | null;
  userText: string;
  transport: StreamTransport;
  onEvent?: (e: AgentEvent) => void;
  askQuestions?: (questions: QuestionItem[]) => Promise<string[][]>;
  signal?: { aborted: boolean };
}

export interface SendResult {
  session: SessionFile;
  error?: string;
}

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

  const messages: ChatMessage[] = [...session.messages, ...result.added];
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

export async function reloadIndex(dirs: AppDirs) {
  return loadIndex(getFs(), dirs.sessionsDir);
}

// ────────────────────────────── 隔离会话（冷读） ──────────────────────────────

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
    tools: [],
    messages: [],
    userText: opts.userText,
    maxToolRounds: 1,
    transport: opts.transport,
    onEvent: opts.onEvent,
    signal: opts.signal,
    toolCtx: {
      fs,
      roots: { projectRoot: null, skillsDir: opts.dirs.skillsDir, booksRoot: opts.dirs.booksRoot },
      booksRoot: opts.dirs.booksRoot,
      snapshotsDir: opts.dirs.snapshotsDir,
      sessionId: opts.session.id,
      snapshot: false,
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
