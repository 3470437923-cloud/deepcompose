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
import { contentHash, recordSnapshot } from "../store/snapshot";
import { guardPath, reportPath, type GuardRoots } from "./pathGuard";

export const MAX_READ_LINES = 2000;
export const DEFAULT_READ_LINES = 2000;
export const MAX_LIST_ENTRIES = 500;
export const DEFAULT_LIST_ENTRIES = 200;

export interface QuestionOption {
  label: string;
  description?: string;
}
export interface QuestionItem {
  question: string;
  options: QuestionOption[];
  multi_select?: boolean;
}

export interface SkillHit {
  skill_name: string;
  content: string;
}

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

function err(message: string): string {
  return JSON.stringify({ error: message });
}

function ok(obj: Record<string, unknown>): string {
  return JSON.stringify(obj);
}

function str(a: Args, k: string): string | undefined {
  const v = a[k];
  return typeof v === "string" ? v : undefined;
}
function int(a: Args, k: string): number | undefined {
  const v = a[k];
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && /^-?\d+$/.test(v)) return parseInt(v, 10);
  return undefined;
}
function bool(a: Args, k: string, def: boolean): boolean {
  const v = a[k];
  return typeof v === "boolean" ? v : def;
}

/** 结果里回报的路径一律用 '/'（既有 file_read/file_write 结果即如此） */
function slashPath(p: string): string {
  return p.replace(/\\/g, "/");
}

function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** 落一条快照（保持既有格式：一条记录同时带写前内容与写后哈希） */
async function recordWrite(
  ctx: ToolContext,
  operation: string,
  relPath: string,
  previous: string | null,
  exists: boolean,
  postContent: string | null,
  renameNewPath: string | null = null,
): Promise<void> {
  if (ctx.snapshot === false) return;
  await recordSnapshot(ctx.fs, ctx.snapshotsDir, {
    sessionId: ctx.sessionId,
    callId: ctx.currentCallId ?? "",
    operation: operation as never,
    relativePath: slashPath(relPath),
    previousContent: previous,
    previousExists: exists,
    previousType: exists ? "file" : "none",
    renameNewPath,
    postContentHash: postContent === null ? null : await contentHash(postContent),
  });
}

// ────────────────────────────── file_read ──────────────────────────────

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

  const st = await ctx.fs.stat(abs);
  if (st === null) return err(`Directory not found: ${reported}`);

  if (operation === "list") {
    if (!st.isDir) return err(`Not a directory: ${reported}`);
    const offset = Math.max(0, int(a, "offset") ?? 0);
    const limitRaw = int(a, "limit") ?? DEFAULT_LIST_ENTRIES;
    const limit = Math.min(Math.max(1, limitRaw), MAX_LIST_ENTRIES);
    const entries = await ctx.fs.list(abs);
    const page = entries.slice(offset, offset + limit);
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

  const allLines = content.split(/\r\n|\r|\n/);
  const slice = allLines.slice(offset - 1, offset - 1 + limit).join("\n");
  return ok({ path: reported, content: slice });
}

// ────────────────────────────── file_write ──────────────────────────────

async function fileWrite(ctx: ToolContext, a: Args): Promise<string> {
  const operation = str(a, "operation");
  if (!operation) return err("operation is required");
  const pathArg = str(a, "path");
  if (pathArg === undefined) return err("path is required");

  const ops = ["write", "append", "replace", "insert", "delete_lines"];
  if (!ops.includes(operation)) return err("Unknown operation: " + operation);

  if (operation === "write" && a.content === undefined) return err("content is required for write operation");
  if (operation === "append" && a.content === undefined) return err("content is required for append operation");
  if (operation === "replace" && !str(a, "old_text")) return err("old_text is required for replace operation");
  if (operation === "insert" && a.new_text === undefined) return err("new_text is required for insert operation");
  if (operation === "delete_lines" && (int(a, "start_line") === undefined || int(a, "end_line") === undefined)) {
    return err("start_line and end_line are required for delete_lines operation");
  }
  if (operation === "insert") {
    const pos = str(a, "position") ?? "end";
    if (!["start", "end", "after_line"].includes(pos)) return err("Unknown operation: " + pos);
    if (pos === "after_line" && int(a, "after_line") === undefined) return err("Invalid after_line number");
  }

  const g = guardPath(pathArg, ctx.roots);
  if (!g.ok) return err(g.message!);
  const { abs } = g.resolved;
  const reported = slashPath(reportPath(g.resolved));

  const exists = await ctx.fs.exists(abs);
  const previous = exists ? await ctx.fs.readText(abs) : null;

  let next: string;
  let extra: Record<string, unknown> = {};

  switch (operation) {
    case "write": {
      next = String(a.content);
      extra = { bytes_written: utf8Bytes(next) };
      break;
    }
    case "append": {
      next = (previous ?? "") + String(a.content);
      break;
    }
    case "replace": {
      const oldText = str(a, "old_text") ?? "";
      const newText = a.new_text === undefined ? "" : String(a.new_text);
      const replaceAll = bool(a, "replace_all", false);
      const src = previous ?? "";
      if (!src.includes(oldText)) return err(`Text not found: ${oldText}`);
      next = replaceAll ? src.split(oldText).join(newText) : src.replace(oldText, newText);
      extra = { replace_all: replaceAll };
      break;
    }
    case "insert": {
      const pos = str(a, "position") ?? "end";
      const text = String(a.new_text ?? a.content ?? "");
      const src = previous ?? "";
      const eol = src.includes("\r\n") ? "\r\n" : "\n";
      const lines = src === "" ? [] : src.split(/\r\n|\r|\n/);
      if (pos === "start") {
        next = text + (text.endsWith(eol) || text === "" ? "" : eol) + src;
      } else if (pos === "end") {
        next = src + (src === "" || src.endsWith("\n") ? "" : eol) + text;
      } else {
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
      const removed = lines.slice(start - 1, Math.min(end, lines.length));
      next = [...lines.slice(0, start - 1), ...lines.slice(Math.min(end, lines.length))].join(eol);
      extra = { deleted_lines: removed.length };
      break;
    }
    default:
      return err("Unknown operation: " + operation);
  }

  await ctx.fs.writeText(abs, next);
  await recordWrite(ctx, operation, reportPath(g.resolved), previous, exists, next);
  return ok({ success: true, operation, path: reported, ...extra });
}

// ────────────────────────────── file_manage ──────────────────────────────

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
      const startAbs = dirArg ? guardPath(dirArg, ctx.roots).resolved.abs : abs;
      const results: { file: string; matches: { line: number; content: string }[] }[] = [];
      let filesFound = 0;

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
      await walk(startAbs, reportPath(g.resolved));
      return ok({ success: true, search_text: needle, results, files_found: filesFound });
    }
    case "delete": {
      const st = await ctx.fs.stat(abs);
      if (st === null) return err(`Directory not found: ${slashPath(reportPath(g.resolved))}`);
      const previous = st.isDir ? null : await ctx.fs.readText(abs);
      await recordWrite(ctx, "delete", reportPath(g.resolved), previous, true, null);
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
        await recordWrite(
          ctx,
          "rename",
          reportPath(g.resolved),
          previous,
          true,
          previous,
          slashPath(reportPath(g2.resolved)),
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

async function questionTool(ctx: ToolContext, a: Args): Promise<string> {
  const raw = a.questions;
  if (!Array.isArray(raw) || raw.length === 0) return err("questions is required and must not be empty");
  const questions = raw as QuestionItem[];
  if (!ctx.askQuestions) {
    return err("当前没有可用的提问通道（界面未就绪），请直接继续创作");
  }
  const answers = await ctx.askQuestions(questions);
  const flat = answers.flat();
  const pairs = questions
    .map((q, i) => `"${q.question}"="${(answers[i] ?? []).join("、")}"`)
    .join(", ");
  return ok({
    output: `User has answered your questions: ${pairs}. You can now continue with the user's answers in mind.`,
    answers: flat,
  });
}

async function skillLookupTool(ctx: ToolContext, a: Args): Promise<string> {
  const name = str(a, "skill_name");
  if (!name) return err("skill_name is required");
  if (!ctx.lookupSkill) return err(`Skill not found: ${name}`);
  const hit = await ctx.lookupSkill(name);
  if (!hit) return err(`Skill not found: ${name}. Check the Available Skills list for valid skill names.`);
  return ok({ skill_name: hit.skill_name, content: hit.content });
}

// ────────────────────────────── 分发 ──────────────────────────────

export interface ToolContextWithCall extends ToolContext {
  currentCallId?: string;
}

/** 执行一个工具调用，返回**结果 JSON 字符串**（写入会话的 toolCalls[].result） */
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
