# 改造裁决记录（DECISIONS）

本文件记录 **DeepCompose 改造（B0–B9）** 期间由用户逐项拍板的裁决。凡与代码行为相关的裁决，
都有对应的实现批次；凡新增配置键 / 新增磁盘文件的裁决，同时也作为**ADR 记录**（README 要求
「新增配置键必须走 ADR 记录并同步 `src/core/prefs.ts`」）。

> 事实基线（DeepSeek 官方接口）见文末附录 A；官方文档与我方记忆冲突时**以附录 A 为准**。

---

## 一、作品彻底删除

| ID | 裁决 | 说明 |
|---|---|---|
| D-001 | **两段式删除**：先「移入回收站」（可恢复），另提供「彻底删除」与「清空回收站」 | 复用早已预留但从未实现的契约名 `.openwrite_recycle\` 与 `recycle_manifest.json` |
| D-002 | 连带清理范围 = **作品目录 + 对应会话索引条目**；**快照与备忘录保留** | 快照留作审计痕迹；备忘录是全局记录，可能被作者手工引用 |
| D-003 | 四道安全门：① 目标必须是 `booksRoot` 的**直接子目录**（拒绝盘符根、拒绝 `booksRoot` 自身）；② 先 `stat` 拒 reparse point（只删链接本身，绝不穿透）；③ 输入书名全等确认；④ **活性保护**（该书正被 AI 会话/回流/冷读占用时拒绝执行） | 对应 KL-DF-10 |

## 二、改名

| ID | 裁决 | 说明 |
|---|---|---|
| D-004 | 第二代改名 **KeepCompose → DeepCompose**（版本 `1.1.0`，identifier `com.deepcompose.desktop`，crate `deepcompose` / `deepcompose_lib`，产物 `DeepCompose.exe`，快捷方式 `DeepCompose.lnk`） | 在 B9 执行 |
| D-005 | **只改品牌面**：磁盘契约一个字不改（`writerd_*`、`.openwrite_*`、`recycle_manifest.json`、`flutter.*`、`com.writerd\writerD`、中文目录名） | 老作品、老配置、老会话零迁移；`AGENTS.md` 已补成「两代改名 + 冻结名清单」 |

## 三、API 供应商

| ID | 裁决 | 说明 |
|---|---|---|
| D-006 | 三平台预设：**DeepSeek 官方** / **硅基流动** / **自定义**；平台 Base URL **内置**（可改） | DeepSeek 官方：OpenAI 格式 `https://api.deepseek.com`、Anthropic 格式 `https://api.deepseek.com/anthropic`；硅基流动：`https://api.siliconflow.cn/v1`（国际站 `.com`） |
| D-007 | 具名配置可保存多个并随时切换：`ApiProfile` 扩展 `id` / `platform` / `thinking` / `reasoningEffort` / `reasoningReplay` / `supportsThinking`；新增配置键 `active_api_profile`（存 id） | **ADR（新增键）**：老条目无 `id` 时按 `name + baseUrl` 派生并写回；「与全局键一致即视为选中」的旧语义保留为回退 |
| D-008 | 模型 id **不写死**：预设 Base URL，模型清单靠「检测连接」调 `/models` 拉取 | 对应 KL-DF-08 |
| D-009 | 密钥沿用既有**明文存本地 prefs** 的格式（改加密会破坏契约与老配置）；UI 掩码显示、不回显全文、不进日志 | 密钥纪律不变：不入库、不进测试与证据 |

## 四、思考模式（DeepSeek 增强层）

| ID | 裁决 | 说明 |
|---|---|---|
| D-010 | 主界面输入框旁加**思考开关 chip** + **三档吸附滑轨**（关闭 / 低 / 高 / 最高） | 底层只有 `low/high/max` 三档真语义，故不做连续滑条（假精度）；档位带代价提示 |
| D-011 | 状态优先级：平台内置初值 → 配置级默认（每个具名配置各存一份）→ **会话级临时值**；会话级**只存内存**，不写会话文件 | 不碰磁盘契约 |
| D-012 | `reasoning_content` 回传策略：**按平台 + 是否带 tools 自动**——DeepSeek 带工具必回传、冷读（零工具）不回传、其他平台不回传 | 官方规则（附录 A §5）；写进 `protocol.ts` 装配层 + 回归锁 |
| D-013 | 思考开启时 `temperature` / `presence_penalty` / `frequency_penalty` **置灰**并标注「思考模式下不生效」；`top_p` 标注有效区间 0.95–1.0 | 官方明确「设了不报错但无效」，静默无效是体验陷阱 |
| D-014 | 后台任务：**回流 / 压缩强制关闭思考**；冷读跟随用户开关 | 结构化输出任务，思考只增时延与 token |

## 五、标题栏鲸鱼与统计面板

| ID | 裁决 | 说明 |
|---|---|---|
| D-015 | 鲸鱼走廊：**标题栏中段**，左锚 = 品牌旁视图按钮簇**右缘 + 24px**，右锚 = **设置齿轮左缘 − 24px**；走廊**运行时量 DOM** 自动计算，不写死坐标 | 窗口过窄（<120px）退化为原地浮动 |
| D-016 | 鲸鱼图形**原创极简 SVG**（单色实心 + 腹线 + 眼点 + 尾鳍缺口，形体偏圆润），**不复制 DeepSeek 商标**；跟随三主题与强调色；零渐变 | 现有 `logo.png` 本身即「抽象蓝鲸 + 笔」，气质一致 |
| D-017 | 交互：悬停 / 键盘聚焦 / 点击钉住三种打开方式；悬停有意图延迟（进 120ms、出 250ms）；鲸鱼本体为 `<button>`（键盘可达，且复用标题栏拖拽的 `closest("button")` 跳过逻辑）；`reduced-motion` 下**不游动但面板功能保留** | 功能不因动画降级而丢失 |
| D-018 | 闲置省电：**开关形式，默认开启**——面板关闭且 5 分钟无鼠标/键盘交互则静止，鼠标移入立即恢复 | 写作台会连开数小时 |
| D-019 | 面板内容：**token 统计（今日汇总：输入 / 输出 / 缓存命中 / 未命中 + 本次会话累计）+ 闲时/忙时倒计时 + 余额**；打开时 60s 节流刷新，另有手动刷新 | 余额为官方权威数据，且能在 402 之前预警 |
| D-020 | **不做「今日用量（人民币）」**（用户裁决，取消余额差值法与价格估算两种口径） | 面板不出现任何金额估算数字；`usage_stats.json` 只存 token 桶与余额快照 |
| D-021 | 闲时判定**只按官方 UTC 窗口**：峰值 = 周一至周五 `01:00–04:00`、`06:00–10:00` UTC（本地 UTC+8 = 周一至周五 09:00–12:00、14:00–18:00），其余闲时；**不内置中国法定节假日表**，面板注明「节假日未计入」 | 零维护 |
| D-022 | 平台选择提示：**DeepSeek** → 非阻塞气泡「吃白饭的大肥鱼已就位」（2.5–3s 自动消失）；**硅基流动 / 自定义** → 确认弹窗（逐字使用既定文案）+「不再提示」勾选 + 按钮「仍要使用」/「换回 DeepSeek」 | 气泡文案由用户给定，逐字使用 |

## 六、契约与数据

| ID | 裁决 | 说明 |
|---|---|---|
| D-023 | **新增本地文件** `%APPDATA%\com.writerd\writerD\usage_stats.json`（按日 token 分桶 + 余额快照 + 最近错误），**additive 契约**，可随时删除 | README 契约表已加行；与 `shared_preferences.json`、`window_state.json` 同目录 |
| D-024 | 上限放宽：`contextLimit` → **1M**、`maxOutputTokens` → **384K** | 对应 KL-DF-09（原钳在 200K） |
| D-025 | 引擎侧**不传 `user_id`**（少一个变量）；**不内置价格表** | 官方 `user_id` 只做内容安全/KVCache/调度隔离，且要求 `[a-zA-Z0-9\-_]+` |
| D-026 | 闸门口径不变：`tsc --noEmit` 干净 + `vitest run` 全绿 + `cargo test --lib` 全绿（**永不跑 `--release`**）；每批原子提交并附实测输出 | 基线：vitest 273 例、cargo 13 例 |

---

## 附录 A：DeepSeek 官方接口事实基线（文档抓取）

> 以下为改造规划阶段从官方文档抓取的结果。**与记忆冲突时以本附录为准**；若与本附录冲突的是
> 官方最新文档，则以官方为准并回来更新本附录。

来源：
- [Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing)
- [Your First API Call](https://api-docs.deepseek.com/)
- [Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode)
- [Tool Calls](https://api-docs.deepseek.com/guides/tool_calls)
- [Context Caching](https://api-docs.deepseek.com/guides/kv_cache)
- [Rate Limit & Isolation](https://api-docs.deepseek.com/quick_start/rate_limit)
- [Error Codes](https://api-docs.deepseek.com/quick_start/error_codes)
- [Get User Balance](https://api-docs.deepseek.com/api/get-user-balance)

### 1. 模型与端点

| 项 | 值 |
|---|---|
| 模型 | `deepseek-flash`（DeepSeek-V4.1-Flash）、`deepseek-v4-pro`（DeepSeek-V4-Pro-0813） |
| 旧名 | `deepseek-v4-flash`、`deepseek-v4-flash-vision-exp` 仍接受但**已退役**，由 V4.1-Flash 承接、按 Flash 计费 |
| Base URL（OpenAI 格式） | `https://api.deepseek.com` |
| Base URL（Anthropic 格式） | `https://api.deepseek.com/anthropic` |
| 上下文 / 最大输出 | **1M / 384K** |
| 并发上限（账号级，与 Key 无关） | flash 2500、v4-pro 500 |
| 能力 | JSON 输出 ✓、工具调用 ✓、Responses API ✓、Anthropic API ✓、Chat Prefix（Beta）✓、FIM（仅非思考模式）、Vision（flash ✓ / pro ✗） |

### 2. 思考模式参数（三种格式）

| | OpenAI 格式 | Anthropic 格式 |
|---|---|---|
| 开关 | `{"thinking": {"type": "enabled/disabled"}}` | `{"reasoning": {"effort": "none/low/high/max"}}`（`none` 即关闭） |
| 档位 | `reasoning_effort: low/high/max` | `output_config.effort: low/high/max` |

- 思考模式**默认开启**，默认 effort = `high`。
- effort 别名映射：`minimal/low → low`、`medium/high → high`、`max → max`、`xhigh/ultra → max`。
  **真正有区分度的只有 low / high / max 三档**。

### 3. 思考模式下的采样参数

- `temperature`、`presence_penalty`、`frequency_penalty`：**设了不报错，但完全无效**（官方为兼容既有软件故意不报错）。
- `top_p`：**只在思考模式生效**，有效区间被夹到 `0.95–1.0`（低于 0.95 按 0.95）；非思考模式固定 `1.0`，所填值被忽略。

### 4. 工具调用

- 思考模式下**支持工具调用**（V3.2 起）。
- Chat Completions **不支持在对话中间插入 tool call**（Anthropic 格式与 Responses API 支持）。
- `strict` 模式为 Beta（需 `/beta` 端点）：要求所有 object 属性都 required + `additionalProperties: false`，
  不支持 `minLength` / `maxLength` / `minItems` / `maxItems` —— **我们现有工具 schema 不满足，默认不开**。

### 5. `reasoning_content` 回传规则（关键）

- 思考内容在 `reasoning_content` 字段返回，与 `content` 同级。
- **请求不带 `tools`**：历史 `reasoning_content` 不必回传，传了也被忽略、不进上下文。
- **请求带 `tools`**：所有历史轮的 `reasoning_content` **必须完整回传**（含模型未调用工具的那些轮）。

### 6. 用量、缓存与余额

- `usage` 含 `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`（磁盘上下文缓存，默认开启，best-effort）。
- 缓存按「前缀单元」**完整匹配**命中；缓存几小时到几天自动清理；**改写历史前缀会打掉缓存**。
- `GET /user/balance` → `is_available` + `balance_infos[{currency: CNY|USD, total_balance, granted_balance, topped_up_balance}]`。
- **API Reference 里没有「按日用量 / 账单」端点**（只有余额）→ 这也是本改造放弃人民币用量估算的直接原因之一（D-020）。

### 7. 错误码

`400` 请求体格式错误 / `401` 鉴权失败 / `402` **余额不足** / `422` **参数无效** / `429` 限流 /
`500` 服务端错误 / `503` 服务端过载。**官方错误码列表里没有 404** → 404 基本等价于「URL 写错」。

### 8. 保活与超时

- 流式请求会持续返回 SSE 注释行 `: keep-alive`；非流式持续返回空行。
- 请求发出后 **10 分钟未开始推理**，服务端关闭连接。

### 9. 价格时段（仅用于理解闲时/忙时）

- 峰值时段：**UTC 周一至周五 01:00–04:00、06:00–10:00**（不含中国法定节假日）；其余时段（含周末与法定节假日全天）为谷价。
- 谷价 = 峰价一半。官方保留调价权。