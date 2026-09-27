# -*- coding: utf-8 -*-
import io
import json
import re

DOC = r'S:\writerD\docs\spec\PREFS.md'
SRC = r'C:\Users\Administrator\AppData\Roaming\com.openwrite\OpenWrite\shared_preferences.json'

t = io.open(DOC, encoding='utf-8').read()
d = json.load(io.open(SRC, encoding='utf-8'))

print('doc utf-8 bytes:', len(t.encode('utf-8')), 'lines:', t.count('\n') + 1)
print('uppercase bool cells | `True`/| `False`):', t.count('| `True`'), t.count('| `False`'))
print('replacement chars:', t.count('\ufffd'))

# --- 保密闸门 ---
leak = False
checks = [
    ('api_key', d['flutter.api_key']),
    ('official_api_key', d['flutter.official_api_key']),
    ('vip_phone', d['flutter.vip_phone']),
    ('device_id', d['flutter.device_id']),
    ('webdav password', json.loads(d['flutter.webdav_config'])['password']),
    ('webdav username', json.loads(d['flutter.webdav_config'])['username']),
]
for i, o in enumerate(json.loads(d['flutter.saved_providers'])):
    checks.append(('saved_providers[%d].apiKey' % i, o['apiKey']))
for name, val in checks:
    hit = val in t
    if hit:
        leak = True
    print('  %-28s in doc: %s' % (name, hit))
for m in re.finditer(r'(?<!\d)1[3-9]\d{9}(?!\d)', t):
    leak = True
    print('  !! phone-pattern hit:', m.group(0))
for m in re.finditer(r'sk-[A-Za-z0-9_\-]{6,}', t):
    leak = True
    print('  !! sk- key hit:', m.group(0))
print('SECRET LEAK:', leak)

# --- 表格行数 == 键总数 ---
rows = [l for l in t.split('\n') if re.match(r'^\| `flutter\.', l)]
print('table rows starting with flutter.:', len(rows), '(expect 43)')
names = set(re.findall(r'^\| `(flutter\.[a-z_0-9]+)`', t, re.M))
print('distinct flutter keys in doc:', len(names), '(expect 43)')
print('missing from doc:', sorted(set(d) - names))
print('extra in doc:', sorted(names - set(d)))

# --- 未归类 ---
print('unclassified stated 0:', '未能归类的键数量：**0**' in t)

# --- 章节结构 ---
print('sections:')
for m in re.finditer(r'^#{2,3} .*$', t, re.M):
    print('  ', m.group(0))
