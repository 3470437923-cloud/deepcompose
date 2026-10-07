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
      "请按 novel-writer 主线写下一章候选：先读 小说资料/00-项目状态.md 恢复状态；" +
      "按 00 的「当前细纲」指针读 细纲/ 下的当前细纲（没有就先按 04-粗纲 建一份覆盖 3 章的细纲），再读上一段已完成细纲（有则读）；据此检索本章需要的最小资料（相关人物、地点、物品、时间、资源、伏笔），不默认读整本书；" +
      "完成完整起草、逐段修改与全文复读，只保留 待确认/第N章-候选.md 一个候选文件（N 为下一章节号），在同一文件内修改，写前快照由系统保留，不另存初稿或第二版；" +
      "本次单候选要求优先于旧技能或书内规则的双文件约定；已有用户稿先保留，未经授权不覆盖；" +
      "更新 00-项目状态 的候选指针与进度后交付，只报题目与完成状态，不附自评。先不采用、不回写正式追踪表。",
  },
  {
    id: "onboarding-fill",
    label: "补齐开书材料",
    text: "请读 小说资料/00-项目状态.md 和 01-开书定位.md，逐项和我讨论待填写内容，讨论清楚后再整理进文件，关键方向不确定的保留为候选。",
  },
  {
    id: "xigang-next",
    label: "续补下一段细纲",
    text: "请按 细纲/ 的规则建下一段细纲（覆盖 3 章，每章约四段自然段）：先列出你计划细排的章节范围和依据，经我确认后再写入文件。",
  },
  {
    id: "style-habits",
    label: "总结我的改稿习惯",
    text: "请读 小说资料/个人改稿/ 下的改稿对比记录、规则台账和 writerd_oplog 日志，归纳我跨章重复出现的改稿判断，逐条列出并用 question 请我确认；确认的条目合并进 06-写作风格.md（禁用列表或风格规则，按条目性质），不复制我的原句。",
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
