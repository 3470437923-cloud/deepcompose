/**
 * 回流任务装配（结束编辑 → 自动保存 → 回流）。
 *
 * 回流在专属会话中运行（不切换用户当前会话视图，会话列表可见可追溯）。
 * 本模块只负责把「被编辑对象 + diff 摘要」装配成一段任务文本；
 * 执行仍走 controller.send（带完整工具），行为规则由 novel-writer 技能约束。
 *
 * 两路语义（方案 P4）：
 *  - 候选稿（待确认\）：不回写事实（候选情节不提前入账），只审稿 + 学习记录；
 *  - 正式正文（章节内容\）：审稿 + 按 diff 增量回写追踪表/摘要 + 学习记录。
 * 审稿一律报告制：不静默改写用户文字，动稿必须过 question。
 */

import { diffSummaryText, type DiffResult } from "../store/oplog";

export interface ReflowInput {
  /** 被编辑文件相对作品根路径（'/' 分隔） */
  relPath: string;
  /** 文件类别 */
  kind: "candidate" | "chapter";
  /** 章号标签（如 第3章）；解析失败为 null */
  chapterLabel: string | null;
  diff: DiffResult;
  /** 编辑结束后磁盘上的最新全文（回流 AI 也可自行 file_read，这里给出以便直接引用） */
  finalTextPreview?: string;
}

/** 装配回流任务文本（作为回流会话的首条用户消息） */
export function buildReflowPrompt(input: ReflowInput): string {
  const label = input.chapterLabel ?? "（章号未识别）";
  const isCandidate = input.kind === "candidate";
  const summary = diffSummaryText(input.diff);

  const head =
    `【回流】${label} 用户已结束手动编辑并自动保存：${input.relPath}\n` +
    `变更规模：新增 ${input.diff.added.length} 行 / 删除 ${input.diff.removed.length} 行 / 变更 ${input.diff.changedChars} 字符` +
    `${input.diff.digitsChanged ? "（含数字变化，重点核对数量、金额、时间类事实）" : ""}\n\n` +
    `变更摘要（- 为删除行，+ 为新增行）：\n${summary}\n\n`;

  const common =
    `请按 novel-writer 技能的「回流任务」规则执行：\n` +
    `1. 自动审稿：读取该文件全文与相关追踪表（按变更涉及的人物/资源/伏笔做检索式最小读取），核对一致性——设定冲突、状态回退、指代断裂、承接断裂、资源重复累计。只输出审稿报告（位置+短引、问题类别、依据、最少修正建议）；发现需要动稿的问题时用 question 工具征求用户确认，未经确认不得改写用户文字。\n` +
    `2. 审用户操作：判断本次改动属于事实修正、编辑判断还是表达偏好，作为学习依据。\n` +
    `3. 学习记录：把「AI/旧版本 vs 用户最终版」的可复用改稿判断追加到 小说资料/个人改稿/改稿对比-${label}.md（目录不存在则创建；不复制用户原句，只记录什么问题、何时用、怎样改、做到哪里为止；明确原因与推测原因分开标注）。跨章重复出现的同类判断，用 question 逐条请用户确认后，才合并进 小说资料/06-写作规则.md 的「个人文风（学习沉淀）」节（节内追加，不动其他节）。\n`;

  const path = isCandidate
    ? `\n4. 事实回写：本文件是候选稿，**禁止**把候选情节写入追踪表、章节摘要或任何当前事实记录（采用后才回写）。\n`
    : `\n4. 事实回写：本文件是已采用的正式正文。只按变更增量更新受影响的追踪表与章节摘要（节内替换，注明来源章节），写前系统自动落快照；只改发生变化的当前值，不重复累计；若变更与后续章节冲突，把冲突登记到 小说资料/00-项目状态.md 的「尚未解决的冲突」，不静默修改其他正文。\n`;

  const tail =
    `\n完成后用三五句话向我汇报：审稿结论（有无问题）、已更新文件、学习记录位置、待我决定的事项。没有完成的步骤如实记录，不虚报。`;

  return head + common + path + tail;
}

/** 回流会话标题 */
export function reflowSessionTitle(chapterLabel: string | null, kind: ReflowInput["kind"]): string {
  const kindLabel = kind === "candidate" ? "候选" : "正文";
  return `回流 - ${chapterLabel ?? "稿件"}（${kindLabel}）`;
}
