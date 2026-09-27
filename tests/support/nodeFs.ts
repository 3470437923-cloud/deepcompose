/**
 * 测试用 FsBridge 实现：映射到 node:fs，行为与 Tauri 侧 fs_* 命令一致。
 * 仅测试引用，生产代码不得 import 本文件。
 */
import { promises as fsp } from "node:fs";
import * as nodePath from "node:path";
import type { DirEntry, FsBridge, StatInfo } from "../../src/core/fsbridge";

export function createNodeFs(): FsBridge {
  return {
    async readText(path) {
      return fsp.readFile(path, "utf8");
    },
    async writeText(path, content) {
      await fsp.mkdir(nodePath.dirname(path), { recursive: true });
      await fsp.writeFile(path, content, "utf8");
    },
    async appendText(path, content) {
      await fsp.mkdir(nodePath.dirname(path), { recursive: true });
      await fsp.appendFile(path, content, "utf8");
    },
    async list(dir) {
      let names: string[];
      try {
        names = await fsp.readdir(dir);
      } catch {
        return [];
      }
      const out: DirEntry[] = [];
      for (const name of names) {
        const full = nodePath.join(dir, name);
        try {
          const st = await fsp.stat(full);
          out.push({
            name,
            rel: name,
            path: full,
            isDir: st.isDirectory(),
            size: st.size,
            mtimeMs: st.mtimeMs,
          });
        } catch {
          // 忽略瞬时消失的项
        }
      }
      return out;
    },
    async exists(path) {
      try {
        await fsp.access(path);
        return true;
      } catch {
        return false;
      }
    },
    async mkdir(path) {
      await fsp.mkdir(path, { recursive: true });
    },
    async remove(path, recursive) {
      await fsp.rm(path, { recursive, force: true });
    },
    async rename(from, to) {
      await fsp.mkdir(nodePath.dirname(to), { recursive: true });
      await fsp.rename(from, to);
    },
    async copy(from, to) {
      await fsp.mkdir(nodePath.dirname(to), { recursive: true });
      await fsp.cp(from, to, { recursive: true });
    },
    async stat(path): Promise<StatInfo | null> {
      try {
        const st = await fsp.stat(path);
        return { isDir: st.isDirectory(), size: st.size, mtimeMs: st.mtimeMs };
      } catch {
        return null;
      }
    },
  };
}
