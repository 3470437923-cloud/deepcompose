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

  const result = await runAgent({
    cfg,
    systemPrompt,
    tools: IMPLEMENTED_TOOLS,
    messages: session.messages,
    userText: opts.userText,
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
