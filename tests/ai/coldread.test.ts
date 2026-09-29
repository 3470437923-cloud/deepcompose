/**
 * 冷读隔离：审读提示词不携带项目上下文；零工具请求体不含 tools 键；
 * 用户消息装配、报告路径与落盘格式。
 *
 * 这是「隔离由代码物理保证」的回归锁：任何往冷读系统提示词里掺项目路径、
 * 往零工具请求体里掺 tools 键的改动都会在这里被拦下。
 */
import { describe, expect, it } from "vitest";
import { buildRequest, type ProviderConfig } from "../../src/core/ai/protocol";
import {
  COLD_READ_GOAL_LABEL,
  buildColdReadUserMessage,
  coldReadReportBody,
  coldReadReportRel,
  coldReadSessionTitle,
  coldReadSystem,
} from "../../src/core/ai/coldread";

const cfg: ProviderConfig = {
  baseUrl: "https://api.example.com",
  apiKey: "sk-test",
  model: "test-model",
  temperature: 0.7,
  useAnthropicFormat: false,
};

describe("冷读系统提示词（隔离内容）", () => {
  it("只包含审读者身份与输出规则，不包含任何项目路径/设定引用", () => {
    for (const goal of ["clarity", "pace"] as const) {
      const s = coldReadSystem(goal);
      expect(s).toContain("第一次阅读");
      // 契约目录名与资料文件不得出现在冷读提示词里（隔离的反向断言）
      expect(s).not.toContain("小说资料");
      expect(s).not.toContain("00-项目状态");
      expect(s).not.toContain("06-写作规则");
      expect(s).not.toContain("skills");
      // 无文件工具语义
      expect(s).not.toContain("file_write");
      expect(s).not.toContain("file_read");
    }
  });

  it("两个目标不同：清晰度五方面 / 节奏五方面", () => {
    expect(coldReadSystem("clarity")).toContain("叙述清晰度");
    expect(coldReadSystem("clarity")).toContain("信息首次出现");
    expect(coldReadSystem("pace")).toContain("节奏与追读欲");
    expect(coldReadSystem("pace")).toContain("弃读风险");
    expect(coldReadSystem("clarity")).not.toBe(coldReadSystem("pace"));
  });

  it("报告制纪律：不打分、不凑数、不替写", () => {
    const s = coldReadSystem("clarity");
    expect(s).toContain("不打分");
    expect(s).toContain("不替写正文");
    expect(s).toContain("如实写");
  });
});

describe("零工具请求体（物理隔离）", () => {
  it("tools=[] 时 body 不含 tools 键（模型无法调用文件工具）", () => {
    // sendIsolated 恒以 tools:[] 调 buildRequest——"不含 tools 键"就是隔离的物理形态
    const req = buildRequest(cfg, [], [], coldReadSystem("clarity"));
    expect("tools" in req.body).toBe(false);
    // 系统提示词走 system 消息
    const msgs = req.body.messages as { role: string; content: string }[];
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toContain("第一次阅读");
  });

  it("Anthropic 协议同样不带 tools", () => {
    const req = buildRequest({ ...cfg, useAnthropicFormat: true }, [], [], coldReadSystem("pace"));
    expect("tools" in req.body).toBe(false);
    expect(req.body.system).toContain("审读");
  });
});

describe("用户消息装配", () => {
  it("含审读对象全文与前文块（读者已读部分）", () => {
    const m = buildColdReadUserMessage("第3章", "第三章正文。", [
      { title: "第1章", text: "第一章正文。" },
      { title: "第2章", text: "第二章正文。" },
    ]);
    expect(m).toContain("【前文（读者已读部分）：第1章】");
    expect(m).toContain("第一章正文。");
    expect(m).toContain("【本次审读对象：第3章】");
    expect(m).toContain("第三章正文。");
    // 前文在对象之前
    expect(m.indexOf("第1章")).toBeLessThan(m.indexOf("本次审读对象"));
  });

  it("无前文时只有审读对象", () => {
    const m = buildColdReadUserMessage("第1章", "正文。", []);
    expect(m).not.toContain("前文");
    expect(m).toContain("【本次审读对象：第1章】");
  });

  it("会话标题带冷读前缀（列表可辨，且不会被 New Chat 派生逻辑覆盖）", () => {
    // controller.sendIsolated 不做标题派生；前缀「冷读 - 」也不满足 "New Chat" 开头条件
    expect(coldReadSessionTitle("第3章")).toBe("冷读 - 第3章");
  });
});

describe("报告落盘", () => {
  it("路径：小说资料/审核/<章标签>-冷读-<目标>-<时间戳>.md", () => {
    // 小说资料/审核 为磁盘契约目录名；时间戳 YYYYMMDD-HHmm（本地时间）
    const rel = coldReadReportRel("第3章", "clarity", new Date(2026, 4, 6, 9, 5));
    expect(rel).toBe("小说资料/审核/第3章-冷读-clarity-20260506-0905.md");
  });

  it("报告体：CRLF、元信息头、AI 输出原文", () => {
    const body = coldReadReportBody(
      "第3章",
      "pace",
      [{ title: "第2章", text: "…" }],
      "## 问题清单\n1. 第三章开头走神。",
      new Date(2026, 4, 6, 9, 5),
    );
    expect(body).toContain("# 冷读报告 - 第3章\r\n");
    expect(body).toContain(`审读目标：${COLD_READ_GOAL_LABEL.pace}`);
    expect(body).toContain("提供前文：第2章");
    expect(body).toContain("生成时间：2026-05-06 09:05");
    expect(body).toContain("独立冷读实例输出");
    // AI 输出原样保留（LF 归一为 CRLF，内容不改写）
    expect(body).toContain("1. 第三章开头走神。");
    expect(body).not.toMatch(/(?<!\r)\n/); // 全文 CRLF
  });
});
