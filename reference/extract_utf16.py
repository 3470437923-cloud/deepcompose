# -*- coding: utf-8 -*-
"""Dart AOT 二字节字符串（TwoByteString）提取器。

修正：先前只扫 UTF-8 得出「无中文」的结论是错的。
Dart 的 TwoByteString 用 UTF-16LE 存储，中文必须按 UTF-16LE 提取。
"""
import re
import struct
import sys
import json
import collections

WIN = r"S:\dsh\OpenWrite\data\app.so"
OUT = r"S:\dsh\work\reverse-openwrite"


def extract_utf16le_strings(data, min_cjk=2):
    """按 UTF-16LE 提取含中文的字符串。

    Dart OneByteString 头 24 字节：tags/hash/length(Smi)
    TwoByteString 头同为 24 字节，length 为字符数<<1。
    这里先做无头扫描，再用头信息回验。
    """
    out = []
    # 找所有偶数对齐位置上的 UTF-16LE 中文序列
    n = len(data)
    i = 0
    while i < n - 4:
        # 快速筛选：低字节在 0x00-0xff，高字节在 0x4e-0x9f（CJK）
        hi = data[i + 1]
        if 0x4E <= hi <= 0x9F:
            j = i
            chars = []
            while j < n - 1:
                lo, h = data[j], data[j + 1]
                cp = lo | (h << 8)
                if 0x4E00 <= cp <= 0x9FFF or 0x3000 <= cp <= 0x303F or 0xFF00 <= cp <= 0xFFEF or 0x20 <= cp <= 0x7E or cp in (0x0A, 0x0D):
                    chars.append(chr(cp))
                    j += 2
                else:
                    break
            s = "".join(chars)
            cjk = sum(1 for c in s if 0x4E00 <= ord(c) <= 0x9FFF)
            # 必须偶数长度且总长合理，且不是纯 ASCII（ASCII 会被 OneByteString 表示）
            if cjk >= min_cjk and len(s) >= 4:
                # 校验对象头：字符数据偏移 = i，对象 VA = i - 24
                hdr_ok = None
                if i >= 24:
                    tags, hashv, length = struct.unpack_from("<QQQ", data, i - 24)
                    if length == len(s) * 2:
                        hdr_ok = (tags, hashv, length)
                out.append((i, s, hdr_ok))
                i = j
                continue
        i += 1
    return out


def main():
    data = open(WIN, "rb").read()
    hits = extract_utf16le_strings(data)
    print("UTF-16LE 含中文串（≥2 汉字）: %d" % len(hits))
    with_hdr = [h for h in hits if h[2]]
    print("其中对象头 length 字段回验通过: %d" % len(with_hdr))
    print()

    seen = collections.Counter()
    rows = []
    for off, s, hdr in hits:
        seen[s] += 1
        rows.append((off, s, bool(hdr)))

    # 去重输出
    uniq = {}
    for off, s, ok in rows:
        if s not in uniq or (ok and not uniq[s][1]):
            uniq[s] = (off, ok)

    with open(OUT + r"\zh_utf16_strings.txt", "w", encoding="utf-8") as f:
        for off, s, ok in sorted(rows, key=lambda r: r[0]):
            f.write("%08x\t%s\t%s\n" % (off, s, "OBJ" if ok else "raw"))
    print("写入:", OUT + r"\zh_utf16_strings.txt")

    with open(OUT + r"\zh_utf16_unique.txt", "w", encoding="utf-8") as f:
        for s, (off, ok) in sorted(uniq.items(), key=lambda kv: kv[1][0]):
            f.write("%08x\t%s\n" % (off, s))
    print("去重写入:", OUT + r"\zh_utf16_unique.txt", "共 %d 条" % len(uniq))

    print("\n=== 前 60 条样本 ===")
    for s, (off, ok) in sorted(uniq.items(), key=lambda kv: kv[1][0])[:60]:
        print("  %08x  %s%s" % (off, s, "  [OBJ]" if ok else ""))


if __name__ == "__main__":
    main()
