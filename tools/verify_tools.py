import io, json
P = r"S:\dsh\openwrite-re\06_aotopsy\string_refs.jsonl"
keys = ["write","append","replace","insert","delete_lines","copy","rename","search","list","read",
        "operation","path","content","old_text","new_text","search_text","start_line","end_line",
        "new_path","replace_all","file_read","file_write","file_manage","edit_file","mode","offset","limit"]
res = {}
n = 0
for line in io.open(P, encoding="utf-8"):
    line = line.strip()
    if not line:
        continue
    try:
        r = json.loads(line)
    except Exception:
        continue
    v = r.get("value")
    if v in keys:
        res.setdefault(v, set()).add(r.get("func"))
        n += 1
print("命中记录:", n)
for k in keys:
    if k in res:
        fs = sorted(res[k])
        print("%-12s %2d 函数: %s" % (k, len(fs), fs[:12]))
