import json, os, glob, collections
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for f in sorted(glob.glob(os.path.join(ROOT, 'data', 'nanoka', 'normalized', '*.json'))):
    d = json.load(open(f, encoding='utf-8'))
    agg = collections.OrderedDict()
    for a in d['traces']['stat_nodes']:
        for st in a['status_add']:
            key = st['name']
            agg[key] = agg.get(key, 0.0) + float(st['value'])
    print('==', d['names']['zh'], d['id'])
    for k, v in agg.items():
        print('   %-16s +%g%s' % (k, v * (1 if k == '速度' else 100), '' if k == '速度' else '%'))
    print('   满级: ATK %.1f HP %.1f DEF %.1f SPD %s' % (d['stats'][-1]['atk'], d['stats'][-1]['hp'], d['stats'][-1]['def'], d['stats'][-1]['speed']))
    for s in d['skills']:
        if s['id'] in (150602, 150103, 150301, 151103):
            print('   skill %s %s max_level=%s params=%s' % (s['id'], s['name'], s['max_level'], s['levels'][-1]['params']))
