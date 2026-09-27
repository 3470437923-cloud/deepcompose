# -*- coding: utf-8 -*-
"""解析 Flutter AOT app.so 的 ELF 结构，评估二进制补丁可行性。"""
import struct
import sys
import zipfile
import os

WIN = r"S:\dsh\OpenWrite\data\app.so"
APK = r"C:\Users\Administrator\Desktop\D大师\OpenWrite-v2.0.1-android-arm64.apk"


def parse_elf(data, label):
    print("=" * 70)
    print("ELF:", label)
    if data[:4] != b"\x7fELF":
        print("  not ELF")
        return
    ei_class = data[4]
    ei_data = data[5]
    is64 = ei_class == 2
    endian = "<" if ei_data == 1 else ">"
    e_machine = struct.unpack_from(endian + "H", data, 18)[0]
    e_entry = struct.unpack_from(endian + ("Q" if is64 else "I"), data, 24)[0]
    e_phoff = struct.unpack_from(endian + ("Q" if is64 else "I"), data, 32)[0]
    e_shoff = struct.unpack_from(endian + ("Q" if is64 else "I"), data, 40)[0]
    e_phentsize = struct.unpack_from(endian + "H", data, 54)[0]
    e_phnum = struct.unpack_from(endian + "H", data, 56)[0]
    e_shentsize = struct.unpack_from(endian + "H", data, 58)[0]
    e_shnum = struct.unpack_from(endian + "H", data, 60)[0]
    print("  64bit=%s machine=0x%x entry=0x%x" % (is64, e_machine, e_entry))
    print("  phoff=%d phnum=%d shoff=%d shnum=%d" % (e_phoff, e_phnum, e_shoff, e_shnum))

    print("  段表 (program headers):")
    for i in range(e_phnum):
        off = e_phoff + i * e_phentsize
        p_type, p_flags = struct.unpack_from(endian + "II", data, off)
        p_offset = struct.unpack_from(endian + ("Q" if is64 else "I"), data, off + 8)[0]
        p_vaddr = struct.unpack_from(endian + ("Q" if is64 else "I"), data, off + 16)[0]
        p_filesz = struct.unpack_from(endian + ("Q" if is64 else "I"), data, off + 32)[0]
        p_memsz = struct.unpack_from(endian + ("Q" if is64 else "I"), data, off + 40)[0]
        fl = "".join(c for b, c in ((4, "R"), (2, "W"), (1, "X")) if p_flags & b)
        print("    [%d] type=0x%x flags=%s off=0x%x vaddr=0x%x filesz=0x%x memsz=0x%x"
              % (i, p_type, fl, p_offset, p_vaddr, p_filesz, p_memsz))

    if e_shoff:
        print("  节表 (section headers):")
        for i in range(e_shnum):
            off = e_shoff + i * e_shentsize
            sh_name, sh_type = struct.unpack_from(endian + "II", data, off)
            sh_flags = struct.unpack_from(endian + ("Q" if is64 else "I"), data, off + 8)[0]
            sh_addr = struct.unpack_from(endian + ("Q" if is64 else "I"), data, off + 16)[0]
            sh_offset = struct.unpack_from(endian + ("Q" if is64 else "I"), data, off + 24)[0]
            sh_size = struct.unpack_from(endian + ("Q" if is64 else "I"), data, off + 32)[0]
            print("    [%2d] name=%d type=%d flags=0x%x addr=0x%x off=0x%x size=0x%x"
                  % (i, sh_name, sh_type, sh_flags, sh_addr, sh_offset, sh_size))
    return dict(is64=is64, endian=endian, machine=e_machine)


def main():
    win = open(WIN, "rb").read()
    parse_elf(win, "WIN data/app.so (x86-64)")
    with zipfile.ZipFile(APK) as z:
        apk = z.read("lib/arm64-v8a/libapp.so")
    parse_elf(apk, "APK lib/arm64-v8a/libapp.so (arm64)")


if __name__ == "__main__":
    main()
