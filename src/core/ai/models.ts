/**
 * 上游模型清单拉取（设置屏「检测连接 + 模型下拉」）。
 * 走 Rust 侧 ai_models 命令（避开 WebView CORS）。
 */

import { invoke } from "@tauri-apps/api/core";

/**
 * 拉取模型 id 清单（升序）。
 * 参数与 Rust 侧 ModelsRequest（serde camelCase）逐一对应：
 * baseUrl / apiKey / useAnthropicFormat——Anthropic 格式用 x-api-key +
 * anthropic-version 头，OpenAI 格式用 Bearer 鉴权；15 秒超时与非空校验在 Rust 侧。
 * 失败（未填地址/Key、连接失败、非 JSON 响应）以 Err 字符串 reject，界面直接展示。
 */
export async function fetchModels(
  baseUrl: string,
  apiKey: string,
  useAnthropicFormat: boolean,
): Promise<string[]> {
  return invoke<string[]>("ai_models", {
    request: {
      baseUrl,
      apiKey,
      useAnthropicFormat,
    },
  });
}
