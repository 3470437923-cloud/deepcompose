# -*- coding: utf-8 -*-
"""定位 Dart AOT 快照中引用特定字符串对象的代码位置，验证二进制补丁可行性。

Dart AOT 中字符串是堆对象：对象头 (8B tags + 8B hash + 8B length) + 字符数据。
所以字符串字面量所在地址 = 字符数据地址 - 24 (OneByteString, x64)。
代码中通过 RIP 相对寻址引用该对象。
"""
import struct
import sys

from capstone import Cs, CS_ARCH_X86, CS_MODE_64, CS_ARCH_ARM64, CS_MODE_ARM
from elftools.elf.elffile import ELFFile

WIN = r"S:\dsh\OpenWrite\data\app.so"


def load(path):
    f = open(path, "rb")
    elf = ELFFile(f)
    data = open(path, "rb").read()
    segs = []
    for seg in elf.iter_segments():
        if seg["p_type"] == "PT_LOAD":
            segs.append((seg["p_vaddr"], seg["p_offset"], seg["p_filesz"],
                         "X" if seg["p_flags"] & 1 else ("W" if seg["p_flags"] & 2 else "R")))
    return data, segs


def find_string_addr(data, needle):
    offs = []
    start = 0
    while True:
        i = data.find(needle, start)
        if i < 0:
            break
        offs.append(i)
        start = i + 1
    return offs


def find_refs(data, segs, target_va, arch="x86"):
    """扫描代码段，找 RIP 相对引用 target_va 的指令。"""
    hits = []
    if arch == "x86":
        md = Cs(CS_ARCH_X86, CS_MODE_64)
        for vaddr, off, filesz, fl in segs:
            if fl != "X":
                continue
            code = data[off:off + filesz]
            for insn in md.disasm(code, vaddr):
                if insn.mnemonic in ("lea", "mov", "cmp") and "rip" in insn.op_str:
                    # 解析 [rip + 0x...]
                    s = insn.op_str
                    try:
                        if "+" in s and "rip" in s:
                            disp = int(s.split("+")[1].split("]")[0].strip(), 16)
                            tgt = insn.address + insn.size + disp
                            if tgt == target_va:
                                hits.append((insn.address, insn.mnemonic, s))
                    except Exception:
                        pass
    return hits


def main():
    data, segs = load(WIN)
    print("PT_LOAD 段:")
    for v, o, sz, fl in segs:
        print("  vaddr=0x%x off=0x%x size=0x%x %s" % (v, o, sz, fl))
    targets = [b"is_vip", b"vip_status", b"need_vip", b"vip_expire_time", b"device_limit"]
    for t in targets:
        print("=" * 60)
        offs = find_string_addr(data, t)
        print("字符串 %r 字符数据偏移: %s" % (t, [hex(o) for o in offs]))
        for off in offs:
            # OneByteString 对象头 24 字节 (x64: tags 8 + hash 8 + length 8)
            for hdr in (24, 16, 32):
                obj_va = off - hdr
                refs = find_refs(data, segs, obj_va)
                if refs:
                    print("  对象 VA 0x%x (hdr=%d) 被引用 %d 次:" % (obj_va, hdr, len(refs)))
                    for a, m, s in refs[:10]:
                        print("     0x%x  %s %s" % (a, m, s))


if __name__ == "__main__":
    main()
