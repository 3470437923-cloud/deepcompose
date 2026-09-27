import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import logo from "../assets/logo.png";
import { boot, currentBoot, savePrefs } from "../core/app";
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

interface OpenTab {
  /** 相对作品根路径（'\\' 分隔） */
  rel: string;
  path: string;
  name: string;
  kind: "doc" | "chapter" | "root";
  content: string;
  dirty: boolean;
}

/** 字数统计：中文按字、西文按词（与真机「文章总字数」口径一致：非空白字符计） */
export function countWords(text: string): number {
  return text.replace(/\s/g, "").length;
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

  const dirs = currentBoot()?.dirs ?? null;

  const activeTab = useMemo(() => tabs.find((t) => t.rel === activeRel) ?? null, [tabs, activeRel]);

  /** 首次启动：装配桥与目录，然后扫描作品 */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const b = await boot();
        const fs = getFs();
        const list = await (await import("../core/store/project")).scanBooksRoot(fs, b.dirs.booksRoot);
        if (!alive) return;
        setProjects(list);
        setReady(true);
        setStatus(`作品根：${b.dirs.booksRoot}`);
      } catch (e) {
        if (alive) setError(String(e));
      }
    })();
    return () => {
      alive = false;
    };
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
      setTabs((prev) => [...prev, { rel: ref.rel, path: ref.path, name: ref.name, kind, content, dirty: false }]);
      setActiveRel(ref.rel);
    },
    [project, tabs],
  );

  const closeTab = useCallback(
    (rel: string) => {
      setTabs((prev) => {
        const next = prev.filter((t) => t.rel !== rel);
        if (activeRel === rel) setActiveRel(next.length ? next[next.length - 1].rel : null);
        return next;
      });
    },
    [activeRel],
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
      await fs.writeText(activeTab.path, activeTab.content);
      setTabs((prev) => prev.map((t) => (t.rel === activeTab.rel ? { ...t, dirty: false } : t)));
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
  }, [activeTab, project]);

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
    const name = window.prompt("新书名称");
    if (!name) return;
    try {
      const ref = await createProject(getFs(), dirs.booksRoot, name);
      await refreshProjects();
      await openProject(ref);
    } catch (e) {
      setStatus(`新建失败：${String(e)}`);
    }
  }, [dirs, refreshProjects, openProject]);

  const win = getCurrentWindow();

  if (error) {
    return (
      <div className="fitter">
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

            <div className="b-body">
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
                  <button className="b-icon-btn accent" title="新建对话" disabled>
                    <svg viewBox="0 0 20 20" className="ic">
                      <path d="M10 4.5v11M4.5 10h11" />
                    </svg>
                  </button>
                </div>
                <div className="b-day">今天</div>
                <div className="b-status" style={{ position: "absolute", top: 130, left: 12, right: 12 }}>
                  {ready ? "AI 对话将在下一批接入" : "加载中…"}
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

              {/* ── 中：编辑区 ── */}
              <div className="b-chat">
                <div className="b-chat-head">
                  <div className="b-newchat" onClick={newProject} style={{ cursor: "pointer" }}>
                    <svg viewBox="0 0 20 20" className="ic">
                      <path d="M4 5.4h7M4 9.4h7M4 13.4h4.5" />
                      <path d="M13.9 13.3l2.6-2.6 1.1 1.1-2.6 2.6-1.5.4.4-1.5z" />
                    </svg>
                    新建作品
                  </div>
                  <div className="b-toolrow">
                    <button
                      className="b-icon-btn"
                      title="重新扫描作品"
                      onClick={() => void refreshProjects()}
                    >
                      <svg viewBox="0 0 20 20" className="ic">
                        <path d="M16.4 10a6.4 6.4 0 1 1-1.9-4.6" />
                        <path d="M16.6 3.4v3.4h-3.4" />
                      </svg>
                    </button>
                    <button className="b-icon-btn" title="保存 (Ctrl+S)" onClick={() => void saveActive()}>
                      <svg viewBox="0 0 20 20" className="ic">
                        <path d="M4 3.6h9.4L16.4 6.6v9.8H4z" />
                        <path d="M7 3.6v4.8h6V3.6M7 16.4v-4.2h6v4.2" />
                      </svg>
                    </button>
                  </div>
                  <div className="b-booklbl">
                    <svg viewBox="0 0 20 20" className="ic">
                      <path d="M2.8 4.4A1.6 1.6 0 0 1 4.4 2.8h3.2c.9 0 1.6.7 1.6 1.6v11.4a1.2 1.2 0 0 0-1.2-1.2H2.8V4.4z" />
                      <path d="M17.2 4.4a1.6 1.6 0 0 0-1.6-1.6h-3.2c-.9 0-1.6.7-1.6 1.6v11.4a1.2 1.2 0 0 1 1.2-1.2h5.2V4.4z" />
                    </svg>
                    {project ? project.ref.name : "未选择作品"}
                  </div>
                </div>

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

                {activeTab ? (
                  <div className="b-editor">
                    <div className="b-editor-body" style={{ width: "100%" }}>
                      <h1>
                        <span className="hash">#</span>
                        {activeTab.name.replace(/\.md$/i, "")}
                      </h1>
                      <textarea
                        ref={editorRef}
                        value={activeTab.content}
                        onChange={(e) => editContent(e.target.value)}
                        spellCheck={false}
                        style={{
                          width: "100%",
                          height: 720,
                          marginTop: 12,
                          resize: "none",
                          fontFamily: "inherit",
                          fontSize: 15,
                          lineHeight: 1.9,
                          background: "transparent",
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="b-hero">
                    <div className="b-hero-logo">
                      <img src={logo} alt="" />
                    </div>
                    <h2>writerD</h2>
                    <p>从右侧目录打开一份资料或章节开始写作</p>
                    <div className="b-hero-actions">
                      <button className="hbtn" onClick={newProject}>
                        <svg viewBox="0 0 20 20" className="ic">
                          <path d="M3 4.6A1.6 1.6 0 0 1 4.6 3h4.2c.9 0 1.6.7 1.6 1.6v11.2a1.2 1.2 0 0 0-1.2-1.2H3V4.6z" />
                          <path d="M17 4.6A1.6 1.6 0 0 0 15.4 3h-4.2c-.9 0-1.6.7-1.6 1.6v11.2a1.2 1.2 0 0 1 1.2-1.2H17V4.6z" />
                        </svg>
                        新书启航
                      </button>
                      <button className="hbtn" onClick={() => void refreshProjects()}>
                        <svg viewBox="0 0 20 20" className="ic">
                          <path d="M3 4.6A1.6 1.6 0 0 1 4.6 3h4.2c.9 0 1.6.7 1.6 1.6v11.2a1.2 1.2 0 0 0-1.2-1.2H3V4.6z" />
                          <path d="M17 4.6A1.6 1.6 0 0 0 15.4 3h-4.2c-.9 0-1.6.7-1.6 1.6v11.2a1.2 1.2 0 0 1 1.2-1.2H17V4.6z" />
                        </svg>
                        刷新作品
                      </button>
                    </div>
                  </div>
                )}

                <div className="b-status">
                  <span>{activeTab ? `文章总字数：${countWords(activeTab.content)} 字` : status}</span>
                  {activeTab?.dirty ? <span>未保存</span> : null}
                  {saving ? <span>保存中…</span> : null}
                </div>
              </div>

              {/* ── 右：作品与目录 ── */}
              <div className="b-right">
                <div className="b-right-head">
                  <svg viewBox="0 0 20 20" className="ic">
                    <path d="M2.8 5.2A1.6 1.6 0 0 1 4.4 3.6h3.2l1.4 1.8h6.6a1.6 1.6 0 0 1 1.6 1.6v7.8a1.6 1.6 0 0 1-1.6 1.6H4.4a1.6 1.6 0 0 1-1.6-1.6V5.2z" />
                  </svg>
                  <div className="ttl">目录</div>
                  <button className="b-icon-btn" title="刷新" onClick={() => void refreshProjects()}>
                    <svg viewBox="0 0 20 20" className="ic">
                      <path d="M16.4 10a6.4 6.4 0 1 1-1.9-4.6" />
                      <path d="M16.6 3.4v3.4h-3.4" />
                    </svg>
                  </button>
                </div>

                <div className="tree">
                  {projects.map((p) => (
                    <button
                      key={p.root}
                      className={project?.ref.root === p.root ? "tnode on" : "tnode"}
                      title={p.root}
                      onClick={() => void openProject(p)}
                    >
                      <svg viewBox="0 0 20 20" className="ic doc">
                        <path d="M3 4.6A1.6 1.6 0 0 1 4.6 3h5.8l4.6 4.6v8.8A1.6 1.6 0 0 1 13.4 18H4.6A1.6 1.6 0 0 1 3 16.4V4.6z" />
                      </svg>
                      {p.name}
                    </button>
                  ))}
                  {ready && projects.length === 0 ? (
                    <div className="b-status" style={{ position: "static", padding: "10px 12px" }}>
                      作品根下还没有作品
                    </div>
                  ) : null}
                </div>

                {project ? (
                  <>
                    <div className="b-div"></div>
                    <button className="tnode grp">
                      <svg
                        viewBox="0 0 12 12"
                        className="caret"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 4.5L6 7.5l3-3" />
                      </svg>
                      <svg viewBox="0 0 20 20" className="ic folder">
                        <path d="M2.8 5.4A1.6 1.6 0 0 1 4.4 3.8h3l1.4 1.8h6.8a1.6 1.6 0 0 1 1.6 1.6v7.4a1.6 1.6 0 0 1-1.6 1.6H4.4a1.6 1.6 0 0 1-1.6-1.6V5.4z" />
                      </svg>
                      小说资料
                    </button>
                    {project.docs.map((d) => (
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
                    <button className="tnode grp">
                      <svg
                        viewBox="0 0 12 12"
                        className="caret"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 4.5L6 7.5l3-3" />
                      </svg>
                      <svg viewBox="0 0 20 20" className="ic folder">
                        <path d="M2.8 5.4A1.6 1.6 0 0 1 4.4 3.8h3l1.4 1.8h6.8a1.6 1.6 0 0 1 1.6 1.6v7.4a1.6 1.6 0 0 1-1.6 1.6H4.4a1.6 1.6 0 0 1-1.6-1.6V5.4z" />
                      </svg>
                      章节内容
                    </button>
                    {project.chapters.map((c) => (
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
                ) : null}
              </div>
            </div>
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
