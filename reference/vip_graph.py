# -*- coding: utf-8 -*-
"""从 aotopsy 索引中抽取 VIP / 授权相关的调用图与函数清单。"""
import json
import os
import sys
from collections import defaultdict

ROOT = r"S:\dsh\openwrite-re\06_aotopsy"


def load_jsonl(name):
    p = os.path.join(ROOT, name)
    with open(p, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except Exception:
                continue


KEYS = ["is_vip", "vip_status", "vip_expire_time", "vip_is_lifetime", "vip_days_left",
        "vip_type", "vip_phone", "vip_device_limit", "vip_device_count", "vip_last_check",
        "need_vip", "device_limit", "device_id", "member_type", "paidVip",
        "vip_last_check", "device_required", "device_count", "current_devices"]


def main():
    print("### 1. 字符串 -> 函数 映射（VIP 相关）")
    funcs_of_key = defaultdict(set)
    for r in load_jsonl("string_refs.jsonl"):
        v = r.get("value", "")
        if v in KEYS:
            funcs_of_key[v].add(r.get("func"))
    for k in KEYS:
        fs = sorted(funcs_of_key.get(k, []))
        print("  %-20s %d 个函数: %s" % (k, len(fs), fs[:12]))

    all_vip_funcs = set()
    for k in KEYS:
        all_vip_funcs |= funcs_of_key.get(k, set())
    print("\n  合计涉及 %d 个函数" % len(all_vip_funcs))
    with open(r"S:\dsh\work\reverse-openwrite\vip_functions.txt", "w", encoding="utf-8") as f:
        for fn in sorted(all_vip_funcs):
            f.write(fn + "\n")

    print("\n### 2. 这些函数的调用者（call_edges 反向）")
    callers = defaultdict(set)
    callees = defaultdict(set)
    for e in load_jsonl("call_edges.jsonl"):
        src = e.get("caller") or e.get("from") or e.get("src")
        dst = e.get("callee") or e.get("to") or e.get("dst")
        if src is None or dst is None:
            # 打印一次结构
            if len(callers) == 0 and len(callees) == 0:
                print("  [call_edges 字段]", list(e.keys()))
                print("  [示例]", json.dumps(e, ensure_ascii=False)[:300])
            continue
        callers[dst].add(src)
        callees[src].add(dst)

    for fn in sorted(all_vip_funcs):
        c = sorted(callers.get(fn, []))
        if c:
            print("  %-40s <- %d 个调用者: %s" % (fn, len(c), c[:8]))

    print("\n### 3. functions.jsonl 结构")
    for i, r in enumerate(load_jsonl("functions.jsonl")):
        print("  ", json.dumps(r, ensure_ascii=False)[:400])
        if i >= 2:
            break

    print("\n### 4. classes.jsonl 结构")
    for i, r in enumerate(load_jsonl("classes.jsonl")):
        print("  ", json.dumps(r, ensure_ascii=False)[:400])
        if i >= 2:
            break


if __name__ == "__main__":
    main()
