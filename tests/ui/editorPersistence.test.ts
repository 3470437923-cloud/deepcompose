import { describe, expect, it, vi } from "vitest";
import { completeReflow, persistEditorVersion, type EditorVersion } from "../../src/ui/editorPersistence";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
function fixture(disk = "base") {
  let tabs: EditorVersion[] = [{ path: "/book/chapter.md", rel: "chapter.md", baseContent: "base", content: "edit", dirty: true }];
  const snapshot = vi.fn(async (_previous: string) => {});
  const write = vi.fn(async (content: string) => { disk = content; });
  const io = { read: vi.fn(async () => disk), snapshot, write,
    current: () => tabs, update: (apply: (value: EditorVersion[]) => EditorVersion[]) => { tabs = apply(tabs); } };
  return { io, disk: () => disk, edit: (content: string) => { tabs = tabs.map(t => ({ ...t, content, dirty: true })); } };
}

describe("编辑版本保存", () => {
  it("未编辑的旧标签采用前也必须核对磁盘新版", async () => {
    const f = fixture("AI new");
    f.io.update(tabs => tabs.map(t => ({ ...t, content: "base", dirty: false })));
    await expect(persistEditorVersion(f.io.current()[0], f.io)).rejects.toThrow("磁盘");
    expect(f.io.write).not.toHaveBeenCalled();
    expect(f.disk()).toBe("AI new");
  });
  it("未编辑标签核对磁盘期间新增编辑不能报告保存成功", async () => {
    const f = fixture();
    f.io.update(tabs => tabs.map(t => ({ ...t, content: "base", dirty: false })));
    f.io.read.mockImplementation(async () => { f.edit("new while checking"); return "base"; });
    expect(await persistEditorVersion(f.io.current()[0], f.io)).toBe(false);
    expect(f.io.write).not.toHaveBeenCalled();
    expect(f.io.current()[0].dirty).toBe(true);
  });
  it("写盘期间新增编辑保留 dirty，并拒绝关闭/切作品/采用的成功结果", async () => {
    const f = fixture();
    const started = deferred(), release = deferred();
    f.io.write.mockImplementation(async () => { started.resolve(); await release.promise; });
    const saving = persistEditorVersion(f.io.current()[0], f.io);
    await started.promise;
    f.edit("edit while saving");
    release.resolve();
    expect(await saving).toBe(false);
    expect(f.io.current()[0]).toMatchObject({ baseContent: "edit", content: "edit while saving", dirty: true });
  });
  it("旧编辑基线遇到 AI 磁盘新版：快照新版、拒绝覆盖、编辑原样保留", async () => {
    const f = fixture("AI new");
    await expect(persistEditorVersion(f.io.current()[0], f.io)).rejects.toThrow("磁盘");
    expect(f.io.snapshot).toHaveBeenCalledWith("AI new");
    expect(f.io.write).not.toHaveBeenCalled();
    expect(f.disk()).toBe("AI new");
    expect(f.io.current()[0]).toMatchObject({ baseContent: "base", content: "edit", dirty: true });
  });
  it("读取失败时不能快照旧基线或写盘", async () => {
    const f = fixture();
    f.io.read.mockRejectedValue(new Error("read denied"));
    await expect(persistEditorVersion(f.io.current()[0], f.io)).rejects.toThrow("read denied");
    expect(f.io.snapshot).not.toHaveBeenCalled();
    expect(f.io.write).not.toHaveBeenCalled();
  });
  it("快照失败时不写盘", async () => {
    const f = fixture();
    f.io.snapshot.mockRejectedValue(new Error("snapshot denied"));
    await expect(persistEditorVersion(f.io.current()[0], f.io)).rejects.toThrow("snapshot denied");
    expect(f.io.write).not.toHaveBeenCalled();
  });
  it("保存成功使用实际磁盘快照，并保留同时新增的其他标签", async () => {
    const f = fixture();
    f.io.snapshot.mockImplementation(async () => { f.io.update(tabs => [...tabs, { ...tabs[0], path: "/other", rel: "other", content: "other" }]); });
    expect(await persistEditorVersion(f.io.current()[0], f.io)).toBe(true);
    expect(f.io.read).toHaveBeenCalledTimes(2);
    expect(f.io.snapshot).toHaveBeenCalledWith("base");
    expect(f.disk()).toBe("edit");
    expect(f.io.current()).toHaveLength(2);
    expect(f.io.current()[0]).toMatchObject({ baseContent: "edit", dirty: false });
  });
  it("快照等待期间外部改盘也拒绝写入", async () => {
    const f = fixture();
    f.io.read.mockResolvedValueOnce("base").mockResolvedValue("AI during snapshot");
    await expect(persistEditorVersion(f.io.current()[0], f.io)).rejects.toThrow("磁盘");
    expect(f.io.write).not.toHaveBeenCalled();
  });
});

describe("回流完成标记", () => {
  it.each(["API failed", "tool failed"])("返回错误 %s 时 pending 不应被标记完成", async (error) => {
    const complete = vi.fn(async () => {});
    await expect(completeReflow(async () => ({ error }), complete, () => false)).rejects.toThrow(error);
    expect(complete).not.toHaveBeenCalled();
  });
  it("停止任务不能标记完成", async () => {
    const complete = vi.fn(async () => {});
    await expect(completeReflow(async () => ({}), complete, () => true)).rejects.toThrow();
    expect(complete).not.toHaveBeenCalled();
  });
  it("成功任务才写完成标记", async () => {
    const complete = vi.fn(async () => {});
    await completeReflow(async () => ({}), complete, () => false);
    expect(complete).toHaveBeenCalledOnce();
  });
});
