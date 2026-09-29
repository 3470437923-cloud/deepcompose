/**
 * 回流任务装配：候选/正文两路语义（候选禁止回写事实；正文增量回写），
 * 审稿报告制（question 门），学习记录路径。
 *
 * 提示词里的 小说资料/个人改稿、06-写作规则.md、00-项目状态.md、待确认/、
 * 章节内容/ 均为磁盘契约名，断言即回归锁。
 */
import { describe, expect, it } from "vitest";
import { buildReflowPrompt, reflowSessionTitle } from "../../src/core/ai/reflow";
import { diffLines } from "../../src/core/store/oplog";

// 100→90：数字变化的典型样例（金额类事实，回流必须点名核对）
const diff = diffLines("他有100元。", "他有90元，转身走了。");

describe("buildReflowPrompt：候选稿路径", () => {
  const p = buildReflowPrompt({
    relPath: "待确认/第3章-v2-候选.md",
    kind: "candidate",
    chapterLabel: "第3章",
    diff,
  });

  it("带回流标记、章号与文件路径", () => {
    expect(p).toContain("【回流】");
    expect(p).toContain("第3章");
    expect(p).toContain("待确认/第3章-v2-候选.md");
  });

  it("候选稿：明令禁止把候选情节写入事实记录（阿序铁律）", () => {
    expect(p).toContain("禁止");
    expect(p).toMatch(/禁止\*\*?把候选情节写入/);
  });

  it("审稿报告制：不静默改写用户文字，动稿过 question", () => {
    expect(p).toContain("question");
    expect(p).toContain("未经确认不得改写用户文字");
  });

  it("学习记录写入 个人改稿/改稿对比-第N章.md，晋升需 question 确认", () => {
    expect(p).toContain("小说资料/个人改稿/改稿对比-第3章.md");
    expect(p).toContain("个人文风（学习沉淀）");
  });

  it("diff 摘要随任务下发（数字变化被点名）", () => {
    expect(diff.digitsChanged).toBe(true);
    expect(p).toContain("数字变化");
    expect(p).toContain("变更摘要");
    // diffSummaryText 的行前缀格式：- 删除行 / + 新增行
    expect(p).toContain("- 他有100元。");
    expect(p).toContain("+ 他有90元，转身走了。");
  });
});

describe("buildReflowPrompt：正式正文路径", () => {
  const p = buildReflowPrompt({
    relPath: "章节内容/第7章.md",
    kind: "chapter",
    chapterLabel: "第7章",
    diff,
  });

  it("正文：按变更增量回写追踪表与章节摘要，注明来源章节", () => {
    expect(p).toContain("已采用的正式正文");
    expect(p).toContain("增量更新");
    expect(p).toContain("注明来源章节");
  });

  it("正文路径不出现候选禁止条款", () => {
    expect(p).not.toContain("禁止**把候选情节写入");
  });

  it("冲突登记到 00-项目状态，不静默修改其他正文", () => {
    expect(p).toContain("尚未解决的冲突");
    expect(p).toContain("不静默修改其他正文");
  });

  it("章号未识别时如实标注", () => {
    // 不猜测章号：标签缺失时明说「章号未识别」，学习记录文件名同样如实
    const q = buildReflowPrompt({ relPath: "章节内容/终章.md", kind: "chapter", chapterLabel: null, diff });
    expect(q).toContain("章号未识别");
  });
});

describe("reflowSessionTitle", () => {
  it("标题含章号与稿件类型（会话列表可追溯）", () => {
    expect(reflowSessionTitle("第3章", "candidate")).toBe("回流 - 第3章（候选）");
    expect(reflowSessionTitle("第7章", "chapter")).toBe("回流 - 第7章（正文）");
    expect(reflowSessionTitle(null, "chapter")).toBe("回流 - 稿件（正文）");
  });
});
