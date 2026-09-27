import io

P = r"S:\writerD\docs\spec\_extract\gen_doc.py"
src = io.open(P, encoding="utf-8").read()
lines = src.split("\n")

# locate the 0.3 block
start = None
end = None
for i, ln in enumerate(lines):
    if ln.startswith('W("### 0.3 '):
        start = i
    if start is not None and ln.startswith('W("### 0.4 '):
        end = i
        break
assert start is not None and end is not None, (start, end)
print("replacing lines", start + 1, "..", end)

NEW = '''W("### 0.3 尾随 `r` 现象：**已推翻**先前假设，按未决处理")
W("")
W("`path is required` / `name is required` 在 ASCII 串文件里显示为带尾随 `r`：")
W("")
block("\\n".join("0x%08x : %r" % (BIN.find(t), BIN[BIN.find(t):BIN.find(t) + 20])
                for t in (b"path is requiredr", b"name is requiredr")))
W("")
W("**但这不足以判定 UI 文案本身带 `r`。** 全量普查显示该现象**系统性存在**，不是这两条的例外：")
W("")
W("- `app_so_full_strings.txt` 中**以 `r` 结尾**且含空格的「散文式」记录共 **179 条**。")
W("- 同一现象大量出现在 **Flutter 框架自带字符串**上，与 OpenWrite 业务无关，例如：")
W("")
CENSUS = [
    "Max items to return. read: lines (default 2000, max 2000). list: entries (default 200, max 500).r",
    "Unexpected start tag (%(originalName)s). Treated as %(newName)s.r",
    "Unexpected end of file. Expected foreign contentr",
    "We should never reach this pointr",
    "Data uri must not have authorityr",
    "Trailing solidus not allowed on element %(name)sr",
    "Source contains non-ASCII bytes.r",
    "operation failedr",
    "Bearer anonymousr",
    "Invalid enveloper",
    "Connection resetr",
    "Assertion failedr",
    "Gateway Time-outr",
    "Payment Requiredr",
    "Afficher le menur",
    "Pesquisar na Webr",
]
for t in CENSUS:
    for fn, off in all_exact(t):
        W("  - %s  %s" % (F(fn, off), t))
W("")
W("上面每条都是「句子 + 单个 `r`」。这更像**提取/布局层面的系统性伪影**（例如 Dart 字符串池")
W("按 8 字节对齐排布时，提取正则多吃进了一个相邻字节），而非 179 处真实拼写错误。")
W("")
W("**两条判据互相矛盾，故本规格不下结论**：")
W("")
W("| 判据 | 指向 |")
W("|---|---|")
W("| 同族 15 条 `xxx is required` 全部以 NUL 填充结尾，只有这两条在文本后**没有 NUL**，`r` 紧贴 | 支持「`r` 是内容」 |")
W("| 179 条含 Flutter 框架串同样带尾随 `r` | 支持「`r` 是系统性伪影」 |")
W("| 用 `tags,hash,length` 对象头复核：`VA=0x0028cb08` 读到 `q2=0x20`（32 字节），与 17 字符不符 | 该模型在此区域不成立，**不能**作判据 |")
W("")
W("**本规格的处理**：§3.1 / §3.3 按**原始文件内容逐字引用**（即写作 `path is requiredr`、")
W("`name is requiredr`），同时在 §6 把它标为**未决项**。")
W("")
W("**给 writerD 的建议**：实现时采用**不带**尾随 `r` 的 `path is required` / `name is required`")
W("（与同族 15 条 `xxx is required` 形态一致），并在 ADR 记录该判断与依据；")
W("**不要**照抄尾随 `r`，除非后续拿到 `dart` 层证据（反编译 `kernel_blob.bin` 或直接解码字符串池）")
W("证明它就是文案内容。")
W("")'''

lines[start:end] = NEW.split("\n")
io.open(P, "w", encoding="utf-8", newline="\n").write("\n".join(lines))
print("patched, new length", len(lines), "lines")
