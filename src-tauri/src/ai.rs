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

fn ai_client_builder() -> reqwest::ClientBuilder {
    // 上游可返回跨源 Location；reqwest 不会剥离 x-api-key 等自定义凭据头。
    // 所有 AI 请求都停在原始端点，3xx 交给现有非 2xx 错误路径处理。
    reqwest::Client::builder().redirect(reqwest::redirect::Policy::none())
}

const ERROR_BODY_LIMIT: usize = 64 * 1024;
const JSON_BODY_LIMIT: usize = 4 * 1024 * 1024;
const SSE_LINE_LIMIT: usize = 8 * 1024 * 1024;

// 不信任 Content-Length；分块响应也必须在扩容前检查实际累计字节数。
async fn read_response_text(resp: reqwest::Response, limit: usize) -> Result<String, String> {
    let mut stream = resp.bytes_stream();
    let mut body = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("响应读取失败: {e}"))?;
        if chunk.len() > limit - body.len() {
            return Err(format!("响应体超过 {limit} 字节上限"));
        }
        body.extend_from_slice(&chunk);
    }
    Ok(String::from_utf8_lossy(&body).into_owned())
}

async fn read_error_text(resp: reqwest::Response, notify: &Notify) -> Option<String> {
    // 仅错误响应限时；正常 SSE 思考流不设总时限。中止许可优先，避免再发错误事件。
    tokio::select! {
        biased;
        _ = notify.notified() => None,
        text = tokio::time::timeout(std::time::Duration::from_secs(15), read_response_text(resp, ERROR_BODY_LIMIT)) => {
            Some(match text {
                Ok(result) => result.unwrap_or_else(|e| e),
                Err(_) => "错误响应读取超时".into(),
            })
        }
    }
}

fn forward_sse_chunk(buf: &mut Vec<u8>, bytes: &[u8], mut emit_line: impl FnMut(String)) -> Result<(), String> {
    // 按行切片后再追加，避免一次大 chunk 或长期无换行的数据先撑大缓冲。
    for part in bytes.split_inclusive(|b| *b == b'\n') {
        let complete = part.last() == Some(&b'\n');
        let content = if complete { &part[..part.len() - 1] } else { part };
        if content.len() > SSE_LINE_LIMIT - buf.len() {
            buf.clear();
            return Err(format!("SSE 单行超过 {SSE_LINE_LIMIT} 字节上限"));
        }
        buf.extend_from_slice(content);
        if complete {
            emit_line(String::from_utf8_lossy(buf).trim_end_matches('\r').to_string());
            buf.clear();
        }
    }
    Ok(())
}

/// 活跃流的中断句柄（request_id → Notify），供「停止生成」取消上游流
pub struct AbortMap(pub Mutex<HashMap<String, Arc<Notify>>>);

/// 取锁的统一出口：poisoned 也取出数据继续用（N-47）。
/// 持锁期间没有可 panic 的代码路径，poison 只可能来自外部不可控因素；
/// panic=abort 的 release 构建里 unwrap 会让整个应用死掉，退而求其次：
/// poisoned 锁里的 HashMap 仍是完整可用的（写操作要么没开始要么已完成）。
fn lock_map<'a>(state: &'a tauri::State<'a, AbortMap>) -> std::sync::MutexGuard<'a, HashMap<String, Arc<Notify>>> {
    state.0.lock().unwrap_or_else(|p| p.into_inner())
}

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
    lock_map(&state).insert(request_id.clone(), notify.clone());

    let client = match ai_client_builder().build() {
        Ok(c) => c,
        Err(e) => {
            // 失败路径同样要清掉进门时注册的中断句柄（其余所有退出路径都清了），
            // 否则 AbortMap 残留条目永不释放，同 id 复用时 abort 会打到旧句柄
            lock_map(&state).remove(&request_id);
            return Err(format!("HTTP 客户端创建失败: {e}"));
        }
    };

    let mut req = client.post(&url).json(&body);
    for (k, v) in headers.iter() {
        req = req.header(k.as_str(), v.as_str());
    }

    // 连接阶段同样可中断：abort 即干净收尾（TS 侧按中止契约以「已中止」结束，
    // 不发任何 line，界面保留已有内容）
    let sent = tokio::select! {
        _ = notify.notified() => {
            lock_map(&state).remove(&request_id);
            emit(&app, &request_id, "done", String::new());
            return Ok(());
        }
        res = req.send() => res,
    };

    let resp = match sent {
        Ok(r) => r,
        Err(e) => {
            lock_map(&state).remove(&request_id);
            emit(&app, &request_id, "stream_error", format!("{e}"));
            emit(&app, &request_id, "done", String::new());
            return Ok(());
        }
    };

    let status = resp.status();
    if !status.is_success() {
        let text = read_error_text(resp, &notify).await;
        lock_map(&state).remove(&request_id);
        let Some(text) = text else {
            emit(&app, &request_id, "done", String::new());
            return Ok(());
        };
        // 错误体截断到 200 字符再转发（与 ai_models/ai_balance 同口径）：
        // 上游错误页可以是整份 HTML，无界转发会撑爆事件负载
        let brief: String = text.chars().take(200).collect();
        emit(
            &app,
            &request_id,
            "http_error",
            format!("{}|{}", status.as_u16(), brief),
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
                        if let Err(e) = forward_sse_chunk(&mut buf, &bytes, |s| emit(&app, &request_id, "line", s)) {
                            emit(&app, &request_id, "stream_error", e);
                            break;
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

    lock_map(&state).remove(&request_id);

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
    if let Some(notify) = lock_map(&state).remove(&request_id) {
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

    let client = ai_client_builder()
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
    if !status.is_success() {
        let text = read_response_text(resp, ERROR_BODY_LIMIT).await.unwrap_or_else(|e| e);
        let brief: String = text.chars().take(200).collect();
        return Err(format!("HTTP {}: {}", status.as_u16(), brief));
    }
    let text = read_response_text(resp, JSON_BODY_LIMIT).await?;

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

/// 余额查询请求（只有 DeepSeek 官方提供 `GET /user/balance`，见 docs/DECISIONS.md 附录 A §6）
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BalanceRequest {
    pub base_url: String,
    pub api_key: String,
}

/// 单币种余额（金额原样透传为字符串，避免浮点误差）
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BalanceEntry {
    pub currency: String,
    pub total_balance: String,
    pub granted_balance: String,
    pub topped_up_balance: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BalanceInfo {
    pub is_available: bool,
    pub balances: Vec<BalanceEntry>,
}

/// 把用户填的 Base URL 规整成余额端点：去掉尾部 '/'、剥掉结尾的 `/v1`
/// （余额端点**不在** `/v1` 下，见官方 API Reference），再拼 `/user/balance`。
pub fn balance_url(base_url: &str) -> String {
    let base = base_url.trim().trim_end_matches('/');
    let base = base.strip_suffix("/v1").unwrap_or(base);
    format!("{base}/user/balance")
}

/// 查余额（DeepSeek 官方独有端点）。失败以 Err 字符串返回，界面直接展示。
#[tauri::command]
pub async fn ai_balance(request: BalanceRequest) -> Result<BalanceInfo, String> {
    let BalanceRequest { base_url, api_key } = request;
    if base_url.trim().is_empty() || api_key.trim().is_empty() {
        return Err("请先填写接口地址与 API Key".into());
    }
    let url = balance_url(&base_url);

    let client = ai_client_builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("HTTP 客户端创建失败: {e}"))?;

    let resp = client
        .get(&url)
        .header("authorization", format!("Bearer {}", api_key.trim()))
        .send()
        .await
        .map_err(|e| format!("连接失败: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        let text = read_response_text(resp, ERROR_BODY_LIMIT).await.unwrap_or_else(|e| e);
        let brief: String = text.chars().take(200).collect();
        return Err(format!("HTTP {}: {}", status.as_u16(), brief));
    }
    let text = read_response_text(resp, JSON_BODY_LIMIT).await?;

    let v: Value = serde_json::from_str(&text).map_err(|_| "响应不是 JSON".to_string())?;
    let is_available = v.get("is_available").and_then(|b| b.as_bool()).unwrap_or(false);
    let mut balances: Vec<BalanceEntry> = Vec::new();
    if let Some(arr) = v.get("balance_infos").and_then(|b| b.as_array()) {
        for item in arr {
            let s = |k: &str| item.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string();
            balances.push(BalanceEntry {
                currency: s("currency"),
                total_balance: s("total_balance"),
                granted_balance: s("granted_balance"),
                topped_up_balance: s("topped_up_balance"),
            });
        }
    }
    Ok(BalanceInfo {
        is_available,
        balances,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    // 双端口构成跨源重定向；只发占位凭据，不触碰真实上游或本机配置。
    async fn serve_once(listener: TcpListener, response: String) -> String {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut request = Vec::new();
        let mut chunk = [0; 1024];
        while !request.windows(4).any(|w| w == b"\r\n\r\n") {
            let n = socket.read(&mut chunk).await.unwrap();
            assert!(n > 0);
            request.extend_from_slice(&chunk[..n]);
            assert!(request.len() < 16384);
        }
        socket.write_all(response.as_bytes()).await.unwrap();
        String::from_utf8(request).unwrap()
    }

    // 有限分块后故意不发结束块，验证读到上限或收到中止就退出，无需等待 EOF。
    async fn chunked_response(status: u16, chunks: Vec<Vec<u8>>) -> (reqwest::Response, tokio::task::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = [0; 4096];
            socket.read(&mut request).await.unwrap();
            socket.write_all(format!("HTTP/1.1 {status} Test\r\nTransfer-Encoding: chunked\r\n\r\n").as_bytes()).await.unwrap();
            for chunk in chunks {
                socket.write_all(format!("{:x}\r\n", chunk.len()).as_bytes()).await.unwrap();
                socket.write_all(&chunk).await.unwrap();
                socket.write_all(b"\r\n").await.unwrap();
            }
            let mut closed = [0; 1];
            let _ = socket.read(&mut closed).await;
        });
        let response = ai_client_builder().no_proxy().build().unwrap().get(url).send().await.unwrap();
        (response, server)
    }

    #[tokio::test]
    async fn response_limits_and_abort_do_not_wait_for_eof() {
        let (response, server) = chunked_response(500, vec![vec![b'x'; ERROR_BODY_LIMIT + 1]]).await;
        let notify = Notify::new();
        let result = tokio::time::timeout(std::time::Duration::from_secs(2), read_error_text(response, &notify)).await.unwrap().unwrap();
        assert!(result.contains("超过"));
        server.await.unwrap();

        let (response, server) = chunked_response(500, vec![b"partial".to_vec()]).await;
        let reading = read_error_text(response, &notify);
        tokio::pin!(reading);
        // 先驱动到等待响应体，再显式发中止；不靠 sleep 或真实超时触发行为。
        assert!(futures_util::poll!(reading.as_mut()).is_pending());
        notify.notify_one();
        assert_eq!(tokio::time::timeout(std::time::Duration::from_secs(2), reading).await.unwrap(), None);
        server.await.unwrap();

        let (response, server) = chunked_response(200, vec![b"1234".to_vec(), b"56789".to_vec()]).await;
        let result = tokio::time::timeout(std::time::Duration::from_secs(2), read_response_text(response, 8)).await.unwrap();
        assert!(result.unwrap_err().contains("超过"));
        server.await.unwrap();
    }

    #[tokio::test]
    async fn sse_chunked_oversize_line_stops_before_eof() {
        let (response, server) = chunked_response(200, vec![vec![b'x'; SSE_LINE_LIMIT], vec![b'x']]).await;
        let reading = async move {
            let mut stream = response.bytes_stream();
            let mut buf = Vec::new();
            while let Some(chunk) = stream.next().await {
                if forward_sse_chunk(&mut buf, &chunk.unwrap(), |_| panic!("no newline")).is_err() {
                    assert!(buf.is_empty());
                    return;
                }
            }
            panic!("expected a line limit error before EOF");
        };
        tokio::time::timeout(std::time::Duration::from_secs(2), reading).await.unwrap();
        server.await.unwrap();
    }

    #[tokio::test]
    async fn models_and_balance_enforce_response_limits() {
        for status in [200, 500] {
            for models in [true, false] {
                let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
                let base_url = format!("http://{}", listener.local_addr().unwrap());
                let limit = if status == 200 { JSON_BODY_LIMIT } else { ERROR_BODY_LIMIT };
                let body = "x".repeat(limit + 1);
                let server = tokio::spawn(serve_once(listener, format!(
                    "HTTP/1.1 {status} Test\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()
                )));
                let error = if models {
                    ai_models(ModelsRequest { base_url, api_key: "placeholder-key".into(), use_anthropic_format: true }).await.unwrap_err()
                } else {
                    ai_balance(BalanceRequest { base_url, api_key: "placeholder-key".into() }).await.unwrap_err()
                };
                assert!(error.contains("超过"), "{error}");
                if status == 500 {
                    assert!(error.starts_with("HTTP 500:"));
                }
                server.await.unwrap();
            }
        }
    }

    #[tokio::test]
    async fn bounded_response_preserves_utf8_at_exact_limit() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(serve_once(listener,
            "HTTP/1.1 200 OK\r\nContent-Length: 6\r\nConnection: close\r\n\r\n中文".into()));
        let response = ai_client_builder().no_proxy().build().unwrap().get(url).send().await.unwrap();
        assert_eq!(read_response_text(response, 6).await.unwrap(), "中文");
        server.await.unwrap();
    }

    #[test]
    fn sse_line_limit_preserves_split_utf8_and_many_short_lines() {
        let mut buf = Vec::new();
        let mut lines = Vec::new();
        let line = "data: 中文\r\n".as_bytes();
        forward_sse_chunk(&mut buf, &line[..7], |s| lines.push(s)).unwrap();
        forward_sse_chunk(&mut buf, &line[7..], |s| lines.push(s)).unwrap();
        assert_eq!(lines, ["data: 中文"]);
        for _ in 0..2 {
            forward_sse_chunk(&mut buf, &vec![b'x'; SSE_LINE_LIMIT / 2], |_| panic!("no complete line")).unwrap();
        }
        forward_sse_chunk(&mut buf, b"\n", |s| assert_eq!(s.len(), SSE_LINE_LIMIT)).unwrap();
        // 总流量可以超过单行上限；逐行清空缓冲，不设正常长思考的总时限。
        for _ in 0..3 {
            let mut chunk = vec![b'x'; SSE_LINE_LIMIT / 2];
            chunk.push(b'\n');
            forward_sse_chunk(&mut buf, &chunk, |_| {}).unwrap();
        }
        forward_sse_chunk(&mut buf, &vec![b'x'; SSE_LINE_LIMIT], |_| {}).unwrap();
        assert!(forward_sse_chunk(&mut buf, b"x", |_| panic!("oversize line emitted")).is_err());
        assert!(buf.is_empty());
        assert!(forward_sse_chunk(&mut buf, &vec![b'x'; SSE_LINE_LIMIT + 1], |_| {}).is_err());
    }

    #[tokio::test]
    async fn credentialed_requests_do_not_follow_redirects() {
        for status in [301, 302, 303, 307, 308] {
            for route in ["stream", "models_anthropic", "models_openai", "balance"] {
                let source = TcpListener::bind("127.0.0.1:0").await.unwrap();
                let target = TcpListener::bind("127.0.0.1:0").await.unwrap();
                let base_url = format!("http://{}", source.local_addr().unwrap());
                let target_url = format!("http://{}/target", target.local_addr().unwrap());
                let source_task = tokio::spawn(serve_once(source, format!(
                    "HTTP/1.1 {status} Redirect\r\nLocation: {target_url}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                )));
                let (visited_tx, mut visited_rx) = tokio::sync::mpsc::channel(1);
                let target_task = tokio::spawn(async move {
                    let body = r#"{"data":[],"is_available":true,"balance_infos":[]}"#;
                    let request = serve_once(target, format!(
                        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()
                    )).await;
                    visited_tx.send(request).await.unwrap();
                });
                let refused = match route {
                    "stream" => {
                        // 使用 ai_stream 的同一 builder，避免启动桌面 WebView。
                        let response = ai_client_builder().no_proxy()
                            .timeout(std::time::Duration::from_secs(3)).build().unwrap()
                            .post(&base_url)
                            .header("x-api-key", "placeholder-key")
                            .header("authorization", "Bearer placeholder-key")
                            .json(&serde_json::json!({"stream": true}))
                            .send().await.unwrap();
                        response.status().as_u16() == status
                    }
                    "models_anthropic" | "models_openai" => ai_models(ModelsRequest {
                        base_url, api_key: "placeholder-key".into(),
                        use_anthropic_format: route == "models_anthropic",
                    }).await.unwrap_err().starts_with(&format!("HTTP {status}:")),
                    "balance" => ai_balance(BalanceRequest {
                        base_url, api_key: "placeholder-key".into(),
                    }).await.unwrap_err().starts_with(&format!("HTTP {status}:")),
                    _ => unreachable!(),
                };
                source_task.await.unwrap();
                // send() 完成后，若跟随重定向，目标必已接受连接并回包。
                tokio::task::yield_now().await;
                let visited = visited_rx.try_recv().ok();
                target_task.abort();
                let _ = target_task.await;
                assert!(visited.is_none(), "{route} followed HTTP {status}; target received: {visited:?}");
                assert!(refused, "{route} did not surface HTTP {status}");
            }
        }
    }

    #[test]
    fn balance_url_规整_v1_与尾部斜杠() {
        assert_eq!(
            balance_url("https://api.deepseek.com"),
            "https://api.deepseek.com/user/balance"
        );
        assert_eq!(
            balance_url("https://api.deepseek.com/"),
            "https://api.deepseek.com/user/balance"
        );
        assert_eq!(
            balance_url("https://api.deepseek.com/v1"),
            "https://api.deepseek.com/user/balance"
        );
        assert_eq!(
            balance_url("https://api.deepseek.com/v1/"),
            "https://api.deepseek.com/user/balance"
        );
        assert_eq!(
            balance_url("  https://api.deepseek.com/v1  "),
            "https://api.deepseek.com/user/balance"
        );
        // 以 /v1 开头的其它路径不能被误剥（只剥完整的 /v1 结尾）
        assert_eq!(
            balance_url("https://example.com/v1beta"),
            "https://example.com/v1beta/user/balance"
        );
    }
}
