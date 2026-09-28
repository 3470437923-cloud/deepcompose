/**
 * 主工作台 —— writerD 3.0 液态玻璃三栏布局。
 *
 * 布局（委托方 2026-09-28 指令）：
 *   左 = 文件（作品选择 + 目录树）· 中 = 编辑器 · 右 = AI 对话。
 *   旧的「对话列表」独立栏已删除，会话切换改为对话面板顶部的下拉选择框。
 * 数据逻辑（boot/作品/标签页/会话/工具循环/快照纪律）与 2.x 完全一致。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import logo from "../assets/logo.png";
import { boot, applyAccentFromPrefs, applyThemeFromPrefs, currentBoot, savePrefs } from "../core/app";
import { getFs } from "../core/fsbridge";
import { join, projectChaptersDir, projectDocsDir } from "../core/dirs";
import {
  createProject,
  loadProject,
  scanBooksRoot,
  type FileRef,
  type ProjectData,
  type ProjectRef,
} from "../core/store/project";
import { appendToDoc, appendToSection, replaceInSection } from "../core/store/markdown";
import { abortActiveStream, createTauriTransport } from "../core/ai/transport";
import { reloadIndex, send as sendChat } from "../core/ai/controller";
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
import { ConfirmDialog, InputDialog, type ConfirmRequest, type InputRequest } from "./Dialogs";

interface OpenTab {
  /** 相对作品根路径（'\' 分隔） */
  rel: string;
  path: string;
  name: string;
  kind: "doc" | "chapter" | "root";
  /** 打开时的磁盘内容（写前快照的 previousContent 来源） */
  baseContent: string;
  content: string;
  dirty: boolean;
}

/** 字数统计：中文按字、西文按词（与「文章总字数」口径一致：非空白字符计） */
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

/** 对话空态的快捷提示（点击预填输入框，用户可改后再发送） */
const STARTER_TIPS: { label: string; text: string }[] = [
  { label: "续写最新一章", text: "请先读取最新章节的内容，然后顺着剧情续写下一段。" },
  { label: "检查设定一致性", text: "请阅读小说资料里的人物库和世界观，检查最新章节有没有设定不一致的地方。" },
  { label: "头脑风暴书名", text: "请根据当前作品的题材与基调，帮我头脑风暴 10 个备选书名。" },
];

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
  const [openFolders, setOpenFolders] = useState<{ docs: boolean; chapters: boolean }>({
    docs: true,
    chapters: true,
  });
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
  const [pending, setPending] = useState<{
    items: QuestionItem[];
    resolve: (a: string[][]) => void;
  } | null>(null);
  const [qSel, setQSel] = useState<Record<number, string[]>>({});
  const chatBottom = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<{ aborted: boolean }>({ aborted: false });
  const transport = useMemo(() => createTauriTransport(), []);

  // ── 备忘录与应用内对话框 ──
  const [memoOpen, setMemoOpen] = useState(false);
  const [inputReq, setInputReq] = useState<InputRequest | null>(null);
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);

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

  const dirs = currentBoot()?.dirs ?? null;

  const activeTab = useMemo(() => tabs.find((t) => t.rel === activeRel) ?? null, [tabs, activeRel]);

  // 字号与模型（prefs 直读；设置屏保存后返回主界面时组件重挂载即生效）
  const bootPrefs = ready ? currentBoot()?.prefs ?? null : null;
  const editorFontSize = bootPrefs?.editorFontSize ?? 15;
  const chatFontSize = bootPrefs?.chatFontSize ?? 15;
  const modelLabel = bootPrefs?.model?.trim() || "未配置模型";
  const hasKey = Boolean(bootPrefs?.apiKey?.trim());

  /** 有未保存修改时先确认（切作品/切会话防丢稿） */
  const guardDirtyTabs = useCallback(async () => {
    if (!tabs.some((t) => t.dirty)) return true;
    return askConfirm(
      "有未保存的修改",
      "切换将丢失未保存的编辑内容（可先 Ctrl+S 保存）。",
      { danger: true, confirmLabel: "放弃修改" },
    );
  }, [tabs, askConfirm]);

  /** 装配数据：载入作品（不改 prefs；启动恢复与 openProject 共用） */
  const openProjectRef = useCallback(
    async (ref: ProjectRef) => {
      if (!(await guardDirtyTabs())) return;
      const fs = getFs();
      const data = await loadProject(fs, ref.root, ref.name);
      setProject(data);
      setTabs([]);
      setActiveRel(null);
      setStatus(`${ref.name}：${data.chapters.length} 章 / ${data.docs.length} 份资料`);
    },
    [guardDirtyTabs],
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
      if (!(await guardDirtyTabs())) return;
      const fs = getFs();
      const data = await loadProject(fs, ref.root, ref.name);
      setProject(data);
      setTabs([]);
      setActiveRel(null);
      setBookMenu(false);
      setStatus(`${ref.name}：${data.chapters.length} 章 / ${data.docs.length} 份资料`);
      const b = currentBoot();
      if (b && b.prefs.currentNovelProject !== ref.root) {
        const next = { ...b.prefs, currentNovelProject: ref.root };
        void savePrefs(next);
      }
    },
    [guardDirtyTabs],
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
    async (ref: FileRef, kind: "doc" | "chapter" | "root") => {
      if (!project) return;
      const fs = getFs();
      const existing = tabs.find((t) => t.rel === ref.rel);
      if (existing) {
        setActiveRel(ref.rel);
        return;
      }
      const content = await fs.readText(ref.path);
      setTabs((prev) => [
        ...prev,
        { rel: ref.rel, path: ref.path, name: ref.name, kind, baseContent: content, content, dirty: false },
      ]);
      setActiveRel(ref.rel);
    },
    [project, tabs],
  );

  const closeTab = useCallback(
    async (rel: string) => {
      const tab = tabs.find((t) => t.rel === rel);
      if (tab?.dirty) {
        const ok = await askConfirm(
          "放弃未保存的修改？",
          `「${tab.name}」有未保存的修改，关闭后将丢失。`,
          { danger: true, confirmLabel: "放弃修改" },
        );
        if (!ok) return;
      }
      setTabs((prev) => {
        const next = prev.filter((t) => t.rel !== rel);
        if (activeRel === rel) setActiveRel(next.length ? next[next.length - 1].rel : null);
        return next;
      });
    },
    [tabs, activeRel, askConfirm],
  );

  const editContent = useCallback(
    (text: string) => {
      setTabs((prev) => prev.map((t) => (t.rel === activeRel ? { ...t, content: text, dirty: true } : t)));
    },
    [activeRel],
  );

  const saveActive = useCallback(async () => {
    if (!activeTab) return;
    setSaving(true);
    try {
      const fs = getFs();
      const b = currentBoot();
      // 写前快照（硬约束：手动保存与工具回写同纪律）
      if (b) {
        await recordSnapshot(fs, b.dirs.snapshotsDir, {
          sessionId: session?.id ?? "manual-edits",
          callId: `manual_${Date.now()}`,
          operation: "write",
          relativePath: activeTab.rel.replace(/\\/g, "/"),
          previousContent: activeTab.baseContent,
          previousExists: true,
          previousType: "file",
        });
      }
      await fs.writeText(activeTab.path, activeTab.content);
      setTabs((prev) =>
        prev.map((t) => (t.rel === activeTab.rel ? { ...t, baseContent: t.content, dirty: false } : t)),
      );
      setStatus(`已保存 ${activeTab.name} · ${countWords(activeTab.content)} 字`);
      if (project) {
        const data = await loadProject(fs, project.ref.root, project.ref.name);
        setProject(data);
      }
    } catch (e) {
      setStatus(`保存失败：${String(e)}`);
    } finally {
      setSaving(false);
    }
  }, [activeTab, project, session]);

  /** Ctrl+S 保存 */
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

  /** 关窗守卫：有未保存修改时先确认（数据安全最后一环） */
  useEffect(() => {
    let disposed = false;
    const unlistenP = getCurrentWindow().onCloseRequested(async (event) => {
      if (!tabs.some((t) => t.dirty)) return; // 无脏编辑放行
      event.preventDefault();
      const ok = await askConfirm(
        "有未保存的修改",
        "关闭前将丢失未保存的编辑内容（可先 Ctrl+S 保存）。",
        { danger: true, confirmLabel: "放弃并关闭" },
      );
      if (ok && !disposed) await getCurrentWindow().destroy();
    });
    return () => {
      disposed = true;
      void unlistenP.then((fn) => fn());
    };
  }, [tabs, askConfirm]);

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

  /** 继续写作：打开当前作品的第一个章节（无作品则提示） */
  const continueWriting = useCallback(async () => {
    if (!project) {
      setStatus("请先在左侧文件面板选择作品");
      return;
    }
    const target = project.chapters[0] ?? project.docs[0];
    if (!target) {
      setStatus(`${project.ref.name} 还没有章节或资料`);
      return;
    }
    await openFile(target, project.chapters.length ? "chapter" : "doc");
  }, [project, openFile]);

  const win = getCurrentWindow();

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
        setQSel({});
        setPending({ items, resolve });
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

  const doSend = useCallback(async () => {
    const b = currentBoot();
    const text = composer.trim();
    if (!b || text === "" || busy) return;
    setBusy(true);
    setChatError(null);
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
      });
      setSession(res.session);
      if (res.error) setChatError(res.error);
      await refreshSessions();
      if (project) {
        const fs = getFs();
        setProject(await loadProject(fs, project.ref.root, project.ref.name));
      }
    } catch (err) {
      setChatError(String(err));
    } finally {
      setBusy(false);
      setStreamText("");
      setStreamThink("");
      setToolLog([]);
    }
  }, [composer, busy, session, project, transport, onAgentEvent, askQuestions, refreshSessions]);

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

  // 新消息/流式增量时滚到底部
  useEffect(() => {
    chatBottom.current?.scrollIntoView({ block: "end" });
  }, [session?.id, session?.messages.length, streamText, streamThink, toolLog.length]);

  const sessionGroups = useMemo(() => groupSessions(sessions), [sessions]);

  if (error) {
    return (
      <div className="win" id="screenB">
        <div className="boot-error">
          <div className="err-card glass">
            <h3>启动失败</h3>
            {error}
          </div>
        </div>
      </div>
    );
  }

  const hasMessages = Boolean(session && session.messages.length > 0);
  const showTyping = busy && !streamText && !streamThink;

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
          <div className="brand-mark squircle">
            <img src={logo} alt="" />
          </div>
          <div className="brand-name">writerD</div>
        </div>

        <div className="tb-cluster" role="group" aria-label="面板开关">
          <button
            className={showFiles ? "tb-btn glint on" : "tb-btn glint"}
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
            className={showChat ? "tb-btn glint on" : "tb-btn glint"}
            title="AI 对话面板"
            aria-pressed={showChat}
            onClick={toggleChat}
          >
            <svg viewBox="0 0 20 20" className="ic">
              <path d="M3.5 5.5A2 2 0 0 1 5.5 3.5h9a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8l-4.5 3.5z" />
            </svg>
          </button>
          <span className="tb-div" />
          <button className="tb-btn glint" title="备忘录" onClick={() => setMemoOpen(true)}>
            <svg viewBox="0 0 20 20" className="ic">
              <rect x="3" y="2.8" width="14" height="14.4" rx="2.2" />
              <path d="M6.6 7h6.8M6.6 10.2h6.8M6.6 13.4h4" />
            </svg>
          </button>
        </div>

        <div className="win-tools">
          <button className="wbtn glint" title="设置" onClick={onOpenSettings}>
            <svg viewBox="0 0 20 20" className="ic">
              <circle cx="10" cy="10" r="2.4" />
              <path d="M16.1 11.9a1.25 1.25 0 0 0 .25 1.38l.04.05a1.5 1.5 0 1 1-2.12 2.12l-.05-.04a1.25 1.25 0 0 0-1.38-.25 1.25 1.25 0 0 0-.75 1.14v.15a1.5 1.5 0 1 1-3 0v-.08a1.25 1.25 0 0 0-.82-1.14 1.25 1.25 0 0 0-1.38.25l-.05.04A1.5 1.5 0 1 1 3.9 13.4l.04-.05a1.25 1.25 0 0 0 .25-1.38 1.25 1.25 0 0 0-1.14-.75h-.15a1.5 1.5 0 1 1 0-3h.08a1.25 1.25 0 0 0 1.14-.82 1.25 1.25 0 0 0-.25-1.38L3.9 5.97A1.5 1.5 0 1 1 6.02 3.85l.05.04a1.25 1.25 0 0 0 1.38.25h.06a1.25 1.25 0 0 0 .75-1.14v-.15a1.5 1.5 0 1 1 3 0v.08a1.25 1.25 0 0 0 .75 1.14 1.25 1.25 0 0 0 1.38-.25l.05-.04a1.5 1.5 0 1 1 2.12 2.12l-.04.05a1.25 1.25 0 0 0-.25 1.38v.06a1.25 1.25 0 0 0 1.14.75h.15a1.5 1.5 0 1 1 0 3h-.08a1.25 1.25 0 0 0-1.14.75z" />
            </svg>
          </button>
          <span className="tb-div" />
          <button className="wbtn glint" title="最小化" onClick={() => void win.minimize()}>
            <svg viewBox="0 0 20 20" className="ic">
              <path d="M5 10h10" />
            </svg>
          </button>
          <button className="wbtn glint" title="最大化" onClick={() => void win.toggleMaximize()}>
            <svg viewBox="0 0 20 20" className="ic">
              <rect x="4" y="4.5" width="11" height="11" rx="2" />
            </svg>
          </button>
          <button className="wbtn close glint" title="关闭" onClick={() => void win.close()}>
            <svg viewBox="0 0 20 20" className="ic">
              <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />
            </svg>
          </button>
        </div>
      </div>

      <div className={`b-body${showFiles ? "" : " hide-files"}${showChat ? "" : " hide-chat"}`}>
        {/* ══ 左栏：文件（作品 + 目录树） ══ */}
        <aside className="panel panel-files glass" aria-label="文件">
          <div className="panel-head">
            <div className="ttl">文件</div>
            <button className="icon-btn accent glint" title="新建作品" onClick={() => void newProject()}>
              <svg viewBox="0 0 20 20" className="ic">
                <path d="M10 4.5v11M4.5 10h11" />
              </svg>
            </button>
            <button className="icon-btn glint" title="刷新作品列表" onClick={() => void refreshProjects()}>
              <svg viewBox="0 0 20 20" className="ic">
                <path d="M16.4 10a6.4 6.4 0 1 1-1.9-4.6" />
                <path d="M16.6 3.4v3.4h-3.4" />
              </svg>
            </button>
          </div>

          <div className="filesel-wrap" ref={fileselRef}>
            <button
              className={bookMenu ? "filesel glint open" : "filesel glint"}
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
              <div className="bookmenu glass-pop" role="listbox" aria-label="作品列表">
                {projects.map((p) => (
                  <button
                    key={p.root}
                    className={project?.ref.root === p.root ? "on" : ""}
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
              </div>
            ) : null}
          </div>

          <div className="tree" role="tree" aria-label="作品目录">
            {project ? (
              <>
                <button
                  className="tnode grp"
                  role="treeitem"
                  aria-expanded={openFolders.docs}
                  onClick={() => setOpenFolders((f) => ({ ...f, docs: !f.docs }))}
                >
                  <svg
                    viewBox="0 0 12 12"
                    className={openFolders.docs ? "caret open" : "caret"}
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
                  <span className="lbl">小说资料</span>
                </button>
                {openFolders.docs &&
                  project.docs.map((d) => (
                    <button
                      key={d.rel}
                      className={activeRel === d.rel ? "tnode sub on" : "tnode sub"}
                      role="treeitem"
                      aria-selected={activeRel === d.rel}
                      onClick={() => void openFile(d, "doc")}
                    >
                      <svg viewBox="0 0 20 20" className="ic doc">
                        <path d="M5 2.6h6.4l3.6 3.6v11.2H5z" />
                        <path d="M11.4 2.6v3.6H15" />
                      </svg>
                      <span className="lbl">{d.name}</span>
                    </button>
                  ))}
                <button
                  className="tnode grp"
                  role="treeitem"
                  aria-expanded={openFolders.chapters}
                  onClick={() => setOpenFolders((f) => ({ ...f, chapters: !f.chapters }))}
                >
                  <svg
                    viewBox="0 0 12 12"
                    className={openFolders.chapters ? "caret open" : "caret"}
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
                  <span className="lbl">章节内容</span>
                </button>
                {openFolders.chapters &&
                  project.chapters.map((c) => (
                    <button
                      key={c.rel}
                      className={activeRel === c.rel ? "tnode sub on" : "tnode sub"}
                      role="treeitem"
                      aria-selected={activeRel === c.rel}
                      onClick={() => void openFile(c, "chapter")}
                    >
                      <svg viewBox="0 0 20 20" className="ic doc">
                        <path d="M5 2.6h6.4l3.6 3.6v11.2H5z" />
                        <path d="M11.4 2.6v3.6H15" />
                      </svg>
                      <span className="lbl">{c.name}</span>
                    </button>
                  ))}
              </>
            ) : (
              <div className="tree-empty">
                {ready ? "从上方选择一部作品开始写作" : "正在加载…"}
              </div>
            )}
          </div>

          <div className="panel-foot">
            {project ? `${project.chapters.length} 章 · ${project.docs.length} 份资料` : "未选择作品"}
          </div>
        </aside>

        {/* ══ 中栏：编辑器 ══ */}
        <main className="panel panel-editor glass" aria-label="编辑器">
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
              <div className="ee-logo squircle">
                <img src={logo} alt="" />
              </div>
              <div className="ee-h">writerD</div>
              <div className="ee-p">AI 小说写作工作台</div>
              <div className="ee-actions">
                <button className="btn btn-accent glint" onClick={() => void newProject()}>
                  <svg viewBox="0 0 20 20" className="ic">
                    <path d="M3 4.6A1.6 1.6 0 0 1 4.6 3h4.2c.9 0 1.6.7 1.6 1.6v11.2a1.2 1.2 0 0 0-1.2-1.2H3V4.6z" />
                    <path d="M17 4.6A1.6 1.6 0 0 0 15.4 3h-4.2c-.9 0-1.6.7-1.6 1.6v11.2a1.2 1.2 0 0 1 1.2-1.2H17V4.6z" />
                  </svg>
                  新书启航
                </button>
                <button className="btn glint" onClick={() => void continueWriting()}>
                  <svg viewBox="0 0 20 20" className="ic">
                    <path d="M4 5.4h7M4 9.4h7M4 13.4h4.5" />
                    <path d="M13.9 13.3l2.6-2.6 1.1 1.1-2.6 2.6-1.5.4.4-1.5z" />
                  </svg>
                  继续写作
                </button>
                <button className="btn glint" onClick={() => void refreshProjects()}>
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
            <div className="editor-body">
              <div className="editor-title">
                <h1>{activeTab.name.replace(/\.md$/i, "")}</h1>
                <span className="wc-badge">{countWords(activeTab.content)} 字</span>
              </div>
              <textarea
                ref={editorRef}
                className="editor-area"
                style={{ fontSize: `${editorFontSize}px` }}
                value={activeTab.content}
                onChange={(e) => editContent(e.target.value)}
                spellCheck={false}
              />
            </div>
          )}
        </main>

        {/* ══ 右栏：AI 对话 ══ */}
        <aside
          className={busy ? "panel panel-chat glass streaming" : "panel panel-chat glass"}
          aria-label="AI 对话"
        >
          <div className="chat-head" ref={sessRef}>
            <button
              className={sessMenu ? "sess-sel glint open" : "sess-sel glint"}
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
            <button className="icon-btn accent glint" title="新建对话" onClick={startNewChat}>
              <svg viewBox="0 0 20 20" className="ic">
                <path d="M10 4.5v11M4.5 10h11" />
              </svg>
            </button>

            {/* 会话下拉（取代旧的对话列表栏） */}
            {sessMenu ? (
              <div className="sess-menu glass-pop" role="listbox" aria-label="会话列表">
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
                  <div className="sess-group" key={g.label}>
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
            <div className="chat-scroll" style={{ "--chat-fs": `${chatFontSize}px` } as React.CSSProperties}>
              {session!.messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="msg user">
                    <div className="bubble">{m.text}</div>
                  </div>
                ) : (
                  <div key={m.id} className="msg ai">
                    <div className="who">writerD</div>
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
                  <div className="who">writerD · 生成中</div>
                  <div className="bubble">{streamText}</div>
                </div>
              ) : null}
              {showTyping ? (
                <div className="msg ai">
                  <div className="who">writerD</div>
                  <div className="bubble typing">
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              ) : null}
              {chatError ? <div className="err-line">{chatError}</div> : null}
              <div ref={chatBottom} />
            </div>
          ) : (
            <div className="chat-welcome">
              <div className="cw-logo squircle">
                <img src={logo} alt="" />
              </div>
              <div className="cw-h">writerD 助手</div>
              <div className="cw-p">读写你的作品文件，陪你把故事写下去</div>
              <div className="cw-tips">
                {STARTER_TIPS.map((tip) => (
                  <button
                    key={tip.label}
                    className="cw-tip glint"
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
            <button className="chip glint" onClick={() => setMemoOpen(true)}>
              <svg viewBox="0 0 20 20" className="ic">
                <rect x="3" y="2.8" width="14" height="14.4" rx="2.2" />
                <path d="M6.6 7h6.8M6.6 10.2h6.8M6.6 13.4h4" />
              </svg>
              备忘录
            </button>
          </div>

          <div className="composer glass-inset">
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
              <button className="chip model glint" title="在设置中配置模型" onClick={onOpenSettings}>
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
                  className="chip stop glint"
                  title="停止生成（立即中断当前流）"
                  onClick={() => {
                    abortRef.current.aborted = true;
                    abortActiveStream();
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
                className="send glint"
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
      <div className="statusbar glass-bar">
        <span className="st-left">{status}</span>
        <span className="st-right">
          {activeTab ? (
            <>
              <span className={activeTab.dirty ? "st-dot dirty" : "st-dot"} title={activeTab.dirty ? "有未保存的修改" : "已保存"} />
              {saving ? "保存中…" : activeTab.dirty ? "未保存 · Ctrl+S 保存" : "已保存"}
              <span>·</span>
              {countWords(activeTab.content)} 字
            </>
          ) : null}
        </span>
      </div>

      <MemoModal open={memoOpen} onClose={() => setMemoOpen(false)} project={project} onStatus={setStatus} askText={askText} />

      <InputDialog req={inputReq} />
      <ConfirmDialog req={confirmReq} />

      {pending ? (
        <div className="qmodal scrim">
          <div className="qbox glass sheet wide">
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
    </div>
  );
}

/** 供后续 AI 批次复用的路径工具（保持与 store 层同一口径） */
export const paths = { join, projectDocsDir, projectChaptersDir };

/** 维护文档回写入口（格式优先；供工具层调用） */
export const markdownOps = { appendToDoc, appendToSection, replaceInSection };
