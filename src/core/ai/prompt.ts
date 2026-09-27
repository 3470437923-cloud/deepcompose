/**
 * 系统提示词装配。
 *
 * 逐字片段（证据：TOOLS.md §1.2/§1.4/§4.3）：
 *   - 未绑定项目：`\n\n所有文件操作（file_read、file_write、file_manage）都在此目录内进行。路径参数相对于此目录。\n\n**注意**：当前未绑定具体小说项目。当用户说"初始化"、"创建新小说"时，使用 create_project 工具创建新项目。`
 *   - 已绑定项目：`\n\n所有文件操作（file_read、file_write、file_manage）都在此目录内进行。路径参数相对于此目录，例如读取"章节内容/第一章.md"实际读取的是"` + <项目绝对路径> + `"`
 *   - 未启用工具：`未启用，web_search 工具当前不可用（调用会被拒绝），请勿声称具备该能力或尝试调用`（terminal / rank_data_query 同构）
 * 系统提示词本体：**自写、语义等价**（CONTRACT §6 红线：不复制其提示词原文），见 prefs.DEFAULT_SYSTEM_PROMPT。
 */

import { availableSkillsBlock } from "../skills/registry";
import type { SkillMeta } from "../prefs";

export const PROJECT_BOUND_NOTE =
  '\n\n所有文件操作（file_read、file_write、file_manage）都在此目录内进行。路径参数相对于此目录，例如读取"章节内容/第一章.md"实际读取的是"';

export const PROJECT_UNBOUND_NOTE =
  '\n\n所有文件操作（file_read、file_write、file_manage）都在此目录内进行。路径参数相对于此目录。\n\n**注意**：当前未绑定具体小说项目。当用户说"初始化"、"创建新小说"时，使用 create_project 工具创建新项目。';

export function toolDisabledNote(tool: string): string {
  return `未启用，${tool} 工具当前不可用（调用会被拒绝），请勿声称具备该能力或尝试调用`;
}

export const TOOL_ENABLED_NOTE: Record<string, string> = {
  web_search: "已启用（web_search 工具可用）",
  rank_data_query: "已启用（rank_data_query 工具可用，用法详见工具说明）",
};

export interface PromptInput {
  basePrompt: string;
  projectRoot: string | null;
  skills: SkillMeta[];
  activeSkillIds: string[];
  /** 当前真正注册给模型的工具名 */
  enabledTools: string[];
}

/** 装配最终系统提示词 */
export function buildSystemPrompt(input: PromptInput): string {
  let out = input.basePrompt.trim();

  if (input.projectRoot) {
    out += PROJECT_BOUND_NOTE + input.projectRoot + '"';
  } else {
    out += PROJECT_UNBOUND_NOTE;
  }

  // 未注册的工具逐字声明为不可用（真机行为）
  for (const t of ["web_search", "terminal", "rank_data_query"]) {
    if (!input.enabledTools.includes(t)) out += "\n" + toolDisabledNote(t);
  }

  const block = availableSkillsBlock(input.skills, input.activeSkillIds);
  if (block !== "") out += "\n\n" + block;

  return out;
}
