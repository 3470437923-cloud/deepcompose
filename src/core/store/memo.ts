/**
 * 备忘录（单文件 writerd_memos.json，格式取自实测样本）：
 *   {
 *     "categories": ["默认", "灵感", "大纲"],
 *     "memos": [{
 *       "id": "1779819137257",                       // 毫秒时间戳字符串
 *       "title": "无标题",
 *       "content": "...",
 *       "created_at": "2026-05-27T02:12:17.257787",  // 本地时间 ISO，6 位微秒
 *       "updated_at": "...",
 *       "project_id": "C:\\...\\某本书"               // 绝对路径；空串=全局
 *     }]
 *   }
 * 实测样本：<Documents>\writerd_memos.json（2026-09-28）。
 */

import type { FsBridge } from "../fsbridge";
import { isoMicros } from "../ids";

export interface Memo {
  id: string;
  title: string;
  content: string;
  /** 所属分类（实测样本中 memo 均带此键，值如「默认」） */
  category: string;
  created_at: string;
  updated_at: string;
  project_id: string;
}

export interface MemoFile {
  categories: string[];
  memos: Memo[];
}

/** 默认分类（实测文件含 默认/灵感/大纲；新装默认只有 默认） */
export const DEFAULT_CATEGORY = "默认";

export function emptyMemoFile(): MemoFile {
  return { categories: [DEFAULT_CATEGORY], memos: [] };
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

export async function loadMemos(fs: FsBridge, file: string): Promise<MemoFile> {
  if (!(await fs.exists(file))) return emptyMemoFile();
  try {
    const raw = stripBom(await fs.readText(file));
    const j = JSON.parse(raw) as Partial<MemoFile>;
    return {
      categories: Array.isArray(j.categories) && j.categories.length > 0 ? j.categories : [DEFAULT_CATEGORY],
      memos: Array.isArray(j.memos) ? j.memos : [],
    };
  } catch {
    // 文件损坏时不吞掉用户数据：按空处理但由调用方决定是否覆写
    return emptyMemoFile();
  }
}

export async function saveMemos(fs: FsBridge, file: string, data: MemoFile): Promise<void> {
  await fs.writeText(file, JSON.stringify(data, null, 2));
}

export function newMemo(projectId: string, now = new Date()): Memo {
  return {
    id: String(now.getTime()),
    title: "无标题",
    content: "",
    category: DEFAULT_CATEGORY,
    created_at: isoMicros(now),
    updated_at: isoMicros(now),
    project_id: projectId,
  };
}

/** 分类操作：默认分类不可删除（实测界面 chips 中「默认」无 ×） */
export function removeCategory(data: MemoFile, name: string): MemoFile {
  if (name === DEFAULT_CATEGORY) return data;
  return { ...data, categories: data.categories.filter((c) => c !== name) };
}

export function addCategory(data: MemoFile, name: string): MemoFile {
  const n = name.trim();
  if (n === "" || data.categories.includes(n)) return data;
  return { ...data, categories: [...data.categories, n] };
}
