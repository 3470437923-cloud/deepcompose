/**
 * 会话存储（格式逐字对齐真机）。
 *
 * 目录：<Documents>\writerd_sessions\
 *   <uuid>.json  {"id","title","projectPath","createdAt","updatedAt","messages":[…]}
 *   index.json   {"version":1,"sessions":{"<uuid>":{"title","projectPath","createdAt",
 *                 "updatedAt","userMessageCount","size","mtimeMs"}}}
 * 消息形态（真机实证）：{"id","role","text","thinking","toolCalls","toolResults","createdAt"}
 * 空会话标题：`New Chat - 2026-05-21T16:58`；有首条用户消息后取前 30 字 + `...`
 */

import type { FsBridge } from "../fsbridge";
import { join } from "../dirs";
import { isoMicros } from "../ids";
import type { ChatMessage } from "../ai/protocol";

export interface SessionFile {
  id: string;
  title: string;
  projectPath: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface SessionIndexEntry {
  title: string;
  projectPath: string;
  createdAt: string;
  updatedAt: string;
  userMessageCount: number;
  size: number;
  mtimeMs: number;
}

export interface SessionIndex {
  version: number;
  sessions: Record<string, SessionIndexEntry>;
}

export const SESSION_INDEX_VERSION = 1;
export const TITLE_MAX = 30;

export function emptyIndex(): SessionIndex {
  return { version: SESSION_INDEX_VERSION, sessions: {} };
}

export function sessionFile(sessionsDir: string, id: string): string {
  return join(sessionsDir, `${id}.json`);
}

export function indexFile(sessionsDir: string): string {
  return join(sessionsDir, "index.json");
}

export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** `New Chat - 2026-05-21T16:58`（真机空会话标题形态） */
export function defaultTitle(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `New Chat - ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 首条用户消息 → 标题（前 30 字 + `...`） */
export function titleFromText(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t === "") return "";
  return t.length > TITLE_MAX ? t.slice(0, TITLE_MAX) + "..." : t;
}

export function newSession(projectPath: string, now: Date = new Date()): SessionFile {
  const stamp = isoMicros(now);
  return {
    id: uuid(),
    title: defaultTitle(now),
    projectPath,
    createdAt: stamp,
    updatedAt: stamp,
    messages: [],
  };
}

export function parseSession(text: string): SessionFile | null {
  try {
    const raw: unknown = JSON.parse(text);
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Partial<SessionFile>;
    if (typeof o.id !== "string" || !Array.isArray(o.messages)) return null;
    return {
      id: o.id,
      title: typeof o.title === "string" ? o.title : "",
      projectPath: typeof o.projectPath === "string" ? o.projectPath : "",
      createdAt: typeof o.createdAt === "string" ? o.createdAt : isoMicros(),
      updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : isoMicros(),
      messages: o.messages as ChatMessage[],
    };
  } catch {
    return null;
  }
}

export function parseIndex(text: string): SessionIndex {
  try {
    const raw: unknown = JSON.parse(text);
    if (raw && typeof raw === "object") {
      const o = raw as Partial<SessionIndex>;
      return {
        version: typeof o.version === "number" ? o.version : SESSION_INDEX_VERSION,
        sessions: (o.sessions as Record<string, SessionIndexEntry>) ?? {},
      };
    }
  } catch {
    // 损坏即视为空索引
  }
  return emptyIndex();
}

export async function loadIndex(fs: FsBridge, sessionsDir: string): Promise<SessionIndex> {
  const f = indexFile(sessionsDir);
  if (!(await fs.exists(f))) return emptyIndex();
  return parseIndex(await fs.readText(f));
}

export async function saveIndex(fs: FsBridge, sessionsDir: string, index: SessionIndex): Promise<void> {
  await fs.writeText(indexFile(sessionsDir), JSON.stringify(index));
}

export async function saveSession(fs: FsBridge, sessionsDir: string, s: SessionFile): Promise<SessionIndex> {
  const body = JSON.stringify(s);
  await fs.writeText(sessionFile(sessionsDir, s.id), body);
  const index = await loadIndex(fs, sessionsDir);
  const st = await fs.stat(sessionFile(sessionsDir, s.id));
  index.sessions[s.id] = {
    title: s.title,
    projectPath: s.projectPath,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    userMessageCount: s.messages.filter((m) => m.role === "user").length,
    size: new TextEncoder().encode(body).length,
    mtimeMs: st?.mtimeMs ?? Date.now(),
  };
  await saveIndex(fs, sessionsDir, index);
  return index;
}

export async function loadSession(fs: FsBridge, sessionsDir: string, id: string): Promise<SessionFile | null> {
  const f = sessionFile(sessionsDir, id);
  if (!(await fs.exists(f))) return null;
  return parseSession(await fs.readText(f));
}

export async function deleteSession(fs: FsBridge, sessionsDir: string, id: string): Promise<void> {
  await fs.remove(sessionFile(sessionsDir, id), false);
  const index = await loadIndex(fs, sessionsDir);
  delete index.sessions[id];
  await saveIndex(fs, sessionsDir, index);
}

export interface SessionListEntry extends SessionIndexEntry {
  id: string;
}

/** 会话列表（按 updatedAt 倒序，与真机一致） */
export function listSessions(index: SessionIndex, projectPath?: string | null): SessionListEntry[] {
  const out: SessionListEntry[] = Object.entries(index.sessions).map(([id, e]) => ({ id, ...e }));
  const filtered = projectPath ? out.filter((e) => e.projectPath === projectPath) : out;
  return filtered.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}
