/**
 * B12 批次8 回归锁：配置缺失时用户消息也要落盘（controller.send）。
 * 界面先做乐观气泡，随后用返回的会话整体替换 —— 早退不落盘 = 用户输入蒸发。
 */
import { describe, expect, it } from "vitest";
import { setFs, type FsBridge } from "../../src/core/fsbridge";
import { DEFAULT_PREFS } from "../../src/core/prefs";
import type { AppDirs } from "../../src/core/dirs";
import { send } from "../../src/core/ai/controller";
import { AI_ERRORS } from "../../src/core/ai/errors";
import type { StreamTransport } from "../../src/core/ai/agent";

/** 内存桥：只实现 send 的落盘路径用到的原语 */
function memFs() {
  const files: Record<string, string> = {};
  const dirs = new Set<string>();
  const fs = {
    async exists(p: string) {
      return p in files || dirs.has(p);
    },
    async readText(p: string) {
      if (!(p in files)) throw new Error("not found: " + p);
      return files[p];
    },
    async writeText(p: string, content: string) {
      files[p] = content;
    },
    async appendText(p: string, content: string) {
      files[p] = (files[p] ?? "") + content;
    },
    async list(dir: string) {
      const prefix = dir.endsWith("\\") ? dir : dir + "\\";
      const names = new Set<string>();
      for (const p of Object.keys(files)) {
        if (p.startsWith(prefix)) names.add(p.slice(prefix.length).split("\\")[0]);
      }
      return [...names].map((name) => ({
        name,
        rel: name,
        path: prefix + name,
        isDir: false,
        isLink: false,
        size: 0,
        mtimeMs: 0,
      }));
    },
    async mkdir(p: string) {
      dirs.add(p);
    },
    async remove() {},
    async removeChild() {},
    async rename() {},
    async copy() {},
    async stat(p: string) {
      if (p in files) return { isDir: false, isLink: false, size: files[p].length, mtimeMs: 1 };
      if (dirs.has(p)) return { isDir: true, isLink: false, size: 0, mtimeMs: 1 };
      return null;
    },
  } as unknown as FsBridge;
  return { fs, files };
}

const DIRS: AppDirs = {
  booksRoot: "C:\\books",
  skillsDir: "C:\\skills",
  sessionsDir: "C:\\sessions",
  snapshotsDir: "C:\\snapshots",
  memosFile: "C:\\cfg\\writerd_memos.json",
  quickPromptsFile: "C:\\cfg\\writerd_quick_prompts.json",
  prefsFile: "C:\\cfg\\shared_preferences.json",
  prefsDir: "C:\\cfg",
  usageStatsFile: "C:\\cfg\\usage_stats.json",
  logDir: "C:\\logs",
  logFile: "C:\\logs\\app.log",
};

/** 不该被调用的传输层：本组用例都在 cfg 缺失分支返回 */
const neverTransport: StreamTransport = {
  async stream() {
    throw new Error("不应发起请求：配置缺失分支不该走到传输层");
  },
};

describe("send：配置缺失时用户消息不丢（B12-8）", () => {
  it("用户消息进会话、并落盘到 sessionsDir", async () => {
    const { fs, files } = memFs();
    setFs(fs);
    const res = await send({
      dirs: DIRS,
      prefs: { ...DEFAULT_PREFS, apiKey: "", llmBaseUrl: "", model: "" },
      session: null,
      projectRoot: null,
      userText: "这段字不能丢",
      transport: neverTransport,
    });

    expect(res.error).toBe(AI_ERRORS.invalidKey);
    expect(res.session.messages).toHaveLength(1);
    expect(res.session.messages[0].role).toBe("user");
    expect(res.session.messages[0].text).toBe("这段字不能丢");
    // 落盘：会话文件与索引都写了
    const written = Object.keys(files);
    expect(written.some((p) => p.startsWith(DIRS.sessionsDir + "\\") && p.endsWith(".json"))).toBe(true);
    expect(written.some((p) => p.endsWith("index.json"))).toBe(true);
  });

  it("已有会话时追加而不覆盖历史", async () => {
    const { fs } = memFs();
    setFs(fs);
    const first = await send({
      dirs: DIRS,
      prefs: { ...DEFAULT_PREFS, apiKey: "", llmBaseUrl: "", model: "" },
      session: null,
      projectRoot: null,
      userText: "第一条",
      transport: neverTransport,
    });
    const second = await send({
      dirs: DIRS,
      prefs: { ...DEFAULT_PREFS, apiKey: "", llmBaseUrl: "", model: "" },
      session: first.session,
      projectRoot: null,
      userText: "第二条",
      transport: neverTransport,
    });
    expect(second.session.id).toBe(first.session.id);
    expect(second.session.messages.map((m) => m.text)).toEqual(["第一条", "第二条"]);
    // 标题按首条用户消息派生（默认 New Chat … → 取前 30 字）
    expect(second.session.title).toContain("第一条");
  });
});

describe("send：工具轮次上限（B16：0 = 无上限，不再钳 50/兜底 12）", () => {
  /** 前 13 轮都请求工具、第 14 轮给正文的传输层：旧口径（0→12）会在第 12 轮截停 */
  function loopTransport(counter: { calls: number }): StreamTransport {
    return {
      async stream(_req, h) {
        counter.calls += 1;
        if (counter.calls <= 13) {
          h.onLine(
            `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c${counter.calls}","type":"function","function":{"name":"file_read","arguments":"{\\"operation\\":\\"read\\",\\"path\\":\\"x.md\\"}"}}]}}]}`,
          );
          h.onLine('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}');
        } else {
          h.onLine('data: {"choices":[{"delta":{"content":"好了"}}]}');
          h.onLine('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}');
        }
        h.onLine("data: [DONE]");
      },
    };
  }

  it("toolRoundLimit=0（无上限）：14 轮跑完不截停", async () => {
    const { fs } = memFs();
    setFs(fs);
    const counter = { calls: 0 };
    const res = await send({
      dirs: DIRS,
      prefs: { ...DEFAULT_PREFS, apiKey: "k", llmBaseUrl: "https://api.deepseek.com", model: "deepseek-flash", toolRoundLimit: 0 },
      session: null,
      projectRoot: null,
      userText: "开工",
      transport: loopTransport(counter),
    });
    expect(counter.calls).toBe(14);
    expect(res.error).toBeUndefined();
    expect(res.session.messages.some((m) => m.text === "好了")).toBe(true);
  });

  it("toolRoundLimit=2：第二轮工具执行完即收（轮次耗尽文案）", async () => {
    const { fs } = memFs();
    setFs(fs);
    const counter = { calls: 0 };
    const res = await send({
      dirs: DIRS,
      prefs: { ...DEFAULT_PREFS, apiKey: "k", llmBaseUrl: "https://api.deepseek.com", model: "deepseek-flash", toolRoundLimit: 2 },
      session: null,
      projectRoot: null,
      userText: "开工",
      transport: loopTransport(counter),
    });
    expect(counter.calls).toBe(2);
    expect(res.error).toContain("工具调用轮次超过上限");
  });
});
