import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { executeTool, type ToolContext } from "../../src/core/tools/exec";
import { createNodeFs } from "../support/nodeFs";

let root: string;
let ctx: ToolContext;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "deepcompose-search-quota-"));
  ctx = {
    fs: createNodeFs(),
    roots: { projectRoot: root, booksRoot: root, skillsDir: path.join(root, "skills") },
    booksRoot: root, snapshotsDir: path.join(root, "snapshots"), sessionId: "search-quota-test",
  };
});
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

const call = async (args: Record<string, unknown>) =>
  JSON.parse(await executeTool(ctx, "file_manage", args)) as Record<string, any>;

it("keeps many tiny matches and metadata sums coherent under the UTF-8 quota", async () => {
  for (let i = 0; i < 180; i++) {
    const name = "hit-" + String(i).padStart(3, "0") + "x".repeat(220) + ".md";
    await fs.writeFile(path.join(root, name), "needle\n".repeat(50));
  }
  const result = await call({ operation: "search", path: ".", search_text: "needle" });
  const bytes = new TextEncoder().encode(JSON.stringify(result)).length;
  const returned = result.results.flatMap((item: any) => item.matches).length;
  expect(bytes).toBeLessThanOrEqual(result.max_response_bytes);
  expect(result.total_matches).toBe(9000);
  expect(result.returned_chars).toBeLessThan(24000);
  expect(result.returned_matches).toBe(returned);
  expect(result.omitted_matches).toBe(result.total_matches - result.returned_matches);
  expect(result.omitted_files).toBe(result.files_found - result.results.length);
  expect(result.truncated).toBe(true);
});

it("keeps long filenames and escaped Unicode safely inside the response quota", async () => {
  const filename = "名字" + "x".repeat(230) + ".md";
  const text = "前\\\"😀\nneedle\\\"😀后";
  await fs.writeFile(path.join(root, filename), text);
  const result = await call({ operation: "search", path: ".", search_text: "needle" });
  const bytes = new TextEncoder().encode(JSON.stringify(result)).length;
  expect(bytes).toBeLessThanOrEqual(result.max_response_bytes);
  expect(result.results[0].file).toBe(filename);
  expect(result.results[0].matches[0].content).toContain("needle");
  expect(JSON.parse(JSON.stringify(result))).toEqual(result);

  await fs.writeFile(path.join(root, "unicode.md"), ("needle" + "😀中\\\"".repeat(70) + "\n").repeat(50));
  const unicode = await call({ operation: "search", path: "unicode.md", search_text: "needle" });
  expect(new TextEncoder().encode(JSON.stringify(unicode)).length).toBeLessThanOrEqual(32000);
  expect(unicode.returned_matches).toBeLessThan(50);
  expect(unicode.omitted_matches + unicode.returned_matches).toBe(50);
  expect(unicode.results[0].matches_total).toBe(50);
  expect(unicode.truncated).toBe(true);
});

it("rejects an overlong needle before scanning and accepts the 400-unit boundary", async () => {
  await fs.writeFile(path.join(root, "doc.md"), "a".repeat(400));
  const tooLong = await call({ operation: "search", path: "doc.md", search_text: "a".repeat(401) });
  expect(tooLong.error).toContain("exceeds 400");
  const boundary = await call({ operation: "search", path: "doc.md", search_text: "a".repeat(400) });
  expect(boundary.total_matches).toBe(1);
  expect(boundary.results[0].matches[0].content).toBe("a".repeat(400));
});

it("marks top-level truncation when an excerpt clips a matching line", async () => {
  await fs.writeFile(path.join(root, "doc.md"), "前".repeat(10000) + "needle" + "后".repeat(10000));
  const result = await call({ operation: "search", path: "doc.md", search_text: "needle" });
  const match = result.results[0].matches[0];
  expect(match.truncated).toBe(true);
  expect(result.truncated).toBe(true);
  expect(match.content).toContain("needle");
  expect(result.returned_chars).toBe(match.content.length);
});

it("bounds error diagnostics for an oversized missing path", async () => {
  const args = { operation: "search", path: "missing".repeat(5000), search_text: "needle" };
  const serialized = await executeTool(ctx, "file_manage", args);
  expect(new TextEncoder().encode(serialized).length).toBeLessThanOrEqual(32000);
  expect(JSON.parse(serialized).error).toBeTruthy();
});
