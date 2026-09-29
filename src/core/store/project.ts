/**
 * 作品目录协议（KeepCompose 单主线工作流）。
 *
 *   <booksRoot>\<书名>\小说资料\*.md        ← 维护文档（14 件套 + 用户自建 + 审核\ + 个人改稿\）
 *   <booksRoot>\<书名>\章节内容\第N章.md    ← 正式正文（唯一事实源）
 *   <booksRoot>\<书名>\待确认\第N章-v*.md   ← 初稿与候选（采用后进正文，旧稿归档 已处理\）
 *   <booksRoot>\<书名>\writerd_oplog\       ← 用户操作日志（系统级，左栏不显示）
 *   <booksRoot>\<书名>\.openwrite_manifest.json
 *   <booksRoot>\.openwrite_recycle\          ← 回收站（作品根级）
 *
 * 「格式优先」在这一层的含义：**只读不判**。读取时不解释、不纠正、不补模板，
 * 用户自建的任何文档一律平级列出。旧布局作品（三件套）同样原样展示，不做迁移。
 */

import type { FsBridge } from "../fsbridge";
import {
  isSystemEntryName,
  PROJECT_DIRS,
  join,
  projectChaptersDir,
  projectDocsDir,
  projectManifestFile,
  projectPendingDir,
  projectProcessedDir,
  recycleRoot,
} from "../dirs";
import { parseManifest, serializeManifest, type ProjectManifest } from "./manifest";
import { compareChapterFiles, stripMd } from "./chapter";
import { DOC_TEMPLATES, renderTemplate } from "./templates";
import { childNameProblem } from "./names";

export interface ProjectRef {
  /** 作品根绝对路径 */
  root: string;
  /** 作品名（目录名） */
  name: string;
  /** 最后修改时间（毫秒） */
  mtimeMs: number;
}

export interface FileRef {
  /** 文件名（含扩展名） */
  name: string;
  /** 相对作品根的路径，'\' 分隔 */
  rel: string;
  /** 绝对路径 */
  path: string;
  size: number;
  mtimeMs: number;
}

/** 文件类别：决定标签页行为（堆叠/单槽、只读默认、回流路径） */
export type FileKind = "doc" | "chapter" | "candidate";

/** 按相对路径判定类别（'\' 或 '/' 分隔都接受） */
export function kindForRel(rel: string): FileKind {
  const r = rel.replace(/\//g, "\\");
  if (r.startsWith(PROJECT_DIRS.chapters + "\\")) return "chapter";
  if (r.startsWith(PROJECT_DIRS.pending + "\\")) return "candidate";
  return "doc";
}

/** 列出作品根下的全部作品（跳过系统条目：隐藏目录、`writerd_*` 与回收站清单） */
export async function scanBooksRoot(fs: FsBridge, booksRoot: string): Promise<ProjectRef[]> {
  const entries = await fs.list(booksRoot);
  const out: ProjectRef[] = [];
  for (const e of entries) {
    if (!e.isDir) continue;
    // 只跳 `.` 前缀是不够的：作品根下出现 writerd_* 目录时会被当成作品列出来
    if (isSystemEntryName(e.name)) continue;
    out.push({ root: e.path, name: e.name, mtimeMs: e.mtimeMs });
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out;
}

/** 维护文档（小说资料\*.md，不含子目录），按文件名排序 */
export async function listDocs(fs: FsBridge, projectRoot: string): Promise<FileRef[]> {
  const dir = projectDocsDir(projectRoot);
  const entries = await fs.list(dir);
  return entries
    .filter((e) => !e.isDir && /\.md$/i.test(e.name))
    .map((e) => ({
      name: e.name,
      rel: join(PROJECT_DIRS.docs, e.name),
      path: e.path,
      size: e.size,
      mtimeMs: e.mtimeMs,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
}

/** 正式章节（章节内容\*.md），按章号数值排序 */
export async function listChapters(fs: FsBridge, projectRoot: string): Promise<FileRef[]> {
  const dir = projectChaptersDir(projectRoot);
  const entries = await fs.list(dir);
  return entries
    .filter((e) => !e.isDir && /\.md$/i.test(e.name))
    .map((e) => ({
      name: e.name,
      rel: join(PROJECT_DIRS.chapters, e.name),
      path: e.path,
      size: e.size,
      mtimeMs: e.mtimeMs,
    }))
    .sort((a, b) => compareChapterFiles(a.name, b.name));
}

/** 候选稿（待确认\*.md，不含 已处理 子目录），按章号排序 */
export async function listPending(fs: FsBridge, projectRoot: string): Promise<FileRef[]> {
  const dir = projectPendingDir(projectRoot);
  const entries = await fs.list(dir);
  return entries
    .filter((e) => !e.isDir && /\.md$/i.test(e.name))
    .map((e) => ({
      name: e.name,
      rel: join(PROJECT_DIRS.pending, e.name),
      path: e.path,
      size: e.size,
      mtimeMs: e.mtimeMs,
    }))
    .sort((a, b) => compareChapterFiles(a.name, b.name));
}

/** 已处理旧稿（待确认\已处理\*.md），按名称排序 */
export async function listProcessed(fs: FsBridge, projectRoot: string): Promise<FileRef[]> {
  const dir = projectProcessedDir(projectRoot);
  const entries = await fs.list(dir);
  return entries
    .filter((e) => !e.isDir && /\.md$/i.test(e.name))
    .map((e) => ({
      name: e.name,
      rel: join(PROJECT_DIRS.pending, PROJECT_DIRS.processed, e.name),
      path: e.path,
      size: e.size,
      mtimeMs: e.mtimeMs,
    }))
    .sort((a, b) => compareChapterFiles(a.name, b.name));
}

/** 作品内的全部根级 md 文件（旧布局兼容展示用） */
export async function listProjectRootFiles(fs: FsBridge, projectRoot: string): Promise<FileRef[]> {
  const entries = await fs.list(projectRoot);
  return entries
    .filter((e) => !e.isDir && /\.md$/i.test(e.name))
    .map((e) => ({
      name: e.name,
      rel: e.name,
      path: e.path,
      size: e.size,
      mtimeMs: e.mtimeMs,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
}

// ────────────────────────────── 通用内容树 ──────────────────────────────

/** 内容树节点：目录或文件的统一形态（children 仅目录非空） */
export interface ContentNode {
  name: string;
  /** 相对作品根路径，'\' 分隔；根为 '' */
  rel: string;
  path: string;
  isDir: boolean;
  size: number;
  mtimeMs: number;
  children: ContentNode[];
}

/** 目录树排序：已知内容目录按固定次序在前，其余按名称；文件按类别排序 */
const DIR_ORDER: Record<string, number> = {
  [PROJECT_DIRS.docs]: 0,
  [PROJECT_DIRS.chapters]: 1,
  [PROJECT_DIRS.pending]: 2,
};

function compareNodes(a: ContentNode, b: ContentNode, parentRel: string): number {
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1; // 目录在前
  if (a.isDir) {
    const oa = DIR_ORDER[a.name] ?? 99;
    const ob = DIR_ORDER[b.name] ?? 99;
    if (oa !== ob) return oa - ob;
    return a.name.localeCompare(b.name, "zh-Hans-CN");
  }
  if (parentRel === PROJECT_DIRS.chapters || parentRel.startsWith(PROJECT_DIRS.pending)) {
    return compareChapterFiles(a.name, b.name);
  }
  return a.name.localeCompare(b.name, "zh-Hans-CN");
}

/**
 * 递归构建作品内容树（左栏数据源）。
 * 排除系统条目（.openwrite_* / writerd_* / recycle_manifest.json，见 isSystemEntryName）；
 * 深度上限 maxDepth 层（作品根直接子级为第 1 层）——同时防御异常嵌套与
 * 符号链接成环：即使目录互相链接，递归也会在深度上限处截断，不会无限展开。
 * fs.list 对不存在/不可读的目录返回 []，残缺作品不会抛错。
 */
export async function buildContentTree(
  fs: FsBridge,
  projectRoot: string,
  maxDepth = 4,
): Promise<ContentNode[]> {
  const walk = async (dir: string, rel: string, depth: number): Promise<ContentNode[]> => {
    if (depth > maxDepth) return [];
    const entries = await fs.list(dir);
    const nodes: ContentNode[] = [];
    for (const e of entries) {
      if (isSystemEntryName(e.name)) continue;
      const childRel = rel === "" ? e.name : join(rel, e.name);
      if (e.isDir) {
        nodes.push({
          name: e.name,
          rel: childRel,
          path: e.path,
          isDir: true,
          size: 0,
          mtimeMs: e.mtimeMs,
          children: await walk(e.path, childRel, depth + 1),
        });
      } else {
        nodes.push({
          name: e.name,
          rel: childRel,
          path: e.path,
          isDir: false,
          size: e.size,
          mtimeMs: e.mtimeMs,
          children: [],
        });
      }
    }
    nodes.sort((a, b) => compareNodes(a, b, rel));
    return nodes;
  };
  return walk(projectRoot, "", 1);
}

// ────────────────────────────── 作品装载 ──────────────────────────────

export interface ProjectData {
  ref: ProjectRef;
  docs: FileRef[];
  chapters: FileRef[];
  pending: FileRef[];
  processed: FileRef[];
  rootFiles: FileRef[];
  /** 通用内容树（左栏渲染数据源） */
  tree: ContentNode[];
  manifest: ProjectManifest;
}

/**
 * 读一个作品的全部索引信息。
 * 容错约定：清单缺失/损坏按空清单处理（不抛错）；各子目录缺失时对应列表为空
 * （fs.list 契约：目录不存在返回 []）；stat 失败时 mtimeMs 记 0。
 * 只读不判——不补模板、不迁移旧布局，读到什么展示什么。
 */
export async function loadProject(fs: FsBridge, projectRoot: string, name?: string): Promise<ProjectData> {
  const st = await fs.stat(projectRoot);
  const manifestPath = projectManifestFile(projectRoot);
  let manifest: ProjectManifest;
  try {
    manifest = parseManifest((await fs.exists(manifestPath)) ? await fs.readText(manifestPath) : "");
  } catch {
    manifest = parseManifest("");
  }
  return {
    ref: {
      root: projectRoot,
      name: name ?? projectRoot.split(/[\\/]+/).filter(Boolean).pop() ?? projectRoot,
      mtimeMs: st?.mtimeMs ?? 0,
    },
    docs: await listDocs(fs, projectRoot),
    chapters: await listChapters(fs, projectRoot),
    pending: await listPending(fs, projectRoot),
    processed: await listProcessed(fs, projectRoot),
    rootFiles: await listProjectRootFiles(fs, projectRoot),
    tree: await buildContentTree(fs, projectRoot),
    manifest,
  };
}

/**
 * 新建作品：14 件套模板 + 三个基础目录（小说资料/章节内容/待确认）+ 空清单。
 * 模板经 renderTemplate 替换 {书名} 占位并统一 CRLF 落盘（既有磁盘格式）。
 * 「审核」「个人改稿」「待确认\已处理」按首次使用创建，不预建。
 * 名字走 names.childNameProblem（与删除路径同一份规则）：保留设备名、冒号(ADS)、
 * 尾随空格/点、控制字符都在建目录之前挡掉，错误信息是人话而不是系统报错。
 * exists→mkdir 非原子，双开应用同时建同名作品属未定义行为（单机单实例场景可接受）。
 */
export async function createProject(fs: FsBridge, booksRoot: string, name: string): Promise<ProjectRef> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("书名不能为空");
  const problem = childNameProblem(trimmed);
  if (problem) throw new Error(`书名不合法：${problem}`);

  const root = join(booksRoot, trimmed);
  if (await fs.exists(root)) throw new Error(`作品已存在：${trimmed}`);

  await fs.mkdir(projectDocsDir(root));
  await fs.mkdir(projectChaptersDir(root));
  await fs.mkdir(projectPendingDir(root));
  for (const tpl of DOC_TEMPLATES) {
    await fs.writeText(join(projectDocsDir(root), tpl.name), renderTemplate(tpl.content, trimmed));
  }
  await fs.writeText(projectManifestFile(root), serializeManifest(parseManifest("")));
  const st = await fs.stat(root);
  return { root, name: trimmed, mtimeMs: st?.mtimeMs ?? Date.now() };
}

/** 读取任意作品内文件（只走 fs 原语，不做内容加工） */
export async function readProjectFile(fs: FsBridge, path: string): Promise<string> {
  return fs.readText(path);
}

/** 写入作品内文件（写前快照由上层调用 snapshot 模块负责） */
export async function writeProjectFile(fs: FsBridge, path: string, content: string): Promise<void> {
  await fs.writeText(path, content);
}

/** 是否为受管作品：以作品清单 .openwrite_manifest.json 的存在为准（仅目录存在不算） */
export async function projectExists(fs: FsBridge, root: string): Promise<boolean> {
  return fs.exists(projectManifestFile(root));
}

/** 作品回收站根（作品根级，保持既有格式） */
export function booksRecycleRoot(booksRoot: string): string {
  return recycleRoot(booksRoot);
}

/**
 * 从候选/章节文件名提取章号标签（如 `第3章-v2-候选.md` → `第3章`）；无法识别返回 null。
 * 数字字符类与 chapter.ts 的 CHAPTER_RE 保持一致（含中文数字与繁体大写 壹贰叁…），
 * 标签按文件名原文截取（全角数字不做半角化），仅去除内部空白。
 */
export function chapterLabelOf(fileName: string): string | null {
  const m = /^第\s*[0-9０-９零〇一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟萬]+\s*[章节卷回部集]/.exec(stripMd(fileName));
  return m ? m[0].replace(/\s+/g, "") : null;
}
