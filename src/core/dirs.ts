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

/** 系统级条目（左栏目录树与内容扫描一律排除；'.' 开头同样视为系统）。
 *  注意："writerd_" 前缀与 recycle_manifest.json 是磁盘契约判定，不可改名。 */
export function isSystemEntryName(name: string): boolean {
  return name.startsWith(".") || name.startsWith("writerd_") || name === PROJECT_DIRS.recycleManifest;
}

/** 应用数据与配置的固定目录/文件名（磁盘契约：writerd_* 前缀、com.writerd\writerD、
 *  shared_preferences.json 均已落盘在用户机器上，一律不可改名） */
export const APP_DATA_NAMES = {
  sessions: "writerd_sessions",
  snapshots: "writerd_snapshots",
  memos: "writerd_memos.json",
  skills: "skills",
  /** token 统计（DeepCompose 新增契约：additive，可随时删除，见 DECISIONS D-023） */
  usageStats: "usage_stats.json",
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
  /** token 统计文件（`%APPDATA%\com.writerd\writerD\usage_stats.json`；additive 契约） */
  usageStatsFile: string;
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

/**
 * Windows 风格拼接：统一 '\'，去掉重复分隔符与尾部分隔符。
 * 首段保留前导分隔符（UNC 根 `\\server\share`、盘内绝对 `\a` 原样带过）；
 * 后续段剥掉首尾分隔符，剥空的段直接丢弃（否则 `join("a","\\","b")` 会拼出双分隔符）；
 * 结果以裸盘符结尾时补回盘符根形态 `C:\`。
 */
export function join(...parts: string[]): string {
  const cleaned: string[] = [];
  for (const p of parts) {
    if (p === undefined || p === null || p === "") continue;
    const isFirst = cleaned.length === 0;
    const seg = isFirst
      ? p.replace(/[\\/]+$/, "")
      : p.replace(/^[\\/]+/, "").replace(/[\\/]+$/, "");
    if (seg === "" && !isFirst) continue;
    cleaned.push(seg);
  }
  const joined = cleaned.join("\\");
  // 保留盘符根的形态 C:\
  return joined.replace(/([A-Za-z]:)$/, "$1\\");
}

/** 校验：不得选择磁盘根目录（逐字文案的判定条件）。
 *  覆盖 `C:`/`C:\` 盘符根与 `/`、`\\` 这类裸根形态。 */
export function isDriveRoot(path: string): boolean {
  const p = path.replace(/[\\/]+$/, "");
  return /^[A-Za-z]:$/.test(p) || /^[\\/]{1,2}$/.test(path);
}

/** 取路径最后一段（先剥尾部分隔符；盘符根 "C:\" 返回 "C:"，UNC 根返回末级共享名） */
export function basename(path: string): string {
  const p = path.replace(/[\\/]+$/, "");
  const i = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"));
  return i < 0 ? p : p.slice(i + 1);
}

/** 取父目录（盘符下第一段返回盘符根 "C:\"；无分隔符可剥时返回 ""） */
export function dirname(path: string): string {
  const p = path.replace(/[\\/]+$/, "");
  const i = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"));
  if (i < 0) return "";
  if (i === 2 && /^[A-Za-z]:/.test(p)) return p.slice(0, 3);
  return p.slice(0, i);
}

/**
 * 计算 target 相对 base 的路径（'\' 分隔，保留调用方大小写）；不在 base 内返回 null。
 * 前缀比较大小写不敏感（Windows 语义）；截取长度用**原串**而不是小写串——
 * toLowerCase 对个别 Unicode 字符（如 'İ'）会变长，拿小写长度切片会错位。
 */
export function relative(base: string, target: string): string | null {
  const bRaw = base.replace(/[\\/]+$/, "");
  const b = bRaw.toLowerCase();
  const t = target.replace(/[\\/]+$/, "");
  const tl = t.toLowerCase();
  if (tl === b) return "";
  if (!tl.startsWith(b + "\\")) return null;
  return t.slice(bRaw.length + 1);
}

/** 由系统目录 + prefs 覆盖项推导全部应用目录（覆盖项为空/缺失时走默认路径） */
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
    usageStatsFile: join(prefsDir, APP_DATA_NAMES.usageStats),
    logDir,
    logFile: join(logDir, APP_DATA_NAMES.logFile),
  };
}

/** 维护文档目录（<作品根>\小说资料） */
export function projectDocsDir(projectRoot: string): string {
  return join(projectRoot, PROJECT_DIRS.docs);
}

/** 正式章节目录（<作品根>\章节内容，唯一事实源） */
export function projectChaptersDir(projectRoot: string): string {
  return join(projectRoot, PROJECT_DIRS.chapters);
}

/** 候选稿目录（<作品根>\待确认） */
export function projectPendingDir(projectRoot: string): string {
  return join(projectRoot, PROJECT_DIRS.pending);
}

/** 已处理旧稿归档（<作品根>\待确认\已处理） */
export function projectProcessedDir(projectRoot: string): string {
  return join(projectRoot, PROJECT_DIRS.pending, PROJECT_DIRS.processed);
}

/** 审读报告目录（<作品根>\小说资料\审核） */
export function projectReviewDir(projectRoot: string): string {
  return join(projectRoot, PROJECT_DIRS.docs, PROJECT_DIRS.review);
}

/** 个人改稿学习记录（<作品根>\小说资料\个人改稿） */
export function projectRevisionsDir(projectRoot: string): string {
  return join(projectRoot, PROJECT_DIRS.docs, PROJECT_DIRS.revisions);
}

/** 用户操作日志目录（<作品根>\writerd_oplog，系统级，左栏不显示；名为磁盘契约） */
export function projectOplogDir(projectRoot: string): string {
  return join(projectRoot, PROJECT_DIRS.oplog);
}

/** 作品清单文件（<作品根>\.openwrite_manifest.json） */
export function projectManifestFile(projectRoot: string): string {
  return join(projectRoot, PROJECT_DIRS.manifest);
}

/** 回收站根（作品根级：<booksRoot>\.openwrite_recycle） */
export function recycleRoot(booksRoot: string): string {
  return join(booksRoot, PROJECT_DIRS.recycle);
}

/** 回收站清单文件（<回收站根>\recycle_manifest.json） */
export function recycleManifestFile(booksRoot: string): string {
  return join(recycleRoot(booksRoot), PROJECT_DIRS.recycleManifest);
}
