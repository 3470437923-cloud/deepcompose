/**
 * 风格文件探测（文风优先级声明的依据）。
 * 新结构是 06-写作风格.md，老作品是 06-写作规则.md；两者任一存在即视为有依据。
 * 探测失败（目录不可读）按「没有」处理：没有依据就不宣布谁赢，退回原有装配。
 */
import type { FsBridge } from "../fsbridge";
import { join, PROJECT_DIRS } from "../dirs";

export const STYLE_DOC_NAMES = ["06-写作风格.md", "06-写作规则.md"] as const;

export async function projectHasStyleDoc(fs: FsBridge, projectRoot: string | null): Promise<boolean> {
  if (!projectRoot) return false;
  for (const name of STYLE_DOC_NAMES) {
    try {
      const st = await fs.stat(join(projectRoot, PROJECT_DIRS.docs, name));
      if (st && !st.isDir && !st.isLink) return true;
    } catch {
      // 单个文件不可读不代表另一个不存在，继续探测
    }
  }
  return false;
}
