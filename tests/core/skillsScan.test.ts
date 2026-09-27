/** 技能扫描回归锁：frontmatter 解析、内置判定、合并语义（首扫全开/更新保留开关） */
import { describe, expect, it } from "vitest";
import { mergeSkillList, parseFrontmatter, scanSkills, BUILTIN_SKILL_NAMES } from "../../src/core/skills/scan";
import type { FsBridge } from "../../src/core/fsbridge";
import type { SkillMeta } from "../../src/core/prefs";

const NOVEL_WRITER_SKILL = `---
name: novel-writer
description: 写小说时使用的技能。当用户要写小说、创作小说时自动触发。
---

# 小说写作助手
`;

const LANREN_SKILL = `---
name: 烂人风格
description: 《烂人》作品的写作风格
---
正文
`;

function memFs(dirs: Record<string, string>): FsBridge {
  return {
    async exists(p: string) {
      // 任意目录的 SKILL.md 由 dirs 提供；其余不存在
      return Object.keys(dirs).some((d) => p === `${d}\\SKILL.md`);
    },
    async readText(p: string) {
      for (const [d, content] of Object.entries(dirs)) {
        if (p === `${d}\\SKILL.md`) return content;
      }
      throw new Error("not found: " + p);
    },
    async list(root: string) {
      return Object.keys(dirs)
        .filter((d) => d.startsWith(root + "\\"))
        .map((d) => ({ name: d.slice(root.length + 1), path: d, isDir: true, size: 0, mtimeMs: 0 }));
    },
    async writeText() {},
    async mkdir() {},
    async delete() {},
    async rename() {},
  } as unknown as FsBridge;
}

describe("parseFrontmatter", () => {
  it("解析 name/description（真机 novel-writer 实测格式）", () => {
    const r = parseFrontmatter(NOVEL_WRITER_SKILL);
    expect(r.name).toBe("novel-writer");
    expect(r.description).toContain("写小说时使用的技能");
  });
  it("无 frontmatter → 空值（调用方跳过）", () => {
    expect(parseFrontmatter("# 无头\n正文").name).toBe("");
  });
});

describe("scanSkills", () => {
  it("扫描子目录生成 SkillMeta；isBuiltIn 按真机内置名单判定", async () => {
    const fs = memFs({
      "C:\\skills\\novel-writer": NOVEL_WRITER_SKILL,
      "C:\\skills\\烂人风格": LANREN_SKILL,
    });
    const list = await scanSkills(fs, "C:\\skills");
    expect(list).toHaveLength(2);
    const nw = list.find((s) => s.name === "novel-writer")!;
    expect(nw.isBuiltIn).toBe(true);
    expect(nw.id).toBe("novel-writer");
    expect(nw.marketplaceSkillId).toBeNull();
    const lr = list.find((s) => s.name === "烂人风格")!;
    expect(lr.isBuiltIn).toBe(false);
    expect(lr.directoryPath).toBe("C:\\skills\\烂人风格");
  });
  it("缺 SKILL.md 的目录跳过", async () => {
    const fs = memFs({ "C:\\skills\\empty": "# 无 SKILL.md 的目录" });
    expect(await scanSkills(fs, "C:\\skills")).toHaveLength(0);
  });
  it("内置名单就是真机设置页的 2 个", () => {
    expect([...BUILTIN_SKILL_NAMES].sort()).toEqual(["novel-writer", "skill-creator"]);
  });
});

describe("mergeSkillList", () => {
  const scanned: SkillMeta[] = [
    { id: "a", name: "a", description: "", directoryPath: "x", isBuiltIn: true, marketplaceSkillId: null, marketplaceVersion: null },
    { id: "b", name: "b", description: "", directoryPath: "y", isBuiltIn: false, marketplaceSkillId: null, marketplaceVersion: null },
  ];
  it("首次扫描（旧清单空）→ 默认全部开启", () => {
    const r = mergeSkillList([], scanned);
    expect(r.activeSkillIds).toEqual(["a", "b"]);
  });
  it("非首次 → 保留用户当前开关", () => {
    const prev = scanned.map((s) => ({ ...s }));
    const r = mergeSkillList(prev, scanned, ["a"]);
    expect(r.activeSkillIds).toEqual(["a"]);
    expect(r.skillList).toEqual(scanned);
  });
});
