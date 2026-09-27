/**
 * 文件系统桥。
 *
 * 业务层（src/core/**）不直接碰 Node/浏览器 API，只依赖本接口；
 * 生产环境走 Tauri IPC（Rust 侧 fs_* 命令），测试环境走 node:fs 替身。
 * 这是 CONTRACT §10「路径分级授权」的落点：所有路径都要先过 pathGuard。
 */

export interface DirEntry {
  /** 文件名（不含路径） */
  name: string;
  /** 相对查询目录的路径，'\' 分隔，与真机一致 */
  rel: string;
  /** 绝对路径 */
  path: string;
  isDir: boolean;
  size: number;
  /** 毫秒时间戳 */
  mtimeMs: number;
}

export interface StatInfo {
  isDir: boolean;
  size: number;
  mtimeMs: number;
}

export interface FsBridge {
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  appendText(path: string, content: string): Promise<void>;
  /** 列出目录的直接子项；目录不存在时返回 [] */
  list(dir: string): Promise<DirEntry[]>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  /** recursive=false 时删空目录或单文件 */
  remove(path: string, recursive: boolean): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  copy(from: string, to: string): Promise<void>;
  stat(path: string): Promise<StatInfo | null>;
}

/** Tauri IPC 调用签名（与 @tauri-apps/api 的 invoke 同形） */
export type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

/** 生产实现：把每个动作映射到 Rust 的 fs_* 命令 */
export function createTauriFs(invoke: InvokeFn): FsBridge {
  return {
    readText: (path) => invoke<string>("fs_read_text", { path }),
    writeText: (path, content) => invoke<void>("fs_write_text", { path, content }),
    appendText: (path, content) => invoke<void>("fs_append_text", { path, content }),
    list: (dir) => invoke<DirEntry[]>("fs_list", { dir }),
    exists: (path) => invoke<boolean>("fs_exists", { path }),
    mkdir: (path) => invoke<void>("fs_mkdir", { path }),
    remove: (path, recursive) => invoke<void>("fs_remove", { path, recursive }),
    rename: (from, to) => invoke<void>("fs_rename", { from, to }),
    copy: (from, to) => invoke<void>("fs_copy", { from, to }),
    stat: (path) => invoke<StatInfo | null>("fs_stat", { path }),
  };
}

let current: FsBridge | null = null;

/** 注入当前进程使用的桥（应用启动时调用一次） */
export function setFs(fs: FsBridge): void {
  current = fs;
}

export function getFs(): FsBridge {
  if (!current) throw new Error("FsBridge 未初始化：启动时必须先 setFs()");
  return current;
}
