/**
 * 快捷提示词（B17）：聊天输入区上方提示词栏的可编辑清单。
 *
 * 落盘（additive 契约，2026-10-06 用户裁决「自己判断」后定）：新文件
 * `<Documents>\writerd_quick_prompts.json`——与备忘录同手法（单文件 JSON、
 * 可随时删除、不动 prefs 封闭键集合），全局一份、不按作品分。
 * 形态：{"version":1,"prompts":[{"id","label","text"}]}。
 *
 * 纪律：文件缺失/损坏 → 回落内置默认清单（不抛错）；首次启动由调用方把默认
 * 清单落盘一次（与内置技能「只补缺失」同一手法），之后用户增删改都以文件为准。
 */

import type { FsBridge } from "../fsbridge";

export interface QuickPrompt {
  id: string;
  /** 条目名（栏里显示的短名） */
  label: string;
  /** 点击后填进输入框的完整提示词 */
  text: string;
}

export const QUICK_PROMPTS_VERSION = 1;

/**
 * 内置默认清单。四个文本与 MainWorkbench 欢迎页快捷提示同源（欢迎页是静态展示，
 * 提示词栏才是可编辑的那份；两者由同一份常量派生，不各写一遍）。
 */
export const DEFAULT_QUICK_PROMPTS: readonly QuickPrompt[] = [
  {
    id: "write-next",
    label: "写下一章",
    text:
      "请按 novel-writer 主线写下一章候选。先读 小说资料/00-项目状态.md 确认当前章节与当前细纲指针，读当前细纲与上一章正文；" +
      "再读 小说资料/06-写作风格.md 里点名的正文场面入口，从中选两处与本章最接近的连续场面读原文，作为声线样本。只读风格规则不算出声线校准，不默认通读全书。" +
      "动笔前先用两三句说明本章的主要场面是哪一段、哪些是可合并的过场，细纲列出的事项不必逐项分配篇幅。" +
      "起草时让人物的欲望和性格驱动动作，甜暖只作为全章落点，场面中间允许烦躁、别扭和出错。完整思路可以跨行展开，不要把每个动作都切成单独一句。" +
      "只保留 待确认/第N章-候选.md 一个候选文件（N 为下一章节号），在同一文件内完成起草、逐段修改与全文复读，写前快照由系统保留，不另存初稿或第二版；已有用户稿先保留，未经授权不覆盖。" +
      "全文复读要核对三件事：声线是否像那两处样本、主要场面是否兑现、有没有为凑改动而改顺畅的段落。更新 00 的候选指针与进度时，在「下一步」写明复读过的候选和这三件事的结论；没有复读完就如实写当前步骤，不写「待用户确认」。" +
      "交付只报题目、字数和完成了哪几步，不附自评。先不采用、不回写正式追踪表。",
  },
  {
    id: "onboarding-fill",
    label: "补齐开书材料",
    text:
      "请读 小说资料/00-项目状态.md、01-开书定位.md 和 02-核心设定.md，先列出已经写定的内容，只挑出真正影响当前方向的缺口来问我，一次问少量问题。" +
      "讨论清楚后再整理进文件；拿不准的方向保留为候选并标明，不要替我定稿，也不要逐项重问已经有答案的部分。",
  },
  {
    id: "xigang-next",
    label: "续补下一段细纲",
    text:
      "请按 细纲/ 的规则准备下一段细纲（覆盖 3 章，每章约四段自然段）。先读 04-粗纲 里对应的弧段和最近一章正文，列出你计划细排的章节范围和依据，经我确认后再写入文件。" +
      "每章写明主要场面是哪一段、哪些是可合并或可省略的过场、哪些事实必须成立。细纲是场面组织的依据，不是逐项分配镜头的脚本，不要把每个事项都写成确定镜头。",
  },
  {
    id: "style-habits",
    label: "总结我的改稿习惯",
    text:
      "请读 小说资料/个人改稿/ 下的改稿对比记录和规则台账，以及 writerd_oplog 里的改稿日志，只归纳跨章重复出现的改稿判断。单次出现的改动先记为观察，不晋升为规则。" +
      "逐条列出并用 question 请我确认；我确认的才合并进 06-写作风格.md（禁用列表或风格规则，按条目性质），被否决的留档。不复制我的原句，每条写清适用场景和边界，避免把一次偏好写成处处适用的禁令。",
  },
];

/** 解析提示词文件：缺失/损坏/形态不对一律回落默认清单（复制一份，调用方可直接改） */
export function parseQuickPrompts(text: string): QuickPrompt[] {
  try {
    const cleaned = text.replace(/^﻿/, "");
    if (!cleaned.trim()) return [...DEFAULT_QUICK_PROMPTS];
    const raw: unknown = JSON.parse(cleaned);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [...DEFAULT_QUICK_PROMPTS];
    const arr = (raw as { prompts?: unknown }).prompts;
    if (!Array.isArray(arr)) return [...DEFAULT_QUICK_PROMPTS];
    const out: QuickPrompt[] = [];
    for (const it of arr) {
      if (!it || typeof it !== "object" || Array.isArray(it)) continue;
      const o = it as Record<string, unknown>;
      if (typeof o.id !== "string" || typeof o.text !== "string") continue;
      out.push({ id: o.id, label: typeof o.label === "string" && o.label !== "" ? o.label : o.text.slice(0, 12), text: o.text });
    }
    return out;
  } catch {
    return [...DEFAULT_QUICK_PROMPTS];
  }
}

/** 序列化（两空格缩进，与备忘录文件同风格） */
export function serializeQuickPrompts(prompts: readonly QuickPrompt[]): string {
  return JSON.stringify({ version: QUICK_PROMPTS_VERSION, prompts }, null, 2);
}

/** 读取：文件不存在返回 null（调用方据此做首次播种），存在则按容错口径解析 */
export async function loadQuickPrompts(fs: FsBridge, file: string): Promise<QuickPrompt[] | null> {
  if (!(await fs.exists(file))) return null;
  return parseQuickPrompts(await fs.readText(file));
}

/** 写盘（父目录由 fs 桥自动创建） */
export async function saveQuickPrompts(fs: FsBridge, file: string, prompts: readonly QuickPrompt[]): Promise<void> {
  await fs.writeText(file, serializeQuickPrompts(prompts));
}

/** 新条目 id（毫秒时间戳 + 随机后缀；与 ids.newMemo 同一量级的碰撞纪律） */
export function newQuickPromptId(now = new Date()): string {
  return `qp_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
