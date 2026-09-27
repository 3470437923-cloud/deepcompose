# -*- coding: utf-8 -*-
"""精确提取 Dart AOT TwoByteString（UTF-16LE）。

关键修正：
- 先前只扫 UTF-8 得出「快照无中文」的结论是错的。Dart 的 TwoByteString 用 UTF-16LE。
- 字符串对象在快照中 8 字节对齐；对象头 24 字节（tags/hash/length），
  字符数据起始 = 对象 VA + 24，因此字符数据也 8 字节对齐。
- 用对象头 length == 字符数*2 做硬校验，排除字节对偶噪声。
"""
import struct
import sys

WIN = r"S:\dsh\OpenWrite\data\app.so"
OUT = r"S:\dsh\work\reverse-openwrite"

TEXT_OFF = 0x0
TEXT_END = 0xc74000


def try_string(data, obj_va):
    """给定对象 VA，尝试解析为 TwoByteString 或 OneByteString。"""
    if obj_va < 0 or obj_va + 24 > len(data):
        return None
    tags, hashv, length = struct.unpack_from("<QQQ", data, obj_va)
    if tags != 0:
        return None  # 快照中字符串对象 tags 为 0
    if length == 0 or length % 2 != 0:
        return None
    nchars = length // 2
    if nchars < 1 or nchars > 4000:
        return None
    p = obj_va + 24
    if p + length > len(data):
        return None
    raw = data[p:p + length]
    try:
        s = raw.decode("utf-16-le")
    except UnicodeDecodeError:
        return None
    # 必须全是可打印/常见字符
    for ch in s:
        cp = ord(ch)
        if cp == 0:
            return None
        if not (0x20 <= cp <= 0x7E or 0x2000 <= cp <= 0x2FFF or 0x3000 <= cp <= 0x9FFF
                or 0xF900 <= cp <= 0xFAFF or 0xFF00 <= cp <= 0xFFEF or cp in (0x0A, 0x0D, 0x09)):
            return None
    return s


def main():
    data = open(WIN, "rb").read()
    found = {}
    for off in range(TEXT_OFF, min(TEXT_END, len(data)) - 24, 8):
        s = try_string(data, off)
        if s is None:
            continue
        cjk = sum(1 for c in s if 0x4E00 <= ord(c) <= 0x9FFF)
        found[off] = (s, cjk)

    print("通过对象头校验的 TwoByteString 总数: %d" % len(found))
    zh = {k: v for k, v in found.items() if v[1] > 0}
    print("其中含汉字的: %d" % len(zh))
    print("纯 ASCII 的: %d" % (len(found) - len(zh)))

    with open(OUT + r"\utf16_objects_all.txt", "w", encoding="utf-8") as f:
        for off in sorted(found):
            s, cjk = found[off]
            f.write("%08x\tobj=%d\tcjk=%d\t%s\n" % (off, off, cjk, s.replace("\n", "\\n")))
    print("写入:", OUT + r"\utf16_objects_all.txt")

    with open(OUT + r"\utf16_objects_zh.txt", "w", encoding="utf-8") as f:
        for off in sorted(zh):
            s, cjk = zh[off]
            f.write("%08x\tcjk=%d\t%s\n" % (off, cjk, s.replace("\n", "\\n")))
    print("写入:", OUT + r"\utf16_objects_zh.txt")

    print("\n=== 含汉字字符串样本（前 80）===")
    for off in sorted(zh)[:80]:
        s, cjk = zh[off]
        print("  %08x  [%d字] %s" % (off, cjk, s[:90]))


if __name__ == "__main__":
    main()
