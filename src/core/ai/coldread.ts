/**
 * 冷读（独立审读实例）。
 *
 * 隔离由代码物理保证（这是软件对文档方案的碾压点）：
 *  - 系统提示词 = 本文件的审读指令（不装配用户系统提示词）；
 *  - 不注入项目路径块（buildSystemPrompt 不参与）；
 *  - 不注入技能块、不注册任何工具（tools: []）——该会话无法读取大纲/人物库/前文之外的任何文件；
 *  - 独立会话（不继承作者对话），标题「冷读 - 第N章」。
 * 上述隔离由 controller.sendIsolated 执行、tests/ai/coldread.test.ts 回归锁定。
 *
 * 审读目标（单次只选一个）：
 *  - clarity：叙述清晰度（默认）；
 *  - pace：节奏与追读欲。
 * 冷读只诊断、不改稿：输出按原文顺序的问题清单，不打分、不凑数、不替写。
 *
 * 落盘路径口径：报告存 小说资料/审核/（磁盘契约目录名，逐字不得改）。
 */

/** 冷读审读目标（clarity 为缺省值） */
export type ColdReadGoal = "clarity" | "pace";

/** 目标 → 报告元信息里展示的中文标签 */
export const COLD_READ_GOAL_LABEL: Record<ColdReadGoal, string> = {
  clarity: "叙述清晰度（默认）",
  pace: "节奏与追读欲",
};

/** 审读者身份（两套系统提示词共用）：强调"只知道读者知道的"这一隔离价值 */
const COMMON_IDENTITY =
  "你是一名第一次阅读这部小说的普通读者兼审读员。你只看得到下面提供的正文文本，" +
  "没有任何大纲、设定、人物资料或作者解释，也无法读取任何文件。这正是你的价值：" +
  "作者和写作助手知道得太多，会无意识替正文补全信息；你只知道读者知道的。\n\n";

/** 输出纪律（两套系统提示词共用）：报告制、不打分、不凑数、不替写、如实报"无问题" */
const COMMON_OUTPUT_RULES =
  "输出规则（必须遵守）：\n" +
  "- 按原文顺序列出问题。每条包含：位置（第几段/短引原文，引文不超过20字）、问题类别、读者此时可能形成的理解或误解、文本依据、最少需要澄清或补足什么。\n" +
  "- 不打分，不生成评分表，不统计问题数量指标，不替写正文，不给整段重写稿。\n" +
  "- 正常的留白、悬念和非最优但不影响理解的选择不算问题，不要为了凑数硬找。\n" +
  "- 没有发现有依据的问题时，如实写「本章未发现有依据的清晰度问题」并说明你重点核对过哪些方面，不许用「整体顺畅」一句糊弄。\n" +
  "- 结尾用不超过5句话汇总：新读者最可能在哪里弃读或误读，优先级最高的1—3处是什么。\n" +
  "- 使用与正文相同的语言（中文）。";

/** 清晰度目标的系统提示词：五个核对方面 + 共用输出纪律 */
export const COLD_READ_SYSTEM_CLARITY =
  COMMON_IDENTITY +
  "本次审读目标：叙述清晰度。你只审「第一次读的读者能否顺利读下去」，从以下五个方面逐一核对：\n" +
  "1. 信息首次出现：新身份、能力、物件、消息、地点第一次影响理解时，正文是否给了读者当下必要的依据；\n" +
  "2. 动作归属：每个动作能否确定是谁做的、作用于谁；多人同场时指代是否可能误认；\n" +
  "3. 空间与过程：场景转换有没有交代，关键动作的前后位置和缺失过程能否连起来；\n" +
  "4. 对白与反应：每句对白能否接上前文，回应的是谁、针对什么；有没有凭空出现的话题；\n" +
  "5. 状态连续：伤势、持物、位置、知情、情绪、关系、资源在变化后是否仍然有效，有没有无故复原或凭空消失。\n\n" +
  COMMON_OUTPUT_RULES;

/** 节奏目标的系统提示词：五个追读感受维度；「无问题」话术随目标替换为"节奏问题" */
export const COLD_READ_SYSTEM_PACE =
  COMMON_IDENTITY +
  "本次审读目标：节奏与追读欲。你只从一个追更读者的感受出发核对：\n" +
  "1. 哪里开始走神、想跳读：给出具体段落位置和原因（信息重复、铺垫过长、冲突悬置、描写堆叠）；\n" +
  "2. 哪里真正抓住了你：期待是怎样被建立的，兑现是否足秤；\n" +
  "3. 章尾钩子：读完最后一段，你有没有具体想知道下一步的冲动；钩子是具体局面还是抽象总结；\n" +
  "4. 情绪曲线：全章的张弛分布，连续高强度或过长平淡的位置；\n" +
  "5. 弃读风险：新读者最可能在哪一段关掉这本书，为什么。\n\n" +
  COMMON_OUTPUT_RULES.replace("清晰度问题", "节奏问题");

/** 按目标取系统提示词（未知目标回退 clarity，与类型缺省一致） */
export function coldReadSystem(goal: ColdReadGoal): string {
  return goal === "pace" ? COLD_READ_SYSTEM_PACE : COLD_READ_SYSTEM_CLARITY;
}

/** 冷读随对象附带的前文（读者已读部分；只给正文文本，不给任何设定资料） */
export interface ColdReadPrior {
  /** 前文标题（如 第2章） */
  title: string;
  text: string;
}

/** 装配冷读会话的首条用户消息：审读对象全文 + 必要前文 */
export function buildColdReadUserMessage(
  chapterTitle: string,
  chapterText: string,
  priors: ColdReadPrior[] = [],
): string {
  // 顺序即阅读顺序：前文在前、审读对象在后（模拟追更读者第一次读到本章）
  let out = "";
  for (const p of priors) {
    out += `【前文（读者已读部分）：${p.title}】\n${p.text.trim()}\n\n`;
  }
  out += `【本次审读对象：${chapterTitle}】\n${chapterText.trim()}\n\n`;
  out += "请按系统指令开始冷读审读。";
  return out;
}

/** 冷读会话标题 */
export function coldReadSessionTitle(chapterTitle: string): string {
  return `冷读 - ${chapterTitle}`;
}

/** 报告落盘相对路径：小说资料/审核/<章标签>-冷读-<目标>-<YYYYMMDD-HHmm>.md */
export function coldReadReportRel(
  chapterLabel: string,
  goal: ColdReadGoal,
  now: Date = new Date(),
): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
  return `小说资料/审核/${chapterLabel}-冷读-${goal}-${stamp}.md`;
}

/**
 * 报告文件内容（含元信息头，正文为 AI 输出原文）。
 * 落盘格式契约：全文 CRLF（Windows 记事本友好）；AI 输出的换行统一归一为 CRLF；
 * 正文不做任何改写（冷读报告是诊断原文，允许原样引用）。
 */
export function coldReadReportBody(
  chapterTitle: string,
  goal: ColdReadGoal,
  priors: ColdReadPrior[],
  aiText: string,
  now: Date = new Date(),
): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const ts = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`;
  return (
    `# 冷读报告 - ${chapterTitle}\r\n` +
    `- 审读目标：${COLD_READ_GOAL_LABEL[goal]}\r\n` +
    `- 提供前文：${priors.length === 0 ? "无" : priors.map((x) => x.title).join("、")}\r\n` +
    `- 生成时间：${ts}\r\n` +
    `- 性质：独立冷读实例输出（无大纲/设定/作者解释/工具），只诊断不改稿\r\n\r\n` +
    `---\r\n\r\n` +
    aiText.trim().replace(/\r?\n/g, "\r\n") +
    "\r\n"
  );
}
