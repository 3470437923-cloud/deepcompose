/**
 * Markdown 维护文档的行级编辑（「格式优先」的实现底座）。
 *
 * 硬约束：
 *   1. 只做「追加」与「节内局部替换」，**禁止整体重写**；
 *   2. 用户改过的格式（增减字段、调整结构）必须原样保留，**禁止恢复模板**；
 *   3. 除目标区间外，其余字节必须**逐字节不变**（含 CRLF / 行尾空格 / 空行数）。
 *
 * 因此本模块全部按「行数组 + 原样 EOL」工作，绝不重建文档结构。
 */

export interface LineDoc {
  /** 每行内容（不含 EOL） */
  lines: string[];
  /** 每行对应的 EOL 原文（'' 表示文件末尾无换行） */
  eols: string[];
}

export interface Section {
  /** '#' 的个数（1..6）；没有标题时为 0 */
  level: number;
  /** 标题文本（去掉 # 与前导空白后的原文） */
  title: string;
  /** 标题所在行下标；文档无标题时为 -1 */
  headingLine: number;
  /** 节的正文字段起始行（标题行的下一行） */
  bodyStart: number;
  /** 节的结束行（不含），即下一个同级或更高级标题的行下标；无则等于 lines.length */
  bodyEnd: number;
}

/** 拆行，保留每行原始 EOL */
export function splitLines(text: string): LineDoc {
  const lines: string[] = [];
  const eols: string[] = [];
  let cur = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\r") {
      if (text[i + 1] === "\n") {
        lines.push(cur);
        eols.push("\r\n");
        cur = "";
        i++;
      } else {
        lines.push(cur);
        eols.push("\r");
        cur = "";
      }
    } else if (ch === "\n") {
      lines.push(cur);
      eols.push("\n");
      cur = "";
    } else {
      cur += ch;
    }
  }
  // 末尾没有 EOL 的残余内容
  if (cur !== "" || lines.length === 0) {
    lines.push(cur);
    eols.push("");
  }
  return { lines, eols };
}

/** 还原为字符串 */
export function joinLines(doc: LineDoc): string {
  let out = "";
  for (let i = 0; i < doc.lines.length; i++) {
    out += doc.lines[i] + (doc.eols[i] ?? "");
  }
  return out;
}

/** 文档的主导 EOL（既有文件多为 CRLF，不能一律写 LF） */
export function dominantEol(doc: LineDoc): string {
  let crlf = 0;
  let lf = 0;
  for (const e of doc.eols) {
    if (e === "\r\n") crlf++;
    else if (e === "\n") lf++;
  }
  return crlf >= lf ? "\r\n" : "\n";
}

/** 文档是否以换行结尾 */
export function endsWithNewline(doc: LineDoc): boolean {
  const last = doc.eols[doc.eols.length - 1];
  return last === "\r\n" || last === "\n" || last === "\r";
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;

/** 解析标题层级结构（只认 ATX 标题，保持既有格式） */
export function parseSections(text: string): Section[] {
  const { lines } = splitLines(text);
  const heads: { level: number; title: string; line: number }[] = [];
  lines.forEach((l, i) => {
    const m = HEADING_RE.exec(l);
    if (m) heads.push({ level: m[1].length, title: m[2].trim(), line: i });
  });

  const sections: Section[] = [];
  if (heads.length === 0) {
    return [{ level: 0, title: "", headingLine: -1, bodyStart: 0, bodyEnd: lines.length }];
  }
  // 文档首部（第一个标题之前）视作一个 level=0 的无名节
  if (heads[0].line > 0) {
    sections.push({ level: 0, title: "", headingLine: -1, bodyStart: 0, bodyEnd: heads[0].line });
  }
  heads.forEach((h, idx) => {
    let end = lines.length;
    for (let j = idx + 1; j < heads.length; j++) {
      if (heads[j].level <= h.level) {
        end = heads[j].line;
        break;
      }
    }
    sections.push({
      level: h.level,
      title: h.title,
      headingLine: h.line,
      bodyStart: h.line + 1,
      bodyEnd: end,
    });
  });
  return sections;
}

/** 按标题找节（标题文本全等匹配，逐个比较） */
export function findSection(text: string, title: string): Section | null {
  const want = title.trim();
  for (const s of parseSections(text)) {
    if (s.title === want) return s;
  }
  return null;
}

/** 取节正文（不含标题行） */
export function sectionBody(text: string, title: string, includeSubsections = true): string | null {
  const doc = splitLines(text);
  const sec = includeSubsections
    ? findSection(text, title)
    : parseSections(text).find((s) => s.title === title.trim()) ?? null;
  if (!sec) return null;
  let end = sec.bodyEnd;
  if (!includeSubsections) {
    // 只取直接正文：遇到任意子标题即停
    for (let i = sec.bodyStart; i < sec.bodyEnd; i++) {
      if (HEADING_RE.test(doc.lines[i])) {
        end = i;
        break;
      }
    }
  }
  const sub: LineDoc = {
    lines: doc.lines.slice(sec.bodyStart, end),
    eols: doc.eols.slice(sec.bodyStart, end),
  };
  return joinLines(sub);
}

/** 文档末尾追加（不动任何既有字节） */
export function appendToDoc(text: string, addition: string): string {
  if (addition === "") return text;
  const doc = splitLines(text);
  if (!endsWithNewline(doc)) {
    doc.eols[doc.eols.length - 1] = dominantEol(doc);
  }
  const add = splitLines(addition);
  doc.lines.push(...add.lines);
  doc.eols.push(...add.eols);
  return joinLines(doc);
}

/**
 * 节尾追加：把 addition 插到该节正文末尾（下一个同级/更高级标题之前）。
 * 找不到该标题时抛错——**不静默新建节**，避免把用户格式改坏。
 */
export function appendToSection(text: string, title: string, addition: string): string {
  const sec = findSection(text, title);
  if (!sec) throw new Error(`未找到标题为「${title}」的节`);
  if (addition === "") return text;

  const doc = splitLines(text);
  const add = splitLines(addition);

  // 插入点：bodyEnd 之前（跳过节尾空行，插在正文最后一行之后）
  let at = sec.bodyEnd;
  while (at > sec.bodyStart && doc.lines[at - 1].trim() === "") at--;

  if (at > 0 && doc.eols[at - 1] === "") doc.eols[at - 1] = dominantEol(doc);

  doc.lines.splice(at, 0, ...add.lines);
  doc.eols.splice(at, 0, ...add.eols);
  return joinLines(doc);
}

/** EOL 容错匹配：先按原文找；找不到再把待查文本的 EOL 归一化成区域的 EOL 再找 */
function findWithEolTolerance(regionText: string, needle: string, eol: string): string | null {
  if (needle === "") return null;
  if (regionText.includes(needle)) return needle;
  const normalized = needle.replace(/\r\n|\r|\n/g, eol);
  if (normalized !== needle && regionText.includes(normalized)) return normalized;
  const asLf = needle.replace(/\r\n|\r/g, "\n");
  if (asLf !== needle && regionText.includes(asLf)) return asLf;
  return null;
}

/**
 * 节内文本替换：只在指定节范围内查找替换。
 * replaceAll=false 时只替换首个匹配（与 edit_file 的 replace 语义保持一致）。
 * 区域按**原始 EOL** 取出与放回，除被替换的文本外逐字节不变。
 */
export function replaceInSection(
  text: string,
  title: string,
  oldText: string,
  newText: string,
  replaceAll = false,
): string {
  const sec = findSection(text, title);
  if (!sec) throw new Error(`未找到标题为「${title}」的节`);
  const doc = splitLines(text);

  // 取出区域原文（含原始 EOL）
  let regionText = "";
  for (let i = sec.bodyStart; i < sec.bodyEnd; i++) regionText += doc.lines[i] + doc.eols[i];

  const eol = dominantEol(doc);
  const needle = findWithEolTolerance(regionText, oldText, eol);
  if (needle === null) throw new Error(`节「${title}」内未找到待替换文本`);

  const replacement = newText.replace(/\r\n|\r|\n/g, eol);
  const replaced = replaceAll
    ? regionText.split(needle).join(replacement)
    : regionText.replace(needle, replacement);

  const rd = splitLines(replaced);
  doc.lines.splice(sec.bodyStart, sec.bodyEnd - sec.bodyStart, ...rd.lines);
  doc.eols.splice(sec.bodyStart, sec.bodyEnd - sec.bodyStart, ...rd.eols);
  return joinLines(doc);
}
