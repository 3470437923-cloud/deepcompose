/**
 * 章节文件名与章号解析。
 *
 * 依据 CONTRACT §12 给出的真机正则：
 *   ^\s*(第\s*[0-9０-９零〇一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟萬]+\s*[章节卷回部集].*)\s*$
 * 真机文件名实测形如 `第1章.md`、`第10章.md`（阿拉伯数字），
 * 排序必须按数值而非字典序（否则 第10章 会排在 第2章 前面）。
 */

const CN_DIGITS: Record<string, number> = {
  零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9,
  壹: 1, 贰: 2, 叁: 3, 肆: 4, 伍: 5, 陆: 6, 柒: 7, 捌: 8, 玖: 9,
};

const CN_UNITS: Record<string, number> = {
  十: 10, 拾: 10, 百: 100, 佰: 100, 千: 1000, 仟: 1000,
};

/** 全角数字与全角空格归一 */
function normalize(s: string): string {
  return s.replace(/[０-９]/g, (c) => String(c.charCodeAt(0) - 0xff10)).replace(/\u3000/g, " ");
}

/** 解析中文数字（支持 十/百/千 组合，如 十、十一、二十、一百零三、一千零二十） */
export function parseCnNumber(s: string): number | null {
  const t = normalize(s).trim();
  if (t === "") return null;
  if (/^\d+$/.test(t)) return Number(t);

  let total = 0;
  let section = 0;
  let digit: number | null = null;
  let sawAny = false;

  for (const ch of t) {
    if (ch in CN_DIGITS) {
      digit = CN_DIGITS[ch];
      sawAny = true;
    } else if (ch in CN_UNITS) {
      const unit = CN_UNITS[ch];
      sawAny = true;
      if (digit === null) digit = 1; // 「十一」= 11
      section += digit * unit;
      digit = null;
    } else if (ch === "万" || ch === "萬") {
      sawAny = true;
      const base = section + (digit ?? 0);
      total += (base === 0 ? 1 : base) * 10000;
      section = 0;
      digit = null;
    } else {
      return null;
    }
  }
  if (!sawAny) return null;
  return total + section + (digit ?? 0);
}

const CHAPTER_RE = /^\s*第\s*([0-9０-９零〇一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟萬]+)\s*([章节卷回部集])(.*)$/;

export interface ChapterName {
  /** 章号（解析失败为 null） */
  no: number | null;
  /** 单位字：章 / 节 / 卷 / 回 / 部 / 集 */
  unit: string;
  /** 单位之后的剩余标题文本（不含扩展名） */
  rest: string;
}

/** 解析 `第12章 启程` / `第1章.md`（调用方先去掉扩展名） */
export function parseChapterName(base: string): ChapterName | null {
  const m = CHAPTER_RE.exec(normalize(base));
  if (!m) return null;
  return { no: parseCnNumber(m[1]), unit: m[2], rest: m[3].trim() };
}

/** 去掉 .md 扩展名 */
export function stripMd(name: string): string {
  return name.replace(/\.md$/i, "");
}

/** 排序键：有章号的按数值，无章号的排在最后并按名称 */
export function chapterSortKey(fileName: string): [number, number, string] {
  const parsed = parseChapterName(stripMd(fileName));
  if (parsed && parsed.no !== null) {
    const unitOrder = ["章", "节", "回", "集", "部", "卷"].indexOf(parsed.unit);
    return [0, parsed.no * 10 + (unitOrder < 0 ? 0 : unitOrder), fileName];
  }
  return [1, 0, fileName];
}

export function compareChapterFiles(a: string, b: string): number {
  const ka = chapterSortKey(a);
  const kb = chapterSortKey(b);
  if (ka[0] !== kb[0]) return ka[0] - kb[0];
  if (ka[1] !== kb[1]) return ka[1] - kb[1];
  return ka[2].localeCompare(kb[2], "zh-Hans-CN");
}
