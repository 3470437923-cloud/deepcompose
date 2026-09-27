import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import logo from "../assets/logo.png";
import { boot, applyAccentFromPrefs, currentBoot, savePrefs } from "../core/app";
import { getFs } from "../core/fsbridge";
import { join, projectChaptersDir, projectDocsDir } from "../core/dirs";
import {
  createProject,
  listChapters,
  listDocs,
  loadProject,
  type FileRef,
  type ProjectData,
  type ProjectRef,
} from "../core/store/project";
import { appendToDoc, appendToSection, replaceInSection } from "../core/store/markdown";
import { createTauriTransport } from "../core/ai/transport";
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
  /** 相对作品根路径（'\\' 分隔） */
  rel: string;
  path: string;
  name: string;
  kind: "doc" | "chapter" | "root";
  /** 打开时的磁盘内容（写前快照的 previousContent 来源） */
  baseContent: string;
  content: string;
  dirty: boolean;
}

/** 字数统计：中文按字、西文按词（与真机「文章总字数」口径一致：非空白字符计） */
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

/** 会话相对时间（真机口径：N 分钟前 / N 小时前 / 昨天 / 日期） */
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

/** 会话按日分组（真机：今天 / 昨天 / 更早） */
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

  // ── 面板与目录状态 ──
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const [bookMenu, setBookMenu] = useState(false);
  const [openFolders, setOpenFolders] = useState<{ docs: boolean; chapters: boolean }>({
    docs: true,
    chapters: true,
  });

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

  /** 装配数据：载入作品（不改 prefs；启动恢复与 openProject 共用） */
  const openProjectRef = useCallback(async (ref: ProjectRef) => {
    const fs = getFs();
    const data = await loadProject(fs, ref.root, ref.name);
    setProject(data);
    setTabs([]);
    setActiveRel(null);
    setStatus(`${ref.name}：${data.chapters.length} 章 / ${data.docs.length} 份资料`);
  }, []);

  /** 首次启动：装配桥与目录，扫描作品 + 技能；恢复上次打开的作品（真机行为） */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const b = await boot();
        applyAccentFromPrefs(b.prefs);
        const fs = getFs();
        const { scanBooksRoot } = await import("../core/store/project");
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
    const { scanBooksRoot } = await import("../core/store/project");
    setProjects(await scanBooksRoot(fs, dirs.booksRoot));
  }, [dirs]);

  const openProject = useCallback(async (ref: ProjectRef) => {
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
  }, []);

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
      // 写前快照（硬约束 #2）：手动保存与工具回写同纪律
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
      setStatus("请先在右侧目录选择作品");
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

  /** 打开会话：若会话绑定了项目则恢复绑定（真机行为） */
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
          const { scanBooksRoot } = await import("../core/store/project");
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
    setStatus("新对话");
  }, [project]);

  const modelLabel = currentBoot()?.prefs.model?.trim() || "未配置模型";

  const sessionGroups = useMemo(() => groupSessions(sessions), [sessions]);

  /** 会话列表布局：日标签 24px + 行 32px，自上而下排 */
  const convLayout = useMemo(() => {
    let top = 0;
    const rows: { kind: "day" | "conv"; top: number; label?: string; s?: SessionListEntry }[] = [];
    for (const g of sessionGroups) {
      rows.push({ kind: "day", top, label: g.label });
      top += 24;
      for (const s of g.items) {
        rows.push({ kind: "conv", top, s });
        top += 32;
      }
    }
    return { rows, height: top + 8 };
  }, [sessionGroups]);

  if (error) {
    return (
      <div className="fitter" id="screenB">
        <div className="holder">
          <div className="win-frame">
            <div className="win">
              <div className="b-status" style={{ padding: 24 }}>
                启动失败：{error}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fitter" id="screenB">
      <div className="holder">
        <div className="win-frame">
          <div className="win">
            {/* ── 标题栏 ── */}
            <div className="titlebar">
              <div className="brand">
                <div className="brand-mark">
                  <img src={logo} alt="" />
                </div>
                <div className="brand-name">writerD</div>
              </div>
              <div className="win-tools">
                <div className="tool-group">
                  <button
                    className={showLeft ? "tbtn on" : "tbtn"}
                    title="会话栏"
                    onClick={() => setShowLeft((v) => !v)}
                  >
                    <svg viewBox="0 0 20 20" className="ic">
                      <rect x="2.5" y="4" width="15" height="12" rx="2" />
                      <path d="M13.5 4v12M2.5 8h11" />
                    </svg>
                  </button>
                  <button
                    className={showRight ? "tbtn on" : "tbtn"}
                    title="目录栏"
                    onClick={() => setShowRight((v) => !v)}
                  >
                    <svg viewBox="0 0 20 20" className="ic">
                      <rect x="2.5" y="4" width="15" height="12" rx="2" />
                      <path d="M13.5 4v12" />
                    </svg>
                  </button>
                </div>
                <button className="tbtn" title="日志">
                  <svg viewBox="0 0 20 20" className="ic">
                    <rect x="3" y="2.5" width="14" height="15" rx="2.5" />
                    <path d="M6.5 6.5h7M6.5 10h7M6.5 13.5h4" />
                  </svg>
                </button>
                <button className="tbtn bell" title="通知">
                  <svg viewBox="0 0 20 20" className="ic">
                    <path d="M10 2.5a4.6 4.6 0 0 0-4.6 4.6c0 3.6-1.4 4.7-1.4 4.7h12s-1.4-1.1-1.4-4.7A4.6 4.6 0 0 0 10 2.5z" />
                    <path d="M8.4 14.6a1.7 1.7 0 0 0 3.2 0" />
                  </svg>
                </button>
                <button className="tbtn" title="帮助">
                  <svg viewBox="0 0 20 20" className="ic">
                    <circle cx="10" cy="10" r="7.5" />
                    <path d="M7.9 7.7a2.2 2.2 0 1 1 3 2c-.6.4-.9.8-.9 1.5" />
                    <circle cx="10" cy="14" r=".8" className="ic-fill" stroke="none" />
                  </svg>
                </button>
                <div className="spacer" />
                <button className="tbtn" title="最小化" onClick={() => void win.minimize()}>
                  <svg viewBox="0 0 20 20" className="ic">
                    <path d="M5 10h10" />
                  </svg>
                </button>
                <button className="tbtn" title="最大化" onClick={() => void win.toggleMaximize()}>
                  <svg viewBox="0 0 20 20" className="ic">
                    <rect x="4" y="4.5" width="11" height="11" rx="2" />
                  </svg>
                </button>
                <button className="tbtn" title="关闭" onClick={() => void win.close()}>
                  <svg viewBox="0 0 20 20" className="ic">
                    <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />
                  </svg>
                </button>
              </div>
            </div>

            <div className={`b-body${showLeft ? "" : " hide-left"}${showRight ? "" : " hide-right"}`}>
              {/* ── 左：对话列表 ── */}
              <div className="b-left">
                <div className="b-left-head">
                  <svg viewBox="0 0 20 20" className="ic">
                    <path
                      d="M3 4.6A1.6 1.6 0 0 1 4.6 3h6.3l5.1 5.1v7.3A1.6 1.6 0 0 1 14.4 17H4.6A1.6 1.6 0 0 1 3 15.4V4.6z"
                      transform="translate(-1.2,0)"
                    />
                  </svg>
                  <div className="ttl">对话列表</div>
                  <button className="b-icon-btn" title="管理">
                    <svg viewBox="0 0 20 20" className="ic">
                      <path d="M4 6h8M4 10h8M4 14h5" />
                      <circle cx="15" cy="6" r="1.5" />
                      <circle cx="15" cy="14" r="1.5" />
                    </svg>
                  </button>
                  <button className="b-icon-btn accent" title="新建对话" onClick={startNewChat}>
                    <svg viewBox="0 0 20 20" className="ic">
                      <path d="M10 4.5v11M4.5 10h11" />
                    </svg>
                  </button>
                </div>
                <div className="b-left-list" style={{ height: Math.max(convLayout.height, 400) }}>
                  {convLayout.rows.map((r, i) =>
                    r.kind === "day" ? (
                      <div key={`d${i}`} className="b-day" style={{ top: `${r.top}px` }}>
                        {r.label}
                      </div>
                    ) : (
                      <button
                        key={r.s!.id}
                        className={session?.id === r.s!.id ? "b-conv on" : "b-conv"}
                        style={{ top: `${r.top}px` }}
                        title={r.s!.title}
                        onClick={() => void openSession(r.s!.id)}
                      >
                        <em style={{ fontStyle: "normal" }}>{r.s!.title}</em>
                        <span>{relTime(r.s!.mtimeMs ?? 0)}</span>
                      </button>
                    ),
                  )}
                </div>
                <div className="b-user">
                  <div className="b-user-avatar">
                    <svg viewBox="0 0 20 20" className="ic-fill">
                      <circle cx="10" cy="7" r="3.1" />
                      <path d="M3.6 17.2c.6-3.2 3.2-5 6.4-5s5.8 1.8 6.4 5z" />
                    </svg>
                  </div>
                  <div className="uname">{project ? project.ref.name : "未选择作品"}</div>
                  <button className="b-icon-btn gear" title="设置" onClick={onOpenSettings}>
                    <svg viewBox="0 0 20 20" className="ic">
                      <circle cx="10" cy="10" r="2.4" />
                      <path d="M16.1 11.9a1.25 1.25 0 0 0 .25 1.38l.04.05a1.5 1.5 0 1 1-2.12 2.12l-.05-.04a1.25 1.25 0 0 0-1.38-.25 1.25 1.25 0 0 0-.75 1.14v.15a1.5 1.5 0 1 1-3 0v-.08a1.25 1.25 0 0 0-.82-1.14 1.25 1.25 0 0 0-1.38.25l-.05.04A1.5 1.5 0 1 1 3.9 13.4l.04-.05a1.25 1.25 0 0 0 .25-1.38 1.25 1.25 0 0 0-1.14-.75h-.15a1.5 1.5 0 1 1 0-3h.08a1.25 1.25 0 0 0 1.14-.82 1.25 1.25 0 0 0-.25-1.38L3.9 5.97A1.5 1.5 0 1 1 6.02 3.85l.05.04a1.25 1.25 0 0 0 1.38.25h.06a1.25 1.25 0 0 0 .75-1.14v-.15a1.5 1.5 0 1 1 3 0v.08a1.25 1.25 0 0 0 .75 1.14 1.25 1.25 0 0 0 1.38-.25l.05-.04a1.5 1.5 0 1 1 2.12 2.12l-.04.05a1.25 1.25 0 0 0-.25 1.38v.06a1.25 1.25 0 0 0 1.14.75h.15a1.5 1.5 0 1 1 0 3h-.08a1.25 1.25 0 0 0-1.14.75z" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* ── 中：对话列 ── */}
              <div className="b-chat">
                <div className="b-chat-head">
                  <div className="b-newchat">
                    <svg viewBox="0 0 20 20" className="ic">
                      <path d="M4 5.4h7M4 9.4h7M4 13.4h4.5" />
                      <path d="M13.9 13.3l2.6-2.6 1.1 1.1-2.6 2.6-1.5.4.4-1.5z" />
                    </svg>
                    {session?.title?.trim() ? session.title : "新对话"}
                  </div>
                </div>

                <div className="b-quickrow">
                  {(
                    [
                      ["备忘录", <svg key="i1" viewBox="0 0 20 20" className="ic"><rect x="3" y="2.8" width="14" height="14.4" rx="2.2" /><path d="M6.6 7h6.8M6.6 10.2h6.8M6.6 13.4h4" /></svg>, "memo"],
                      ["起名", <svg key="i2" viewBox="0 0 20 20" className="ic"><path d="M3.4 5.4V3.6h12.2v1.8M9 3.8v12.4M6.6 16.4h4.8" /></svg>, "起名"],
                      ["蒸馏", <svg key="i3" viewBox="0 0 20 20" className="ic"><path d="M8.4 2.8h3.2M9 2.8v4L4.6 15a1.6 1.6 0 0 0 1.4 2.4h8a1.6 1.6 0 0 0 1.4-2.4L11 6.8v-4" /><path d="M6.4 12.4h7.2" /></svg>, "蒸馏"],
                      ["拆解", <svg key="i4" viewBox="0 0 20 20" className="ic"><rect x="3" y="3" width="14" height="14" rx="2.2" /><path d="M6.6 7.2h6.8M6.6 10.4h6.8M6.6 13.6h4" /></svg>, "拆解"],
                      ["扫榜", <svg key="i5" viewBox="0 0 20 20" className="ic"><path d="M4 16.6V9.4M9 16.6V4.6M14 16.6v-5" /><path d="M3 16.6h14" /></svg>, "扫榜"],
                    ] as [string, React.ReactNode, string][]
                  ).map(([label, icon, action]) => (
                    <button
                      key={label}
                      className="qbtn"
                      onClick={() => {
                        if (action === "memo") setMemoOpen(true);
                        else setStatus(`${label}功能建设中`);
                      }}
                    >
                      {icon}
                      {label}
                    </button>
                  ))}
                </div>

                {session && session.messages.length > 0 ? (
                  <div className="chat-list">
                    {session.messages.map((m) => (
                      <div key={m.id} className={m.role === "user" ? "msg user" : "msg"}>
                        <div className="who">{m.role === "user" ? "我" : "writerD"}</div>
                        {m.thinking ? <div className="think">{m.thinking}</div> : null}
                        {m.text ? <div className="body">{m.text}</div> : null}
                        {(m.toolCalls ?? []).map((t) => {
                          const bad = (t.result ?? "").includes('"error"');
                          return (
                            <div key={t.callId} className="tool-line">
                              {t.name} {bad ? <span className="bad">✕</span> : <span className="ok">✓</span>}
                              {bad ? " " + extractError(t.result ?? "") : ""}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    {toolLog.map((t, i) => (
                      <div key={`live-${i}`} className="tool-line">
                        {t.name}{" "}
                        {t.status === "run" ? (
                          "…"
                        ) : t.status === "ok" ? (
                          <span className="ok">✓</span>
                        ) : (
                          <span className="bad">✕</span>
                        )}
                      </div>
                    ))}
                    {streamThink ? <div className="think">{streamThink}</div> : null}
                    {streamText ? (
                      <div className="msg">
                        <div className="who">writerD（生成中）</div>
                        <div className="body">{streamText}</div>
                      </div>
                    ) : null}
                    {chatError ? <div className="err-line">{chatError}</div> : null}
                    <div ref={chatBottom} />
                  </div>
                ) : (
                  <div className="b-hero">
                    <div className="b-hero-logo">
                      <img src={logo} alt="" />
                    </div>
                    <h2>writerD</h2>
                    <p>AI 小说写作助手</p>
                    <div className="b-hero-actions">
                      <button className="hbtn" onClick={newProject}>
                        <svg viewBox="0 0 20 20" className="ic">
                          <path d="M3 4.6A1.6 1.6 0 0 1 4.6 3h4.2c.9 0 1.6.7 1.6 1.6v11.2a1.2 1.2 0 0 0-1.2-1.2H3V4.6z" />
                          <path d="M17 4.6A1.6 1.6 0 0 0 15.4 3h-4.2c-.9 0-1.6.7-1.6 1.6v11.2a1.2 1.2 0 0 1 1.2-1.2H17V4.6z" />
                        </svg>
                        新书启航
                      </button>
                      <button className="hbtn" onClick={() => void continueWriting()}>
                        <svg viewBox="0 0 20 20" className="ic">
                          <path d="M4 5.4h7M4 9.4h7M4 13.4h4.5" />
                          <path d="M13.9 13.3l2.6-2.6 1.1 1.1-2.6 2.6-1.5.4.4-1.5z" />
                        </svg>
                        继续写作
                      </button>
                      <button className="hbtn" onClick={() => void refreshProjects()}>
                        <svg viewBox="0 0 20 20" className="ic">
                          <path d="M16.4 10a6.4 6.4 0 1 1-1.9-4.6" />
                          <path d="M16.6 3.4v3.4h-3.4" />
                        </svg>
                        刷新作品
                      </button>
                    </div>
                  </div>
                )}

                <div className="b-prechips">
                  <button className="pchip">
                    <svg viewBox="0 0 20 20" className="ic">
                      <circle cx="9" cy="9" r="5.4" />
                      <path d="M13 13l3.6 3.6" />
                    </svg>
                    搜索
                  </button>
                  <button className="pchip">
                    <svg viewBox="0 0 20 20" className="ic">
                      <rect x="2.8" y="3.6" width="14.4" height="12.8" rx="2.2" />
                      <path d="M6.4 8l2.2 2.4-2.2 2.4M10.8 12.8h3" />
                    </svg>
                    终端
                  </button>
                </div>
                <button className="b-quick" title="提示">
                  <svg viewBox="0 0 20 20" className="ic">
                    <path d="M10 2.6l1.9 5.2 5.2 1.9-5.2 1.9L10 16.8l-1.9-5.2L2.9 9.7l5.2-1.9L10 2.6z" className="ic-fill" stroke="none" />
                  </svg>
                </button>

                <div className="b-composer">
                  <textarea
                    className="composer-input"
                    value={composer}
                    placeholder="写下你的故事…"
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
                  <div className="b-comp-row">
                    <button className="cbtn skill" onClick={() => setStatus("@技能 功能建设中")}>
                      <svg viewBox="0 0 20 20" className="ic">
                        <circle cx="10" cy="10" r="6.8" />
                        <circle cx="10" cy="10" r="2.4" />
                      </svg>
                      @技能
                    </button>
                    <button className="cbtn file" onClick={() => setStatus("#文件 功能建设中")}>
                      <svg viewBox="0 0 20 20" className="ic">
                        <path d="M4.6 2.6h6.2l4 4v10.8H4.6z" />
                        <path d="M10.8 2.6v4h4" />
                      </svg>
                      #文件
                    </button>
                    <button className="cbtn plain">
                      <svg viewBox="0 0 20 20" className="ic">
                        <path d="M2.6 10.4A7.4 7.4 0 1 1 10 18a7.2 7.2 0 0 1-3.6-.95L2.6 18l1.1-3.6A7.4 7.4 0 0 1 2.6 10.4z" />
                      </svg>
                      默认
                    </button>
                    <button className="cbtn model" title="在设置中配置模型" onClick={onOpenSettings}>
                      <svg viewBox="0 0 16 16" className="ic">
                        <path
                          d="M8 1.6c2.6 3.3 3.9 5.6 3.9 7.1A3.9 3.9 0 0 1 8 12.6a3.9 3.9 0 0 1-3.9-3.9c0-1.5 1.3-3.8 3.9-7.1z"
                          fill="currentColor"
                          stroke="none"
                        />
                        <path d="M4.6 14.6h6.8" />
                      </svg>
                      {modelLabel}
                    </button>
                    {busy ? <span className="cbtn plain">生成中…</span> : null}
                    {!currentBoot()?.prefs.apiKey ? (
                      <span className="cbtn plain">未配置 API Key</span>
                    ) : null}
                    <button className="b-dice" title="随机">
                      <svg viewBox="0 0 20 20" className="ic">
                        <rect x="3" y="3" width="14" height="14" rx="3" />
                        <circle cx="7.4" cy="7.4" r="1.1" className="ic-fill" stroke="none" />
                        <circle cx="12.6" cy="12.6" r="1.1" className="ic-fill" stroke="none" />
                        <circle cx="10" cy="10" r="1.1" className="ic-fill" stroke="none" />
                      </svg>
                    </button>
                    <button className="b-send" title="发送" onClick={() => void doSend()} disabled={busy}>
                      <svg viewBox="0 0 24 24" className="ic">
                        <path d="M3.4 11.2L20.4 3.2l-7.8 17-2.2-6.8-7-2.2z" fill="currentColor" stroke="none" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="b-status">
                  <span>
                    {activeTab
                      ? `文章总字数：${countWords(activeTab.content)} 字${activeTab.dirty ? " · 未保存" : ""}${saving ? " · 保存中…" : ""}`
                      : status}
                  </span>
                </div>
              </div>

              {/* ── 编辑器列：标签条 ── */}
              {tabs.length > 0 ? (
                <div className="b-tabstrip">
                  {tabs.map((t) => (
                    <div
                      key={t.rel}
                      className={t.rel === activeRel ? "b-tab on" : "b-tab"}
                      onClick={() => setActiveRel(t.rel)}
                    >
                      <svg viewBox="0 0 16 16" className="ic-14">
                        <path d="M3.6 1.6h5.2l3.6 3.6v9.2H3.6z" fill="#5B9BFF" stroke="none" />
                        <path d="M8.8 1.6v3.6h3.6" fill="#2F6BB5" stroke="none" />
                      </svg>
                      <span className="nm">
                        {t.name}
                        {t.dirty ? " *" : ""}
                      </span>
                      <svg
                        viewBox="0 0 12 12"
                        className="x"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        onClick={(e) => {
                          e.stopPropagation();
                          closeTab(t.rel);
                        }}
                      >
                        <path d="M3.2 3.2l5.6 5.6M8.8 3.2l-5.6 5.6" />
                      </svg>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* ── 编辑器列 ── */}
              <div className="b-editor">
                {!activeTab ? (
                  <div className="b-editor-empty">
                    <div className="ee-icon">
                      <svg viewBox="0 0 20 20" className="ic">
                        <path d="M5 2.6h6.4l3.6 3.6v11.2H5z" />
                        <path d="M11.4 2.6v3.6H15" />
                        <path d="M7.6 10.4h4.8M7.6 13.2h4.8" />
                      </svg>
                    </div>
                    <div className="ee-t1">选择文件查看内容</div>
                    <div className="ee-t2">从右侧目录面板选择文件</div>
                  </div>
                ) : (
                  <div className="b-editor-body">
                    <h1>
                      <span className="hash">#</span>
                      {activeTab.name.replace(/\.md$/i, "")}
                    </h1>
                    <textarea
                      ref={editorRef}
                      className="editor-area"
                      value={activeTab.content}
                      onChange={(e) => editContent(e.target.value)}
                      spellCheck={false}
                    />
                  </div>
                )}
              </div>

              {/* ── 右：目录 ── */}
              <div className="b-right">
                <div className="b-right-head">
                  <svg viewBox="0 0 20 20" className="ic">
                    <path d="M2.8 5.2A1.6 1.6 0 0 1 4.4 3.6h3.2l1.4 1.8h6.6a1.6 1.6 0 0 1 1.6 1.6v7.8a1.6 1.6 0 0 1-1.6 1.6H4.4a1.6 1.6 0 0 1-1.6-1.6V5.2z" />
                  </svg>
                  <div className="ttl">目录</div>
                  <button className="b-icon-btn" title="自动滚动">
                    <svg viewBox="0 0 20 20" className="ic">
                      <circle cx="10" cy="10" r="2" />
                      <path d="M10 2.6v3.2M10 14.2v3.2M2.6 10h3.2M14.2 10h3.2M4.7 4.7l2.2 2.2M13.1 13.1l2.2 2.2M15.3 4.7l-2.2 2.2M6.9 13.1l-2.2 2.2" />
                    </svg>
                  </button>
                  <button className="b-icon-btn" title="搜索">
                    <svg viewBox="0 0 20 20" className="ic">
                      <circle cx="9" cy="9" r="5.4" />
                      <path d="M13 13l3.6 3.6" />
                    </svg>
                  </button>
                  <button className="b-icon-btn" title="折叠" onClick={() => setOpenFolders({ docs: false, chapters: false })}>
                    <svg viewBox="0 0 20 20" className="ic">
                      <path d="M10 16.4V5.2M6.4 8.8L10 5.2l3.6 3.6" />
                    </svg>
                  </button>
                  <button className="b-icon-btn" title="刷新" onClick={() => void refreshProjects()}>
                    <svg viewBox="0 0 20 20" className="ic">
                      <path d="M16.4 10a6.4 6.4 0 1 1-1.9-4.6" />
                      <path d="M16.6 3.4v3.4h-3.4" />
                    </svg>
                  </button>
                  <button className="b-icon-btn" title="清空">
                    <svg viewBox="0 0 20 20" className="ic">
                      <path d="M4.4 5.6h11.2M8 5.6V3.9h4v1.7M6.2 5.6l.7 10.1h6.2l.7-10.1" />
                    </svg>
                  </button>
                </div>

                <button className="b-booksel" onClick={() => setBookMenu((v) => !v)} title="选择作品">
                  <svg viewBox="0 0 20 20" className="ic">
                    <path d="M3 4.6A1.6 1.6 0 0 1 4.6 3h5.8l4.6 4.6v8.8A1.6 1.6 0 0 1 13.4 18H4.6A1.6 1.6 0 0 1 3 16.4V4.6z" />
                  </svg>
                  <span className="bk">{project ? project.ref.name : "未选择作品"}</span>
                  <svg
                    viewBox="0 0 12 12"
                    className="uc"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 7.2L6 4.2l3 3M3 4.6L6 7.6l3-3" opacity=".9" />
                  </svg>
                </button>
                {bookMenu ? (
                  <div className="b-bookmenu">
                    {projects.map((p) => (
                      <button
                        key={p.root}
                        className={project?.ref.root === p.root ? "on" : ""}
                        title={p.root}
                        onClick={() => void openProject(p)}
                      >
                        <svg viewBox="0 0 20 20" className="ic">
                          <path d="M3 4.6A1.6 1.6 0 0 1 4.6 3h5.8l4.6 4.6v8.8A1.6 1.6 0 0 1 13.4 18H4.6A1.6 1.6 0 0 1 3 16.4V4.6z" />
                        </svg>
                        {p.name}
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
                      新建作品
                    </button>
                  </div>
                ) : null}
                <div className="b-div"></div>

                <div className="tree">
                  {project ? (
                    <>
                      <button
                        className="tnode grp"
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
                        小说资料
                      </button>
                      {openFolders.docs &&
                        project.docs.map((d) => (
                          <button
                            key={d.rel}
                            className={activeRel === d.rel ? "tnode sub on" : "tnode sub"}
                            onClick={() => void openFile(d, "doc")}
                          >
                            <svg viewBox="0 0 20 20" className="ic doc">
                              <path d="M5 2.6h6.4l3.6 3.6v11.2H5z" />
                              <path d="M11.4 2.6v3.6H15" />
                            </svg>
                            {d.name}
                          </button>
                        ))}
                      <button
                        className="tnode grp"
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
                        章节内容
                      </button>
                      {openFolders.chapters &&
                        project.chapters.map((c) => (
                          <button
                            key={c.rel}
                            className={activeRel === c.rel ? "tnode sub on" : "tnode sub"}
                            onClick={() => void openFile(c, "chapter")}
                          >
                            <svg viewBox="0 0 20 20" className="ic doc">
                              <path d="M5 2.6h6.4l3.6 3.6v11.2H5z" />
                              <path d="M11.4 2.6v3.6H15" />
                            </svg>
                            {c.name}
                          </button>
                        ))}
                    </>
                  ) : (
                    <div className="b-status" style={{ position: "static", padding: "10px 12px" }}>
                      从上方选择一部作品
                    </div>
                  )}
                </div>
              </div>
            </div>

            <MemoModal open={memoOpen} onClose={() => setMemoOpen(false)} project={project} onStatus={setStatus} askText={askText} />

            <InputDialog req={inputReq} />
            <ConfirmDialog req={confirmReq} />

            {pending ? (
              <div className="qmodal">
                <div className="qbox">
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
                  <button className="qsubmit" onClick={answerPending}>
                    提交
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 供后续 AI 批次复用的路径工具（保持与 store 层同一口径） */
export const paths = { join, projectDocsDir, projectChaptersDir };

/** 维护文档回写入口（格式优先；供工具层调用） */
export const markdownOps = { appendToDoc, appendToSection, replaceInSection };
