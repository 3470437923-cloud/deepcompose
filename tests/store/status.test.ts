/** I-3 回归锁：00-项目状态.md 的结构化读取（只读不判、认不出不猜） */
import { describe, expect, it } from "vitest";
import {
  isStatusUntouched,
  parseProjectStatus,
  statusChapterNo,
} from "../../src/core/store/status";

const SAMPLE = `# 项目状态
- 项目名称：《雾都》
- 当前阶段：连续写作
- 当前章节：第012章
- 最新正式正文：章节内容/第11章.md
- 正文处理进度：起草中
- 下一步：写第12章初稿

## 开书大纲自检
- 状态：可试写
- 所检材料版本与范围：v3

## 默认正文流程（单主线）
- 恢复状态 → 最小读取
`;

describe("parseProjectStatus", () => {
  it("解析头部字段（模板实测形态）", () => {
    const s = parseProjectStatus(SAMPLE);
    expect(s.stage).toBe("连续写作");
    expect(s.chapter).toBe("第012章");
    expect(s.progress).toBe("起草中");
    expect(s.nextStep).toBe("写第12章初稿");
    expect(s.fields["项目名称"]).toBe("《雾都》");
  });

  it("分节里的 `- 状态：` 不算头部字段（不把「状态」误当进度）", () => {
    const s = parseProjectStatus(SAMPLE);
    expect(s.fields["状态"]).toBeUndefined();
    expect(Object.keys(s.fields)).not.toContain("所检材料版本与范围");
  });

  it("CRLF、半角冒号、无名文档都安全返回", () => {
    const crlf = parseProjectStatus("- 当前阶段：开书准备\r\n- 正文处理进度：未开始\r\n");
    expect(crlf.stage).toBe("开书准备");
    expect(crlf.progress).toBe("未开始");
    const half = parseProjectStatus("- 当前阶段: 收尾\n");
    expect(half.stage).toBe("收尾");
    const none = parseProjectStatus("随便一段没有字段的正文");
    expect(none.fields).toEqual({});
    expect(none.stage).toBe("");
  });

  it("同名键取首个（重复行不覆盖）", () => {
    const s = parseProjectStatus("- 当前阶段：连续写作\n- 当前阶段：开书准备\n");
    expect(s.stage).toBe("连续写作");
  });

  it("启用模块字段（D-043）：声明了才解析，未声明为 null（老作品按盘上文件为准）", () => {
    const s = parseProjectStatus("- 启用模块：伏笔、角色状态\n");
    expect(s.modules).toEqual(["伏笔", "角色状态"]);
    // 全不启用
    expect(parseProjectStatus("- 启用模块：无\n").modules).toEqual([]);
    // 逗号/分号分隔与空白容错
    expect(parseProjectStatus("- 启用模块：伏笔， 时间线;角色状态 \n").modules).toEqual(["伏笔", "时间线", "角色状态"]);
    // 老作品没有这一行 → null（不是空数组：两者语义不同）
    expect(parseProjectStatus("- 当前阶段：开书准备\n").modules).toBeNull();
    expect(parseProjectStatus("").modules).toBeNull();
  });

  it("null/空串不抛异常", () => {
    expect(parseProjectStatus("").fields).toEqual({});
  });
});

describe("statusChapterNo / isStatusUntouched", () => {
  it("章号解析（含三位补零形态）", () => {
    expect(statusChapterNo(parseProjectStatus("- 当前章节：第012章\n"))).toBe(12);
    expect(statusChapterNo(parseProjectStatus("- 当前章节：第12章 启程\n"))).toBe(12);
    expect(statusChapterNo(parseProjectStatus("- 当前章节：第零章\n"))).toBe(0);
    expect(statusChapterNo(parseProjectStatus("- 当前章节：无\n"))).toBeNull();
    expect(statusChapterNo(parseProjectStatus(""))).toBeNull();
  });

  it("初始态判定：开书准备 + 未开始", () => {
    expect(isStatusUntouched(parseProjectStatus("- 当前阶段：开书准备\n- 正文处理进度：未开始\n"))).toBe(true);
    expect(isStatusUntouched(parseProjectStatus("- 当前阶段：连续写作\n- 正文处理进度：未开始\n"))).toBe(false);
    expect(isStatusUntouched(parseProjectStatus(""))).toBe(false);
  });
});
