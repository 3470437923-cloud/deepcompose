/**
 * 作品清单 `.openwrite_manifest.json`（保持既有格式）。
 *
 * 实测样本（C:\Users\Administrator\AI写小说\测试书籍\.openwrite_manifest.json）：
 * {"version":1,"updatedAt":"2026-09-27T22:00:35.918741",
 *  "items":{"item_1790517635918741_g2mpat":{"id":"item_1790517635918741_g2mpat","kind":"file",
 *    "physicalPath":"章节内容/1.md","displayName":"1.md",
 *    "createdAt":"2026-09-27T22:00:35.918741","updatedAt":"2026-09-27T22:00:35.918741"}},
 *  "orders":{"章节内容":["legacy:章节内容/1.md","item_1790517635918741_g2mpat"]},
 *  "manualOrderParents":[]}
 *
 * 作用：把「物理文件名」与「显示名/排序」解耦——用户改名只动 displayName，
 * 磁盘上的物理路径保持不变（这正是「格式优先」能成立的前提）。
 */

import { isoMicros, newItemId } from "../ids";

export type ManifestKind = "file" | "directory";

export interface ManifestItem {
  id: string;
  kind: ManifestKind;
  /** 相对作品根的路径，'/' 分隔（实测为 '/'） */
  physicalPath: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectManifest {
  version: number;
  updatedAt: string;
  items: Record<string, ManifestItem>;
  /** 父目录相对路径 → 有序的条目引用（条目 id 或 "legacy:<物理路径>"） */
  orders: Record<string, string[]>;
  manualOrderParents: string[];
}

export const MANIFEST_VERSION = 1;

export function emptyManifest(now: Date = new Date()): ProjectManifest {
  return {
    version: MANIFEST_VERSION,
    updatedAt: isoMicros(now),
    items: {},
    orders: {},
    manualOrderParents: [],
  };
}

/** 解析；空/损坏内容按空清单处理（既有行为：缺失文件视为空清单） */
export function parseManifest(text: string, now: Date = new Date()): ProjectManifest {
  if (!text || !text.trim()) return emptyManifest(now);
  const raw: unknown = JSON.parse(text);
  if (typeof raw !== "object" || raw === null) throw new Error("manifest 不是对象");
  const m = raw as Partial<ProjectManifest>;
  return {
    version: typeof m.version === "number" ? m.version : MANIFEST_VERSION,
    updatedAt: typeof m.updatedAt === "string" ? m.updatedAt : isoMicros(now),
    items: (m.items as Record<string, ManifestItem>) ?? {},
    orders: (m.orders as Record<string, string[]>) ?? {},
    manualOrderParents: Array.isArray(m.manualOrderParents) ? m.manualOrderParents : [],
  };
}

export function serializeManifest(m: ProjectManifest): string {
  return JSON.stringify(m);
}

export function legacyRef(physicalPath: string): string {
  return `legacy:${physicalPath}`;
}

/** 按物理路径找条目（同一物理路径只允许一条） */
export function findByPhysicalPath(m: ProjectManifest, physicalPath: string): ManifestItem | null {
  for (const it of Object.values(m.items)) {
    if (it.physicalPath === physicalPath) return it;
  }
  return null;
}

/** 新增或更新条目（按物理路径去重），并同步父目录 order */
export function upsertItem(
  m: ProjectManifest,
  input: { physicalPath: string; displayName?: string; kind?: ManifestKind },
  now: Date = new Date(),
): { manifest: ProjectManifest; item: ManifestItem } {
  const stamp = isoMicros(now);
  const parent = parentRel(input.physicalPath);
  const existing = findByPhysicalPath(m, input.physicalPath);

  const item: ManifestItem = existing
    ? {
        ...existing,
        displayName: input.displayName ?? existing.displayName,
        kind: input.kind ?? existing.kind,
        updatedAt: stamp,
      }
    : {
        id: newItemId(now),
        kind: input.kind ?? "file",
        physicalPath: input.physicalPath,
        displayName: input.displayName ?? basenameRel(input.physicalPath),
        createdAt: stamp,
        updatedAt: stamp,
      };

  const items = { ...m.items, [item.id]: item };
  const orders = { ...m.orders };
  const list = [...(orders[parent] ?? [])];
  const ref = legacyRef(input.physicalPath);
  const withoutDup = list.filter((r) => r !== ref && r !== item.id);
  withoutDup.push(item.id);
  orders[parent] = withoutDup;

  return { manifest: { ...m, items, orders, updatedAt: stamp }, item };
}

export function removeItem(m: ProjectManifest, id: string, now: Date = new Date()): ProjectManifest {
  const item = m.items[id];
  if (!item) return m;
  const items = { ...m.items };
  delete items[id];
  const parent = parentRel(item.physicalPath);
  const orders = { ...m.orders };
  orders[parent] = (orders[parent] ?? []).filter((r) => r !== id);
  return { ...m, items, orders, updatedAt: isoMicros(now) };
}

/** 重命名（只改显示名，物理路径不动） */
export function renameItem(
  m: ProjectManifest,
  id: string,
  displayName: string,
  now: Date = new Date(),
): ProjectManifest {
  const item = m.items[id];
  if (!item) return m;
  return {
    ...m,
    items: { ...m.items, [id]: { ...item, displayName, updatedAt: isoMicros(now) } },
    updatedAt: isoMicros(now),
  };
}

export function orderFor(m: ProjectManifest, parentRelPath: string): string[] {
  return m.orders[parentRelPath] ?? [];
}

export function parentRel(physicalPath: string): string {
  const p = physicalPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const i = p.lastIndexOf("/");
  return i < 0 ? "" : p.slice(0, i);
}

export function basenameRel(physicalPath: string): string {
  const p = physicalPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const i = p.lastIndexOf("/");
  return i < 0 ? p : p.slice(i + 1);
}
