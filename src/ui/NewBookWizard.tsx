/**
 * 开书引导（新建作品的向导对话框）。
 *
 * 为什么有它：新建作品原本只弹一个书名输入框，建完就是一本 14 份
 * 「待填写」模板的空白书 —— 用户不知道第一步做什么。向导把开书最
 * 关键的几个问题（定位 → 世界与开局）在创建前问掉，答案经
 * core/store/onboarding 定向填进 01-开书定位 与 02-核心设定；
 * 用户也可以选「空白开书」直接跳过（与旧行为一致）。
 *
 * 纪律：
 *   · 所有问题都可留空 —— 留空字段保持模板「待填写」占位，不编造答案；
 *   · 书名是唯一必填项；非法/重名错误由 createProject 抛出，原样显示在向导里；
 *   · 本组件不碰磁盘：答案交给 onCreate，由 MainWorkbench 建作品并打开；
 *   · 无障碍与其它对话框同一套：role="dialog" + 焦点接管（useDialogFocus）+ Esc 取消。
 */

import { useEffect, useId, useRef, useState } from "react";
import { useDialogFocus } from "./useDialogFocus";
import { EMPTY_ONBOARDING, type OnboardingAnswers } from "../core/store/onboarding";

/** 开书方式：guided = 回答引导问题后创建；blank = 直接创建空白书 */
type Mode = "guided" | "blank";

interface Props {
  open: boolean;
  onCancel: () => void;
  /**
   * 提交创建：name 已 trim；answers 为 null 表示空白开书。
   * 返回 null 表示成功（向导自行关闭），返回字符串为错误文案（向导留在原地展示）。
   */
  onCreate: (name: string, answers: OnboardingAnswers | null) => Promise<string | null>;
}

export default function NewBookWizard({ open, onCancel, onCreate }: Props) {
  const [step, setStep] = useState(0); // 0 书名与方式 · 1 故事定位 · 2 世界与开局
  const [mode, setMode] = useState<Mode>("guided");
  const [name, setName] = useState("");
  const [answers, setAnswers] = useState<OnboardingAnswers>({ ...EMPTY_ONBOARDING });
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const titleId = useId();
  useDialogFocus(open, panelRef, nameRef);

  // 每次打开重置回初始状态（上次填到一半的内容不带进下一本书）
  useEffect(() => {
    if (!open) return;
    setStep(0);
    setMode("guided");
    setName("");
    setAnswers({ ...EMPTY_ONBOARDING });
    setError("");
    setCreating(false);
  }, [open]);

  // Esc = 取消（App 外壳见到 .qmodal 会让路，这里自己处理）
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.isComposing) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const set = (key: keyof OnboardingAnswers) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setAnswers((a) => ({ ...a, [key]: e.target.value }));

  /** 提交（空白开书 answers 传 null）；错误留在向导里展示，成功由父组件关闭 */
  const submit = async (withAnswers: boolean) => {
    if (creating) return;
    setCreating(true);
    setError("");
    const err = await onCreate(name.trim(), withAnswers ? answers : null);
    if (err) {
      setError(err);
      setCreating(false);
      // 书名类错误回第一步改名字（答案不丢）
      if (/书名|已存在|不能为空/.test(err)) setStep(0);
    }
  };

  const nameOk = name.trim() !== "";
  const STEPS = ["书名与方式", "故事定位", "世界与开局"];

  return (
    <div
      className="qmodal scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="qbox surface-raised sheet wide nbw"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={panelRef}
      >
        <h3 id={titleId}>新书启航</h3>

        {/* 步骤指示：文字 + 当前高亮，不只用颜色（完成态打勾） */}
        <div className="nbw-steps" aria-label={`第 ${step + 1} 步，共 ${mode === "guided" ? 3 : 1} 步`}>
          {STEPS.map((label, i) => {
            const reachable = mode === "guided" || i === 0;
            const cls = i === step ? "nbw-step on" : i < step ? "nbw-step done" : "nbw-step";
            return (
              <span key={label} className={reachable ? cls : "nbw-step off"}>
                <i>{i < step ? "✓" : i + 1}</i>
                {label}
              </span>
            );
          })}
        </div>

        {step === 0 ? (
          <>
            <label className="nbw-label" htmlFor="nbw-name">
              书名（必填，之后可改）
            </label>
            <input
              id="nbw-name"
              ref={nameRef}
              className="field"
              value={name}
              placeholder="输入作品名"
              spellCheck={false}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || e.key === "Process") return;
                if (e.key === "Enter" && nameOk) {
                  if (mode === "guided") setStep(1);
                  else void submit(false);
                }
              }}
            />
            <div className="nbw-modes" role="radiogroup" aria-label="开书方式">
              <button
                type="button"
                role="radio"
                aria-checked={mode === "guided"}
                className={mode === "guided" ? "nbw-mode on" : "nbw-mode"}
                onClick={() => setMode("guided")}
              >
                <span className="nbw-mode-name">引导开书（推荐）</span>
                <span className="nbw-mode-desc">
                  回答两步关键问题 —— 故事定位、世界与开局。答案直接写进「开书定位」与「核心设定」，
                  AI 从第一轮起就按你的方向工作。
                </span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={mode === "blank"}
                className={mode === "blank" ? "nbw-mode on" : "nbw-mode"}
                onClick={() => setMode("blank")}
              >
                <span className="nbw-mode-name">空白开书</span>
                <span className="nbw-mode-desc">
                  只生成 14 份基础模板（全部「待填写」），之后随时与 AI 讨论补齐。
                </span>
              </button>
            </div>
          </>
        ) : null}

        {step === 1 ? (
          <div className="nbw-grid">
            <label className="nbw-label">
              主类型与最想带给读者的感受
              <input
                className="field"
                value={answers.genre}
                placeholder="如：东方玄幻 · 逆袭与热血"
                spellCheck={false}
                onChange={set("genre")}
              />
            </label>
            <label className="nbw-label">
              目标平台与读者
              <input
                className="field"
                value={answers.audience}
                placeholder="如：起点男频 · 喜欢快节奏升级的读者"
                spellCheck={false}
                onChange={set("audience")}
              />
            </label>
            <label className="nbw-label span2">
              一句话故事
              <textarea
                className="field nbw-ta"
                value={answers.premise}
                placeholder="一句话讲清这本书讲什么（谁，在什么处境，要做什么）"
                spellCheck={false}
                onChange={set("premise")}
              />
            </label>
            <label className="nbw-label">
              主角是谁，当前最想做成什么
              <input
                className="field"
                value={answers.protagonist}
                placeholder="如：被逐出师门的少年，想夺回传承"
                spellCheck={false}
                onChange={set("protagonist")}
              />
            </label>
            <label className="nbw-label">
              不行动或失败会失去什么
              <input
                className="field"
                value={answers.stakes}
                placeholder="如：妹妹的救命药、最后的容身之处"
                spellCheck={false}
                onChange={set("stakes")}
              />
            </label>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="nbw-grid">
            <label className="nbw-label">
              时代、地点与本阶段环境
              <input
                className="field"
                value={answers.world}
                placeholder="如：架空古代 · 边陲小镇与宗门"
                spellCheck={false}
                onChange={set("world")}
              />
            </label>
            <label className="nbw-label">
              预计篇幅及依据
              <input
                className="field"
                value={answers.length}
                placeholder="如：200 万字长篇 · 升级线 + 多卷结构"
                spellCheck={false}
                onChange={set("length")}
              />
            </label>
            <label className="nbw-label span2">
              核心机制（关键能力、职业、技术或制度）
              <textarea
                className="field nbw-ta"
                value={answers.mechanism}
                placeholder="如：修仙境界体系 · 灵石资源 · 宗门晋升制度"
                spellCheck={false}
                onChange={set("mechanism")}
              />
            </label>
            <label className="nbw-label span2">
              核心冲突与结局方向
              <input
                className="field"
                value={answers.conflict}
                placeholder="如：与灭门仇家的对抗 · 结局登顶并揭开当年真相"
                spellCheck={false}
                onChange={set("conflict")}
              />
            </label>
            <label className="nbw-label span2">
              开局发生的具体事件
              <textarea
                className="field nbw-ta"
                value={answers.opening}
                placeholder="第一章开篇正在发生什么（越具体越好）"
                spellCheck={false}
                onChange={set("opening")}
              />
            </label>
          </div>
        ) : null}

        {step > 0 ? (
          <p className="nbw-hint">所有问题都可以留空 —— 留空项保留「待填写」，之后随时与 AI 讨论补齐。</p>
        ) : null}
        {error ? (
          <div className="a-flash error" role="alert">
            {error}
          </div>
        ) : null}

        <div className="nbw-actions">
          <button className="btn btn-quiet" onClick={onCancel} disabled={creating}>
            取消
          </button>
          <span className="nbw-actions-spacer" />
          {step === 0 ? (
            <button
              className="btn btn-accent"
              disabled={!nameOk || creating}
              onClick={() => (mode === "guided" ? setStep(1) : void submit(false))}
            >
              {mode === "guided" ? "下一步" : creating ? "创建中…" : "创建空白书"}
            </button>
          ) : (
            <>
              <button className="btn" onClick={() => setStep((s) => s - 1)} disabled={creating}>
                上一步
              </button>
              {step === 1 ? (
                <button className="btn" onClick={() => void submit(true)} disabled={creating}>
                  跳过剩余，直接创建
                </button>
              ) : null}
              <button
                className="btn btn-accent"
                disabled={creating}
                onClick={() => (step === 1 ? setStep(2) : void submit(true))}
              >
                {step === 1 ? "下一步" : creating ? "创建中…" : "完成并创建"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
