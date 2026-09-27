import io
import os

HERE = os.path.dirname(os.path.abspath(__file__))

# scratch reports no longer needed (superseded by the consolidated r_*.txt kept below)
DROP = [
    "out_strings.txt", "r_skill_inject.txt", "r_trailr.txt", "r_sysprompt.txt",
    "r_prompt_hunt.txt", "r_prompt2.txt", "r_desc_sweep.txt", "r_params.txt",
    "r_longs.txt", "r_str_long.txt", "r_sweep2.txt", "r_rstrings.txt",
    "r_sentence_sweep.txt", "r_skillfmt.txt", "r_skillfmt2.txt", "r_zones.txt",
    "r_prompt3.txt",
]
for fn in DROP:
    p = os.path.join(HERE, fn)
    if os.path.exists(p):
        os.remove(p)
        print("removed", fn)

README = """# _extract — OpenWrite 工具层逐字提取工作区

本目录是生成 `../TOOLS.md` 的工具与中间产物。**不是文档的一部分**，可随时删除
（但删除后无法重跑 `TOOLS.md` 生成器）。

## 为什么需要这一层

任务给定的 `S:\\writerD\\reference\\` 证据文件有**两个已证实的覆盖缺口**：

1. `WIN_app.so.strings.txt` 由 `reference/extract_strings.py` 生成，其正则
   `[\\x20-\\x7e\\xc2-\\xf4][\\x20-\\x7e\\x80-\\xbf]{2,400}` **把 ASCII 串截断到 400 字节**。
   → 受影响业务文案 2 条：`terminal` 工具描述（真实 612 字符）、
   `create_skill` 的 resources 参数描述（真实 433 字符）。

2. `utf16_objects_all.txt` 由 `reference/extract_utf16_obj.py` 生成，它假设
   「字符数据起始 = 8 字节对齐对象 VA + 24」且 `length == 字符数*2`。
   → **默认系统提示词（116 字）整条被漏采**。

## 文件

### 恢复层（TOOLS.md 引用的证据）
| 文件 | 内容 |
|---|---|
| `app_so_full_strings.txt` | 去掉 400 字节上限重扫 `app.so` 的 ASCII 串（96,162 条）；偏移与 reference 文件一致 |
| `app_so_full_utf16.txt` | 去掉 4000 字符上限重扫的 TwoByteString（21,728 条，与 reference 计数一致） |

### 工具
| 文件 | 用途 |
|---|---|
| `ev2.py` | 统一检索层：同时载入 `reference/` 与恢复层，提供 `records/search/all_exact` |
| `extract_full.py` | 生成 `app_so_full_strings.txt` |
| `extract_full_utf16.py` | 生成 `app_so_full_utf16.txt` |
| `gen_doc.py` | 生成 `TOOLS.md` §0–§2 |
| `gen_doc2.py` | 追加 §3–§5 |
| `gen_doc3.py` | 追加 §6 |
| `patch03.py` | 一次性补丁：更正 §0.3 的尾随 `r` 结论 |
| `audit.py` | 校验 `TOOLS.md` 中每个逐字代码块确实存在于证据中 |

### 检索报告（人工复核用）
`r_*.txt` —— 各轮检索的原始输出，可据此复现 TOOLS.md 的每一条结论。

## 重新生成 TOOLS.md

```
cd S:\\writerD\\docs\\spec\\_extract
python extract_full.py
python extract_full_utf16.py
python gen_doc.py && python gen_doc2.py && python gen_doc3.py
python audit.py
```

## 前置依赖

`app.so` 必须存在：`S:\\dsh\\OpenWrite\\data\\app.so`
（13,058,992 字节，sha256 `45cffe64c02abab5ccc4dbcef9f643dea5611476224cf9b63959fa637bd5c888`）。
若不在此路径，改 `ev2.py` / `extract_full*.py` 顶部的常量。
"""
with io.open(os.path.join(HERE, "README.md"), "w", encoding="utf-8", newline="\n") as f:
    f.write(README)
print("wrote README.md")
