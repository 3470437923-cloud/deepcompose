/**
 * 设置屏 —— AI 提供商配置（数据驱动版）。
 *
 * 机械转换的视觉基座已替换为真实数据绑定：
 * - 读取 prefs（启动时由 app.ts boot() 装配）
 * - 保存即写 shared_preferences.json（savePrefs）
 * - 切除 CONTRACT §11 的 VIP/套餐卡
 * - 布局与色值严格沿用 mock（screens.css），新增输入控件样式在 base.css
 */

import { useState, type ReactElement } from "react";
import logo from "../assets/logo.png";
import { currentBoot, savePrefs } from "../core/app";
import type { Prefs } from "../core/prefs";

type NavSection = "provider" | "skill" | "params" | "theme" | "sync" | "data" | "about";

interface Props {
  onBack: () => void;
}

export default function SettingsScreen({ onBack }: Props) {
  const boot = currentBoot();
  const [section, setSection] = useState<NavSection>("provider");
  const [form, setForm] = useState<Prefs>(() => ({
    ...(boot?.prefs ?? ({} as Prefs)),
  }));
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  if (!boot) {
    return (
      <div className="fitter" id="screenA">
        <div className="holder">
          <div className="win-frame">
            <div className="win">
              <div className="titlebar">
                <div className="brand">
                  <div className="brand-mark"><img src={logo} alt="" /></div>
                  <div className="brand-name">writerD</div>
                </div>
              </div>
              <div style={{ padding: 40, color: "#9898B0" }}>配置未加载，请重启应用。</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const update = <K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaveMsg("");
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg("");
    try {
      await savePrefs(form);
      setSaveMsg("配置已保存");
    } catch (e) {
      setSaveMsg(`保存失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const navItems: { key: NavSection; label: string; top: number; icon: ReactElement }[] = [
    {
      key: "provider",
      label: "AI 提供商",
      top: 40,
      icon: (
        <svg viewBox="0 0 20 20" className="ic">
          <rect x="2.5" y="4" width="15" height="12" rx="2.5" />
          <path d="M2.5 8.5h15" />
        </svg>
      ),
    },
    {
      key: "skill",
      label: "Skill",
      top: 92,
      icon: (
        <svg viewBox="0 0 20 20" className="ic">
          <path d="M10 2.6l2.3 4.7 5.2.75-3.75 3.65.9 5.2L10 14.4l-4.65 2.5.9-5.2L2.5 8.05l5.2-.75L10 2.6z" />
        </svg>
      ),
    },
    {
      key: "params",
      label: "参数",
      top: 144,
      icon: (
        <svg viewBox="0 0 20 20" className="ic">
          <path d="M3 5.5h6M13 5.5h4M3 14.5h4M11 14.5h6" />
          <circle cx="11" cy="5.5" r="1.9" />
          <circle cx="9" cy="14.5" r="1.9" />
        </svg>
      ),
    },
    {
      key: "theme",
      label: "主题",
      top: 196,
      icon: (
        <svg viewBox="0 0 20 20" className="ic">
          <path d="M10 3a7 7 0 1 0 0 14c1 0 1.6-.7 1.6-1.5 0-.45-.2-.8-.5-1.1-.3-.3-.45-.65-.45-1.1 0-.8.7-1.45 1.55-1.45h1.35c1.4 0 2.45-1.1 2.45-2.45C16 6.4 13.3 3 10 3z" />
          <circle cx="7" cy="8.4" r="1" className="ic-fill" stroke="none" />
          <circle cx="10.6" cy="6.6" r="1" className="ic-fill" stroke="none" />
        </svg>
      ),
    },
    {
      key: "sync",
      label: "同步",
      top: 248,
      icon: (
        <svg viewBox="0 0 20 20" className="ic">
          <path d="M3.5 10a6.5 6.5 0 0 1 11-4.7" />
          <path d="M16.5 10a6.5 6.5 0 0 1-11 4.7" />
          <path d="M14.2 2.6v3h-3M5.8 17.4v-3h3" />
        </svg>
      ),
    },
    {
      key: "data",
      label: "数据",
      top: 300,
      icon: (
        <svg viewBox="0 0 20 20" className="ic">
          <ellipse cx="10" cy="5.4" rx="6.5" ry="2.6" />
          <path d="M3.5 5.4v9.2c0 1.44 2.9 2.6 6.5 2.6s6.5-1.16 6.5-2.6V5.4" />
          <path d="M3.5 10c0 1.44 2.9 2.6 6.5 2.6s6.5-1.16 6.5-2.6" />
        </svg>
      ),
    },
    {
      key: "about",
      label: "关于",
      top: 352,
      icon: (
        <svg viewBox="0 0 20 20" className="ic">
          <circle cx="10" cy="10" r="7.5" />
          <path d="M10 13.6v.05" />
          <path d="M7.9 7.8a2.1 2.1 0 1 1 2.9 1.95c-.55.24-.8.6-.8 1.2" />
        </svg>
      ),
    },
  ];

  return (
    <div className="fitter" id="screenA">
      <div className="holder">
        <div className="win-frame">
          <div className="win">
            {/* ── 标题栏 ── */}
            <div className="titlebar">
              <div className="brand">
                <div className="brand-mark"><img src={logo} alt="" /></div>
                <div className="brand-name">writerD</div>
              </div>
              <div className="win-tools">
                <div className="spacer" />
                <button className="tbtn" title="最小化">
                  <svg viewBox="0 0 20 20" className="ic"><path d="M5 10h10" /></svg>
                </button>
                <button className="tbtn" title="最大化">
                  <svg viewBox="0 0 20 20" className="ic">
                    <rect x="4" y="4.5" width="11" height="11" rx="2" />
                    <path d="M6 4.5V4a1.5 1.5 0 0 1 1.5-1.5H15A1.5 1.5 0 0 1 16.5 4v7.5A1.5 1.5 0 0 1 15 13h-.5" />
                  </svg>
                </button>
                <button className="tbtn" title="关闭">
                  <svg viewBox="0 0 20 20" className="ic">
                    <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />
                  </svg>
                </button>
              </div>
            </div>

            {/* ── 头部：返回 + 标题 ── */}
            <div className="a-head">
              <div className="vline" style={{ left: "56px" }} />
              <div className="vline" style={{ left: "181px" }} />
              <button className="a-back" title="返回" onClick={onBack}>
                <svg viewBox="0 0 20 20" className="ic">
                  <path d="M11.5 4.5L6 10l5.5 5.5" />
                  <path d="M6.5 10h8" />
                </svg>
              </button>
              <div className="a-head-icon">
                <svg viewBox="0 0 24 24" className="ic">
                  <circle cx="12" cy="12" r="2.9" />
                  <path d="M19.3 14.2a1.5 1.5 0 0 0 .3 1.65l.05.06a1.8 1.8 0 1 1-2.55 2.55l-.06-.06a1.5 1.5 0 0 0-1.65-.3 1.5 1.5 0 0 0-.9 1.37v.18a1.8 1.8 0 1 1-3.6 0v-.1a1.5 1.5 0 0 0-1-1.37 1.5 1.5 0 0 0-1.65.3l-.06.06A1.8 1.8 0 1 1 4.3 15.9l.06-.06a1.5 1.5 0 0 0 .3-1.65 1.5 1.5 0 0 0-1.37-.9h-.18a1.8 1.8 0 1 1 0-3.6h.1a1.5 1.5 0 0 0 1.37-1 1.5 1.5 0 0 0-.3-1.65L4.2 7A1.8 1.8 0 1 1 6.76 4.45l.06.06a1.5 1.5 0 0 0 1.65.3h.07a1.5 1.5 0 0 0 .9-1.37v-.18a1.8 1.8 0 1 1 3.6 0v.1a1.5 1.5 0 0 0 .9 1.37 1.5 1.5 0 0 0 1.65-.3l.06-.06A1.8 1.8 0 1 1 18.2 7l-.06.06a1.5 1.5 0 0 0-.3 1.65v.07a1.5 1.5 0 0 0 1.37.9h.18a1.8 1.8 0 1 1 0 3.6h-.1a1.5 1.5 0 0 0-1.37.9z" />
                </svg>
              </div>
              <div className="a-head-title">设置</div>
            </div>

            {/* ── 左侧导航 ── */}
            <div className="a-nav">
              {navItems.map((item) => (
                <button
                  key={item.key}
                  className={`a-nav-item ${section === item.key ? "on" : ""}`}
                  style={{ top: `${item.top}px` }}
                  onClick={() => setSection(item.key)}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>

            {/* ── 内容区 ── */}
            <div className="a-content">
              {section === "provider" && (
                <ProviderSection form={form} update={update} saving={saving} saveMsg={saveMsg} onSave={handleSave} />
              )}
              {section === "params" && (
                <ParamsSection form={form} update={update} saving={saving} saveMsg={saveMsg} onSave={handleSave} />
              )}
              {section !== "provider" && section !== "params" && (
                <div className="a-placeholder">
                  <div className="a-placeholder-text">
                    {section === "skill" && "Skill 管理（待实现）"}
                    {section === "theme" && "主题设置（待实现）"}
                    {section === "sync" && "同步设置（待实现）"}
                    {section === "data" && "数据管理（待实现）"}
                    {section === "about" && "关于 writerD（待实现）"}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── AI 提供商配置分节 ── */
function ProviderSection({
  form,
  update,
  saving,
  saveMsg,
  onSave,
}: {
  form: Prefs;
  update: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  saving: boolean;
  saveMsg: string;
  onSave: () => void;
}) {
  return (
    <div className="a-settings-panel">
      <div className="a-settings-title">AI 提供商</div>
      <div className="a-settings-desc">配置自定义接入的 API 端点与密钥。选用后点下方「保存」生效。</div>

      <div className="a-form-row">
        <label className="a-form-label">接口地址（Base URL）</label>
        <input
          className="a-form-input"
          type="text"
          placeholder="https://api.deepseek.com/v1"
          value={form.llmBaseUrl}
          onChange={(e) => update("llmBaseUrl", e.target.value)}
          spellCheck={false}
        />
      </div>

      <div className="a-form-row">
        <label className="a-form-label">API Key</label>
        <input
          className="a-form-input"
          type="password"
          placeholder="sk-..."
          value={form.apiKey}
          onChange={(e) => update("apiKey", e.target.value)}
          spellCheck={false}
        />
      </div>

      <div className="a-form-row">
        <label className="a-form-label">模型名称</label>
        <input
          className="a-form-input"
          type="text"
          placeholder="deepseek-chat"
          value={form.model}
          onChange={(e) => update("model", e.target.value)}
          spellCheck={false}
        />
      </div>

      <div className="a-form-row a-form-row-inline">
        <div className="a-form-col">
          <label className="a-form-label">Temperature</label>
          <input
            className="a-form-input"
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={form.temperature}
            onChange={(e) => update("temperature", parseFloat(e.target.value) || 0.8)}
          />
        </div>
        <div className="a-form-col">
          <label className="a-form-label">协议格式</label>
          <div className="a-form-toggle">
            <button
              className={`a-toggle-btn ${!form.useAnthropicFormat ? "on" : ""}`}
              onClick={() => update("useAnthropicFormat", false)}
            >
              OpenAI
            </button>
            <button
              className={`a-toggle-btn ${form.useAnthropicFormat ? "on" : ""}`}
              onClick={() => update("useAnthropicFormat", true)}
            >
              Anthropic
            </button>
          </div>
        </div>
      </div>

      <div className="a-form-actions">
        <button className="a-btn-primary" onClick={onSave} disabled={saving}>
          {saving ? "保存中..." : "保存"}
        </button>
        {saveMsg && (
          <span className={`a-save-msg ${saveMsg.includes("失败") ? "error" : ""}`}>{saveMsg}</span>
        )}
      </div>

      <div className="a-form-hint">
        保存后立即生效。当前配置将写入 shared_preferences.json，重启后自动加载。
      </div>
    </div>
  );
}

/* ── 参数配置分节 ── */
function ParamsSection({
  form,
  update,
  saving,
  saveMsg,
  onSave,
}: {
  form: Prefs;
  update: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  saving: boolean;
  saveMsg: string;
  onSave: () => void;
}) {
  return (
    <div className="a-settings-panel">
      <div className="a-settings-title">参数</div>
      <div className="a-settings-desc">上下文与输出限制。参数保存后立即生效。</div>

      <div className="a-form-row">
        <label className="a-form-label">上下文长度（tokens）</label>
        <input
          className="a-form-input"
          type="number"
          min={1000}
          step={1000}
          value={form.contextLimit}
          onChange={(e) => update("contextLimit", parseInt(e.target.value, 10) || 1000000)}
        />
      </div>

      <div className="a-form-row">
        <label className="a-form-label">预留输出 tokens</label>
        <input
          className="a-form-input"
          type="number"
          min={100}
          step={100}
          value={form.reservedOutputTokens}
          onChange={(e) => update("reservedOutputTokens", parseInt(e.target.value, 10) || 16000)}
        />
      </div>

      <div className="a-form-row a-form-row-inline">
        <div className="a-form-col">
          <label className="a-form-label">自动清理上下文</label>
          <div className="a-form-toggle">
            <button
              className={`a-toggle-btn ${form.autoClearContext ? "on" : ""}`}
              onClick={() => update("autoClearContext", true)}
            >
              开启
            </button>
            <button
              className={`a-toggle-btn ${!form.autoClearContext ? "on" : ""}`}
              onClick={() => update("autoClearContext", false)}
            >
              关闭
            </button>
          </div>
        </div>
      </div>

      <div className="a-form-actions">
        <button className="a-btn-primary" onClick={onSave} disabled={saving}>
          {saving ? "保存中..." : "保存"}
        </button>
        {saveMsg && (
          <span className={`a-save-msg ${saveMsg.includes("失败") ? "error" : ""}`}>{saveMsg}</span>
        )}
      </div>
    </div>
  );
}
