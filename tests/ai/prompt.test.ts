/** 文风优先级声明：只在有依据文件时注入，且不触碰工具权限与安全约束。 */
import { describe, expect, it } from "vitest";
import { buildSystemPrompt, STYLE_PRIORITY_NOTE } from "../../src/core/ai/prompt";

const base = {
  basePrompt: "你是写作助手。",
  skills: [],
  activeSkillIds: [],
  enabledTools: ["file_read"],
};

describe("文风优先级声明", () => {
  it("绑定项目且有风格文件时注入，并点名依据文件", () => {
    const out = buildSystemPrompt({ ...base, projectRoot: "/book", hasStyleDoc: true });
    expect(out).toContain(STYLE_PRIORITY_NOTE.trim());
    expect(out).toContain("06-写作风格.md");
    expect(out).toContain("不改变工具权限");
  });

  it("没有风格文件或未绑定项目时不注入，避免指向不存在的依据", () => {
    expect(buildSystemPrompt({ ...base, projectRoot: "/book" })).not.toContain("文风优先级");
    expect(buildSystemPrompt({ ...base, projectRoot: null, hasStyleDoc: true })).not.toContain("文风优先级");
  });
});
