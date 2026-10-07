/**
 * 资料表格视图（B7）的回归锁：解析正确性、节级回落、类型默认视图。
 * 2026-10-06 全覆盖改造新增：通用回落（任何文档都有视图）、CellAddr 落点、
 * applyCellEdit / applyRangeDelete / applyInsertBlock 的行级手术往返。
 */
import { describe, expect, it } from "vitest";
import {
  applyCellEdit,
  applyInsertBlock,
  applyRangeDelete,
  defaultTableView,
  docTableFor,
  type CellAddr,
} from "../../src/core/store/doctable";
import { DOC_TEMPLATES, TRACKER_MODULES, XIGANG_DOC_SAMPLE } from "../../src/core/store/templates";

/** 取第一个 grid 部分（类型收窄小帮手） */
function gridOf(t: ReturnType<typeof docTableFor>) {
  const g = t.parts.find((p) => p.kind === "grid");
  if (!g || g.kind !== "grid") throw new Error("no grid part");
  return g;
}

describe("docTableFor：各文档的表格化", () => {
  it("00-项目状态：头部字段与固定节都成 kv", () => {
    const t = docTableFor("00-项目状态.md", DOC_TEMPLATES.find((x) => x.name === "00-项目状态.md")!.content)!;
    const kv = t.parts.filter((p) => p.kind === "kv");
    expect(kv.length).toBeGreaterThanOrEqual(2); // 头部 + 各节
    const header = kv[0];
    if (header.kind !== "kv") throw new Error("unexpected");
    expect(header.rows.some((r) => r.label === "启用模块")).toBe(true);
  });

  it("追踪-伏笔：统计块成 kv、条目成 grid、状态列在", () => {
    const tpl = TRACKER_MODULES.find((m) => m.key === "伏笔")!.template;
    const t = docTableFor("追踪-伏笔.md", tpl.content)!;
    const kv = t.parts.find((p) => p.kind === "kv");
    expect(kv && kv.kind === "kv" && kv.title?.startsWith("伏笔统计")).toBe(true);
    const grid = t.parts.find((p) => p.kind === "grid");
    expect(grid && grid.kind === "grid" && grid.columns).toContain("状态");
    expect(grid && grid.kind === "grid" && grid.rows[0].cells[0]).toContain("F001");
  });

  it("人物库：每人一块 kv 卡；说明段以 prose 呈现", () => {
    const tpl = DOC_TEMPLATES.find((x) => x.name === "人物库.md")!;
    const t = docTableFor("人物库.md", tpl.content)!;
    const kv = t.parts.find((p) => p.kind === "kv" && p.title?.includes("人物名"));
    expect(kv).toBeTruthy();
    expect(t.parts.some((p) => p.kind === "prose")).toBe(true);
  });

  it("04-粗纲：弧段标题拆出范围与卷名", () => {
    const t = docTableFor("04-粗纲.md", "# 粗纲\n\n## 第1-20章 起步\n一段话。\n")!;
    const grid = t.parts[0];
    if (grid.kind !== "grid") throw new Error("unexpected");
    expect(grid.rows[0].cells).toEqual(["第1-20章", "起步", "一段话。"]);
  });

  it("细纲：头部字段 kv + 每章一行 grid", () => {
    const t = docTableFor("第1-3章细纲.md", XIGANG_DOC_SAMPLE)!;
    expect(t.parts.some((p) => p.kind === "kv")).toBe(true);
    const grid = t.parts.find((p) => p.kind === "grid");
    expect(grid && grid.kind === "grid" && grid.columns).toEqual(["章", "承接与目标", "主要场面", "依据与约束", "变化与章尾"]);
  });

  it("06-写作风格：禁用列表成行，规则节保持散文", () => {
    const t = docTableFor("06-写作风格.md", "# 写作风格\n## 风格规则\n第一人称。\n\n## 禁用列表\n- 禁止：滥用「不禁」（来源：用户指定）\n")!;
    const grid = t.parts.find((p) => p.kind === "grid");
    expect(grid && grid.kind === "grid" && grid.rows[0].cells[0]).toBe("滥用「不禁」");
    expect(grid && grid.kind === "grid" && grid.rows[0].cells[1]).toBe("用户指定");
    expect(t.parts.some((p) => p.kind === "prose")).toBe(true);
  });

  it("节级回落：认不出的块按原文呈现并计数，不拖垮整页", () => {
    const t = docTableFor("追踪-时间线.md", "# 追踪-时间线\n\n## T001\n- 状态：开放\n\n## 随笔\n随手写的散文，没有字段。\n")!;
    expect(t.unparsedBlocks).toBe(1);
    expect(t.parts.some((p) => p.kind === "prose" && p.title === "随笔")).toBe(true);
    expect(t.parts.some((p) => p.kind === "grid")).toBe(true); // T001 照常进表
  });
});

describe("docTableFor：全覆盖（任何文档都有视图，不再返回 null）", () => {
  it("纯叙述文档（03-全书大纲）走通用回落：散文卡", () => {
    const t = docTableFor("03-全书大纲.md", "# 全书大纲\n几段话。\n");
    expect(t.parts.length).toBeGreaterThan(0);
  });

  it("旧结构文件（章节摘要/04-分卷大纲）也有视图", () => {
    expect(docTableFor("章节摘要.md", "# 章节摘要\n- 第一章：捡贝壳。\n").parts.length).toBeGreaterThan(0);
    expect(docTableFor("04-分卷大纲.md", "# 分卷大纲\n\n## 第一卷\n目标。\n").parts.length).toBeGreaterThan(0);
  });

  it("用户自建文档：头部字段成 kv、散文节成卡", () => {
    const t = docTableFor("世界观.md", "# 世界观\n- 时代：架空\n\n## 地理\n南边有海。\n");
    const kv = t.parts.find((p) => p.kind === "kv");
    expect(kv && kv.kind === "kv" && kv.rows.some((r) => r.label === "时代" && r.value === "架空")).toBe(true);
    expect(t.parts.some((p) => p.kind === "prose" && p.title === "地理")).toBe(true);
  });
});

describe("CellAddr 落点：解析出的地址指向原文正确位置", () => {
  it("kv 行的 addr 命中「- 键：值」行，valueCol 之后就是值", () => {
    const text = "# 项目状态\n- 当前阶段：连续写作\n- 当前章节：第5章\n\n## 约定\n约定内容。\n";
    const t = docTableFor("00-项目状态.md", text);
    const kv = t.parts[0];
    if (kv.kind !== "kv") throw new Error("unexpected");
    const row = kv.rows.find((r) => r.label === "当前章节")!;
    const lines = text.split("\n");
    const addr = row.addr!;
    expect(lines[addr.startLine].slice(addr.valueCol!)).toBe("第5章");
  });

  it("追踪表条目格子的 addr 命中字段行；首列（条目名）命中 ## 标题行", () => {
    const text = "# 追踪-伏笔\n\n## F001\n- 内容与涉及对象：贝壳\n- 状态：开放\n";
    const g = gridOf(docTableFor("追踪-伏笔.md", text));
    const row = g.rows[0];
    const lines = text.split("\n");
    const titleAddr = row.addrs[0]!;
    expect(lines[titleAddr.startLine]).toContain("F001");
    const statusAddr = row.addrs[5]!; // columns: 条目/内容与涉及对象/首次出现/当前进展/预计回收/状态/来源
    expect(lines[statusAddr.startLine].slice(statusAddr.valueCol!)).toBe("开放");
    // 整块区间：从 ## 行起到块尾
    expect(row.block!.startLine).toBe(titleAddr.startLine);
  });
});

describe("行级手术：applyCellEdit / applyRangeDelete / applyInsertBlock", () => {
  it("单行值编辑：只动值，前缀与 CRLF 逐字节保留", () => {
    const text = "# 项目状态\r\n- 当前章节：第5章\r\n- 下一步：写\r\n";
    const addr: CellAddr = { startLine: 1, endLine: 2, valueCol: "- 当前章节：".length };
    const out = applyCellEdit(text, addr, "第6章");
    expect(out).toBe("# 项目状态\r\n- 当前章节：第6章\r\n- 下一步：写\r\n");
  });

  it("区间替换（散文块）：区间外字节不变", () => {
    const text = "# 粗纲\n\n## 第1-20章 起步\n旧内容。\n\n## 第21-40章 发展\n别动我。\n";
    const addr: CellAddr = { startLine: 3, endLine: 4, valueCol: null };
    const out = applyCellEdit(text, addr, "新内容。\n两行。");
    expect(out).toContain("新内容。\n两行。");
    expect(out).toContain("## 第21-40章 发展\n别动我。");
    expect(out.startsWith("# 粗纲\n\n## 第1-20章 起步\n")).toBe(true);
  });

  it("落点漂移（行数对不上）：原样返回，不乱写", () => {
    const text = "a\nb\n";
    const out = applyCellEdit(text, { startLine: 9, endLine: 10, valueCol: null }, "x");
    expect(out).toBe(text);
  });

  it("删条目块：整段消失，其余不变", () => {
    const text = "# 追踪-伏笔\n\n## F001\n- 状态：开放\n\n## F002\n- 状态：废弃\n";
    const out = applyRangeDelete(text, { startLine: 2, endLine: 4 });
    expect(out).not.toContain("F001");
    expect(out).toContain("## F002\n- 状态：废弃");
  });

  it("加条目块：插在末尾，与前文分行", () => {
    const text = "# 追踪-伏笔\n\n## F001\n- 状态：开放\n";
    const out = applyInsertBlock(text, 4, "\n## F002\n- 状态：待填写");
    expect(out).toContain("## F002");
    expect(out.indexOf("F001")).toBeLessThan(out.indexOf("F002"));
    // 手术往返：重新解析能看到新条目
    const g = gridOf(docTableFor("追踪-伏笔.md", out));
    expect(g.rows.map((r) => r.cells[0])).toEqual(["F001", "F002"]);
  });

  it("往返锁：解析 → 定位 → 替换 → 重解析，值已变、结构不变", () => {
    const text = "# 追踪-伏笔\r\n\r\n## F001\r\n- 内容与涉及对象：贝壳\r\n- 状态：开放\r\n";
    const g1 = gridOf(docTableFor("追踪-伏笔.md", text));
    const addr = g1.rows[0].addrs[5]!; // 状态格
    const out = applyCellEdit(text, addr, "已回收");
    expect(out).toContain("\r\n"); // CRLF 保持
    const g2 = gridOf(docTableFor("追踪-伏笔.md", out));
    expect(g2.rows[0].cells[5]).toBe("已回收");
    expect(g2.rows[0].cells[1]).toBe("贝壳");
  });
});

describe("defaultTableView（类型默认）", () => {
  it("追踪类/台账/粗纲/细纲/00 默认表格；人物库与 01/02 默认原文", () => {
    expect(defaultTableView("追踪-伏笔.md")).toBe(true);
    expect(defaultTableView("规则台账.md")).toBe(true);
    expect(defaultTableView("04-粗纲.md")).toBe(true);
    expect(defaultTableView("第1-3章细纲.md")).toBe(true);
    expect(defaultTableView("00-项目状态.md")).toBe(true);
    expect(defaultTableView("人物库.md")).toBe(false);
    expect(defaultTableView("01-开书定位.md")).toBe(false);
  });
});
