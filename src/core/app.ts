/**
 * 应用启动：装配文件系统桥、解析目录权威、载入配置。
 * 这是 TS 侧唯一的"启动一次"入口，界面只依赖它的返回值。
 */

import { invoke } from "@tauri-apps/api/core";
import { createTauriFs, setFs } from "./fsbridge";
import { resolveDirs, type AppDirs, type DirsInput } from "./dirs";
import { accentHex, parsePrefs, serializePrefs, type Prefs } from "./prefs";

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

/** boot 单例因**存储路径键变更**被替换时的监听者（N-05：主工作台常驻挂载后，
 *  只有「作品根/技能根变了」这类必须重新装配的变化才通知——普通 prefs 保存
 *  （温度、主题……）主工作台重渲染时直读单例即可，不该触发重装配）。 */
const bootReplacedListeners = new Set<() => void>();

/** 订阅「存储路径变更导致的 boot 替换」；返回退订函数 */
export function onBootReplaced(cb: () => void): () => void {
  bootReplacedListeners.add(cb);
  return () => {
    bootReplacedListeners.delete(cb);
  };
}

/** 启动时的目录推导输入：设置里改路径后用它即时重推 dirs，不必等重启 */
let bootInput: DirsInput | null = null;

export function currentBoot(): Boot | null {
  return booted;
}

/**
 * 启动（**幂等**，KL-TL-10）：并发/重复调用共用同一次装配。
 * 装配含 `setFs`（进程级单例赋值）与四次 mkdir，重复跑既浪费也会把
 * `booted` 覆盖成另一份对象（界面上看到的两份 prefs 可能不是同一个引用）。
 * 失败则把 promise 清掉 —— 让下一次调用还有重试机会，而不是永久卡在失败态。
 */
let bootPromise: Promise<Boot> | null = null;

export function boot(): Promise<Boot> {
  if (bootPromise === null) {
    bootPromise = doBoot().catch((e: unknown) => {
      bootPromise = null;
      throw e;
    });
  }
  return bootPromise;
}

async function doBoot(): Promise<Boot> {
  setFs(createTauriFs(invoke));

  const sys = await invoke<SysDirsReply>("app_dirs");
  const raw = await invoke<string>("prefs_load");
  const prefs = parsePrefs(raw);

  bootInput = {
    home: sys.home,
    documents: sys.documents,
    appData: sys.appData,
    booksRoot: prefs.customNovelsDir || null,
    skillsDir: prefs.customSkillsDir || null,
  };
  const dirs = resolveDirs(bootInput);

  // 首次运行：确保目录存在（作品根 / 应用数据三个根）
  await invoke("fs_mkdir", { path: dirs.booksRoot });
  await invoke("fs_mkdir", { path: dirs.sessionsDir });
  await invoke("fs_mkdir", { path: dirs.snapshotsDir });
  await invoke("fs_mkdir", { path: dirs.skillsDir });

  booted = { dirs, prefs };
  return booted;
}

/** 保存配置并同步进程内单例。
 *  路径类键（custom_novels_dir / custom_skills_dir）变化时即时重推 dirs，
 *  使设置屏的展示与返回主界面后的重新装配都拿到新路径（无需重启）。
 *  N-22：内存单例在**调用的同步段**就更新（先于写盘 await）——「卸载兜底保存
 *  在途时重进设置屏」不再读到旧 prefs 把它写回去；写盘失败则回滚内存，避免
 *  内存与磁盘漂移。 */
export async function savePrefs(prefs: Prefs): Promise<void> {
  const prev = booted;
  if (booted) {
    const dirs = bootInput
      ? resolveDirs({
          ...bootInput,
          booksRoot: prefs.customNovelsDir || null,
          skillsDir: prefs.customSkillsDir || null,
        })
      : booted.dirs;
    booted = { dirs, prefs };
  }
  try {
    await invoke("prefs_save", { json: serializePrefs(prefs) });
  } catch (e) {
    if (prev) booted = prev; // 写盘失败：内存回到保存前，与磁盘保持一致
    throw e;
  }
  // 存储路径键变了：通知常驻挂载的主工作台重新装配（N-05 的配套通道）
  if (
    prev &&
    (prev.prefs.customNovelsDir !== prefs.customNovelsDir ||
      prev.prefs.customSkillsDir !== prefs.customSkillsDir)
  ) {
    for (const cb of bootReplacedListeners) cb();
  }
}

/** 把配置里的强调色（ARGB int，既有键 custom_accent_color）应用到 CSS 令牌。
 *  只写 --accent 本体；--accent-2/--accent-soft 等派生色在 tokens.css 里
 *  以 color-mix(var(--accent)) 定义，随主题与强调色自动联动。 */
export function applyAccentFromPrefs(prefs: Prefs): void {
  // 与 prefs.accentHex 同一份实现（KL-TL-10：这里原先自带一遍位运算，
  // 两处大小写还不一致；CSS 十六进制大小写不敏感，但"两处各写一遍"迟早会漂）
  document.documentElement.style.setProperty("--accent", accentHex(prefs.customAccentColor));
}

/** 应用主题（DeepCompose：dark / light / dsblue 三套实色主题；
 *  theme_mode 扩展键缺省时按既有键 is_dark_mode 派生，见 prefs.parsePrefs） */
export function applyThemeFromPrefs(prefs: Prefs): void {
  document.documentElement.dataset.theme = prefs.themeMode;
}
