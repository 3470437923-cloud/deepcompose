/**
 * 工具 schema（描述串沿用既有原文，保持逐字一致）。
 *
 * 纪律：
 *  - 描述与参数文案**逐字**沿用既有原文；
 *  - 描述串仅剥掉尾随的 `r`（全库 179 例）；
 *  - 参数名以**实测会话**为准（如 file_read 的参数是 `operation`，
 *    实测样本：真实工具调用 `{"operation": "list", "path": "."}`）；
 *  - 只有名字、没有逐字描述串的参数保守地不写 description，
 *    不自行编造。
 */

import type { ToolSchema } from "../ai/protocol";

/** file_read：读文件 / 列目录 */
export const FILE_READ: ToolSchema = {
  name: "file_read",
  description:
    "Read a file or list a directory. Supports both relative paths (relative to the current project root) and absolute paths. Files inside the current project or an installed skill directory are read directly; other external paths require user confirmation. For large files, use offset (1-based line) and limit to page through content; output is capped to keep responses small.",
  parameters: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["read", "list"],
        description: 'Required: "read" to read text file content, "list" to list directory contents with mtime_ms (Unix milliseconds). Binary archives must be opened with an archive tool.',
      },
      path: {
        type: "string",
        description:
          "File or directory path. Relative paths resolve against the current project root; absolute paths are also accepted.",
      },
      offset: {
        type: "integer",
        description:
          "Pagination start. read: 1-based line number (default 1). list: entry index (default 0).",
      },
      char_offset: { type: "integer", description: "UTF-16 character offset within the first requested line; default 0. When truncated use next_offset and next_char_offset together to resume without losing text." },
      limit: {
        type: "integer",
        description:
          "Max items to return. read: lines (default 2000, max 2000), also capped at 24000 characters with continuation fields. list: entries (default 200, max 500).",
      },
    },
    required: ["operation", "path"],
  },
};

/** file_write：写入 / 追加 / 替换 / 插入 / 删行（既有编辑操作都在此工具上） */
export const FILE_WRITE: ToolSchema = {
  name: "file_write",
  description:
    'Write, append, or edit files. Operations: "write" (overwrite/create), "append" (add to end), "replace" (find and replace text, set replace_all=true to replace ALL occurrences, default replaces first only), "insert" (insert at position), "delete_lines" (remove lines; returns deleted_content preview, truncation, remaining_lines and post_content_hash). Successful writes return a snapshot receipt. Use file_manage list_snapshots/read_snapshot for this exact path and receipt session_id to browse saved previous content without requesting app-data path permission; restore_snapshot requires an explicit ID and current hash. Replace reports match/replacement counts; misses suggest actual source lines without applying fuzzy edits.',
  parameters: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["write", "append", "replace", "insert", "delete_lines"],
      },
      path: {
        type: "string",
        description:
          "File or directory path. Relative paths resolve against the current project root; absolute paths are also accepted.",
      },
      content: { type: "string", description: "Content to write, append, or insert" },
      old_text: { type: "string", description: 'Text to find and replace (for "replace" operation)' },
      new_text: { type: "string", description: "New text for replace or insert operations" },
      replace_all: {
        type: "boolean",
        description:
          'For "replace" operation: if true, replace ALL occurrences; if false (default), replace first occurrence only',
      },
      position: {
        type: "string",
        enum: ["start", "end", "after_line"],
        description: 'Where to insert: "start", "end", or "after_line"',
      },
      after_line: {
        type: "integer",
        description: 'Line number after which to insert (for "insert" with position "after_line")',
      },
      start_line: { type: "integer", description: "Start line number for delete (1-based)" },
      end_line: {
        type: "integer",
        description: "End line number for delete (1-based, inclusive)",
      },
    },
    required: ["operation", "path"],
  },
};

/** file_manage：搜索 / 删除 / 改名 / 复制 */
export const FILE_MANAGE: ToolSchema = {
  name: "file_manage",
  description:
    "File modification operations: search content in files, delete files or empty directories, rename file/directory, copy file/directory. Nonempty directory deletion is refused; delete files individually to retain snapshots. Copying a directory requires a new destination and never merges into an existing directory. For live directory listing or file content use file_read. Snapshot operations list/preview previous versions for the exact project file without exposing other app-data files. To undo: list_snapshots, read_snapshot with explicit snapshot_id, then restore_snapshot with that ID and expected_current_hash; never restore an author-deleted file based on inference.",
  parameters: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["search", "list_snapshots", "read_snapshot", "restore_snapshot", "delete", "rename", "copy"],
        description:
          'Operation type: "search" to find text in files, "delete" to remove file, "list_snapshots" to list this path history, "read_snapshot" to preview a named previous version, "restore_snapshot" to restore an explicit snapshot with expected_current_hash, "rename" to rename file, "copy" to duplicate file',
      },
      path: {
        type: "string",
        description:
          "File or directory path. Relative paths resolve against the current project root; absolute paths are also accepted.",
      },
      search_text: { type: "string" },
      new_path: { type: "string" },
      snapshot_id: { type: "string", description: "Required for read_snapshot and restore_snapshot; obtain IDs from list_snapshots for this exact path." },
      session_id: { type: "string", description: "Snapshot session from a prior write receipt; defaults to current session." },
      expected_current_hash: { type: "string", description: "Required by restore_snapshot: current SHA-256 from read_snapshot, or missing for a tool-deleted file. Refuses later edits and manual deletions." },
      offset: { type: "integer", description: "Zero-based pagination offset for list_snapshots and read_snapshot." },
      limit: { type: "integer", description: "Snapshot page size: at most 20 entries or 8000 text units." },
      directory: {
        type: "string",
        description: 'Optional directory override for search. Without it, search path: any single text file (including .jsonl) or a directory recursively (common text/log formats). Binary files are rejected; excluded/unreadable files are reported. Matches use bounded excerpts with column/truncated, at most 50 lines per file, 100 returned files, 24000 excerpt UTF-16 units total and 32000 UTF-8 bytes for the COMPLETE JSON response. search_text must be at most 400 UTF-16 units. Top-level truncated is true for any clipped excerpt or omitted match/detail; total_matches counts matching lines and omitted_files counts matching files with no returned match. Quota and omission statistics are always returned. Use an explicit file search and file_read for omitted content. Use path="." for the project; hidden descendant directories are skipped.',
      },
    },
    required: ["operation", "path"],
  },
};

/** create_project：创建小说项目 */
export const CREATE_PROJECT: ToolSchema = {
  name: "create_project",
  description:
    "Create a new novel project with the given name. IMPORTANT: Before using this tool, check Available Skills above and call skill_lookup with the matching skill name. If no skill matches, proceed directly.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "The name of the new novel project (book title)" },
    },
    required: ["name"],
  },
};

/** question：向用户提问（2–4 个互斥选项） */
export const QUESTION: ToolSchema = {
  name: "question",
  description:
    "Ask the user questions during execution: gather preferences, clarify instructions, or offer choices. Each question has 2-4 options and supports single or multiple selection.",
  parameters: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        description: "Questions to ask the user",
        items: {
          type: "object",
          properties: {
            question: { type: "string", description: "The complete question to ask the user" },
            options: {
              type: "array",
              description:
                "The available choices for this question. Must have 2-4 options. Each option should be a distinct, mutually exclusive choice.",
              items: {
                type: "object",
                properties: {
                  label: { type: "string" },
                  description: { type: "string" },
                },
                required: ["label"],
              },
            },
            multi_select: {
              type: "boolean",
              description:
                "Set to true to allow the user to select multiple options instead of just one.",
            },
          },
          required: ["question", "options"],
        },
      },
    },
    required: ["questions"],
  },
};

/** skill_lookup：按需加载技能正文 */
export const SKILL_LOOKUP: ToolSchema = {
  name: "skill_lookup",
  description:
    'Load a specialized skill on demand. Returns the skill\'s SKILL.md instructions, the skill\'s base directory path, and a sampled list of files in that directory (scripts/ for executable helpers, references/ for documentation, assets/ for output resources). Bundled files are NOT inlined — use file_read with the returned base directory to inspect them as needed. Call this when a user request matches a skill description listed under "Available Skills" in the system prompt.',
  parameters: {
    type: "object",
    properties: {
      skill_name: {
        type: "string",
        description: "The skill name exactly as shown in Available Skills, or the skill ID",
      },
    },
    required: ["skill_name"],
  },
};

/** 已实现的工具集合（顺序即注入顺序；与 exec.ts executeTool 的分发分支一一对应） */
export const IMPLEMENTED_TOOLS: ToolSchema[] = [
  FILE_READ,
  FILE_WRITE,
  FILE_MANAGE,
  CREATE_PROJECT,
  QUESTION,
  SKILL_LOOKUP,
];

/** 按名字取工具 schema 子集：未实现/拼错的名字静默跳过，返回顺序随入参 names */
export function toolsByName(names: string[]): ToolSchema[] {
  const all = IMPLEMENTED_TOOLS;
  return names
    .map((n) => all.find((t) => t.name === n))
    .filter((t): t is ToolSchema => Boolean(t));
}
