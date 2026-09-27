# -*- coding: utf-8 -*-
"""从已校验的 UTF-16 字符串对象中过滤出真实业务文案（排除 1 字噪声）。"""
import io
import collections

SRC = r"S:\dsh\work\reverse-openwrite\utf16_objects_zh.txt"
OUT = r"S:\dsh\work\reverse-openwrite"

rows = []
with io.open(SRC, encoding="utf-8") as f:
    for line in f:
        parts = line.rstrip("\n").split("\t", 2)
        if len(parts) < 3:
            continue
        off = int(parts[0], 16)
        cjk = int(parts[1].split("=")[1])
        s = parts[2]
        rows.append((off, cjk, s))

total = len(rows)
# 过滤：至少 2 个汉字，且长度 >= 3，排除纯单字
real = [(o, c, s) for o, c, s in rows if c >= 2 and len(s) >= 3]
print("原始 %d 条，过滤后（≥2 汉字且长度≥3）%d 条" % (total, len(real)))

# 去重
uniq = {}
for o, c, s in real:
    if s not in uniq or o < uniq[s][0]:
        uniq[s] = (o, c)
print("去重后 %d 条" % len(uniq))

with io.open(OUT + r"\zh_ui_strings.txt", "w", encoding="utf-8") as f:
    for s, (o, c) in sorted(uniq.items(), key=lambda kv: kv[1][0]):
        f.write("%08x\t%s\n" % (o, s))
print("写入:", OUT + r"\zh_ui_strings.txt")

# 分类抽样
buckets = collections.defaultdict(list)
KEYMAP = [
    ("工具/文件", ["文件", "目录", "路径", "读取", "写入", "追加", "替换", "删除", "重命名", "复制", "搜索"]),
    ("技能", ["技能", "SKILL", "参考", "导入", "导出", "启用", "禁用"]),
    ("VIP/付费", ["会员", "套餐", "购买", "绑定", "设备", "到期", "续费", "解锁", "试用", "手机号", "支付", "额度"]),
    ("AI/模型", ["模型", "上下文", "压缩", "摘要", "思考", "温度", "令牌", "token", "Key", "接口"]),
    ("小说/章节", ["章节", "小说", "大纲", "人物", "世界观", "剧情", "伏笔", "字数"]),
    ("同步", ["同步", "备份", "云端", "局域网", "手机", "二维码", "坚果云"]),
    ("其他功能", ["排版", "回收站", "备忘录", "起名", "灵感", "抽卡", "审稿", "拆解", "扫描"]),
]
for name, kws in KEYMAP:
    for s, (o, c) in uniq.items():
        if any(k in s for k in kws):
            buckets[name].append((o, s))

with io.open(OUT + r"\zh_ui_classified.txt", "w", encoding="utf-8") as f:
    for name, _ in KEYMAP:
        items = sorted(buckets.get(name, []))
        f.write("#### %s (%d)\n" % (name, len(items)))
        for o, s in items[:200]:
            f.write("  %08x  %s\n" % (o, s))
            print("  [%s] %s" % (name, s[:100]))
        f.write("\n")
print("\n写入:", OUT + r"\zh_ui_classified.txt")
