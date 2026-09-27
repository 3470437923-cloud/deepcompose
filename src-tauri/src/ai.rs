//! AI 接入层的网络能力：把上游 SSE 原样转发到前端。
//!
//! 为什么放在 Rust：WebView 里直接 fetch 会撞 CORS，且流式响应在浏览器侧不可控。
//! 这里只做「转发」——协议解析、错误分类、工具循环全部在 TS 侧（可单测）。

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter};

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
pub async fn ai_stream(app: AppHandle, request: AiRequest) -> Result<(), String> {
    let AiRequest {
        request_id,
        url,
        headers,
        body,
    } = request;

    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| format!("HTTP 客户端创建失败: {e}"))?;

    let mut req = client.post(&url).json(&body);
    for (k, v) in headers.iter() {
        req = req.header(k.as_str(), v.as_str());
    }

    let resp = match req.send().await {
        Ok(r) => r,
        Err(e) => {
            emit(&app, &request_id, "stream_error", format!("{e}"));
            emit(&app, &request_id, "done", String::new());
            return Ok(());
        }
    };

    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
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

    while let Some(item) = stream.next().await {
        match item {
            Ok(bytes) => {
                buf.extend_from_slice(&bytes);
                while let Some(pos) = buf.iter().position(|b| *b == b'\n') {
                    let line: Vec<u8> = buf.drain(..=pos).collect();
                    let s = String::from_utf8_lossy(&line[..line.len() - 1])
                        .trim_end_matches('\r')
                        .to_string();
                    emit(&app, &request_id, "line", s);
                }
            }
            Err(e) => {
                emit(&app, &request_id, "stream_error", format!("{e}"));
                break;
            }
        }
    }

    if !buf.is_empty() {
        let s = String::from_utf8_lossy(&buf).to_string();
        emit(&app, &request_id, "line", s);
    }
    emit(&app, &request_id, "done", String::new());
    Ok(())
}
