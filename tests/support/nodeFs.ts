/**
 * 测试用 FsBridge 实现：映射到 node:fs，行为与 Tauri 侧 fs_* 命令**逐条同口径**
 * （对齐依据见 src-tauri/src/fs.rs；接口契约注释见 src/core/fsbridge.ts）。
 * 仅测试引用，生产代码不得 import 本文件。
 */
import { promises as fsp } from "node:fs";
import * as nodePath from "node:path";
import type { DirEntry, FsBridge, StatInfo } from "../../src/core/fsbridge";

/** 构造一个走真实磁盘（测试临时目录）的 FsBridge 替身 */
export function createNodeFs(): FsBridge {
  return {
    async readText(path) {
      // Rust fs_read_text 用 read_to_string：非法 UTF-8 直接报错、BOM 原样保留。
      // Node 的 readFile("utf8") 会把非法字节替换成 U+FFFD 并吞掉错误路径，
      // 故用 fatal + ignoreBOM 的 TextDecoder 对齐两侧行为。
      const buf = await fsp.readFile(path);
      return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buf);
    },
    async writeText(path, content) {
      // 对齐 Rust fs_write_text：先递归建父目录再整写
      await fsp.mkdir(nodePath.dirname(path), { recursive: true });
      await fsp.writeFile(path, content, "utf8");
    },
    async appendText(path, content) {
      // 对齐 Rust fs_append_text：父目录 + create + append
      await fsp.mkdir(nodePath.dirname(path), { recursive: true });
      await fsp.appendFile(path, content, "utf8");
    },
    async list(dir) {
      let names: string[];
      try {
        names = await fsp.readdir(dir);
      } catch {
        return []; // 对齐 Rust fs_list：目录不存在返回空表，不抛
      }
      const out: DirEntry[] = [];
      for (const name of names) {
        const full = nodePath.join(dir, name);
        try {
          const st = await fsp.stat(full);
          out.push({
            name,
            rel: name, // 直接子项：相对查询目录就是文件名本身（Rust 同口径）
            path: full,
            isDir: st.isDirectory(),
            size: st.isDirectory() ? 0 : st.size, // 目录 size 恒 0（Rust 同口径）
            mtimeMs: st.mtimeMs,
          });
        } catch {
          // 忽略瞬时消失的项（Rust 侧 metadata() 失败同样 continue）
        }
      }
      // 对齐 Rust fs_list 的稳定排序：目录在前，再按名称小写（影响 offset/limit 分页口径）
      out.sort((x, y) => {
        if (x.isDir !== y.isDir) return x.isDir ? -1 : 1;
        const xn = x.name.toLowerCase();
        const yn = y.name.toLowerCase();
        return xn < yn ? -1 : xn > yn ? 1 : 0;
      });
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
      // 对齐 Rust fs_mkdir：递归创建，已存在不报错
      await fsp.mkdir(path, { recursive: true });
    },
    async remove(path, recursive) {
      // 对齐 Rust fs_remove：目标不存在静默成功；recursive=false 时
      // 文件走 remove_file、目录走 remove_dir（空目录成功、非空目录抛错——
      // Node 的 rm(recursive:false) 对目录一律抛 EISDIR，须分流到 rmdir）
      if (!recursive) {
        const st = await fsp.stat(path).catch(() => null);
        if (st === null) return;
        if (st.isDirectory()) {
          await fsp.rmdir(path);
          return;
        }
      }
      await fsp.rm(path, { recursive, force: true });
    },
    async rename(from, to) {
      // 对齐 Rust fs_rename：先建目标父目录再改名（目标已存在则覆盖，两侧一致）
      await fsp.mkdir(nodePath.dirname(to), { recursive: true });
      await fsp.rename(from, to);
    },
    async copy(from, to) {
      // 对齐 Rust fs_copy：建目标父目录；目录递归复制，文件单拷（目标已存在则覆盖）
      await fsp.mkdir(nodePath.dirname(to), { recursive: true });
      await fsp.cp(from, to, { recursive: true });
    },
    async stat(path): Promise<StatInfo | null> {
      try {
        const st = await fsp.stat(path);
        // 目录 size 恒 0（Rust fs_stat 同口径）
        return { isDir: st.isDirectory(), size: st.isDirectory() ? 0 : st.size, mtimeMs: st.mtimeMs };
      } catch {
        return null; // 对齐 Rust fs_stat：不存在返回 None
      }
    },
  };
}
