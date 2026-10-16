import { promises as fsp } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createNodeFs } from "../support/nodeFs";
import { executeTool, type ToolContext } from "../../src/core/tools/exec";

let base: string;
let root: string;
let ctx: ToolContext;
beforeEach(async () => {
  base = await fsp.mkdtemp(path.join(os.tmpdir(), "deepcompose-safety-"));
  root = path.join(base, "books", "book");
  await fsp.mkdir(root, { recursive: true });
  ctx = { fs: createNodeFs(), roots: { projectRoot: root, booksRoot: path.dirname(root), skillsDir: path.join(base, "skills") }, booksRoot: path.dirname(root), snapshotsDir: path.join(base, "snapshots"), sessionId: "safety" };
});
afterEach(async () => { await fsp.rm(base, { recursive: true, force: true }); });

it("非空目录不能以空壳快照递归删除", async () => {
  await fsp.mkdir(path.join(root, "drafts"));
  await fsp.writeFile(path.join(root, "drafts", "chapter.md"), "original");
  const r = JSON.parse(await executeTool(ctx, "file_manage", { operation: "delete", path: "drafts" }));
  expect(r.error).toBeDefined();
  expect(await fsp.readFile(path.join(root, "drafts", "chapter.md"), "utf8")).toBe("original");
});

it("目录复制不得合并覆盖既有目录", async () => {
  for (const name of ["from", "to"]) await fsp.mkdir(path.join(root, name));
  await fsp.writeFile(path.join(root, "from", "chapter.md"), "new");
  await fsp.writeFile(path.join(root, "to", "chapter.md"), "original");
  const r = JSON.parse(await executeTool(ctx, "file_manage", { operation: "copy", path: "from", new_path: "to" }));
  expect(r.error).toBeDefined();
  expect(await fsp.readFile(path.join(root, "to", "chapter.md"), "utf8")).toBe("original");
});

it("目录链接绝对路径尾斜杠不能绕过祖先检查", async () => {
  const outside = path.join(base, "outside");
  await fsp.mkdir(outside);
  await fsp.writeFile(path.join(outside, "secret.md"), "private");
  const link = path.join(root, "link");
  await fsp.symlink(outside, link, process.platform === "win32" ? "junction" : "dir");
  for (const [tool, args] of [
    ["file_read", { operation: "list", path: link + path.sep }],
    ["file_manage", { operation: "search", path: link + path.sep, search_text: "private" }],
    ["file_manage", { operation: "copy", path: link + path.sep, new_path: "copied" }],
  ] as const) {
    const r = JSON.parse(await executeTool(ctx, tool, args));
    expect(r.error).toContain("链接");
  }
  expect(await ctx.fs.exists(path.join(root, "copied"))).toBe(false);
});

it("祖先目录链接不能用于根内读写或经 .. 绕过", async () => {
  const outside = path.join(base, "outside");
  await fsp.mkdir(outside);
  await fsp.writeFile(path.join(outside, "secret.md"), "private");
  await fsp.symlink(outside, path.join(root, "link"), process.platform === "win32" ? "junction" : "dir");
  for (const [tool, args] of [
    ["file_read", { operation: "read", path: "link/secret.md" }],
    ["file_write", { operation: "write", path: "link/new.md", content: "bad" }],
    ["file_read", { operation: "list", path: "link/../outside" }],
  ] as const) {
    const r = JSON.parse(await executeTool(ctx, tool, args));
    expect(r.error).toBeDefined();
  }
  expect(await fsp.readFile(path.join(outside, "secret.md"), "utf8")).toBe("private");
  expect(await ctx.fs.exists(path.join(outside, "new.md"))).toBe(false);
});
