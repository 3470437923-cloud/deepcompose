# OpenWrite v2.0.1 完整配置模型规格（PREFS）

> 本文件是**提取与归类**结果，不含产品设计与改进建议。
> 标注约定：**实测** = 直接从 `shared_preferences.json` / strings 文件读到的字面值；
> **推断** = 由键名语义或结构推断，未被值本身证明。
> 任何密钥、密码、手机号、设备标识一律写「存在（值已省略）」。

## 1. 来源与键总数统计

| 项 | 值 | 证据 |
|---|---|---|
| 权威来源 | `C:\Users\Administrator\AppData\Roaming\com.openwrite\OpenWrite\shared_preferences.json` | 实测 |
| 文件字节数 | 8293（单行 JSON，无 BOM，UTF-8） | 实测 |
| **实际键总数** | **43** | 实测 |
| 键名前缀 | 全部为 `flutter.`（43/43） | 实测 |
| 值类型分布 | str=16、bool=12、float=7、int=7、list=1 | 实测 |

### 1.1 与输入描述的差异（必读）

- 任务描述与 `S:\writerD\docs\CONTRACT.md` 第 107 行均称「实测 442 键」。
  **实测该 JSON 只有 43 个键**，占 8293 字节；全部键名逐个枚举见第 2 节。
- 任务描述同时称本文件「约 442 个键」，与文件实际内容不符。
  **本文档一律以 JSON 内的 43 个键为权威口径**，不把「442」当作本文件的键数。
- 「442」这一数字无法从提供的两个只读输入中复现：`WIN_app.so.strings.txt` 内
  仅出现 1 条以 `flutter.` 开头的字符串，不存在 442 行的键表。
- 该 JSON 是 Flutter `shared_preferences` 的**落盘快照**，只包含「被显式写过或非默认」的键；
  未改动过的偏好项不会出现在文件里（**推断**）。因此 43 是本机运行时**已持久化**的键数，
  不等同于应用**声明过**的偏好键全集。第 8 节给出从二进制 strings 挖出的补充候选键。

### 1.2 各类别计数

| 类别 | 键数 |
|---|---|
| AI/模型 | 11 |
| 商业化（切除） | 9 |
| 界面面板 | 7 |
| 技能 | 3 |
| 同步 | 3 |
| 外观主题 | 2 |
| 路径 | 2 |
| 会话 | 2 |
| 字体 | 2 |
| 系统杂项 | 2 |
| **合计** | **43** |

未能归类的键数量：**0**。

---

## 2. 全键清单表（按类别分组）

观测值列：长值截断到 80 字符；字符串枚举值全列；敏感值写「存在（值已省略）」。

### 2.1 AI/模型（11 键）

| 键名 | JSON 类型 | 观测值 | 推断类别 | 备注 |
|---|---|---|---|---|
| `flutter.api_key` | str | 存在（值已省略） | AI/模型 | — |
| `flutter.auto_clear_context` | bool | `true` | AI/模型 | 按名推断为自动清理上下文 |
| `flutter.context_limit` | int | `1000000` | AI/模型 | 上下文上限（token 数） |
| `flutter.llm_base_url` | str | `https://newapi.openxz.cn` | AI/模型 | OpenAI 兼容端点根地址 |
| `flutter.model` | str | `deepseek-v4-pro` | AI/模型 | 当前生效模型 |
| `flutter.official_api_key` | str | 存在（值已省略） | AI/模型 | — |
| `flutter.reserved_output_tokens` | int | `16000` | AI/模型 | 为输出预留的 token 数 |
| `flutter.saved_providers` | str | 存在（值已省略；3 个供应商对象，见 §5） | AI/模型 | JSON 字符串，供应商数组，见 §5 |
| `flutter.system_prompt` | str | `你是一个创意小说写作助手。你可以读取和写入小说项目目录中的文件。当用户要求你写作、修改或审阅内容时，使用可用工具读取现有章节和资料，然后据此撰写或更新内容。始终…`（116 字符） | AI/模型 | 全局系统提示词（中文，116 字符） |
| `flutter.temperature` | float | `0.8` | AI/模型 | 采样温度 |
| `flutter.use_anthropic_format` | bool | `false` | AI/模型 | 协议开关：true=Anthropic Messages，false=OpenAI Chat |

### 2.2 商业化（切除）（9 键）

| 键名 | JSON 类型 | 观测值 | 推断类别 | 备注 |
|---|---|---|---|---|
| `flutter.device_id` | str | 存在（值已省略，UUIDv4 形态） | 商业化（切除） | — |
| `flutter.vip_days_left` | int | `0` | 商业化（切除） | — |
| `flutter.vip_device_count` | int | `0` | 商业化（切除） | — |
| `flutter.vip_device_limit` | bool | `false` | 商业化（切除） | — |
| `flutter.vip_expire_time` | str | `2026-06-10 21:34:17` | 商业化（切除） | — |
| `flutter.vip_is_lifetime` | bool | `false` | 商业化（切除） | — |
| `flutter.vip_last_check` | str | `2026-09-27T22:00:23.814662` | 商业化（切除） | — |
| `flutter.vip_phone` | str | 存在（值已省略） | 商业化（切除） | — |
| `flutter.vip_status` | bool | `false` | 商业化（切除） | — |

### 2.3 界面面板（7 键）

| 键名 | JSON 类型 | 观测值 | 推断类别 | 备注 |
|---|---|---|---|---|
| `flutter.panel_chat_width` | float | `523.0` | 界面面板 | — |
| `flutter.panel_directory_width` | float | `200.0` | 界面面板 | — |
| `flutter.panel_memo_width` | float | `320.0` | 界面面板 | — |
| `flutter.panel_session_width` | float | `220.0` | 界面面板 | — |
| `flutter.panel_show_directory` | bool | `true` | 界面面板 | — |
| `flutter.panel_show_memo` | bool | `false` | 界面面板 | — |
| `flutter.panel_show_session` | bool | `true` | 界面面板 | — |

### 2.4 技能（3 键）

| 键名 | JSON 类型 | 观测值 | 推断类别 | 备注 |
|---|---|---|---|---|
| `flutter.active_skill_ids` | str | JSON 数组，7 个 id：`builtin_novel-writer`、`builtin_skill-creator`、`写作禁忌_1779978824048`、`novel-deslop_1783155795388`、`novel-structure-quality-coordinator_1783155797085`、`narrative-deep-evolution_1783156262001`、`token-optimizer_1783200769193` | 技能 | — |
| `flutter.default_skills_initialized` | bool | `true` | 技能 | — |
| `flutter.skill_list` | str | JSON 数组，8 个技能对象（见 §6） | 技能 | — |

### 2.5 同步（3 键）

| 键名 | JSON 类型 | 观测值 | 推断类别 | 备注 |
|---|---|---|---|---|
| `flutter.is_connected` | bool | `true` | 同步 | 联网状态标记 |
| `flutter.webdav_config` | str | 存在（值已省略；含 url/username/password/remotePath/lastSyncTime） | 同步 | — |
| `flutter.webdav_sync_meta` | str | `{"version":3,"lastUploadTime":"2026-07-07T07:52:10.999415Z","scopeTimestamps":{"projects":"2026-07-07T07:52:10.999415Z","skills":"2026-07-07T07:52:10.999415Z","sessions":"2026-07-07T07:52:10.999415Z","memos":"2026-07-07T07:52:10.999415Z"}}` | 同步 | — |

### 2.6 外观主题（2 键）

| 键名 | JSON 类型 | 观测值 | 推断类别 | 备注 |
|---|---|---|---|---|
| `flutter.custom_accent_color` | int | `4286343935` | 外观主题 | — |
| `flutter.is_dark_mode` | bool | `true` | 外观主题 | — |

### 2.7 路径（2 键）

| 键名 | JSON 类型 | 观测值 | 推断类别 | 备注 |
|---|---|---|---|---|
| `flutter.current_novel_project` | str | `C:\Users\Administrator\AI写小说\测试书籍` | 路径 | — |
| `flutter.novel_projects` | str | `C:\Users\Administrator\AI写小说\变成狗也要喜欢直男！` … 共 4 行 | 路径 | — |

### 2.8 会话（2 键）

| 键名 | JSON 类型 | 观测值 | 推断类别 | 备注 |
|---|---|---|---|---|
| `flutter.last_seen_startup_announcement_id` | int | `17` | 会话 | 启动公告 / 通知已读游标 |
| `flutter.read_notification_ids` | list | `["19"]` | 会话 | 启动公告 / 通知已读游标 |

### 2.9 字体（2 键）

| 键名 | JSON 类型 | 观测值 | 推断类别 | 备注 |
|---|---|---|---|---|
| `flutter.chat_font_size` | float | `15.0` | 字体 | — |
| `flutter.editor_font_size` | float | `15.0` | 字体 | — |

### 2.10 系统杂项（2 键）

| 键名 | JSON 类型 | 观测值 | 推断类别 | 备注 |
|---|---|---|---|---|
| `flutter.migration_version` | int | `1` | 系统杂项 | 配置迁移版本号 |
| `flutter.web_search_enabled` | bool | `false` | 系统杂项 | 联网搜索开关 |

---

## 3. 商业化相关键（切除清单）

共 9 键。全部为 `vip_` 前缀 + 1 个 `device_` 前缀键。**实测**键名与类型，「推断」其用途。

| 键名 | JSON 类型 | 观测值 | 用途（推断） | 隐私 |
|---|---|---|---|---|
| `flutter.device_id` | str | 存在（值已省略，UUIDv4 形态） | 设备唯一标识（UUIDv4 形态），心跳/设备计数用 | **是（值已省略）** |
| `flutter.vip_days_left` | int | `0` | 会员剩余天数 | 否 |
| `flutter.vip_device_count` | int | `0` | 已绑定设备数 | 否 |
| `flutter.vip_device_limit` | bool | `false` | 是否触发设备数限制（bool 形态） | 否 |
| `flutter.vip_expire_time` | str | `2026-06-10 21:34:17` | 会员到期时间（`YYYY-MM-DD HH:MM:SS`） | 否 |
| `flutter.vip_is_lifetime` | bool | `false` | 是否永久会员 | 否 |
| `flutter.vip_last_check` | str | `2026-09-27T22:00:23.814662` | 会员状态最近校验时间（ISO8601，无时区） | 否 |
| `flutter.vip_phone` | str | 存在（值已省略） | 会员账号绑定手机号 | **是（值已省略）** |
| `flutter.vip_status` | bool | `false` | 会员有效状态 | 否 |

补充：`is_connected` 已按语义归入「同步」类（见 §2），但其同时是会员心跳的前置条件（**推断**）；
切除商业化层时需一并评估。

strings 文件中另见 **未持久化** 的商业化候选键（**实测**存在于二进制，JSON 中无值）：

| 候选键名 | 来源 | 说明 |
|---|---|---|
| `vip_type` | `WIN_app.so.strings.txt` @`00468260` | 会员类型枚举（推断） |
| `marketplace_download_quota` | strings 文件 | 市场下载额度（推断） |
| `daily_free_quota_exhausted` | strings 文件 | 每日免费额度耗尽提示（推断） |
| `insufficient_user_quota` | strings 文件 | 用户额度不足提示（推断） |
| `rate_limit_exceeded` / `rate_limit_exceeded_user` | strings 文件 | 限流提示（推断） |
| `model_price_error` | strings 文件 | 模型计价错误（推断） |
| `purchase_setup_hint` | strings 文件 | 购买配置提示（推断） |
| `device_usage_count` / `device_usage_tokens` | strings 文件 | 设备用量统计（推断） |
| `force_update_required` / `force_update_version` / `is_force_update` | strings 文件 | 强制更新闸门（推断） |
| `usage_check_completed` / `usage_check_started` | strings 文件 | 额度校验事件（推断） |

---

## 4. AI 接入相关键

| 键名 | JSON 类型 | 观测值 | 说明 |
|---|---|---|---|
| `flutter.llm_base_url` | str | `https://newapi.openxz.cn` | OpenAI 兼容端点根地址。实测值 `https://newapi.openxz.cn`（不含 `/v1`） |
| `flutter.api_key` | str | 存在（值已省略） | 当前生效密钥。**存在（值已省略）**，长度 48 |
| `flutter.official_api_key` | str | 存在（值已省略） | 官方通道密钥。**存在（值已省略）**，长度 48 |
| `flutter.model` | str | `deepseek-v4-pro` | 当前模型名。实测 `deepseek-v4-pro` |
| `flutter.temperature` | float | `0.8` | 采样温度。实测 `0.8`（float） |
| `flutter.context_limit` | int | `1000000` | 上下文长度上限。实测 `1000000`（int，即 1e6 token） |
| `flutter.use_anthropic_format` | bool | `false` | 报文协议开关。实测 `false` → 走 OpenAI Chat Completions 形态 |
| `flutter.saved_providers` | str | 存在（值已省略；3 个供应商对象，见 §5） | JSON 字符串：供应商数组，完整结构见 §5 |
| `flutter.system_prompt` | str | `你是一个创意小说写作助手。你可以读取和写入小说项目目录中的文件。当用户要求你写作、修改或审阅内容时，使用可用工具读取现有章节和资料，然后据此撰写或更新内容。始终…`（116 字符） | 全局系统提示词。实测为中文 116 字符 |
| `flutter.reserved_output_tokens` | int | `16000` | 输出预留 token。实测 `16000`（int） |
| `flutter.auto_clear_context` | bool | `true` | 自动清理上下文开关。实测 `true`（bool） |
| `flutter.web_search_enabled` | bool | `false` | 联网搜索开关。实测 `false`（bool） |

### 4.1 `api_key` 与 `official_api_key` 的关系（实测）

- 两者长度均为 48，且**逐字节相同**（`api_key == official_api_key` 为 `True`）。
- 与 `saved_providers[0].apiKey`（`sk-` 前缀，长度 35）**不相等**。
- 两者内容一律不抄录。

### 4.2 `system_prompt` 全文（实测，无隐私内容）

```text
你是一个创意小说写作助手。你可以读取和写入小说项目目录中的文件。当用户要求你写作、修改或审阅内容时，使用可用工具读取现有章节和资料，然后据此撰写或更新内容。始终保持与现有故事、角色和世界设定的一致性。请使用与用户相同的语言进行回复。
```

### 4.3 strings 文件中的 AI 相关补充键（未持久化）

| 候选键名 | 来源 | 说明 |
|---|---|---|
| `anysearch_api_key` | `WIN_app.so.strings.txt` @`0031b6d0` | 搜索服务密钥键名（推断） |
| `active_provider_name` | strings 文件 | 当前选中的供应商名（推断） |
| `official_connect_mode` | strings 文件 | 官方通道连接模式（推断） |
| `chat_stream_auto_retry` | strings 文件 | 流式自动重试（推断） |
| `llm_retry_attempt` | strings 文件 | 重试计数（推断） |
| `no_available_key` | strings 文件 | 无可用密钥错误（推断） |
| `model_not_found` | strings 文件 | 模型不存在错误（推断） |
| `context_summary` | strings 文件 | 上下文摘要（推断） |

---

## 5. `saved_providers` 完整结构（实测展开）

`flutter.saved_providers` 是 **JSON 字符串**（不是 JSON 数组），需二次 `json.loads` 才能得到数组。
实测：顶层数组长度 **3**，每个元素为同构对象，字段名固定 5 个。

### 5.1 字段表

| 字段名 | JSON 类型 | 示例值 | 必填 | 说明（推断） |
|---|---|---|---|---|
| `name` | string | `api.deepseek.com` | 是 | 供应商标识/显示名，实测取值为域名形态 |
| `baseUrl` | string | `https://api.deepseek.com` | 是 | 该供应商的 API 根地址，**驼峰命名** |
| `apiKey` | string | 存在（值已省略） | 是 | 该供应商的密钥，实测长度 35/51/51 |
| `model` | string | `deepseek-v4-pro` | 是 | 该供应商下选用的模型名 |
| `useAnthropicFormat` | bool | `false` | 是 | 单供应商级协议开关，与全局 `use_anthropic_format` 同名不同层 |

### 5.2 实测样本（密钥字段已省略）

```json
[
  {
    "name": "api.deepseek.com",
    "baseUrl": "https://api.deepseek.com",
    "apiKey": "存在（值已省略）",
    "model": "deepseek-v4-pro",
    "useAnthropicFormat": false
  },
  {
    "name": "api.xiaomimimo.com",
    "baseUrl": "https://api.xiaomimimo.com",
    "apiKey": "存在（值已省略）",
    "model": "mimo-v2.5-pro",
    "useAnthropicFormat": false
  },
  {
    "name": "wang.aihaochi.com",
    "baseUrl": "http://wang.aihaochi.com",
    "apiKey": "存在（值已省略）",
    "model": "[糖果]claude-opus-4.8-3",
    "useAnthropicFormat": false
  }
]
```

### 5.3 实测要点

- `useAnthropicFormat` 三个样本全为 `false`，与全局 `flutter.use_anthropic_format=false` 一致。
- `model` 中存在**服务端自定义前缀名**（第 3 个样本形如 `[某前缀]claude-opus-4.8-3`，
  中括号内容为服务商自定义命名，**推断**为渠道/分组前缀），说明该字段是自由字符串而非枚举。
- `baseUrl` 第 3 个样本为 `http://`（非 https），说明不强制 TLS。
- 数组顺序即 UI 列表顺序（**推断**）；未见 `id`、`isActive`、`enabled` 之类字段，
  故「当前选中项」不在本结构内，可能由 `flutter.model` + `flutter.llm_base_url` 表达（**推断**）。

---

## 6. 其它结构化键的完整字段结构（实测）

### 6.1 `skill_list`（JSON 字符串 → 数组，8 个元素）

实测字段名共 **7 个**，与任务描述给出的 7 个**完全一致**，无缺无增：
`id` / `name` / `description` / `directoryPath` / `isBuiltIn` / `marketplaceSkillId` / `marketplaceVersion`。

| 字段名 | JSON 类型 | 示例值 | 说明 |
|---|---|---|---|
| `id` | string | `builtin_novel-writer` | 内置项为 `builtin_` + name；用户/市场项为 `name_毫秒时间戳` |
| `name` | string | `novel-writer` | 技能名，同时是磁盘目录名 |
| `description` | string | `写小说时使用的技能…` | 中文长描述，触发语义说明 |
| `directoryPath` | string | `C:\\Users\\Administrator\\Documents\\skills\\novel-writer` | 绝对路径，Windows 反斜杠转义 |
| `isBuiltIn` | bool | `true` | 是否内置技能 |
| `marketplaceSkillId` | int \| null | `85` | 市场技能 ID；**内置项为 `null`** |
| `marketplaceVersion` | int \| null | `1` | 市场版本号；**内置项为 `null`** |

实测 8 个元素的字段取值：

| # | `id` | `name` | `isBuiltIn` | `marketplaceSkillId` | `marketplaceVersion` |
|---|---|---|---|---|---|
| 0 | `builtin_novel-writer` | `novel-writer` | `true` | `None` | `None` |
| 1 | `builtin_skill-creator` | `skill-creator` | `true` | `None` | `None` |
| 2 | `写作禁忌_1779978824048` | `写作禁忌` | `false` | `None` | `None` |
| 3 | `烂人风格_1779979063740` | `烂人风格` | `false` | `None` | `None` |
| 4 | `novel-deslop_1783155795388` | `novel-deslop` | `false` | `85` | `1` |
| 5 | `novel-structure-quality-coordinator_1783155797085` | `novel-structure-quality-coordinator` | `false` | `46` | `1` |
| 6 | `narrative-deep-evolution_1783156262001` | `narrative-deep-evolution` | `false` | `40` | `2` |
| 7 | `token-optimizer_1783200769193` | `token-optimizer` | `false` | `524` | `9` |

- `directoryPath` 的父目录固定为 `C:\Users\Administrator\Documents\skills`（实测 8/8）。
- 注意：`id` 的时间戳后缀与其目录名后缀**可能不一致**（实测第 3 项 `id` 后缀 `...824048`，
  目录名后缀 `...824045`）。

### 6.2 `active_skill_ids`（JSON 字符串 → 字符串数组）

实测长度 **7**，元素为 `skill_list[].id` 的子集（实测少 1 个：未包含 `烂人风格`）。

```json
[
  "builtin_novel-writer",
  "builtin_skill-creator",
  "写作禁忌_1779978824048",
  "novel-deslop_1783155795388",
  "novel-structure-quality-coordinator_1783155797085",
  "narrative-deep-evolution_1783156262001",
  "token-optimizer_1783200769193"
]
```

### 6.3 `novel_projects`（字符串，非 JSON）

- 形式：**换行符 `\n` 分隔的绝对路径列表**（不是 JSON 数组）。实测 4 行。
- 无引号、无逗号、无转义；空行需忽略（**推断**）。

```text
C:\Users\Administrator\AI写小说\变成狗也要喜欢直男！
C:\Users\Administrator\AI写小说\和小熊同居后的日子
C:\Users\Administrator\AI写小说\烂，也要烂在你怀里
C:\Users\Administrator\AI写小说\测试书籍
```

### 6.4 `current_novel_project`（字符串）

- 形式：单个绝对路径。实测值 `C:\Users\Administrator\AI写小说\测试书籍`。
- 该值是 `novel_projects` 列表中的一项（实测命中第 4 行）。

### 6.5 `webdav_config`（JSON 字符串 → 对象）

实测字段 5 个（凭据值已省略）：

| 字段名 | JSON 类型 | 观测值 | 说明 |
|---|---|---|---|
| `url` | str | `https://dav.jianguoyun.com/dav/` | WebDAV 服务地址 |
| `username` | str | 存在（值已省略） | 账号（**存在（值已省略）**，邮箱形态） |
| `password` | str | 存在（值已省略） | 应用授权码（**存在（值已省略）**） |
| `remotePath` | str | `/OpenWrite/` | 远端根目录 |
| `lastSyncTime` | str | `2026-07-07T07:52:40.981376Z` | 最近同步时间（ISO8601，Z 结尾） |

### 6.6 `webdav_sync_meta`（JSON 字符串 → 对象）

实测结构：顶层 3 字段，其中 `scopeTimestamps` 为 4 键映射。

```json
{
  "version": 3,
  "lastUploadTime": "2026-07-07T07:52:10.999415Z",
  "scopeTimestamps": {
    "projects": "2026-07-07T07:52:10.999415Z",
    "skills": "2026-07-07T07:52:10.999415Z",
    "sessions": "2026-07-07T07:52:10.999415Z",
    "memos": "2026-07-07T07:52:10.999415Z"
  }
}
```

| 字段名 | JSON 类型 | 说明 |
|---|---|---|
| `version` | int | 同步元数据 schema 版本，实测 `3` |
| `lastUploadTime` | string | 最近上传时间（ISO8601，Z 结尾） |
| `scopeTimestamps` | object | 分区时间戳映射 |
| `scopeTimestamps.projects` | string | 小说项目分区 |
| `scopeTimestamps.skills` | string | 技能分区 |
| `scopeTimestamps.sessions` | string | 会话分区 |
| `scopeTimestamps.memos` | string | 备忘录分区 |

---

## 7. 面板与尺寸键（实测数值）

### 7.1 已持久化的面板 / 字体键

| 键名 | JSON 类型 | **实测值** | 语义（推断） |
|---|---|---|---|
| `flutter.panel_session_width` | float | `220.0` | 左侧会话列表面板宽度（逻辑像素） |
| `flutter.panel_chat_width` | float | `523.0` | 中部聊天区宽度（逻辑像素） |
| `flutter.panel_directory_width` | float | `200.0` | 文件/目录面板宽度（逻辑像素） |
| `flutter.panel_memo_width` | float | `320.0` | 备忘录面板宽度（逻辑像素） |
| `flutter.panel_show_session` | bool | `true` | 会话面板可见性 |
| `flutter.panel_show_directory` | bool | `true` | 目录面板可见性 |
| `flutter.panel_show_memo` | bool | `false` | 备忘录面板可见性 |
| `flutter.chat_font_size` | float | `15.0` | 聊天区字号（逻辑像素） |
| `flutter.editor_font_size` | float | `15.0` | 编辑器字号（逻辑像素） |

### 7.2 数值汇总（实测）

| 键 | 值 | 类型 |
|---|---|---|
| `panel_session_width` | `220.0` | float |
| `panel_chat_width` | `523.0` | float |
| `panel_directory_width` | `200.0` | float |
| `panel_memo_width` | `320.0` | float |
| `chat_font_size` | `15.0` | float |
| `editor_font_size` | `15.0` | float |

实测观察：4 个面板宽度与 2 个字号**全部为 float**（Flutter `double`），非 int。

### 7.3 外观 / 主题数值（实测）

| 键名 | 类型 | 实测值 | 说明 |
|---|---|---|---|
| `flutter.is_dark_mode` | bool | `true` | 深色模式开关 |
| `flutter.custom_accent_color` | int | `4286343935` | ARGB 打包整数 |

- `4286343935` 十六进制 = `0xFF7C6AFF`；拆解 A=`0xFF`（255）、R=`0x7C`（124）、G=`0x6A`（106）、B=`0xFF`（255）→ `#7C6AFF`（**推断**为 Flutter `Color.value` 的 0xAARRGGBB 打包）。

---

## 8. strings 文件中的额外偏好键候选（未持久化）

来源：`S:\writerD\reference\WIN_app.so.strings.txt`（`偏移<TAB>字符串` 格式，共 96176 行）。
方法：先剔除 AOT 粘连噪声（尾随 `r` 且去 `r` 后命中已知键名，如 `official_api_keyr`），
再保留「下划线分段 ≥ 2 且命中偏好语义前缀」的标识符，并排除 Dart/Flutter 内部标识、
Material 3 颜色 token、AI 流式事件名与字体名。
**这些键名实测存在于二进制，但在本机 JSON 中无值**，故不计入第 1 节的键总数。

共 **62** 个候选。

| 候选键名 | 主题（推断） |
|---|---|
| `active_provider_name` | AI / 用量 |
| `anysearch_api_key` | AI / 用量 |
| `app_state_file_changed` | — |
| `background_image_blur` | 外观 / 背景 / 字体 |
| `background_image_glass` | 外观 / 背景 / 字体 |
| `background_image_overlay` | 外观 / 背景 / 字体 |
| `chat_stream_auto_retry` | AI / 用量 |
| `context_summary_r` | — |
| `custom_background_color` | 外观 / 背景 / 字体 |
| `custom_background_color_dark` | 外观 / 背景 / 字体 |
| `custom_background_color_light` | 外观 / 背景 / 字体 |
| `custom_background_image` | 外观 / 背景 / 字体 |
| `custom_novels_dir` | 路径配置 |
| `custom_skills_dir` | 路径配置 |
| `daily_free_quota_exhausted` | 商业化 |
| `device_usage_count` | 商业化 |
| `device_usage_tokens` | 商业化 |
| `file_read_allowed_dirs` | 路径配置 |
| `font_installed_manifest` | 外观 / 背景 / 字体 |
| `force_update_required` | 商业化 |
| `force_update_version` | 商业化 |
| `insufficient_user_quota` | 商业化 |
| `is_force_update` | 商业化 |
| `lan_sync_enabledr` | — |
| `lan_sync_token` | 同步（LAN / WebDAV） |
| `last_seen_announcement_id` | 通知 / 公告 |
| `last_seen_notification_announcement_id` | 通知 / 公告 |
| `llm_retry_attempt` | — |
| `marketplace_delete_review` | — |
| `marketplace_delete_review_comment` | — |
| `marketplace_delete_skill` | — |
| `marketplace_download_quota` | 商业化 |
| `marketplace_find_by_content` | — |
| `marketplace_get_nickname` | — |
| `marketplace_my_skills` | — |
| `marketplace_set_nickname` | — |
| `marketplace_skill_detail` | — |
| `marketplace_skill_reviews` | — |
| `marketplace_submit_review` | — |
| `marketplace_update_skill` | — |
| `max_announcement_id` | 通知 / 公告 |
| `model_not_found` | — |
| `model_price_error` | 商业化 |
| `no_available_keyr` | — |
| `official_connect_mode` | AI / 用量 |
| `original_order_index` | 编辑 / 排版 |
| `original_parent_rel_path` | 编辑 / 排版 |
| `punct_replace_rules` | 编辑 / 排版 |
| `purchase_setup_hint` | 商业化 |
| `rank_data_enabled` | 编辑 / 排版 |
| `rank_data_query` | — |
| `rate_limit_exceeded` | 商业化 |
| `rate_limit_exceeded_user` | 商业化 |
| `search_time_ms` | — |
| `sensitive_words_detected` | — |
| `show_on_startup` | 通知 / 公告 |
| `tool_call_resultr` | — |
| `tool_call_start` | — |
| `unread_announcement_count` | 通知 / 公告 |
| `webdav_lan_config` | 同步（LAN / WebDAV） |
| `webdav_sync_metacloud` | — |
| `webdav_sync_metalan` | — |

### 8.1 AOT 粘连后缀噪声（**不是真实键名**，实测归类）

strings 文件中以下形态是字符串与相邻字面量 `r` 粘连所致；去掉尾随 `r` 后即为第 2 节真实键名。
切勿当作独立偏好键：

| 粘连形态 | 归一到 |
|---|---|
| `active_skill_idsr` | `active_skill_ids` |
| `editor_font_sizer` | `editor_font_size` |
| `official_api_keyr` | `official_api_key` |
| `panel_chat_widthr` | `panel_chat_width` |
| `panel_memo_widthr` | `panel_memo_width` |
| `vip_device_countr` | `vip_device_count` |
| `vip_device_limitr` | `vip_device_limit` |
| `webdav_sync_metar` | `webdav_sync_meta` |

另有同一模式的非键名粘连：`active_skill_idsr`、`ai_run_completedr`、`panel_chat_widthr`、
`panel_memo_widthr`、`editor_font_sizer`、`vip_device_countr`、`vip_device_limitr`、
`tool_call_resultr`、`webdav_sync_metar`（**实测**存在于 strings 文件，`r` 为粘连噪声）。
`webdav_sync_metacloud` / `webdav_sync_metalan` 同理为 `webdav_sync_meta` + `cloud`/`lan` 粘连。

---

## 9. 未能归类的键

未能归类的键数量（第 2 节口径）：**0**。

无：本文档第 2 节的 43 个键全部落入 §1.2 的 10 个类别之一。

---

## 10. 统计复核

| 项 | 数量 |
|---|---|
| JSON 实际键总数 | 43 |
| 第 2 节表格行数（应等于键总数） | 43 |
| 类别数 | 10 |
| 未能归类 | 0 |
| 商业化（切除） | 9 |
| AI/模型 | 11 |
| 界面面板 | 7 |
| strings 额外候选键（未持久化） | 62 |

> 生成方式：`python S:\writerD\docs\spec\_extract\gen_prefs.py`，
> 以 Python `io.open(..., encoding='utf-8')` 写出（未使用 PowerShell 写文件）。
