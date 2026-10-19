import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, afterEach, expect, it } from "vitest";
import type { ToolContext } from "../../src/core/tools/exec";
import { manageSnapshot } from "../../src/core/tools/snapshotTools";
import { recordSnapshot, loadSnapshots, snapshotFile, contentHash, type RecordInput } from "../../src/core/store/snapshot";
import { createNodeFs } from "../support/nodeFs";
let base: string;
let ctx: ToolContext;
let abs: string;
beforeEach(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), "snapshot-tools-"));
  const root = path.join(base, "book");
  await fs.mkdir(root);
  abs = path.join(root, "doc.md");
  ctx = { fs: createNodeFs(), roots: { projectRoot: root, booksRoot: root, skillsDir: path.join(base, "skills") }, booksRoot: root, snapshotsDir: path.join(base, "snapshots"), sessionId: "current" };
  await fs.writeFile(abs, "new");
});
afterEach(async () => { await fs.rm(base, { recursive: true, force: true }); });
async function entry(over: Partial<RecordInput> = {}) {
  const history = await recordSnapshot(ctx.fs, ctx.snapshotsDir, { sessionId: ctx.sessionId, projectRoot: ctx.roots.projectRoot!, callId: "", operation: "write", relativePath: "doc.md", previousExists: true, previousContent: "old", postContentHash: await contentHash("new"), ...over });
  return history.snapshots.at(-1)!;
}
async function call(operation: string, args: Record<string, unknown> = {}, rel: string | null = "doc.md") {
  return JSON.parse(await manageSnapshot(ctx, { operation, ...args }, abs, rel));
}
it("lists only the requested path and requires named selection", async () => {
  const first = await entry(); await entry({ relativePath: "other.md" }); await entry({ previousContent: "middle" });
  const listed = await call("list_snapshots");
  expect(listed.total).toBe(2); expect(listed.snapshots.every((e: {path: string}) => e.path === "doc.md")).toBe(true);
  expect((await call("restore_snapshot", { expected_current_hash: await contentHash("new") })).error).toContain("snapshot_id");
  const result = await call("restore_snapshot", { snapshot_id: first.snapshotId, expected_current_hash: await contentHash("new") });
  expect(result.success).toBe(true); expect(result.safety_snapshot_id).toBeTruthy();
  expect(await fs.readFile(abs, "utf8")).toBe("old");
  const saved = (await loadSnapshots(ctx.fs, ctx.snapshotsDir, ctx.sessionId)).snapshots.at(-1)!;
  expect(saved.previousContent).toBe("new"); expect(saved.postContentHash).toBe(await contentHash("old"));
});
it("rejects later author edits even when caller supplies their hash", async () => {
  const e = await entry(); await fs.writeFile(abs, "author");
  expect((await call("restore_snapshot", { snapshot_id: e.snapshotId, expected_current_hash: await contentHash("author") })).error).toContain("changed");
  expect(await fs.readFile(abs, "utf8")).toBe("author");
});
it("does not recreate a manually deleted write target", async () => {
  const e = await entry(); await fs.unlink(abs);
  expect((await call("restore_snapshot", { snapshot_id: e.snapshotId, expected_current_hash: "missing" })).error).toContain("changed");
  expect(await ctx.fs.exists(abs)).toBe(false);
});
it("supports explicit safe cross-session selection bound to the same project", async () => {
  const e = await entry({ sessionId: "earlier" });
  const r = await call("restore_snapshot", { session_id: "earlier", snapshot_id: e.snapshotId, expected_current_hash: await contentHash("new") });
  expect(r.success).toBe(true); expect((await loadSnapshots(ctx.fs, ctx.snapshotsDir, "current")).snapshots).toHaveLength(1);
  expect((await call("list_snapshots", { session_id: "../escape" })).error).toContain("session_id");
});
it("preserves isolated histories when one session writes to multiple projects", async () => {
  const a = await entry({ previousContent: "project A" });
  const rootA = ctx.roots.projectRoot!;
  const rootB = path.join(base, "book B"); await fs.mkdir(rootB);
  await entry({ projectRoot: rootB, previousContent: "project B" });
  const listedA = await call("list_snapshots"); expect(listedA.total).toBe(1); expect(listedA.snapshots[0].snapshot_id).toBe(a.snapshotId);
  ctx.roots.projectRoot = rootB; const listedB = await call("list_snapshots"); expect(listedB.total).toBe(1);
  expect((await call("read_snapshot", { snapshot_id: a.snapshotId })).error).toBeTruthy();
  ctx.roots.projectRoot = rootA; expect((await call("read_snapshot", { snapshot_id: a.snapshotId })).content).toBe("project A");
});
it("rejects wrong root, legacy and malformed records without mutation", async () => {
  const e = await entry();
  for (const changes of [{ projectRoot: path.join(base, "other") }, { projectRoot: undefined }, { previousExists: undefined }, { previousContent: 12 }]) {
    await ctx.fs.writeText(snapshotFile(ctx.snapshotsDir, ctx.sessionId), JSON.stringify({ sessionId: ctx.sessionId, projectRoot: ctx.roots.projectRoot, snapshots: [{ ...e, ...changes }, null] }));
    expect((await call("restore_snapshot", { snapshot_id: e.snapshotId, expected_current_hash: await contentHash("new") })).error).toBeTruthy();
    expect(await fs.readFile(abs, "utf8")).toBe("new");
  }
});
it("enforces readonly, writing paths and snapshot-enabled restore", async () => {
  const e = await entry(); const args = { snapshot_id: e.snapshotId, expected_current_hash: await contentHash("new") };
  ctx.mode = "readonly"; expect((await call("restore_snapshot", args)).error).toBeTruthy();
  ctx.mode = "writing"; expect((await call("restore_snapshot", args)).error).toBeTruthy();
  ctx.mode = "dev"; ctx.snapshot = false; expect((await call("restore_snapshot", args)).error).toContain("enabled");
  expect((await call("list_snapshots", {}, null)).error).toBeTruthy();
  expect((await call("list_snapshots", {}, "")).error).toBeTruthy();
});
it("preserves author edits made while the safety snapshot is saving", async () => {
  const e = await entry(); const original = ctx.fs.writeText.bind(ctx.fs);
  ctx.fs.writeText = async (p, text) => { await original(p, text); if (p.startsWith(ctx.snapshotsDir)) await fs.writeFile(abs, "author during snapshot"); };
  expect((await call("restore_snapshot", { snapshot_id: e.snapshotId, expected_current_hash: await contentHash("new") })).error).toContain("changed");
  expect(await fs.readFile(abs, "utf8")).toBe("author during snapshot");
});
it("snapshot persistence failure prevents restore", async () => {
  const e = await entry(); const original = ctx.fs.writeText.bind(ctx.fs);
  ctx.fs.writeText = async (p, text) => { if (p.startsWith(ctx.snapshotsDir)) throw Error("snapshot unavailable"); await original(p, text); };
  await expect(call("restore_snapshot", { snapshot_id: e.snapshotId, expected_current_hash: await contentHash("new") })).rejects.toThrow("snapshot unavailable");
  expect(await fs.readFile(abs, "utf8")).toBe("new");
});
it("keeps zero-limit list and preview cursors moving", async () => {
  const e = await entry();
  const listed = await call("list_snapshots", { limit: 0 }); expect(listed.snapshots).toHaveLength(1); expect(listed.next_offset).toBe(1);
  const page = await call("read_snapshot", { snapshot_id: e.snapshotId, limit: 0 }); expect(page.content).toBe("o"); expect(page.next_offset).toBe(1);
});
it("bounds list and preview pages and reports live and previous hashes", async () => {
  const text = "😀".repeat(5000); const e = await entry({ previousContent: text });
  for (let i = 0; i < 21; i++) await entry();
  const list = await call("list_snapshots", { limit: 100 }); expect(list.snapshots).toHaveLength(20); expect(list.truncated).toBe(true);
  const first = await call("read_snapshot", { snapshot_id: e.snapshotId, limit: 10000 });
  expect(first.content.length).toBe(8000); expect(first.current_content_hash).toBe(await contentHash("new")); expect(first.previous_content_hash).toBe(await contentHash(text));
  const second = await call("read_snapshot", { snapshot_id: e.snapshotId, offset: first.next_offset });
  expect(first.content + second.content).toBe(text);
});
it("undoes a new file and can reverse the safety deletion", async () => {
  const e = await entry({ previousExists: false, previousType: "none", previousContent: null });
  const removed = await call("restore_snapshot", { snapshot_id: e.snapshotId, expected_current_hash: await contentHash("new") });
  expect(removed.success).toBe(true); expect(await ctx.fs.exists(abs)).toBe(false);
  const reverse = await call("restore_snapshot", { snapshot_id: removed.safety_snapshot_id, expected_current_hash: "missing" });
  expect(reverse.success).toBe(true); expect(await fs.readFile(abs, "utf8")).toBe("new");
});
it("restores explicit delete snapshots only while target remains missing", async () => {
  const e = await entry({ operation: "delete", postContentHash: null }); await fs.unlink(abs);
  expect((await call("restore_snapshot", { snapshot_id: e.snapshotId, expected_current_hash: "missing" })).success).toBe(true);
  expect(await fs.readFile(abs, "utf8")).toBe("old");
});
