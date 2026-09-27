/**
 * 设置屏 —— 数据驱动版（2026-09-28 按真机截图重建）。
 *
 * 结构对照 OpenWrite v2.0.1 真机（reference/shot-ow-set-*.png 一手证据）：
 * - 左导航 7 项（VIP 按 CONTRACT §11 切除）
 * - AI 提供商 = 自定义接入表单（切除内置供应商/公益模型/套餐卡）
 * - Skill = 清单 + 开关（真机口径：开启项注入系统提示词）
 * - 参数 = 温度滑杆 + 系统提示词 + 上下文压缩（仅已实证键）
 * - 主题 = 模式切换 + 强调色（5 色取自真机截图像素采样）
 * - 数据 / 关于 = 本地信息与维护操作
 * - 同步 = WebDAV / 局域网（配置层占位，传输层未实现，如实标注）
 *
 * 读取 prefs（boot() 装配），保存即写 shared_preferences.json（savePrefs）。
 * 新增控件样式在 base.css（a-card / a-switch / a-seg / a-skill-row 等）。
 */

import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import logo from "../assets/logo.png";
import { currentBoot, savePrefs } from "../core/app";
import { ConfirmDialog, type ConfirmRequest } from "../ui/Dialogs";
import type { Prefs } from "../core/prefs";

type NavSection = "provider" | "skill" | "params" | "theme" | "sync" | "data" | "about";

/** 真机主题色采样（shot-ow-set-主题.png (347..470,333)，首位与令牌 --accent 一致） */
const ACCENT_SWATCHES = [0xff7c6aff, 0xff3b82f6, 0xff0891b2, 0xff059669, 0xffec4899];

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
  const [flash, setFlash] = useState(""); // 各分页的操作即时反馈（不落盘）
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);

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

  // Ctrl+S 保存（真机参数页口径：参数保存后立即生效，也可以按 Ctrl+S 保存）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (section === "provider" || section === "params" || section === "theme") void handleSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const askConfirm = useCallback(
    (title: string, body?: string, opts?: { danger?: boolean; confirmLabel?: string }) =>
      new Promise<boolean>((resolve) => {
        setConfirmReq({ title, body, ...opts, resolve });
      }),
    [],
  );

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
                  onClick={() => {
                    setSection(item.key);
                    setFlash("");
                  }}
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
              {section === "skill" && (
                <SkillSection form={form} flash={flash} onFlash={setFlash} />
              )}
              {section === "params" && (
                <ParamsSection form={form} update={update} saving={saving} saveMsg={saveMsg} onSave={handleSave} />
              )}
              {section === "theme" && (
                <ThemeSection form={form} update={update} flash={flash} onFlash={setFlash} />
              )}
              {section === "sync" && <SyncSection flash={flash} onFlash={setFlash} />}
              {section === "data" && <DataSection form={form} flash={flash} onFlash={setFlash} askConfirm={askConfirm} />}
              {section === "about" && <AboutSection flash={flash} onFlash={setFlash} />}
            </div>

            <ConfirmDialog req={confirmReq} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── AI 提供商配置分节（自定义接入；切除内置供应商/公益模型/套餐） ── */
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
  const connected = Boolean(form.llmBaseUrl?.trim() && form.apiKey?.trim());
  return (
    <div className="a-settings-panel">
      <div className="a-card">
        <div className="a-card-head">
          <span className="a-card-title">自定义接入</span>
          {connected ? (
            <span className="d-badge"><i />已连接</span>
          ) : (
            <span className="d-badge off"><i />未连接</span>
          )}
          <span className="a-card-side">{form.model?.trim() || "未配置模型"}</span>
        </div>
        <div className="a-card-desc">
          配置任意 OpenAI / Anthropic 兼容端点。选用后点下方「保存」生效，重启后自动加载。
        </div>

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
      </div>
    </div>
  );
}

/* ── Skill 管理分节（真机：清单 + 开关，开启项注入系统提示词） ── */
function SkillSection({
  form,
  flash,
  onFlash,
}: {
  form: Prefs;
  flash: string;
  onFlash: (s: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [onlyOn, setOnlyOn] = useState(false);
  const [active, setActive] = useState<string[]>(form.activeSkillIds ?? []);
  const [collapsed, setCollapsed] = useState<{ builtin: boolean; custom: boolean }>({
    builtin: false,
    custom: false,
  });

  const skills = form.skillList ?? [];
  const match = (s: Prefs["skillList"][number]) => {
    const q = query.trim().toLowerCase();
    if (q && !s.name.toLowerCase().includes(q) && !s.description.toLowerCase().includes(q)) return false;
    if (onlyOn && !active.includes(s.id)) return false;
    return true;
  };
  const builtin = skills.filter((s) => s.isBuiltIn && match(s));
  const custom = skills.filter((s) => !s.isBuiltIn && match(s));
  const onCount = skills.filter((s) => active.includes(s.id)).length;

  const toggle = async (id: string) => {
    const next = active.includes(id) ? active.filter((x) => x !== id) : [...active, id];
    setActive(next);
    try {
      await savePrefs({ ...form, activeSkillIds: next });
      onFlash("");
    } catch (e) {
      onFlash(`保存失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const Row = ({ s }: { s: Prefs["skillList"][number] }) => {
    const on = active.includes(s.id);
    return (
      <div className="a-skill-row">
        <div className="a-skill-ava">{s.name.slice(0, 1).toUpperCase()}</div>
        <div className="a-skill-main">
          <div className="a-skill-name">{s.name}</div>
          <div className="a-skill-desc">{s.description || "（无描述）"}</div>
        </div>
        <button
          className={on ? "a-switch on" : "a-switch"}
          title={on ? "点击停用" : "点击启用"}
          onClick={() => void toggle(s.id)}
        >
          <i />
        </button>
      </div>
    );
  };

  const GroupHead = ({ label, n, which }: { label: string; n: number; which: "builtin" | "custom" }) => (
    <div className="a-group-head" onClick={() => setCollapsed((c) => ({ ...c, [which]: !c[which] }))}>
      <span>
        {label} <em>{n}</em>
      </span>
      <svg
        viewBox="0 0 12 12"
        className={collapsed[which] ? "caret" : "caret open"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 4.5L6 7.5l3-3" />
      </svg>
    </div>
  );

  return (
    <div className="a-settings-panel">
      <div className="a-skill-topline">
        Skill 定义了 AI 的工作流程和行为规范，开关打开的 Skill 会注入到系统提示词。已开启 {onCount} / 共 {skills.length}。
      </div>
      <div className="a-skill-toolbar">
        <div className="a-search">
          <svg viewBox="0 0 20 20" className="ic">
            <circle cx="9" cy="9" r="5.4" />
            <path d="M13 13l3.6 3.6" />
          </svg>
          <input
            placeholder="搜索 Skill"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
          />
        </div>
        <button className={onlyOn ? "a-toolbtn on" : "a-toolbtn"} onClick={() => setOnlyOn((v) => !v)}>
          已开启
        </button>
        <button className="a-toolbtn" onClick={() => onFlash("导入：将在后续批次提供（需要 ZIP 处理）")}>
          导入
        </button>
        <button className="a-toolbtn" onClick={() => onFlash("导出：将在后续批次提供（需要 ZIP 处理）")}>
          导出
        </button>
      </div>
      {flash ? <div className="a-flash">{flash}</div> : null}

      {builtin.length > 0 ? (
        <>
          <GroupHead label="内置" n={builtin.length} which="builtin" />
          {!collapsed.builtin && builtin.map((s) => <Row key={s.id} s={s} />)}
        </>
      ) : null}
      {custom.length > 0 ? (
        <>
          <GroupHead label="自定义" n={custom.length} which="custom" />
          {!collapsed.custom && custom.map((s) => <Row key={s.id} s={s} />)}
        </>
      ) : null}
      {skills.length === 0 ? (
        <div className="a-empty">
          技能清单为空。内置技能位于 Documents\skills\，首次扫描后将出现在这里。
        </div>
      ) : null}
    </div>
  );
}

/* ── 参数分节（真机：温度滑杆 + 系统提示词 + 上下文压缩） ── */
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
      <div className="a-card">
        <div className="a-card-head">
          <span className="a-card-title">温度</span>
          <span className="a-card-num">{form.temperature}</span>
        </div>
        <div className="a-card-desc">控制回复的随机性：越低越稳定确定，越高越多样随机。</div>
        <input
          className="a-slider"
          type="range"
          min={0}
          max={2}
          step={0.1}
          value={form.temperature}
          onChange={(e) => update("temperature", parseFloat(e.target.value))}
        />
      </div>

      <div className="a-card">
        <div className="a-card-head">
          <span className="a-card-title">系统提示词</span>
        </div>
        <div className="a-card-desc">自定义 AI 助手的行为，留空则使用默认的小说写作助手提示词。</div>
        <textarea
          className="a-textarea"
          value={form.systemPrompt}
          rows={5}
          onChange={(e) => update("systemPrompt", e.target.value)}
          spellCheck={false}
        />
      </div>

      <div className="a-card">
        <div className="a-card-head">
          <span className="a-card-title">上下文自动压缩</span>
        </div>
        <div className="a-card-desc">
          当对话内容超过设定阈值时，自动把更早的对话压缩成摘要，只影响发给 AI 的上下文，不删除聊天记录。
        </div>
        <div className="a-card-row">
          <span>启用自动压缩</span>
          <button
            className={form.autoClearContext ? "a-switch on" : "a-switch"}
            onClick={() => update("autoClearContext", !form.autoClearContext)}
          >
            <i />
          </button>
        </div>
        <div className="a-card-row">
          <span>
            上下文窗口 (K){" "}
            <svg viewBox="0 0 20 20" className="ic a-help">
              <circle cx="10" cy="10" r="7.5" />
              <path d="M10 13.6v.05" />
              <path d="M7.9 7.8a2.1 2.1 0 1 1 2.9 1.95c-.55.24-.8.6-.8 1.2" />
            </svg>
          </span>
          <input
            className="a-form-input a-num"
            type="number"
            min={1}
            value={Math.round(form.contextLimit / 1000)}
            onChange={(e) => update("contextLimit", (parseInt(e.target.value, 10) || 1000) * 1000)}
          />
        </div>
        <div className="a-card-row">
          <span>
            输出预留 (K){" "}
            <svg viewBox="0 0 20 20" className="ic a-help">
              <circle cx="10" cy="10" r="7.5" />
              <path d="M10 13.6v.05" />
              <path d="M7.9 7.8a2.1 2.1 0 1 1 2.9 1.95c-.55.24-.8.6-.8 1.2" />
            </svg>
          </span>
          <input
            className="a-form-input a-num"
            type="number"
            min={1}
            value={Math.round(form.reservedOutputTokens / 1000)}
            onChange={(e) => update("reservedOutputTokens", (parseInt(e.target.value, 10) || 16) * 1000)}
          />
        </div>
      </div>

      <div className="a-params-footer">
        <span className="a-form-hint">参数保存后立即生效，也可以按 Ctrl+S 保存</span>
        <button className="a-btn-primary" onClick={onSave} disabled={saving}>
          {saving ? "保存中..." : "保存参数"}
        </button>
        {saveMsg && (
          <span className={`a-save-msg ${saveMsg.includes("失败") ? "error" : ""}`}>{saveMsg}</span>
        )}
      </div>
    </div>
  );
}

/* ── 主题分节（真机：模式 + 强调色；色值取自真机截图像素采样） ── */
function ThemeSection({
  form,
  update,
  flash,
  onFlash,
}: {
  form: Prefs;
  update: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  flash: string;
  onFlash: (s: string) => void;
}) {
  const hex = useMemo(() => `#${(form.customAccentColor & 0xffffff).toString(16).padStart(6, "0")}`, [
    form.customAccentColor,
  ]);
  return (
    <div className="a-settings-panel">
      <div className="a-card">
        <div className="a-card-head">
          <span className="a-card-title">主题模式</span>
        </div>
        <div className="a-card-desc">跟随系统时自动适配 Windows 的深浅色设置。</div>
        <div className="a-seg">
          <button onClick={() => onFlash("跟随系统：暂不支持，已保持当前模式")}>跟随系统</button>
          <button
            className={!form.isDarkMode ? "on" : ""}
            onClick={() => update("isDarkMode", false)}
          >
            浅色
          </button>
          <button
            className={form.isDarkMode ? "on" : ""}
            onClick={() => update("isDarkMode", true)}
          >
            深色
          </button>
        </div>
        {flash ? <div className="a-flash">{flash}</div> : null}
      </div>

      <div className="a-card">
        <div className="a-card-head">
          <span className="a-card-title">主题颜色</span>
        </div>
        <div className="a-card-desc">界面强调色：按钮、链接、选中态等都会跟随变化。</div>
        <div className="a-swatches">
          {ACCENT_SWATCHES.map((argb) => {
            const c = `#${(argb & 0xffffff).toString(16).padStart(6, "0")}`;
            const on = c.toLowerCase() === hex.toLowerCase();
            return (
              <button
                key={c}
                className="a-swatch"
                style={{ background: c }}
                title={c}
                onClick={() => {
                  update("customAccentColor", argb);
                  document.documentElement.style.setProperty("--accent", c);
                }}
              >
                {on ? (
                  <svg viewBox="0 0 20 20" className="ic">
                    <path d="M4.5 10.5l3.5 3.5 7.5-8" />
                  </svg>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="a-form-actions">
        <button
          className="a-btn-primary"
          onClick={async () => {
            try {
              await savePrefs(form);
              onFlash("主题已保存");
            } catch (e) {
              onFlash(`保存失败：${e instanceof Error ? e.message : String(e)}`);
            }
          }}
        >
          保存主题
        </button>
      </div>
    </div>
  );
}

/* ── 同步分节（WebDAV / 局域网；传输层未实现，如实占位） ── */
function SyncSection({ flash, onFlash }: { flash: string; onFlash: (s: string) => void }) {
  const [tab, setTab] = useState<"cloud" | "lan">("cloud");
  return (
    <div className="a-settings-panel">
      <div className="a-card">
        <div className="a-seg wide">
          <button className={tab === "cloud" ? "on" : ""} onClick={() => setTab("cloud")}>
            云同步
          </button>
          <button className={tab === "lan" ? "on" : ""} onClick={() => setTab("lan")}>
            局域网同步
          </button>
        </div>
        <div className="a-card-desc">
          {tab === "cloud"
            ? "通过 WebDAV 把小说、技能、备忘录、会话与快照同步到云端。（传输层未实现，本分页为配置占位）"
            : "同一局域网内的两台设备通过 8917 端口互传数据。（传输层未实现，本分页为配置占位）"}
        </div>
        {flash ? <div className="a-flash">{flash}</div> : null}
        <div className="a-form-actions">
          <button className="a-toolbtn" onClick={() => onFlash("同步功能将在后续批次实现")}>
            同步
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── 数据分节（存储位置为真实路径；重置配置可用） ── */
function DataSection({
  form,
  flash,
  onFlash,
  askConfirm,
}: {
  form: Prefs;
  flash: string;
  onFlash: (s: string) => void;
  askConfirm: (title: string, body?: string, opts?: { danger?: boolean; confirmLabel?: string }) => Promise<boolean>;
}) {
  const boot = currentBoot();
  const dirs = boot?.dirs;
  const skillCount = form.skillList?.length ?? 0;
  return (
    <div className="a-settings-panel">
      <div className="a-card">
        <div className="a-card-head">
          <span className="a-card-title">数据管理</span>
        </div>
        <div className="a-card-desc">管理作品与 Skill 的存储位置，以及本地应用数据。</div>
        <div className="a-statbar">{dirs ? "作品与技能数据统计以目录实况为准" : ""}</div>
      </div>

      <div className="a-card">
        <div className="a-card-head">
          <span className="a-card-title">存储位置</span>
        </div>
        <div className="a-card-row col">
          <span className="a-path-label">小说作品目录</span>
          <span className="a-path">{dirs?.booksRoot ?? "（未加载）"}</span>
        </div>
        <div className="a-card-row col">
          <span className="a-path-label">Skill 目录</span>
          <span className="a-path">{dirs?.skillsDir ?? "（未加载）"}</span>
        </div>
        <div className="a-card-desc">
          当前统计：{skillCount} 个 Skill。{flash}
        </div>
      </div>

      <div className="a-card">
        <div className="a-card-head">
          <span className="a-card-title">备份与恢复</span>
        </div>
        <div className="a-card-desc">备份包含小说作品、Skill、备忘录、会话记录与快照，不含软件设置。建议定期导出，保存到网盘或移动硬盘。</div>
        <div className="a-form-actions">
          <button className="a-toolbtn" onClick={() => onFlash("导出全部数据：将在后续批次实现")}>
            导出全部数据
          </button>
          <button className="a-toolbtn" onClick={() => onFlash("从备份恢复：将在后续批次实现")}>
            从备份恢复
          </button>
        </div>
      </div>

      <div className="a-card danger">
        <div className="a-card-head">
          <span className="a-card-title">危险操作</span>
        </div>
        <div className="a-card-desc">清除软件配置（恢复默认设置），不会删除作品目录下的任何文件。</div>
        <div className="a-form-actions">
          <button
            className="a-btn-danger"
            onClick={() => {
              void (async () => {
                const ok = await askConfirm("清除软件配置？", "将恢复默认设置，不会删除作品目录下的任何文件。", { danger: true, confirmLabel: "重置" });
                if (!ok) return;
                try {
                  const { parsePrefs, serializePrefs, DEFAULT_PREFS } = await import("../core/prefs");
                  await savePrefs(parsePrefs(serializePrefs({ ...DEFAULT_PREFS })));
                  onFlash("配置已重置为默认（重启应用后完全生效）");
                } catch (e) {
                  onFlash(`重置失败：${e instanceof Error ? e.message : String(e)}`);
                }
              })();
            }}
          >
            重置数据
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── 关于分节（自更新按 CONTRACT §11 阻断：返回"已是最新"） ── */
function AboutSection({ flash, onFlash }: { flash: string; onFlash: (s: string) => void }) {
  return (
    <div className="a-settings-panel">
      <div className="a-about-hero">
        <div className="a-about-logo"><img src={logo} alt="" /></div>
        <h2>writerD</h2>
        <span className="a-version">版本 2.0.1</span>
        <p>你的 AI 小说写作助手</p>
      </div>

      <div className="a-card">
        <div className="a-card-head">
          <span className="a-card-title">帮助与维护</span>
        </div>
        <button className="a-list-row" onClick={() => onFlash("已是最新版本")}>
          <span>检查更新</span>
          <em>›</em>
        </button>
        <button className="a-list-row" onClick={() => onFlash("使用教程将在后续批次提供")}>
          <span>使用教程</span>
          <em>›</em>
        </button>
      </div>
      {flash ? <div className="a-flash">{flash}</div> : null}
    </div>
  );
}
