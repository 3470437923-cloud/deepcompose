import io, glob
p = glob.glob(r"dist\assets\*.css")[0]
s = io.open(p, encoding="utf-8").read()
print("dist CSS:", len(s), "bytes")
for k in [".win{", ".a-nav{", ".a-head{", ".app-shell{", ".titlebar{", ".fitter{"]:
    print("%-14s %s" % (k, "YES" if k in s else "MISSING"))
js = glob.glob(r"dist\assets\*.js")[0]
j = io.open(js, encoding="utf-8").read()
print("dist JS:", len(j), "bytes")
for k in ["app-shell", "fitter", "win-frame", "a-nav", "SettingsScreen", "holder"]:
    print("%-16s x%d" % (k, j.count(k)))
