/** 单文件搜索与目录搜索使用同一套命中口径，坏路径不能冒充零命中。 */
import { promises as fsp } from "node:fs";
import { existsSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNodeFs } from "../support/nodeFs";
import { executeTool, type ToolContext } from "../../src/core/tools/exec";
import { join } from "../../src/core/dirs";
const realProject = process.env.DEEPCOMPOSE_READONLY_PROJECT_ROOT ?? "";
describe.skipIf(!realProject || !existsSync(realProject))("真实作品只读检索", () => {
  it.each(["的", "了"])("单文件检索 %s 与原文逐行核对", async (needle) => {
    const fs = createNodeFs();
    const rel = "章节内容/第9章.md";
    const source = await fs.readText(path.join(realProject, rel));
    const expected = source.split(/\r\n|\r|\n/).flatMap((content, i) => content.includes(needle) ? [{ line: i + 1, content }] : []);
    expect(expected.length).toBeGreaterThan(0);
    const c: ToolContext = { fs, roots: { projectRoot: realProject, booksRoot: realProject, skillsDir: realProject }, booksRoot: realProject, snapshotsDir: realProject, sessionId: "readonly", snapshot: false };
    const result = JSON.parse(await executeTool(c, "file_manage", { operation: "search", path: rel, search_text: needle }));
    expect(result.files_found).toBe(1);
    expect(result.results[0].matches).toEqual(expected.slice(0, 50));
    expect(await fs.readText(path.join(realProject, rel))).toBe(source);
    console.log(JSON.stringify({ needle, actualMatches: expected.length, returnedMatches: result.results[0].matches.length, unchanged: true }));
  });
});
let root: string;
let ctx: ToolContext;
beforeAll(async () => {
  root = await fsp.mkdtemp(path.join(os.tmpdir(), "deepcompose-search-"));
  await fsp.mkdir(path.join(root, "章节内容"));
  await fsp.writeFile(path.join(root, "章节内容", "第9章.md"), "便利贴\r\n测试人物\r\n" + "便利贴\n".repeat(55));
  ctx = { fs: createNodeFs(), roots: { projectRoot: root, booksRoot: root, skillsDir: root }, booksRoot: root, snapshotsDir: root, sessionId: "search", snapshot: false };
});
afterAll(async () => { await fsp.rm(root, { recursive: true, force: true }); });
async function search(args: Record<string, unknown>) {
  return JSON.parse(await executeTool(ctx, "file_manage", { operation: "search", path: "章节内容/第9章.md", search_text: "测试人物", ...args }));
}
describe("指定文件搜索", () => {
  it("相对文件路径返回正确的中文命中、行号和项目相对路径", async () => {
    const r = await search({});
    expect(r.files_found).toBe(1);
    expect(r.results).toEqual([{ file: join("章节内容", "第9章.md"), matches: [{ line: 2, content: "测试人物" }] }]);
  });
  it("绝对文件路径与相对文件路径结果一致", async () => {
    expect(await search({ path: path.join(root, "章节内容", "第9章.md") })).toEqual(await search({}));
  });
  it("单文件也遵守每文件最多50条的限额", async () => {
    const r = await search({ search_text: "便利贴" });
    expect(r.files_found).toBe(1);
    expect(r.results[0].matches).toHaveLength(50);
    expect(r.results[0].matches[0].line).toBe(1);
  });
  it("文件未命中合法返回空，且不读取相邻文件", async () => {
    const r = await search({ search_text: "不存在的词" });
    expect(r).toMatchObject({ success: true, files_found: 0, results: [], files_skipped: 0 });
  });
  it("缺失文件回报错误，不伪装成成功零命中", async () => {
    expect((await search({ path: "章节内容/不存在.md" })).error).toContain("not found");
  });
  it("用户明确指定的链接授权根可搜索，根内链接仍不展开", async () => {
    const linkRoot = path.join(root, "linked-project");
    await fsp.symlink(root, linkRoot, process.platform === "win32" ? "junction" : "dir");
    const linked: ToolContext = { ...ctx, roots: { projectRoot: linkRoot, booksRoot: linkRoot, skillsDir: linkRoot }, booksRoot: linkRoot };
    for (const target of [".", linkRoot + path.sep]) {
      const r = JSON.parse(await executeTool(linked, "file_manage", { operation: "search", path: target, search_text: "测试人物" }));
      expect(r.error).toBeUndefined();
      expect(r.files_found).toBe(1);
      expect(r.results).toEqual([{ file: join("章节内容", "第9章.md"), matches: [{ line: 2, content: "测试人物" }] }]);
    }
  });
  it("directory 仍覆盖 path 并可递归查找", async () => {
    const r = await search({ path: ".", directory: "章节内容" });
    expect(r.files_found).toBe(1);
    expect(r.results[0].file).toBe(join("章节内容", "第9章.md"));
  });
});
