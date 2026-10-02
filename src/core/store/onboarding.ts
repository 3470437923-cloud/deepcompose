/**
 * 开书引导（NewBookWizard）的答案 → 14 件套模板的定向填充。
 *
 * 背景：新建作品原本直接生成 14 份「待填写」模板，用户面对的是一本
 * 空白书，不知道第一步做什么。引导把几个最关键的开书问题先问掉，
 * 答案在**创建那一刻**就写进对应模板字段 —— 之后 AI 读到的就不是
 * 全空占位，而是作者已经表过态的方向。
 *
 * 契约（与「格式优先」同一条纪律）：
 *   · 只替换模板里 `- 字段名：待填写` 这一整行的值，不增删行、不动其它文档；
 *   · 留空的字段保持「待填写」占位（它是提醒作者与 AI 继续讨论的标记）；
 *   · 字段名与 templates.ts 逐字一致 —— 模板改了字段名，这里宁可填不上
 *     （返回原文），也不许按模糊的猜测硬塞。
 *
 * 本模块是纯函数，不碰磁盘；落盘在 project.createProject（overrides 参数）。
 */

import { CORE_SETTING_DOC, DOC_TEMPLATES, POSITIONING_DOC } from "./templates";

/** 引导答案（全部可留空；留空 = 对应模板字段保持「待填写」） */
export interface OnboardingAnswers {
  /** 主类型与最想带给读者的感受（01-开书定位） */
  genre: string;
  /** 目标平台与读者（01-开书定位） */
  audience: string;
  /** 一句话故事（01-开书定位） */
  premise: string;
  /** 主角是谁，当前最想做成什么（01-开书定位） */
  protagonist: string;
  /** 不行动或失败会失去什么（01-开书定位） */
  stakes: string;
  /** 时代、地点与本阶段环境（02-核心设定） */
  world: string;
  /** 关键能力、职业、技术或制度（02-核心设定） */
  mechanism: string;
  /** 核心冲突与结局方向（02-核心设定） */
  conflict: string;
  /** 开局发生的具体事件（01-开书定位） */
  opening: string;
  /** 预计篇幅及依据（01-开书定位） */
  length: string;
}

/** 全空答案（向导的初始值；也是「是否填过任何东西」的比较基准） */
export const EMPTY_ONBOARDING: OnboardingAnswers = {
  genre: "",
  audience: "",
  premise: "",
  protagonist: "",
  stakes: "",
  world: "",
  mechanism: "",
  conflict: "",
  opening: "",
  length: "",
};

/** 字段 → 模板里的逐字行标签（模板改版时同步这里；对不上就放弃填充，见模块头契约） */
const FIELD_MAP: { key: keyof OnboardingAnswers; label: string }[] = [
  { key: "genre", label: "主类型与最想带给读者的感受" },
  { key: "audience", label: "目标平台与读者" },
  { key: "premise", label: "一句话故事" },
  { key: "protagonist", label: "主角是谁，当前最想做成什么" },
  { key: "stakes", label: "不行动或失败会失去什么" },
  { key: "opening", label: "开局发生的具体事件" },
  { key: "length", label: "预计篇幅及依据" },
];

const CORE_FIELD_MAP: { key: keyof OnboardingAnswers; label: string }[] = [
  { key: "world", label: "时代、地点与本阶段环境" },
  { key: "mechanism", label: "关键能力、职业、技术或制度" },
  { key: "conflict", label: "核心冲突与结局方向" },
];

/**
 * 把模板 content 里 `- {label}：待填写` 这一行替换为 `- {label}：{value}`（只动第一处）。
 * 多行答案压成一行（模板字段是一行一条；换行用「；」接上，不破坏行结构）。
 * value 为空或该行不存在时原样返回 —— 宁可不填，不硬塞。
 */
export function fillTemplateField(content: string, label: string, value: string): string {
  const v = value.trim().replace(/\s*\r?\n\s*/g, "；");
  if (v === "") return content;
  const line = `- ${label}：待填写`;
  const i = content.indexOf(line);
  if (i < 0) return content;
  return `${content.slice(0, i)}- ${label}：${v}${content.slice(i + line.length)}`;
}

/**
 * 答案 → 模板覆盖内容：key = 模板文件名（01-开书定位.md / 02-核心设定.md），
 * value = 填好答案的模板正文（\n 行尾、{书名} 占位仍在 —— 落盘时由
 * createProject 走同一个 renderTemplate 统一替换与转 CRLF）。
 * 一份文档一个字段都没填就不进 Map（createProject 会回落到原模板）。
 */
export function onboardingOverrides(answers: OnboardingAnswers): Map<string, string> {
  const out = new Map<string, string>();
  const fill = (doc: string, fields: { key: keyof OnboardingAnswers; label: string }[]) => {
    // 惰性取模板：只有真有字段要填时才去 DOC_TEMPLATES 里找原文
    let content: string | null = null;
    for (const f of fields) {
      const v = answers[f.key].trim();
      if (v === "") continue;
      if (content === null) {
        // 模板缺失视为"没有可填的文档"：放弃这份，不造半个文件
        content = docContentOf(doc);
        if (content === null) return;
      }
      content = fillTemplateField(content, f.label, v);
    }
    if (content !== null) out.set(doc, content);
  };
  fill(POSITIONING_DOC, FIELD_MAP);
  fill(CORE_SETTING_DOC, CORE_FIELD_MAP);
  return out;
}

/** 从 14 件套里取某份模板的原文（找不到返回 null —— 模板被删时不造文件；模板只有这一份真源） */
function docContentOf(doc: string): string | null {
  const tpl = DOC_TEMPLATES.find((t) => t.name === doc);
  return tpl ? tpl.content : null;
}
