import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { abortActiveStream, createTauriTransport } from "../../src/core/ai/transport";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
const req = { url: "https://example.invalid", headers: {}, body: {} };
const handlers = () => ({ onLine: vi.fn(), onError: vi.fn() });

beforeEach(() => vi.resetAllMocks());

describe("Tauri 传输生命周期", () => {
  it.each([false, true])("请求发出后停止保持幂等，取消失败可观测：%s", async (abortFails) => {
    const unlisten = vi.fn();
    vi.mocked(listen).mockResolvedValue(unlisten);
    let finishRequest!: () => void;
    const pending = new Promise<void>((resolve) => { finishRequest = resolve; });
    const output = handlers();
    vi.mocked(invoke).mockImplementation(async (cmd, args) => {
      if (cmd === "ai_abort") {
        if (abortFails) throw new Error("abort failed");
        return;
      }
      await pending;
      const requestId = (args as { request: { requestId: string } }).request.requestId;
      const callback = vi.mocked(listen).mock.calls[0][1];
      callback({ event: "ai_chunk", id: 0, payload: { requestId: "other", kind: "line", data: "ignored" } });
      callback({ event: "ai_chunk", id: 0, payload: { requestId, kind: "line", data: "partial" } });
      callback({ event: "ai_chunk", id: 0, payload: { requestId, kind: "done", data: "" } });
    });
    const result = createTauriTransport().stream(req, output);
    await Promise.resolve();
    abortActiveStream();
    abortActiveStream();
    finishRequest();
    await result;
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(output.onLine).toHaveBeenCalledExactlyOnceWith("partial");
    if (abortFails) expect(output.onError).toHaveBeenCalledExactlyOnceWith("Error: abort failed");
    else expect(output.onError).not.toHaveBeenCalled();
    expect(unlisten).toHaveBeenCalledOnce();
    abortActiveStream();
    expect(invoke).toHaveBeenCalledTimes(2);
  });
  it("监听注册失败后停止不再发送过期请求", async () => {
    vi.mocked(listen).mockRejectedValueOnce(new Error("listen failed"));
    await expect(createTauriTransport().stream(req, handlers())).rejects.toThrow("listen failed");
    abortActiveStream();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("监听注册期间停止，注册完成后不再发起网络请求", async () => {
    const unlisten = vi.fn();
    let register!: (value: () => void) => void;
    vi.mocked(listen).mockImplementationOnce(() => new Promise((resolve) => { register = resolve; }));
    // 旧实现会继续 invoke；令它拒绝以避免失败用例挂起。
    vi.mocked(invoke).mockRejectedValue(new Error("unexpected invoke"));
    const result = createTauriTransport().stream(req, handlers()).catch(() => {});
    abortActiveStream();
    register(unlisten);
    await result;
    expect(invoke).not.toHaveBeenCalled();
    expect(unlisten).toHaveBeenCalledOnce();
  });

  it("invoke 失败仍移除监听并清理活跃请求", async () => {
    const unlisten = vi.fn();
    vi.mocked(listen).mockResolvedValue(unlisten);
    vi.mocked(invoke).mockRejectedValueOnce(new Error("IPC failed"));
    await expect(createTauriTransport().stream(req, handlers())).rejects.toThrow("IPC failed");
    abortActiveStream();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(unlisten).toHaveBeenCalledOnce();
  });
});
