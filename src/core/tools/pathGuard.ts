/**
 * 路径分级授权。
 *
 * 三个授权根：projectRoot / skillsDir / booksRoot —— 根内及子目录**直读**，
 * 根外必须用户确认。判定用归一化路径，**I/O 保留调用方大小写**。
 *
 * 逐字文案：
 *   `路径在项目/skill 目录外，需用户确认，但确认机制未启用: `
 */

import { join, isDriveRoot, relative } from "../dirs";

/** 授权判定用的根集合：三个固定授权根 + 本次会话中用户明确授权的额外目录 */
export interface GuardRoots {
  projectRoot: string | null;
  skillsDir: string;
  booksRoot: string;
  /** 本次会话中用户已明确授权的额外目录（前缀匹配） */
  allowedDirs?: string[];
}

export interface ResolvedPath {
  /** 用于 I/O 的绝对路径（保留调用方大小写与 '..' 原样，不做词法折叠） */
  abs: string;
  /** 相对项目根的路径（'\\' 分隔）；不在项目内为 null */
  rel: string | null;
  /** 相对路径输入的解析基准（projectRoot，缺省 booksRoot）；绝对路径输入为 null */
  base: string | null;
}

/** 根外拒绝文案的逐字前缀（回归锁：调用方与测试都按前缀断言，不可改动） */
export const NEEDS_CONFIRMATION_PREFIX = "路径在项目/skill 目录外，需用户确认，但确认机制未启用: ";

/**
 * Windows 路径归一化：统一分隔符、折叠 '.' 与 '..'、去空段、转小写。
 * **仅用于授权判定**；任何 I/O 与结果回报都必须用原路径（保留调用方大小写）。
 * '..' 采用词法回退：连续 '..' 可以把盘符也抵消掉（C:\..\x → "x"），
 * 归一化结果不再与任何授权根同形，穿越路径会落入"根外需确认"而不会放行。
 */
export function normalizeForCompare(p: string): string {
  const unified = p.replace(/\//g, "\\");
  const parts: string[] = [];
  for (const seg of unified.split("\\")) {
    if (seg === "" || seg === ".") continue; // 连续/尾部分隔符与 '.' 无语义
    if (seg === "..") {
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  return parts.join("\\").toLowerCase();
}

/**
 * 判定 target 是否为 root 本身或其子路径。
 * 大小写不敏感；边界以 '\' 对齐（root + "\" 前缀匹配），避免 C:\ab 被误判进 C:\a。
 * 空 root 不授权任何路径。
 */
export function isInside(root: string, target: string): boolean {
  if (!root) return false;
  const r = normalizeForCompare(root);
  const t = normalizeForCompare(target);
  return t === r || t.startsWith(r + "\\");
}

/**
 * 解析工具传入的路径：
 *  - 相对路径 → 相对 projectRoot（未绑定项目时退到 booksRoot）拼接；
 *  - 绝对路径（盘符 `C:\`、UNC `\\server\share`、`/` 或 `\` 开头）→ 原样保留，仅统一分隔符；
 *  - 传入目录（"" / "." / "./" / ".\"）→ 解析为项目根。
 * 返回的 abs 不做 '..' 折叠（I/O 用调用方原样）；授权判定由 guardPath 归一化后做。
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

/**
 * 判定路径是否可直接访问：三授权根（projectRoot / skillsDir / booksRoot）
 * 与会话内追加授权目录（allowedDirs，前缀匹配）之内 → 放行；
 * 盘符根与一切根外路径 → ok:false + 逐字"需确认"文案（确认机制未启用即拒绝）。
 */
export function guardPath(input: string, roots: GuardRoots): GuardDecision {
  const resolved = resolveToolPath(input, roots);
  const abs = resolved.abs;

  // 盘符根（C:\ 等）范围过大，即使恰好是某授权根的祖先也一律要求确认
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

/**
 * 工具结果里汇报给模型的路径：
 * 项目内 → 相对项目根（'/' 分隔，根本身回报 "."）；
 * 项目外（含技能目录等其它授权根）→ 原样绝对路径。
 */
export function reportPath(resolved: ResolvedPath): string {
  if (resolved.rel !== null) return resolved.rel === "" ? "." : resolved.rel.replace(/\\/g, "/");
  return resolved.abs;
}
