import json, re, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
pairs = [('银狼LV999', '1506'), ('火花', '1501'), ('真珠', '1503'), ('星神阿哈', '1511')]
for name, cid in pairs:
    digest = open(os.path.join(ROOT, 'reports', 'mechanics', name + '.md'), encoding='utf-8').read()
    raw = open(os.path.join(ROOT, 'data', 'nanoka', 'raw', 'detail', cid + '_zh.json'), encoding='utf-8').read()
    norm = open(os.path.join(ROOT, 'data', 'nanoka', 'normalized', [f for f in os.listdir(os.path.join(ROOT, 'data', 'nanoka', 'normalized')) if f.startswith(cid)][0]), encoding='utf-8').read()
    nums = sorted(set(re.findall(r'\d+(?:\.\d+)?', digest)))
    miss_raw, miss_norm = [], []
    for n in nums:
        if float(n) < 3:
            continue
        if n not in raw:
            miss_raw.append(n)
        if n not in norm:
            miss_norm.append(n)
    print('==', name, cid, '| numbers:', len(nums))
    print('   不在原始 JSON 文本中:', miss_raw)
    print('   不在归一化 JSON 中:', miss_norm)
