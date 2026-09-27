# -*- coding: utf-8 -*-
"""验证 Dart AOT x86-64 布尔常量补丁的定位精度。

Dart AOT x64 中：THR.bool_false = [R14+0x90]，THR.bool_true = [R14+0x98]，null = [R14+0x80]。
因此"返回 false"编译为 MOV reg, [R14+0x90]，改成 [R14+0x98] 即变 true（1 字节补丁）。
"""
import re
import struct
import sys

TARGETS = {
    "WIN_installed": r"S:\dsh\OpenWrite\data\app.so",
    "WIN_setup": r"S:\dsh\openwrite-re\01_innoextract\app\data\app.so",
}

# REX 前缀 -> 目标寄存器名（低 3 位）
REG = {0: "RAX", 1: "RCX", 2: "RDX", 3: "RBX", 6: "RSI", 7: "RDI"}


def scan_boolean_movs(data, base_text_off=0x4bc000, text_end=0xc74000):
    """扫描 MOV r64, [R14+disp32]，disp32 ∈ {0x80 null, 0x90 false, 0x98 true}。

    编码：REX.WRB(0x4D) 8B modrm=0x86/0x8E/... disp32
    ModRM mod=10, rm=110 → (modrm & 0xC0) == 0x80 and (modrm & 0x07) == 0x06
    """
    hits = []
    for off in range(base_text_off, min(text_end, len(data)) - 8):
        if data[off] != 0x49 and data[off] != 0x4D:
            continue
        if data[off + 1] != 0x8B:
            continue
        modrm = data[off + 2]
        if (modrm & 0xC0) != 0x80 or (modrm & 0x07) != 0x06:
            continue
        reg = (modrm >> 3) & 0x07
        if reg == 4:
            continue
        r = REG.get(reg)
        if r is None:
            continue
        disp = struct.unpack_from("<i", data, off + 3)[0]
        if disp in (0x80, 0x90, 0x98):
            hits.append((off, r, disp))
    return hits


def main():
    for label, path in TARGETS.items():
        data = open(path, "rb").read()
        hits = scan_boolean_movs(data)
        n_false = sum(1 for h in hits if h[2] == 0x90)
        n_true = sum(1 for h in hits if h[2] == 0x98)
        n_null = sum(1 for h in hits if h[2] == 0x80)
        print("=== %s (size=%d) ===" % (label, len(data)))
        print("  MOV r64,[R14+0x90] (false) : %d" % n_false)
        print("  MOV r64,[R14+0x98] (true)  : %d" % n_true)
        print("  MOV r64,[R14+0x80] (null)  : %d" % n_null)
        with open(r"S:\dsh\work\reverse-openwrite\bool_movs_%s.txt" % label, "w", encoding="utf-8") as f:
            for off, r, disp in hits:
                f.write("%08x  MOV %s, [R14+0x%02x]  (%s)\n"
                        % (off, r, disp, {0x80: "null", 0x90: "false", 0x98: "true"}.get(disp, "?")))


if __name__ == "__main__":
    main()
