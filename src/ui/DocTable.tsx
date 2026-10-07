/**
 * 资料表格视图（D-043 / B7，P1 只读）：把 docTableFor 的解析结果渲染成表格。
 *
 * 视觉纪律（DESIGN.md）：1px 发丝线分界、无投影、状态列用线形/徽章表达；
 * 长单元格两行截断、点击展开；过窄时由 CSS 退化为逐条卡片（媒体查询）。
 *
 * 展开判定（2026-10-06 修复）：**实测溢出**而不是字符数拍脑袋 ——
 * 截断是按可视行数（-webkit-line-clamp: 2）发生的，与字符数是两码事：
 * 列窄时 40 字就超两行被截，旧实现却因为不足 60 字符连点击入口都不给
 * （"有的表格完全无法展开"的根因）。现在挂载与尺寸变化时量
 * scrollHeight > clientHeight，真被截的单元格才有展开/收起交互。
 */
import { useEffect, useRef, useState } from "react";
import type { DocTable, DocTablePart, GridRow } from "../core/store/doctable";

/** 长单元格：两行截断；**实测被截断**才可点击展开/收起 */
function Cell({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    const measure = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    measure();
    // 列宽随窗口/面板变化：尺寸一变就重新量（截断状态跟着变）
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, text]);

  if (text === "") return <span className="dt-empty">—</span>;
  const interactive = open || clamped;
  return (
    <span
      ref={ref}
      className={open ? "dt-cell" : "dt-cell clamp"}
      title={interactive ? (open ? "点击收起" : "点击展开全文") : undefined}
      onClick={interactive ? () => setOpen((v) => !v) : undefined}
      role={interactive ? "button" : undefined}
    >
      {text}
    </span>
  );
}

/** 状态类值的徽章（只读展示；中性灰底，不消耗强调色） */
function StatusCell({ text }: { text: string }) {
  if (text === "") return <span className="dt-empty">—</span>;
  return <span className="dt-status">{text}</span>;
}

/** grid 的一行（只读形态） */
function GridRowView({ part, row }: { part: Extract<DocTablePart, { kind: "grid" }>; row: GridRow }) {
  return (
    <tr>
      {row.cells.map((cell, j) => (
        <td key={j}>
          {/^(状态|命中章节数)$/.test(part.columns[j]) ? <StatusCell text={cell} /> : <Cell text={cell} />}
        </td>
      ))}
    </tr>
  );
}

function PartView({ part }: { part: DocTablePart }) {
  if (part.kind === "prose") {
    return (
      <div className="dt-part">
        {part.title ? <div className="dt-part-title">{part.title}</div> : null}
        <div className="dt-prose">{part.text}</div>
      </div>
    );
  }
  if (part.kind === "kv") {
    return (
      <div className="dt-part">
        {part.title ? <div className="dt-part-title">{part.title}</div> : null}
        <table className="dt-table dt-kv">
          <tbody>
            {part.rows.map((r, i) => (
              <tr key={i}>
                <th scope="row">{r.label}</th>
                <td><Cell text={r.value} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="dt-part">
      {part.title ? <div className="dt-part-title">{part.title}</div> : null}
      <div className="dt-scroll">
        <table className="dt-table dt-grid">
          <thead>
            <tr>
              {part.columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {part.rows.map((row, i) => (
              <GridRowView key={i} part={part} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 资料表格视图（只读）；unparsedBlocks > 0 时顶部给一条回落提示 */
export default function DocTableView({ table }: { table: DocTable }) {
  if (table.parts.length === 0) {
    return <div className="dt-empty-doc">没有可表格化的内容（切回原文查看）。</div>;
  }
  return (
    <div className="dt-root">
      {table.unparsedBlocks > 0 ? (
        <div className="dt-note" role="status">
          有 {table.unparsedBlocks} 块未按格式解析，已按原文显示（只报告，不改写）。
        </div>
      ) : null}
      {table.parts.map((p, i) => (
        <PartView key={i} part={p} />
      ))}
    </div>
  );
}
