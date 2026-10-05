/**
 * 资料表格化（D-043 / B7）：把 小说资料/ 的 md 文档解析成表格视图数据。
 *
 * 定位：**只读展示层**——文件本体永远是 md，表格只是它的一种看法。
 * 与写入校验（docschema.ts）同一份格式认知：字段行 `- 键：值`、`## 条目` 分块、
 * 粗纲弧段标题、细纲章块标签。
 *
 * 纪律：
 *  - 解析失败**节级回落**：哪一块认不出来，那一块就按原文展示，绝不让整页崩掉；
 *  - 只读不判：任何形态都安全返回，不抛异常；
 *  - 不适合表格的文档（纯自然段）返回 null，界面不显示切换按钮。
 */

/** 表格的一个部分：kv = 字段/值两栏；grid = 行条目表；prose = 节级回落的原文 */
export type DocTablePart =
  | { kind: "kv"; title?: string; rows: { label: string; value: string }[] }
  | { kind: "grid"; title?: string; columns: string[]; rows: string[][] }
  | { kind: "prose"; title?: string; text: string };

export interface DocTable {
  fileName: string;
  parts: DocTablePart[];
  /** 未按格式解析的块数（界面顶部提示用；只报告不改写） */
  unparsedBlocks: number;
}

/** 按行拆出「头部字段区」（首个 ## 之前的 `- 键：值` 行） */
function headerKv(text: string): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (/^#{1,6}\s/.test(line) && rows.length > 0) break;
    if (/^#{1,6}\s/.test(line)) continue; // 一级标题跳过
    const m = /^-\s*([^：:]+?)\s*[：:]\s*(.*)$/.exec(line);
    if (m) rows.push({ label: m[1].trim(), value: m[2].trim() });
  }
  return rows;
}

interface Block {
  title: string;
  body: string;
}

/** 按 `## 标题` 分块（一级标题与之前的头部不进块） */
function h2Blocks(text: string): { head: string; blocks: Block[] } {
  const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));
  const blocks: Block[] = [];
  const headLines: string[] = [];
  let cur: { title: string; body: string[] } | null = null;
  for (const line of lines) {
    const m = /^##\s+(.+)$/.exec(line);
    if (m) {
      if (cur) blocks.push({ title: cur.title, body: cur.body.join("\n").trim() });
      cur = { title: m[1].trim(), body: [] };
    } else if (cur) {
      cur.body.push(line);
    } else {
      headLines.push(line);
    }
  }
  if (cur) blocks.push({ title: cur.title, body: cur.body.join("\n").trim() });
  return { head: headLines.join("\n").trim(), blocks };
}

/** 块内 `- 键：值` 字段（无键名行忽略） */
function blockFields(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of body.split("\n")) {
    const m = /^-\s*([^：:]+?)\s*[：:]\s*(.*)$/.exec(line);
    if (m) out[m[1].trim()] = m[2].trim();
  }
  return out;
}

/** 块内「标签：内容」的裸行（人物库/细纲的自然段字段，无前导短横线） */
function blockLabeledLines(body: string, labels: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    for (const lb of labels) {
      if (line.startsWith(lb + "：") || line.startsWith(lb + ":")) {
        out[lb] = line.slice(lb.length + 1).trim();
        break;
      }
    }
  }
  return out;
}

/** 块的正文散文（去掉字段行/标签行后的剩余，用于"备注"性质展示） */
function proseRemainder(body: string): string {
  return body
    .split("\n")
    .filter((l) => !/^-\s*[^：:]+?\s*[：:]/.test(l))
    .join("\n")
    .trim();
}

// ────────────────────────────── 各文件的解析器 ──────────────────────────────

/** 00-项目状态：头部字段 kv + 各固定节的字段 kv */
function parseStateDoc(text: string): DocTable {
  const parts: DocTablePart[] = [];
  const header = headerKv(text);
  if (header.length > 0) parts.push({ kind: "kv", title: "状态", rows: header });
  const { blocks } = h2Blocks(text);
  for (const b of blocks) {
    const fields = blockFields(b.body);
    const rows = Object.entries(fields).map(([label, value]) => ({ label, value }));
    if (rows.length > 0) parts.push({ kind: "kv", title: b.title, rows });
    const prose = proseRemainder(b.body);
    if (prose !== "") parts.push({ kind: "prose", title: rows.length > 0 ? undefined : b.title, text: prose });
  }
  return { fileName: "00-项目状态.md", parts, unparsedBlocks: 0 };
}

/** 追踪表：## 条目 → grid（行=条目）；伏笔统计块 → 顶部 kv */
function parseTracker(fileName: string, columns: readonly string[], kvBlockTitles: readonly string[] = []) {
  return (text: string): DocTable => {
    const { blocks } = h2Blocks(text);
    const parts: DocTablePart[] = [];
    const rows: string[][] = [];
    let unparsed = 0;
    for (const b of blocks) {
      const fields = blockFields(b.body);
      if (kvBlockTitles.some((t) => b.title.startsWith(t))) {
        parts.push({
          kind: "kv",
          title: b.title,
          rows: Object.entries(fields).map(([label, value]) => ({ label, value })),
        });
        continue;
      }
      if (Object.keys(fields).length === 0) {
        unparsed += 1;
        parts.push({ kind: "prose", title: b.title, text: b.body || "（空）" });
        continue;
      }
      rows.push([b.title, ...columns.map((c) => fields[c] ?? "")]);
    }
    if (rows.length > 0) {
      parts.push({ kind: "grid", columns: ["条目", ...columns], rows });
    }
    return { fileName, parts, unparsedBlocks: unparsed };
  };
}

/** 04-粗纲：## 第N-M章 弧段名 → grid */
function parseRough(text: string): DocTable {
  const { blocks } = h2Blocks(text);
  const rows: string[][] = [];
  let unparsed = 0;
  for (const b of blocks) {
    const m = /^(第\s*\S+[-–—~～]\S+\s*章)\s*(.*)$/.exec(b.title);
    if (!m) {
      unparsed += 1;
      continue;
    }
    rows.push([m[1].replace(/\s+/g, ""), m[2].trim(), b.body.trim()]);
  }
  return {
    fileName: "04-粗纲.md",
    parts: rows.length > 0 ? [{ kind: "grid", columns: ["弧段", "弧段名", "缩略内容"], rows }] : [],
    unparsedBlocks: unparsed,
  };
}

/** 细纲章块的四个固定标签（逐字） */
const XIGANG_LABELS = ["承接与目标", "主要场面", "依据与约束", "变化与章尾"] as const;

/** 细纲：头部字段 kv + 每章一行 grid */
function parseXigang(fileName: string) {
  return (text: string): DocTable => {
    const parts: DocTablePart[] = [];
    const header = headerKv(text);
    if (header.length > 0) parts.push({ kind: "kv", title: "细纲", rows: header });
    const { blocks } = h2Blocks(text);
    const rows: string[][] = [];
    let unparsed = 0;
    for (const b of blocks) {
      if (b.title === "实际与细纲差异") {
        parts.push({ kind: "prose", title: b.title, text: b.body });
        continue;
      }
      const fields = blockLabeledLines(b.body, XIGANG_LABELS);
      if (Object.keys(fields).length === 0) {
        unparsed += 1;
        parts.push({ kind: "prose", title: b.title, text: b.body || "（空）" });
        continue;
      }
      rows.push([b.title, ...XIGANG_LABELS.map((l) => fields[l] ?? "")]);
    }
    if (rows.length > 0) {
      parts.push({ kind: "grid", columns: ["章", ...XIGANG_LABELS], rows });
    }
    return { fileName, parts, unparsedBlocks: unparsed };
  };
}

/** 人物库：每人一块 kv 卡（六方面 + 备注） */
const CAST_LABELS = [
  "身份、背景与长期追求",
  "在意之处、缺陷与底线",
  "基本能力边界",
  "关系起点",
  "说话习惯与压力反应",
  "依据及最近更新章节",
] as const;

function parseCast(text: string): DocTable {
  const { blocks } = h2Blocks(text);
  const parts: DocTablePart[] = [];
  let unparsed = 0;
  for (const b of blocks) {
    const fields = blockLabeledLines(b.body, CAST_LABELS);
    const rows = CAST_LABELS.filter((l) => fields[l] !== undefined).map((l) => ({ label: l, value: fields[l] }));
    const rest = b.body
      .split("\n")
      .filter((l) => !CAST_LABELS.some((lb) => l.trim().startsWith(lb + "：") || l.trim().startsWith(lb + ":")))
      .join("\n")
      .trim();
    if (rows.length === 0 && rest === "") {
      unparsed += 1;
      continue;
    }
    if (rows.length > 0) parts.push({ kind: "kv", title: b.title, rows });
    if (rest !== "") parts.push({ kind: "prose", title: rows.length > 0 ? undefined : b.title, text: rest });
  }
  return { fileName: "人物库.md", parts, unparsedBlocks: unparsed };
}

/** 06-写作风格：风格规则 = 自然段；禁用列表 = 行条目 grid */
function parseStyle(text: string): DocTable {
  const { blocks } = h2Blocks(text);
  const parts: DocTablePart[] = [];
  for (const b of blocks) {
    if (b.title === "禁用列表") {
      const rows: string[][] = [];
      for (const raw of b.body.split("\n")) {
        const m = /^-\s*禁止[：:]\s*(.*)$/.exec(raw.trim());
        if (!m) continue;
        // 「……（来源：用户指定）」→ 拆出来源列
        const sm = /^(.*?)(?:（来源[：:](.*?)）)?$/.exec(m[1].trim());
        rows.push([(sm?.[1] ?? "").trim(), (sm?.[2] ?? "").trim()]);
      }
      parts.push({ kind: "grid", title: b.title, columns: ["禁止项", "来源"], rows });
    } else {
      parts.push({ kind: "prose", title: b.title, text: b.body });
    }
  }
  return { fileName: "06-写作风格.md", parts, unparsedBlocks: 0 };
}

/** 规则台账：GL 条目 → grid（证据列在最末，内容最长）；无字段的块节级回落为原文 */
function parseLedgerDoc(text: string): DocTable {
  const { blocks } = h2Blocks(text);
  const rows: string[][] = [];
  const parts: DocTablePart[] = [];
  let unparsed = 0;
  for (const b of blocks) {
    const f = blockFields(b.body);
    if (Object.keys(f).length === 0) {
      unparsed += 1;
      parts.push({ kind: "prose", title: b.title, text: b.body || "（空）" });
      continue;
    }
    rows.push([b.title, f["规则"] ?? "", f["类别"] ?? "", f["命中章节数"] ?? "", f["状态"] ?? "", f["最近更新"] ?? "", f["证据"] ?? ""]);
  }
  if (rows.length > 0) {
    parts.unshift({ kind: "grid", columns: ["编号", "规则", "类别", "命中章节数", "状态", "最近更新", "证据"], rows });
  }
  return { fileName: "规则台账.md", parts, unparsedBlocks: unparsed };
}

/** 01/02 开书材料：头部标签 kv + 各节正文 prose */
function parseFieldDoc(fileName: string) {
  return (text: string): DocTable => {
    const parts: DocTablePart[] = [];
    const header = headerKv(text);
    if (header.length > 0) parts.push({ kind: "kv", title: "开书引导字段", rows: header });
    const { head, blocks } = h2Blocks(text);
    if (head !== "") {
      // 头部里除字段行外的说明文字
      const prose = head
        .split("\n")
        .filter((l) => !/^-\s*[^：:]+?\s*[：:]/.test(l))
        .join("\n")
        .trim();
      if (prose !== "") parts.push({ kind: "prose", text: prose });
    }
    for (const b of blocks) {
      const fields = blockFields(b.body);
      const rows = Object.entries(fields).map(([label, value]) => ({ label, value }));
      if (rows.length > 0) parts.push({ kind: "kv", title: b.title, rows });
      const prose = proseRemainder(b.body);
      if (prose !== "") parts.push({ kind: "prose", title: rows.length > 0 ? undefined : b.title, text: prose });
    }
    return { fileName, parts, unparsedBlocks: 0 };
  };
}

/** 03-全书大纲等纯叙述文档：不表格化（返回 null，界面不显示切换） */
const PROSE_ONLY = new Set(["03-全书大纲.md"]);

/** 追踪表的列定义（与模板字段逐字一致） */
const TRACKER_COLUMNS: Record<string, readonly string[]> = {
  "追踪-伏笔.md": ["内容与涉及对象", "首次出现章节", "当前进展", "预计触发或回收条件", "状态", "来源与最近更新章节"],
  "追踪-角色状态.md": ["当前位置、身体与情绪状态", "当前目标", "已知事实与误信信息", "尚不知道的关键信息", "当前关系与利益", "来源及最近更新章节", "状态"],
  "追踪-时间线.md": ["时间、地点与事件", "涉及对象", "来源及最近更新章节", "状态"],
  "追踪-资源与权限.md": ["人物或组织", "金钱、物品、身份、能力或权限", "当前数量与限制", "获得来源", "最近变化及其来源章节", "最近更新章节", "状态"],
  "追踪-废弃设定.md": ["已废弃内容与涉及对象", "废弃原因", "被哪条正式设定替代", "决定来源", "生效及最近更新章节", "禁止恢复"],
};

/** 该文件是否表格化（以及用什么解析器）。不认识/纯叙述文档返回 null */
export function docTableFor(fileName: string, text: string): DocTable | null {
  if (PROSE_ONLY.has(fileName)) return null;
  if (fileName === "00-项目状态.md") return parseStateDoc(text);
  if (fileName === "01-开书定位.md" || fileName === "02-核心设定.md") return parseFieldDoc(fileName)(text);
  if (fileName === "04-粗纲.md") return parseRough(text);
  if (fileName === "06-写作风格.md") return parseStyle(text);
  if (fileName === "人物库.md") return parseCast(text);
  if (fileName === "规则台账.md") return parseLedgerDoc(text);
  if (/^第.+[-–—~～].+章细纲(（已完成）)?\.md$/.test(fileName)) return parseXigang(fileName)(text);
  const cols = TRACKER_COLUMNS[fileName];
  if (cols) return parseTracker(fileName, cols, fileName === "追踪-伏笔.md" ? ["伏笔统计"] : [])(text);
  return null;
}

/** 该文件类型的默认视图（追踪类/台账/粗纲/细纲默认表格；其余默认原文） */
export function defaultTableView(fileName: string): boolean {
  return (
    fileName in TRACKER_COLUMNS ||
    fileName === "规则台账.md" ||
    fileName === "04-粗纲.md" ||
    fileName === "00-项目状态.md" ||
    /^第.+[-–—~～].+章细纲(（已完成）)?\.md$/.test(fileName)
  );
}
