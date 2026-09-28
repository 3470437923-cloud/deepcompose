/**
 * 上游模型清单拉取（设置屏「检测连接 + 模型下拉」）。
 * 走 Rust 侧 ai_models 命令（避开 WebView CORS）。
 */

import { invoke } from "@tauri-apps/api/core";

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
