import { beforeEach, describe, expect, it, vi } from "vitest";

// Node 环境直接执行工作台的真实回调；不复制保存/关闭/切书/采用实现。
const h = vi.hoisted(() => ({
  states: [] as unknown[], index: 0, callbacks: [] as Function[], effects: [] as Function[],
  closeHandler: null as Function | null, destroy: vi.fn(),
  read: vi.fn(), write: vi.fn(), snapshot: vi.fn(), log: vi.fn(), load: vi.fn(), send: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const i = h.index++;
    if (!(i in h.states)) h.states[i] = typeof initial === "function" ? initial() : initial;
    return [h.states[i], (next: unknown) => { h.states[i] = typeof next === "function" ? next(h.states[i]) : next; }];
  },
  useRef: (current: unknown) => ({ current }),
  useCallback: (callback: Function) => { h.callbacks.push(callback); return callback; },
  useMemo: (calculate: () => unknown) => calculate(),
  useEffect: (effect: Function) => { h.effects.push(effect); }, useId: () => "test-id",
}));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({
  onCloseRequested: (handler: Function) => { h.closeHandler = handler; return Promise.resolve(() => {}); },
  destroy: h.destroy,
}) }));
vi.mock("../../src/core/app", () => ({ currentBoot: () => ({ dirs: { snapshotsDir: "/snapshots" }, prefs: {} }) }));
vi.mock("../../src/core/fsbridge", () => ({ getFs: () => ({ readText: h.read, writeText: h.write }) }));
vi.mock("../../src/core/store/snapshot", () => ({ recordSnapshot: h.snapshot }));
vi.mock("../../src/core/store/oplog", async (original) => ({ ...await original<object>(), appendOplog: h.log }));
vi.mock("../../src/core/store/project", async (original) => ({ ...await original<object>(), loadProject: h.load }));
vi.mock("../../src/core/ai/controller", () => ({ send: h.send }));
import MainWorkbench from "../../src/ui/MainWorkbench";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
const book = { ref: { root: "/book", name: "Book" }, tree: [], docs: [], chapters: [], pending: [], manifest: {} };
const target = { root: "/other", name: "Other" };
function tab() { return { rel: "chapter.md", path: "/book/chapter.md", name: "chapter.md", kind: "candidate", baseContent: "base", content: "edit", dirty: true, editing: true, editBase: "base" }; }
function callback(marker: string) {
  const matches = h.callbacks.filter(fn => fn.toString().includes(marker));
  expect(matches, marker).toHaveLength(1);
  return matches[0];
}
function mount(t = tab()) {
  h.states[3] = book; h.states[4] = [t]; h.states[5] = t.rel;
  MainWorkbench({ onOpenSettings: () => {} });
  const setTabs = callback("setTabsState");
  setTabs([t]);
  return { setTabs, tabs: () => h.states[4] as ReturnType<typeof tab>[], edit: () => callback("tabEditable(t)")("new edit") };
}
beforeEach(() => {
  h.states = []; h.index = 0; h.callbacks = []; h.effects = []; h.closeHandler = null; h.destroy.mockReset();
  for (const mock of [h.read, h.write, h.snapshot, h.log, h.load, h.send]) mock.mockReset();
  h.read.mockResolvedValue("base"); h.write.mockResolvedValue(undefined); h.snapshot.mockResolvedValue(undefined); h.log.mockResolvedValue(undefined);
  h.load.mockResolvedValue({ ...book, ref: target });
});

describe("工作台实际调用端", () => {
  it("关窗保存期间新增编辑不销毁窗口", async () => {
    const view = mount();
    const closeEffect = h.effects.find(fn => fn.toString().includes("onCloseRequested"));
    expect(closeEffect).toBeDefined(); closeEffect!();
    const started = deferred(), release = deferred();
    h.write.mockImplementation(async () => { started.resolve(); await release.promise; });
    const preventDefault = vi.fn();
    const closing = h.closeHandler!({ preventDefault });
    await started.promise; view.edit(); release.resolve(); await closing;
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(h.destroy).not.toHaveBeenCalled();
    expect(view.tabs()[0]).toMatchObject({ content: "new edit", dirty: true });
  });
  it.each(["switch", "restore"])("%s 保存失败保持当前作品和编辑", async (action) => {
    const view = mount();
    h.write.mockRejectedValue(new Error("disk full"));
    await callback(action === "switch" ? "setBookMenu(false)" : "结构校验")(target);
    expect(h.states[3]).toBe(book);
    expect(h.load).not.toHaveBeenCalled();
    expect(view.tabs()[0]).toMatchObject({ content: "edit", dirty: true, editing: true });
  });
  it("采用准备写日志期间新增编辑，不退出编辑或发送采用", async () => {
    const t = tab(), view = mount(t);
    const started = deferred(), release = deferred();
    h.log.mockImplementation(async (_fs, _root, operation) => { if (operation === "adopt") { started.resolve(); await release.promise; } });
    const adopting = callback("采用为正式正文")(t);
    await Promise.resolve();
    const confirm = h.states.find(value => !!value && typeof value === "object" && "title" in value && value.title === "采用为正式正文？") as { resolve: (yes: boolean) => void };
    confirm.resolve(true);
    await started.promise; view.edit(); release.resolve(); await adopting;
    expect(h.send).not.toHaveBeenCalled();
    expect(view.tabs()[0]).toMatchObject({ content: "new edit", dirty: true, editing: true });
  });
  it("同一路径并发保存拒绝第二次写入", async () => {
    const t = tab(); mount(t);
    const started = deferred(), release = deferred();
    h.write.mockImplementation(async () => { started.resolve(); await release.promise; });
    const save = callback("保存期间又有新编辑");
    const first = save(t);
    await started.promise;
    expect(await save(t)).toBe(false);
    release.resolve(); expect(await first).toBe(true);
    expect(h.write).toHaveBeenCalledOnce();
  });
  it.each(["close", "switch", "restore", "adopt"])("%s 保存中新增编辑时保留标签并阻断后续动作", async (action) => {
    const t = tab();
    const view = mount(t);
    const started = deferred(), release = deferred();
    h.write.mockImplementation(async () => { started.resolve(); await release.promise; });
    let operation: Promise<unknown>;
    if (action === "close") operation = callback("关闭标签自动保存")(t.rel);
    else if (action === "switch") operation = callback("setBookMenu(false)")(target);
    else if (action === "restore") operation = callback("结构校验")(target);
    else {
      operation = callback("采用为正式正文")(t);
      // 开发模式校验 await 后才进入确认。
      await Promise.resolve();
      const confirm = h.states.find(value => !!value && typeof value === "object" && "title" in value && value.title === "采用为正式正文？") as { resolve: (yes: boolean) => void };
      expect(confirm).toBeDefined(); confirm.resolve(true);
    }
    await started.promise;
    view.edit();
    release.resolve();
    await operation;
    expect(view.tabs()).toHaveLength(1);
    expect(view.tabs()[0]).toMatchObject({ content: "new edit", baseContent: "edit", dirty: true });
    expect(h.states[3]).toBe(book);
    expect(h.load).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });
  it("关闭等待期间新增的其他标签不会被旧数组覆盖", async () => {
    const t = { ...tab(), kind: "doc", editing: false }, view = mount(t);
    const started = deferred(), release = deferred();
    h.write.mockImplementation(async () => { started.resolve(); await release.promise; });
    const closing = callback("关闭标签自动保存")(t.rel);
    await started.promise;
    view.setTabs((tabs: ReturnType<typeof tab>[]) => [...tabs, { ...t, path: "/book/new.md", rel: "new.md", content: "new tab" }]);
    release.resolve(); await closing;
    expect(view.tabs()).toHaveLength(1);
    expect(view.tabs()[0]).toMatchObject({ rel: "new.md", content: "new tab", dirty: true });
  });
  it.each(["switch", "restore"])("%s 读取新作品期间新增编辑仍保留原作品", async (action) => {
    const t = { ...tab(), content: "base", dirty: false }, view = mount(t);
    const started = deferred(), release = deferred();
    h.load.mockImplementation(async () => { started.resolve(); await release.promise; return { ...book, ref: target }; });
    const opening = callback(action === "switch" ? "setBookMenu(false)" : "结构校验")(target);
    await started.promise; view.edit(); release.resolve(); await opening;
    expect(h.states[3]).toBe(book);
    expect(view.tabs()[0]).toMatchObject({ content: "new edit", dirty: true });
  });
});
