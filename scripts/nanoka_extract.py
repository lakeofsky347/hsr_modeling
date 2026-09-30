#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Normalize nanoka.cc HSR data (v4.6.51) for the four target characters.

Input : data/nanoka/raw/**   (produced by scripts/fetch_nanoka.sh)
Output: data/nanoka/normalized/<id>_<slug>.json
        data/nanoka/index.json
        reports/<id>_<slug>.md   (data sheet; mechanics section left as placeholder)
"""
import datetime
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'data', 'nanoka', 'raw')
NORM = os.path.join(ROOT, 'data', 'nanoka', 'normalized')
REP = os.path.join(ROOT, 'reports')
VERSION = '4.6.51'

TARGETS = [(1506, 'silver_wolf_lv999'), (1501, 'sparxie'), (1503, 'pearl'), (1511, 'aeon_aha')]

PATH_ZH = {'Warrior': '毁灭', 'Rogue': '巡猎', 'Mage': '智识', 'Shaman': '同谐', 'Warlock': '虚无',
           'Knight': '存护', 'Priest': '丰饶', 'Memory': '记忆', 'Elation': '欢愉'}
ELEM_ZH = {'Physical': '物理', 'Fire': '火', 'Ice': '冰', 'Thunder': '雷', 'Wind': '风',
           'Quantum': '量子', 'Imaginary': '虚数'}
TAG_ZH = {'SingleAttack': '单攻', 'AoEAttack': '群攻', 'Bounce': '弹射', 'Blast': '扩散',
          'Enhance': '强化', 'Summon': '召唤', 'Defense': '防御', 'Support': '辅助', 'Heal': '治疗',
          'Maze': '秘技', 'MazeAttack': '秘技攻击', 'MazeNormal': '大世界攻击'}
PROP_ZH = {'CriticalChanceBase': '暴击率', 'CriticalDamageBase': '暴击伤害', 'SpeedDelta': '速度',
           'HPAddedRatio': '生命值百分比', 'AttackAddedRatio': '攻击力百分比',
           'DefenceAddedRatio': '防御力百分比', 'ElationDamageAddedRatioBase': '欢愉度',
           'StatusProbabilityBase': '效果命中', 'StatusResistanceBase': '效果抵抗',
           'BreakDamageAddedRatioBase': '击破特攻', 'SPRatioBase': '能量恢复效率',
           'HealRatioBase': '治疗量加成', 'PhysicalAddedRatio': '物理属性伤害提高',
           'FireAddedRatio': '火属性伤害提高', 'IceAddedRatio': '冰属性伤害提高',
           'ThunderAddedRatio': '雷属性伤害提高', 'WindAddedRatio': '风属性伤害提高',
           'QuantumAddedRatio': '量子属性伤害提高', 'ImaginaryAddedRatio': '虚数属性伤害提高'}
SLOT_ZH = {'HEAD': '头部', 'HAND': '手部', 'BODY': '躯干', 'FOOT': '脚部', 'NECK': '位面球', 'OBJECT': '连结绳'}
RARITY_STARS = {'CombatPowerAvatarRarityType5': 5, 'CombatPowerAvatarRarityType4': 4}
LC_RARITY = {'CombatPowerLightconeRarity5': 5, 'CombatPowerLightconeRarity4': 4, 'CombatPowerLightconeRarity3': 3}
PHASE_MAX = [20, 30, 40, 50, 60, 70, 80]
TYPE_ORDER = ['普攻', '战技', '终结技', '天赋', '秘技', '欢愉技', '固有行迹', '强化普攻', '大世界攻击', '']

PLACEHOLDER = re.compile(r'#(\d+)\[([a-z0-9]+)\](%?)')
RUBY = re.compile(r'\{RUBY_B#[^}]*\}')


def strip_markup(t):
    if not t:
        return t
    for a, b in (('<unbreak>', ''), ('</unbreak>', ''), ('<u>', ''), ('</u>', ''),
                 ('<i>', ''), ('</i>', ''), ('{RUBY_E#}', '')):
        t = t.replace(a, b)
    t = re.sub(r'<color=[^>]*>', '', t)
    t = t.replace('</color>', '')
    t = RUBY.sub('', t)
    t = t.replace('\\n', chr(10))
    return t


def fmt_num(v, pct):
    if pct:
        v = v * 100.0
    if abs(v - round(v)) < 1e-9:
        return str(int(round(v)))
    return ('%.2f' % v).rstrip('0').rstrip('.')


def resolve(text, params):
    if not text:
        return text

    def rep(m):
        idx = int(m.group(1)) - 1
        fmt = m.group(2)
        pct = bool(m.group(3))
        if params is None or idx >= len(params):
            return m.group(0)
        try:
            v = float(params[idx])
        except Exception:
            return m.group(0)
        if fmt.startswith('f') and not pct:
            s = ('%.1f' % v).rstrip('0').rstrip('.')
        else:
            s = fmt_num(v, pct)
        return s + ('%' if pct else '')

    return PLACEHOLDER.sub(rep, strip_markup(text))


def resolve_plain(text, params):
    return strip_markup(resolve(text, params))


def pct_map(*texts):
    m = {}
    for t in texts:
        if not t:
            continue
        for mm in PLACEHOLDER.finditer(t):
            idx = int(mm.group(1)) - 1
            if idx not in m:
                m[idx] = bool(mm.group(3))
    return m


def load(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def zh_name(entry, key='zh'):
    v = (entry or {}).get(key)
    return strip_markup(v) if v else None

def main():
    sup = os.path.join(RAW, 'support')
    chars = load(os.path.join(sup, 'character.json'))
    lightcones = load(os.path.join(sup, 'lightcone.json'))
    relicsets = load(os.path.join(sup, 'relicset.json'))
    items = load(os.path.join(sup, 'zh_item.json'))
    os.makedirs(NORM, exist_ok=True)
    os.makedirs(REP, exist_ok=True)

    index = {'source': {'site': 'https://hsr.nanoka.cc', 'cdn': 'https://static.nanoka.cc/hsr/' + VERSION,
                        'version': VERSION, 'fetched_at': datetime.date.today().isoformat()},
             'characters': []}

    for cid, slug in TARGETS:
        zh = load(os.path.join(RAW, 'detail', '%d_zh.json' % cid))
        en = load(os.path.join(RAW, 'detail', '%d_en.json' % cid))
        base = chars.get(str(cid), {})
        rec = {}
        rec['id'] = cid
        rec['slug'] = slug
        rec['source_url'] = 'https://hsr.nanoka.cc/character/%d' % cid
        rec['data_url_zh'] = 'https://static.nanoka.cc/hsr/%s/zh/character/%d.json' % (VERSION, cid)
        rec['names'] = {'zh': strip_markup(zh.get('name')), 'en': strip_markup(en.get('name')),
                        'ja': strip_markup(base.get('ja') or ''), 'ko': strip_markup(base.get('ko') or '')}
        rec['rarity'] = {'code': zh.get('rarity'), 'stars': RARITY_STARS.get(zh.get('rarity'))}
        rec['path'] = {'code': zh.get('base_type'), 'zh': PATH_ZH.get(zh.get('base_type'), zh.get('base_type'))}
        rec['element'] = {'code': zh.get('damage_type'), 'zh': ELEM_ZH.get(zh.get('damage_type'), zh.get('damage_type'))}
        rec['max_energy'] = zh.get('sp_need')
        rel = base.get('release')
        rec['release'] = {'ts': rel,
                          'date': datetime.datetime.fromtimestamp(rel, datetime.timezone.utc).strftime('%Y-%m-%d') if rel else None}
        rec['icon'] = base.get('icon')
        rec['desc_zh'] = strip_markup(zh.get('desc'))
        rec['desc_en'] = strip_markup(en.get('desc'))

        stats = []
        for k in sorted(zh.get('stats', {}), key=lambda x: int(x)):
            e = zh['stats'][k]
            lv = PHASE_MAX[int(k)]
            stats.append({'phase': int(k), 'level_cap': lv,
                          'atk': round(e['attack_base'] + e['attack_add'] * (lv - 1), 1),
                          'hp': round(e['hp_base'] + e['hp_add'] * (lv - 1), 1),
                          'def': round(e['defence_base'] + e['defence_add'] * (lv - 1), 1),
                          'speed': e['speed_base'], 'crit_rate': e['critical_chance'],
                          'crit_dmg': e['critical_damage'], 'aggro': e['base_aggro'],
                          'atk_base': e['attack_base'], 'atk_add': e['attack_add'],
                          'hp_base': e['hp_base'], 'hp_add': e['hp_add'],
                          'def_base': e['defence_base'], 'def_add': e['defence_add'],
                          'ascension_cost': e.get('cost') or []})
        rec['stats'] = stats

        tree_map = {}
        for key, node in (zh.get('skill_trees') or {}).items():
            lvv = max(node, key=lambda x: int(x))
            n2 = node[lvv]
            for sk in (n2.get('level_up_skill_id') or []):
                tree_map[str(sk)] = {'anchor': n2.get('anchor'), 'point_type': n2.get('point_type'),
                                     'max_level': n2.get('max_level')}
        skills = []
        for sid in sorted(zh.get('skills', {}), key=lambda x: int(x)):
            s = zh['skills'][sid]
            se = (en.get('skills') or {}).get(sid, {})
            lv = s.get('level') or {}
            levels = [{'level': lv[k]['level'], 'params': lv[k]['param_list']}
                      for k in sorted(lv, key=lambda x: int(x))]
            pmax = levels[-1]['params'] if levels else None
            pct = pct_map(s.get('desc'), s.get('simple_desc'))
            param_table = []
            for i, p in enumerate(pmax or []):
                isp = pct.get(i, False)
                param_table.append({'index': i + 1, 'is_percent': isp,
                                    'value': fmt_num(p, True) + '%' if isp else fmt_num(p, False),
                                    'by_level': [fmt_num(float(x['params'][i]), True) + '%' if isp
                                                 else fmt_num(float(x['params'][i]), False)
                                                 for x in levels if i < len(x['params'])]})
            skills.append({
                'id': int(sid), 'name': strip_markup(s.get('name')), 'name_en': se.get('name'),
                'type_name': s.get('type_name'), 'type': s.get('type'), 'tag': s.get('tag'),
                'tag_zh': TAG_ZH.get(s.get('tag'), s.get('tag')),
                'stance_break': s.get('show_stance_list'), 'bp_need': s.get('bp_need'), 'bp_add': s.get('bp_add'),
                'elation_priority_value': s.get('elation_priority_value'),
                'is_primary': sid in tree_map, 'tree': tree_map.get(sid),
                'max_level': levels[-1]['level'] if levels else None,
                'min_level': levels[0]['level'] if levels else None,
                'levels': levels, 'param_table': param_table,
                'simple_desc': resolve_plain(s.get('simple_desc'), pmax),
                'desc_max': resolve_plain(s.get('desc'), pmax),
                'desc_lv1': resolve_plain(s.get('desc'), levels[0]['params'] if levels else None),
                'desc_en': se.get('desc'),
                'extra': s.get('extra') or {}})
        order = {}
        for i, t in enumerate(TYPE_ORDER):
            order[t] = i
        skills.sort(key=lambda s: (order.get(s['type_name'] if s['type_name'] in order else '', 99), s['id']))
        rec['skills'] = skills

        trees = {'abilities': [], 'elation_skill': [], 'stat_nodes': [], 'skill_level_nodes': [], 'other': []}
        for key in sorted(zh.get('skill_trees', {})):
            node = zh['skill_trees'][key]
            lv = max(node, key=lambda x: int(x))
            n = node[lv]
            item = {'anchor': n.get('anchor'), 'point_type': n.get('point_type'),
                    'name': strip_markup(n.get('point_name')),
                    'desc': resolve_plain(n.get('point_desc'), n.get('param_list')),
                    'max_level': n.get('max_level'), 'level_up_skill_id': n.get('level_up_skill_id'),
                    'status_add': [{'prop': st.get('property_type'),
                                    'name': st.get('name') or PROP_ZH.get(st.get('property_type')),
                                    'value': st.get('value'),
                                    'text': ('+%g' % st.get('value')) if st.get('property_type') == 'SpeedDelta'
                                            else ('+%g%%' % (st.get('value') * 100))}
                                   for st in (n.get('status_add_list') or [])],
                    'materials': n.get('material_list') or []}
            pt = n.get('point_type')
            if pt in (3, 6):
                trees['abilities'].append(item)
            elif pt == 4:
                trees['elation_skill'].append(item)
            elif pt == 1:
                trees['stat_nodes'].append(item)
            elif pt == 2:
                trees['skill_level_nodes'].append(item)
            else:
                trees['other'].append(item)
        rec['traces'] = trees

        eid = []
        for k in sorted(zh.get('ranks', {}), key=lambda x: int(x)):
            r = zh['ranks'][k]
            eid.append({'rank': int(k), 'id': r.get('id'), 'name': strip_markup(r.get('name')),
                        'desc': resolve_plain(r.get('desc'), r.get('param_list')),
                        'params': r.get('param_list'), 'icon': r.get('icon')})
        rec['eidolons'] = eid

        uniq = []
        for k, v in (zh.get('unique') or {}).items():
            uniq.append({'key': k, 'tag': v.get('tag'), 'name': strip_markup(v.get('name')),
                         'desc': resolve_plain(v.get('desc'), v.get('param')),
                         'param': v.get('param'), 'exclusive': v.get('exclusive'),
                         'glossary': {gk: {'name': gv.get('name'), 'desc': resolve_plain(gv.get('desc'), gv.get('param'))}
                                      for gk, gv in (v.get('extra') or {}).items()}})
        rec['unique'] = uniq
        rec['enhanced'] = zh.get('enhanced') or {}
        rec['memosprite'] = zh.get('memosprite') or {}
        rec['chara_info'] = zh.get('chara_info') or {}
        rec['skin'] = zh.get('skin') or {}

        rl = zh.get('relics') or {}
        build = {'relic_set_ids': rl.get('set4_id_list'), 'planar_set_ids': rl.get('set2_id_list'),
                 'main_stats': [{'slot': SLOT_ZH.get(p.get('relic_type'), p.get('relic_type')),
                                 'prop': PROP_ZH.get(p.get('property_type'), p.get('property_type')),
                                 'prop_code': p.get('property_type')} for p in (rl.get('property_list') or [])],
                 'sub_stats': [PROP_ZH.get(x, x) for x in (rl.get('sub_affix_property_list') or [])],
                 'score_rank_list': rl.get('score_rank_list')}
        build['relic_sets'] = []
        for sid in (rl.get('set4_id_list') or []):
            s = relicsets.get(str(sid), {})
            build['relic_sets'].append({'id': sid, 'name': zh_name(s) or s.get('en'), 'name_en': s.get('en'),
                                        'pieces': 4,
                                        'effects': {kk: resolve_plain(vv.get('zh'), vv.get('ParamList'))
                                                    for kk, vv in (s.get('set') or {}).items()}})
        build['planar_sets'] = []
        for sid in (rl.get('set2_id_list') or []):
            s = relicsets.get(str(sid), {})
            build['planar_sets'].append({'id': sid, 'name': zh_name(s) or s.get('en'), 'name_en': s.get('en'),
                                         'pieces': 2,
                                         'effects': {kk: resolve_plain(vv.get('zh'), vv.get('ParamList'))
                                                     for kk, vv in (s.get('set') or {}).items()}})
        build['lightcones'] = []
        for lid in (zh.get('lightcones') or []):
            l = lightcones.get(str(lid), {})
            build['lightcones'].append({'id': lid, 'name': zh_name(l) or l.get('en'), 'name_en': l.get('en'),
                                        'rarity': LC_RARITY.get(l.get('rank'), RARITY_STARS.get(l.get('rank'))),
                                        'path': PATH_ZH.get(l.get('baseType'), l.get('baseType')), 'atk': l.get('atk')})

        def nm(x):
            e2 = chars.get(str(x)) or {}
            return strip_markup(e2.get('zh')) or e2.get('en') or str(x)

        build['teams'] = []
        for t in (zh.get('teams') or []):
            build['teams'].append({'team_id': t.get('team_id'),
                                   'members': [nm(x) for x in (t.get('member_list') or [])],
                                   'member_ids': t.get('member_list'), 'position': t.get('position'),
                                   'backup': [nm(x) for x in (t.get('backup_list1') or [])]})
        rec['build'] = build

        rec['ascension_materials'] = []
        for c in ((stats[-1].get('ascension_cost') if stats else []) or []):
            it = items.get(str(c.get('item_id')), {})
            rec['ascension_materials'].append({'item_id': c.get('item_id'),
                                               'name': it.get('item_name') or str(c.get('item_id')),
                                               'count': c.get('item_num')})

        with open(os.path.join(NORM, '%d_%s.json' % (cid, slug)), 'w', encoding='utf-8') as f:
            json.dump(rec, f, ensure_ascii=False, indent=2)
        index['characters'].append({'id': cid, 'slug': slug, 'names': rec['names'], 'path': rec['path'],
                                    'element': rec['element'], 'stars': rec['rarity']['stars'],
                                    'release': rec['release'], 'skill_count': len(rec['skills']),
                                    'normalized_file': 'data/nanoka/normalized/%d_%s.json' % (cid, slug)})
        render(rec)

    with open(os.path.join(ROOT, 'data', 'nanoka', 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    print('normalized %d characters' % len(index['characters']))

def md_table(header, rows):
    out = ['| ' + ' | '.join(header) + ' |', '|' + '|'.join(['---'] * len(header)) + '|']
    for r in rows:
        cells = []
        for c in r:
            v = '' if c is None else str(c)
            cells.append(v.replace('|', '/').replace('\n', '<br>'))
        out.append('| ' + ' | '.join(cells) + ' |')
    return '\n'.join(out)


def quote_block(text):
    out = []
    for line in (text or '-').split('\n'):
        out.append('> ' + line.strip())
    return '\n'.join(out)


def render(rec):
    L = []
    n = rec['names']
    L.append('# %s（%s）' % (n['zh'], n['en']))
    L.append('')
    L.append('> 数据来源：[hsr.nanoka.cc/character/%d](%s) ｜ 静态数据：%s ｜ 数据版本 **%s** ｜ 抓取日期 %s'
             % (rec['id'], rec['source_url'], rec['data_url_zh'], VERSION, datetime.date.today().isoformat()))
    L.append('')
    L.append('## 一、角色概览')
    L.append('')
    L.append(md_table(['字段', '值'], [
        ['中文名', n['zh']], ['英文名', n['en']], ['日文名', n.get('ja')], ['韩文名', n.get('ko')],
        ['角色 ID', rec['id']], ['稀有度', '%s 星' % rec['rarity']['stars']],
        ['命途', '%s（%s）' % (rec['path']['zh'], rec['path']['code'])],
        ['战斗属性', '%s（%s）' % (rec['element']['zh'], rec['element']['code'])],
        ['能量上限', rec['max_energy']], ['实装日期', rec['release']['date'] or '未标注'],
        ['推荐遗器外圈', '、'.join('%s(4件)' % s['name'] for s in rec['build']['relic_sets']) or '-'],
        ['推荐遗器内圈', '、'.join('%s(2件)' % s['name'] for s in rec['build']['planar_sets']) or '-'],
        ['推荐光锥', '、'.join('%s（%s★）' % (l['name'], l['rarity']) for l in rec['build']['lightcones']) or '-'],
        ['配队示例', '、'.join('、'.join(t['members']) for t in rec['build']['teams']) or '-'],
    ]))
    L.append('')
    L.append('**角色简介**')
    L.append('')
    L.append(quote_block(rec['desc_zh']))
    L.append('')
    L.append('## 二、基础属性')
    L.append('')
    rows = [[s['phase'], s['level_cap'], s['atk'], s['hp'], s['def']] for s in rec['stats']]
    L.append(md_table(['突破阶段', '等级上限', '攻击力', '生命值', '防御力'], rows))
    L.append('')
    last = rec['stats'][-1]
    L.append('满级（Lv.80、6 突破）：**攻击力 %s ｜ 生命值 %s ｜ 防御力 %s**；速度 **%s**；暴击率 **%s%%**；暴击伤害 **%s%%**；仇恨值 **%s**。'
             % (last['atk'], last['hp'], last['def'], last['speed'], last['crit_rate'] * 100,
                last['crit_dmg'] * 100, last['aggro']))
    L.append('')
    L.append('成长公式（数据字段原文）：属性 = base + add × (等级 - 1)；例如 6 突破攻击力 = %s + %s × 79。'
             % (last['atk_base'], last['atk_add']))
    L.append('')
    L.append('## 三、技能')
    L.append('')
    for s in rec['skills']:
        label = s['type_name'] or ('大世界攻击' if s['type'] == 'MazeNormal' else '衍生技能')
        suffix = '' if s.get('is_primary') else '（衍生技能）'
        if s.get('tree') and s['tree']['point_type'] == 6:
            suffix = '（专属行迹技能）'
        if label == '固有行迹':
            suffix = '（「欢愉」命途升格时激活）'
        L.append('### %s · %s%s' % (label, s['name'], suffix))
        L.append('')
        st = (list(s['stance_break'] or []) + ['-', '-', '-'])[:3]
        stxt = '主目标 %s / 全体 %s / 相邻 %s' % (st[0], st[1], st[2])
        meta = ['ID %s' % s['id'], '英文名 %s' % (s['name_en'] or '-'), '类型 %s' % s['type'],
                'tag %s（%s）' % (s['tag_zh'], s['tag']), '削韧 %s' % stxt,
                '等级 1–%s' % s['max_level']]
        if s.get('tree'):
            meta.append('行迹节点 %s（point_type %s，上限 %s）' % (s['tree']['anchor'], s['tree']['point_type'], s['tree']['max_level']))
        if s['bp_need'] not in (None, -1):
            meta.append('消耗战技点 %s' % s['bp_need'])
        if s['bp_add'] not in (None, -1):
            meta.append('回复战技点 %s' % s['bp_add'])
        if s['elation_priority_value'] is not None:
            meta.append('欢愉技优先级 %s' % s['elation_priority_value'])
        L.append('- ' + ' ｜ '.join(str(m) for m in meta))
        if s['simple_desc']:
            L.append('- 简述：%s' % s['simple_desc'].replace('\n', ' '))
        L.append('')
        L.append('**满级（%s 级）效果**' % s['max_level'])
        L.append('')
        L.append(quote_block(s['desc_max'] or s['simple_desc'] or '-'))
        L.append('')
        if s['param_table']:
            head = ['等级'] + ['#%d%s' % (p['index'], '%' if p['is_percent'] else '') for p in s['param_table']]
            rows = []
            for i in range(s['max_level'] - (s['min_level'] or 1) + 1):
                lvl = (s['min_level'] or 1) + i
                rows.append([lvl] + [p['by_level'][i] if i < len(p['by_level']) else '' for p in s['param_table']])
            L.append(md_table(head, rows))
            L.append('')
    L.append('## 四、星魂（1–6）')
    L.append('')
    for e in rec['eidolons']:
        L.append('**星魂 %d · %s**' % (e['rank'], e['name']))
        L.append('')
        L.append(quote_block(e['desc']))
        L.append('')
    L.append('## 五、行迹')
    L.append('')
    L.append('### 5.1 额外能力 / 专属行迹')
    L.append('')
    for a in rec['traces']['abilities']:
        L.append('**%s**（锚点 %s，point_type %s）' % (a['name'], a['anchor'], a['point_type']))
        L.append('')
        L.append(quote_block(a['desc']))
        L.append('')
    if rec['traces']['elation_skill']:
        L.append('### 5.2 欢愉技节点')
        L.append('')
        for a in rec['traces']['elation_skill']:
            L.append('- 锚点 %s：技能等级上限 %s，关联技能 ID %s' % (a['anchor'], a['max_level'], a['level_up_skill_id']))
        L.append('')
    L.append('### 5.3 属性加成节点')
    L.append('')
    agg = {}
    for a in rec['traces']['stat_nodes']:
        for st in a['status_add']:
            key = (st['name'], st['text'])
            agg[key] = agg.get(key, 0) + 1
    L.append(md_table(['属性', '单节点数值', '节点数量'], [[k[0], k[1], v] for k, v in agg.items()]))
    L.append('')
    L.append('### 5.4 技能升级节点')
    L.append('')
    L.append(md_table(['锚点', '可升级技能 ID', '等级上限'],
                      [[a['anchor'], ', '.join(map(str, a['level_up_skill_id'] or [])), a['max_level']]
                       for a in rec['traces']['skill_level_nodes']]))
    L.append('')
    L.append('## 六、专属机制（unique）')
    L.append('')
    if not rec['unique']:
        L.append('> 站点数据中该角色的 unique 字段为空对象，无独立专属机制条目；相关机制写在技能 extra 的名词解释、行迹与星魂中。')
        L.append('')
    for u in rec['unique']:
            L.append('**%s**（tag %s，专属 %s）' % (u['name'], u['tag'], u['exclusive']))
            L.append('')
            L.append(quote_block(u['desc']))
            L.append('')
            for g in (u['glossary'] or {}).values():
                L.append('- 名词解释 **%s**：%s' % (g['name'], g['desc']))
            L.append('')
    L.append('## 七、官方推荐配置')
    L.append('')
    L.append('### 7.1 遗器套装')
    L.append('')
    for s in rec['build']['relic_sets'] + rec['build']['planar_sets']:
        L.append('**%s（%d 件套，ID %s）**' % (s['name'], s['pieces'], s['id']))
        L.append('')
        for k in sorted(s['effects']):
            L.append('- %s 件套：%s' % (k, s['effects'][k]))
        L.append('')
    L.append(md_table(['部位', '主词条'], [[m['slot'], m['prop']] for m in rec['build']['main_stats']]))
    L.append('')
    L.append('副词条优先级：%s' % (' > '.join(rec['build']['sub_stats']) or '-'))
    L.append('')
    L.append('### 7.2 光锥')
    L.append('')
    L.append(md_table(['ID', '名称', '稀有度', '命途', '满级攻击力'],
                      [[l['id'], l['name'], '%s★' % l['rarity'], l['path'], l['atk']]
                       for l in rec['build']['lightcones']]))
    L.append('')
    L.append('### 7.3 推荐配队')
    L.append('')
    L.append(md_table(['队伍', '成员（不含本体）', '备选'],
                      [[t['team_id'], '、'.join(t['members']), '、'.join(t['backup'])]
                       for t in rec['build']['teams']]))
    L.append('')
    L.append('### 7.4 突破材料（6 突破）')
    L.append('')
    L.append(md_table(['材料 ID', '名称', '数量'],
                      [[m['item_id'], m['name'], m['count']] for m in rec['ascension_materials']]))
    L.append('')
    L.append('## 八、机制解读')
    L.append('')
    L.append('<!-- MECHANICS_PLACEHOLDER -->')
    L.append('')
    with open(os.path.join(REP, '%d_%s.md' % (rec['id'], rec['slug'])), 'w', encoding='utf-8') as f:
        f.write('\n'.join(L))


if __name__ == '__main__':
    main()


