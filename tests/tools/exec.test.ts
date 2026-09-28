/**
 * 工具层：结果 JSON 的字段与形态保持既有格式（1,729 条实测调用结果实证）。
 * 同时锁路径分级授权与写前快照。
 */
import { promises as fsp } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNodeFs } from "../support/nodeFs";
import { executeTool, type ToolContext } from "../../src/core/tools/exec";
import { NEEDS_CONFIRMATION_PREFIX } from "../../src/core/tools/pathGuard";
import { parseSnapshots } from "../../src/core/store/snapshot";

let root: string;
let booksRoot: string;
let skillsDir: string;
let snapshotsDir: string;
const fs = createNodeFs();

function ctx(over: Partial<ToolContext> = {}): ToolContext {
  return {
    fs,
    booksRoot,
    snapshotsDir,
    sessionId: "sess-1",
    currentCallId: "call_1",
    roots: { projectRoot: root, skillsDir, booksRoot },
    ...over,
  };
}

beforeAll(async () => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), "writerd-tools-"));
  booksRoot = path.join(base, "AI写小说");
  root = path.join(booksRoot, "测试书籍");
  skillsDir = path.join(base, "skills");
  snapshotsDir = path.join(base, "snapshots");
  await fsp.mkdir(path.join(root, "小说资料"), { recursive: true });
  await fsp.mkdir(path.join(root, "章节内容"), { recursive: true });
  await fsp.mkdir(skillsDir, { recursive: true });
  await fsp.mkdir(snapshotsDir, { recursive: true });
  await fsp.writeFile(path.join(root, "小说资料", "世界观.md"), "# 世界观\r\n\r\n设定一\r\n", "utf8");
  await fsp.writeFile(path.join(root, "章节内容", "第1章.md"), "第一行\n第二行\n第三行\n", "utf8");
  await fsp.writeFile(path.join(root, "章节内容", "第2章.md"), "另一章\n", "utf8");
});

afterAll(async () => {
  await fsp.rm(path.dirname(root), { recursive: true, force: true });
});

describe("file_read", () => {
  it("operation 缺失 → 逐字错误", async () => {
    expect(await executeTool(ctx(), "file_read", {})).toBe('{"error":"operation is required"}');
  });

  it("path 缺失 → 逐字错误", async () => {
    expect(await executeTool(ctx(), "file_read", { operation: "read" })).toBe('{"error":"path is required"}');
  });

  it("read → {path, content}，路径用 '/'", async () => {
    const r = JSON.parse(await executeTool(ctx(), "file_read", { operation: "read", path: "小说资料/世界观.md" }));
    expect(r.path).toBe("小说资料/世界观.md");
    expect(r.content).toContain("# 世界观");
  });

  it("read 支持 offset/limit 分页（1-based 行号）", async () => {
    const r = JSON.parse(
      await executeTool(ctx(), "file_read", { operation: "read", path: "章节内容/第1章.md", offset: 2, limit: 1 }),
    );
    expect(r.content).toBe("第二行");
  });

  it("list → {path, files:[{name,path,type,size}]}，条目 path 用 '\\\\' 且相对项目根", async () => {
    const r = JSON.parse(await executeTool(ctx(), "file_read", { operation: "list", path: "章节内容" }));
    expect(r.path).toBe("章节内容");
    expect(r.files).toHaveLength(2);
    const f = r.files.find((x: { name: string }) => x.name === "第1章.md");
    expect(f.type).toBe("file");
    expect(f.path).toBe("章节内容\\第1章.md");
    expect(typeof f.size).toBe("number");
  });

  it("list 目录 → type=directory, size=null", async () => {
    const r = JSON.parse(await executeTool(ctx(), "file_read", { operation: "list", path: "." }));
    const dir = r.files.find((x: { name: string }) => x.name === "章节内容");
    expect(dir.type).toBe("directory");
    expect(dir.size).toBeNull();
  });

  it("不存在的路径 → 逐字 Directory not found", async () => {
    const r = JSON.parse(await executeTool(ctx(), "file_read", { operation: "read", path: "小说资料/不存在.md" }));
    expect(r.error).toBe("Directory not found: 小说资料/不存在.md");
  });
});

describe("file_write", () => {
  it("校验文案逐字（含操作差异）", async () => {
    const c = ctx();
    expect(await executeTool(c, "file_write", {})).toBe('{"error":"operation is required"}');
    expect(await executeTool(c, "file_write", { operation: "write" })).toBe('{"error":"path is required"}');
    expect(await executeTool(c, "file_write", { operation: "write", path: "a.md" })).toBe(
      '{"error":"content is required for write operation"}',
    );
    expect(await executeTool(c, "file_write", { operation: "append", path: "a.md" })).toBe(
      '{"error":"content is required for append operation"}',
    );
    expect(await executeTool(c, "file_write", { operation: "replace", path: "a.md" })).toBe(
      '{"error":"old_text is required for replace operation"}',
    );
    expect(await executeTool(c, "file_write", { operation: "insert", path: "a.md" })).toBe(
      '{"error":"new_text is required for insert operation"}',
    );
    expect(await executeTool(c, "file_write", { operation: "delete_lines", path: "a.md" })).toBe(
      '{"error":"start_line and end_line are required for delete_lines operation"}',
    );
    expect(await executeTool(c, "file_write", { operation: "wat", path: "a.md" })).toBe(
      '{"error":"Unknown operation: wat"}',
    );
  });

  it("write → {success,operation,path,bytes_written}", async () => {
    const r = JSON.parse(
      await executeTool(ctx(), "file_write", { operation: "write", path: "章节内容/第3章.md", content: "正文" }),
    );
    expect(r).toEqual({
      success: true,
      operation: "write",
      path: "章节内容/第3章.md",
      bytes_written: 6,
    });
    expect(await fsp.readFile(path.join(root, "章节内容", "第3章.md"), "utf8")).toBe("正文");
  });

  it("append → 只给 success/operation/path", async () => {
    const r = JSON.parse(
      await executeTool(ctx(), "file_write", { operation: "append", path: "小说资料/章节摘要.md", content: "## 第1章 摘要\n" }),
    );
    expect(r).toEqual({ success: true, operation: "append", path: "小说资料/章节摘要.md" });
  });

  it("replace → 带 replace_all 字段；默认只替换首个", async () => {
    await fsp.writeFile(path.join(root, "章节内容", "第4章.md"), "甲甲甲\n", "utf8");
    const r1 = JSON.parse(
      await executeTool(ctx(), "file_write", { operation: "replace", path: "章节内容/第4章.md", old_text: "甲", new_text: "乙" }),
    );
    expect(r1).toEqual({ success: true, operation: "replace", path: "章节内容/第4章.md", replace_all: false });
    expect(await fsp.readFile(path.join(root, "章节内容", "第4章.md"), "utf8")).toBe("乙甲甲\n");

    const r2 = JSON.parse(
      await executeTool(ctx(), "file_write", {
        operation: "replace",
        path: "章节内容/第4章.md",
        old_text: "甲",
        new_text: "乙",
        replace_all: true,
      }),
    );
    expect(r2.replace_all).toBe(true);
    expect(await fsp.readFile(path.join(root, "章节内容", "第4章.md"), "utf8")).toBe("乙乙乙\n");
  });

  it("delete_lines → 带 deleted_lines，保留原 CRLF", async () => {
    await fsp.writeFile(path.join(root, "章节内容", "第5章.md"), "一\r\n二\r\n三\r\n", "utf8");
    const r = JSON.parse(
      await executeTool(ctx(), "file_write", {
        operation: "delete_lines",
        path: "章节内容/第5章.md",
        start_line: 2,
        end_line: 2,
      }),
    );
    expect(r.deleted_lines).toBe(1);
    expect(await fsp.readFile(path.join(root, "章节内容", "第5章.md"), "utf8")).toBe("一\r\n三\r\n");
  });

  it("每次写入都落一条快照（实测样本：写前内容 + 写后哈希）", async () => {
    const s = parseSnapshots(await fsp.readFile(path.join(snapshotsDir, "sess-1.json"), "utf8"), "sess-1");
    expect(s.snapshots.length).toBeGreaterThan(0);
    const last = s.snapshots[s.snapshots.length - 1];
    expect(last.sessionId).toBe("sess-1");
    expect(last.callId).toBe("call_1");
    expect(last.operation).toBe("delete_lines");
    expect(last.relativePath).toBe("章节内容/第5章.md");
    expect(last.previousContent).toBe("一\r\n二\r\n三\r\n");
    expect(last.postContentHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("file_manage", () => {
  it("search → {success,search_text,results[{file,matches[{line,content}]}],files_found}", async () => {
    const r = JSON.parse(
      await executeTool(ctx(), "file_manage", { operation: "search", path: ".", search_text: "世界观" }),
    );
    expect(r.success).toBe(true);
    expect(r.search_text).toBe("世界观");
    expect(r.files_found).toBeGreaterThan(0);
    const hit = r.results.find((x: { file: string }) => x.file.endsWith("世界观.md"));
    expect(hit).toBeDefined();
    expect(hit.matches[0].line).toBe(1);
    expect(hit.matches[0].content).toContain("# 世界观");
  });

  it("search 缺 search_text → 逐字错误", async () => {
    expect(await executeTool(ctx(), "file_manage", { operation: "search", path: "." })).toBe(
      '{"error":"search_text is required for search operation"}',
    );
  });

  it("delete → {success,operation,path,type}", async () => {
    await fsp.writeFile(path.join(root, "章节内容", "第9章.md"), "待删\n", "utf8");
    const r = JSON.parse(await executeTool(ctx(), "file_manage", { operation: "delete", path: "章节内容/第9章.md" }));
    expect(r).toEqual({ success: true, operation: "delete", path: "章节内容/第9章.md", type: "file" });
    expect(await fs.exists(path.join(root, "章节内容", "第9章.md"))).toBe(false);
  });

  it("copy/rename 缺 new_path → 逐字错误", async () => {
    expect(await executeTool(ctx(), "file_manage", { operation: "copy", path: "章节内容/第1章.md" })).toBe(
      '{"error":"new_path is required for copy operation"}',
    );
    expect(await executeTool(ctx(), "file_manage", { operation: "rename", path: "章节内容/第1章.md" })).toBe(
      '{"error":"new_path is required for rename operation"}',
    );
  });

  it("copy 之后原文件与副本都在", async () => {
    const r = JSON.parse(
      await executeTool(ctx(), "file_manage", {
        operation: "copy",
        path: "章节内容/第1章.md",
        new_path: "章节内容/第1章副本.md",
      }),
    );
    expect(r.success).toBe(true);
    expect(r.new_path).toBe("章节内容/第1章副本.md");
    expect(await fs.exists(path.join(root, "章节内容", "第1章副本.md"))).toBe(true);
  });
});

describe("路径分级授权", () => {
  it("项目内直读", async () => {
    const r = JSON.parse(await executeTool(ctx(), "file_read", { operation: "list", path: "." }));
    expect(r.error).toBeUndefined();
  });

  it("技能目录直读", async () => {
    await fsp.mkdir(path.join(skillsDir, "demo"), { recursive: true });
    await fsp.writeFile(path.join(skillsDir, "demo", "SKILL.md"), "---\nname: demo\n---\n", "utf8");
    const r = JSON.parse(
      await executeTool(ctx(), "file_read", { operation: "read", path: path.join(skillsDir, "demo", "SKILL.md") }),
    );
    expect(r.content).toContain("name: demo");
  });

  it("授权根之外 → 拒绝，并给出逐字提示", async () => {
    const outside = path.join(os.tmpdir(), "writerd-outside-secret.txt");
    await fsp.writeFile(outside, "secret", "utf8");
    const r = JSON.parse(await executeTool(ctx(), "file_read", { operation: "read", path: outside }));
    expect(r.error.startsWith(NEEDS_CONFIRMATION_PREFIX)).toBe(true);
    expect(r.error).toContain(outside);
  });

  it("会话内授权的额外目录可读", async () => {
    const dir = path.join(os.tmpdir(), "writerd-allowed");
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(path.join(dir, "ok.md"), "ok", "utf8");
    const r = JSON.parse(
      await executeTool(
        ctx({ roots: { projectRoot: root, skillsDir, booksRoot, allowedDirs: [dir] } }),
        "file_read",
        { operation: "read", path: path.join(dir, "ok.md") },
      ),
    );
    expect(r.content).toBe("ok");
  });
});

describe("question / skill_lookup / create_project", () => {
  it("questions 为空 → 逐字错误", async () => {
    expect(await executeTool(ctx(), "question", {})).toBe(
      '{"error":"questions is required and must not be empty"}',
    );
  });

  it("question 结果格式保持既有格式（output + answers）", async () => {
    const r = JSON.parse(
      await executeTool(ctx({ askQuestions: async () => [["继续"]] }), "question", {
        questions: [{ question: "是否继续？", options: [{ label: "继续" }, { label: "停止" }] }],
      }),
    );
    expect(r.answers).toEqual(["继续"]);
    expect(r.output).toContain('User has answered your questions: "是否继续？"="继续"');
    expect(r.output).toContain("You can now continue with the user's answers in mind.");
  });

  it("skill_lookup 缺 skill_name → 逐字错误；命中 → {skill_name,content} 且带目录说明", async () => {
    expect(await executeTool(ctx(), "skill_lookup", {})).toBe('{"error":"skill_name is required"}');
    const r = JSON.parse(
      await executeTool(
        ctx({
          lookupSkill: async (n) => ({ skill_name: n, content: "---\nname: demo\n---\n正文" }),
        }),
        "skill_lookup",
        { skill_name: "demo" },
      ),
    );
    expect(r.skill_name).toBe("demo");
    expect(r.content).toContain("正文");
  });

  it("create_project 缺 name → 逐字错误；成功则建出三件套", async () => {
    expect(await executeTool(ctx(), "create_project", {})).toBe('{"error":"name is required"}');
    const r = JSON.parse(await executeTool(ctx(), "create_project", { name: "新书" }));
    expect(r.success).toBe(true);
    expect(await fs.exists(path.join(booksRoot, "新书", "小说资料", "世界观.md"))).toBe(true);
  });
});
