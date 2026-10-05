/**
 * 预览后端替身（仅用于浏览器视觉验证，不进生产构建）。
 *
 * 用内存文件系统拦截 Tauri IPC（window.__TAURI_INTERNALS__.invoke），
 * 喂入示例作品 / 会话 / 配置，让 App 在纯浏览器里完整启动，
 * 供 Playwright 截图三主题。主题由 URL ?theme=dark|light|dsblue 控制。
 */

const q = new URLSearchParams(location.search);
const THEME = (q.get("theme") === "light" || q.get("theme") === "dsblue") ? q.get("theme") : "dark";
// 故障注入：?fail=prefs 让 prefs_load 抛错 —— 抛错走 boot() 的失败路径，
// 屏显的是 MainWorkbench 的「启动失败」屏（C-6：设置屏的「配置未加载」兜底页已随死代码删除，
// 不再有第二个故障形态）
const FAIL = q.get("fail") || "";

const HOME = "C:\\Users\\Preview";
const DOCUMENTS = `${HOME}\\Documents`;
const APPDATA = `${HOME}\\AppData\\Roaming`;
const PREFS_DIR = `${APPDATA}\\com.writerd\\writerD`;
const PREFS_FILE = `${PREFS_DIR}\\shared_preferences.json`;
const BOOKS_ROOT = `${HOME}\\AI写小说`;
const SESSIONS_DIR = `${DOCUMENTS}\\writerd_sessions`;
const SNAPSHOTS_DIR = `${DOCUMENTS}\\writerd_snapshots`;
const SKILLS_DIR = `${DOCUMENTS}\\skills`;
const MEMOS_FILE = `${DOCUMENTS}\\writerd_memos.json`;

/* ── 内存文件系统 ── */
interface FNode { path: string; content: string; mtimeMs: number; }
const files = new Map<string, FNode>();       // 归一化路径 → 文件
const dirs = new Map<string, string>();        // 归一化路径 → 原始路径
const now = Date.now();
const DAY = 86400_000;

const norm = (p: string) => p.replace(/[\\/]+$/, "").replace(/\\/g, "/").toLowerCase();
const parentOf = (p: string) => {
  const s = p.replace(/[\\/]+$/, "");
  const i = Math.max(s.lastIndexOf("\\"), s.lastIndexOf("/"));
  return i < 0 ? "" : s.slice(0, i);
};
const baseName = (p: string) => {
  const s = p.replace(/[\\/]+$/, "");
  const i = Math.max(s.lastIndexOf("\\"), s.lastIndexOf("/"));
  return i < 0 ? s : s.slice(i + 1);
};

function ensureDir(path: string) {
  let cur = path.replace(/[\\/]+$/, "");
  const chain: string[] = [];
  while (cur && !dirs.has(norm(cur))) {
    chain.unshift(cur);
    const p = parentOf(cur);
    if (p === cur) break;
    cur = p;
  }
  for (const d of chain) dirs.set(norm(d), d);
}
function writeFile(path: string, content: string, mtimeMs = now) {
  ensureDir(parentOf(path));
  files.set(norm(path), { path, content, mtimeMs });
}
function readFile(path: string): string {
  const f = files.get(norm(path));
  if (!f) throw new Error(`读取失败 ${path}: 文件不存在`);
  return f.content;
}
function exists(path: string): boolean {
  return files.has(norm(path)) || dirs.has(norm(path));
}
function stat(path: string) {
  if (files.has(norm(path))) {
    const f = files.get(norm(path))!;
    return { isDir: false, size: new TextEncoder().encode(f.content).length, mtimeMs: f.mtimeMs, isLink: false };
  }
  if (dirs.has(norm(path))) return { isDir: true, size: 0, mtimeMs: now, isLink: false };
  return null;
}
/**
 * 删目录/文件（含子孙）。桌面端由 Rust fs_remove_child/fs_remove 完成；
 * 沙箱里必须同样"整棵子树一起走"，否则删掉作品后它的章节还会挂在列表里。
 */
function removeTree(path: string, recursive: boolean) {
  const n = norm(path);
  if (files.has(n)) {
    files.delete(n);
    return;
  }
  if (!dirs.has(n)) return;
  if (recursive) {
    for (const k of [...files.keys()]) if (k.startsWith(n + "/")) files.delete(k);
  }
  for (const k of [...dirs.keys()]) if (k === n || (recursive && k.startsWith(n + "/"))) dirs.delete(k);
}
/** 改名/搬家（目录连同子孙）。回收站的「移入」就是靠它把整部作品搬走。 */
function renameTree(from: string, to: string) {
  const fn = norm(from);
  const tn = norm(to);
  const fromOrig = from.replace(/[\\/]+$/, "");
  const toOrig = to.replace(/[\\/]+$/, "");
  const single = files.get(fn);
  if (single) {
    files.delete(fn);
    writeFile(to, single.content, single.mtimeMs);
    return;
  }
  if (!dirs.has(fn)) return;
  const relOf = (k: string) => k.slice(fn.length); // "" 或 "/章节内容/第1章.md"
  const movedFiles: { rel: string; node: FNode }[] = [];
  for (const [k, v] of [...files]) {
    if (k === fn || k.startsWith(fn + "/")) {
      movedFiles.push({ rel: relOf(k), node: v });
      files.delete(k);
    }
  }
  const movedDirs: string[] = [];
  for (const [k] of [...dirs]) {
    if (k === fn || k.startsWith(fn + "/")) {
      movedDirs.push(relOf(k));
      dirs.delete(k);
    }
  }
  for (const rel of movedDirs) dirs.set(tn + rel, toOrig + rel.replace(/\//g, "\\"));
  for (const { rel, node } of movedFiles) {
    files.set(tn + rel, { path: toOrig + rel.replace(/\//g, "\\"), content: node.content, mtimeMs: node.mtimeMs });
  }
  ensureDir(toOrig);
  void fromOrig;
}
interface DirEntry { name: string; rel: string; path: string; isDir: boolean; size: number; mtimeMs: number; }
function listDir(dir: string): DirEntry[] {
  const dn = norm(dir);
  const out: DirEntry[] = [];
  const seen = new Set<string>();
  for (const f of files.values()) {
    if (norm(parentOf(f.path)) !== dn) continue;
    const name = baseName(f.path);
    out.push({ name, rel: name, path: f.path, isDir: false, size: new TextEncoder().encode(f.content).length, mtimeMs: f.mtimeMs });
  }
  for (const [k, orig] of dirs) {
    if (norm(parentOf(orig)) !== dn) continue;
    const name = baseName(orig);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ name, rel: name, path: orig, isDir: true, size: 0, mtimeMs: now });
  }
  out.sort((a, b) => (a.isDir === b.isDir ? a.name.toLowerCase().localeCompare(b.name.toLowerCase()) : a.isDir ? -1 : 1));
  return out;
}

/* ── 种子：两部示例作品 ── */
function seedProject(name: string, chapters: string[], docs: Record<string, string>) {
  const root = `${BOOKS_ROOT}\\${name}`;
  ensureDir(`${root}\\小说资料`);
  ensureDir(`${root}\\章节内容`);
  for (const [doc, body] of Object.entries(docs)) writeFile(`${root}\\小说资料\\${doc}`, body, now - DAY * 2);
  chapters.forEach((c, i) => writeFile(`${root}\\章节内容\\第${i + 1}章.md`, c, now - (chapters.length - i) * 3600_000));
  writeFile(`${root}\\.openwrite_manifest.json`, JSON.stringify({ version: 1, displayName: name, order: [] }), now - DAY);
  return root;
}

const p1 = seedProject(
  "星海拾梦",
  [
    "# 第一章 潮汐信\n\n林砚第一次听见海在说话，是在十七岁那年的盛夏。\n\n那声音很轻，像是有人把一整夜的月光揉碎了，撒进浪里。他蹲在礁石上，指尖触到一枚会发光的贝壳，贝壳里躺着一段不属于这个世界的记忆。\n\n从那天起，他知道自己再也回不去从前了。",
    "# 第二章 拾梦人\n\n城里的人都叫他们「拾梦人」——那些能从海浪里捞起别人遗失梦境的人。\n\n林砚跟着老周学了三年，学会了分辨梦的重量：快乐的梦浮在水面，悲伤的梦沉在最深处，而那些被强行忘记的，会卡在礁石缝里，长成会发光的贝壳。",
    "# 第三章 雾港\n\n雾港是个连地图都懒得标注的地方。\n\n老周说，这里的雾不是水汽，是太多人不愿醒来的梦堆在一起，久了就成了雾。林砚不信，直到他在雾里看见了自己早已过世的母亲，正朝他招手。",
    "# 第四章 深渊来信\n\n那封信是从最深的海沟里浮上来的，信封上没有任何字迹，只有一枚会跳动的、像是心脏一样的封印。\n\n老周脸色变了：「三十年了，它终于又写信来了。」",
    "# 第五章 抉择\n\n林砚站在船头，手里握着那枚发光的贝壳。\n\n海在他脚下翻涌，像是无数双手在拉扯。他知道，只要把贝壳扔回去，就能换回母亲的性命——代价是，他要替她沉入那场永不醒来的梦。",
  ],
  {
    "世界观.md": "# 世界观\n\n故事发生在「潮汐纪」——一个梦境会随海水流动、沉积、发光的世界。\n\n- 梦有重量：快乐的梦上浮，悲伤的梦下沉，被遗忘的梦卡在礁缝里长成发光贝壳。\n- 拾梦人：能从海里捞起他人遗失梦境的特殊人群。\n- 雾港：未被标注的港口，雾是由不愿醒来的梦堆积而成。\n- 深渊：最深海沟，会「写信」，三十年一次。",
    "人物库.md": "# 人物库\n\n## 林砚\n主角，17 岁少年拾梦人。敏感、固执，为救母亲愿意付出一切。\n\n## 老周\n林砚的师父，苍老而神秘，似乎与深渊的来信有旧。\n\n## 母亲\n林砚早已过世的母亲，在雾港的雾中现身。她的死另有隐情。",
    "章节摘要.md": "# 章节摘要\n\n- 第一章：林砚听见海说话，捡到发光贝壳。\n- 第二章：介绍拾梦人与梦的重量。\n- 第三章：雾港，林砚在雾中见到亡母。\n- 第四章：深渊来信，老周色变。\n- 第五章：林砚面临抉择——用贝壳换母亲性命。",
    "追踪-伏笔.md": "# 追踪-伏笔\n\n## 伏笔统计\n- 开放：2\n- 已回收：1\n- 废弃：0\n- 合计：3\n\n## F001\n- 内容与涉及对象：发光贝壳的来历与深渊的关系\n- 首次出现章节：第1章\n- 当前进展：林砚捡到贝壳，听见海说话\n- 预计触发或回收条件：深渊来信揭晓\n- 状态：开放\n- 来源与最近更新章节：第4章\n\n## F002\n- 内容与涉及对象：老周与深渊来信的旧约\n- 首次出现章节：第2章\n- 当前进展：老周看信后色变\n- 预计触发或回收条件：老周坦白\n- 状态：开放\n- 来源与最近更新章节：第4章\n\n## F003\n- 内容与涉及对象：母亲之死的隐情\n- 首次出现章节：第3章\n- 当前进展：雾中现身，未明言\n- 预计触发或回收条件：雾港真相揭晓\n- 状态：已回收\n- 来源与最近更新章节：第5章",
  },
);

seedProject(
  "雾都谍影",
  [
    "# 第一章 双面\n\n1943 年的雾都，连呼吸都是灰色的。\n\n苏文每天早晨在《申报》当校对，夜里则换上另一副面孔。没人知道，这个总低着头、说话轻声细语的女人，手里握着能让半座城颤抖的秘密。",
    "# 第二章 接头\n\n暗号是「今夜有雨」。苏文在咖啡馆角落坐下，对面的人推过来一杯加了双倍糖的红茶——那是自己人的记号。",
    "# 第三章 叛徒\n\n名单上有七个名字，其中一个是叛徒。苏文必须在天亮之前找出来，否则整条线都会暴露。",
  ],
  {
    "世界观.md": "# 世界观\n\n1943 年沦陷区雾都，谍战背景。多方势力交错，身份即武器。",
    "人物库.md": "# 人物库\n\n## 苏文\n女主，表面是报社校对，实为地下情报员。冷静、隐忍。\n\n## 陈默\n接头人，身份成谜。",
    "章节摘要.md": "# 章节摘要\n\n- 第一章：苏文的双重身份。\n- 第二章：咖啡馆接头。\n- 第三章：七人名单里的叛徒。",
  },
);

/* ── 种子：会话（跨今天/昨天/更早，验证下拉分组） ── */
function seedSession(id: string, title: string, projectPath: string, updatedMs: number, messages: unknown[]) {
  const body = { id, title, projectPath, createdAt: new Date(updatedMs - DAY).toISOString(), updatedAt: new Date(updatedMs).toISOString(), messages };
  writeFile(`${SESSIONS_DIR}\\${id}.json`, JSON.stringify(body), updatedMs);
  return { title, projectPath, createdAt: body.createdAt, updatedAt: body.updatedAt, userMessageCount: messages.filter((m) => (m as { role: string }).role === "user").length, size: JSON.stringify(body).length, mtimeMs: updatedMs };
}
const sessIndex: Record<string, unknown> = {};
sessIndex["s-1"] = seedSession("s-1", "帮我续写第五章的结尾", p1, now - 3600_000, [
  { id: "m1", role: "user", text: "帮我把第五章的结尾续写一段，要更有张力。", createdAt: new Date(now - 3600_000).toISOString() },
  {
    id: "m2", role: "assistant", text: "好的，我先读了第五章的现有内容。这是续写的结尾：\n\n贝壳在他掌心越来越烫，海面的月光忽然全部倒卷起来，像一整片天空坠入水里。林砚闭上眼，纵身跃入那片会发光的深渊——他知道，这一次，醒来的不会再是他。",
    thinking: "用户要更有张力的结尾。当前章节停在抉择点，应强化动作与意象的爆发力，用「月光倒卷」「坠入深渊」收束。",
    toolCalls: [{ callId: "c1", name: "file_read", args: { path: "章节内容/第5章.md" }, result: "{\"ok\":true}" }, { callId: "c2", name: "file_write", args: { path: "章节内容/第5章.md" }, result: "{\"ok\":true}" }],
    createdAt: new Date(now - 3500_000).toISOString(),
  },
]);
sessIndex["s-2"] = seedSession("s-2", "检查人物设定一致性", p1, now - 5 * 3600_000, [
  { id: "m1", role: "user", text: "帮我看看人物库里老周的设定，和前几章有没有矛盾。", createdAt: new Date(now - 5 * 3600_000).toISOString() },
  { id: "m2", role: "assistant", text: "我读了人物库和第一到第四章。老周的设定基本一致，但第三章他提到「三十年前」，而人物库没写他的年龄线索，建议补一句他的过往，避免后续深渊来信的剧情出现时间线漏洞。", createdAt: new Date(now - 4.9 * 3600_000).toISOString() },
]);
sessIndex["s-3"] = seedSession("s-3", "雾都谍影 开篇润色", `${BOOKS_ROOT}\\雾都谍影`, now - DAY - 2 * 3600_000, [
  { id: "m1", role: "user", text: "《雾都谍影》第一章开头帮我润色得更有年代感。", createdAt: new Date(now - DAY - 2 * 3600_000).toISOString() },
  { id: "m2", role: "assistant", text: "已润色。强化了 1943 年沦陷区的压抑氛围，把「连呼吸都是灰色的」作为核心意象贯穿首段。", createdAt: new Date(now - DAY - 1.9 * 3600_000).toISOString() },
]);
sessIndex["s-4"] = seedSession("s-4", "头脑风暴新书名", p1, now - 6 * DAY, [
  { id: "m1", role: "user", text: "给《星海拾梦》想几个备选书名。", createdAt: new Date(now - 6 * DAY).toISOString() },
  { id: "m2", role: "assistant", text: "1. 拾梦潮汐\n2. 发光贝壳纪\n3. 深渊来信\n4. 雾港拾梦人\n5. 海会记得", createdAt: new Date(now - 6 * DAY + 60_000).toISOString() },
]);
writeFile(`${SESSIONS_DIR}\\index.json`, JSON.stringify({ version: 1, sessions: sessIndex }), now);

/* ── 种子：技能 ── */
writeFile(`${SKILLS_DIR}\\novel-writer\\SKILL.md`, "---\nname: novel-writer\ndescription: 写小说时使用的技能：先读设定再动笔，保持人物与世界观一致。\n---\n", now - DAY * 3);
writeFile(`${SKILLS_DIR}\\worldbuilding\\SKILL.md`, "---\nname: worldbuilding\ndescription: 世界观构建：设计自洽的规则体系与冲突来源。\n---\n", now - DAY * 3);

/* ── 种子：备忘录 ──
   分类里必须**始终有「默认」**（界面里它没有 ×，即不可删；迁移目标也得存在），
   且不要用「全部」当分类名 —— 那是筛选栏的固定 chip，两个同名按钮看着像 bug。 */
writeFile(MEMOS_FILE, JSON.stringify({
  categories: ["默认", "灵感", "待办"],
  memos: [
    { id: "n0", title: "书名备选", category: "默认", content: "《拾梦者》《写信的人》《守梦人》—— 先记着，等写完第一卷再定。", project_id: p1, created_at: new Date(now - DAY).toISOString(), updated_at: new Date(now - DAY).toISOString() },
    { id: "n1", title: "深渊的来历", category: "灵感", content: "深渊不是海沟，是所有人集体潜意识的沉积层。每三十年「写信」，其实是在挑选一个新的守梦人。", project_id: p1, created_at: new Date(now - DAY).toISOString(), updated_at: new Date(now - DAY).toISOString() },
    { id: "n2", title: "补老周的过往", category: "待办", content: "第三章提到三十年前，需要在人物库补一句老周当年的经历，填时间线漏洞。", project_id: p1, created_at: new Date(now - 2 * DAY).toISOString(), updated_at: new Date(now - 2 * DAY).toISOString() },
  ],
}), now - DAY);

/* ── 种子：用量统计（`usage_stats.json`，鲸鱼面板的今日块读它） ──
   与真实文件同形：按本地日期分桶 + 最近一次余额快照。数值刻意留一组
   有缓存命中的样本（命中率高/低两种读法都能看出来）。 */
const dayKeyOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
writeFile(
  `${PREFS_DIR}\\usage_stats.json`,
  JSON.stringify({
    version: 1,
    days: {
      [dayKeyOf(new Date(now))]: {
        inputTokens: 128_400,
        outputTokens: 43_260,
        cacheHitTokens: 102_400,
        cacheMissTokens: 26_000,
        requests: 7,
      },
      [dayKeyOf(new Date(now - DAY))]: {
        inputTokens: 61_000,
        outputTokens: 18_000,
        cacheHitTokens: 0,
        cacheMissTokens: 61_000,
        requests: 3,
      },
    },
    lastBalance: {
      at: new Date(now - 3600_000).toISOString(),
      isAvailable: true,
      currency: "CNY",
      total: "42.18",
      granted: "0.00",
      toppedUp: "42.18",
    },
    lastError: null,
  }),
  now,
);

/* ── 配置 ── */
const seedPrefs: Record<string, unknown> = {
  "flutter.llm_base_url": "https://api.deepseek.com/v1",
  "flutter.api_key": "sk-preview-placeholder",
  "flutter.model": "deepseek-flash",
  "flutter.temperature": 0.8,
  "flutter.context_limit": 1000000,
  "flutter.custom_accent_color": 4283263998, // DS 蓝
  "flutter.is_dark_mode": THEME !== "light",
  "flutter.theme_mode": THEME,
  "flutter.current_novel_project": p1,
  "flutter.novel_projects": `${p1}\n${BOOKS_ROOT}\\雾都谍影`,
  "flutter.panel_show_directory": true,
  "flutter.panel_show_session": true,
  "flutter.chat_font_size": 15,
  "flutter.editor_font_size": 15,
  // 具名接口配置（B3 起设置页的主体）：两条 —— 一条带 id/platform（新形态），
  // 一条故意不带扩展字段（验证「老配置自动补 id/platform」的升级路径）
  "flutter.saved_providers": JSON.stringify([
    {
      name: "主力（DeepSeek 官方）",
      baseUrl: "https://api.deepseek.com",
      apiKey: "sk-preview-placeholder-0001",
      model: "deepseek-flash",
      useAnthropicFormat: false,
      id: "p1a2b3c4",
      platform: "deepseek",
      thinking: true,
      reasoningEffort: "high",
    },
    {
      name: "硅基流动",
      baseUrl: "https://api.siliconflow.cn/v1",
      apiKey: "sk-preview-siliconflow",
      model: "deepseek-ai/DeepSeek-V3",
      useAnthropicFormat: false,
    },
  ]),
  "flutter.active_api_profile": "p1a2b3c4",
};
let prefsStore = JSON.stringify(seedPrefs);

/* 首启目录（boot 会 mkdir 这几个） */
for (const d of [BOOKS_ROOT, SESSIONS_DIR, SNAPSHOTS_DIR, SKILLS_DIR, PREFS_DIR]) ensureDir(d);

/* ── mock invoke ── */
const listeners = new Map<string, number>();  // `${event}|${id}` → transformCallback id
let evtSeq = 0;
const warned = new Set<string>();             // 未实现命令只告警一次
let winMaxed = false;                          // 沙箱里的窗口最大化状态

/** 向已注册的监听器派发事件（桌面端由 Rust 侧 emit；预览里手动触发，
 *  以便 onResized 之类的监听能被真实驱动，而不是永远不动） */
function emitMockEvent(event: string, payload: unknown) {
  for (const [key, handlerId] of listeners) {
    if (!key.startsWith(`${event}|`)) continue;
    const id = Number(key.split("|")[1]);
    callbacks.get(handlerId)?.({ event, id, payload });
  }
}

async function mockInvoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  const S = (k: string) => String((args ?? {})[k] ?? "");
  switch (cmd) {
    case "app_dirs":
      return { home: HOME, documents: DOCUMENTS, appData: APPDATA, prefsDir: PREFS_DIR, prefsFile: PREFS_FILE };
    case "prefs_load":
      if (FAIL === "prefs") throw new Error("[preview] 故障注入：prefs_load 失败");
      return prefsStore;
    case "prefs_save":
      prefsStore = String((args ?? {}).json ?? "{}");
      return null;
    case "fs_mkdir":
      ensureDir(S("path"));
      return null;
    case "fs_list":
      return listDir(S("dir"));
    case "fs_read_text":
      return readFile(S("path"));
    case "fs_write_text":
      writeFile(S("path"), S("content"));
      return null;
    case "fs_append_text":
      writeFile(S("path"), (exists(S("path")) ? readFile(S("path")) : "") + S("content"));
      return null;
    case "fs_exists":
      return exists(S("path"));
    case "fs_stat":
      return stat(S("path"));
    case "fs_remove":
      removeTree(S("path"), Boolean((args ?? {}).recursive));
      return null;
    case "fs_remove_child":
      // 对齐 Rust fs_remove_child：父目录 + 单个路径段（名字校验在 Rust/recycle 层）
      removeTree(`${S("parent")}\\${S("name")}`, Boolean((args ?? {}).recursive));
      return null;
    case "fs_rename":
      renameTree(S("from"), S("to"));
      return null;
    case "fs_copy": {
      const f = files.get(norm(S("from")));
      if (f) writeFile(S("to"), f.content, f.mtimeMs);
      return null;
    }
    case "ai_stream": {
      // 预览里造一段真实形状的 SSE 流（含思考流 + 被 max_tokens 截断的收尾），
      // 这样主界面的流式渲染、用量块、截断提示条（.notice-line）都能走真实路径。
      // 桌面端由 Rust 转发；这里按 ai_chunk 事件逐条派发，末尾必发 done。
      const req = ((args ?? {}).request ?? {}) as { requestId?: string; body?: { stream?: boolean } };
      const id = String(req.requestId ?? "");
      if (!id) return null;
      const script: { kind: string; data: string }[] = [
        { kind: "line", data: 'data: {"choices":[{"delta":{"reasoning_content":"先读第五章现有结尾：停在林砚握贝壳的抉择处，张力已经拉满。续写要把抉择落地——让海先给出反应，再给他一个不可回头的动作；意象回到第一章的月光与贝壳，首尾呼应。避免直写他想念母亲，让动作承担。"}}]}' },
        { kind: "line", data: 'data: {"choices":[{"delta":{"content":"海先动了。"}}]}' },
        { kind: "line", data: 'data: {"choices":[{"delta":{"content":"不是翻涌，是退。整片潮水像被谁从底下按住，一层层往深处抽走，露出礁石上一圈圈从未见过天日的苔痕。林砚听见那种安静——比任何浪声都响的安静。"}}]}' },
        { kind: "line", data: 'data: {"choices":[{"delta":{"content":"他低头看掌心。贝壳的光正顺着他的指缝往外爬，像第一章那个夏夜一样轻。只是这一次，它照见的不是记忆，是水面下那道越来越宽的裂缝。"}}]}' },
        { kind: "line", data: 'data: {"choices":[{"delta":{"content":"「替她醒着，还是替她沉下去。」老周这句话，在雾里已经沉了三遍。"}}]}' },
        { kind: "line", data: 'data: {"choices":[{"delta":{"content":"林砚把贝壳按进胸口，像十七岁那年母亲按住他发烧的额头。然后，他朝那道裂缝走了过去。身后，船缆松了，雾合上了，没有人再需要替他做一个决定。"}}]}' },
        // 截断收尾：assistant 正文照常入库，界面另给 warn 色提示条（.notice-line）
        { kind: "line", data: 'data: {"choices":[{"delta":{},"finish_reason":"length"}]}' },
        {
          kind: "line",
          data:
            'data: {"choices":[],"usage":{"prompt_tokens":2048,"completion_tokens":32000,' +
            '"prompt_tokens_details":{"cached_tokens":1792},"prompt_cache_hit_tokens":1792,' +
            '"prompt_cache_miss_tokens":256}}',
        },
        { kind: "line", data: "data: [DONE]" },
        { kind: "done", data: "" },
      ];
      script.forEach((chunk, i) => {
        setTimeout(() => emitMockEvent("ai_chunk", { requestId: id, kind: chunk.kind, data: chunk.data }), 40 * (i + 1));
      });
      return null;
    }
    case "ai_abort":
      return null;
    // 应用身份（桌面端为 Rust app_info）：设置屏「关于」的名称/版本取自这里
    case "app_info":
      return { name: "DeepCompose", version: "1.1.0" };
    // 目录选择器（plugin-dialog）：沙箱里返回 null = 用户取消，正好验证取消分支
    case "plugin:dialog|open":
      return null;
    // 打开目录（自研 Rust 命令）：沙箱无资源管理器，静默成功即可
    case "open_dir":
      return null;
    // 模型清单（桌面端走 Rust ai_models → OpenAI/Anthropic /models）；
    // 返回 DeepSeek 官方文档当前的模型名，供设置屏「检测连接」走真实渲染路径
    case "ai_models":
      return ["deepseek-flash", "deepseek-v4-pro"];
    // 余额（DeepSeek 官方 GET /user/balance）：沙箱返回固定值，
    // 让鲸鱼信息面板能在预览里走真实渲染路径（[待实测] 的是真机联调，不是这里）
    case "ai_balance":
      return {
        isAvailable: true,
        balances: [
          { currency: "CNY", totalBalance: "42.18", grantedBalance: "0.00", toppedUpBalance: "42.18" },
        ],
      };
    // 窗口命令（@tauri-apps/api/window）：浏览器沙箱里没有真实窗口，但返回值必须
    // **诚实** —— 早先未实现时统一返回 null，会让标题栏「最大化」按钮永远显示
    // 未最大化（按钮图标/提示就是无边框窗口唯一的状态反馈）。
    case "plugin:window|is_maximized":
      return winMaxed;
    case "plugin:window|is_minimized":
    case "plugin:window|is_fullscreen":
      return false;
    // 最大化状态在沙箱里也要**真的变**，否则标题栏按钮的「最大化 ⇄ 向下还原」
    // 切换没法在预览里验证（桌面端由 Windows 改状态，这里由这几条命令改）
    case "plugin:window|maximize":
      winMaxed = true;
      emitMockEvent("tauri://resize", { width: 1920, height: 1032 });
      return null;
    case "plugin:window|unmaximize":
      winMaxed = false;
      emitMockEvent("tauri://resize", { width: 1440, height: 900 });
      return null;
    case "plugin:window|toggle_maximize":
      winMaxed = !winMaxed;
      emitMockEvent("tauri://resize", winMaxed ? { width: 1920, height: 1032 } : { width: 1440, height: 900 });
      return null;
    case "plugin:window|minimize":
    case "plugin:window|close":
    case "plugin:window|destroy":
    case "plugin:window|show":
    case "plugin:window|set_size":
    case "plugin:window|set_position":
    case "plugin:window|center":
    case "plugin:window|start_dragging":
    case "plugin:window|start_resize_dragging":
      return null;
    // 事件插件（@tauri-apps/api/event）：桌面端由 Rust 侧注册回调并返回 eventId
    case "plugin:event|listen": {
      const event = S("event");
      const id = ++evtSeq;
      listeners.set(`${event}|${id}`, Number((args ?? {}).handler ?? 0));
      return id;
    }
    case "plugin:event|unlisten": {
      listeners.delete(`${S("event")}|${Number((args ?? {}).eventId ?? 0)}`);
      return null;
    }
    default:
      // 未实现命令：仍然静默成功，但留痕 —— 替身不许悄悄撒谎
      if (!warned.has(cmd)) {
        warned.add(cmd);
        console.warn("[preview] 未实现命令，已返回 null：", cmd);
      }
      return null;
  }
}

/* ── 安装到 window.__TAURI_INTERNALS__（@tauri-apps/api v2 的注入点） ── */
let cbId = 0;
const callbacks = new Map<number, (e: unknown) => void>();
(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
  metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
  invoke: mockInvoke,
  transformCallback: (cb: (e: unknown) => void, once = false) => {
    const id = ++cbId;
    callbacks.set(id, once ? (e) => { callbacks.delete(id); cb(e); } : cb);
    return id;
  },
};
// @tauri-apps/api/event 的 _unlisten 直接读这个全局对象（桌面端由 Rust 注入），
// 缺了它 → listen 的清理函数一调用就 TypeError，整棵 React 树会被卸载
(window as unknown as Record<string, unknown>).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
  unregisterListener: (event: string, eventId: number) => {
    listeners.delete(`${event}|${eventId}`);
  },
};
