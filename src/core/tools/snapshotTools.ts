import type { ToolContext } from "./exec";
import { modeGate } from "../ai/mode";
import { contentHash, loadSnapshots, recordSnapshot, sameProjectRoot, type SnapshotEntry } from "../store/snapshot";

type Args = Record<string, unknown>;
const FILE_OPS = new Set(["write", "append", "replace", "insert", "delete_lines", "delete"]);
const HASH = /^(?:[0-9a-f]{64}|missing)$/;
function out(v: Record<string, unknown>): string { return JSON.stringify(v); }
function fail(message: string): string { return out({ error: message }); }
function str(a: Args, k: string): string | undefined { return typeof a[k] === "string" ? a[k] as string : undefined; }
function int(a: Args, k: string, fallback: number): number { const n = typeof a[k] === "number" ? a[k] as number : Number(a[k]); return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : fallback; }
function safeSession(id: string): boolean { return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id) && !id.includes(".." ); }
function safeRel(p: unknown): p is string {
  if (typeof p !== "string" || p.length === 0 || p.startsWith("/") || p.startsWith(String.fromCharCode(92))) return false;
  if (/^[A-Za-z]:/.test(p)) return false;
  return p.split(/[\\/]/).every((part) => part !== ".." && part !== "");
}
function canonicalRel(p: string): string { return p.split(String.fromCharCode(92)).join("/").replace(/^\/+|\/+$/g, ""); }
function validEntry(x: unknown, sessionId: string, projectRoot: string, expectedPath?: string): x is SnapshotEntry {
  if (!x || typeof x !== "object") return false;
  const e = x as Partial<SnapshotEntry>;
  if (typeof e.snapshotId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(e.snapshotId)) return false;
  if (e.sessionId !== sessionId || !sameProjectRoot(e.projectRoot, projectRoot) || typeof e.callId !== "string") return false;
  if (typeof e.timestamp !== "string" || !Number.isFinite(Date.parse(e.timestamp)) || !safeRel(e.relativePath)) return false;
  if (expectedPath !== undefined && canonicalRel(e.relativePath) !== expectedPath) return false;
  if (!FILE_OPS.has(e.operation ?? "")) return false;
  if (typeof e.previousExists !== "boolean" || !["none", "file"].includes(e.previousType ?? "")) return false;
  if (e.previousType === "file" && (!e.previousExists || typeof e.previousContent !== "string")) return false;
  if (e.previousType === "none" && (e.previousExists || e.previousContent !== null)) return false;
  if (e.operation === "delete") { if (e.postContentHash !== null) return false; } else if (typeof e.postContentHash !== "string" || !/^[0-9a-f]{64}$/.test(e.postContentHash)) return false;
  return e.renameNewPath === null && e.createdPaths === null && e.directoryEntries === null;
}
function selectedSession(ctx: ToolContext, a: Args): { id: string; error?: string } { const id = str(a, "session_id") ?? ctx.sessionId; return safeSession(id) ? { id } : { id, error: "Invalid session_id" }; }

/** 调用方先完成路径授权；此处只按指定作品与文件读取内部快照，不暴露应用数据路径。 */
export async function manageSnapshot(ctx: ToolContext, a: Args, abs: string, rel: string | null): Promise<string> {
  const operation = str(a, "operation");
  if (!operation || !["list_snapshots", "read_snapshot", "restore_snapshot"].includes(operation)) return fail("Invalid snapshot operation");
  const session = selectedSession(ctx, a); if (session.error) return fail(session.error);
  const root = ctx.roots.projectRoot;
  const targetRel = rel === null ? null : canonicalRel(rel);
  if (!root || targetRel === null || targetRel === "" || !safeRel(targetRel)) return fail("Snapshot operation requires an in-project file path");
  const history = await loadSnapshots(ctx.fs, ctx.snapshotsDir, session.id);
  if (history.sessionId !== session.id) return fail("Snapshot session identity does not match the requested session");
  const allValid = history.snapshots.filter((e) => validEntry(e, session.id, root));
  const valid = allValid.filter((e) => canonicalRel(e.relativePath) === targetRel);
  const malformed = history.snapshots.length - allValid.length;
  if (operation === "list_snapshots") {
    const offset = int(a, "offset", 0); const limit = Math.max(1, Math.min(20, int(a, "limit", 20)));
    const items = valid.slice().reverse().slice(offset, offset + limit).map((e) => ({ snapshot_id: e.snapshotId, session_id: e.sessionId, call_id: e.callId, path: canonicalRel(e.relativePath), operation: e.operation, timestamp: e.timestamp, post_content_hash: e.postContentHash, previous_exists: e.previousExists, supported: true, restore_requires_matching_post_hash: true }));
    return out({ success: true, session_id: session.id, snapshots: items, offset, next_offset: offset + items.length, limit, total: valid.length, malformed_entries: malformed, truncated: offset + items.length < valid.length });
  }
  const id = str(a, "snapshot_id"); if (!id) return fail("snapshot_id is required");
  const selected = valid.filter((e) => e.snapshotId === id);
  if (selected.length > 1) return fail("Ambiguous duplicate snapshot_id");
  const entry = selected[0];
  if (!entry) return fail(malformed ? "Snapshot not found, malformed, or missing project identity; only validated file snapshots can be restored" : "Snapshot not found");
  if (operation === "read_snapshot") {
    const offset = int(a, "offset", 0); const limit = Math.max(1, Math.min(8000, int(a, "limit", 8000))); const text = entry.previousContent ?? "";
    const content = text.slice(offset, offset + limit);
    const currentStat = await ctx.fs.stat(abs);
    const currentHash = !currentStat ? "missing" : currentStat.isDir || currentStat.isLink ? "unavailable" : await contentHash(await ctx.fs.readText(abs));
    return out({ success: true, snapshot_id: entry.snapshotId, session_id: entry.sessionId, path: canonicalRel(entry.relativePath), operation: entry.operation, timestamp: entry.timestamp, post_content_hash: entry.postContentHash, previous_content_hash: entry.previousExists ? await contentHash(text) : "missing", current_content_hash: currentHash, previous_exists: entry.previousExists, content, offset, next_offset: offset + content.length, truncated: offset + content.length < text.length });
  }
  if (rel === null || canonicalRel(rel) === "" || !safeRel(rel)) return fail("Restore requires an in-project file path");
  const modeError = modeGate(ctx.mode ?? "dev", "write", targetRel); if (modeError) return fail(modeError);
  if (ctx.snapshot === false) return fail("Restore requires snapshots to be enabled");
  const expected = str(a, "expected_current_hash"); if (!expected || !HASH.test(expected)) return fail("expected_current_hash must be a SHA-256 hash or missing");
  const st = await ctx.fs.stat(abs); if (st?.isDir || st?.isLink) return fail("Cannot restore a directory or link");
  const current = st ? await ctx.fs.readText(abs) : null; const actual = current === null ? "missing" : await contentHash(current);
  const selectedPost = entry.postContentHash ?? "missing";
  if (actual !== expected || selectedPost !== expected) return fail("Target changed since snapshot; refresh and retry with its current hash");
  const restored = entry.previousExists ? entry.previousContent as string : null;
  const restoredHash = restored === null ? "missing" : await contentHash(restored);
  const safety = await recordSnapshot(ctx.fs, ctx.snapshotsDir, { sessionId: ctx.sessionId, projectRoot: root, callId: ctx.currentCallId ?? "restore", operation: restored === null ? "delete" : "write", relativePath: targetRel, previousContent: current, previousExists: current !== null, previousType: current === null ? "none" : "file", postContentHash: restored === null ? null : restoredHash });
  // 安全快照可能等待串行队列；落盘后重读，避免覆盖等待期间的作者修改。
  const finalStat = await ctx.fs.stat(abs);
  if (finalStat?.isDir || finalStat?.isLink) return fail("Target changed while recording safety snapshot");
  const finalHash = finalStat ? await contentHash(await ctx.fs.readText(abs)) : "missing";
  if (finalHash !== expected) return fail("Target changed while recording safety snapshot");
  if (entry.previousExists) await ctx.fs.writeText(abs, restored as string); else await ctx.fs.remove(abs, false);
  const receipt = safety.snapshots.at(-1);
  return out({ success: true, operation: "restore_snapshot", path: targetRel, snapshot_id: entry.snapshotId, safety_snapshot_id: receipt?.snapshotId ?? null, restored_content_hash: restoredHash, expected_current_hash: expected });
}
