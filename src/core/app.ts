/**
 * 应用启动：装配文件系统桥、解析目录权威、载入配置。
 * 这是 TS 侧唯一的"启动一次"入口，界面只依赖它的返回值。
 */

import { invoke } from "@tauri-apps/api/core";
import { createTauriFs, setFs } from "./fsbridge";
import { resolveDirs, type AppDirs } from "./dirs";
import { parsePrefs, serializePrefs, type Prefs } from "./prefs";

export interface SysDirsReply {
  home: string;
  documents: string;
  appData: string;
  prefsDir: string;
  prefsFile: string;
}

export interface Boot {
  dirs: AppDirs;
  prefs: Prefs;
}

/** 进程级单例：启动结果 */
let booted: Boot | null = null;

export function currentBoot(): Boot | null {
  return booted;
}

export async function boot(): Promise<Boot> {
  setFs(createTauriFs(invoke));

  const sys = await invoke<SysDirsReply>("app_dirs");
  const raw = await invoke<string>("prefs_load");
  const prefs = parsePrefs(raw);

  const dirs = resolveDirs({
    home: sys.home,
    documents: sys.documents,
    appData: sys.appData,
    booksRoot: prefs.customNovelsDir || null,
    skillsDir: prefs.customSkillsDir || null,
  });

  // 首次运行：确保目录存在（作品根 / 应用数据三个根）
  await invoke("fs_mkdir", { path: dirs.booksRoot });
  await invoke("fs_mkdir", { path: dirs.sessionsDir });
  await invoke("fs_mkdir", { path: dirs.snapshotsDir });
  await invoke("fs_mkdir", { path: dirs.skillsDir });

  booted = { dirs, prefs };
  return booted;
}

export async function savePrefs(prefs: Prefs): Promise<void> {
  await invoke("prefs_save", { json: serializePrefs(prefs) });
  if (booted) booted = { ...booted, prefs };
}

/** 把配置里的强调色（ARGB int，既有键 custom_accent_color）应用到 CSS 令牌。
 *  只写 --accent 本体；--accent-2/--accent-soft 等派生色在 tokens.css 里
 *  以 color-mix(var(--accent)) 定义，随主题与强调色自动联动。 */
export function applyAccentFromPrefs(prefs: Prefs): void {
  const hex = `#${(prefs.customAccentColor & 0xffffff).toString(16).padStart(6, "0")}`;
  document.documentElement.style.setProperty("--accent", hex);
}

/** 应用主题（writerD 3.0：dark / light / dsblue 三套液态玻璃；
 *  theme_mode 扩展键缺省时按既有键 is_dark_mode 派生，见 prefs.parsePrefs） */
export function applyThemeFromPrefs(prefs: Prefs): void {
  document.documentElement.dataset.theme = prefs.themeMode;
}
