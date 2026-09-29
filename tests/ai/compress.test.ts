/** 上下文压缩回归锁（标记逐字、校验逐字、只影响请求不影响会话） */
import { describe, expect, it } from "vitest";
import {
  assembleBlock,
  CHECKPOINT_MERGE_RULES,
  CHECKPOINT_PREFIX,
  COMPRESS_PROMPT_1,
  COMPRESS_PROMPT_2,
  estimateMessageTokens,
  estimateTokens,
  maybeCompress,
  splitMessages,
  SUMMARY_OPEN,
  SUMMARY_TITLE,
  SUMMARY_TOO_BIG,
  SUMMARY_CLOSE,
  VERBATIM_OPEN,
  __clearCompressCache,
} from "../../src/core/ai/compress";
import type { StreamTransport } from "../../src/core/ai/agent";
import type { HttpRequest, ProviderConfig } from "../../src/core/ai/protocol";
import type { ChatMessage } from "../../src/core/ai/protocol";

const cfg: ProviderConfig = {
  baseUrl: "http://127.0.0.1:9",
  apiKey: "k",
  model: "m",
  temperature: 0.8,
  useAnthropicFormat: false,
  reservedOutputTokens: 16000,
};

function msg(id: string, role: "user" | "assistant", text: string): ChatMessage {
  return { id, role, text, createdAt: "2026-09-28T00:00:00.000000" };
}

/** 固定回包的传输替身：把收到的请求记下来，回一段 SSE 文本 */
function fakeTransport(reply: string, capture: { req?: HttpRequest } = {}): StreamTransport {
  return {
    async stream(req, handlers) {
      capture.req = req;
      handlers.onLine(`data: {"choices":[{"delta":{"content":${JSON.stringify(reply)}}}]}`);
      handlers.onLine("data: [DONE]");
    },
  };
}

describe("estimateTokens", () => {
  it("CJK≈1 token/字，ASCII≈4 字符/token", () => {
    expect(estimateTokens("你好")).toBe(2);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("你好abcd")).toBe(3);
  });

  it("estimateMessageTokens 计入工具调用与结果", () => {
    // 口径契约：thinking 与 toolCalls（name+arguments+result）都算进预算
    const m = msg("a", "assistant", "");
    m.toolCalls = [{ callId: "1", name: "file_read", arguments: '{"path":"x"}', result: '{"content":"1234"}' }];
    expect(estimateMessageTokens([m])).toBeGreaterThan(0);
  });
});

describe("assembleBlock", () => {
  it("块含全部 §6.1 标记且顺序正确", () => {
    // 顺序契约：<compacted-summary> → 标题 → 摘要 → <verbatim-user-messages> → </compacted-summary>
    const block = assembleBlock("摘要内容", ["原话一", "原话二"]);
    const iOpen = block.indexOf(SUMMARY_OPEN);
    const iTitle = block.indexOf(SUMMARY_TITLE);
    const iVerbatim = block.indexOf(VERBATIM_OPEN);
    const iClose = block.indexOf(SUMMARY_CLOSE);
    expect(iOpen).toBe(0);
    expect(iTitle).toBeGreaterThan(iOpen);
    expect(iVerbatim).toBeGreaterThan(iTitle);
    expect(iClose).toBeGreaterThan(iVerbatim);
    expect(block).toContain("原话一");
    expect(block).toContain("原话二");
    expect(block.trimEnd().endsWith(SUMMARY_CLOSE)).toBe(true);
  });
});

describe("splitMessages", () => {
  const msgs = Array.from({ length: 10 }, (_, i) => msg(`m${i}`, "user", "字".repeat(200)));
  it("把旧消息切进压缩段、新消息留在保留段", () => {
    // 不变量：compress + keep 恰好覆盖全部消息（不丢不重）
    const r = splitMessages(msgs, 1000);
    expect(r).not.toBeNull();
    expect(r!.compress.length).toBeGreaterThan(0);
    expect(r!.keep.length).toBeGreaterThan(0);
    expect(r!.compress.length + r!.keep.length).toBe(10);
  });
  it("全部塞得进保留段 → null（无需压缩）", () => {
    expect(splitMessages([msg("a", "user", "hi")], 1_000_000)).toBeNull();
  });
});

describe("maybeCompress", () => {
  it("未超预算 → null（不发摘要请求）", async () => {
    __clearCompressCache();
    const cap: { req?: HttpRequest } = {};
    const r = await maybeCompress({
      cfg,
      transport: fakeTransport("不该被调用", cap),
      messages: [msg("a", "user", "短")],
      contextLimit: 1_000_000,
      reservedOutputTokens: 16_000,
      sessionId: "s1",
    });
    expect(r).toBeNull();
    // 阈值未触发时传输层必须完全没被碰过
    expect(cap.req).toBeUndefined();
  });

  it("超预算 → 摘要请求带 §6.5 提示词；请求序列头为检查点块", async () => {
    __clearCompressCache();
    const big = Array.from({ length: 8 }, (_, i) => msg(`m${i}`, "user", "字".repeat(3000)));
    const cap: { req?: HttpRequest } = {};
    const summary = "短摘要";
    const r = await maybeCompress({
      cfg,
      transport: fakeTransport(summary, cap),
      messages: big,
      contextLimit: 10_000,
      reservedOutputTokens: 1_000,
      sessionId: "s2",
    });
    expect(r).not.toBeNull();
    expect(cap.req).toBeDefined();
    // §6.5 两段压缩提示词真的随摘要请求发出（OpenAI 形态在 messages[*].content 里）
    const bodyText = JSON.stringify(cap.req!.body);
    expect(bodyText).toContain(COMPRESS_PROMPT_1);
    expect(bodyText).toContain(COMPRESS_PROMPT_2);
    // 请求头 = 检查点消息（块文本）
    expect(r!.requestMessages[0].id.startsWith(CHECKPOINT_PREFIX)).toBe(true);
    expect(r!.requestMessages[0].text).toContain(SUMMARY_OPEN);
    expect(r!.requestMessages[0].text).toContain(SUMMARY_TITLE);
    expect(r!.requestMessages[0].text).toContain(summary);
    // 保留段消息原样跟在检查点后，最后一条就是最新消息（压缩永不丢最新消息）
    expect(r!.requestMessages.length).toBeGreaterThanOrEqual(2);
    expect(r!.requestMessages[r!.requestMessages.length - 1].text).toBe(big[big.length - 1].text);
    // 用户原话逐字保留段
    expect(r!.requestMessages[0].text).toContain(big[0].text);
  });

  it("摘要不比原文短 → 拒绝（§6.2 逐字错误）并回退不压缩", async () => {
    __clearCompressCache();
    const big = Array.from({ length: 8 }, (_, i) => msg(`m${i}`, "user", "字".repeat(3000)));
    const notices: string[] = [];
    const r = await maybeCompress({
      cfg,
      // 回一段与原文等长的"摘要"：必然触发 SUMMARY_TOO_BIG 校验
      transport: fakeTransport("太".repeat(3000 * 8)),
      messages: big,
      contextLimit: 10_000,
      reservedOutputTokens: 1_000,
      sessionId: "s3",
      onNotice: (m) => notices.push(m),
    });
    expect(r).toBeNull();
    expect(notices).toContain(SUMMARY_TOO_BIG);
  });

  it("同一会话缓存复用：第二次不再发摘要请求", async () => {
    __clearCompressCache();
    const big = Array.from({ length: 8 }, (_, i) => msg(`m${i}`, "user", "字".repeat(3000)));
    let calls = 0;
    const counting: StreamTransport = {
      async stream(req, handlers) {
        calls += 1;
        handlers.onLine('data: {"choices":[{"delta":{"content":"摘要"}}]}');
        handlers.onLine("data: [DONE]");
      },
    };
    const opts = {
      cfg,
      transport: counting as StreamTransport,
      messages: big,
      contextLimit: 10_000,
      reservedOutputTokens: 1_000,
      sessionId: "s4",
    };
    const first = await maybeCompress(opts);
    expect(first).not.toBeNull();
    expect(calls).toBe(1);
    // 第二次：命中会话级缓存（upToId 仍在序列里），传输层零调用、块逐字复用
    const second = await maybeCompress(opts);
    expect(second).not.toBeNull();
    expect(calls).toBe(1);
    expect(second!.block).toBe(first!.block);
  });

  it("旧检查点存在 → 摘要请求附 §6.3 合并规则", async () => {
    __clearCompressCache();
    const cap: { req?: HttpRequest } = {};
    // 序列头部放一条"旧检查点"（id 带 CHECKPOINT_PREFIX），模拟二次压缩场景
    const head = {
      ...msg("cp0", "user", SUMMARY_OPEN + "\n旧检查点\n" + SUMMARY_CLOSE),
      id: CHECKPOINT_PREFIX + "old",
    } as ChatMessage;
    const big = [head, ...Array.from({ length: 8 }, (_, i) => msg(`m${i}`, "user", "字".repeat(3000)))];
    await maybeCompress({
      cfg,
      transport: fakeTransport("新摘要", cap),
      messages: big,
      contextLimit: 10_000,
      reservedOutputTokens: 1_000,
      sessionId: "s5",
    });
    // 合并规则随提示词进入请求体（OpenAI 形态 messages[*].content）。
    // 注意不能只断言"旧检查点"——转写里也含该词，证明不了合并规则被附上；
    // 这里用规则正文的特征句锁定
    const raw = JSON.stringify(cap.req);
    expect(raw).toContain("旧检查点");
    expect(raw).toContain("旧检查点会被丢弃：任何你没有带进新摘要的信息都会丢失。");
    // 特征句确实来自 CHECKPOINT_MERGE_RULES（常量与断言同源，防两处各自漂移）
    expect(CHECKPOINT_MERGE_RULES).toContain("旧检查点会被丢弃");
  });
});
