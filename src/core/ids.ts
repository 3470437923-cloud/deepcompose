/**
 * 时间戳与 ID 生成。
 *
 * 逐字对齐真机观测到的格式（证据：C:\Users\Administrator\AI写小说 实测文件）：
 *   manifest 时间戳  "2026-09-27T22:00:35.918741"     （Dart DateTime.toIso8601String()，本地时间，微秒）
 *   manifest 条目 id "item_1790517635918741_g2mpat"   （item_ + 微秒纪元 + _ + 6 位小写字母数字）
 *   回收站 id        "20260704170528_1783155928889255"（本地 YYYYMMDDHHmmss + _ + 微秒纪元）
 */

const ALNUM = "abcdefghijklmnopqrstuvwxyz0123456789";

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

/** 亚毫秒部分（0..999）：JS 只有毫秒精度，后 3 位用高精度时钟补足 */
let subMsSource: () => number = () =>
  typeof performance !== "undefined" ? Math.floor((performance.now() % 1) * 1000) % 1000 : 0;

/** "2026-09-27T22:00:35.918741"（本地时间，6 位微秒） */
export function isoMicros(d: Date = new Date()): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}` +
    `T${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}:${pad(d.getSeconds(), 2)}` +
    `.${pad(d.getMilliseconds(), 3)}${pad(subMsSource(), 3)}`
  );
}

/** "20260704170528"（本地时间） */
export function compactStamp(d: Date = new Date()): string {
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1, 2)}${pad(d.getDate(), 2)}` +
    `${pad(d.getHours(), 2)}${pad(d.getMinutes(), 2)}${pad(d.getSeconds(), 2)}`
  );
}

/** 微秒纪元字符串，如 "1783155928889255" */
export function microsEpoch(d: Date = new Date(), rand: () => number = Math.random): string {
  return (BigInt(d.getTime()) * 1000n + BigInt(Math.floor(rand() * 1000))).toString();
}

/** "item_1790517635918741_g2mpat" */
export function newItemId(d: Date = new Date(), rand: () => number = Math.random): string {
  let suffix = "";
  for (let i = 0; i < 6; i++) suffix += ALNUM[Math.floor(rand() * ALNUM.length)];
  return `item_${microsEpoch(d, rand)}_${suffix}`;
}

/** "20260704170528_1783155928889255"（回收站目录名） */
export function newRecycleId(d: Date = new Date(), rand: () => number = Math.random): string {
  return `${compactStamp(d)}_${microsEpoch(d, rand)}`;
}

/** 仅供测试：替换亚毫秒来源，使输出可确定 */
export function __setSubMsSource(fn: () => number): void {
  subMsSource = fn;
}
