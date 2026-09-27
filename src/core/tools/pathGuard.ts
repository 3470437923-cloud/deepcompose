/**
 * 路径分级授权（CONTRACT §10）。
 *
 * 三个授权根：projectRoot / skillsDir / booksRoot —— 根内及子目录**直读**，
 * 根外必须用户确认。判定用归一化路径，**I/O 保留调用方大小写**（CONTRACT §6.4）。
 *
 * 逐字文案（TOOLS.md §3.3 #4，证据 app_so_full_utf16.txt:00316a38）：
 *   `路径在项目/skill 目录外，需用户确认，但确认机制未启用: `
 */

import { join, isDriveRoot, relative } from "../dirs";

export interface GuardRoots {
  projectRoot: string | null;
  skillsDir: string;
  booksRoot: string;
  /** 本次会话中用户已明确授权的额外目录（前缀匹配） */
  allowedDirs?: string[];
}

export interface ResolvedPath {
  /** 用于 I/O 的绝对路径（保留调用方大小写） */
  abs: string;
  /** 相对项目根的路径（'\\' 分隔）；不在项目内为 null */
  rel: string | null;
  /** 相对哪个授权根（用于结果里回报相对路径） */
  base: string | null;
}

export const NEEDS_CONFIRMATION_PREFIX = "路径在项目/skill 目录外，需用户确认，但确认机制未启用: ";

/** Windows 路径归一化：统一分隔符、折叠 . 与末尾分隔符（仅用于判定） */
export function normalizeForCompare(p: string): string {
  const unified = p.replace(/\//g, "\\");
  const parts: string[] = [];
  for (const seg of unified.split("\\")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  return parts.join("\\").toLowerCase();
}

export function isInside(root: string, target: string): boolean {
  if (!root) return false;
  const r = normalizeForCompare(root);
  const t = normalizeForCompare(target);
  return t === r || t.startsWith(r + "\\");
}

/**
 * 解析工具传入的路径：
 *  - 相对路径 → 相对 projectRoot；
 *  - 绝对路径 → 原样；
 *  - 传入目录（"." 或空）→ 项目根。
 */
export function resolveToolPath(input: string, roots: GuardRoots): ResolvedPath {
  const raw = (input ?? "").trim();
  const isAbs = /^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith("\\\\") || raw.startsWith("/");

  if (raw === "" || raw === "." || raw === "./" || raw === ".\\") {
    const base = roots.projectRoot ?? roots.booksRoot;
    return { abs: base, rel: roots.projectRoot ? "" : null, base };
  }
  if (isAbs) {
    const abs = raw.replace(/\//g, "\\");
    return { abs, rel: roots.projectRoot ? relative(roots.projectRoot, abs) : null, base: null };
  }
  const base = roots.projectRoot ?? roots.booksRoot;
  const abs = join(base, raw.replace(/\//g, "\\"));
  return { abs, rel: roots.projectRoot ? relative(roots.projectRoot, abs) : null, base };
}

export interface GuardDecision {
  ok: boolean;
  /** 拒绝时的逐字文案 */
  message?: string;
  resolved: ResolvedPath;
}

/** 判定是否可直接访问 */
export function guardPath(input: string, roots: GuardRoots): GuardDecision {
  const resolved = resolveToolPath(input, roots);
  const abs = resolved.abs;

  if (isDriveRoot(abs)) {
    return { ok: false, message: NEEDS_CONFIRMATION_PREFIX + abs, resolved };
  }
  const authorized = [
    roots.projectRoot,
    roots.skillsDir,
    roots.booksRoot,
    ...(roots.allowedDirs ?? []),
  ].filter((r): r is string => Boolean(r));

  for (const root of authorized) {
    if (isInside(root, abs)) return { ok: true, resolved };
  }
  return { ok: false, message: NEEDS_CONFIRMATION_PREFIX + abs, resolved };
}

/** 工具结果里汇报给模型的相对路径：优先相对项目根，其次相对授权根 */
export function reportPath(resolved: ResolvedPath): string {
  if (resolved.rel !== null) return resolved.rel === "" ? "." : resolved.rel.replace(/\\/g, "/");
  return resolved.abs;
}
