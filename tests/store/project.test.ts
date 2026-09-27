/**
 * 作品目录协议：与真机布局逐项对齐，并做一次真机只读集成校验。
 */
import { existsSync } from "node:fs";
import { promises as fsp } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNodeFs } from "../support/nodeFs";
import {
  createProject,
  listChapters,
  listDocs,
  loadProject,
  scanBooksRoot,
} from "../../src/core/store/project";
import { compareChapterFiles, parseChapterName, parseCnNumber } from "../../src/core/store/chapter";

let booksRoot: string;
const fs = createNodeFs();

beforeAll(async () => {
  booksRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "writerd-books-"));
});

afterAll(async () => {
  if (booksRoot) await fsp.rm(booksRoot, { recursive: true, force: true });
});

describe("中文数字与章号解析", () => {
  it("阿拉伯数字与全角数字", () => {
    expect(parseCnNumber("12")).toBe(12);
    expect(parseCnNumber("１２")).toBe(12);
  });

  it("中文数字：十 / 十一 / 二十 / 一百零三 / 一千零二十", () => {
    expect(parseCnNumber("十")).toBe(10);
    expect(parseCnNumber("十一")).toBe(11);
    expect(parseCnNumber("二十")).toBe(20);
    expect(parseCnNumber("一百零三")).toBe(103);
    expect(parseCnNumber("一千零二十")).toBe(1020);
  });

  it("非数字串返回 null", () => {
    expect(parseCnNumber("序章")).toBeNull();
    expect(parseCnNumber("")).toBeNull();
  });

  it("parseChapterName 支持 章/节/卷/回/部/集 与标题残余", () => {
    expect(parseChapterName("第12章")).toEqual({ no: 12, unit: "章", rest: "" });
    expect(parseChapterName("第十二章 启程")).toEqual({ no: 12, unit: "章", rest: "启程" });
    expect(parseChapterName("第1卷")).toEqual({ no: 1, unit: "卷", rest: "" });
    expect(parseChapterName("第 3 回 入城")).toEqual({ no: 3, unit: "回", rest: "入城" });
    expect(parseChapterName("随便一个名字")).toBeNull();
  });
});

describe("章节排序", () => {
  it("按数值排序而非字典序（第10章 在 第2章 之后）", () => {
    const files = ["第10章.md", "第2章.md", "第1章.md"];
    expect([...files].sort(compareChapterFiles)).toEqual(["第1章.md", "第2章.md", "第10章.md"]);
  });

  it("不能解析出章号的文件排在最后", () => {
    const files = ["1.md", "第3章.md", "序.md"];
    const sorted = [...files].sort(compareChapterFiles);
    expect(sorted[0]).toBe("第3章.md");
    expect(sorted.slice(1).sort()).toEqual(["1.md", "序.md"]);
  });
});

describe("新建作品：布局与真机逐项一致", () => {
  it("生成 小说资料 三件套 + 章节内容 + .openwrite_manifest.json", async () => {
    const p = await createProject(fs, booksRoot, "测试书籍");
    const entries = await fsp.readdir(p.root);
    expect(entries.sort()).toEqual(["小说资料", "章节内容", ".openwrite_manifest.json"].sort());

    const docEntries = (await fsp.readdir(path.join(p.root, "小说资料"))).sort();
    expect(docEntries).toEqual(["世界观.md", "人物库.md", "章节摘要.md"].sort());

    // 真机实测：维护文档内容为 "# 标题\r\n"（测试书籍/世界观.md = 13 字节）
    const shijie = await fsp.readFile(path.join(p.root, "小说资料", "世界观.md"));
    expect(shijie.toString("utf8")).toBe("# 世界观\r\n");
    expect(shijie.length).toBe(13);

    const renwu = await fsp.readFile(path.join(p.root, "小说资料", "人物库.md"));
    expect(renwu.length).toBe(13);
    const zhaiyao = await fsp.readFile(path.join(p.root, "小说资料", "章节摘要.md"));
    expect(zhaiyao.length).toBe(16);

    expect((await fsp.readdir(path.join(p.root, "章节内容"))).length).toBe(0);

    const manifest = JSON.parse(
      await fsp.readFile(path.join(p.root, ".openwrite_manifest.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(manifest.version).toBe(1);
    expect(manifest.items).toEqual({});
    expect(manifest.orders).toEqual({});
    expect(manifest.manualOrderParents).toEqual([]);
  });

  it("同名作品拒绝重复创建", async () => {
    await expect(createProject(fs, booksRoot, "测试书籍")).rejects.toThrow(/已存在/);
  });

  it("书名含非法字符时拒绝", async () => {
    await expect(createProject(fs, booksRoot, "a/b")).rejects.toThrow(/不能包含/);
    await expect(createProject(fs, booksRoot, "   ")).rejects.toThrow(/不能为空/);
  });
});

describe("读取作品", () => {
  it("scanBooksRoot 跳过隐藏目录（回收站）", async () => {
    await createProject(fs, booksRoot, "第二本");
    await fsp.mkdir(path.join(booksRoot, ".openwrite_recycle"), { recursive: true });
    const list = await scanBooksRoot(fs, booksRoot);
    expect(list.map((p) => p.name).sort()).toEqual(["第二本", "测试书籍"].sort());
  });

  it("listDocs / listChapters 认 .md，且章节按章号排序", async () => {
    const root = path.join(booksRoot, "测试书籍");
    const chDir = path.join(root, "章节内容");
    await fsp.writeFile(path.join(chDir, "第10章.md"), "十\r\n", "utf8");
    await fsp.writeFile(path.join(chDir, "第2章.md"), "二\r\n", "utf8");
    await fsp.writeFile(path.join(chDir, "第1章.md"), "一\r\n", "utf8");
    await fsp.writeFile(path.join(chDir, "1.md"), "旧命名\r\n", "utf8");
    await fsp.writeFile(path.join(chDir, "笔记.txt"), "不是 md\r\n", "utf8");
    await fsp.writeFile(path.join(root, "小说资料", "写作禁忌.md"), "# 禁忌\r\n", "utf8");

    const chapters = await listChapters(fs, root);
    expect(chapters.map((c) => c.name)).toEqual(["第1章.md", "第2章.md", "第10章.md", "1.md"]);
    expect(chapters[0].rel).toBe("章节内容\\第1章.md");

    const docs = await listDocs(fs, root);
    expect(docs.map((d) => d.name).sort()).toEqual(["世界观.md", "人物库.md", "章节摘要.md", "写作禁忌.md"].sort());
  });

  it("loadProject 返回作品索引（用户自建文档平级列出，不做模板纠正）", async () => {
    const root = path.join(booksRoot, "测试书籍");
    const data = await loadProject(fs, root);
    expect(data.ref.name).toBe("测试书籍");
    expect(data.docs.map((d) => d.name)).toContain("写作禁忌.md");
    expect(data.chapters.length).toBe(4);
    expect(data.manifest.version).toBe(1);
  });
});

// —— 真机只读集成校验（目录不存在时自动跳过）——
const REAL_BOOKS = "C:\\Users\\Administrator\\AI写小说";
describe.skipIf(!existsSync(REAL_BOOKS))("真机作品目录（只读）", () => {
  it("能列出真实作品，并读到 小说资料 里的用户自建文档", async () => {
    const projects = await scanBooksRoot(fs, REAL_BOOKS);
    const names = projects.map((p) => p.name);
    expect(names).toContain("测试书籍");
    expect(names).toContain("和小熊同居后的日子");

    const xiong = projects.find((p) => p.name === "和小熊同居后的日子")!;
    const data = await loadProject(fs, xiong.root);
    const docNames = data.docs.map((d) => d.name);
    expect(docNames).toContain("世界观.md");
    expect(docNames).toContain("写作禁忌.md");
    expect(docNames).toContain("第八卷大纲.md");
    // 章节按章号排序，第10章 必须排在 第2章 之后
    const chNames = data.chapters.map((c) => c.name);
    expect(chNames.indexOf("第10章.md")).toBeGreaterThan(chNames.indexOf("第2章.md"));
    expect(chNames[0]).toBe("第1章.md");
  });
});
