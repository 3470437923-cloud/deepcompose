/**
 * 系统提示词装配。
 *
 * 逐字片段（既有格式）：
 *   - 未绑定项目：`\n\n所有文件操作（file_read、file_write、file_manage）都在此目录内进行。路径参数相对于此目录。\n\n**注意**：当前未绑定具体小说项目。当用户说"初始化"、"创建新小说"时，使用 create_project 工具创建新项目。`
 *   - 已绑定项目：`\n\n所有文件操作（file_read、file_write、file_manage）都在此目录内进行。路径参数相对于此目录，例如读取"章节内容/第一章.md"实际读取的是"` + <项目绝对路径> + `"`
 *   - 未启用工具：`未启用，web_search 工具当前不可用（调用会被拒绝），请勿声称具备该能力或尝试调用`（terminal / rank_data_query 同样处理）
 * 系统提示词本体：**自写、语义等价**，见 prefs.DEFAULT_SYSTEM_PROMPT。
 *
 * 装配顺序（buildSystemPrompt）：本体 → 项目路径块 → 未启用工具声明 → 技能清单块
 * → 技能根路径块（I-10）→ 资料形态契约短版（L1）。
 * 冷读（sendIsolated）不走本模块——隔离系统提示词由 coldread.ts 独立给出。
 */

import { availableSkillsBlock } from "../skills/registry";
import type { SkillMeta } from "../prefs";

/** 已绑定项目时追加的路径说明（逐字；末尾开引号，由 buildSystemPrompt 接项目绝对路径 + 闭引号） */
export const PROJECT_BOUND_NOTE =
  '\n\n所有文件操作（file_read、file_write、file_manage）都在此目录内进行。路径参数相对于此目录，例如读取"章节内容/第一章.md"实际读取的是"';

/** 未绑定项目时追加的路径说明与初始化指引（逐字） */
export const PROJECT_UNBOUND_NOTE =
  '\n\n所有文件操作（file_read、file_write、file_manage）都在此目录内进行。路径参数相对于此目录。\n\n**注意**：当前未绑定具体小说项目。当用户说"初始化"、"创建新小说"时，使用 create_project 工具创建新项目。';

/** 未启用工具的逐字声明（防止模型幻觉调用不存在的工具） */
export function toolDisabledNote(tool: string): string {
  return `未启用，${tool} 工具当前不可用（调用会被拒绝），请勿声称具备该能力或尝试调用`;
}

/**
 * 资料形态契约的**短版**（L1 / D-038）：完整契约见 `docs/MATERIALS-STYLE.md`，
 * 判据在 `src/core/store/style.ts`。放在系统提示词里的原因很实际 —— 技能是
 * **按需加载**的，模型写资料时不一定会去 `skill_lookup`；而这四条是每次写盘都要遵守的。
 * 这里只写"禁止什么/放哪/多长"，不重复契约全文。
 */
export const MATERIALS_STYLE_NOTE =
  "\n\n写作资料（小说资料/ 下的维护文档）的形态契约（完整版见项目文档 docs/MATERIALS-STYLE.md）：\n" +
  "- 一份文档只写它的职责；过程记录（导入说明、核对证据、遗疵、待办、文档归位表）一律放 小说资料/审核/ 的归档文件，不进内容文件。\n" +
  "- 优先用短段落讲清故事与因果，少量字段只承载状态与检索；不用逐项问卷凑内容。可用标题、`- 键：值`/`- 条目`、原文引用和行内路径；表格仅用于二维矩阵数据，不用框线、emoji、装饰分节线、箭头链或粗体字段标签。\n" +
  "- 人物库一人六个字段，保留人物特有的说话习惯与压力反应；06只放全书共用规则。状态字段、开书引导标签及追踪编号与状态保持兼容，追踪条目沿用标题加字段，不强制压成一行。\n" +
  "- 单文件体量预算（00-项目状态1500字符、04-分卷大纲14000、人物库18000等）只用于诊断，超标不授权自动删除、压缩或改写。经授权整理时保留事实、来源与可检索归档，不为达标删信息。\n" +
  "- 04-分卷大纲写每卷目标、卷末新局面与每章一句节拍；05只细化接下来3—5章，每章约四项，少于3章时续补。远期逐场细节放审核/归档，未采用的计划不写成既成事实。";

/**
 * 「已启用」工具的逐字声明表（预留契约：web_search / rank_data_query 实现并注册后，
 * 用本表替代 toolDisabledNote 宣告可用。当前装配流程未消费本表——三个工具都未实现，
 * 一律走「未启用」声明）。
 */
export const TOOL_ENABLED_NOTE: Record<string, string> = {
  web_search: "已启用（web_search 工具可用）",
  rank_data_query: "已启用（rank_data_query 工具可用，用法详见工具说明）",
};

/** buildSystemPrompt 的输入 */
export interface PromptInput {
  /** 用户可编辑的系统提示词本体（prefs.systemPrompt） */
  basePrompt: string;
  /** 当前绑定的小说项目根（null = 未绑定） */
  projectRoot: string | null;
  /** 全部技能清单（权威清单在配置键 skill_list） */
  skills: SkillMeta[];
  /** 已开启的技能 id（空 = 未做过选择，默认全部注入） */
  activeSkillIds: string[];
  /** 当前真正注册给模型的工具名 */
  enabledTools: string[];
  /** 技能根绝对路径（`prefs.custom_skills_dir` 或默认 `Documents\skills`）。
   *  I-10：技能根是三个授权根之一，根内写入无需确认，但系统提示词此前从没告诉
   *  模型技能根在哪 —— skill-creator 让模型"直接创建技能目录"就成了空话。
   *  传空串/缺省时不注入该块（预览替身与旧调用方保持原输出）。 */
  skillsDir?: string;
}

/** 装配最终系统提示词 */
export function buildSystemPrompt(input: PromptInput): string {
  let out = input.basePrompt.trim();

  // 项目路径块：绑定与否决定用哪段逐字说明
  if (input.projectRoot) {
    out += PROJECT_BOUND_NOTE + input.projectRoot + '"';
  } else {
    out += PROJECT_UNBOUND_NOTE;
  }

  // 未注册的工具逐字声明为不可用（既有行为）
  for (const t of ["web_search", "terminal", "rank_data_query"]) {
    if (!input.enabledTools.includes(t)) out += "\n" + toolDisabledNote(t);
  }

  // 技能清单块（无技能时为空串，不注入空块）
  const block = availableSkillsBlock(input.skills, input.activeSkillIds);
  if (block !== "") out += "\n\n" + block;

  // 技能根路径块（I-10，additive）：技能与作品分别属于不同授权根，只给项目根
  // 模型无从知道技能该写到哪；skill_lookup 的目录说明也只讲"相对本目录"。
  if (input.skillsDir) {
    out += `\n\n技能目录（全部技能的根目录，可用 file_write 直接创建/修改，写入无需确认）："${input.skillsDir}"`;
  }

  // 资料形态契约短版（L1 / D-038）：静态文本，与项目是否绑定无关（新建作品时同样要遵守）
  out += MATERIALS_STYLE_NOTE;

  return out;
}
