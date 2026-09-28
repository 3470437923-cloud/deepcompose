/**
 * 作品目录协议：与既有布局逐项对齐，并做一次既有目录只读集成校验。
 */
import { existsSync } from "node:fs";
import { promises as fsp } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNodeFs } from "../support/nodeFs";
import {
  buildContentTree,
  chapterLabelOf,
  createProject,
  kindForRel,
  listChapters,
  listDocs,
  listPending,
  listProcessed,
  loadProject,
  scanBooksRoot,
} from "../../src/core/store/project";
import { DOC_TEMPLATES, renderTemplate } from "../../src/core/store/templates";
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

describe("新建作品：3.0 布局（14 件套 + 待确认）", () => {
  it("生成 小说资料(14模板) + 章节内容 + 待确认 + .openwrite_manifest.json", async () => {
    const p = await createProject(fs, booksRoot, "测试书籍");
    const entries = await fsp.readdir(p.root);
    expect(entries.sort()).toEqual(
      ["小说资料", "章节内容", "待确认", ".openwrite_manifest.json"].sort(),
    );

    const docEntries = (await fsp.readdir(path.join(p.root, "小说资料"))).sort();
    expect(docEntries).toEqual(DOC_TEMPLATES.map((t) => t.name).sort());
    expect(DOC_TEMPLATES.length).toBe(14);

    // 模板占位替换 + CRLF 落盘
    const state = await fsp.readFile(path.join(p.root, "小说资料", "00-项目状态.md"), "utf8");
    expect(state).toContain("项目名称：测试书籍");
    expect(state).not.toContain("{书名}");
    expect(state).toContain("\r\n");
    expect(state.includes("\n") && !state.match(/(?<!\r)\n/)).toBe(true); // 全部 \n 都带 \r

    // 世界观.md 已更名为核心设定
    expect(docEntries).toContain("02-核心设定.md");
    expect(docEntries).not.toContain("世界观.md");

    expect((await fsp.readdir(path.join(p.root, "章节内容"))).length).toBe(0);
    expect((await fsp.readdir(path.join(p.root, "待确认"))).length).toBe(0);
    // 审核/个人改稿/已处理 按首次使用创建，不预建
    expect(await fs.exists(path.join(p.root, "小说资料", "审核"))).toBe(false);
    expect(await fs.exists(path.join(p.root, "待确认", "已处理"))).toBe(false);

    const manifest = JSON.parse(
      await fsp.readFile(path.join(p.root, ".openwrite_manifest.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(manifest.version).toBe(1);
    expect(manifest.items).toEqual({});
    expect(manifest.orders).toEqual({});
    expect(manifest.manualOrderParents).toEqual([]);
  });

  it("renderTemplate 替换书名并统一 CRLF", () => {
    const out = renderTemplate("# {书名}\n第二行\n", "书名A");
    expect(out).toBe("# 书名A\r\n第二行\r\n");
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
    expect(docs.map((d) => d.name)).toContain("写作禁忌.md");
    expect(docs.length).toBe(DOC_TEMPLATES.length + 1); // 14 模板 + 用户自建
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

describe("候选区与通用内容树", () => {
  const root = () => path.join(booksRoot, "测试书籍");

  it("listPending / listProcessed 按章号排序，已处理不计入待确认", async () => {
    const r = root();
    const pend = path.join(r, "待确认");
    await fsp.writeFile(path.join(pend, "第10章-v2-候选.md"), "十候\r\n", "utf8");
    await fsp.writeFile(path.join(pend, "第2章-v1-初稿.md"), "二初\r\n", "utf8");
    await fsp.writeFile(path.join(pend, "第2章-v2-候选.md"), "二候\r\n", "utf8");
    await fsp.mkdir(path.join(pend, "已处理"), { recursive: true });
    await fsp.writeFile(path.join(pend, "已处理", "第1章-v2-候选.md"), "旧候\r\n", "utf8");

    const pending = await listPending(fs, r);
    expect(pending.map((p) => p.name)).toEqual(["第2章-v1-初稿.md", "第2章-v2-候选.md", "第10章-v2-候选.md"]);
    expect(pending[0].rel).toBe("待确认\\第2章-v1-初稿.md");

    const processed = await listProcessed(fs, r);
    expect(processed.map((p) => p.name)).toEqual(["第1章-v2-候选.md"]);
    expect(processed[0].rel).toBe("待确认\\已处理\\第1章-v2-候选.md");
  });

  it("buildContentTree：系统条目排除、目录在前、已知目录固定次序", async () => {
    const r = root();
    // 系统级条目（左栏不得出现）
    await fsp.mkdir(path.join(r, "writerd_oplog"), { recursive: true });
    await fsp.writeFile(path.join(r, "writerd_oplog", "log.jsonl"), "{}\n", "utf8");
    await fsp.mkdir(path.join(r, ".openwrite_recycle"), { recursive: true });
    await fsp.writeFile(path.join(r, "recycle_manifest.json"), "{}", "utf8");
    // 小说资料 子目录
    await fsp.mkdir(path.join(r, "小说资料", "审核"), { recursive: true });
    await fsp.writeFile(path.join(r, "小说资料", "审核", "第2章-冷读-clarity-20260101-1200.md"), "# 报告\r\n", "utf8");

    const tree = await buildContentTree(fs, r);
    const topNames = tree.map((n) => n.name);
    expect(topNames).not.toContain("writerd_oplog");
    expect(topNames).not.toContain(".openwrite_recycle");
    expect(topNames).not.toContain("recycle_manifest.json");
    expect(topNames).not.toContain(".openwrite_manifest.json");
    // 目录在前 + 固定次序：小说资料 < 章节内容 < 待确认
    expect(topNames.slice(0, 3)).toEqual(["小说资料", "章节内容", "待确认"]);

    const docs = tree.find((n) => n.name === "小说资料")!;
    const docsDirs = docs.children.filter((c) => c.isDir).map((c) => c.name);
    expect(docsDirs).toEqual(["审核"]); // 目录排在文件前
    const review = docs.children.find((c) => c.name === "审核")!;
    expect(review.children.map((c) => c.name)).toEqual(["第2章-冷读-clarity-20260101-1200.md"]);

    const pend = tree.find((n) => n.name === "待确认")!;
    const pendFiles = pend.children.filter((c) => !c.isDir).map((c) => c.name);
    expect(pendFiles).toEqual(["第2章-v1-初稿.md", "第2章-v2-候选.md", "第10章-v2-候选.md"]);
    const processedNode = pend.children.find((c) => c.isDir)!;
    expect(processedNode.name).toBe("已处理");
    expect(processedNode.rel).toBe("待确认\\已处理");

    // loadProject 同时给出 tree 与 pending
    const data = await loadProject(fs, r);
    expect(data.tree.length).toBeGreaterThan(0);
    expect(data.pending.length).toBe(3);
    expect(data.processed.length).toBe(1);
  });

  it("kindForRel 按路径判类；chapterLabelOf 提取章号标签", () => {
    expect(kindForRel("章节内容\\第3章.md")).toBe("chapter");
    expect(kindForRel("待确认/第3章-v2-候选.md")).toBe("candidate");
    expect(kindForRel("待确认\\已处理\\第1章-v1-初稿.md")).toBe("candidate");
    expect(kindForRel("小说资料\\00-项目状态.md")).toBe("doc");
    expect(kindForRel("笔记.md")).toBe("doc");

    expect(chapterLabelOf("第3章-v2-候选.md")).toBe("第3章");
    expect(chapterLabelOf("第十二章 启程.md")).toBe("第十二章");
    expect(chapterLabelOf("随便一个名字.md")).toBeNull();
  });
});

// —— 既有目录只读集成校验（目录不存在时自动跳过）——
const REAL_BOOKS = "C:\\Users\\Administrator\\AI写小说";
describe.skipIf(!existsSync(REAL_BOOKS))("既有作品目录（只读）", () => {
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
