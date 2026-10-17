import { describe, expect, it } from "vitest";
import { pickLatestPending, type FileRef } from "../../src/core/store/project";
import { parseProjectStatus } from "../../src/core/store/status";
const file = (name: string): FileRef => ({ name, rel: "待确认/" + name, path: "/book/待确认/" + name, size: 0, mtimeMs: 0 });
describe("继续写作候选选择", () => {
  it("按章号数字选择最大章节，不比较解析对象", () => {
    expect(pickLatestPending([file("第2章-候选.md"), file("第10章-候选.md"), file("第11章-候选.md")])?.name).toBe("第11章-候选.md");
  });
  it("同章历史稿保留时，尊重00显式最新候选，兼容注释与旧分隔符", () => {
    const pending = [file("第11章-v1-初稿.md"), file("第11章-v2-候选.md"), file("第11章-候选.md")];
    const status = parseProjectStatus("- 当前唯一最新候选：待确认\\第11章-候选.md（v3 单候选；历史稿保留）");
    expect(pickLatestPending(pending, status)).toBe(pending[2]);
    expect(pending).toHaveLength(3);
  });
  it("指针可显式选较早章，不以修改时间猜测作者意图", () => {
    const pending = [file("第10章-候选.md"), file("第11章-候选.md")];
    expect(pickLatestPending(pending, parseProjectStatus("- 当前唯一最新候选：待确认/第10章-候选.md"))).toBe(pending[0]);
  });
  it("失效指针回退最大章号，忽略工程记录；空目录返回null", () => {
    const pending = [file("工程性bug记录.md"), file("第12章-候选.md"), file("第3章-候选.md")];
    expect(pickLatestPending(pending, parseProjectStatus("- 当前唯一最新候选：待确认/不存在.md"))).toBe(pending[1]);
    expect(pickLatestPending([])).toBeNull();
  });
});
