/**
 * 主工作台 —— DeepCompose「付印单」三栏实色布局。
 *
 * 布局：左 = 文件（作品选择 + 目录树）· 中 = 编辑器 · 右 = AI 对话。
 * 会话切换在对话面板顶部的下拉选择框里（没有独立的对话列表栏）。
 *
 * 左栏目录树固定保留三类内容：小说资料 / 章节内容 / 待确认
 * （它们同时是磁盘上的三个目录，类别由路径决定，不随 UI 变化）。
 *
 * 数据纪律（与存储层同一口径）：写前快照、操作日志、候选未采用不回写、
 * 用户手改是最高权威（回流只出报告，动文字必须过 question）。
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useMaximized } from "./useMaximized";
import { useDialogFocus } from "./useDialogFocus";
import { isNearBottom, springScrollCancel, springScrollToBottom } from "./motion";
import logo from "../assets/logo.png";
import { boot, applyAccentFromPrefs, applyThemeFromPrefs, currentBoot, savePrefs } from "../core/app";
import { getFs } from "../core/fsbridge";
import { PROJECT_DIRS, dirname, join } from "../core/dirs";
import {
  chapterLabelOf,
  createProject,
  kindForRel,
  loadProject,
  scanBooksRoot,
  type ContentNode,
  type FileKind,
  type FileRef,
  type ProjectData,
  type ProjectRef,
} from "../core/store/project";
import { parseChapterName, stripMd } from "../core/store/chapter";
import { appendOplog, diffLines, isLightEdit, type DiffResult } from "../core/store/oplog";
import { abortActiveStream, createTauriTransport } from "../core/ai/transport";
import { reloadIndex, send as sendChat, sendIsolated } from "../core/ai/controller";
import TitlebarWhale from "./TitlebarWhale";
import { ZERO_USAGE, addTotals, type UsageTotals } from "../core/usage/stats";
import {
  DEFAULT_THINKING_LEVEL,
  THINKING_STOPS,
  effectiveThinking,
  thinkingSupportedFor,
  type ThinkingLevel,
} from "../core/ai/thinking";
import { buildReflowPrompt, reflowSessionTitle } from "../core/ai/reflow";
import {
  COLD_READ_GOAL_LABEL,
  buildColdReadUserMessage,
  coldReadReportBody,
  coldReadReportRel,
  coldReadSessionTitle,
  coldReadSystem,
  type ColdReadGoal,
  type ColdReadPrior,
} from "../core/ai/coldread";
import type { AgentEvent } from "../core/ai/agent";
import type { QuestionItem } from "../core/tools/exec";
import {
  listSessions,
  loadSession,
  newSession,
  type SessionFile,
  type SessionListEntry,
} from "../core/store/session";
import { recordSnapshot } from "../core/store/snapshot";
import { scanSkills, mergeSkillList } from "../core/skills/scan";
import MemoModal from "./MemoModal";
import { ConfirmDialog, InputDialog, TypedConfirmDialog, type ConfirmRequest, type InputRequest, type TypedConfirmRequest } from "./Dialogs";
import RecycleBin from "./RecycleBin";
import { checkActivity, loadManifest, moveToRecycle } from "../core/store/recycle";
import { deleteSessionsForProject } from "../core/store/session";
import { dropCompressCache } from "../core/ai/compress";

interface OpenTab {
  /** 相对作品根路径（'\' 分隔） */
  rel: string;
  path: string;
  name: string;
  kind: FileKind;
  /** 打开时的磁盘内容（写前快照的 previousContent 来源） */
  baseContent: string;
  content: string;
  dirty: boolean;
  /** 正文/候选：是否处于用户编辑态（修改按钮开启） */
  editing: boolean;
  /** 进入编辑态时的内容（回流 diff 基线） */
  editBase: string | null;
}

/** 字数统计：统一按非空白字符计（与「文章总字数」口径一致） */
export function countWords(text: string): number {
  return text.replace(/\s/g, "").length;
}

/** 从工具结果 JSON 里取出错误文案（渲染用） */
export function extractError(result: string): string {
  try {
    const j = JSON.parse(result) as { error?: string };
    return j.error ?? "";
  } catch {
    return "";
  }
}

/** 会话相对时间（N 分钟前 / N 小时前 / 昨天 / 日期） */
export function relTime(ms: number, now = Date.now()): string {
  const diff = now - ms;
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < hour) return `${Math.max(1, Math.floor(diff / min))} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 2 * day) return "昨天";
  const d = new Date(ms);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 会话按日分组（今天 / 昨天 / 更早） */
export function groupSessions(
  sessions: SessionListEntry[],
  now = Date.now(),
): { label: string; items: SessionListEntry[] }[] {
  const day = 24 * 60 * 60_000;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const t0 = startOfToday.getTime();
  const groups: { label: string; items: SessionListEntry[] }[] = [
    { label: "今天", items: [] },
    { label: "昨天", items: [] },
    { label: "更早", items: [] },
  ];
  for (const s of sessions) {
    const ms = s.mtimeMs ?? 0;
    if (ms >= t0) groups[0].items.push(s);
    else if (ms >= t0 - day) groups[1].items.push(s);
    else groups[2].items.push(s);
  }
  return groups.filter((g) => g.items.length > 0);
}

/** 目录树默认开合：全部展开，「已处理」归档默认折叠 */
function defaultTreeFolders(tree: ContentNode[], acc: Record<string, boolean> = {}): Record<string, boolean> {
  for (const n of tree) {
    if (n.isDir) {
      acc[n.rel] = n.name !== PROJECT_DIRS.processed;
      defaultTreeFolders(n.children, acc);
    }
  }
  return acc;
}

/** 点击弹层外部 / Esc 时收起（会话下拉与作品下拉共用） */
function useDismiss(active: boolean, ref: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!active) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.isComposing) close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [active, ref, close]);
}

/** 「写下一章」一键指令（单主线；采用与回写另走采用门） */
export const WRITE_NEXT_MESSAGE =
  "请按 novel-writer 主线写下一章候选：先读 小说资料/00-项目状态.md 恢复状态；" +
  "按 小说资料/05-滚动细纲.md 检索本章需要的最小资料（相关人物、地点、物品、时间、资源、伏笔），不默认读整本书；" +
  "完成 完整初稿 → 逐段修改 → 全文复读；把初稿与唯一最新候选写入 待确认/（第N章-v1-初稿.md、第N章-v2-候选.md，N 为下一章节号）；" +
  "更新 00-项目状态 的候选指针与进度后交付，只报题目与完成状态，不附自评。先不采用、不回写正式追踪表。";

/** 对话空态的快捷提示（点击预填输入框，用户可改后再发送） */
const STARTER_TIPS: { label: string; text: string }[] = [
  { label: "补齐开书材料", text: "请读 小说资料/00-项目状态.md 和 01-开书定位.md，逐项和我讨论待填写内容，讨论清楚后再整理进文件，关键方向不确定的保留为候选。" },
  { label: "写下一章候选", text: WRITE_NEXT_MESSAGE },
  { label: "续补滚动细纲", text: "请按 05-滚动细纲 的规则，把细纲续补到接下来 5—12 章：先列出你计划细排的章节范围和依据，经我确认后再写入文件。" },
  { label: "总结我的改稿习惯", text: "请读 小说资料/个人改稿/ 下的改稿对比记录和 writerd_oplog 日志，归纳我跨章重复出现的改稿判断，逐条列出并用 question 请我确认；确认的条目合并进 06-写作规则.md 的「个人文风（学习沉淀）」节，不复制我的原句。" },
];

/** 「采用为正文」一键指令（采用门 → 采用回写；N 由 AI 按候选章号解析） */
export function adoptMessage(pendingRel: string): string {
  const rel = pendingRel.replace(/\\/g, "/");
  return (
    `【采用门】我采用 ${rel} 作为该候选对应章节的最终稿。请执行采用回写：` +
    `1) 在 小说资料/00-项目状态.md 登记采用版本并把回写标为进行中；` +
    `2) 把最终稿保存为 章节内容/第N章.md（N 取该候选章号）；` +
    `3) 只按最终稿增量更新受影响的追踪表与章节摘要（节内替换，注明来源章节）；` +
    `4) 逐项核对后清除待办，把本章初稿与候选移入 待确认/已处理/ 留档并清候选指针；` +
    `5) 全部成功后标记完成并推进当前章节。中断先补余项，不重复累计，全部核对成功前不写新章。`
  );
}

/** 标签是否处于可输入状态：资料永远可编辑；正文/候选仅在用户点了「修改」后可编辑 */
export function tabEditable(t: OpenTab): boolean {
  return t.kind === "doc" || t.editing;
}

export default function MainWorkbench({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [projects, setProjects] = useState<ProjectRef[]>([]);
  const [project, setProject] = useState<ProjectData | null>(null);
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeRel, setActiveRel] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  // ── 面板与目录状态（可见性持久化到 prefs 面板键） ──
  const [showFiles, setShowFiles] = useState(true);
  const [showChat, setShowChat] = useState(true);
  const [bookMenu, setBookMenu] = useState(false);
  const [sessMenu, setSessMenu] = useState(false);
  /** 目录树文件夹开合（key = 目录相对路径；缺省视为展开，「已处理」默认折叠） */
  const [treeFolders, setTreeFolders] = useState<Record<string, boolean>>({});
  /** 冷读对话框请求与选项 */
  const [coldReq, setColdReq] = useState<{ tab: OpenTab } | null>(null);
  const [coldPrior, setColdPrior] = useState<0 | 1 | 2>(1);
  const [coldGoal, setColdGoal] = useState<ColdReadGoal>("clarity");
  const fileselRef = useRef<HTMLDivElement | null>(null);
  const sessRef = useRef<HTMLDivElement | null>(null);
  useDismiss(bookMenu, fileselRef, () => setBookMenu(false));
  useDismiss(sessMenu, sessRef, () => setSessMenu(false));

  // ── 对话状态 ──
  const [session, setSession] = useState<SessionFile | null>(null);
  const [sessions, setSessions] = useState<SessionListEntry[]>([]);
  const [composer, setComposer] = useState("");
  const [busy, setBusy] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [streamThink, setStreamThink] = useState("");
  const [toolLog, setToolLog] = useState<{ name: string; status: "run" | "ok" | "bad" }[]>([]);
  const [chatError, setChatError] = useState<string | null>(null);
  /** 截断提示（非错误：正文已落盘可用，只是可能少了个尾巴） */
  const [truncNote, setTruncNote] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    items: QuestionItem[];
    resolve: (a: string[][]) => void;
  } | null>(null);
  const [qSel, setQSel] = useState<Record<number, string[]>>({});
  const chatBottom = useRef<HTMLDivElement | null>(null);
  const chatScroll = useRef<HTMLDivElement | null>(null);
  /** 是否自动跟随到最新一条：用户往上翻时置 false，翻回底部再置 true */
  const pinned = useRef(true);
  const abortRef = useRef<{ aborted: boolean }>({ aborted: false });
  /** 挂起中的 question 弹窗（停止生成时强制空选择收尾，避免弹窗残留卡住 agent 循环） */
  const pendingQuestionRef = useRef<{ items: QuestionItem[]; resolve: (v: string[][]) => void } | null>(null);
  const transport = useMemo(() => createTauriTransport(), []);
  /** busy 的 ref 镜像（回流排队判断用，避开闭包过期） */
  const busyRef = useRef(false);
  /** 回流任务队列（单生成并发：忙时排队，空闲即跑） */
  const reflowQueue = useRef<{ prompt: string; title: string }[]>([]);

  // ── 备忘录与应用内对话框 ──
  const [memoOpen, setMemoOpen] = useState(false);
  const [inputReq, setInputReq] = useState<InputRequest | null>(null);
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);
  const [typedReq, setTypedReq] = useState<TypedConfirmRequest | null>(null);
  /** 回收站模态 + 条目数（书下拉菜单的角标） */
  const [recycleOpen, setRecycleOpen] = useState(false);
  const [recycleItems, setRecycleItems] = useState(0);

  /** 应用内输入框（替代 window.prompt；resolve 时同步关闭对话框） */
  const askText = useCallback(
    (title: string, placeholder?: string) =>
      new Promise<string | null>((resolve) => {
        setInputReq({
          title,
          placeholder,
          resolve: (v) => {
            setInputReq(null);
            resolve(v);
          },
        });
      }),
    [],
  );
  const askConfirm = useCallback(
    (title: string, body?: string, opts?: { danger?: boolean; confirmLabel?: string }) =>
      new Promise<boolean>((resolve) => {
        setConfirmReq({
          title,
          body,
          ...opts,
          resolve: (ok) => {
            setConfirmReq(null);
            resolve(ok);
          },
        });
      }),
    [],
  );

  /** 手打名字确认（彻底删除/清空回收站；不拿到一致的名字就不给确认键） */
  const askTypedConfirm = useCallback(
    (title: string, body: string, expected: string, confirmLabel?: string, noun?: string) =>
      new Promise<boolean>((resolve) => {
        setTypedReq({
          title,
          body,
          expected,
          noun,
          confirmLabel,
          resolve: (ok) => {
            setTypedReq(null);
            resolve(ok);
          },
        });
      }),
    [],
  );

  const dirs = currentBoot()?.dirs ?? null;

  const activeTab = useMemo(() => tabs.find((t) => t.rel === activeRel) ?? null, [tabs, activeRel]);

  // 字号与模型（prefs 直读；设置屏保存后返回主界面时组件重挂载即生效）
  const bootPrefs = ready ? currentBoot()?.prefs ?? null : null;
  const editorFontSize = bootPrefs?.editorFontSize ?? 15;
  const chatFontSize = bootPrefs?.chatFontSize ?? 15;
  const modelLabel = bootPrefs?.model?.trim() || "未配置模型";
  const hasKey = Boolean(bootPrefs?.apiKey?.trim());

  /**
   * 会话级思考档位（D-011）：`null` = 跟随配置默认；一旦用户在本会话里选过就是临时值，
   * **只存内存**（不写会话文件、不碰磁盘契约），换会话/重启即回到配置默认。
   */
  const [thinkLevel, setThinkLevel] = useState<ThinkingLevel | null>(null);
  const [thinkOpen, setThinkOpen] = useState(false);
  const thinkSupported = bootPrefs ? thinkingSupportedFor(bootPrefs) : false;
  const thinkEffective = bootPrefs ? effectiveThinking(bootPrefs, thinkLevel) : DEFAULT_THINKING_LEVEL;
  const thinkStop = THINKING_STOPS.find((s) => s.level === thinkEffective) ?? THINKING_STOPS[2];

  /**
   * 「本次会话累计」（D-019）：按会话 id 存内存，切会话即显示那一份，重启即尽。
   * 不落盘 —— 会话文件是冻结契约，统计是旁路数据（真要持久化也应进 usage_stats.json）。
   */
  const [usageBySession, setUsageBySession] = useState<Record<string, UsageTotals>>({});
  const sessionUsage = session ? usageBySession[session.id] ?? ZERO_USAGE : ZERO_USAGE;

  /** 鲸鱼「闲置时停下游动」（D-030）：先本地回显，再落盘 */
  const [idlePauseLocal, setIdlePauseLocal] = useState<boolean | null>(null);
  const effIdlePause = idlePauseLocal ?? bootPrefs?.whaleIdlePause ?? true;
  const toggleIdlePause = useCallback((next: boolean) => {
    setIdlePauseLocal(next);
    const b = currentBoot();
    if (b) void savePrefs({ ...b.prefs, whaleIdlePause: next });
  }, []);

  // 生成中收起档位浮层：它悬在输入框上方，跑起来就挡字了
  useEffect(() => {
    if (busy) setThinkOpen(false);
  }, [busy]);

  /** 保存单个标签（写前快照 + 落盘 + oplog；不弹确认——3.0 起自动保存） */
  const saveTabAs = useCallback(
    async (tab: OpenTab, note?: string): Promise<boolean> => {
      if (tab.content === tab.baseContent && !tab.dirty) return true;
      try {
        const fs = getFs();
        const b = currentBoot();
        // 写前快照（硬约束：手动保存与工具回写同纪律）
        if (b) {
          await recordSnapshot(fs, b.dirs.snapshotsDir, {
            sessionId: session?.id ?? "manual-edits",
            callId: `manual_${Date.now()}`,
            operation: "write",
            relativePath: tab.rel.replace(/\\/g, "/"),
            previousContent: tab.baseContent,
            previousExists: true,
            previousType: "file",
          });
        }
        await fs.writeText(tab.path, tab.content);
        setTabs((prev) =>
          prev.map((t) => (t.rel === tab.rel ? { ...t, baseContent: t.content, dirty: false } : t)),
        );
        if (project) {
          await appendOplog(fs, project.ref.root, "save", tab.rel, session?.id ?? "", note ? { note } : {});
        }
        return true;
      } catch (e) {
        setStatus(`保存失败：${String(e)}`);
        return false;
      }
    },
    [project, session],
  );

  /** 切作品/关窗：自动保存所有脏标签；编辑态补记 edit_end（回流顺延，不在关闭时跑 AI） */
  const autoSaveAllTabs = useCallback(async () => {
    const fs = getFs();
    for (const t of tabs) {
      if (t.dirty) await saveTabAs(t, "自动保存");
      if (t.editing && t.editBase !== null && project) {
        const diff = diffLines(t.editBase, t.content);
        await appendOplog(fs, project.ref.root, "edit_end", t.rel, session?.id ?? "", {
          changedChars: diff.changedChars,
          addedLines: diff.added.length,
          removedLines: diff.removed.length,
          digitsChanged: diff.digitsChanged,
          reflowTriggered: false,
          note: "窗口关闭或切换作品：已自动保存，回流顺延（可稍后再点一次修改/完成或让 AI 总结改稿）",
        });
      }
    }
  }, [tabs, project, session, saveTabAs]);

  /** 装配数据：载入作品（不改 prefs；启动恢复与 openProject 共用） */
  const openProjectRef = useCallback(
    async (ref: ProjectRef) => {
      await autoSaveAllTabs();
      const fs = getFs();
      const data = await loadProject(fs, ref.root, ref.name);
      setProject(data);
      setTabs([]);
      setActiveRel(null);
      setTreeFolders(defaultTreeFolders(data.tree));
      setStatus(`${ref.name}：${data.chapters.length} 章 / ${data.pending.length} 待确认 / ${data.docs.length} 份资料`);
      await appendOplog(fs, ref.root, "switch_project", "", session?.id ?? "");
    },
    [autoSaveAllTabs, session],
  );

  /** 首次启动：装配桥与目录，扫描作品 + 技能；恢复上次打开的作品与面板可见性 */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const b = await boot();
        applyAccentFromPrefs(b.prefs);
        applyThemeFromPrefs(b.prefs);
        if (!alive) return;
        setShowFiles(b.prefs.panelShowDirectory);
        setShowChat(b.prefs.panelShowSession);
        const fs = getFs();
        const list = await scanBooksRoot(fs, b.dirs.booksRoot);
        if (!alive) return;
        setProjects(list);
        setReady(true);
        setStatus(`作品根：${b.dirs.booksRoot}`);
        const last = b.prefs.currentNovelProject?.trim();
        if (last) {
          const ref = list.find((p) => p.root.toLowerCase() === last.toLowerCase());
          if (ref) await openProjectRef(ref);
        }
        // 技能扫描（只读）：skill_list 为空或目录有变化时刷新
        try {
          const scanned = await scanSkills(fs, b.dirs.skillsDir);
          if (scanned.length > 0) {
            const { skillList, activeSkillIds } = mergeSkillList(b.prefs.skillList, scanned, b.prefs.activeSkillIds);
            if (JSON.stringify(skillList) !== JSON.stringify(b.prefs.skillList)) {
              await savePrefs({ ...b.prefs, skillList, activeSkillIds });
            }
          }
        } catch {
          // 技能扫描失败不阻断启动
        }
      } catch (e) {
        if (alive) setError(String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshProjects = useCallback(async () => {
    if (!dirs) return;
    const fs = getFs();
    setProjects(await scanBooksRoot(fs, dirs.booksRoot));
  }, [dirs]);

  const openProject = useCallback(
    async (ref: ProjectRef) => {
      setBookMenu(false);
      await autoSaveAllTabs();
      const fs = getFs();
      const data = await loadProject(fs, ref.root, ref.name);
      setProject(data);
      setTabs([]);
      setActiveRel(null);
      setTreeFolders(defaultTreeFolders(data.tree));
      setStatus(`${ref.name}：${data.chapters.length} 章 / ${data.pending.length} 待确认 / ${data.docs.length} 份资料`);
      await appendOplog(fs, ref.root, "switch_project", "", session?.id ?? "");
      const b = currentBoot();
      if (b && b.prefs.currentNovelProject !== ref.root) {
        const next = { ...b.prefs, currentNovelProject: ref.root };
        void savePrefs(next);
      }
    },
    [autoSaveAllTabs, session],
  );

  /** 面板开关（可见性写回 prefs 面板键，重启后保持） */
  const toggleFiles = useCallback(() => {
    const next = !showFiles;
    setShowFiles(next);
    const b = currentBoot();
    if (b && b.prefs.panelShowDirectory !== next) void savePrefs({ ...b.prefs, panelShowDirectory: next });
  }, [showFiles]);

  const toggleChat = useCallback(() => {
    const next = !showChat;
    setShowChat(next);
    const b = currentBoot();
    if (b && b.prefs.panelShowSession !== next) void savePrefs({ ...b.prefs, panelShowSession: next });
  }, [showChat]);

  const openFile = useCallback(
    async (ref: FileRef, kind: FileKind) => {
      if (!project) return;
      const fs = getFs();
      const existing = tabs.find((t) => t.rel === ref.rel);
      if (existing) {
        setActiveRel(ref.rel);
        return;
      }
      // 资料单槽一读：打开任何新文件前，旧资料标签自动保存并销毁（正文/候选不占资料槽）
      const docTab = tabs.find((t) => t.kind === "doc");
      if (docTab) {
        if (docTab.dirty) await saveTabAs(docTab, "资料单槽切换自动保存");
        setTabs((prev) => prev.filter((t) => t.kind !== "doc"));
      }
      let content = "";
      try {
        content = await fs.readText(ref.path);
      } catch (e) {
        setStatus(`打开失败：${String(e)}`);
        return;
      }
      setTabs((prev) => [
        ...prev,
        { rel: ref.rel, path: ref.path, name: ref.name, kind, baseContent: content, content, dirty: false, editing: false, editBase: null },
      ]);
      setActiveRel(ref.rel);
      await appendOplog(fs, project.ref.root, "open", ref.rel, session?.id ?? "");
    },
    [project, tabs, saveTabAs, session],
  );

  const editContent = useCallback(
    (text: string) => {
      setTabs((prev) =>
        prev.map((t) => (t.rel === activeRel && tabEditable(t) ? { ...t, content: text, dirty: true } : t)),
      );
    },
    [activeRel],
  );

  const saveActive = useCallback(async () => {
    if (!activeTab || !tabEditable(activeTab)) return;
    setSaving(true);
    const ok = await saveTabAs(activeTab);
    if (ok) setStatus(`已保存 ${activeTab.name} · ${countWords(activeTab.content)} 字`);
    setSaving(false);
  }, [activeTab, saveTabAs]);

  /** Ctrl+S 保存（仅可编辑态） */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveActive();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveActive]);

  /** 关窗守卫：自动保存全部脏标签与编辑态（3.0 语义：不丢稿、不询问） */
  useEffect(() => {
    let disposed = false;
    const unlistenP = getCurrentWindow().onCloseRequested(async (event) => {
      if (!tabs.some((t) => t.dirty || t.editing)) return; // 无未保存内容放行
      event.preventDefault();
      await autoSaveAllTabs();
      if (!disposed) await getCurrentWindow().destroy();
    });
    return () => {
      disposed = true;
      void unlistenP.then((fn) => fn());
    };
  }, [tabs, autoSaveAllTabs]);

  const newProject = useCallback(async () => {
    if (!dirs) return;
    const name = await askText("新书名称", "输入作品名");
    if (!name) return;
    try {
      const ref = await createProject(getFs(), dirs.booksRoot, name);
      await refreshProjects();
      await openProject(ref);
    } catch (e) {
      setStatus(`新建失败：${String(e)}`);
    }
  }, [dirs, refreshProjects, openProject, askText]);

  /** 回收站条目数（书下拉菜单角标）；读不到按 0，不让角标拖垮主界面 */
  const refreshRecycleCount = useCallback(async () => {
    if (!dirs) return;
    try {
      setRecycleItems((await loadManifest(getFs(), dirs.booksRoot)).items.length);
    } catch {
      setRecycleItems(0);
    }
  }, [dirs]);

  useEffect(() => {
    void refreshRecycleCount();
  }, [refreshRecycleCount, projects]);

  /**
   * 移入回收站（两段式删除的第一段：可还原）。
   *
   * 三道门在动作前：
   *   ① 活动门（checkActivity）—— 正在生成 / 当前会话属于它 / 编辑器开着它的文件，一律先拒绝；
   *   ② 名字门（moveToRecycle 内的 childNameProblem + 作品根直接子项校验）；
   *   ③ 用户确认（说清楚"可还原"和"会话不跟着回来"）。
   * 彻底删除的门在回收站里（四道门 + 手打名字），见 RecycleBin。
   */
  const recycleProject = useCallback(
    async (ref: ProjectRef) => {
      if (!dirs) return;
      const fs = getFs();
      const block = checkActivity(
        {
          busy: busyRef.current,
          sessionProjectPath: session?.projectPath ?? null,
          openFilePath: activeTab?.path ?? null,
        },
        ref.root,
      );
      if (block) {
        setStatus(`不能删除「${ref.name}」：${block}`);
        return;
      }
      const ok = await askConfirm(
        "移入回收站？",
        `「${ref.name}」会移到回收站，可以还原。它的会话记录会一并删除 —— 还原作品不会带回这些会话。`,
        { danger: true, confirmLabel: "移入回收站" },
      );
      if (!ok) return;
      try {
        await moveToRecycle(fs, dirs.booksRoot, { name: ref.name, originalPath: ref.root });
        const gone = await deleteSessionsForProject(fs, dirs.sessionsDir, ref.root);
        // 会话没了，AI 侧的压缩检查点缓存也要跟着放掉（KL-AI-11）
        for (const id of gone.ids) dropCompressCache(id);
        // 原版文案就是「已移至回收站，并删除 N 个会话」，N 为 0 时不画蛇添足
        setStatus(gone.count > 0 ? `已移至回收站，并删除 ${gone.count} 个会话` : "已移至回收站");
        // 删掉的正是当前作品：清空工作台，别停在一棵已经不存在的树上
        if (project?.ref.root.toLowerCase() === ref.root.toLowerCase()) {
          setProject(null);
          setTabs([]);
          setActiveRel(null);
          setTreeFolders({});
          setSession(newSession(""));
        }
        await refreshProjects();
        await refreshRecycleCount();
      } catch (e) {
        setStatus(`移至回收站失败：${String(e instanceof Error ? e.message : e)}`);
      }
    },
    [dirs, session, activeTab, project, askConfirm, refreshProjects, refreshRecycleCount],
  );

  /** 继续写作：优先打开最新候选稿，其次第一章、第一份资料（无作品则提示） */
  const continueWriting = useCallback(async () => {
    if (!project) {
      setStatus("请先在左侧文件面板选择作品");
      return;
    }
    const target =
      project.pending[project.pending.length - 1] ?? project.chapters[project.chapters.length - 1] ?? project.docs[0];
    if (!target) {
      setStatus(`${project.ref.name} 还没有章节或资料`);
      return;
    }
    await openFile(target, kindForRel(target.rel));
  }, [project, openFile]);

  const win = getCurrentWindow();
  const maxed = useMaximized();

  const refreshSessions = useCallback(async () => {
    const b = currentBoot();
    if (!b) return;
    const idx = await reloadIndex(b.dirs);
    setSessions(listSessions(idx, project?.ref.root ?? null));
  }, [project]);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  /** question 工具 → 界面弹窗 */
  const askQuestions = useCallback(
    (items: QuestionItem[]) =>
      new Promise<string[][]>((resolve) => {
        // 包装 resolve：无论正常提交还是「停止生成」强制收尾，都先清挂起引用
        const wrapped = (v: string[][]) => {
          pendingQuestionRef.current = null;
          resolve(v);
        };
        pendingQuestionRef.current = { items, resolve: wrapped };
        setQSel({});
        setPending({ items, resolve: wrapped });
      }),
    [],
  );

  const onAgentEvent = useCallback((e: AgentEvent) => {
    switch (e.type) {
      case "thinking_delta":
        setStreamThink((t) => t + e.text);
        break;
      case "text_delta":
        setStreamText((t) => t + e.text);
        break;
      case "tool_started":
        setToolLog((l) => [...l, { name: e.call.name, status: "run" }]);
        break;
      case "tool_completed":
        setToolLog((l) => {
          const next = [...l];
          const i = next.findIndex((x) => x.name === e.call.name && x.status === "run");
          const bad = (e.call.result ?? "").includes('"error"');
          if (i >= 0) next[i] = { name: e.call.name, status: bad ? "bad" : "ok" };
          return next;
        });
        break;
      case "error":
        setChatError(e.message);
        break;
      default:
        break;
    }
  }, []);

  /** 重载作品索引（保留用户的文件夹开合，新目录按默认规则） */
  const refreshProject = useCallback(async () => {
    if (!project) return;
    const fs = getFs();
    const data = await loadProject(fs, project.ref.root, project.ref.name);
    setProject(data);
    setTreeFolders((f) => ({ ...defaultTreeFolders(data.tree), ...f }));
  }, [project]);

  /** 回流队列排空：专属会话运行（不切换用户当前视图）；单生成并发 */
  const drainReflow = useCallback(async () => {
    if (busyRef.current || reflowQueue.current.length === 0) return;
    const b = currentBoot();
    if (!b || !project) return;
    busyRef.current = true;
    setBusy(true);
    try {
      while (reflowQueue.current.length > 0) {
        const task = reflowQueue.current.shift()!;
        setStatus(`回流运行中：${task.title}（报告见会话列表）`);
        const reflowSession: SessionFile = { ...newSession(project.ref.root), title: task.title };
        try {
          await sendChat({
            dirs: b.dirs,
            prefs: b.prefs,
            session: reflowSession,
            projectRoot: project.ref.root,
            userText: task.prompt,
            transport,
            askQuestions,
            signal: abortRef.current,
            // 回流是后台整理任务：强制关闭思考（不需要推理，也不该为此付费）
            thinking: "off",
          });
          await appendOplog(getFs(), project.ref.root, "reflow", "", reflowSession.id, { note: task.title });
          setStatus(`回流完成：${task.title}（审稿报告与学习记录已落盘）`);
        } catch (e) {
          setStatus(`回流失败：${String(e)}`);
        }
        await refreshSessions();
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
      await refreshProject();
    }
  }, [project, transport, askQuestions, refreshSessions, refreshProject]);

  /** 「修改/完成」按钮：正文与候选默认只读，点击后进入/结束编辑态 */
  const toggleEditing = useCallback(
    async (tab: OpenTab) => {
      if (tab.kind === "doc") return;
      const fs = getFs();
      if (!tab.editing) {
        setTabs((prev) =>
          prev.map((t) => (t.rel === tab.rel ? { ...t, editing: true, editBase: t.content } : t)),
        );
        if (project) await appendOplog(fs, project.ref.root, "edit_start", tab.rel, session?.id ?? "");
        setStatus(`正在编辑 ${tab.name}（点「完成」保存并触发回流审稿）`);
        return;
      }
      // 结束编辑：自动保存 → 轻改仅记日志，实质改动触发回流
      const latest = tabs.find((t) => t.rel === tab.rel) ?? tab;
      if (latest.dirty) await saveTabAs(latest, "结束编辑自动保存");
      const diff: DiffResult = diffLines(latest.editBase ?? latest.baseContent, latest.content);
      setTabs((prev) => prev.map((t) => (t.rel === tab.rel ? { ...t, editing: false, editBase: null } : t)));
      if (!project) return;
      const noChange = diff.changedChars === 0;
      const light = noChange || isLightEdit(diff);
      const kind = latest.kind === "candidate" ? "candidate" : "chapter";
      const label = chapterLabelOf(latest.name);
      await appendOplog(fs, project.ref.root, "edit_end", latest.rel, session?.id ?? "", {
        changedChars: diff.changedChars,
        addedLines: diff.added.length,
        removedLines: diff.removed.length,
        digitsChanged: diff.digitsChanged,
        reflowTriggered: !light,
      });
      if (noChange) {
        setStatus(`${latest.name} 无实质改动，已退出编辑`);
        return;
      }
      if (light) {
        setStatus(`${latest.name} 已保存 · 改动较小未触发回流（已记录日志）`);
        return;
      }
      reflowQueue.current.push({
        prompt: buildReflowPrompt({
          relPath: latest.rel.replace(/\\/g, "/"),
          kind,
          chapterLabel: label,
          diff,
        }),
        title: reflowSessionTitle(label, kind),
      });
      setStatus(`${latest.name} 已保存，回流排队中…`);
      void drainReflow();
    },
    [tabs, project, session, saveTabAs, drainReflow],
  );

  /** 关闭标签：自动保存；编辑态先走「完成」（保存 + 回流），不再询问 */
  const closeTab = useCallback(
    async (rel: string) => {
      const tab = tabs.find((t) => t.rel === rel);
      if (!tab) return;
      if (tab.editing) await toggleEditing(tab);
      else if (tab.dirty) await saveTabAs(tab, "关闭标签自动保存");
      setTabs((prev) => {
        const next = prev.filter((t) => t.rel !== rel);
        if (activeRel === rel) setActiveRel(next.length ? next[next.length - 1].rel : null);
        return next;
      });
    },
    [tabs, activeRel, toggleEditing, saveTabAs],
  );

  /** 发送一条用户消息（输入框与一键指令共用；单生成并发由 busyRef 守卫） */
  const sendUserMessage = useCallback(
    async (raw: string) => {
      const b = currentBoot();
      const text = raw.trim();
      if (!b || text === "" || busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setChatError(null);
      setTruncNote(null);
      setStreamText("");
      setStreamThink("");
      setToolLog([]);
      setComposer("");
      const signal = { aborted: false };
      abortRef.current = signal;
      try {
        const res = await sendChat({
          dirs: b.dirs,
          prefs: b.prefs,
          session,
          projectRoot: project?.ref.root ?? null,
          userText: text,
          transport,
          onEvent: onAgentEvent,
          askQuestions,
          signal,
          // 会话级临时档位（null = 配置默认）；平台不支持时由 providerOf 统一过滤掉
          thinking: thinkLevel,
        });
        setSession(res.session);
        // 会话级累计用量（面板第二块）：把本次运行的合计并进该会话
        const sid = res.session.id;
        setUsageBySession((m) => ({ ...m, [sid]: addTotals(m[sid] ?? ZERO_USAGE, res.usage) }));
        if (res.error) setChatError(res.error);
        // 截断必须明说：否则用户会把"写到一半停住"当成模型写完
        setTruncNote(
          res.truncated
            ? "本轮回复撞到最大输出长度（max_tokens）上限，末尾可能被截断。可在「设置 → AI 提供商」里调大最大输出长度，或让它分段继续写。"
            : null,
        );
        await refreshSessions();
        if (project) {
          const fs = getFs();
          const data = await loadProject(fs, project.ref.root, project.ref.name);
          setProject(data);
          setTreeFolders((f) => ({ ...defaultTreeFolders(data.tree), ...f }));
        }
      } catch (err) {
        setChatError(String(err));
      } finally {
        busyRef.current = false;
        setBusy(false);
        setStreamText("");
        setStreamThink("");
        setToolLog([]);
        void drainReflow(); // 生成槽空出后排空待跑回流
      }
    },
    [session, project, transport, onAgentEvent, askQuestions, refreshSessions, drainReflow, thinkLevel],
  );

  const doSend = useCallback(() => sendUserMessage(composer), [sendUserMessage, composer]);

  /** 采用门：确认后由 AI 执行采用回写五步（登记→保存正文→增量回写→逐项核对→归档推进） */
  const adoptCandidate = useCallback(
    async (tab: OpenTab) => {
      if (!project) return;
      if (busyRef.current) {
        setStatus("当前有生成任务在跑，请等它结束后再采用");
        return;
      }
      const ok = await askConfirm(
        "采用为正式正文？",
        `将「${tab.name}」采用为最终稿：AI 会登记采用版本、保存正式正文、按最终稿增量回写追踪表与章节摘要，并把本章旧稿移入 待确认\\已处理 留档、推进章节指针。`,
        { confirmLabel: "采用并回写" },
      );
      if (!ok) return;
      await appendOplog(getFs(), project.ref.root, "adopt", tab.rel, session?.id ?? "");
      await sendUserMessage(adoptMessage(tab.rel));
    },
    [project, session, askConfirm, sendUserMessage],
  );

  /** 冷读：独立会话（零工具、零设定、零作者上下文），报告自动存入 小说资料\审核\ */
  const runColdRead = useCallback(
    async (tab: OpenTab, priorCount: 0 | 1 | 2, goal: ColdReadGoal) => {
      const b = currentBoot();
      if (!b || !project) return;
      if (busyRef.current) {
        setStatus("当前有生成任务在跑，请稍后再冷读");
        return;
      }
      setColdReq(null);
      const fs = getFs();
      const label = chapterLabelOf(tab.name) ?? stripMd(tab.name);
      // 前文：从正式正文取章号在前的 priorCount 章（缺章跳过，不阻断冷读）
      const no = parseChapterName(stripMd(tab.name))?.no ?? 0;
      const priors: ColdReadPrior[] = [];
      if (priorCount > 0 && no > 0) {
        for (let i = Math.max(1, no - priorCount); i < no; i++) {
          const c = project.chapters.find((x) => parseChapterName(stripMd(x.name))?.no === i);
          if (!c) continue;
          try {
            priors.push({ title: chapterLabelOf(c.name) ?? stripMd(c.name), text: await fs.readText(c.path) });
          } catch {
            /* 前文读取失败不阻断 */
          }
        }
      }
      busyRef.current = true;
      setBusy(true);
      setChatError(null);
      setStreamText("");
      setStreamThink("");
      setToolLog([]);
      const signal = { aborted: false };
      abortRef.current = signal;
      const coldSession: SessionFile = { ...newSession(project.ref.root), title: coldReadSessionTitle(label) };
      setSession(coldSession); // 切到冷读会话：用户看着这位"只读正文的陌生读者"工作
      try {
        const res = await sendIsolated({
          dirs: b.dirs,
          prefs: b.prefs,
          session: coldSession,
          systemPrompt: coldReadSystem(goal),
          userText: buildColdReadUserMessage(label, tab.content, priors),
          transport,
          onEvent: onAgentEvent,
          signal,
        });
        setSession(res.session);
        const aiText =
          [...res.session.messages].reverse().find((m) => m.role === "assistant")?.text ?? "";
        if (aiText.trim()) {
          const rel = coldReadReportRel(label, goal).replace(/\//g, "\\");
          const abs = join(project.ref.root, rel);
          await fs.mkdir(dirname(abs));
          await recordSnapshot(fs, b.dirs.snapshotsDir, {
            sessionId: res.session.id,
            callId: `coldread_${Date.now()}`,
            operation: "write",
            relativePath: rel.replace(/\\/g, "/"),
            previousContent: null,
            previousExists: false,
          });
          await fs.writeText(abs, coldReadReportBody(label, goal, priors, aiText));
          await appendOplog(fs, project.ref.root, "coldread", rel, res.session.id, { note: goal });
          setStatus(`冷读完成，报告已存：${rel}`);
        } else {
          setStatus("冷读结束：未获得审读输出（可能被中止）");
        }
        await refreshSessions();
        await refreshProject();
      } catch (e) {
        setChatError(String(e));
      } finally {
        busyRef.current = false;
        setBusy(false);
        setStreamText("");
        setStreamThink("");
        setToolLog([]);
        void drainReflow(); // 冷读占用的生成槽释放后，排空待跑回流
      }
    },
    [project, transport, onAgentEvent, refreshSessions, refreshProject, drainReflow],
  );

  /** 打开会话：若会话绑定了项目则恢复绑定 */
  const openSession = useCallback(
    async (id: string) => {
      const b = currentBoot();
      if (!b) return;
      const s = await loadSession(getFs(), b.dirs.sessionsDir, id);
      if (!s) return;
      setSession(s);
      const root = s.projectPath?.trim();
      if (root && project?.ref.root.toLowerCase() !== root.toLowerCase()) {
        let ref = projects.find((p) => p.root.toLowerCase() === root.toLowerCase());
        if (!ref) {
          // 列表过期时重扫一次
          const list = await scanBooksRoot(getFs(), b.dirs.booksRoot);
          setProjects(list);
          ref = list.find((p) => p.root.toLowerCase() === root.toLowerCase());
        }
        if (ref) await openProjectRef(ref);
        else setStatus(`会话原属作品已不在作品根：${root}`);
      }
    },
    [project, projects, openProjectRef],
  );

  const answerPending = useCallback(() => {
    if (!pending) return;
    const answers = pending.items.map((_, i) => qSel[i] ?? []);
    pending.resolve(answers);
    setPending(null);
  }, [pending, qSel]);

  const startNewChat = useCallback(() => {
    setSession(newSession(project?.ref.root ?? ""));
    setSessMenu(false);
    setStatus("新对话");
  }, [project]);

  // 切换/新建会话：瞬时落到底部（这里不该有跟随动画，否则像"倒带"），
  // 并恢复自动跟随 —— 新会话永远应该贴底。
  useEffect(() => {
    pinned.current = true;
    const el = chatScroll.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    if (max > 0) el.scrollTop = max;
  }, [session?.id]);

  // 新消息/流式增量时弹簧跟随到底部。
  // 用弹簧而不是 scrollIntoView：流式内容每帧都在变长，目标位置是连续
  // 移动的，弹簧会一路追赶（读起来是"顺滑跟随"）；瞬时跳会像闪屏。
  useEffect(() => {
    const el = chatScroll.current;
    if (!el || !pinned.current) return;
    springScrollToBottom(el);
  }, [session?.messages.length, streamText, streamThink, toolLog.length]);

  // 用户一滚动就让位（可打断）：自己滚了就不再自动跟随，除非又回到贴底
  const onChatScroll = useCallback(() => {
    const el = chatScroll.current;
    if (!el) return;
    springScrollCancel(el);
    pinned.current = isNearBottom(el);
  }, []);

  const sessionGroups = useMemo(() => groupSessions(sessions), [sessions]);

  /* ── 两个内联模态的无障碍接管 ──
     冷读对话框与「需要你的选择」对话框此前都没有 role="dialog"、没有
     焦点接管。更麻烦的是 App.tsx 的 Esc 处理会在检测到 .qmodal 时主动
     让路（它假定模态自己会处理 Esc），而这两个模态谁都没处理 ——
     于是冷读对话框一打开，Esc 就彻底失效，只能靠鼠标点「取消」。
     冷读：Esc 关闭（等同取消）。下面用 useDialogFocus 接管焦点。 */
  const coldPanelRef = useRef<HTMLDivElement | null>(null);
  const coldSubmitRef = useRef<HTMLButtonElement | null>(null);
  const coldTitleId = useId();
  useDialogFocus(Boolean(coldReq), coldPanelRef, coldSubmitRef);

  useEffect(() => {
    if (!coldReq) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (e.isComposing) return;
      setColdReq(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [coldReq]);

  /* 「需要你的选择」是 AI 通过 ask 工具提出的必答问题，**没有取消语义** ——
     所以这里刻意不给 Esc 绑定关闭（关掉它会让那次工具调用永远悬着）。
     Esc 在这个模态里保持无操作是正确行为，不是遗漏；但它同样要
     role="dialog" + 焦点接管，否则读屏用户不知道发生了什么。 */
  const pendPanelRef = useRef<HTMLDivElement | null>(null);
  const pendFirstRef = useRef<HTMLButtonElement | null>(null);
  useDialogFocus(Boolean(pending), pendPanelRef, pendFirstRef);

  if (error) {
    return (
      <div className="win" id="screenB">
        <div className="boot-error">
          <div className="err-card surface-raised">
            <h3>启动失败</h3>
            {error}
          </div>
        </div>
      </div>
    );
  }

  const hasMessages = Boolean(session && session.messages.length > 0);
  const showTyping = busy && !streamText && !streamThink;

  /** 树节点点击 → 按路径判类打开 */
  const openNode = (n: ContentNode) => {
    void openFile(
      { name: n.name, rel: n.rel, path: n.path, size: n.size, mtimeMs: n.mtimeMs },
      kindForRel(n.rel),
    );
  };

  /** 通用内容树渲染：目录可折叠（已处理默认收起），所有内容文件左栏可见 */
  const renderNodes = (nodes: ContentNode[], depth: number): React.ReactElement[] =>
    nodes.map((n) =>
      n.isDir ? (
        <div key={n.rel} role="group">
          <button
            className="tnode grp"
            role="treeitem"
            aria-expanded={treeFolders[n.rel] !== false}
            style={{ paddingLeft: 8 + depth * 12 }}
            onClick={() => setTreeFolders((f) => ({ ...f, [n.rel]: f[n.rel] === false }))}
          >
            <svg
              viewBox="0 0 12 12"
              className={treeFolders[n.rel] !== false ? "caret open" : "caret"}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4.5 3L7.5 6l-3 3" />
            </svg>
            <svg viewBox="0 0 20 20" className="ic folder">
              <path d="M2.8 5.4A1.6 1.6 0 0 1 4.4 3.8h3l1.4 1.8h6.8a1.6 1.6 0 0 1 1.6 1.6v7.4a1.6 1.6 0 0 1-1.6 1.6H4.4a1.6 1.6 0 0 1-1.6-1.6V5.4z" />
            </svg>
            <span className="lbl">{n.name}</span>
          </button>
          {treeFolders[n.rel] !== false ? renderNodes(n.children, depth + 1) : null}
        </div>
      ) : (
        <button
          key={n.rel}
          className={activeRel === n.rel ? "tnode on" : "tnode"}
          role="treeitem"
          aria-selected={activeRel === n.rel}
          style={{ paddingLeft: 26 + depth * 12 }}
          onClick={() => openNode(n)}
        >
          <svg viewBox="0 0 20 20" className="ic doc">
            <path d="M5 2.6h6.4l3.6 3.6v11.2H5z" />
            <path d="M11.4 2.6v3.6H15" />
          </svg>
          <span className="lbl">{n.name}</span>
        </button>
      ),
    );

  return (
    <div className="win" id="screenB">
      {/* ── 标题栏 ── */}
      <div
        className="titlebar"
        onMouseDown={(e) => {
          // 标题栏空白处按住拖动（按钮除外）
          if (e.button !== 0) return;
          const el = e.target as HTMLElement;
          if (el.closest("button")) return;
          void win.startDragging();
        }}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          void win.toggleMaximize();
        }}
      >
        <div className="brand">
          <div className="brand-mark app-mark">
            <img src={logo} alt="" />
          </div>
          <div className="brand-name">DeepCompose</div>
        </div>

        <div className="tb-cluster" role="group" aria-label="面板开关">
          <button
            className={showFiles ? "tb-btn on" : "tb-btn"}
            title="文件面板"
            aria-pressed={showFiles}
            onClick={toggleFiles}
          >
            <svg viewBox="0 0 20 20" className="ic">
              <rect x="2.5" y="4" width="15" height="12" rx="2" />
              <path d="M7.5 4v12" />
            </svg>
          </button>
          <button
            className={showChat ? "tb-btn on" : "tb-btn"}
            title="AI 对话面板"
            aria-pressed={showChat}
            onClick={toggleChat}
          >
            <svg viewBox="0 0 20 20" className="ic">
              <path d="M3.5 5.5A2 2 0 0 1 5.5 3.5h9a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8l-4.5 3.5z" />
            </svg>
          </button>
          <span className="tb-div" />
          <button className="tb-btn" title="备忘录" onClick={() => setMemoOpen(true)}>
            <svg viewBox="0 0 20 20" className="ic">
              <rect x="3" y="2.8" width="14" height="14.4" rx="2.2" />
              <path d="M6.6 7h6.8M6.6 10.2h6.8M6.6 13.4h4" />
            </svg>
          </button>
        </div>

        {/* 鲸鱼：走廊夹在「面板开关簇」与「设置齿轮」之间（宽度由 flex 与 24px 内缩决定） */}
        <TitlebarWhale
          dirs={dirs}
          prefs={bootPrefs}
          sessionUsage={sessionUsage}
          idlePause={effIdlePause}
          onToggleIdlePause={toggleIdlePause}
        />

        <div className="win-tools">
          <button className="wbtn" title="设置" onClick={onOpenSettings}>
            <svg viewBox="0 0 20 20" className="ic">
              <circle cx="10" cy="10" r="2.4" />
              <path d="M16.1 11.9a1.25 1.25 0 0 0 .25 1.38l.04.05a1.5 1.5 0 1 1-2.12 2.12l-.05-.04a1.25 1.25 0 0 0-1.38-.25 1.25 1.25 0 0 0-.75 1.14v.15a1.5 1.5 0 1 1-3 0v-.08a1.25 1.25 0 0 0-.82-1.14 1.25 1.25 0 0 0-1.38.25l-.05.04A1.5 1.5 0 1 1 3.9 13.4l.04-.05a1.25 1.25 0 0 0 .25-1.38 1.25 1.25 0 0 0-1.14-.75h-.15a1.5 1.5 0 1 1 0-3h.08a1.25 1.25 0 0 0 1.14-.82 1.25 1.25 0 0 0-.25-1.38L3.9 5.97A1.5 1.5 0 1 1 6.02 3.85l.05.04a1.25 1.25 0 0 0 1.38.25h.06a1.25 1.25 0 0 0 .75-1.14v-.15a1.5 1.5 0 1 1 3 0v.08a1.25 1.25 0 0 0 .75 1.14 1.25 1.25 0 0 0 1.38-.25l.05-.04a1.5 1.5 0 1 1 2.12 2.12l-.04.05a1.25 1.25 0 0 0-.25 1.38v.06a1.25 1.25 0 0 0 1.14.75h.15a1.5 1.5 0 1 1 0 3h-.08a1.25 1.25 0 0 0-1.14.75z" />
            </svg>
          </button>
          <span className="tb-div" />
          <button className="wbtn" title="最小化" onClick={() => void win.minimize()}>
            <svg viewBox="0 0 20 20" className="ic">
              <path d="M5 10h10" />
            </svg>
          </button>
          <button
            className="wbtn"
            title={maxed ? "向下还原" : "最大化"}
            aria-label={maxed ? "向下还原" : "最大化"}
            onClick={() => void win.toggleMaximize()}
          >
            {maxed ? (
              // 还原：前块 + 后块的左上缺角（Windows 标准字形）
              <svg viewBox="0 0 20 20" className="ic">
                <rect x="3.4" y="6.6" width="10" height="10" rx="2" />
                <path d="M6.6 6.6V5.4a2 2 0 0 1 2-2h5.8a2 2 0 0 1 2 2v5.8a2 2 0 0 1-2 2h-1.2" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" className="ic">
                <rect x="4" y="4.5" width="11" height="11" rx="2" />
              </svg>
            )}
          </button>
          <button className="wbtn close" title="关闭" onClick={() => void win.close()}>
            <svg viewBox="0 0 20 20" className="ic">
              <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />
            </svg>
          </button>
        </div>
      </div>

      <div className={`b-body${showFiles ? "" : " hide-files"}${showChat ? "" : " hide-chat"}`}>
        {/* ══ 左栏：文件（作品 + 目录树） ══ */}
        <aside
          className="panel panel-files surface-rail"
          aria-label="文件"
          /* 收起时从焦点序列与无障碍树里立即移除。
             CSS 那边的 visibility:hidden 要等 240ms 过渡走完才生效，
             这 240ms 里 Tab 仍会走进一片已经看不见的面板 ——
             inert 是立即的，两者互补，缺一不可。 */
          inert={!showFiles}
          aria-hidden={!showFiles}
        >
          <div className="panel-head">
            <div className="ttl">文件</div>
            <button className="icon-btn accent" title="新建作品" onClick={() => void newProject()}>
              <svg viewBox="0 0 20 20" className="ic">
                <path d="M10 4.5v11M4.5 10h11" />
              </svg>
            </button>
            <button className="icon-btn" title="刷新作品列表" onClick={() => void refreshProjects()}>
              <svg viewBox="0 0 20 20" className="ic">
                <path d="M16.4 10a6.4 6.4 0 1 1-1.9-4.6" />
                <path d="M16.6 3.4v3.4h-3.4" />
              </svg>
            </button>
          </div>

          <div className="filesel-wrap" ref={fileselRef}>
            <button
              className={bookMenu ? "filesel open" : "filesel"}
              onClick={() => setBookMenu((v) => !v)}
              title="选择作品"
              aria-haspopup="listbox"
              aria-expanded={bookMenu}
            >
              <svg viewBox="0 0 20 20" className="ic bkc">
                <path d="M3 4.6A1.6 1.6 0 0 1 4.6 3h5.8l4.6 4.6v8.8A1.6 1.6 0 0 1 13.4 18H4.6A1.6 1.6 0 0 1 3 16.4V4.6z" />
              </svg>
              <span className="bk">{project ? project.ref.name : "未选择作品"}</span>
              <svg
                viewBox="0 0 12 12"
                className="uc"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 4.6L6 7.6l3-3" />
              </svg>
            </button>
            {bookMenu ? (
              <div className="bookmenu surface-raised" role="listbox" aria-label="作品列表">
                {projects.map((p) => (
                  <div className="bookrow" key={p.root}>
                    <button
                      className={`bookrow-pick${project?.ref.root === p.root ? " on" : ""}`}
                      title={p.root}
                      role="option"
                      aria-selected={project?.ref.root === p.root}
                      onClick={() => void openProject(p)}
                    >
                      <svg viewBox="0 0 20 20" className="ic">
                        <path d="M3 4.6A1.6 1.6 0 0 1 4.6 3h5.8l4.6 4.6v8.8A1.6 1.6 0 0 1 13.4 18H4.6A1.6 1.6 0 0 1 3 16.4V4.6z" />
                      </svg>
                      <span className="lbl">{p.name}</span>
                    </button>
                    <button
                      className="bookrow-del"
                      title="移入回收站"
                      aria-label={`把「${p.name}」移入回收站`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void recycleProject(p);
                      }}
                    >
                      <svg viewBox="0 0 20 20" className="ic">
                        {/* 垃圾桶：盖 + 桶身 + 两条竖线 */}
                        <path d="M4.4 6.6h11.2M8 6.6V5.2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.4" />
                        <path d="M6 6.6l.7 8.6a1.2 1.2 0 0 0 1.2 1.1h4.2a1.2 1.2 0 0 0 1.2-1.1l.7-8.6" />
                        <path d="M8.6 9.4v4.4M11.4 9.4v4.4" />
                      </svg>
                    </button>
                  </div>
                ))}
                {ready && projects.length === 0 ? <div className="empty">作品根下还没有作品</div> : null}
                <button
                  className="new"
                  onClick={() => {
                    setBookMenu(false);
                    void newProject();
                  }}
                >
                  <svg viewBox="0 0 20 20" className="ic">
                    <path d="M10 4.5v11M4.5 10h11" />
                  </svg>
                  <span className="lbl">新建作品</span>
                </button>
                <button
                  className="recycle"
                  onClick={() => {
                    setBookMenu(false);
                    setRecycleOpen(true);
                  }}
                >
                  <svg viewBox="0 0 20 20" className="ic">
                    <path d="M4.4 6.6h11.2M8 6.6V5.2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.4" />
                    <path d="M6 6.6l.7 8.6a1.2 1.2 0 0 0 1.2 1.1h4.2a1.2 1.2 0 0 0 1.2-1.1l.7-8.6" />
                  </svg>
                  <span className="lbl">回收站</span>
                  {recycleItems > 0 ? <span className="rb-badge">{recycleItems}</span> : null}
                </button>
              </div>
            ) : null}
          </div>

          <div className="tree" role="tree" aria-label="作品目录">
            {project ? (
              renderNodes(project.tree, 0)
            ) : (
              <div className="tree-empty">
                {ready ? "从上方选择一部作品开始写作" : "正在加载…"}
              </div>
            )}
          </div>

          <div className="panel-foot">
            {project
              ? `${project.chapters.length} 章 · ${project.pending.length} 待确认 · ${project.docs.length} 份资料`
              : "未选择作品"}
          </div>
        </aside>

        {/* ══ 中栏：编辑器 ══ */}
        <main className="panel panel-editor surface-sheet" aria-label="编辑器">
          {tabs.length > 0 ? (
            <div className="tabstrip" role="tablist">
              {tabs.map((t) => (
                <div
                  key={t.rel}
                  className={t.rel === activeRel ? "tab on" : "tab"}
                  role="tab"
                  aria-selected={t.rel === activeRel}
                  onClick={() => setActiveRel(t.rel)}
                >
                  <svg viewBox="0 0 16 16" className="ic-14 ic">
                    <path d="M3.6 1.6h5.2l3.6 3.6v9.2H3.6z" />
                    <path d="M8.8 1.6v3.6h3.6" />
                  </svg>
                  <span className="nm">{t.name}</span>
                  {t.dirty ? <span className="dirty-dot" title="未保存的修改" /> : null}
                  <button
                    className="x"
                    title="关闭标签"
                    aria-label={`关闭 ${t.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      void closeTab(t.rel);
                    }}
                  >
                    <svg
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    >
                      <path d="M3.2 3.2l5.6 5.6M8.8 3.2l-5.6 5.6" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {!activeTab ? (
            <div className="editor-empty">
              <div className="ee-logo app-mark">
                <img src={logo} alt="" />
              </div>
              <div className="ee-h">DeepCompose</div>
              <div className="ee-p">AI 小说写作工作台</div>
              <div className="ee-actions">
                <button className="btn btn-accent" onClick={() => void newProject()}>
                  <svg viewBox="0 0 20 20" className="ic">
                    <path d="M3 4.6A1.6 1.6 0 0 1 4.6 3h4.2c.9 0 1.6.7 1.6 1.6v11.2a1.2 1.2 0 0 0-1.2-1.2H3V4.6z" />
                    <path d="M17 4.6A1.6 1.6 0 0 0 15.4 3h-4.2c-.9 0-1.6.7-1.6 1.6v11.2a1.2 1.2 0 0 1 1.2-1.2H17V4.6z" />
                  </svg>
                  新书启航
                </button>
                <button className="btn" onClick={() => void continueWriting()}>
                  <svg viewBox="0 0 20 20" className="ic">
                    <path d="M4 5.4h7M4 9.4h7M4 13.4h4.5" />
                    <path d="M13.9 13.3l2.6-2.6 1.1 1.1-2.6 2.6-1.5.4.4-1.5z" />
                  </svg>
                  继续写作
                </button>
                <button className="btn" onClick={() => void refreshProjects()}>
                  <svg viewBox="0 0 20 20" className="ic">
                    <path d="M16.4 10a6.4 6.4 0 1 1-1.9-4.6" />
                    <path d="M16.6 3.4v3.4h-3.4" />
                  </svg>
                  刷新作品
                </button>
              </div>
              <div className="ee-hint">
                <svg viewBox="0 0 20 20" className="ic">
                  <path d="M2.8 5.4A1.6 1.6 0 0 1 4.4 3.8h3l1.4 1.8h6.8a1.6 1.6 0 0 1 1.6 1.6v7.4a1.6 1.6 0 0 1-1.6 1.6H4.4a1.6 1.6 0 0 1-1.6-1.6V5.4z" />
                </svg>
                在左侧文件面板选择作品与章节，或直接在右侧和 AI 聊聊你的故事
              </div>
            </div>
          ) : (
            <div
              className="editor-body"
              style={{ "--editor-fs": `${editorFontSize}px` } as React.CSSProperties}
            >
              <div className="editor-title">
                <h1>{activeTab.name.replace(/\.md$/i, "")}</h1>
                <span className="wc-badge">{countWords(activeTab.content)} 字</span>
                {activeTab.kind === "doc" ? (
                  /* 徽标只说**模式**，不说状态：原来这里是"资料 · 自动保存"，
                     而状态条在同一屏右侧又写一遍同一句话。现在徽标管"这是什么
                     文档"（资料 / 只读 / 编辑中），状态条管"现在存到哪一步了"
                     （未保存 / 保存中 / 已保存）—— 两者不再重复。
                     "自动保存"的行为说明留在 title 里。 */
                  <span className="mode-badge" title="资料文档：直接编辑，切换或关闭时自动保存">
                    资料
                  </span>
                ) : (
                  <div className="editor-tools">
                    {!activeTab.editing ? (
                      <span className="mode-badge" title="正文与候选默认只读，点「修改」后可编辑；结束时自动保存并触发回流">
                        只读
                      </span>
                    ) : (
                      <span className="mode-badge editing" title="编辑中：点「完成」自动保存并触发回流审稿">
                        编辑中
                      </span>
                    )}
                    <button
                      className="btn"
                      onClick={() => void toggleEditing(activeTab)}
                      title={activeTab.editing ? "结束编辑：自动保存 → 回流（审稿 + 学习记录）" : "进入编辑（正文/候选默认只读）"}
                    >
                      {activeTab.editing ? "完成（保存并回流）" : "修改"}
                    </button>
                    <button
                      className="btn"
                      onClick={() => setColdReq({ tab: activeTab })}
                      title="冷读：让一位看不到设定与前情的陌生读者审读本章"
                    >
                      冷读
                    </button>
                    {activeTab.kind === "candidate" && !activeTab.rel.includes(PROJECT_DIRS.processed) ? (
                      <button
                        className="btn btn-accent"
                        onClick={() => void adoptCandidate(activeTab)}
                        title="采用门：确认此稿为最终稿，AI 执行登记 → 保存正文 → 增量回写 → 归档推进"
                      >
                        采用为正文
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
              <textarea
                ref={editorRef}
                className={tabEditable(activeTab) ? "editor-area" : "editor-area ro"}
                value={activeTab.content}
                onChange={(e) => editContent(e.target.value)}
                readOnly={!tabEditable(activeTab)}
                spellCheck={false}
              />
            </div>
          )}
        </main>

        {/* ══ 右栏：AI 对话 ══ */}
        <aside
          className={busy ? "panel panel-chat surface-rail streaming" : "panel panel-chat surface-rail"}
          aria-label="AI 对话"
          /* 对话字号必须挂在**面板**这一层：它的消费者有两个 ——
             .chat-scroll 里的消息气泡，和 .composer-input 输入框 ——
             而这两者是兄弟关系。旧实现把它写在 .chat-scroll 上，
             于是输入框永远读不到用户的字号设置，只能吃兜底值。 */
          style={{ "--chat-fs": `${chatFontSize}px` } as React.CSSProperties}
          inert={!showChat}
          aria-hidden={!showChat}
        >
          <div className="chat-head" ref={sessRef}>
            <button
              className={sessMenu ? "sess-sel open" : "sess-sel"}
              onClick={() => setSessMenu((v) => !v)}
              title="切换会话"
              aria-haspopup="listbox"
              aria-expanded={sessMenu}
            >
              <span className="sess-ava">
                <svg viewBox="0 0 20 20" className="ic">
                  <path d="M10 2.6l1.8 5.6 5.6 1.8-5.6 1.8L10 17.4l-1.8-5.6L2.6 10l5.6-1.8L10 2.6z" />
                </svg>
              </span>
              <span className="sess-title">
                {session?.title?.trim() ? session.title : "新对话"}
              </span>
              <svg
                viewBox="0 0 12 12"
                className="chat-caret"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 4.6L6 7.6l3-3" />
              </svg>
            </button>
            <button className="icon-btn accent" title="新建对话" onClick={startNewChat}>
              <svg viewBox="0 0 20 20" className="ic">
                <path d="M10 4.5v11M4.5 10h11" />
              </svg>
            </button>

            {/* 会话下拉（取代旧的对话列表栏） */}
            {sessMenu ? (
              <div className="sess-menu surface-raised" role="listbox" aria-label="会话列表">
                <button
                  className="sess-new"
                  onClick={startNewChat}
                >
                  <svg viewBox="0 0 20 20" className="ic">
                    <path d="M10 4.5v11M4.5 10h11" />
                  </svg>
                  新建对话
                </button>
                {sessionGroups.map((g) => (
                  <div key={g.label}>
                    <div className="sess-glabel">{g.label}</div>
                    {g.items.map((s) => (
                      <button
                        key={s.id}
                        className={session?.id === s.id ? "sess-item on" : "sess-item"}
                        role="option"
                        aria-selected={session?.id === s.id}
                        title={s.title}
                        onClick={() => {
                          setSessMenu(false);
                          void openSession(s.id);
                        }}
                      >
                        <em>{s.title}</em>
                        <span>{relTime(s.mtimeMs ?? 0)}</span>
                        {session?.id === s.id ? (
                          <svg viewBox="0 0 20 20" className="ic tick">
                            <path d="M4.5 10.5l3.5 3.5 7.5-8" />
                          </svg>
                        ) : null}
                      </button>
                    ))}
                  </div>
                ))}
                {sessions.length === 0 ? <div className="sess-empty">还没有历史会话</div> : null}
              </div>
            ) : null}
          </div>

          {hasMessages ? (
            <div
              className="chat-scroll"
              ref={chatScroll}
              onScroll={onChatScroll}
            >
              {session!.messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="msg user">
                    <div className="bubble">{m.text}</div>
                  </div>
                ) : (
                  <div key={m.id} className="msg ai">
                    <div className="who">DeepCompose</div>
                    {m.thinking ? <div className="think">{m.thinking}</div> : null}
                    {(m.toolCalls ?? []).map((t) => {
                      const bad = (t.result ?? "").includes('"error"');
                      return (
                        <div key={t.callId} className="tool-line">
                          <svg viewBox="0 0 20 20" className="ic ic-14">
                            <path d="M7.5 3.5h-3a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-3" />
                            <path d="M11.5 8.5l6-6M17.5 5.5v-3h-3" />
                          </svg>
                          {t.name} {bad ? <span className="bad">✕</span> : <span className="ok">✓</span>}
                          {bad ? " " + extractError(t.result ?? "") : ""}
                        </div>
                      );
                    })}
                    {m.text ? <div className="bubble">{m.text}</div> : null}
                  </div>
                ),
              )}
              {toolLog.map((t, i) => (
                <div key={`live-${i}`} className="tool-line">
                  <svg viewBox="0 0 20 20" className="ic ic-14">
                    <path d="M7.5 3.5h-3a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-3" />
                    <path d="M11.5 8.5l6-6M17.5 5.5v-3h-3" />
                  </svg>
                  {t.name}{" "}
                  {t.status === "run" ? (
                    <svg viewBox="0 0 20 20" className="ic ic-14 spin">
                      <path d="M10 3a7 7 0 1 0 7 7" />
                    </svg>
                  ) : t.status === "ok" ? (
                    <span className="ok">✓</span>
                  ) : (
                    <span className="bad">✕</span>
                  )}
                </div>
              ))}
              {streamThink ? <div className="think live">{streamThink}</div> : null}
              {streamText ? (
                <div className="msg ai">
                  <div className="who">DeepCompose · 生成中</div>
                  <div className="bubble">{streamText}</div>
                </div>
              ) : null}
              {showTyping ? (
                <div className="msg ai">
                  <div className="who">DeepCompose</div>
                  <div className="bubble typing">
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              ) : null}
              {chatError ? <div className="err-line">{chatError}</div> : null}
              {truncNote ? <div className="notice-line">{truncNote}</div> : null}
              <div ref={chatBottom} />
            </div>
          ) : (
            <div className="chat-welcome">
              <div className="cw-logo app-mark">
                <img src={logo} alt="" />
              </div>
              <div className="cw-h">DeepCompose 助手</div>
              <div className="cw-p">读写你的作品文件，陪你把故事写下去</div>
              <div className="cw-tips">
                {STARTER_TIPS.map((tip) => (
                  <button
                    key={tip.label}
                    className="cw-tip"
                    onClick={() => {
                      setComposer(tip.text);
                      composerRef.current?.focus();
                    }}
                  >
                    <svg viewBox="0 0 20 20" className="ic">
                      <path d="M10 2.6l1.8 5.6 5.6 1.8-5.6 1.8L10 17.4l-1.8-5.6L2.6 10l5.6-1.8L10 2.6z" />
                    </svg>
                    {tip.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="chat-quick">
            <button className="chip" onClick={() => setMemoOpen(true)}>
              <svg viewBox="0 0 20 20" className="ic">
                <rect x="3" y="2.8" width="14" height="14.4" rx="2.2" />
                <path d="M6.6 7h6.8M6.6 10.2h6.8M6.6 13.4h4" />
              </svg>
              备忘录
            </button>
            {project ? (
              <button
                className="chip"
                title="一键指令：按主线写下一章候选（完整初稿 → 逐段修改 → 全文复读）"
                disabled={busy}
                onClick={() => void sendUserMessage(WRITE_NEXT_MESSAGE)}
              >
                <svg viewBox="0 0 20 20" className="ic">
                  <path d="M4 5.4h7M4 9.4h7M4 13.4h4.5" />
                  <path d="M13.9 13.3l2.6-2.6 1.1 1.1-2.6 2.6-1.5.4.4-1.5z" />
                </svg>
                写下一章
              </button>
            ) : null}
            {activeTab && activeTab.kind !== "doc" ? (
              <button
                className="chip"
                title="冷读：让看不到设定与前情的陌生读者审读本章"
                disabled={busy}
                onClick={() => setColdReq({ tab: activeTab })}
              >
                <svg viewBox="0 0 20 20" className="ic">
                  <path d="M10 4.6c3.4 0 6.2 2.2 7.4 5.4-1.2 3.2-4 5.4-7.4 5.4S3.8 13.2 2.6 10C3.8 6.8 6.6 4.6 10 4.6z" />
                  <circle cx="10" cy="10" r="2.2" />
                </svg>
                冷读本章
              </button>
            ) : null}
          </div>

          <div className="composer surface-well">
            <textarea
              ref={composerRef}
              className="composer-input"
              value={composer}
              placeholder="写下你的故事，或让 AI 帮你写…"
              aria-label="消息输入框"
              onChange={(e) => setComposer(e.target.value)}
              onKeyDown={(e) => {
                // 中文 IME 组合中的 Enter 是选词确认，不能当作发送
                if (e.nativeEvent.isComposing || e.key === "Process") return;
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void doSend();
                }
              }}
            />
            <div className="comp-row">
              <div className="think-wrap">
                <button
                  className={thinkEffective === "off" ? "chip think" : "chip think accent"}
                  title={
                    thinkSupported
                      ? `思考模式：${thinkStop.label}（点选档位，本会话内临时生效，不改配置文件）`
                      : "当前平台不支持思考参数（仅 DeepSeek 官方端点可用）"
                  }
                  aria-haspopup="true"
                  aria-expanded={thinkOpen}
                  disabled={busy || !thinkSupported}
                  onClick={() => setThinkOpen((v) => !v)}
                >
                  <svg viewBox="0 0 20 20" className="ic">
                    <path d="M6.6 15.6h6.8M7.2 17.8h5.6" />
                    <path d="M10 2.6c3 0 5.2 2 5.2 4.7 0 2-1.1 3-2.2 4.1-.7.7-1 1.3-1 2.2H8c0-.9-.3-1.5-1-2.2-1.1-1.1-2.2-2.1-2.2-4.1C4.8 4.6 7 2.6 10 2.6z" />
                  </svg>
                  思考·{thinkStop.label}
                </button>
                {thinkOpen ? (
                  <div className="think-pop surface-raised" role="group" aria-label="思考档位">
                    {THINKING_STOPS.map((s) => (
                      <button
                        key={s.level}
                        type="button"
                        className={`think-stop ${s.level === thinkEffective ? "on" : ""}`}
                        aria-pressed={s.level === thinkEffective}
                        onClick={() => {
                          setThinkLevel(s.level);
                          setThinkOpen(false);
                        }}
                      >
                        <span className="ts-label">{s.label}</span>
                        <span className="ts-hint">{s.hint}</span>
                      </button>
                    ))}
                    {thinkLevel !== null ? (
                      <button
                        type="button"
                        className="think-reset"
                        onClick={() => {
                          setThinkLevel(null);
                          setThinkOpen(false);
                        }}
                      >
                        跟随配置默认
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <button className="chip model" title="在设置中配置模型" onClick={onOpenSettings}>
                <svg viewBox="0 0 16 16" className="ic">
                  <path
                    d="M8 1.6c2.6 3.3 3.9 5.6 3.9 7.1A3.9 3.9 0 0 1 8 12.6a3.9 3.9 0 0 1-3.9-3.9c0-1.5 1.3-3.8 3.9-7.1z"
                    fill="currentColor"
                    stroke="none"
                  />
                  <path d="M4.6 14.6h6.8" />
                </svg>
                <span>{modelLabel}</span>
              </button>
              {busy ? (
                <button
                  className="chip stop"
                  title="停止生成（立即中断当前流）"
                  onClick={() => {
                    abortRef.current.aborted = true;
                    abortActiveStream();
                    // question 弹窗挂起时点停止：关弹窗并以空选择 resolve，
                    // agent 循环的中止检查随即以「已中止」收尾本轮
                    const pq = pendingQuestionRef.current;
                    if (pq) {
                      pendingQuestionRef.current = null;
                      setPending(null);
                      pq.resolve(pq.items.map(() => []));
                    }
                    setStatus("正在停止…");
                  }}
                >
                  <svg viewBox="0 0 20 20" className="ic">
                    <rect x="5.5" y="5.5" width="9" height="9" rx="1.6" fill="currentColor" stroke="none" />
                  </svg>
                  停止
                </button>
              ) : null}
              {!hasKey ? <span className="chip warn">未配置 API Key</span> : null}
              <button
                className="send"
                title="发送（Enter）"
                aria-label="发送"
                onClick={() => void doSend()}
                disabled={busy || composer.trim() === ""}
              >
                <svg viewBox="0 0 24 24" className="ic">
                  <path d="M12 19V5" />
                  <path d="M5.5 11.5L12 5l6.5 6.5" />
                </svg>
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* ── 全局状态条 ── */}
      <div className="statusbar">
        <span className="st-left" role="status">{status}</span>
        <span className="st-right">
          {activeTab ? (
            <>
              {/* 保存态用线表达：实线=已落盘，虚线=有未落盘改动。
                  key 随保存态变化 —— React 会重建这个 span，于是那条线
                  会自左向右重新"划"出来一次（落盘那一刻的过签动作）。
                  它右侧永远跟着文字，状态从不只靠颜色或线形单独承担。 */}
              <span
                key={activeTab.dirty || saving ? "unsaved" : "saved"}
                className={activeTab.dirty || saving ? "st-save unsaved" : "st-save"}
              />
              {activeTab.kind === "doc"
                ? saving
                  ? "保存中…"
                  : activeTab.dirty
                    ? "未保存 · Ctrl+S 保存"
                    : "已保存"
                : activeTab.editing
                  ? "编辑中 · 点「完成」保存并回流"
                  : "只读 · 点「修改」后可编辑"}
            </>
          ) : null}
        </span>
      </div>

      <MemoModal open={memoOpen} onClose={() => setMemoOpen(false)} project={project} onStatus={setStatus} askText={askText} />

      <RecycleBin
        open={recycleOpen}
        onClose={() => setRecycleOpen(false)}
        dirs={dirs}
        booksRoot={dirs?.booksRoot ?? null}
        onStatus={setStatus}
        onChanged={() => void refreshProjects()}
        askTypedConfirm={askTypedConfirm}
        askConfirm={askConfirm}
      />

      {coldReq ? (
        <div className="qmodal scrim">
          <div
            className="qbox surface-raised sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={coldTitleId}
            tabIndex={-1}
            ref={coldPanelRef}
          >
            <h3 id={coldTitleId}>冷读 · {coldReq.tab.name.replace(/\.md$/i, "")}</h3>
            <p className="qhint">
              冷读在独立会话中运行：审读者看不到大纲、设定、人物资料与任何作者解释，也没有文件工具，
              就像一位第一次读到这份稿子的新读者。结束后报告自动存入 小说资料\审核\。
            </p>
            <div className="qgroup">
              <div className="qg-label">提供前文（取自已采用的正式正文）</div>
              <div className="qopts-row">
                {([0, 1, 2] as const).map((n) => (
                  <button
                    key={n}
                    className={coldPrior === n ? "qopt on" : "qopt"}
                    onClick={() => setColdPrior(n)}
                  >
                    {n === 0 ? "无前文" : n === 1 ? "上一章" : "前两章"}
                  </button>
                ))}
              </div>
            </div>
            <div className="qgroup">
              <div className="qg-label">审读目标（单次只选一个）</div>
              <div className="qopts-row">
                {(["clarity", "pace"] as const).map((g) => (
                  <button
                    key={g}
                    className={coldGoal === g ? "qopt on" : "qopt"}
                    onClick={() => setColdGoal(g)}
                  >
                    {COLD_READ_GOAL_LABEL[g]}
                  </button>
                ))}
              </div>
            </div>
            <div className="qrow">
              <button
                className="qsubmit btn btn-accent"
                disabled={busy}
                ref={coldSubmitRef}
                onClick={() => void runColdRead(coldReq.tab, coldPrior, coldGoal)}
              >
                开始冷读
              </button>
              <button className="btn" onClick={() => setColdReq(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pending ? (
        <div className="qmodal scrim">
          <div
            className="qbox surface-raised sheet wide"
            role="dialog"
            aria-modal="true"
            aria-label="需要你的选择"
            tabIndex={-1}
            ref={pendPanelRef}
          >
            {pending.items.map((q, qi) => (
              <div key={qi} style={{ marginBottom: 16 }}>
                <h3>
                  {q.question}
                  {q.multi_select ? "（可多选）" : ""}
                </h3>
                {q.options.map((o) => {
                  const on = (qSel[qi] ?? []).includes(o.label);
                  return (
                    <button
                      key={o.label}
                      className={on ? "qopt on" : "qopt"}
                      ref={qi === 0 && o === q.options[0] ? pendFirstRef : undefined}
                      onClick={() =>
                        setQSel((s) => {
                          const cur = s[qi] ?? [];
                          const next = q.multi_select
                            ? cur.includes(o.label)
                              ? cur.filter((x) => x !== o.label)
                              : [...cur, o.label]
                            : [o.label];
                          return { ...s, [qi]: next };
                        })
                      }
                    >
                      {o.label}
                      {o.description ? <span className="d">{o.description}</span> : null}
                    </button>
                  );
                })}
              </div>
            ))}
            <button className="qsubmit btn btn-accent" onClick={answerPending}>
              提交
            </button>
          </div>
        </div>
      ) : null}

      {/* ── 三个通用对话框永远排在最后 ──
          `.qmodal` 都是 z-index:90，**同层的先后由 DOM 顺序决定**。
          它们会被"模态里的按钮"唤起（回收站的「彻底删除」→ 手打确认、
          备忘录的改名 → 输入框），所以必须盖在其它模态之上；
          实测过的坑：把 TypedConfirmDialog 放在 RecycleBin 之前，
          手打确认框会整块躲在回收站底下（只露出一条边），
          点得到（DOM 在）但看不见 —— 最坏的那种 bug。 */}
      <InputDialog req={inputReq} />
      <ConfirmDialog req={confirmReq} />
      <TypedConfirmDialog req={typedReq} />
    </div>
  );
}
