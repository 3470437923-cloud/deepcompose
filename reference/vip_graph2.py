# -*- coding: utf-8 -*-
"""构建 VIP/授权相关函数的完整调用图，并导出可补丁点候选。"""
import json
import os
from collections import defaultdict

ROOT = r"S:\dsh\openwrite-re\06_aotopsy"
OUT = r"S:\dsh\work\reverse-openwrite"

KEYS = ["is_vip", "vip_status", "vip_expire_time", "vip_is_lifetime", "vip_days_left",
        "vip_type", "vip_phone", "vip_device_limit", "vip_device_count", "vip_last_check",
        "need_vip", "device_limit", "device_id", "member_type", "device_required",
        "device_count", "current_devices", "vip_last_check"]


def jl(name):
    with open(os.path.join(ROOT, name), "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    yield json.loads(line)
                except Exception:
                    pass


def main():
    # 1) 关键词 -> 函数 + pc
    seed = defaultdict(set)
    for r in jl("string_refs.jsonl"):
        v = r.get("value", "")
        if v in KEYS:
            seed[v].add((r.get("func"), r.get("pc")))

    funcs = set()
    for v in seed.values():
        for fn, pc in v:
            funcs.add(fn)

    print("### VIP 直接相关函数（%d）" % len(funcs))
    for fn in sorted(funcs):
        print("   ", fn)

    # 2) 调用图
    callers = defaultdict(set)
    callees = defaultdict(set)
    pcs = defaultdict(set)
    for e in jl("call_edges.jsonl"):
        src = e.get("from_func")
        tgt = e.get("target")
        if e.get("kind", "").startswith("call_indirect") and not tgt:
            continue
        if src and tgt:
            callers[tgt].add(src)
            callees[src].add(tgt)
            pcs[(src, tgt)].add(e.get("from_pc"))

    print("\n### 调用者链（谁调用了 VIP 函数）")
    lines = []
    for fn in sorted(funcs):
        c = sorted(callers.get(fn, []))
        lines.append("%-46s <- %s" % (fn, c[:10]))
        print("  ", lines[-1])

    # 3) 二跳调用者（UI 层入口）
    print("\n### 二跳调用者（可能为 UI 入口）")
    second = defaultdict(set)
    for fn in funcs:
        for c in callers.get(fn, []):
            for c2 in callers.get(c, []):
                second[fn].add(c2)
    for fn in sorted(funcs):
        s = sorted(second.get(fn, []))
        if s:
            print("  %-46s <- %s" % (fn, s[:8]))

    # 4) 导出 need_vip 相关函数的调用点
    with open(os.path.join(OUT, "vip_call_graph.txt"), "w", encoding="utf-8") as f:
        for fn in sorted(funcs):
            f.write("### %s\n" % fn)
            f.write("  字符串命中: %s\n" % [k for k, vs in seed.items() if any(v[0] == fn for v in vs)])
            f.write("  调用者: %s\n" % sorted(callers.get(fn, [])))
            f.write("  被调用: %s\n" % sorted(callees.get(fn, []))[:40])
            f.write("  二跳: %s\n" % sorted(second.get(fn, [])))
            f.write("\n")

    # 5) 统计：所有含 need_vip 的调用点
    print("\n### need_vip 引用点")
    for r in jl("string_refs.jsonl"):
        if r.get("value") == "need_vip":
            print("   ", r.get("func"), r.get("pc"), "pool_idx", r.get("pool_idx"))


if __name__ == "__main__":
    main()
