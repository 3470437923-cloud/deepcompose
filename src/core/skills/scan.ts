/**
 * 技能扫描：读取技能根目录（真机即 Documents\skills），解析 SKILL.md frontmatter，
 * 生成 skill_list（prefs 键，真机实证：元素含 id/name/description/directoryPath/
 * isBuiltIn/marketplaceSkillId/marketplaceVersion）。
 *
 * frontmatter 实测格式（Documents\skills\novel-writer\SKILL.md）：
 *   ---\nname: novel-writer\ndescription: …\n---
 * id 取目录名（稳定、可复现）。isBuiltIn = name 属于真机「内置」组
 * （设置页实证：内置 2 = novel-writer / skill-creator）。
 * 扫描为只读；写入 skillsDir 属于后续批次（资产释放）。
 */

import type { FsBridge } from "../fsbridge";
import type { SkillMeta } from "../prefs";

/** 真机设置页「内置」分组实证（2026-09-28 shot-ow-set-Skill.png） */
export const BUILTIN_SKILL_NAMES = new Set(["novel-writer", "skill-creator"]);

/** 解析 SKILL.md 头部 frontmatter 的 name/description（单行值） */
export function parseFrontmatter(text: string): { name: string; description: string } {
  let name = "";
  let description = "";
  if (text.startsWith("---")) {
    const end = text.indexOf("\n---", 3);
    const head = end >= 0 ? text.slice(3, end) : "";
    for (const line of head.split("\n")) {
      const m = /^(\w+)\s*:\s*(.*)$/.exec(line.trim());
      if (!m) continue;
      if (m[1] === "name") name = m[2].trim();
      else if (m[1] === "description") description = m[2].trim();
    }
  }
  return { name, description };
}

/** 扫描技能根目录；目录缺 SKILL.md 或 name 为空时跳过（不报错） */
export async function scanSkills(fs: FsBridge, skillsDir: string): Promise<SkillMeta[]> {
  const out: SkillMeta[] = [];
  let entries;
  try {
    entries = await fs.list(skillsDir);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (!e.isDir) continue;
    const skillFile = `${e.path}\\SKILL.md`;
    if (!(await fs.exists(skillFile))) continue;
    let text = "";
    try {
      text = await fs.readText(skillFile);
    } catch {
      continue;
    }
    const { name, description } = parseFrontmatter(text);
    if (name === "") continue;
    out.push({
      id: e.name,
      name,
      description,
      directoryPath: e.path,
      isBuiltIn: BUILTIN_SKILL_NAMES.has(name),
      marketplaceSkillId: null,
      marketplaceVersion: null,
    });
  }
  return out;
}

/** 合并扫描结果与既有清单：扫描为准；首次（旧清单为空）默认全部开启，
 *  非首次保留用户当前的开关状态 */
export function mergeSkillList(
  previous: SkillMeta[],
  scanned: SkillMeta[],
  currentActive: string[] = [],
): { skillList: SkillMeta[]; activeSkillIds: string[] } {
  const activeSkillIds =
    previous.length === 0 ? scanned.map((s) => s.id) : currentActive;
  return { skillList: scanned, activeSkillIds };
}
