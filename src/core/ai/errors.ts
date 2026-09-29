/**
 * 错误分类（文案逐字，保持既有格式）。
 * 九条全部经逐字复核（EXACT）。
 *
 * 分类入口有两个：
 *  - classifyHttpError：Rust 侧回传的 `__HTTP_ERROR__<status>|<body>`（见 transport.ts）；
 *  - classifyStreamError：流式过程中的网络层中断消息。
 * 分类结果直接展示给用户（UI 不做二次加工），因此文案必须自解释、可行动。
 */

/** 九条逐字错误文案（键名为内部分类标识，值为面向用户的最终文案，均不得改） */
export const AI_ERRORS = {
  invalidKey: "API Key 无效或未提供，请检查Key是否正确",
  expiredKey: "API Key 已过期，请更换Key后重试",
  noPermission: "令牌无权访问该模型，请检查Key权限设置",
  rateLimited:
    "429错误，可能是当前模型算力紧张，使用人数过多，建议先更换为其他模型使用，或稍后再进行尝试",
  contextTooLong: "对话内容过长，超出了上游模型的上下文限制，请压缩旧上下文或新建对话",
  noResponse: "未收到AI响应，服务器可能暂时不可用或Key已失效",
  badMaxTokens: "max_tokens 参数无效，请检查模型设置中的最大输出长度",
  modelNotFound: "该模型不存在或暂无可用渠道，请更换模型后重试",
  temperatureUnsupported: "该模型不支持自定义温度，请将温度设为 1 或使用默认值",
} as const;

/** 小写化（关键词匹配一律大小写不敏感） */
function lower(s: string): string {
  return s.toLowerCase();
}

/** 响应体是否提到任一关键词（子串匹配，大小写不敏感） */
function mentions(body: string, needles: string[]): boolean {
  const b = lower(body);
  return needles.some((n) => b.includes(n));
}

/**
 * HTTP 状态码 + 响应体 → 逐字错误文案。
 * 判定优先级（自上而下短路）：
 *  - 401 一律 Key 无效；403 先看"过期"字样再落权限；429 限流；404 模型不存在；
 *  - 400 按响应体关键词细分：max_tokens → 参数无效；temperature → 不支持自定义温度；
 *    上下文超长字样 → contextTooLong（顺序即优先级，上游报文常同时带多个词）；
 *  - 413 请求体过大 → 按上下文超长处理；5xx → 服务器不可用；
 *  - 未归类：保留上游原文（截 400 字符），便于排查——不硬套错误文案。
 */
export function classifyHttpError(status: number, body: string): string {
  const text = body ?? "";
  if (status === 401) return AI_ERRORS.invalidKey;
  if (status === 403) {
    if (mentions(text, ["expired", "过期"])) return AI_ERRORS.expiredKey;
    return AI_ERRORS.noPermission;
  }
  if (status === 429) return AI_ERRORS.rateLimited;
  if (status === 404) return AI_ERRORS.modelNotFound;
  if (status === 400) {
    if (mentions(text, ["max_tokens", "max tokens", "max_completion_tokens"])) return AI_ERRORS.badMaxTokens;
    if (mentions(text, ["temperature"])) return AI_ERRORS.temperatureUnsupported;
    if (mentions(text, ["context length", "context_length", "too long", "maximum context", "token limit"])) {
      return AI_ERRORS.contextTooLong;
    }
  }
  if (status === 413) return AI_ERRORS.contextTooLong;
  if (status >= 500) return AI_ERRORS.noResponse;
  // 未归类：保留上游原文，便于排查（不套用错误文案）
  const trimmed = text.length > 400 ? text.slice(0, 400) + "…" : text;
  return trimmed || AI_ERRORS.noResponse;
}

/**
 * 流式过程中断（网络层）错误分类。
 * 中断消息没有状态码，只能按关键词归类；归不了类时保留原文
 * （如 "connection reset by peer"），空消息兜底 noResponse。
 */
export function classifyStreamError(message: string): string {
  if (mentions(message, ["context length", "too long", "maximum context"])) return AI_ERRORS.contextTooLong;
  if (mentions(message, ["401", "unauthorized", "invalid api key"])) return AI_ERRORS.invalidKey;
  if (mentions(message, ["429", "rate limit"])) return AI_ERRORS.rateLimited;
  return message || AI_ERRORS.noResponse;
}
