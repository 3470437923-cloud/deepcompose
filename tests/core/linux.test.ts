import { afterEach, describe, expect, it, vi } from "vitest";

// 不改宿主 process 对象，避免平台探针污染 Vitest 自己的原生依赖。
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe("Linux 平台契约（模拟，非原生运行）", () => {
  async function linux() {
    vi.stubGlobal("process", { platform: "linux" });
    vi.resetModules();
    return {
      platform: await import("../../src/core/platform"),
      dirs: await import("../../src/core/dirs"),
      guard: await import("../../src/core/tools/pathGuard"),
    };
  }

  it("Node Linux 与 WebKitGTK UA 均使用 POSIX 分隔符", async () => {
    const { platform } = await linux();
    expect(platform.IS_WINDOWS).toBe(false);
    expect(platform.IS_MACOS).toBe(false);
    expect(platform.PATH_SEP).toBe("/");
    vi.stubGlobal("process", undefined);
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15", platform: "Linux x86_64" });
    vi.resetModules();
    expect((await import("../../src/core/platform")).PATH_SEP).toBe("/");
  });

  it("XDG 数据与本地化文档目录保留冻结名", async () => {
    const { dirs } = await linux();
    const d = dirs.resolveDirs({ home: "/home/alice", documents: "/home/alice/文档", appData: "/home/alice/.local/share" });
    expect(d.booksRoot).toBe("/home/alice/AI写小说");
    expect(d.prefsFile).toBe("/home/alice/.local/share/com.writerd/writerD/shared_preferences.json");
    expect(d.sessionsDir).toBe("/home/alice/文档/writerd_sessions");
    expect(d.skillsDir).toBe("/home/alice/文档/skills");
  });

  it("同名异大小写目录不能成为相对项目路径或授权根", async () => {
    const { dirs, guard } = await linux();
    const root = "/home/alice/Books";
    expect(dirs.relative(root, root + "/正文.md")).toBe("正文.md");
    expect(dirs.relative(root, "/home/alice/books/正文.md")).toBeNull();
    expect(guard.isInside(root, "/home/alice/books/正文.md")).toBe(false);
    const roots = { projectRoot: root, booksRoot: root, skillsDir: "/home/alice/Skills" };
    expect(guard.guardPath("/home/alice/books/正文.md", roots).ok).toBe(false);
    expect(guard.guardPath("../books/正文.md", roots).ok).toBe(false);
    expect(guard.guardPath("/home/alice/Other/正文.md", { ...roots, allowedDirs: ["/home/alice/other"] }).ok).toBe(false);
  });

  it("会话过滤与删除保留另一个大小写不同作品的会话", async () => {
    await linux();
    const session = await import("../../src/core/store/session");
    const files = new Map<string, string>();
    const fs = {
      exists: async (p: string) => files.has(p),
      readText: async (p: string) => files.get(p)!,
      writeText: async (p: string, s: string) => { files.set(p, s); },
      remove: async (p: string) => { files.delete(p); },
    } as unknown as import("../../src/core/fsbridge").FsBridge;
    const index = session.parseIndex(JSON.stringify({ version: 1, sessions: {
      upper: { projectPath: "/home/alice/Books", title: "upper" },
      lower: { projectPath: "/home/alice/books", title: "lower" },
    } }));
    await session.saveIndex(fs, "/sessions", index);
    expect(session.listSessions(index, "/home/alice/Books").map(e => e.id)).toEqual(["upper"]);
    expect((await session.deleteSessionsForProject(fs, "/sessions", "/home/alice/Books")).ids).toEqual(["upper"]);
    expect(Object.keys((await session.loadIndex(fs, "/sessions")).sessions)).toEqual(["lower"]);
  });

  it("回收站安全门不接纳另一个大小写不同的作品根", async () => {
    await linux();
    const recycle = await import("../../src/core/store/recycle");
    expect(recycle.checkPurgeTarget({ booksRoot: "/home/alice/Books", target: "/home/alice/books/Other", isLink: false })).not.toBeNull();
    expect(recycle.checkActivity({ busy: false, sessionProjectPath: "/home/alice/books/Other", openFilePath: null }, "/home/alice/Books/Other")).toBeNull();
  });

  it("Windows 继续按不区分大小写的方式授权", async () => {
    vi.stubGlobal("process", { platform: "win32" });
    vi.resetModules();
    const guard = await import("../../src/core/tools/pathGuard");
    expect(guard.isInside("D:/Books", "d:/books/正文.md")).toBe(true);
  });

  it("绝对与相对路径不因剥除前导斜杠而共享授权", async () => {
    const { guard } = await linux();
    expect(guard.normalizeForCompare("/home/alice/Books")).toBe("/home/alice/Books");
    expect(guard.isInside("home/alice/Books", "/home/alice/Books/正文.md")).toBe(false);
    expect(guard.guardPath("/home/alice/Books/正文.md", { projectRoot: "home/alice/Books", booksRoot: "home/alice/Books", skillsDir: "skills" }).ok).toBe(false);
  });
});
