/**
 * 目录权威（唯一真源）。
 *
 * 目录布局保持既有格式：
 *   作品根 <booksRoot>\<书名>\小说资料\*.md  +  章节内容\第N章.md
 *   回收站 <booksRoot>\.openwrite_recycle\<id>\...  + recycle_manifest.json
 *   应用数据 <Documents>\{writerd_sessions, writerd_snapshots, writerd_memos.json, skills}
 *   配置     %APPDATA%\com.writerd\writerD\shared_preferences.json
 *
 * 命名对照：应用数据目录统一用 `writerd_` 前缀；作品根下的回收站与清单
 * 沿用既有 `.openwrite_*` 名以兼容既有数据。
 * skills 目录沿用既有名 `skills`（即 Documents\skills）。
 */

/** 作品目录协议里用到的固定名（3.0 起含候选区与回流日志；旧名保留兼容） */
export const PROJECT_DIRS = {
  /** 维护文档目录 */
  docs: "小说资料",
  /** 章节目录（正式正文） */
  chapters: "章节内容",
  /** 候选稿目录（初稿/候选，采用后进正文） */
  pending: "待确认",
  /** 已处理旧稿归档（位于 待确认 下） */
  processed: "已处理",
  /** 冷读等审读报告（位于 小说资料 下） */
  review: "审核",
  /** 个人改稿学习记录（位于 小说资料 下） */
  revisions: "个人改稿",
  /** 用户操作日志（位于作品根下，系统级，左栏不显示） */
  oplog: "writerd_oplog",
  /** 回收站根（位于作品根下） */
  recycle: ".openwrite_recycle",
  /** 作品清单（显示名/排序） */
  manifest: ".openwrite_manifest.json",
  /** 回收站清单 */
  recycleManifest: "recycle_manifest.json",
} as const;

/** 系统级条目（左栏目录树与内容扫描一律排除；'.' 开头同样视为系统） */
export function isSystemEntryName(name: string): boolean {
  return name.startsWith(".") || name.startsWith("writerd_") || name === PROJECT_DIRS.recycleManifest;
}

export const APP_DATA_NAMES = {
  sessions: "writerd_sessions",
  snapshots: "writerd_snapshots",
  memos: "writerd_memos.json",
  skills: "skills",
  prefsDir: ["com.writerd", "writerD"],
  logDir: "diagnostics",
  logFile: "diagnostic.log",
} as const;

/** 默认作品根：%USERPROFILE%\AI写小说（实测路径，非推测） */
export const DEFAULT_BOOKS_DIR_NAME = "AI写小说";

export interface AppDirs {
  /** 作品根（用户可改，见 prefs `custom_novels_dir`） */
  booksRoot: string;
  /** 技能根 */
  skillsDir: string;
  /** 会话根 */
  sessionsDir: string;
  /** 快照根 */
  snapshotsDir: string;
  /** 备忘录单文件 */
  memosFile: string;
  /** 配置单文件 */
  prefsFile: string;
  /** 配置目录 */
  prefsDir: string;
  /** 诊断日志目录 */
  logDir: string;
  /** 诊断日志文件 */
  logFile: string;
}

export interface DirsInput {
  /** 用户主目录（Rust 侧 home_dir） */
  home: string;
  /** 文档目录（Rust 侧 document_dir） */
  documents: string;
  /** 漫游配置目录（Rust 侧 config_dir = %APPDATA%） */
  appData: string;
  /** 覆盖项：来自 prefs */
  booksRoot?: string | null;
  skillsDir?: string | null;
}

/** Windows 风格拼接：统一 '\'，去掉重复分隔符与尾部分隔符 */
export function join(...parts: string[]): string {
  const cleaned = parts
    .filter((p) => p !== undefined && p !== null && p !== "")
    .map((p, i) =>
      i === 0 ? p.replace(/[\\/]+$/, "") : p.replace(/^[\\/]+/, "").replace(/[\\/]+$/, ""),
    );
  const joined = cleaned.join("\\");
  // 保留盘符根的形态 C:\
  return joined.replace(/([A-Za-z]:)$/, "$1\\");
}

/** 校验：不得选择磁盘根目录（逐字文案的判定条件） */
export function isDriveRoot(path: string): boolean {
  const p = path.replace(/[\\/]+$/, "");
  return /^[A-Za-z]:$/.test(p) || /^[\\/]{1,2}$/.test(path);
}

export function basename(path: string): string {
  const p = path.replace(/[\\/]+$/, "");
  const i = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"));
  return i < 0 ? p : p.slice(i + 1);
}

export function dirname(path: string): string {
  const p = path.replace(/[\\/]+$/, "");
  const i = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"));
  if (i < 0) return "";
  if (i === 2 && /^[A-Za-z]:/.test(p)) return p.slice(0, 3);
  return p.slice(0, i);
}

/** 计算 relative 相对 base 的路径（'\' 分隔）；不在 base 内返回 null */
export function relative(base: string, target: string): string | null {
  const b = base.replace(/[\\/]+$/, "").toLowerCase();
  const t = target.replace(/[\\/]+$/, "");
  const tl = t.toLowerCase();
  if (tl === b) return "";
  if (!tl.startsWith(b + "\\")) return null;
  return t.slice(b.length + 1);
}

export function resolveDirs(input: DirsInput): AppDirs {
  const prefsDir = join(input.appData, ...APP_DATA_NAMES.prefsDir);
  const logDir = join(prefsDir, APP_DATA_NAMES.logDir);
  return {
    booksRoot: input.booksRoot || join(input.home, DEFAULT_BOOKS_DIR_NAME),
    skillsDir: input.skillsDir || join(input.documents, APP_DATA_NAMES.skills),
    sessionsDir: join(input.documents, APP_DATA_NAMES.sessions),
    snapshotsDir: join(input.documents, APP_DATA_NAMES.snapshots),
    memosFile: join(input.documents, APP_DATA_NAMES.memos),
    prefsDir,
    prefsFile: join(prefsDir, "shared_preferences.json"),
    logDir,
    logFile: join(logDir, APP_DATA_NAMES.logFile),
  };
}

export function projectDocsDir(projectRoot: string): string {
  return join(projectRoot, PROJECT_DIRS.docs);
}

export function projectChaptersDir(projectRoot: string): string {
  return join(projectRoot, PROJECT_DIRS.chapters);
}

export function projectPendingDir(projectRoot: string): string {
  return join(projectRoot, PROJECT_DIRS.pending);
}

export function projectProcessedDir(projectRoot: string): string {
  return join(projectRoot, PROJECT_DIRS.pending, PROJECT_DIRS.processed);
}

export function projectReviewDir(projectRoot: string): string {
  return join(projectRoot, PROJECT_DIRS.docs, PROJECT_DIRS.review);
}

export function projectRevisionsDir(projectRoot: string): string {
  return join(projectRoot, PROJECT_DIRS.docs, PROJECT_DIRS.revisions);
}

export function projectOplogDir(projectRoot: string): string {
  return join(projectRoot, PROJECT_DIRS.oplog);
}

export function projectManifestFile(projectRoot: string): string {
  return join(projectRoot, PROJECT_DIRS.manifest);
}

export function recycleRoot(booksRoot: string): string {
  return join(booksRoot, PROJECT_DIRS.recycle);
}

export function recycleManifestFile(booksRoot: string): string {
  return join(recycleRoot(booksRoot), PROJECT_DIRS.recycleManifest);
}
