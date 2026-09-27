/**
 * 写前快照（按会话记录，逐字对齐真机格式）。
 *
 * 实测样本（Documents\openwrite_snapshots\0114dbe9-….json）：
 * {"sessionId":"…","snapshots":[{"snapshotId":"<uuid>","sessionId":"…",
 *   "callId":"call_00_…","timestamp":"2026-07-05T04:55:23.302527","operation":"write",
 *   "relativePath":"章节内容/第37章.md","previousContent":null,"previousExists":false,
 *   "previousType":"none","renameNewPath":null,"createdPaths":null,
 *   "postContentHash":"<sha256 hex>","directoryEntries":null}]}
 *
 * 纪律（CONTRACT §6.2 写前快照）：任何回写先留快照；模型侧通用 write/edit 也要走这里。
 */

import type { FsBridge } from "../fsbridge";
import { join } from "../dirs";
import { isoMicros } from "../ids";

export type SnapshotOperation =
  | "write"
  | "append"
  | "replace"
  | "insert"
  | "delete_lines"
  | "copy"
  | "rename"
  | "delete";

export type PreviousType = "none" | "file" | "directory";

export interface SnapshotEntry {
  snapshotId: string;
  sessionId: string;
  callId: string;
  timestamp: string;
  operation: SnapshotOperation;
  /** 相对作品根的路径，'/' 分隔 */
  relativePath: string;
  previousContent: string | null;
  previousExists: boolean;
  previousType: PreviousType;
  renameNewPath: string | null;
  createdPaths: string[] | null;
  /** 写后内容 sha256（小写 hex）；目录操作时为 null */
  postContentHash: string | null;
  directoryEntries: unknown[] | null;
}

export interface SessionSnapshots {
  sessionId: string;
  snapshots: SnapshotEntry[];
}

export function emptySnapshots(sessionId: string): SessionSnapshots {
  return { sessionId, snapshots: [] };
}

export function parseSnapshots(text: string, sessionId: string): SessionSnapshots {
  if (!text || !text.trim()) return emptySnapshots(sessionId);
  try {
    const raw: unknown = JSON.parse(text);
    if (raw && typeof raw === "object") {
      const o = raw as Partial<SessionSnapshots>;
      return {
        sessionId: typeof o.sessionId === "string" ? o.sessionId : sessionId,
        snapshots: Array.isArray(o.snapshots) ? (o.snapshots as SnapshotEntry[]) : [],
      };
    }
  } catch {
    // 损坏文件视为空，不阻断写作
  }
  return emptySnapshots(sessionId);
}

export function serializeSnapshots(s: SessionSnapshots): string {
  return JSON.stringify(s);
}

export function snapshotFile(snapshotsDir: string, sessionId: string): string {
  return join(snapshotsDir, `${sessionId}.json`);
}

/** 写后内容哈希（sha256 小写 hex） */
export async function contentHash(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface RecordInput {
  sessionId: string;
  callId: string;
  operation: SnapshotOperation;
  relativePath: string;
  previousContent: string | null;
  previousExists: boolean;
  previousType?: PreviousType;
  renameNewPath?: string | null;
  createdPaths?: string[] | null;
  postContentHash?: string | null;
  directoryEntries?: unknown[] | null;
}

/** 追加一条快照并落盘 */
export async function recordSnapshot(
  fs: FsBridge,
  snapshotsDir: string,
  input: RecordInput,
  now: Date = new Date(),
): Promise<SessionSnapshots> {
  const file = snapshotFile(snapshotsDir, input.sessionId);
  const existing = (await fs.exists(file)) ? parseSnapshots(await fs.readText(file), input.sessionId) : emptySnapshots(input.sessionId);

  const entry: SnapshotEntry = {
    snapshotId: uuid(),
    sessionId: input.sessionId,
    callId: input.callId,
    timestamp: isoMicros(now),
    operation: input.operation,
    relativePath: input.relativePath,
    previousContent: input.previousContent,
    previousExists: input.previousExists,
    previousType: input.previousType ?? (input.previousExists ? "file" : "none"),
    renameNewPath: input.renameNewPath ?? null,
    createdPaths: input.createdPaths ?? null,
    postContentHash: input.postContentHash ?? null,
    directoryEntries: input.directoryEntries ?? null,
  };

  const next: SessionSnapshots = {
    sessionId: input.sessionId,
    snapshots: [...existing.snapshots, entry],
  };
  await fs.writeText(file, serializeSnapshots(next));
  return next;
}

export async function loadSnapshots(
  fs: FsBridge,
  snapshotsDir: string,
  sessionId: string,
): Promise<SessionSnapshots> {
  const file = snapshotFile(snapshotsDir, sessionId);
  if (!(await fs.exists(file))) return emptySnapshots(sessionId);
  return parseSnapshots(await fs.readText(file), sessionId);
}

/** 最近一条针对某路径的快照（回滚用） */
export function lastForPath(s: SessionSnapshots, relativePath: string): SnapshotEntry | null {
  for (let i = s.snapshots.length - 1; i >= 0; i--) {
    if (s.snapshots[i].relativePath === relativePath) return s.snapshots[i];
  }
  return null;
}
