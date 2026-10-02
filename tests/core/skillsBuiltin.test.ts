/** A-8 回归锁：内置技能资产的发布链路（内联资产 → 技能根；只补缺失，不覆盖用户副本） */
import { describe, expect, it } from "vitest";
import { BUILTIN_SKILL_FILES, releaseBuiltinSkills } from "../../src/core/skills/builtin";
import { BUILTIN_SKILL_NAMES } from "../../src/core/skills/scan";
import type { FsBridge } from "../../src/core/fsbridge";

/** 记录写入的内存替身：exists 由 files 决定，writeText 落进 files 并留痕 */
function memFs(files: Record<string, string> = {}) {
  const writes: { path: string; content: string }[] = [];
  const fs = {
    async exists(p: string) {
      return p in files;
    },
    async writeText(p: string, content: string) {
      files[p] = content;
      writes.push({ path: p, content });
    },
  } as unknown as FsBridge;
  return { fs, files, writes };
}

describe("内置技能资产", () => {
  it("随包资产非空，且每个技能的 SKILL.md 都在（A-8：不再是死资产）", () => {
    const rels = Object.keys(BUILTIN_SKILL_FILES);
    expect(rels.length).toBeGreaterThan(0);
    for (const name of BUILTIN_SKILL_NAMES) {
      expect(rels).toContain(`${name}/SKILL.md`);
      expect(BUILTIN_SKILL_FILES[`${name}/SKILL.md`].length).toBeGreaterThan(0);
    }
  });

  it("资产目录集合 = 内置名单（新增随包技能忘了登记会被这条挡住）", () => {
    const dirs = [...new Set(Object.keys(BUILTIN_SKILL_FILES).map((r) => r.split("/")[0]))].sort();
    expect(dirs).toEqual([...BUILTIN_SKILL_NAMES].sort());
  });

  it("token-optimizer 的 scripts 一并随包（脚本要能被执行）", () => {
    expect(BUILTIN_SKILL_FILES["token-optimizer/scripts/token_audit.py"]).toBeTruthy();
    expect(BUILTIN_SKILL_FILES["token-optimizer/scripts/cache_check.py"]).toBeTruthy();
  });

  it("不把 __pycache__/.pyc 当资产（本机编译产物不该随包）", () => {
    expect(Object.keys(BUILTIN_SKILL_FILES).some((r) => r.includes("__pycache__"))).toBe(false);
    expect(Object.keys(BUILTIN_SKILL_FILES).some((r) => r.endsWith(".pyc"))).toBe(false);
  });
});

describe("releaseBuiltinSkills", () => {
  const FIXTURE = {
    "alpha/SKILL.md": "---\nname: alpha\n---\n",
    "alpha/references/guide.md": "guide body",
    "beta/SKILL.md": "---\nname: beta\n---\n",
  };

  it("技能缺失时逐文件释放（含子目录）", async () => {
    const { fs, files, writes } = memFs();
    const released = await releaseBuiltinSkills(fs, "C:\\skills", FIXTURE);
    expect(released).toEqual(["alpha", "beta"]);
    expect(files["C:\\skills\\alpha\\SKILL.md"]).toBe(FIXTURE["alpha/SKILL.md"]);
    expect(files["C:\\skills\\alpha\\references\\guide.md"]).toBe("guide body");
    expect(writes.length).toBe(3);
  });

  it("已有 SKILL.md 的技能整体跳过（用户副本是最高权威，升级也不覆盖）", async () => {
    const { fs, files, writes } = memFs({ "C:\\skills\\alpha\\SKILL.md": "user edited" });
    const released = await releaseBuiltinSkills(fs, "C:\\skills", FIXTURE);
    expect(released).toEqual(["beta"]); // alpha 跳过，beta 仍补齐
    expect(files["C:\\skills\\alpha\\SKILL.md"]).toBe("user edited");
    expect(writes.some((w) => w.path.startsWith("C:\\skills\\alpha\\"))).toBe(false);
  });

  it("单个技能写失败不阻断其余技能", async () => {
    const { fs, files } = memFs();
    const boom = {
      ...FIXTURE,
    };
    const originalWrite = fs.writeText;
    (fs as unknown as { writeText: FsBridge["writeText"] }).writeText = async (p, c) => {
      if (p.includes("\\alpha\\")) throw new Error("disk full");
      return originalWrite(p, c);
    };
    const released = await releaseBuiltinSkills(fs, "C:\\skills", boom);
    expect(released).toEqual(["beta"]);
    expect(files["C:\\skills\\beta\\SKILL.md"]).toBeTruthy();
  });

  it("路径穿越与编译产物不进释放清单", async () => {
    const { fs, files } = memFs();
    const released = await releaseBuiltinSkills(fs, "C:\\skills", {
      "../evil/SKILL.md": "x",
      "alpha/../../evil.md": "x",
      "alpha/SKILL.md": "ok",
      "alpha/__pycache__/x.pyc": "junk",
      "loose.md": "not a skill",
    });
    expect(released).toEqual(["alpha"]);
    expect(Object.keys(files)).toEqual(["C:\\skills\\alpha\\SKILL.md"]);
  });

  it("空资产集不报错", async () => {
    const { fs } = memFs();
    expect(await releaseBuiltinSkills(fs, "C:\\skills", {})).toEqual([]);
  });
});
