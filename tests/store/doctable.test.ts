/** 资料表格视图（B7）的回归锁：解析正确性、节级回落、类型默认视图。 */
import { describe, expect, it } from "vitest";
import { defaultTableView, docTableFor } from "../../src/core/store/doctable";
import { DOC_TEMPLATES, TRACKER_MODULES, XIGANG_DOC_SAMPLE } from "../../src/core/store/templates";

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
    expect(grid && grid.kind === "grid" && grid.rows[0][0]).toContain("F001");
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
    expect(grid.rows[0]).toEqual(["第1-20章", "起步", "一段话。"]);
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
    expect(grid && grid.kind === "grid" && grid.rows[0][0]).toBe("滥用「不禁」");
    expect(grid && grid.kind === "grid" && grid.rows[0][1]).toBe("用户指定");
    expect(t.parts.some((p) => p.kind === "prose")).toBe(true);
  });

  it("节级回落：认不出的块按原文呈现并计数，不拖垮整页", () => {
    const t = docTableFor("追踪-时间线.md", "# 追踪-时间线\n\n## T001\n- 状态：开放\n\n## 随笔\n随手写的散文，没有字段。\n")!;
    expect(t.unparsedBlocks).toBe(1);
    expect(t.parts.some((p) => p.kind === "prose" && p.title === "随笔")).toBe(true);
    expect(t.parts.some((p) => p.kind === "grid")).toBe(true); // T001 照常进表
  });

  it("纯叙述文档（03-全书大纲）返回 null，界面不给切换按钮", () => {
    expect(docTableFor("03-全书大纲.md", "# 全书大纲\n几段话。\n")).toBeNull();
    expect(docTableFor("章节摘要.md", "# 章节摘要\n……\n")).toBeNull();
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
