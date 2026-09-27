# -*- coding: utf-8 -*-
"""从 Flutter AOT 快照 (app.so / libapp.so) 中提取字符串，用于授权/付费逻辑侦察。"""
import re
import sys
import zipfile
import os
import json

OUT = r"S:\dsh\work\reverse-openwrite"
WIN_APP = r"S:\dsh\OpenWrite\data\app.so"
APK = r"C:\Users\Administrator\Desktop\D大师\OpenWrite-v2.0.1-android-arm64.apk"


def load_snapshots():
    snaps = {}
    if os.path.exists(WIN_APP):
        snaps["WIN_app.so"] = open(WIN_APP, "rb").read()
    if os.path.exists(APK):
        with zipfile.ZipFile(APK) as z:
            for name in z.namelist():
                if name.endswith("/libapp.so") or name.endswith("libapp.so"):
                    snaps["APK_libapp.so"] = z.read(name)
    return snaps


def extract(data):
    # Dart AOT 的字符串通常是 UTF-8，长度前缀由快照管理；直接扫可打印序列
    out = []
    for m in re.finditer(rb"[\x20-\x7e\xc2-\xf4][\x20-\x7e\x80-\xbf]{2,400}", data):
        try:
            s = m.group(0).decode("utf-8")
        except UnicodeDecodeError:
            continue
        out.append((m.start(), s))
    return out


KEYWORDS = [
    "http://", "https://", "api", "vip", "VIP", "pro", "Pro", "premium",
    "license", "License", "activation", "activate", "subscribe", "subscription",
    "pay", "paywall", "purchase", "order", "premium", "member", "会员",
    "购买", "付费", "解锁", "授权", "激活", "卡密", "试用", "到期", "续费",
    "device", "machine", "token", "auth", "jwt", "sign", "signature",
    "check_vip", "is_vip", "isPro", "isVip", "free", "Free", "trial",
]


def main():
    snaps = load_snapshots()
    summary = {}
    for label, data in snaps.items():
        print("=" * 70)
        print(label, "size =", len(data))
        strs = extract(data)
        print("ascii/utf8 strings:", len(strs))
        p = os.path.join(OUT, label.replace("/", "_") + ".strings.txt")
        with open(p, "w", encoding="utf-8") as f:
            for off, s in strs:
                f.write("%08x\t%s\n" % (off, s))
        print("written:", p)
        hits = {}
        for off, s in strs:
            for kw in KEYWORDS:
                if kw in s:
                    hits.setdefault(kw, []).append((off, s))
                    break
        summary[label] = {k: len(v) for k, v in hits.items()}
        with open(os.path.join(OUT, label.replace("/", "_") + ".keyword_hits.txt"), "w", encoding="utf-8") as f:
            for kw, items in hits.items():
                f.write("#### %s (%d)\n" % (kw, len(items)))
                for off, s in items[:400]:
                    f.write("  %08x  %s\n" % (off, s))
        print(json.dumps(summary[label], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
