/**
 * 工具实现。
 *
 * 结果 JSON 的字段名与形态**保持既有格式**（实测样本：127 个会话里的 1,729 条工具调用结果），
 * 例如：
 *   file_read(read)   {"path":"小说资料/世界观.md","content":"…"}
 *   file_read(list)   {"path":"章节内容","files":[{"name":"第1章.md","path":"章节内容\\第1章.md","type":"file","size":7652}]}
 *   file_write(write) {"success":true,"operation":"write","path":"…","bytes_written":40610}
 *   file_write(repl.) {"success":true,"operation":"replace","path":"…","replace_all":false}
 *   file_manage(search){"success":true,"search_text":"…","results":[{"file":"小说资料\\人物库.md","matches":[{"line":49,"content":"…"}]}],"files_found":N}
 *   file_manage(del)  {"success":true,"operation":"delete","path":"…","type":"file"}
 *   question          {"output":"User has answered your questions: \"…\"=\"…\". You can now continue with the user's answers in mind.","answers":["…"]}
 *   skill_lookup      {"skill_name":"novel-writer","content":"---\nname: …"}
 *   error             {"error":"operation is required"}
 */

import type { FsBridge } from "../fsbridge";
import { join } from "../dirs";
import { createProject } from "../store/project";
import { contentHash, recordSnapshot, type PreviousType, type SnapshotOperation } from "../store/snapshot";
import { guardPath, reportPath, type GuardRoots } from "./pathGuard";

/** read 分页：单次最多返回的行数（与 spec.ts 的 limit 描述一致） */
export const MAX_READ_LINES = 2000;
/** read 分页：未传 limit 时的默认行数 */
export const DEFAULT_READ_LINES = 2000;
/** list 分页：单次最多返回的条目数（与 spec.ts 的 limit 描述一致） */
export const MAX_LIST_ENTRIES = 500;
/** list 分页：未传 limit 时的默认条目数 */
export const DEFAULT_LIST_ENTRIES = 200;

/** question 工具的单个选项（label 必填，description 供界面补充说明） */
export interface QuestionOption {
  label: string;
  description?: string;
}
/** question 工具的单个问题（multi_select=true 时允许多选） */
export interface QuestionItem {
  question: string;
  options: QuestionOption[];
  multi_select?: boolean;
}

/** skill_lookup 的命中结果（skill_name 用技能的 name 字段回报） */
export interface SkillHit {
  skill_name: string;
  content: string;
}

/** 一次工具执行所需的全部环境（由 agent 循环装配；界面回调按工具可选注入） */
export interface ToolContext {
  fs: FsBridge;
  roots: GuardRoots;
  booksRoot: string;
  snapshotsDir: string;
  sessionId: string;
  /** 当前工具调用 id（写进快照的 callId，保持既有格式） */
  currentCallId?: string;
  /** 写入前留快照（默认 true） */
  snapshot?: boolean;
  /** question 工具的界面回调 */
  askQuestions?: (questions: QuestionItem[]) => Promise<string[][]>;
  /** skill_lookup 的技能读取 */
  lookupSkill?: (nameOrId: string) => Promise<SkillHit | null>;
}

type Args = Record<string, unknown>;

/** 统一的错误结果形态：{"error":"…"}（既有格式，回归锁） */
function err(message: string): string {
  return JSON.stringify({ error: message });
}

/** 统一的成功结果形态：字段序即 JSON 序（既有格式对字段名与形态都有实证） */
function ok(obj: Record<string, unknown>): string {
  return JSON.stringify(obj);
}

/** 取字符串参数：缺失或类型不符返回 undefined（不做隐式转换） */
function str(a: Args, k: string): string | undefined {
  const v = a[k];
  return typeof v === "string" ? v : undefined;
}
/** 取整数参数：接受 number 与整数字符串，截断小数；其余返回 undefined */
function int(a: Args, k: string): number | undefined {
  const v = a[k];
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && /^-?\d+$/.test(v)) return parseInt(v, 10);
  return undefined;
}
/** 取布尔参数：缺失或类型不符回落默认值 */
function bool(a: Args, k: string, def: boolean): boolean {
  const v = a[k];
  return typeof v === "boolean" ? v : def;
}

/** 结果里回报的路径一律用 '/'（既有 file_read/file_write 结果即如此） */
function slashPath(p: string): string {
  return p.replace(/\\/g, "/");
}

/** 内容的 UTF-8 字节数（bytes_written 字段用，不是 UTF-16 码元数） */
function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).length;
}

/**
 * 落一条快照（保持既有格式：一条记录同时带写前内容与写后哈希）。
 * previousType 缺省按 exists 推导为 file/none；**目录操作须显式传 "directory"**
 * （契约 PreviousType 含该枚举；目录的 previousContent 恒为 null）。
 */
async function recordWrite(
  ctx: ToolContext,
  operation: SnapshotOperation,
  relPath: string,
  previous: string | null,
  exists: boolean,
  postContent: string | null,
  renameNewPath: string | null = null,
  previousType: PreviousType = exists ? "file" : "none",
): Promise<void> {
  if (ctx.snapshot === false) return;
  await recordSnapshot(ctx.fs, ctx.snapshotsDir, {
    sessionId: ctx.sessionId,
    callId: ctx.currentCallId ?? "",
    operation,
    relativePath: slashPath(relPath),
    previousContent: previous,
    previousExists: exists,
    previousType,
    renameNewPath,
    postContentHash: postContent === null ? null : await contentHash(postContent),
  });
}

// ────────────────────────────── file_read ──────────────────────────────

/**
 * file_read：read（按 1-based 行号分页取内容）/ list（按条目下标分页列直接子项）。
 * 结果形态保持既有格式：read → {path, content}；list → {path, files:[{name,path,type,size}]}。
 */
async function fileRead(ctx: ToolContext, a: Args): Promise<string> {
  const operation = str(a, "operation");
  if (!operation) return err("operation is required");
  const pathArg = str(a, "path");
  if (pathArg === undefined) return err("path is required");
  if (operation !== "read" && operation !== "list") return err("Unknown operation: " + operation);

  const g = guardPath(pathArg, ctx.roots);
  if (!g.ok) return err(g.message!);
  const { abs } = g.resolved;
  const reported = reportPath(g.resolved);

  // 路径不存在时统一报 "Directory not found"（既有逐字文案，read 文件缺失也用它，回归锁）
  const st = await ctx.fs.stat(abs);
  if (st === null) return err(`Directory not found: ${reported}`);

  if (operation === "list") {
    if (!st.isDir) return err(`Not a directory: ${reported}`);
    const offset = Math.max(0, int(a, "offset") ?? 0);
    const limitRaw = int(a, "limit") ?? DEFAULT_LIST_ENTRIES;
    const limit = Math.min(Math.max(1, limitRaw), MAX_LIST_ENTRIES);
    const entries = await ctx.fs.list(abs);
    const page = entries.slice(offset, offset + limit);
    // 条目 path：项目内 → 相对项目根（'\' 分隔，保持既有格式样本）；项目外 → 绝对路径
    const relBase = g.resolved.rel;
    return ok({
      path: reported,
      files: page.map((e) => ({
        name: e.name,
        path: relBase === null ? e.path : join(relBase, e.name),
        type: e.isDir ? "directory" : "file",
        size: e.isDir ? null : e.size,
      })),
    });
  }

  if (st.isDir) return err(`Is a directory: ${reported}`);
  const content = await ctx.fs.readText(abs);
  const offset = Math.max(1, int(a, "offset") ?? 1);
  const limitRaw = int(a, "limit") ?? DEFAULT_READ_LINES;
  const limit = Math.min(Math.max(1, limitRaw), MAX_READ_LINES);

  // 兼容 CRLF/CR/LF 三种换行；分页结果统一以 '\n' 连接（既有行为）
  const allLines = content.split(/\r\n|\r|\n/);
  const slice = allLines.slice(offset - 1, offset - 1 + limit).join("\n");
  return ok({ path: reported, content: slice });
}

// ────────────────────────────── file_write ──────────────────────────────

/**
 * file_write：write（覆盖/新建）/ append（追加）/ replace（查找替换）/
 * insert（按 position 插入）/ delete_lines（按 1-based 闭区间删行）。
 * 全部操作先读旧内容 → 计算新内容 → 写盘 → 落快照（快照带写前内容与写后哈希）。
 */
async function fileWrite(ctx: ToolContext, a: Args): Promise<string> {
  const operation = str(a, "operation");
  if (!operation) return err("operation is required");
  const pathArg = str(a, "path");
  if (pathArg === undefined) return err("path is required");

  const ops = ["write", "append", "replace", "insert", "delete_lines"];
  if (!ops.includes(operation)) return err("Unknown operation: " + operation);

  // content 判 null 也判 undefined：否则 JSON null 会通过校验，String(null) 把字面量 "null" 写进文件
  if (operation === "write" && (a.content === undefined || a.content === null)) return err("content is required for write operation");
  if (operation === "append" && (a.content === undefined || a.content === null)) return err("content is required for append operation");
  if (operation === "replace" && !str(a, "old_text")) return err("old_text is required for replace operation");
  if (operation === "insert" && a.new_text === undefined) return err("new_text is required for insert operation");
  if (operation === "delete_lines" && (int(a, "start_line") === undefined || int(a, "end_line") === undefined)) {
    return err("start_line and end_line are required for delete_lines operation");
  }
  if (operation === "insert") {
    const pos = str(a, "position") ?? "end";
    // position 非法时沿用既有的 "Unknown operation" 文案（保持既有格式，不改措辞）
    if (!["start", "end", "after_line"].includes(pos)) return err("Unknown operation: " + pos);
    if (pos === "after_line" && int(a, "after_line") === undefined) return err("Invalid after_line number");
  }

  const g = guardPath(pathArg, ctx.roots);
  if (!g.ok) return err(g.message!);
  const { abs } = g.resolved;
  const reported = slashPath(reportPath(g.resolved));

  // 写前先取旧内容与存在性：既是 append/replace/insert/delete_lines 的输入，也是快照的"写前"半段
  const exists = await ctx.fs.exists(abs);
  const previous = exists ? await ctx.fs.readText(abs) : null;

  let next: string;
  let extra: Record<string, unknown> = {};

  switch (operation) {
    case "write": {
      // 覆盖/新建：bytes_written 是 UTF-8 字节数（既有格式字段）
      next = String(a.content);
      extra = { bytes_written: utf8Bytes(next) };
      break;
    }
    case "append": {
      // 追加：目标不存在等价于新建；结果不带 bytes_written（既有格式即如此）
      next = (previous ?? "") + String(a.content);
      break;
    }
    case "replace": {
      const oldText = str(a, "old_text") ?? "";
      const newText = a.new_text === undefined ? "" : String(a.new_text);
      const replaceAll = bool(a, "replace_all", false);
      const src = previous ?? "";
      if (!src.includes(oldText)) return err(`Text not found: ${oldText}`);
      // new_text 一律按字面量处理：String.replace 的字符串替换会展开 $&/$'/$` 等模式，
      // 用 split/join 与函数式替换规避（正文里出现 "$&" 不该被替换成匹配文本）
      next = replaceAll ? src.split(oldText).join(newText) : src.replace(oldText, () => newText);
      extra = { replace_all: replaceAll };
      break;
    }
    case "insert": {
      const pos = str(a, "position") ?? "end";
      const text = String(a.new_text ?? a.content ?? "");
      const src = previous ?? "";
      // 沿用文件既有换行风格（检测到 CRLF 用 CRLF，否则 LF），避免插入把整文件换行搅乱
      const eol = src.includes("\r\n") ? "\r\n" : "\n";
      const lines = src === "" ? [] : src.split(/\r\n|\r|\n/);
      if (pos === "start") {
        next = text + (text.endsWith(eol) || text === "" ? "" : eol) + src;
      } else if (pos === "end") {
        next = src + (src === "" || src.endsWith("\n") ? "" : eol) + text;
      } else {
        // after_line 为 1-based：after=0 表示插到首行前，after=行数 表示插到末尾
        const after = int(a, "after_line")!;
        if (after < 0 || after > lines.length) return err("Invalid after_line number");
        const head = lines.slice(0, after).join(eol);
        const tail = lines.slice(after).join(eol);
        next = head + (head === "" ? "" : eol) + text + (tail === "" ? "" : eol + tail);
      }
      extra = { position: pos };
      break;
    }
    case "delete_lines": {
      const start = int(a, "start_line")!;
      const end = int(a, "end_line")!;
      const src = previous ?? "";
      const eol = src.includes("\r\n") ? "\r\n" : "\n";
      const lines = src.split(/\r\n|\r|\n/);
      if (start < 1 || end < start || start > lines.length) return err("Invalid line range");
      // 闭区间 [start, end]，end 越界时截到文件尾；重拼时保持原换行风格
      const removed = lines.slice(start - 1, Math.min(end, lines.length));
      next = [...lines.slice(0, start - 1), ...lines.slice(Math.min(end, lines.length))].join(eol);
      extra = { deleted_lines: removed.length };
      break;
    }
    default:
      return err("Unknown operation: " + operation);
  }

  await ctx.fs.writeText(abs, next);
  await recordWrite(ctx, operation as SnapshotOperation, reportPath(g.resolved), previous, exists, next);
  return ok({ success: true, operation, path: reported, ...extra });
}

// ────────────────────────────── file_manage ──────────────────────────────

/**
 * file_manage：search（全项目/指定目录内搜 md/txt 文本）/ delete / rename / copy。
 * delete 与 rename 先落快照再动盘（快照是回滚的唯一依据）；
 * copy 不落快照（不破坏源；目标被覆盖的风险见审计报告）。
 */
async function fileManage(ctx: ToolContext, a: Args): Promise<string> {
  const operation = str(a, "operation");
  if (!operation) return err("operation is required");
  const pathArg = str(a, "path");
  if (pathArg === undefined) return err("path is required");

  const g = guardPath(pathArg, ctx.roots);
  if (!g.ok) return err(g.message!);
  const { abs } = g.resolved;

  switch (operation) {
    case "search": {
      const needle = str(a, "search_text");
      if (!needle) return err("search_text is required for search operation");
      const dirArg = str(a, "directory");
      // directory 同样必须过授权判定：否则可以拿它绕过 path 的分级授权，
      // 逐文件读出根外目录里的 md/txt 内容
      const gDir = dirArg ? guardPath(dirArg, ctx.roots) : null;
      if (gDir && !gDir.ok) return err(gDir.message!);
      const start = gDir ? gDir.resolved : g.resolved;
      // 结果 file 字段的相对基准：项目内 → 相对项目根（'\' 分隔，与实测样本一致）；
      // 项目外 → 绝对路径。不能用 reportPath：它把项目根回报成 "."，会拼出 ".\xxx" 前缀。
      const startRel = start.rel ?? start.abs;
      const results: { file: string; matches: { line: number; content: string }[] }[] = [];
      let filesFound = 0;

      // 递归扫 md/txt：跳过 '.' 开头的系统目录；每文件最多报 50 条命中（防止大文件刷爆结果）
      const walk = async (dir: string, rel: string): Promise<void> => {
        const entries = await ctx.fs.list(dir);
        for (const e of entries) {
          const childRel = rel === "" ? e.name : join(rel, e.name);
          if (e.isDir) {
            if (e.name.startsWith(".")) continue;
            await walk(e.path, childRel);
            continue;
          }
          if (!/\.(md|txt)$/i.test(e.name)) continue;
          const text = await ctx.fs.readText(e.path);
          const lines = text.split(/\r\n|\r|\n/);
          const matches: { line: number; content: string }[] = [];
          lines.forEach((l, i) => {
            if (l.includes(needle)) matches.push({ line: i + 1, content: l });
          });
          if (matches.length > 0) {
            filesFound++;
            results.push({ file: childRel, matches: matches.slice(0, 50) });
          }
        }
      };
      await walk(start.abs, startRel);
      return ok({ success: true, search_text: needle, results, files_found: filesFound });
    }
    case "delete": {
      const st = await ctx.fs.stat(abs);
      if (st === null) return err(`Directory not found: ${slashPath(reportPath(g.resolved))}`);
      const previous = st.isDir ? null : await ctx.fs.readText(abs);
      // 先落快照再删；目录要记 previousType:"directory"（目录的 previousContent 恒为 null，
      // 回滚时靠类型区分"重建目录"与"回写文件"两种语义）
      await recordWrite(ctx, "delete", reportPath(g.resolved), previous, true, null, null, st.isDir ? "directory" : "file");
      await ctx.fs.remove(abs, st.isDir);
      return ok({
        success: true,
        operation: "delete",
        path: slashPath(reportPath(g.resolved)),
        type: st.isDir ? "directory" : "file",
      });
    }
    case "rename":
    case "copy": {
      const newPathArg = str(a, "new_path");
      if (!newPathArg) return err(`new_path is required for ${operation} operation`);
      const g2 = guardPath(newPathArg, ctx.roots);
      if (!g2.ok) return err(g2.message!);
      if (operation === "rename") {
        const st = await ctx.fs.stat(abs);
        if (st === null) return err(`Directory not found: ${slashPath(reportPath(g.resolved))}`);
        const previous = st.isDir ? null : await ctx.fs.readText(abs);
        // rename 快照：relativePath 记源路径、renameNewPath 记新路径；内容不变故写后哈希用原内容
        await recordWrite(
          ctx,
          "rename",
          reportPath(g.resolved),
          previous,
          true,
          previous,
          slashPath(reportPath(g2.resolved)),
          st.isDir ? "directory" : "file",
        );
        await ctx.fs.rename(abs, g2.resolved.abs);
      } else {
        await ctx.fs.copy(abs, g2.resolved.abs);
      }
      return ok({
        success: true,
        operation,
        path: slashPath(reportPath(g.resolved)),
        new_path: slashPath(reportPath(g2.resolved)),
      });
    }
    default:
      return err("Unknown operation: " + operation);
  }
}

// ────────────────────────────── create_project / question / skill_lookup ──────────────────────────────

/**
 * create_project：在作品根下新建作品（14 件套模板 + 基础目录，见 store/project）。
 * 业务失败（重名/非法书名）以 {"error":"…"} 回报，不抛出。
 */
async function createProjectTool(ctx: ToolContext, a: Args): Promise<string> {
  const name = str(a, "name");
  if (!name) return err("name is required");
  try {
    const ref = await createProject(ctx.fs, ctx.booksRoot, name);
    return ok({ success: true, name: ref.name, path: ref.root });
  } catch (e) {
    return err(String(e instanceof Error ? e.message : e));
  }
}

/**
 * question：把问题交给界面回调等待用户作答，结果保持既有格式
 * {output:"User has answered your questions: …", answers:[…]}。
 * 多选答案以「、」连接；某题空答（未选/跳过）时该题的 "=…" 为空串，answers 里不出现。
 */
async function questionTool(ctx: ToolContext, a: Args): Promise<string> {
  const raw = a.questions;
  if (!Array.isArray(raw) || raw.length === 0) return err("questions is required and must not be empty");
  const questions = raw as QuestionItem[];
  if (!ctx.askQuestions) {
    return err("当前没有可用的提问通道（界面未就绪），请直接继续创作");
  }
  const answers = await ctx.askQuestions(questions);
  // answers 与 questions 按序对应；回调少答/漏答的题按空数组兜底，不让下标越界
  const flat = answers.flat();
  const pairs = questions
    .map((q, i) => `"${q.question}"="${(answers[i] ?? []).join("、")}"`)
    .join(", ");
  return ok({
    output: `User has answered your questions: ${pairs}. You can now continue with the user's answers in mind.`,
    answers: flat,
  });
}

/**
 * skill_lookup：按技能名或 id 加载 SKILL.md 正文（含目录说明）。
 * 未命中 / 提问通道未装配时回报既有格式的 "Skill not found: …"。
 */
async function skillLookupTool(ctx: ToolContext, a: Args): Promise<string> {
  const name = str(a, "skill_name");
  if (!name) return err("skill_name is required");
  if (!ctx.lookupSkill) return err(`Skill not found: ${name}`);
  const hit = await ctx.lookupSkill(name);
  if (!hit) return err(`Skill not found: ${name}. Check the Available Skills list for valid skill names.`);
  return ok({ skill_name: hit.skill_name, content: hit.content });
}

// ────────────────────────────── 分发 ──────────────────────────────

/** 带当前调用 id 的工具上下文（agent 循环每个 tool call 覆盖 currentCallId 后传入） */
export interface ToolContextWithCall extends ToolContext {
  currentCallId?: string;
}

/**
 * 执行一个工具调用，返回**结果 JSON 字符串**（写入会话的 toolCalls[].result）。
 * 本函数自身不抛业务异常：参数坏、路径越权、目标缺失都回报 {"error":"…"}；
 * I/O 层意外异常由调用方（agent 循环）兜底转成同形态错误 JSON。
 */
export async function executeTool(
  ctx: ToolContextWithCall,
  name: string,
  argsJson: string | Record<string, unknown>,
): Promise<string> {
  let args: Args;
  if (typeof argsJson === "string") {
    try {
      args = JSON.parse(argsJson) as Args;
    } catch {
      return err("工具参数不是合法 JSON");
    }
  } else {
    args = argsJson;
  }
  // 模型可能给出 null / 标量参数体：按空参数集走正常的"缺参"错误分支，而不是抛 TypeError
  if (args === null || typeof args !== "object") args = {};

  switch (name) {
    case "file_read":
      return fileRead(ctx, args);
    case "file_write":
      return fileWrite(ctx, args);
    case "file_manage":
      return fileManage(ctx, args);
    case "create_project":
      return createProjectTool(ctx, args);
    case "question":
      return questionTool(ctx, args);
    case "skill_lookup":
      return skillLookupTool(ctx, args);
    default:
      return err("Unsupported operation: " + name);
  }
}
