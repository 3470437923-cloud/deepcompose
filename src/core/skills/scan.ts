/**
 * 技能扫描：读取技能根目录（即 Documents\skills），解析 SKILL.md frontmatter，
 * 生成 skill_list（prefs 键，既有格式：元素含 id/name/description/directoryPath/
 * isBuiltIn/marketplaceSkillId/marketplaceVersion）。
 *
 * frontmatter 实测格式（Documents\skills\novel-writer\SKILL.md）：
 *   ---\nname: novel-writer\ndescription: …\n---
 * id 取目录名（稳定、可复现）。isBuiltIn = name 属于「内置」组
 * （设置页实测：内置 2 = novel-writer / skill-creator）。
 * 扫描为只读；写入 skillsDir 属于后续批次（资产释放）。
 */

import type { FsBridge } from "../fsbridge";
import type { SkillMeta } from "../prefs";

/** 内置分组的实测依据（2026-09-28） */
export const BUILTIN_SKILL_NAMES = new Set(["novel-writer", "skill-creator"]);

/**
 * 解析 SKILL.md 头部 frontmatter 的 name/description（单行值）。
 * 容错口径：BOM 先剥（记事本等编辑器存 UTF-8 带 BOM 时，startsWith("---") 会失效）；
 * 无 frontmatter / 围栏未闭合 / 行不是 `key: value` 形态 → 一律返回空值，
 * 由调用方（scanSkills）跳过该目录，绝不抛异常。
 */
export function parseFrontmatter(text: string): { name: string; description: string } {
  let name = "";
  let description = "";
  const t = text.replace(/^\uFEFF/, "");
  if (t.startsWith("---")) {
    // 闭合围栏按 "\n---" 找：CRLF 文件的 "\r\n---" 同样命中（\r 随后被 trim 剥掉）
    const end = t.indexOf("\n---", 3);
    const head = end >= 0 ? t.slice(3, end) : "";
    for (const line of head.split("\n")) {
      const m = /^(\w+)\s*:\s*(.*)$/.exec(line.trim());
      if (!m) continue;
      if (m[1] === "name") name = m[2].trim();
      else if (m[1] === "description") description = m[2].trim();
    }
  }
  return { name, description };
}

/** 扫描技能根目录；目录缺 SKILL.md 或 name 为空时跳过（不报错）。
 *  id 取目录名（稳定、可复现，不随 frontmatter name 改名而漂移）。 */
export async function scanSkills(fs: FsBridge, skillsDir: string): Promise<SkillMeta[]> {
  const out: SkillMeta[] = [];
  let entries;
  try {
    entries = await fs.list(skillsDir);
  } catch {
    return out; // 技能根不可读（未释放/被占用）时按"无技能"处理，不阻断启动
  }
  for (const e of entries) {
    if (!e.isDir) continue; // 只有目录才是技能
    const skillFile = `${e.path}\\SKILL.md`;
    if (!(await fs.exists(skillFile))) continue;
    let text = "";
    try {
      text = await fs.readText(skillFile);
    } catch {
      continue; // 读失败视为坏技能目录，跳过
    }
    const { name, description } = parseFrontmatter(text);
    if (name === "") continue; // 无 name 无法被 skill_lookup 精确引用，跳过
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

/**
 * 合并扫描结果与既有清单：skillList 以扫描（目录现实）为准，整体替换 ——
 *  - 目录里删掉的技能随之从清单消失；activeSkillIds 里残留的失效 id 无害
 *    （availableSkillsBlock 按现存 id 过滤，自动忽略），且刻意不清除：目录暂时
 *    不可见（如外接盘未挂载）时不丢用户勾选，目录回来即恢复；
 *  - 新增技能入库但默认不勾选（非首次不由系统替用户做决定）；
 *  - id 取目录名，旧清单整体被替换，不存在新旧 id 冲突的合并问题。
 * 开关状态：首次（旧清单为空）只默认开启内置白名单（novel-writer / skill-creator），
 * 非首次原样保留用户当前的 activeSkillIds。
 */
export function mergeSkillList(
  previous: SkillMeta[],
  scanned: SkillMeta[],
  currentActive: string[] = [],
): { skillList: SkillMeta[]; activeSkillIds: string[] } {
  const activeSkillIds =
    previous.length === 0
      ? scanned.filter((s) => BUILTIN_SKILL_NAMES.has(s.name)).map((s) => s.id)
      : currentActive;
  return { skillList: scanned, activeSkillIds };
}
