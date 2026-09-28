/**
 * 配置模型（键名保持既有格式，43 键中的非商业化部分）。
 *
 * 键名保留 `flutter.` 前缀：保持既有格式，用户可以直接沿用既有配置。
 * 商业化键（vip_* / device_id）**永不写入**。
 * 存储位置：%APPDATA%\com.writerd\writerD\shared_preferences.json。
 */

export const PREFIX = "flutter.";

/**
 * 主题模式（writerD 3.0 扩展）：
 *   dark   = 曜石黑液态玻璃
 *   light  = 晨雾白液态玻璃
 *   dsblue = 深海 DS 蓝液态玻璃（DeepSeek 品牌蓝环境光）
 * 键名 `theme_mode` 为 writerD 自有扩展（既有格式中无此键，如实标注）；
 * 兼容策略：配置里没有 theme_mode 时按既有键 is_dark_mode 派生。
 */
export type ThemeMode = "dark" | "light" | "dsblue";

/** DS 品牌蓝（0xAARRGGBB）：默认强调色，也是 DS 蓝主题的身份色 */
export const DS_BLUE_ARGB = 4283263998; // 0xFF4D6BFE

export interface Provider {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  useAnthropicFormat: boolean;
}

export interface SkillMeta {
  id: string;
  name: string;
  description: string;
  directoryPath: string;
  isBuiltIn: boolean;
  marketplaceSkillId: number | null;
  marketplaceVersion: number | null;
}

export interface WebdavConfig {
  url: string;
  username: string;
  password: string;
  remotePath: string;
  lastSyncTime: string;
}

export interface Prefs {
  // —— AI 接入（11 键中的非商业化部分）——
  llmBaseUrl: string;
  apiKey: string;
  officialApiKey: string;
  model: string;
  temperature: number;
  contextLimit: number;
  useAnthropicFormat: boolean;
  savedProviders: Provider[];
  systemPrompt: string;
  reservedOutputTokens: number;
  autoClearContext: boolean;
  /** 工具调度轮次上限（委托方要求可调；既有格式中无此键，键名 [待实测]） */
  toolRoundLimit: number;
  /** 单次回复 max_tokens（既有参数页「最大输出(K)·仅 Anthropic」有文案实证，键名 [待实测]） */
  maxOutputTokens: number;

  // —— 界面面板（7 键）——
  panelSessionWidth: number;
  panelChatWidth: number;
  panelDirectoryWidth: number;
  panelMemoWidth: number;
  panelShowSession: boolean;
  panelShowDirectory: boolean;
  panelShowMemo: boolean;

  // —— 技能（3 键）——
  skillList: SkillMeta[];
  activeSkillIds: string[];
  defaultSkillsInitialized: boolean;

  // —— 同步（3 键）——
  isConnected: boolean;
  webdavConfig: WebdavConfig;
  webdavSyncMeta: Record<string, unknown>;

  // —— 外观主题（既有 2 键 + writerD 扩展 1 键）——
  customAccentColor: number;
  isDarkMode: boolean;
  /** 主题模式（writerD 扩展键 theme_mode；缺省按 is_dark_mode 派生） */
  themeMode: ThemeMode;

  // —— 路径（2 键）——
  customNovelsDir: string;
  customSkillsDir: string;

  // —— 会话（2 键）——
  currentNovelProject: string;
  novelProjects: string[];

  // —— 字体（2 键）——
  chatFontSize: number;
  editorFontSize: number;
}

/**
 * 默认系统提示词。
 *
 * ⚠️ 提示词来源说明（不复制第三方产品的提示词原文）：
 * 本提示词由本项目**自写**，但与既有默认提示词**语义等价**——同样是四件事：
 * ① 你是小说写作助手；② 可读写项目目录内文件；③ 用可用工具先读后写；
 * ④ 与既有故事/角色/世界观保持一致，并使用与用户相同的语言。
 */
export const DEFAULT_SYSTEM_PROMPT =
  "你是一名中文长篇小说写作助手，可以在小说项目目录内读取与写入文件。" +
  "当用户要求写作、续写、修改或审阅内容时，先用可用工具读取相关章节与设定资料，再据此动笔。" +
  "始终与既有故事线、人物设定和世界观保持一致。请使用与用户相同的语言回复。";

export const DEFAULT_PREFS: Prefs = {
  llmBaseUrl: "",
  apiKey: "",
  officialApiKey: "",
  model: "",
  temperature: 0.8,
  contextLimit: 1000000,
  useAnthropicFormat: false,
  savedProviders: [],
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  reservedOutputTokens: 16000,
  autoClearContext: true,
  toolRoundLimit: 12,
  maxOutputTokens: 32000,

  panelSessionWidth: 220.0,
  panelChatWidth: 523.0,
  panelDirectoryWidth: 200.0,
  panelMemoWidth: 320.0,
  panelShowSession: true,
  panelShowDirectory: true,
  panelShowMemo: false,

  skillList: [],
  activeSkillIds: [],
  defaultSkillsInitialized: false,

  isConnected: false,
  webdavConfig: { url: "", username: "", password: "", remotePath: "", lastSyncTime: "" },
  webdavSyncMeta: {},

  customAccentColor: DS_BLUE_ARGB,
  isDarkMode: true,
  themeMode: "dark",

  customNovelsDir: "",
  customSkillsDir: "",

  currentNovelProject: "",
  novelProjects: [],

  chatFontSize: 15.0,
  editorFontSize: 15.0,
};

/** 键名映射：内部字段 → 既有键名（去掉 flutter. 前缀后的部分） */
const KEY_MAP: Record<keyof Prefs, string> = {
  llmBaseUrl: "llm_base_url",
  apiKey: "api_key",
  officialApiKey: "official_api_key",
  model: "model",
  temperature: "temperature",
  contextLimit: "context_limit",
  useAnthropicFormat: "use_anthropic_format",
  savedProviders: "saved_providers",
  systemPrompt: "system_prompt",
  reservedOutputTokens: "reserved_output_tokens",
  autoClearContext: "auto_clear_context",
  toolRoundLimit: "tool_round_limit",
  maxOutputTokens: "max_output_tokens",

  panelSessionWidth: "panel_session_width",
  panelChatWidth: "panel_chat_width",
  panelDirectoryWidth: "panel_directory_width",
  panelMemoWidth: "panel_memo_width",
  panelShowSession: "panel_show_session",
  panelShowDirectory: "panel_show_directory",
  panelShowMemo: "panel_show_memo",

  skillList: "skill_list",
  activeSkillIds: "active_skill_ids",
  defaultSkillsInitialized: "default_skills_initialized",

  isConnected: "is_connected",
  webdavConfig: "webdav_config",
  webdavSyncMeta: "webdav_sync_meta",

  customAccentColor: "custom_accent_color",
  isDarkMode: "is_dark_mode",
  themeMode: "theme_mode", // writerD 扩展键（既有格式无此键）

  customNovelsDir: "custom_novels_dir",
  customSkillsDir: "custom_skills_dir",

  currentNovelProject: "current_novel_project",
  novelProjects: "novel_projects",

  chatFontSize: "chat_font_size",
  editorFontSize: "editor_font_size",
};

/** 需要按 JSON 字符串存取的键（既有格式即以字符串形式落在 shared_preferences 里） */
const JSON_KEYS: ReadonlySet<keyof Prefs> = new Set<keyof Prefs>([
  "savedProviders",
  "skillList",
  "activeSkillIds",
  "webdavConfig",
  "webdavSyncMeta",
]);

/** 需要切除的商业化键（永不写入；读到也忽略） */
export const CUT_KEYS = [
  "vip_phone",
  "vip_status",
  "vip_days_left",
  "vip_expire_time",
  "vip_is_lifetime",
  "vip_device_limit",
  "vip_device_count",
  "vip_last_check",
  "device_id",
] as const;

function asNumber(v: unknown, def: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : def;
}
function asBool(v: unknown, def: boolean): boolean {
  return typeof v === "boolean" ? v : def;
}
function asString(v: unknown, def: string): string {
  return typeof v === "string" ? v : def;
}

function parseJsonField<T>(v: unknown, def: T): T {
  if (typeof v !== "string" || v.trim() === "") return def;
  try {
    const parsed: unknown = JSON.parse(v);
    return (parsed ?? def) as T;
  } catch {
    return def;
  }
}

/** 解析配置原文（容错：BOM / 缺失 / 类型不符一律回落默认值，绝不抛） */
export function parsePrefs(text: string): Prefs {
  let raw: Record<string, unknown> = {};
  // 去掉 UTF-8 BOM：外部编辑器与 Windows PowerShell 都可能写进 BOM，
  // 而 JSON.parse 遇到 BOM 会直接抛错（曾导致整份配置被静默忽略）。
  const cleaned = text.replace(/^\uFEFF/, "");
  if (cleaned.trim()) {
    try {
      const parsed: unknown = JSON.parse(cleaned);
      if (parsed && typeof parsed === "object") raw = parsed as Record<string, unknown>;
    } catch {
      raw = {};
    }
  }
  const get = (k: keyof Prefs): unknown => raw[PREFIX + KEY_MAP[k]];
  const p: Prefs = { ...DEFAULT_PREFS };

  p.llmBaseUrl = asString(get("llmBaseUrl"), p.llmBaseUrl);
  p.apiKey = asString(get("apiKey"), p.apiKey);
  p.officialApiKey = asString(get("officialApiKey"), p.officialApiKey);
  p.model = asString(get("model"), p.model);
  p.temperature = asNumber(get("temperature"), p.temperature);
  p.contextLimit = asNumber(get("contextLimit"), p.contextLimit);
  p.useAnthropicFormat = asBool(get("useAnthropicFormat"), p.useAnthropicFormat);
  p.savedProviders = parseJsonField<Provider[]>(get("savedProviders"), p.savedProviders);
  p.systemPrompt = asString(get("systemPrompt"), p.systemPrompt);
  p.reservedOutputTokens = asNumber(get("reservedOutputTokens"), p.reservedOutputTokens);
  p.autoClearContext = asBool(get("autoClearContext"), p.autoClearContext);

  p.panelSessionWidth = asNumber(get("panelSessionWidth"), p.panelSessionWidth);
  p.panelChatWidth = asNumber(get("panelChatWidth"), p.panelChatWidth);
  p.panelDirectoryWidth = asNumber(get("panelDirectoryWidth"), p.panelDirectoryWidth);
  p.panelMemoWidth = asNumber(get("panelMemoWidth"), p.panelMemoWidth);
  p.panelShowSession = asBool(get("panelShowSession"), p.panelShowSession);
  p.panelShowDirectory = asBool(get("panelShowDirectory"), p.panelShowDirectory);
  p.panelShowMemo = asBool(get("panelShowMemo"), p.panelShowMemo);

  p.skillList = parseJsonField<SkillMeta[]>(get("skillList"), p.skillList);
  p.activeSkillIds = parseJsonField<string[]>(get("activeSkillIds"), p.activeSkillIds);
  p.defaultSkillsInitialized = asBool(get("defaultSkillsInitialized"), p.defaultSkillsInitialized);

  p.isConnected = asBool(get("isConnected"), p.isConnected);
  p.webdavConfig = parseJsonField<WebdavConfig>(get("webdavConfig"), p.webdavConfig);
  p.webdavSyncMeta = parseJsonField<Record<string, unknown>>(get("webdavSyncMeta"), p.webdavSyncMeta);

  p.customAccentColor = asNumber(get("customAccentColor"), p.customAccentColor);
  p.isDarkMode = asBool(get("isDarkMode"), p.isDarkMode);
  // theme_mode 为 writerD 扩展键：合法值直接采用；缺失/非法时按既有键
  // is_dark_mode 派生（旧配置文件平滑升级，两个键独立往返以保 round-trip）
  const tm = get("themeMode");
  p.themeMode =
    tm === "dark" || tm === "light" || tm === "dsblue"
      ? tm
      : p.isDarkMode
        ? "dark"
        : "light";

  p.customNovelsDir = asString(get("customNovelsDir"), p.customNovelsDir);
  p.customSkillsDir = asString(get("customSkillsDir"), p.customSkillsDir);

  p.currentNovelProject = asString(get("currentNovelProject"), p.currentNovelProject);
  // novel_projects 在既有格式里是 '\n' 分隔的绝对路径，不是 JSON
  const nps = get("novelProjects");
  p.novelProjects =
    typeof nps === "string" && nps.trim() !== ""
      ? nps.split("\n").map((s) => s.trim()).filter(Boolean)
      : p.novelProjects;

  p.chatFontSize = asNumber(get("chatFontSize"), p.chatFontSize);
  p.editorFontSize = asNumber(get("editorFontSize"), p.editorFontSize);

  return p;
}

/** 序列化为保持既有格式的 JSON（单行；商业化键不写） */
export function serializePrefs(p: Prefs): string {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(KEY_MAP) as (keyof Prefs)[]) {
    const realKey = PREFIX + KEY_MAP[key];
    const value = p[key];
    out[realKey] = JSON_KEYS.has(key) ? JSON.stringify(value) : value;
  }
  // novel_projects 是 '\n' 分隔文本（保持既有格式）
  out[PREFIX + KEY_MAP.novelProjects] = p.novelProjects.join("\n");
  return JSON.stringify(out);
}

/** 当前生效的供应商配置（优先 savedProviders 选中项语义：与全局键一致者视为选中） */
export function activeProvider(p: Prefs): Provider | null {
  const hit = p.savedProviders.find(
    (s) => s.baseUrl === p.llmBaseUrl && s.model === p.model,
  );
  return hit ?? null;
}

/** 0xAARRGGBB → #RRGGBB */
export function accentHex(color: number): string {
  const rgb = color & 0xffffff;
  return "#" + rgb.toString(16).padStart(6, "0").toUpperCase();
}
