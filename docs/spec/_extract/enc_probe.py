import sys, os, io
sys.stdout.reconfigure(encoding='utf-8')

REF = r"S:\writerD\reference"
files = [
    "WIN_app.so.strings.txt",
    "WIN_app.so.keyword_hits.txt",
    "zh_ui_strings.txt",
    "utf16_objects_all.txt",
    "zh_ui_classified.txt",
    "utf16_objects_zh.txt",
]
for fn in files:
    p = os.path.join(REF, fn)
    raw = open(p, 'rb').read()
    print("=" * 70)
    print(fn, "bytes =", len(raw))
    # try utf-8
    for enc in ("utf-8", "utf-16-le", "gbk"):
        try:
            raw.decode(enc)
            print("   decodes as", enc, "OK")
        except Exception as e:
            print("   decodes as", enc, "FAIL:", str(e)[:90])
    print("   first 120 bytes repr:", repr(raw[:120]))
