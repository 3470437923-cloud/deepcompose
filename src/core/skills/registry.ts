/**
 * 技能注册表（CONTRACT §5）。
 *
 * 技能的权威清单在配置键 `skill_list`（真机实证：元素含 id/name/description/directoryPath/
 * isBuiltIn/marketplaceSkillId/marketplaceVersion），不在目录扫描结果里。
 *
 * 注入格式逐字（TOOLS.md §4.3，证据 app_so_full_utf16.txt:0039d178 等 9 段）：
 *   `## Available Skills\n\n技能按需加载。…\n\n<available_skills>\n`
 *   + `  <skill>` / `    <name>…</name>` / `    <description>…</description>` / `  </skill>`
 *   + `</available_skills>`
 *
 * skill_lookup 命中后回注的目录说明逐字（TOOLS.md §4.4，app_so_full_utf16.txt:0027c0a8）。
 */

import type { FsBridge } from "../fsbridge";
import type { SkillMeta } from "../prefs";

/** 块头（逐字；末尾带 \n） */
export const AVAILABLE_SKILLS_HEADER =
  "## Available Skills\n\n技能按需加载。当用户请求与某个技能的使用场景匹配时，调用 `skill_lookup` 加载该技能的完整内容。参数 `skill_name` 必须一字不差地使用 `<name>` 中的技能名（不要改写、翻译或添加后缀）。\n\n<available_skills>\n";

/** 目录说明（逐字；开头与结尾都带 \n） */
export const SKILL_DIR_NOTE =
  "\n- 约定: `scripts/` 存放可执行脚本，`references/` 存放按需读取的文档，`assets/` 存放输出资源。\n- 该目录下的相对路径都基于此目录。\n- 可用文件(排除 SKILL.md，最多10个，完整列表可读目录):\n";

/** 技能清单注入块（无技能时返回空串，不注入空块） */
export function availableSkillsBlock(skills: SkillMeta[], activeIds?: string[]): string {
  const list = activeIds && activeIds.length > 0
    ? skills.filter((s) => activeIds.includes(s.id) || s.isBuiltIn)
    : skills;
  if (list.length === 0) return "";

  let out = AVAILABLE_SKILLS_HEADER;
  for (const s of list) {
    out += "  <skill>";
    out += `    <name>${s.name}</name>`;
    out += `    <description>${s.description}</description>`;
    out += "  </skill>\n";
  }
  out += "</available_skills>";
  return out;
}

export interface SkillLookupHit {
  skill_name: string;
  content: string;
}

/** 按名字或 id 精确匹配（真机描述：The skill name exactly as shown in Available Skills, or the skill ID） */
export function findSkill(skills: SkillMeta[], nameOrId: string): SkillMeta | null {
  const q = nameOrId.trim();
  return skills.find((s) => s.name === q) ?? skills.find((s) => s.id === q) ?? null;
}

/** 读取技能正文；命中后按逐字格式追加目录说明与文件清单（最多 10 个） */
export async function lookupSkill(
  fs: FsBridge,
  skills: SkillMeta[],
  nameOrId: string,
): Promise<SkillLookupHit | null> {
  const meta = findSkill(skills, nameOrId);
  if (!meta) return null;

  const skillFile = `${meta.directoryPath}\\SKILL.md`;
  if (!(await fs.exists(skillFile))) return null;
  const body = await fs.readText(skillFile);

  // 目录说明 + 最多 10 个可用文件（排除 SKILL.md）
  let note = SKILL_DIR_NOTE;
  const entries = await fs.list(meta.directoryPath);
  const files: string[] = [];
  const walk = async (dir: string, rel: string, depth: number): Promise<void> => {
    if (depth > 2 || files.length >= 10) return;
    for (const e of await fs.list(dir)) {
      if (files.length >= 10) break;
      const childRel = rel === "" ? e.name : `${rel}/${e.name}`;
      if (e.isDir) {
        await walk(e.path, childRel, depth + 1);
      } else if (e.name !== "SKILL.md") {
        files.push(childRel);
      }
    }
  };
  await walk(meta.directoryPath, "", 0);
  for (const f of files) note += `- ${f}\n`;

  return { skill_name: meta.name, content: body + note };
}

/** 技能根目录（用于路径授权：技能目录直读） */
export function skillDirectory(meta: SkillMeta): string {
  return meta.directoryPath;
}
