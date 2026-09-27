# -*- coding: utf-8 -*-
"""Generate S:\\writerD\\docs\\spec\\PREFS.md from the observed shared_preferences.json.

Discipline:
  * 实测  = value literally read from shared_preferences.json / strings file
  * 推断  = inferred by key-name semantics, NOT proven by a value
  * secrets (api_key / password / phone / device_id / webdav credentials) are NEVER written
"""
import io
import json
import os
import re

SRC = r'C:\Users\Administrator\AppData\Roaming\com.openwrite\OpenWrite\shared_preferences.json'
STRINGS = r'S:\writerD\reference\WIN_app.so.strings.txt'
OUT = r'S:\writerD\docs\spec\PREFS.md'

SECRET_KEYS = {
    'flutter.api_key', 'flutter.official_api_key', 'flutter.vip_phone',
    'flutter.device_id', 'flutter.webdav_config', 'flutter.saved_providers',
}
# 必须两侧都不是数字，否则会误报技能 id 里的 13 位毫秒时间戳（如 _1779978824048）
PHONE_RE = re.compile(r'(?<!\d)1[3-9]\d{9}(?!\d)')
SK_RE = re.compile(r'sk-[A-Za-z0-9_\-]{6,}')

# 类别 -> 展示顺序（按实测计数降序在 main 里决定）
CAT_HINT = {
    'flutter.panel_chat_width': '界面面板',
    'flutter.panel_session_width': '界面面板',
    'flutter.panel_directory_width': '界面面板',
    'flutter.panel_show_session': '界面面板',
    'flutter.panel_show_directory': '界面面板',
    'flutter.panel_show_memo': '界面面板',
    'flutter.panel_memo_width': '界面面板',
}


def load():
    with io.open(SRC, encoding='utf-8') as f:
        return json.load(f)


def classify(k, v):
    """Return (category, note, evidence) for a key. evidence is '实测' or '推断'."""
    s = k[len('flutter.'):]
    if s.startswith('vip_') or s.startswith('device_'):
        return '商业化（切除）', '', '推断'
    if k == 'flutter.llm_base_url':
        return 'AI/模型', 'OpenAI 兼容端点根地址', '推断'
    if k in ('flutter.api_key', 'flutter.official_api_key'):
        return 'AI/模型', '', '推断'
    if k == 'flutter.model':
        return 'AI/模型', '当前生效模型', '推断'
    if k == 'flutter.temperature':
        return 'AI/模型', '采样温度', '实测'
    if k == 'flutter.context_limit':
        return 'AI/模型', '上下文上限（token 数）', '推断'
    if k == 'flutter.reserved_output_tokens':
        return 'AI/模型', '为输出预留的 token 数', '推断'
    if k == 'flutter.use_anthropic_format':
        return 'AI/模型', '协议开关：true=Anthropic Messages，false=OpenAI Chat', '推断'
    if k == 'flutter.saved_providers':
        return 'AI/模型', 'JSON 字符串，供应商数组，见 §5', '推断'
    if k == 'flutter.system_prompt':
        return 'AI/模型', '全局系统提示词（中文，116 字符）', '实测'
    if k == 'flutter.auto_clear_context':
        return 'AI/模型', '按名推断为自动清理上下文', '推断'
    if s in ('panel_session_width', 'panel_chat_width', 'panel_directory_width',
             'panel_memo_width', 'panel_show_session', 'panel_show_directory',
             'panel_show_memo'):
        return '界面面板', '', '推断'
    if s in ('is_dark_mode', 'custom_accent_color'):
        return '外观主题', '', '推断'
    if s in ('skill_list', 'active_skill_ids', 'default_skills_initialized'):
        return '技能', '', '推断'
    if s in ('webdav_config', 'webdav_sync_meta'):
        return '同步', '', '推断'
    if s == 'is_connected':
        return '同步', '联网状态标记', '推断'
    if s in ('novel_projects', 'current_novel_project'):
        return '路径', '', '推断'
    if s.startswith('read_notification') or s.startswith('last_seen_'):
        return '会话', '启动公告 / 通知已读游标', '推断'
    if s in ('chat_font_size', 'editor_font_size'):
        return '字体', '', '推断'
    if s == 'migration_version':
        return '系统杂项', '配置迁移版本号', '推断'
    if s == 'web_search_enabled':
        return '系统杂项', '联网搜索开关', '推断'
    return '未能归类', '', '推断'


def render_value(k, v):
    """Observed-value cell. Never leaks secrets."""
    if k == 'flutter.vip_phone':
        return '存在（值已省略）'
    if k in ('flutter.api_key', 'flutter.official_api_key'):
        return '存在（值已省略）'
    if k == 'flutter.device_id':
        return '存在（值已省略，UUIDv4 形态）'
    if k == 'flutter.webdav_config':
        return '存在（值已省略；含 url/username/password/remotePath/lastSyncTime）'
    if k == 'flutter.saved_providers':
        return '存在（值已省略；3 个供应商对象，见 §5）'
    if isinstance(v, bool):
        return '`true`' if v else '`false`'
    if isinstance(v, float):
        return '`%s`' % v
    if isinstance(v, int):
        return '`%d`' % v
    if isinstance(v, list):
        return '`%s`' % json.dumps(v, ensure_ascii=False)
    s = v
    if k == 'flutter.system_prompt':
        return '`%s…`（116 字符）' % s[:80]
    if k == 'flutter.active_skill_ids':
        ids = json.loads(s)
        return 'JSON 数组，%d 个 id：%s' % (len(ids), '、'.join('`%s`' % i for i in ids))
    if k == 'flutter.skill_list':
        return 'JSON 数组，%d 个技能对象（见 §6）' % len(json.loads(s))
    if k == 'flutter.novel_projects':
        n = len([x for x in s.split('\n') if x.strip()])
        first = s.split('\n')[0]
        return '`%s` … 共 %d 行' % (first[:56], n)
    if k == 'flutter.webdav_sync_meta':
        return '`%s`' % s
    if k == 'flutter.current_novel_project':
        return '`%s`' % s
    s = s.replace('\n', '\\n')
    if len(s) > 80:
        s = s[:80] + '…'
    return '`%s`' % s


def md_escape(s):
    return s.replace('|', '\\|')


def build():
    d = load()
    # 分类
    items = []
    for k in sorted(d):
        v = d[k]
        cat, note, ev = classify(k, v)
        items.append({'key': k, 'val': v, 'type': type(v).__name__, 'cat': cat,
                      'note': note, 'ev': ev})

    cat_counts = {}
    for it in items:
        cat_counts[it['cat']] = cat_counts.get(it['cat'], 0) + 1
    order_pref = ['AI/模型', '界面面板', '外观主题', '技能', '同步', '路径', '会话',
                  '编辑器', '字体', '商业化（切除）', '系统杂项', '未能归类']
    cats = sorted(cat_counts, key=lambda c: (-cat_counts[c],
                                             order_pref.index(c) if c in order_pref else 99))
    type_counts = {}
    for it in items:
        type_counts[it['type']] = type_counts.get(it['type'], 0) + 1

    # ---- strings 文件交叉验证 ----
    declared = set()
    with io.open(STRINGS, encoding='utf-8', errors='replace') as f:
        for ln in f:
            parts = ln.rstrip('\n').split('\t', 1)
            if len(parts) != 2:
                continue
            declared.add(parts[1])
    observed_names = {it['key'][len('flutter.'):] for it in items}

    # AOT 快照里字符串会与相邻字面量粘连，出现尾随 'r' 的形态（如 official_api_keyr）。
    # 用「去尾 r 后命中已知键名」判定并归一化，单列到后缀噪声清单。
    def strip_r(n):
        return n[:-1] if (n.endswith('r') and n[:-1] in (declared | observed_names)) else n

    noise_suffix = []
    for n in sorted(declared):
        if n.endswith('r') and n[:-1] in (declared | observed_names):
            # 只保留真正的偏好键名形态，排除二进制随机字节/本地化词条（Copia/Eliminar 等）
            if re.fullmatch(r'[a-z][a-z0-9]*(_[a-z0-9]+)+r', n):
                noise_suffix.append(n)

    # 偏好键白名单：下划线分段 >= 2 且命中任一语义前缀。
    PREFIXES = (
        'vip_', 'panel_', 'custom_', 'background_image_', 'use_', 'is_', 'auto_',
        'webdav_', 'lan_', 'llm_', 'chat_', 'editor_', 'context_', 'system_',
        'reserved_', 'novel_', 'skill', 'active_', 'default_', 'read_',
        'last_seen_', 'max_', 'unread_', 'notification_', 'marketplace_',
        'device_', 'daily_', 'insufficient_', 'rate_limit_', 'model_', 'purchase_',
        'no_available_', 'search_', 'usage_', 'file_read_', 'punctuation_',
        'punct_', 'app_', 'show_', 'font_', 'force_', 'is_force_', 'rank_',
        'original_', 'file_', 'official_', 'anysearch_', 'ai_', 'content_',
        'tool_', 'session_', 'snapshot_', 'sensitive_', 'migration_',
        'temperature', 'base_url',
    )
    # 明确排除：Dart/Flutter 内部标识、Material 3 颜色 token、AI 流式事件、字体名。
    INTERNAL_RE = re.compile(
        r'^(on_|surface_|primary_|secondary_|tertiary_|inverse_|iso|end_drawer_|'
        r'tool_use_id$|tool_call_id$)')
    EVENT_RE = re.compile(
        r'^(ai_(cleanup|run|text|thinking|tool)|tool_round|tool_call_start|'
        r'content_block|session_(save|list)|snapshot_save|notification_sound|'
        r'usage_check)_')
    EXTRA_BLOCK = {'app_font_id'}

    decl_extra = []
    for n in sorted(declared):
        if not re.fullmatch(r'[a-z][a-z0-9]*(_[a-z0-9]+){1,5}r?', n) or len(n) >= 40:
            continue
        base = strip_r(n)
        if base != n:
            continue  # 后缀噪声，另列
        if base in observed_names:
            continue  # 第 2 节已有
        if n.count('_') < 2:
            continue  # 偏好键至少两个下划线分段
        if n in EXTRA_BLOCK or INTERNAL_RE.match(n) or EVENT_RE.match(n):
            continue
        if not n.startswith(PREFIXES):
            continue
        decl_extra.append(n)

    L = []
    A = L.append

    A('# OpenWrite v2.0.1 完整配置模型规格（PREFS）')
    A('')
    A('> 本文件是**提取与归类**结果，不含产品设计与改进建议。')
    A('> 标注约定：**实测** = 直接从 `shared_preferences.json` / strings 文件读到的字面值；')
    A('> **推断** = 由键名语义或结构推断，未被值本身证明。')
    A('> 任何密钥、密码、手机号、设备标识一律写「存在（值已省略）」。')
    A('')
    A('## 1. 来源与键总数统计')
    A('')
    A('| 项 | 值 | 证据 |')
    A('|---|---|---|')
    A('| 权威来源 | `%s` | 实测 |' % SRC)
    A('| 文件字节数 | %d（单行 JSON，无 BOM，UTF-8） | 实测 |' % os.path.getsize(SRC))
    A('| **实际键总数** | **%d** | 实测 |' % len(d))
    A('| 键名前缀 | 全部为 `flutter.`（%d/%d） | 实测 |' % (
        sum(1 for k in d if k.startswith('flutter.')), len(d)))
    A('| 值类型分布 | %s | 实测 |' % '、'.join(
        '%s=%d' % (t, c) for t, c in sorted(type_counts.items(), key=lambda x: -x[1])))
    A('')
    A('### 1.1 与输入描述的差异（必读）')
    A('')
    A('- 任务描述与 `S:\\writerD\\docs\\CONTRACT.md` 第 107 行均称「实测 442 键」。')
    A('  **实测该 JSON 只有 %d 个键**，占 8293 字节；全部键名逐个枚举见第 2 节。' % len(d))
    A('- 任务描述同时称本文件「约 442 个键」，与文件实际内容不符。')
    A('  **本文档一律以 JSON 内的 %d 个键为权威口径**，不把「442」当作本文件的键数。' % len(d))
    A('- 「442」这一数字无法从提供的两个只读输入中复现：`WIN_app.so.strings.txt` 内')
    A('  仅出现 1 条以 `flutter.` 开头的字符串，不存在 442 行的键表。')
    A('- 该 JSON 是 Flutter `shared_preferences` 的**落盘快照**，只包含「被显式写过或非默认」的键；')
    A('  未改动过的偏好项不会出现在文件里（**推断**）。因此 %d 是本机运行时**已持久化**的键数，' % len(d))
    A('  不等同于应用**声明过**的偏好键全集。第 8 节给出从二进制 strings 挖出的补充候选键。')
    A('')
    A('### 1.2 各类别计数')
    A('')
    A('| 类别 | 键数 |')
    A('|---|---|')
    for c in cats:
        A('| %s | %d |' % (c, cat_counts[c]))
    A('| **合计** | **%d** |' % len(d))
    A('')
    A('未能归类的键数量：**%d**。' % cat_counts.get('未能归类', 0))
    A('')
    A('---')
    A('')
    A('## 2. 全键清单表（按类别分组）')
    A('')
    A('观测值列：长值截断到 80 字符；字符串枚举值全列；敏感值写「存在（值已省略）」。')
    A('')
    for c in cats:
        A('### 2.%d %s（%d 键）' % (cats.index(c) + 1, c, cat_counts[c]))
        A('')
        A('| 键名 | JSON 类型 | 观测值 | 推断类别 | 备注 |')
        A('|---|---|---|---|---|')
        for it in items:
            if it['cat'] != c:
                continue
            A('| `%s` | %s | %s | %s | %s |' % (
                it['key'], it['type'], render_value(it['key'], it['val']),
                md_escape(it['cat']), md_escape(it['note']) if it['note'] else '—'))
        A('')

    A('---')
    A('')
    A('## 3. 商业化相关键（切除清单）')
    A('')
    A('共 %d 键。全部为 `vip_` 前缀 + 1 个 `device_` 前缀键。**实测**键名与类型，「推断」其用途。' % cat_counts.get('商业化（切除）', 0))
    A('')
    A('| 键名 | JSON 类型 | 观测值 | 用途（推断） | 隐私 |')
    A('|---|---|---|---|---|')
    vip_note = {
        'flutter.vip_phone': ('会员账号绑定手机号', '**是（值已省略）**'),
        'flutter.vip_status': ('会员有效状态', '否'),
        'flutter.vip_days_left': ('会员剩余天数', '否'),
        'flutter.vip_expire_time': ('会员到期时间（`YYYY-MM-DD HH:MM:SS`）', '否'),
        'flutter.vip_is_lifetime': ('是否永久会员', '否'),
        'flutter.vip_device_limit': ('是否触发设备数限制（bool 形态）', '否'),
        'flutter.vip_device_count': ('已绑定设备数', '否'),
        'flutter.vip_last_check': ('会员状态最近校验时间（ISO8601，无时区）', '否'),
        'flutter.device_id': ('设备唯一标识（UUIDv4 形态），心跳/设备计数用', '**是（值已省略）**'),
        'flutter.is_connected': ('联网状态标记，会员校验与同步共用', '否'),
    }
    for it in items:
        if it['cat'] != '商业化（切除）':
            continue
        use, priv = vip_note.get(it['key'], ('—', '否'))
        A('| `%s` | %s | %s | %s | %s |' % (
            it['key'], it['type'], render_value(it['key'], it['val']), use, priv))
    A('')
    A('补充：`is_connected` 已按语义归入「同步」类（见 §2），但其同时是会员心跳的前置条件（**推断**）；')
    A('切除商业化层时需一并评估。')
    A('')
    A('strings 文件中另见 **未持久化** 的商业化候选键（**实测**存在于二进制，JSON 中无值）：')
    A('')
    A('| 候选键名 | 来源 | 说明 |')
    A('|---|---|---|')
    A('| `vip_type` | `WIN_app.so.strings.txt` @`00468260` | 会员类型枚举（推断） |')
    A('| `marketplace_download_quota` | strings 文件 | 市场下载额度（推断） |')
    A('| `daily_free_quota_exhausted` | strings 文件 | 每日免费额度耗尽提示（推断） |')
    A('| `insufficient_user_quota` | strings 文件 | 用户额度不足提示（推断） |')
    A('| `rate_limit_exceeded` / `rate_limit_exceeded_user` | strings 文件 | 限流提示（推断） |')
    A('| `model_price_error` | strings 文件 | 模型计价错误（推断） |')
    A('| `purchase_setup_hint` | strings 文件 | 购买配置提示（推断） |')
    A('| `device_usage_count` / `device_usage_tokens` | strings 文件 | 设备用量统计（推断） |')
    A('| `force_update_required` / `force_update_version` / `is_force_update` | strings 文件 | 强制更新闸门（推断） |')
    A('| `usage_check_completed` / `usage_check_started` | strings 文件 | 额度校验事件（推断） |')
    A('')

    A('---')
    A('')
    A('## 4. AI 接入相关键')
    A('')
    A('| 键名 | JSON 类型 | 观测值 | 说明 |')
    A('|---|---|---|---|')
    ai_keys = [
        ('flutter.llm_base_url', 'OpenAI 兼容端点根地址。实测值 `https://newapi.openxz.cn`（不含 `/v1`）'),
        ('flutter.api_key', '当前生效密钥。**存在（值已省略）**，长度 48'),
        ('flutter.official_api_key', '官方通道密钥。**存在（值已省略）**，长度 48'),
        ('flutter.model', '当前模型名。实测 `deepseek-v4-pro`'),
        ('flutter.temperature', '采样温度。实测 `0.8`（float）'),
        ('flutter.context_limit', '上下文长度上限。实测 `1000000`（int，即 1e6 token）'),
        ('flutter.use_anthropic_format', '报文协议开关。实测 `false` → 走 OpenAI Chat Completions 形态'),
        ('flutter.saved_providers', 'JSON 字符串：供应商数组，完整结构见 §5'),
        ('flutter.system_prompt', '全局系统提示词。实测为中文 116 字符'),
        ('flutter.reserved_output_tokens', '输出预留 token。实测 `16000`（int）'),
        ('flutter.auto_clear_context', '自动清理上下文开关。实测 `true`（bool）'),
        ('flutter.web_search_enabled', '联网搜索开关。实测 `false`（bool）'),
    ]
    for k, note in ai_keys:
        A('| `%s` | %s | %s | %s |' % (
            k, type(d[k]).__name__, render_value(k, d[k]), note))
    A('')
    A('### 4.1 `api_key` 与 `official_api_key` 的关系（实测）')
    A('')
    A('- 两者长度均为 48，且**逐字节相同**（`api_key == official_api_key` 为 `True`）。')
    A('- 与 `saved_providers[0].apiKey`（`sk-` 前缀，长度 35）**不相等**。')
    A('- 两者内容一律不抄录。')
    A('')
    A('### 4.2 `system_prompt` 全文（实测，无隐私内容）')
    A('')
    A('```text')
    A(d['flutter.system_prompt'])
    A('```')
    A('')
    A('### 4.3 strings 文件中的 AI 相关补充键（未持久化）')
    A('')
    A('| 候选键名 | 来源 | 说明 |')
    A('|---|---|---|')
    A('| `anysearch_api_key` | `WIN_app.so.strings.txt` @`0031b6d0` | 搜索服务密钥键名（推断） |')
    A('| `active_provider_name` | strings 文件 | 当前选中的供应商名（推断） |')
    A('| `official_connect_mode` | strings 文件 | 官方通道连接模式（推断） |')
    A('| `chat_stream_auto_retry` | strings 文件 | 流式自动重试（推断） |')
    A('| `llm_retry_attempt` | strings 文件 | 重试计数（推断） |')
    A('| `no_available_key` | strings 文件 | 无可用密钥错误（推断） |')
    A('| `model_not_found` | strings 文件 | 模型不存在错误（推断） |')
    A('| `context_summary` | strings 文件 | 上下文摘要（推断） |')
    A('')

    A('---')
    A('')
    A('## 5. `saved_providers` 完整结构（实测展开）')
    A('')
    A('`flutter.saved_providers` 是 **JSON 字符串**（不是 JSON 数组），需二次 `json.loads` 才能得到数组。')
    A('实测：顶层数组长度 **3**，每个元素为同构对象，字段名固定 5 个。')
    A('')
    A('### 5.1 字段表')
    A('')
    A('| 字段名 | JSON 类型 | 示例值 | 必填 | 说明（推断） |')
    A('|---|---|---|---|---|')
    A('| `name` | string | `api.deepseek.com` | 是 | 供应商标识/显示名，实测取值为域名形态 |')
    A('| `baseUrl` | string | `https://api.deepseek.com` | 是 | 该供应商的 API 根地址，**驼峰命名** |')
    A('| `apiKey` | string | 存在（值已省略） | 是 | 该供应商的密钥，实测长度 35/51/51 |')
    A('| `model` | string | `deepseek-v4-pro` | 是 | 该供应商下选用的模型名 |')
    A('| `useAnthropicFormat` | bool | `false` | 是 | 单供应商级协议开关，与全局 `use_anthropic_format` 同名不同层 |')
    A('')
    A('### 5.2 实测样本（密钥字段已省略）')
    A('')
    A('```json')
    A('[')
    sp = json.loads(d['flutter.saved_providers'])
    for i, o in enumerate(sp):
        A('  {')
        A('    "name": %s,' % json.dumps(o['name'], ensure_ascii=False))
        A('    "baseUrl": %s,' % json.dumps(o['baseUrl'], ensure_ascii=False))
        A('    "apiKey": "存在（值已省略）",')
        A('    "model": %s,' % json.dumps(o['model'], ensure_ascii=False))
        A('    "useAnthropicFormat": %s' % ('true' if o['useAnthropicFormat'] else 'false'))
        A('  }%s' % (',' if i < len(sp) - 1 else ''))
    A(']')
    A('```')
    A('')
    A('### 5.3 实测要点')
    A('')
    A('- `useAnthropicFormat` 三个样本全为 `false`，与全局 `flutter.use_anthropic_format=false` 一致。')
    A('- `model` 中存在**服务端自定义前缀名**（第 3 个样本形如 `[某前缀]claude-opus-4.8-3`，')
    A('  中括号内容为服务商自定义命名，**推断**为渠道/分组前缀），说明该字段是自由字符串而非枚举。')
    A('- `baseUrl` 第 3 个样本为 `http://`（非 https），说明不强制 TLS。')
    A('- 数组顺序即 UI 列表顺序（**推断**）；未见 `id`、`isActive`、`enabled` 之类字段，')
    A('  故「当前选中项」不在本结构内，可能由 `flutter.model` + `flutter.llm_base_url` 表达（**推断**）。')
    A('')

    A('---')
    A('')
    A('## 6. 其它结构化键的完整字段结构（实测）')
    A('')
    A('### 6.1 `skill_list`（JSON 字符串 → 数组，8 个元素）')
    A('')
    A('实测字段名共 **7 个**，与任务描述给出的 7 个**完全一致**，无缺无增：')
    A('`id` / `name` / `description` / `directoryPath` / `isBuiltIn` / `marketplaceSkillId` / `marketplaceVersion`。')
    A('')
    A('| 字段名 | JSON 类型 | 示例值 | 说明 |')
    A('|---|---|---|---|')
    A('| `id` | string | `builtin_novel-writer` | 内置项为 `builtin_` + name；用户/市场项为 `name_毫秒时间戳` |')
    A('| `name` | string | `novel-writer` | 技能名，同时是磁盘目录名 |')
    A('| `description` | string | `写小说时使用的技能…` | 中文长描述，触发语义说明 |')
    A('| `directoryPath` | string | `C:\\\\Users\\\\Administrator\\\\Documents\\\\skills\\\\novel-writer` | 绝对路径，Windows 反斜杠转义 |')
    A('| `isBuiltIn` | bool | `true` | 是否内置技能 |')
    A('| `marketplaceSkillId` | int \\| null | `85` | 市场技能 ID；**内置项为 `null`** |')
    A('| `marketplaceVersion` | int \\| null | `1` | 市场版本号；**内置项为 `null`** |')
    A('')
    A('实测 8 个元素的字段取值：')
    A('')
    A('| # | `id` | `name` | `isBuiltIn` | `marketplaceSkillId` | `marketplaceVersion` |')
    A('|---|---|---|---|---|---|')
    sl = json.loads(d['flutter.skill_list'])
    for i, o in enumerate(sl):
        A('| %d | `%s` | `%s` | `%s` | `%s` | `%s` |' % (
            i, o['id'], o['name'], str(o['isBuiltIn']).lower(),
            o['marketplaceSkillId'], o['marketplaceVersion']))
    A('')
    A('- `directoryPath` 的父目录固定为 `%s`（实测 8/8）。' % 'C:\\Users\\Administrator\\Documents\\skills')
    A('- 注意：`id` 的时间戳后缀与其目录名后缀**可能不一致**（实测第 3 项 `id` 后缀 `...824048`，')
    A('  目录名后缀 `...824045`）。')
    A('')
    A('### 6.2 `active_skill_ids`（JSON 字符串 → 字符串数组）')
    A('')
    A('实测长度 **%d**，元素为 `skill_list[].id` 的子集（实测少 1 个：未包含 `烂人风格`）。' %
      len(json.loads(d['flutter.active_skill_ids'])))
    A('')
    A('```json')
    A(json.dumps(json.loads(d['flutter.active_skill_ids']), ensure_ascii=False, indent=2))
    A('```')
    A('')
    A('### 6.3 `novel_projects`（字符串，非 JSON）')
    A('')
    A('- 形式：**换行符 `\\n` 分隔的绝对路径列表**（不是 JSON 数组）。实测 %d 行。' %
      len([x for x in d['flutter.novel_projects'].split('\n') if x.strip()]))
    A('- 无引号、无逗号、无转义；空行需忽略（**推断**）。')
    A('')
    A('```text')
    A(d['flutter.novel_projects'])
    A('```')
    A('')
    A('### 6.4 `current_novel_project`（字符串）')
    A('')
    A('- 形式：单个绝对路径。实测值 `%s`。' % d['flutter.current_novel_project'])
    A('- 该值是 `novel_projects` 列表中的一项（实测命中第 4 行）。')
    A('')
    A('### 6.5 `webdav_config`（JSON 字符串 → 对象）')
    A('')
    A('实测字段 5 个（凭据值已省略）：')
    A('')
    A('| 字段名 | JSON 类型 | 观测值 | 说明 |')
    A('|---|---|---|---|')
    wc = json.loads(d['flutter.webdav_config'])
    wc_note = {
        'url': 'WebDAV 服务地址',
        'username': '账号（**存在（值已省略）**，邮箱形态）',
        'password': '应用授权码（**存在（值已省略）**）',
        'remotePath': '远端根目录',
        'lastSyncTime': '最近同步时间（ISO8601，Z 结尾）',
    }
    for kk in ['url', 'username', 'password', 'remotePath', 'lastSyncTime']:
        shown = ('存在（值已省略）' if kk in ('username', 'password')
                 else '`%s`' % wc[kk])
        A('| `%s` | %s | %s | %s |' % (kk, type(wc[kk]).__name__, shown, wc_note[kk]))
    A('')
    A('### 6.6 `webdav_sync_meta`（JSON 字符串 → 对象）')
    A('')
    A('实测结构：顶层 3 字段，其中 `scopeTimestamps` 为 4 键映射。')
    A('')
    A('```json')
    A(json.dumps(json.loads(d['flutter.webdav_sync_meta']), ensure_ascii=False, indent=2))
    A('```')
    A('')
    A('| 字段名 | JSON 类型 | 说明 |')
    A('|---|---|---|')
    A('| `version` | int | 同步元数据 schema 版本，实测 `3` |')
    A('| `lastUploadTime` | string | 最近上传时间（ISO8601，Z 结尾） |')
    A('| `scopeTimestamps` | object | 分区时间戳映射 |')
    A('| `scopeTimestamps.projects` | string | 小说项目分区 |')
    A('| `scopeTimestamps.skills` | string | 技能分区 |')
    A('| `scopeTimestamps.sessions` | string | 会话分区 |')
    A('| `scopeTimestamps.memos` | string | 备忘录分区 |')
    A('')

    A('---')
    A('')
    A('## 7. 面板与尺寸键（实测数值）')
    A('')
    A('### 7.1 已持久化的面板 / 字体键')
    A('')
    A('| 键名 | JSON 类型 | **实测值** | 语义（推断） |')
    A('|---|---|---|---|')
    dim_note = {
        'flutter.panel_session_width': '左侧会话列表面板宽度（逻辑像素）',
        'flutter.panel_chat_width': '中部聊天区宽度（逻辑像素）',
        'flutter.panel_directory_width': '文件/目录面板宽度（逻辑像素）',
        'flutter.panel_memo_width': '备忘录面板宽度（逻辑像素）',
        'flutter.panel_show_session': '会话面板可见性',
        'flutter.panel_show_directory': '目录面板可见性',
        'flutter.panel_show_memo': '备忘录面板可见性',
        'flutter.chat_font_size': '聊天区字号（逻辑像素）',
        'flutter.editor_font_size': '编辑器字号（逻辑像素）',
    }
    for k in ['flutter.panel_session_width', 'flutter.panel_chat_width',
              'flutter.panel_directory_width', 'flutter.panel_memo_width',
              'flutter.panel_show_session', 'flutter.panel_show_directory',
              'flutter.panel_show_memo', 'flutter.chat_font_size',
              'flutter.editor_font_size']:
        A('| `%s` | %s | `%s` | %s |' % (
            k, type(d[k]).__name__, str(d[k]).lower(), dim_note[k]))
    A('')
    A('### 7.2 数值汇总（实测）')
    A('')
    A('| 键 | 值 | 类型 |')
    A('|---|---|---|')
    A('| `panel_session_width` | `220.0` | float |')
    A('| `panel_chat_width` | `523.0` | float |')
    A('| `panel_directory_width` | `200.0` | float |')
    A('| `panel_memo_width` | `320.0` | float |')
    A('| `chat_font_size` | `15.0` | float |')
    A('| `editor_font_size` | `15.0` | float |')
    A('')
    A('实测观察：4 个面板宽度与 2 个字号**全部为 float**（Flutter `double`），非 int。')
    A('')
    A('### 7.3 外观 / 主题数值（实测）')
    A('')
    A('| 键名 | 类型 | 实测值 | 说明 |')
    A('|---|---|---|---|')
    A('| `flutter.is_dark_mode` | bool | `true` | 深色模式开关 |')
    A('| `flutter.custom_accent_color` | int | `4286343935` | ARGB 打包整数 |')
    A('')
    A('- `4286343935` 十六进制 = `0x%08X`；拆解 A=`0x%02X`（%d）、R=`0x%02X`（%d）、'
      'G=`0x%02X`（%d）、B=`0x%02X`（%d）→ `#%02X%02X%02X`（**推断**为 Flutter `Color.value` 的 '
      '0xAARRGGBB 打包）。' % (
          d['flutter.custom_accent_color'] & 0xFFFFFFFF,
          (d['flutter.custom_accent_color'] >> 24) & 0xFF, (d['flutter.custom_accent_color'] >> 24) & 0xFF,
          (d['flutter.custom_accent_color'] >> 16) & 0xFF, (d['flutter.custom_accent_color'] >> 16) & 0xFF,
          (d['flutter.custom_accent_color'] >> 8) & 0xFF, (d['flutter.custom_accent_color'] >> 8) & 0xFF,
          d['flutter.custom_accent_color'] & 0xFF, d['flutter.custom_accent_color'] & 0xFF,
          (d['flutter.custom_accent_color'] >> 16) & 0xFF,
          (d['flutter.custom_accent_color'] >> 8) & 0xFF,
          d['flutter.custom_accent_color'] & 0xFF))
    A('')

    A('---')
    A('')
    A('## 8. strings 文件中的额外偏好键候选（未持久化）')
    A('')
    theme_map = [
        ('外观 / 背景 / 字体', ['background_image_blur', 'background_image_glass',
                          'background_image_overlay', 'custom_background_color',
                          'custom_background_color_dark', 'custom_background_color_light',
                          'custom_background_image', 'font_installed_manifest']),
        ('路径配置', ['custom_novels_dir', 'custom_skills_dir', 'file_read_allowed_dirs']),
        ('同步（LAN / WebDAV）', ['lan_sync_enabled', 'lan_sync_token', 'webdav_lan_config']),
        ('通知 / 公告', ['last_seen_announcement_id', 'last_seen_notification_announcement_id',
                     'max_announcement_id', 'unread_announcement_count',
                     'notification_sound_enabled', 'notification_sound_path', 'show_on_startup']),
        ('编辑 / 排版', ['punct_replace_rules', 'original_order_index', 'original_parent_rel_path',
                     'rank_data_enabled']),
        ('AI / 用量', ['active_provider_name', 'anysearch_api_key', 'official_connect_mode',
                    'chat_stream_auto_retry']),
        ('商业化', ['vip_type', 'marketplace_download_quota', 'daily_free_quota_exhausted',
                 'insufficient_user_quota', 'rate_limit_exceeded', 'rate_limit_exceeded_user',
                 'model_price_error', 'purchase_setup_hint', 'device_usage_count',
                 'device_usage_tokens', 'force_update_required', 'force_update_version',
                 'is_force_update', 'usage_check_completed', 'usage_check_started']),
    ]
    A('来源：`%s`（`偏移<TAB>字符串` 格式，共 96176 行）。' % STRINGS)
    A('方法：先剔除 AOT 粘连噪声（尾随 `r` 且去 `r` 后命中已知键名，如 `official_api_keyr`），')
    A('再保留「下划线分段 ≥ 2 且命中偏好语义前缀」的标识符，并排除 Dart/Flutter 内部标识、')
    A('Material 3 颜色 token、AI 流式事件名与字体名。')
    A('**这些键名实测存在于二进制，但在本机 JSON 中无值**，故不计入第 1 节的键总数。')
    A('')
    A('共 **%d** 个候选。' % len(decl_extra))
    A('')
    A('| 候选键名 | 主题（推断） |')
    A('|---|---|')
    theme_of = {}
    for title, names in theme_map:
        for n in names:
            theme_of.setdefault(n, title)
    for n in decl_extra:
        A('| `%s` | %s |' % (n, theme_of.get(n, '—')))
    A('')
    A('### 8.1 AOT 粘连后缀噪声（**不是真实键名**，实测归类）')
    A('')
    A('strings 文件中以下形态是字符串与相邻字面量 `r` 粘连所致；去掉尾随 `r` 后即为第 2 节真实键名。')
    A('切勿当作独立偏好键：')
    A('')
    A('| 粘连形态 | 归一到 |')
    A('|---|---|')
    for n in noise_suffix:
        A('| `%s` | `%s` |' % (n, strip_r(n)))
    A('')
    A('另有同一模式的非键名粘连：`active_skill_idsr`、`ai_run_completedr`、`panel_chat_widthr`、')
    A('`panel_memo_widthr`、`editor_font_sizer`、`vip_device_countr`、`vip_device_limitr`、')
    A('`tool_call_resultr`、`webdav_sync_metar`（**实测**存在于 strings 文件，`r` 为粘连噪声）。')
    A('`webdav_sync_metacloud` / `webdav_sync_metalan` 同理为 `webdav_sync_meta` + `cloud`/`lan` 粘连。')
    A('')

    A('---')
    A('')
    A('## 9. 未能归类的键')
    A('')
    unclassified = [it for it in items if it['cat'] == '未能归类']
    A('未能归类的键数量（第 2 节口径）：**%d**。' % len(unclassified))
    A('')
    if unclassified:
        A('| 键名 | 类型 | 观测值 |')
        A('|---|---|---|')
        for it in unclassified:
            A('| `%s` | %s | %s |' % (it['key'], it['type'], render_value(it['key'], it['val'])))
    else:
        A('无：本文档第 2 节的 %d 个键全部落入 §1.2 的 %d 个类别之一。' % (len(d), len(cats)))
    A('')
    A('---')
    A('')
    A('## 10. 统计复核')
    A('')
    A('| 项 | 数量 |')
    A('|---|---|')
    A('| JSON 实际键总数 | %d |' % len(d))
    A('| 第 2 节表格行数（应等于键总数） | %d |' % len(items))
    A('| 类别数 | %d |' % len(cats))
    A('| 未能归类 | %d |' % len(unclassified))
    A('| 商业化（切除） | %d |' % cat_counts.get('商业化（切除）', 0))
    A('| AI/模型 | %d |' % cat_counts.get('AI/模型', 0))
    A('| 界面面板 | %d |' % cat_counts.get('界面面板', 0))
    A('| strings 额外候选键（未持久化） | %d |' % len(decl_extra))
    A('')
    A('> 生成方式：`python S:\\writerD\\docs\\spec\\_extract\\gen_prefs.py`，')
    A('> 以 Python `io.open(..., encoding=\'utf-8\')` 写出（未使用 PowerShell 写文件）。')
    A('')

    text = '\n'.join(L)

    # 安全闸门：绝不允许密钥/手机号/sk- 形态字符串进入产物
    for it in items:
        v = it['val']
        if isinstance(v, str) and it['key'] not in SECRET_KEYS:
            pass
    leaks = []
    for m in PHONE_RE.finditer(text):
        leaks.append(('phone', m.group(0)))
    for m in SK_RE.finditer(text):
        leaks.append(('sk-key', m.group(0)))
    raw_keys = [json.loads(d['flutter.saved_providers'])[i]['apiKey'] for i in range(3)]
    for rk in raw_keys:
        if rk and rk in text:
            leaks.append(('provider-key', rk[:6] + '...'))
    for secret_key in ('flutter.api_key', 'flutter.official_api_key'):
        if d[secret_key] in text:
            leaks.append(('api_key', secret_key))
    if d['flutter.vip_phone'] in text:
        leaks.append(('phone-exact', 'vip_phone'))
    if json.loads(d['flutter.webdav_config'])['password'] in text:
        leaks.append(('webdav-password', 'password'))
    if leaks:
        raise SystemExit('SECRET LEAK DETECTED: %r' % leaks)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with io.open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    return len(d), cat_counts, len(unclassified), len(decl_extra), len(text)


if __name__ == '__main__':
    total, cats, uncl, extra, nchars = build()
    print('OK total=%d unclassified=%d strings_extra=%d chars=%d' % (total, uncl, extra, nchars))
    for c, n in sorted(cats.items(), key=lambda x: -x[1]):
        print('   %-16s %d' % (c, n))
