//! AI 接入层的网络能力：把上游 SSE 原样转发到前端。
//!
//! 为什么放在 Rust：WebView 里直接 fetch 会撞 CORS，且流式响应在浏览器侧不可控。
//! 这里只做「转发」——协议解析、错误分类、工具循环全部在 TS 侧（可单测）。

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tokio::sync::Notify;

/// 活跃流的中断句柄（request_id → Notify），供「停止生成」取消上游流
pub struct AbortMap(pub Mutex<HashMap<String, Arc<Notify>>>);

/// 一次流式请求的配置
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRequest {
    pub request_id: String,
    pub url: String,
    pub headers: HashMap<String, String>,
    pub body: Value,
}

/// 事件负载：kind = line | http_error | stream_error | done
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AiChunk {
    pub request_id: String,
    pub kind: String,
    pub data: String,
}

pub const EVENT_NAME: &str = "ai_chunk";

fn emit(app: &AppHandle, request_id: &str, kind: &str, data: String) {
    let _ = app.emit(
        EVENT_NAME,
        AiChunk {
            request_id: request_id.to_string(),
            kind: kind.to_string(),
            data,
        },
    );
}

#[tauri::command]
pub async fn ai_stream(
    app: AppHandle,
    state: tauri::State<'_, AbortMap>,
    request: AiRequest,
) -> Result<(), String> {
    let AiRequest {
        request_id,
        url,
        headers,
        body,
    } = request;

    // 中断句柄**进门就注册**（早于连接）：连接阶段（弱网可达数秒）用户点
    // 「停止生成」时 ai_abort 也能拿到句柄。配合 ai_abort 的 notify_one
    // （无等待者时存许可），abort 早于本处 select 注册也不会丢。
    let notify = Arc::new(Notify::new());
    state
        .0
        .lock()
        .unwrap()
        .insert(request_id.clone(), notify.clone());

    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| format!("HTTP 客户端创建失败: {e}"))?;

    let mut req = client.post(&url).json(&body);
    for (k, v) in headers.iter() {
        req = req.header(k.as_str(), v.as_str());
    }

    // 连接阶段同样可中断：abort 即干净收尾（TS 侧按中止契约以「已中止」结束，
    // 不发任何 line，界面保留已有内容）
    let sent = tokio::select! {
        _ = notify.notified() => {
            state.0.lock().unwrap().remove(&request_id);
            emit(&app, &request_id, "done", String::new());
            return Ok(());
        }
        res = req.send() => res,
    };

    let resp = match sent {
        Ok(r) => r,
        Err(e) => {
            state.0.lock().unwrap().remove(&request_id);
            emit(&app, &request_id, "stream_error", format!("{e}"));
            emit(&app, &request_id, "done", String::new());
            return Ok(());
        }
    };

    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        state.0.lock().unwrap().remove(&request_id);
        emit(
            &app,
            &request_id,
            "http_error",
            format!("{}|{}", status.as_u16(), text),
        );
        emit(&app, &request_id, "done", String::new());
        return Ok(());
    }

    let mut stream = resp.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();

    let mut aborted = false;
    loop {
        tokio::select! {
            _ = notify.notified() => {
                aborted = true;
                break;
            }
            item = stream.next() => {
                match item {
                    Some(Ok(bytes)) => {
                        buf.extend_from_slice(&bytes);
                        while let Some(pos) = buf.iter().position(|b| *b == b'\n') {
                            let line: Vec<u8> = buf.drain(..=pos).collect();
                            let s = String::from_utf8_lossy(&line[..line.len() - 1])
                                .trim_end_matches('\r')
                                .to_string();
                            emit(&app, &request_id, "line", s);
                        }
                    }
                    Some(Err(e)) => {
                        emit(&app, &request_id, "stream_error", format!("{e}"));
                        break;
                    }
                    None => break,
                }
            }
        }
    }

    state.0.lock().unwrap().remove(&request_id);

    if !buf.is_empty() {
        let s = String::from_utf8_lossy(&buf).to_string();
        emit(&app, &request_id, "line", s);
    }
    emit(&app, &request_id, "done", String::new());
    let _ = aborted; // 中断即干净收尾：已收到的部分正文保留
    Ok(())
}

/// 「停止生成」：中断指定请求的上游流（已收到的部分正文保留）。
/// 用 notify_one 而非 notify_waiters：abort 先于流循环注册等待者到达时，
/// 许可会被存下，随后的 notified() 立即返回，不丢中断。
#[tauri::command]
pub async fn ai_abort(state: tauri::State<'_, AbortMap>, request_id: String) -> Result<(), String> {
    if let Some(notify) = state.0.lock().unwrap().remove(&request_id) {
        notify.notify_one();
    }
    Ok(())
}

/// 拉取上游模型清单（OpenAI 兼容 GET {base}/models；Anthropic 用 x-api-key 头）。
/// 供设置屏「检测连接 + 模型下拉」使用。
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelsRequest {
    pub base_url: String,
    pub api_key: String,
    pub use_anthropic_format: bool,
}

#[tauri::command]
pub async fn ai_models(request: ModelsRequest) -> Result<Vec<String>, String> {
    let ModelsRequest {
        base_url,
        api_key,
        use_anthropic_format,
    } = request;

    let base = base_url.trim().trim_end_matches('/');
    if base.is_empty() || api_key.trim().is_empty() {
        return Err("请先填写接口地址与 API Key".into());
    }
    // base 可能带 /v1 后缀；两种习惯都兼容
    let url = if base.ends_with("/v1") {
        format!("{base}/models")
    } else {
        format!("{base}/v1/models")
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("HTTP 客户端创建失败: {e}"))?;

    let mut req = client.get(&url);
    if use_anthropic_format {
        req = req
            .header("x-api-key", api_key.trim())
            .header("anthropic-version", "2023-06-01");
    } else {
        req = req.header("authorization", format!("Bearer {}", api_key.trim()));
    }

    let resp = req.send().await.map_err(|e| format!("连接失败: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        let brief: String = text.chars().take(200).collect();
        return Err(format!("HTTP {}: {}", status.as_u16(), brief));
    }

    let v: Value = serde_json::from_str(&text).map_err(|_| "响应不是 JSON".to_string())?;
    // OpenAI 兼容：{"data":[{"id":...}]}; Anthropic：{"data":[{"id":...}]} 同构
    let mut ids: Vec<String> = Vec::new();
    if let Some(arr) = v.get("data").and_then(|d| d.as_array()) {
        for item in arr {
            if let Some(id) = item.get("id").and_then(|i| i.as_str()) {
                ids.push(id.to_string());
            }
        }
    }
    ids.sort();
    Ok(ids)
}
