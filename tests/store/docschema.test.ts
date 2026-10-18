/**
 * 写入落点校验（B6 / D-043）的回归锁：
 * 结构违规硬拒、存量违规不背锅（变坏才拦）、软警告不阻断、范围只管受管文件。
 */
import { promises as fsp } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNodeFs } from "../support/nodeFs";
import { isManagedDocName, isValidatedDocPath, validateDocWrite } from "../../src/core/store/docschema";
import { executeTool, type ToolContext } from "../../src/core/tools/exec";
import { TRACKER_MODULES } from "../../src/core/store/templates";

describe("validateDocWrite：结构硬拒", () => {
  it("人物库写表格 → 拒收（『不能把世界观写进人物表』那类错位的执行层）", () => {
    const v = validateDocWrite("人物库.md", "# 人物库\n\n| 名 | 派系 |\n| 甲 | 乙 |\n", null);
    expect(v.ok).toBe(false);
    expect(v.message).toContain("写入被拦截");
  });

  it("00 缺必备头部字段 → 拒收，报错里带正确格式提示", () => {
    const v = validateDocWrite("00-项目状态.md", "# 项目状态\n随便写写\n", null);
    expect(v.ok).toBe(false);
    expect(v.message).toContain("当前阶段");
  });

  it("04-粗纲出现非弧段标题 → 拒收；纯弧段通过", () => {
    expect(validateDocWrite("04-粗纲.md", "# 粗纲\n\n## 杂记\n内容\n", null).ok).toBe(false);
    expect(validateDocWrite("04-粗纲.md", "# 粗纲\n\n## 第1-20章 起步\n一句话。\n", null).ok).toBe(true);
  });

  it("06-写作风格出现第三节 → 拒收（只有风格规则与禁用列表）", () => {
    expect(validateDocWrite("06-写作风格.md", "# 写作风格\n## 风格规则\nx\n## 禁用列表\n## 杂项\ny\n", null).ok).toBe(false);
    expect(validateDocWrite("06-写作风格.md", "# 写作风格\n## 风格规则\nx\n## 禁用列表\n- 禁止：滥用「不禁」\n", null).ok).toBe(true);
  });

  it("追踪表条目缺 - 状态： 字段 → 拒收；齐全通过", () => {
    const bad = "# 追踪-伏笔\n\n## F001\n- 内容与涉及对象：x\n";
    expect(validateDocWrite("追踪-伏笔.md", bad, null).ok).toBe(false);
    const good = "# 追踪-伏笔\n\n## 伏笔统计\n- 开放：1\n\n## F001\n- 状态：开放\n";
    expect(validateDocWrite("追踪-伏笔.md", good, null).ok).toBe(true);
  });

  it("细纲缺 - 状态： 头部字段 → 拒收", () => {
    expect(validateDocWrite("第41-43章细纲.md", "# 第41-43章细纲\n\n## 第41章\n承接与目标：x\n", null).ok).toBe(false);
    expect(
      validateDocWrite("第41-43章细纲.md", "# 第41-43章细纲\n- 状态：进行中\n\n## 第41章\n承接与目标：x\n", null).ok,
    ).toBe(true);
  });

  it("规则台账 GL 条目缺字段 → 拒收", () => {
    const bad = "# 规则台账\n\n## GL-001\n- 规则：x\n";
    expect(validateDocWrite("规则台账.md", bad, null).ok).toBe(false);
  });
});

describe("validateDocWrite：变坏才拦（存量不背锅）", () => {
  it("存量已有表格 → 本次不含新表格只给警告不拒收", () => {
    const prev = "# 03-全书大纲\n\n| a | b |\n";
    const v = validateDocWrite("03-全书大纲.md", prev + "新增一段。\n", prev);
    expect(v.ok).toBe(true);
    expect(v.warnings.some((w) => w.includes("存量"))).toBe(true);
  });

  it("新增 emoji → 拒收；存量 emoji 不动 → 不拒", () => {
    const prev = "# 人物库\n\n## 甲\n他很沉默。✅\n";
    const next = prev + "\n## 乙\n她来了。\n";
    expect(validateDocWrite("人物库.md", next, prev).ok).toBe(true);
    const worse = next + "🎉\n";
    expect(validateDocWrite("人物库.md", worse, prev).ok).toBe(false);
  });

  it("语义错位（人物库写世界观条目）→ 软警告不阻断", () => {
    const v = validateDocWrite("人物库.md", "# 人物库\n\n## 世界观\n大陆体系……\n", null);
    expect(v.ok).toBe(true);
    expect(v.warnings.some((w) => w.includes("不像人物名"))).toBe(true);
  });

  it("00 里的过程记录 → 软警告（该去 审核/）", () => {
    const content = "# 项目状态\n- 当前阶段：连续写作\n- 当前章节：第2章\n- 正文处理进度：起草中\n- 下一步：写\n\n导入说明：本次由源文件重建。\n";
    const v = validateDocWrite("00-项目状态.md", content, null);
    expect(v.ok).toBe(true);
    expect(v.warnings.some((w) => w.includes("过程性记录"))).toBe(true);
  });
});

describe("追踪表：模板字段与存量条目", () => {
  it.each(TRACKER_MODULES)("内置 $key 模板可直接写入，不补造状态字段", ({ template }) => {
    expect(validateDocWrite(template.name, template.content, null)).toEqual({ ok: true, warnings: [] });
  });

  it("统计标题带说明时仍不是伏笔条目；新增伏笔仍须有状态", () => {
    const header = "# 追踪-伏笔\n## 伏笔统计（自述口径）\n- 开放：1\n";
    expect(validateDocWrite("追踪-伏笔.md", header + "## F001\n- 状态：开放\n", null).ok).toBe(true);
    expect(validateDocWrite("追踪-伏笔.md", header + "## F001\n- 内容与涉及对象：线索\n", null).ok).toBe(false);
  });

  it.each(["追踪-伏笔.md", "追踪-时间线.md", "追踪-资源与权限.md"])("%s 存量缺状态可继续编辑，新条目与删状态仍拦", (name) => {
    const previous = "# 追踪\n## A001\n- 内容：旧条目\n## A002\n- 状态：开放\n";
    const edited = previous.replace("旧条目", "更新后的旧条目");
    const verdict = validateDocWrite(name, edited, previous);
    expect(verdict.ok).toBe(true);
    expect(verdict.warnings.some((w) => w.includes("存量"))).toBe(true);
    const added = validateDocWrite(name, edited + "## A003\n- 内容：新增缺状态\n", previous);
    expect(added.ok).toBe(false);
    expect(added.message).toContain("A003");
    expect(validateDocWrite(name, edited.replace("- 状态：开放\n", "- 内容：删了状态\n"), previous).ok).toBe(false);
    expect(validateDocWrite(name, edited.replace("## A001", "## A003"), previous).ok).toBe(false);
    expect(validateDocWrite(name, edited + "## A003\n- 状态：开放\n", previous).ok).toBe(true);
  });

  it.each(["追踪-角色状态.md", "追踪-废弃设定.md"])("%s 新条目沿用模板字段而不要求通用状态，装饰禁令仍在", (name) => {
    const template = TRACKER_MODULES.find((m) => m.template.name === name)!.template.content;
    const next = template + "\n## 新条目\n- 来源及最近更新章节：第2章\n";
    expect(validateDocWrite(name, next, template)).toEqual({ ok: true, warnings: [] });
    expect(validateDocWrite(name, next + "🎉\n", template).ok).toBe(false);
  });
});

describe("isValidatedDocPath：范围", () => {
  it("只查 小说资料/ 下的受管文件；正文、审核、不认识的名不查", () => {
    expect(isValidatedDocPath("小说资料\\人物库.md")).toBe(true);
    expect(isValidatedDocPath("小说资料\\细纲\\第41-43章细纲.md")).toBe(true);
    expect(isValidatedDocPath("小说资料\\个人改稿\\规则台账.md")).toBe(true);
    expect(isValidatedDocPath("小说资料\\审核\\报告.md")).toBe(false);
    expect(isValidatedDocPath("章节内容\\第1章.md")).toBe(false);
    expect(isValidatedDocPath("小说资料\\世界观.md")).toBe(false); // 用户自建文档不设防
  });

  it("旧结构文件名也进门（为了拦「新建旧名」）", () => {
    expect(isValidatedDocPath("小说资料\\04-分卷大纲.md")).toBe(true);
    expect(isValidatedDocPath("小说资料\\06-写作规则.md")).toBe(true);
    expect(isValidatedDocPath("小说资料\\章节摘要.md")).toBe(true);
  });
});

describe("isManagedDocName：受管名判定（D-056 树内操作警告用）", () => {
  it("核心件 / 追踪表 / 细纲 / 规则台账 / 旧结构名都算受管", () => {
    for (const n of [
      "00-项目状态.md", "01-开书定位.md", "02-核心设定.md", "03-全书大纲.md",
      "04-粗纲.md", "06-写作风格.md", "人物库.md",
      "追踪-伏笔.md", "追踪-角色状态.md",
      "第41-43章细纲.md", "第1-3章细纲（已完成）.md", "规则台账.md",
      "04-分卷大纲.md", "05-滚动细纲.md", "06-写作规则.md", "章节摘要.md",
    ]) {
      expect(isManagedDocName(n)).toBe(true);
    }
  });
  it("用户自建的附加文档不受管（自由操作，无警告）", () => {
    expect(isManagedDocName("世界观.md")).toBe(false);
    expect(isManagedDocName("灵感碎片.md")).toBe(false);
  });
});

describe("旧结构文件名：禁止新建，存量放行（「以后只能是硬格式」）", () => {
  it("新建 04-分卷大纲.md → 硬拒并指向 04-粗纲.md", () => {
    const v = validateDocWrite("04-分卷大纲.md", "# 分卷大纲\n\n## 第一卷\n目标。\n", null);
    expect(v.ok).toBe(false);
    expect(v.message).toContain("04-粗纲");
  });

  it("新建 06-写作规则.md / 05-滚动细纲.md / 章节摘要.md → 硬拒", () => {
    expect(validateDocWrite("06-写作规则.md", "# 写作规则\n", null).ok).toBe(false);
    expect(validateDocWrite("05-滚动细纲.md", "# 滚动细纲\n", null).ok).toBe(false);
    expect(validateDocWrite("章节摘要.md", "# 章节摘要\n", null).ok).toBe(false);
  });

  it("编辑已存在的旧文件 → 放行（存量不背锅，老作品迁移前照常工作）", () => {
    const prev = "# 分卷大纲\n\n## 第一卷\n目标。\n";
    const v = validateDocWrite("04-分卷大纲.md", prev + "补一句。\n", prev);
    expect(v.ok).toBe(true);
  });
});

describe("file_write 接线（工具层）", () => {
  let booksRoot: string;
  let root: string;
  const fs = createNodeFs();
  const ctx = (): ToolContext => ({
    fs,
    booksRoot,
    snapshotsDir: path.join(booksRoot, "snap"),
    sessionId: "sess-1",
    roots: { projectRoot: root, skillsDir: path.join(booksRoot, "skills"), booksRoot },
  });

  beforeAll(async () => {
    booksRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "deepcompose-docschema-"));
    root = path.join(booksRoot, "书");
    await fsp.mkdir(path.join(root, "小说资料"), { recursive: true });
    await fsp.writeFile(
      path.join(root, "小说资料", "人物库.md"),
      "# 人物库\r\n\r\n## 甲\r\n他很沉默。\r\n",
      "utf8",
    );
  });
  afterAll(async () => {
    if (booksRoot) await fsp.rm(booksRoot, { recursive: true, force: true });
  });

  it("往人物库写表格 → error 且文件原样未动", async () => {
    const before = await fsp.readFile(path.join(root, "小说资料", "人物库.md"), "utf8");
    const r = JSON.parse(
      await executeTool(ctx(), "file_write", {
        operation: "append",
        path: "小说资料/人物库.md",
        content: "\n| 名 | 派系 |\n| 乙 | 丙 |\n",
      }),
    ) as Record<string, unknown>;
    expect(typeof r.error).toBe("string");
    expect(String(r.error)).toContain("落点校验");
    expect(await fsp.readFile(path.join(root, "小说资料", "人物库.md"), "utf8")).toBe(before);
  });

  it("合规追加通过；警告字段随结果下发", async () => {
    const r = JSON.parse(
      await executeTool(ctx(), "file_write", {
        operation: "append",
        path: "小说资料/人物库.md",
        content: "\n## 乙\n她做事很急。\n",
      }),
    ) as Record<string, unknown>;
    expect(r.success).toBe(true);
    expect(r.warnings).toBeUndefined(); // 没有警告就没有这个字段
    const text = await fsp.readFile(path.join(root, "小说资料", "人物库.md"), "utf8");
    expect(text).toContain("## 乙");
  });

  it("write 已有追踪文档沿用存量豁免与 CRLF，新缺状态条目拒收且原文不动", async () => {
    const file = path.join(root, "小说资料", "追踪-时间线.md");
    const previous = "# 追踪-时间线\r\n\r\n## T001\r\n- 时间、地点与事件：原事件\r\n";
    await fsp.writeFile(file, previous, "utf8");
    const next = previous.replace("原事件", "补充后的事件");
    const result = JSON.parse(await executeTool(ctx(), "file_write", {
      operation: "write", path: "小说资料/追踪-时间线.md", content: next,
    }));
    expect(result.success).toBe(true);
    expect(result.warnings.some((w: string) => w.includes("存量"))).toBe(true);
    expect(await fsp.readFile(file, "utf8")).toBe(next);

    const rejected = JSON.parse(await executeTool(ctx(), "file_write", {
      operation: "write", path: "小说资料/追踪-时间线.md",
      content: next + "\r\n## T002\r\n- 时间、地点与事件：新事件\r\n",
    }));
    expect(String(rejected.error)).toContain("落点校验");
    expect(await fsp.readFile(file, "utf8")).toBe(next);
  });

  it("正文与审核区不受落点校验限制", async () => {
    const r = JSON.parse(
      await executeTool(ctx(), "file_write", {
        operation: "write",
        path: "小说资料/审核/自由记录.md",
        content: "# 报告\n\n| 这里可以有表格 |\n",
      }),
    ) as Record<string, unknown>;
    expect(r.success).toBe(true);
  });
});
