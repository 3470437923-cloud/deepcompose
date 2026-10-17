/** 使用真实宿主文件系统，防止内存替身把 Windows 分隔符误当成跨平台契约。 */
import { promises as fsp } from "node:fs";
import { existsSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createNodeFs } from "../support/nodeFs";
import { availableSkillsBlock, lookupSkill } from "../../src/core/skills/registry";
import { scanSkills } from "../../src/core/skills/scan";
import type { SkillMeta } from "../../src/core/prefs";

const fs = createNodeFs();
const realSkills = process.env.DEEPCOMPOSE_READONLY_SKILLS_ROOT ?? "";
describe.skipIf(!realSkills || !existsSync(realSkills))("真实技能目录只读集成", () => {
  it.each(["novel-writer", "novel-structure-quality-coordinator", "写作禁忌"])("声明名称 %s 可加载完整正文和实际目录", async (name) => {
    const skills = await scanSkills(fs, realSkills);
    const meta = skills.find((s) => s.name === name)!;
    expect(meta).toBeDefined();
    const body = await fs.readText(path.join(meta.directoryPath, "SKILL.md"));
    const hit = await lookupSkill(fs, skills, name);
    expect(hit?.content.startsWith(body)).toBe(true);
    expect(hit?.content.includes(meta.directoryPath)).toBe(true);
    console.log(JSON.stringify({ skill: name, loaded: true, bodyBytes: Buffer.byteLength(body) }));
  });
});
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await fsp.rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "deepcompose-skills-"));
  roots.push(root);
  const directoryPath = path.join(root, "写作禁忌_1779978824045");
  await fsp.mkdir(path.join(directoryPath, "references"), { recursive: true });
  const body = "---\nname: 写作禁忌\ndescription: 写作检查\n---\n完整技能正文\n";
  await fsp.writeFile(path.join(directoryPath, "SKILL.md"), body);
  await fsp.writeFile(path.join(directoryPath, "references", "检查.md"), "检查条目");
  const meta: SkillMeta = { id: path.basename(directoryPath), name: "写作禁忌", description: "写作检查", directoryPath, isBuiltIn: false, marketplaceSkillId: null, marketplaceVersion: null };
  return { root, directoryPath, body, meta };
}
describe("技能真实文件系统回归", () => {
  it("按声明名称及目录 id 加载真实路径，返回完整正文和参考文件", async () => {
    const { meta, body, directoryPath } = await fixture();
    for (const name of [meta.name, meta.id]) {
      const hit = await lookupSkill(fs, [meta], name);
      expect(hit?.skill_name).toBe("写作禁忌");
      expect(hit?.content).toContain(body);
      expect(hit?.content).toContain(directoryPath);
      expect(hit?.content).toContain("references/检查.md");
    }
  });
  it("扫描带时间戳目录，以 frontmatter 名称声明并可按声明加载", async () => {
    const { root, directoryPath } = await fixture();
    const skills = await scanSkills(fs, root);
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({ name: "写作禁忌", id: "写作禁忌_1779978824045", directoryPath });
    expect(availableSkillsBlock(skills)).toContain("<name>写作禁忌</name>");
    expect(await lookupSkill(fs, skills, "写作禁忌")).not.toBeNull();
  });
});
