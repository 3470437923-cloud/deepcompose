/**
 * 作品目录协议（CONTRACT §3.1）。
 *
 *   <booksRoot>\<书名>\小说资料\*.md        ← 维护文档（三件套 + 用户自建）
 *   <booksRoot>\<书名>\章节内容\第N章.md    ← 正文
 *   <booksRoot>\<书名>\.openwrite_manifest.json
 *   <booksRoot>\.openwrite_recycle\          ← 回收站（作品根级）
 *
 * 「格式优先」在这一层的含义：**只读不判**。读取时不解释、不纠正、不补模板，
 * 用户自建的任何文档（写作禁忌.md、第N卷大纲.md…）一律平级列出。
 */

import type { FsBridge } from "../fsbridge";
import {
  DEFAULT_DOCS,
  PROJECT_DIRS,
  join,
  projectChaptersDir,
  projectDocsDir,
  projectManifestFile,
  recycleRoot,
} from "../dirs";
import { parseManifest, serializeManifest, type ProjectManifest } from "./manifest";
import { compareChapterFiles, stripMd } from "./chapter";

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

/** 列出作品根下的全部作品（跳过回收站与隐藏目录） */
export async function scanBooksRoot(fs: FsBridge, booksRoot: string): Promise<ProjectRef[]> {
  const entries = await fs.list(booksRoot);
  const out: ProjectRef[] = [];
  for (const e of entries) {
    if (!e.isDir) continue;
    if (e.name.startsWith(".")) continue; // .openwrite_recycle 等
    out.push({ root: e.path, name: e.name, mtimeMs: e.mtimeMs });
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out;
}

/** 维护文档（小说资料\*.md），按文件名排序 */
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

/** 章节（章节内容\*.md），按章号数值排序 */
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

/** 作品内的全部 md 文件（用于目录树"其它文件"分支） */
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

export interface ProjectData {
  ref: ProjectRef;
  docs: FileRef[];
  chapters: FileRef[];
  rootFiles: FileRef[];
  manifest: ProjectManifest;
}

/** 读一个作品的全部索引信息 */
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
      name: name ?? projectRoot.split(/[\\/]/).filter(Boolean).pop() ?? projectRoot,
      mtimeMs: st?.mtimeMs ?? 0,
    },
    docs: await listDocs(fs, projectRoot),
    chapters: await listChapters(fs, projectRoot),
    rootFiles: await listProjectRootFiles(fs, projectRoot),
    manifest,
  };
}

/** 新建作品：建三件套 + manifest（内容与真机一致：文档只有一级标题 + CRLF） */
export async function createProject(fs: FsBridge, booksRoot: string, name: string): Promise<ProjectRef> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("书名不能为空");
  if (/[\\/:*?"<>|]/.test(trimmed)) throw new Error("书名不能包含 \\ / : * ? \" < > |");

  const root = join(booksRoot, trimmed);
  if (await fs.exists(root)) throw new Error(`作品已存在：${trimmed}`);

  await fs.mkdir(projectDocsDir(root));
  await fs.mkdir(projectChaptersDir(root));
  for (const doc of DEFAULT_DOCS) {
    await fs.writeText(join(projectDocsDir(root), doc), `# ${stripMd(doc)}\r\n`);
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

export async function projectExists(fs: FsBridge, root: string): Promise<boolean> {
  return fs.exists(projectManifestFile(root));
}

/** 作品回收站根（作品根级，与真机一致） */
export function booksRecycleRoot(booksRoot: string): string {
  return recycleRoot(booksRoot);
}
