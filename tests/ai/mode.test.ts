/** AI 三态模式（2026-10-06 用户裁决）：tools 过滤与 exec 执行层门槛的回归锁。 */
import { describe, expect, it } from "vitest";
import { DEFAULT_AI_MODE, MODE_READONLY_TEXT, MODE_WRITING_TEXT, modeGate, toolsForMode } from "../../src/core/ai/mode";

describe("toolsForMode：发给模型的工具清单", () => {
  it("开发模式 = 全量（现状）；只读/写作都不发 create_project", () => {
    const dev = toolsForMode("dev");
    expect(dev.some((t) => t.name === "create_project")).toBe(true);
    for (const m of ["readonly", "writing"] as const) {
      const tools = toolsForMode(m);
      expect(tools.some((t) => t.name === "create_project")).toBe(false);
      // 读与提问、技能查找三种形态都在（只读模式的本职）
      expect(tools.some((t) => t.name === "file_read")).toBe(true);
      expect(tools.some((t) => t.name === "question")).toBe(true);
      expect(tools.some((t) => t.name === "skill_lookup")).toBe(true);
    }
  });

  it("默认模式是开发（用户裁决：默认完全权限）", () => {
    expect(DEFAULT_AI_MODE).toBe("dev");
  });
});

describe("modeGate：执行层路径门槛", () => {
  it("开发模式全放行", () => {
    expect(modeGate("dev", "write", "小说资料\\人物库.md")).toBeNull();
    expect(modeGate("dev", "create", null)).toBeNull();
  });

  it("只读模式：一切写入与建仓都拦", () => {
    expect(modeGate("readonly", "write", "章节内容\\第1章.md")).toBe(MODE_READONLY_TEXT);
    expect(modeGate("readonly", "write", "小说资料\\人物库.md")).toBe(MODE_READONLY_TEXT);
    expect(modeGate("readonly", "create", null)).not.toBeNull();
  });

  it("写作模式：正文与候选放行，资料与其它位置拦", () => {
    expect(modeGate("writing", "write", "章节内容\\第1章.md")).toBeNull();
    expect(modeGate("writing", "write", "待确认\\第2章-候选.md")).toBeNull();
    expect(modeGate("writing", "write", "小说资料\\人物库.md")).toBe(MODE_WRITING_TEXT);
    expect(modeGate("writing", "write", null)).toBe(MODE_WRITING_TEXT); // 项目外（如技能根）
    expect(modeGate("writing", "create", null)).not.toBeNull();
  });

  it("写作模式不认伪装前缀（章节内容X 不是 章节内容\\）", () => {
    expect(modeGate("writing", "write", "章节内容X\\第1章.md")).toBe(MODE_WRITING_TEXT);
  });
});
