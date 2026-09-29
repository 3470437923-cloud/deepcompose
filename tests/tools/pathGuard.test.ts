/**
 * 路径分级授权的边界（KL-TL-04）。
 * 这里只测纯函数：`..` 穿越的归一化、根内判定、以及 NTFS 备用数据流（ADS）拒绝。
 */
import { describe, expect, it } from "vitest";
import {
  NEEDS_CONFIRMATION_PREFIX,
  guardPath,
  isInside,
  normalizeForCompare,
  resolveToolPath,
  type GuardRoots,
} from "../../src/core/tools/pathGuard";

const roots: GuardRoots = {
  projectRoot: "D:\\书\\星海拾梦",
  skillsDir: "C:\\Users\\me\\AppData\\Roaming\\writerd\\skills",
  booksRoot: "D:\\书",
};

describe("normalizeForCompare / isInside", () => {
  it("统一分隔符与大小写，折叠 '.' 与 '..'", () => {
    expect(normalizeForCompare("D:/书\\星海拾梦/./章节内容")).toBe("d:\\书\\星海拾梦\\章节内容");
    expect(normalizeForCompare("D:\\书\\星海拾梦\\章节内容\\..\\小说资料")).toBe("d:\\书\\星海拾梦\\小说资料");
  });

  it("根内判定按 '\\' 边界对齐（C:\\ab 不算在 C:\\a 内）", () => {
    expect(isInside("D:\\书", "D:\\书\\星海拾梦\\第1章.md")).toBe(true);
    expect(isInside("D:\\书", "D:\\书")).toBe(true);
    expect(isInside("D:\\书\\星", "D:\\书\\星海拾梦")).toBe(false);
    expect(isInside("", "D:\\书\\星海拾梦")).toBe(false);
  });
});

describe("guardPath：授权根内放行、根外需确认", () => {
  it("项目内 / 作品根内的相对与绝对路径都放行", () => {
    expect(guardPath("章节内容\\第1章.md", roots).ok).toBe(true);
    expect(guardPath("D:\\书\\雾都谍影\\第1章.md", roots).ok).toBe(true);
    expect(guardPath("", roots).ok).toBe(true); // 空 = 项目根
  });

  it("根外一律逐字拒绝（确认机制未启用）", () => {
    const r = guardPath("C:\\Windows\\System32\\drivers\\etc\\hosts", roots);
    expect(r.ok).toBe(false);
    expect(r.message?.startsWith(NEEDS_CONFIRMATION_PREFIX)).toBe(true);
  });

  it("`..` 穿越穿越到根外也拒绝（归一化用词法回退，抵消盘符也不放行）", () => {
    const r = guardPath("..\\..\\..\\Windows\\win.ini", roots);
    expect(r.ok).toBe(false);
  });
});

describe("guardPath：NTFS 备用数据流（ADS）", () => {
  it("根内路径挂冒号尾巴也拒绝 —— 否则判定看主路径、写入落隐藏流", () => {
    const r = guardPath("章节内容\\第1章.md:payload", roots);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("冒号");
  });

  it("盘符相对写法 `C:file` 同样拒绝（会拼出含冒号的路径）", () => {
    const r = guardPath("C:file", roots);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("冒号");
  });

  it("盘符本身的冒号（`C:\\...`）不算 ADS —— 不能把正常绝对路径一起拒了", () => {
    const r = guardPath("C:\\Users\\me\\AppData\\Roaming\\writerd\\skills\\x.md", roots);
    expect(r.ok).toBe(true);
  });

  it("resolveToolPath 保留原样（判定在 guardPath 做，解析不改路径）", () => {
    expect(resolveToolPath("章节内容\\第1章.md:payload", roots).abs).toBe(
      "D:\\书\\星海拾梦\\章节内容\\第1章.md:payload",
    );
  });
});