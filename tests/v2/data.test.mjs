// tests/v2/data.test.mjs —— engine2/data.gen.js（build_kits.mjs 产物）数据质量回归
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA } from '../../engine2/data.gen.js';
import { buildCharacter } from '../../scripts/v2/build_kits.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const C = DATA.characters;
const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, a + ' ≉ ' + b);
const sk = (id, slot) => C[id].skills.find((s) => s.slot === slot);
const lvP = (s, lv) => s.params[(lv || s.defaultLevel) - 1];
const allSkills = (c) => [...c.skills, ...((c.memosprite && c.memosprite.skills) || [])];
const effs = (s) => s.effects.map((e) => e.stat);

test('规模与版本', () => {
  assert.equal(DATA.version, '4.7');
  assert.equal(Object.keys(C).length, 99);
  assert.equal(Object.keys(DATA.lightcones).length, 172);
  assert.ok(Object.keys(DATA.relicSets).length >= 60);
  assert.ok(Object.keys(DATA.monsters).length >= 664);
  const size = fs.statSync(path.join(ROOT, 'engine2/data.gen.js')).size;
  assert.ok(size < 6e6, 'data.gen.js 过大 ' + size);
  const kits = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/v2/kits.json'), 'utf8'));
  assert.equal(kits.generatedAt, DATA.generatedAt, 'kits.json 与 data.gen.js 同源');
});

test('面板：希儿 80 级 / 光锥于夜色中', () => {
  const b = C['1102'].base;
  near(b.atk, 640.33); near(b.hp, 931.39); near(b.def, 363.83);
  assert.equal(b.spd, 115); assert.equal(b.critRate, 0.05); assert.equal(b.critDmg, 0.5);
  assert.equal(C['1102'].element, 'Quantum'); assert.equal(C['1102'].path, 'Rogue'); assert.equal(C['1102'].energyMax, 120);
  assert.deepEqual(C['1102'].traceStats, { atkPct: 0.28, critDmg: 0.24, defPct: 0.125 });
  const lc = DATA.lightcones['23001'];
  near(lc.base.atk, 582.12); near(lc.base.hp, 1058.4); near(lc.base.def, 463.05);
  assert.equal(lc.params.length, 5);
  assert.equal(lc.params[0][0], 0.18); assert.equal(lc.params[4][0], 0.3);
  assert.equal(C['1006'].base.atk.toFixed(1), '640.3'); // README 校验：银狼
  assert.equal(C['1001'].base.def.toFixed(1), '573.3'); // 三月七
});

test('技能倍率 / 等级 / 战技点 / 能量 / 韧性', () => {
  const b = sk('1102', 'basic'), e = sk('1102', 'skill'), q = sk('1102', 'ult');
  assert.equal(b.defaultLevel, 6); assert.equal(e.defaultLevel, 10); assert.equal(q.defaultLevel, 10);
  assert.equal(lvP(b)[b.hits[0].param], 1.0);
  // v3.5 数据：希儿用 AvatarConfigEnhanced 改版倍率（战技 220%→360%，终结技 425%→720%）
  assert.equal(lvP(e)[e.hits[0].param], 3.6);
  assert.equal(lvP(q)[q.hits[0].param], 7.2);
  assert.deepEqual([b.spCost, b.spGain, e.spCost, e.spGain], [0, 1, 1, 0]);
  assert.deepEqual([b.energyGain, e.energyGain, q.energyGain], [20, 30, 5]);
  assert.deepEqual(b.toughness, { main: 30, aoe: 0, adjacent: 0 });
  assert.deepEqual(e.toughness, { main: 60, aoe: 0, adjacent: 0 });
  assert.ok(!/<|#\d/.test(e.desc), '已代入并去标签');
  assert.ok(/#1\[i\]%/.test(e.rawDesc));
  const skl = e.effects.find((x) => x.stat === 'spdPct');
  assert.ok(skl && skl.target === 'self' && skl.duration === 3);
  assert.deepEqual(C['1102'].eidolons[2].skillLevelUp, { skill: 2, talent: 2 });
  assert.deepEqual(C['1102'].eidolons[4].skillLevelUp, { ult: 2, basic: 1 });
});

test('每名角色都有 basic/skill/ult，含伤害描述的普攻都有 hit', () => {
  for (const c of Object.values(C)) {
    for (const slot of ['basic', 'skill', 'ult']) assert.ok(sk(c.id, slot), c.id + ' 缺少 ' + slot);
    const b = sk(c.id, 'basic');
    if (/伤害/.test(b.rawDesc) && /#\d+\[\w+\]%/.test(b.rawDesc)) assert.ok(b.hits.length > 0, c.id + ' ' + c.name + ' 普攻无 hit');
  }
});

test('引用完整性：hit/effect 的 param 下标都存在；effect key 全局唯一', () => {
  const keys = new Set();
  const chk = (e, params, where) => {
    assert.ok(e.key && !keys.has(e.key), '重复 key ' + e.key); keys.add(e.key);
    if (e.value && typeof e.value === 'object') assert.ok(params[e.value.param] != null, where + ' ' + e.key);
    assert.ok(['self', 'team', 'ally', 'allies', 'enemy', 'enemies'].includes(e.target), e.key);
    assert.ok(['high', 'low'].includes(e.confidence));
  };
  for (const c of Object.values(C)) {
    for (const s of allSkills(c)) {
      const p = lvP(s) || [];
      for (const h of s.hits) {
        assert.ok(p[h.param] != null, c.id + ':' + s.id + ' hit param');
        if (h.countParam != null) assert.ok(p[h.countParam] != null);
        assert.ok(['single', 'aoe', 'adjacent', 'bounce', 'random'].includes(h.target));
        if (h.dmgType === 'dot') assert.ok(h.duration > 0, 'DoT 需 duration');
      }
      for (const e of s.effects) chk(e, p, c.id + ':' + s.id);
    }
    for (const t of c.traces) for (const e of t.effects) chk(e, t.params, 'trace');
    for (const t of c.eidolons) for (const e of t.effects) chk(e, t.params, 'eidolon');
  }
  for (const l of Object.values(DATA.lightcones)) for (const e of l.effects) chk(e, l.params[0], 'lc ' + l.id);
  for (const r of Object.values(DATA.relicSets)) for (const part of [r.set2, r.set4]) if (part) for (const e of part.effects) chk(e, part.params, 'relic ' + r.id);
});

test('1005 卡芙卡：扩散、DoT、追加攻击、引爆', () => {
  const e = sk('1005', 'skill');
  assert.deepEqual(e.hits.map((h) => h.target), ['single', 'adjacent']);
  const q = sk('1005', 'ult');
  assert.ok(q.hits.some((h) => h.target === 'aoe' && h.dmgType === 'ult'));
  const dot = q.hits.find((h) => h.dmgType === 'dot');
  assert.ok(dot && dot.duration === 2 && dot.dotKind === 'shock' && lvP(q)[dot.param] === 2.9);
  assert.ok(q.specials.some((x) => x.kind === 'dotDetonate'));
  assert.ok(e.specials.some((x) => x.kind === 'dotDetonate'));
  const t = sk('1005', 'talent');
  assert.equal(t.hits[0].dmgType, 'fua'); assert.equal(lvP(t)[t.hits[0].param], 1.4);
  assert.ok(C['1005'].eidolons[0].effects.some((x) => x.stat === 'vuln_dot' && x.target === 'enemy'));
  assert.ok(C['1005'].eidolons[1].effects.some((x) => x.stat === 'dmgBonus_dot' && x.target === 'team'));
});

test('1204 景元 / 1212 镜流', () => {
  assert.ok(sk('1204', 'skill').hits[0].target === 'aoe');
  const t = sk('1204', 'talent');
  assert.ok(t.hits.length >= 1 && t.hits.every((h) => h.dmgType === 'fua'));
  assert.ok(sk('1212', 'enhancedSkill'), '镜流强化战技');
  assert.deepEqual(sk('1212', 'enhancedSkill').hits.map((h) => h.target), ['single', 'adjacent']);
  assert.ok(sk('1212', 'talent').effects.some((x) => x.stat === 'critRate'));
});

test('辅助：1309 知更鸟 / 1306 花火 / 1303 阮梅 / 1217 藿藿', () => {
  const rE = sk('1309', 'skill').effects.find((x) => x.stat === 'dmgBonus');
  assert.ok(rE && rE.target === 'team' && rE.duration === 3);
  const rQ = sk('1309', 'ult').effects.find((x) => x.stat === 'atk');
  assert.ok(rQ && rQ.scaleStat === 'atk' && rQ.flatAdd && rQ.target === 'team');
  assert.ok(sk('1309', 'talent').effects.some((x) => x.stat === 'critDmg' && x.target === 'team'));
  const sE = sk('1306', 'skill').effects;
  assert.ok(sE.some((x) => x.stat === 'critDmg' && x.target === 'ally' && x.scaleStat === 'critDmg'));
  assert.ok(sE.some((x) => x.stat === 'actionAdvance' && x.target === 'ally'));
  assert.ok(sk('1306', 'ult').effects.some((x) => x.stat === 'spFlat'));
  assert.ok(sk('1306', 'talent').effects.some((x) => x.stat === 'dmgBonus' && x.target === 'team' && x.maxStacks === 3));
  const mE = sk('1303', 'skill').effects;
  assert.ok(mE.some((x) => x.stat === 'dmgBonus' && x.target === 'team'));
  assert.ok(mE.some((x) => x.stat === 'weaknessBreakEfficiency' && x.target === 'team'));
  assert.ok(sk('1303', 'ult').effects.some((x) => x.stat === 'resPen' && x.target === 'team'));
  assert.ok(C['1303'].traces.some((t) => t.effects.some((x) => x.stat === 'breakEffect' && x.target === 'team')));
  const hQ = sk('1217', 'ult').effects;
  assert.ok(hQ.some((x) => x.stat === 'atkPct' && x.target === 'allies'));
  assert.ok(hQ.some((x) => x.stat === 'energyPct' && x.target === 'allies'));
  assert.equal(sk('1217', 'basic').hits[0].scaling, 'hp');
});

test('1307 黑天鹅 / 1310 流萤', () => {
  assert.ok(sk('1307', 'skill').effects.some((x) => x.stat === 'defShred' && x.target === 'enemy'));
  assert.deepEqual(sk('1307', 'skill').hits.map((h) => h.target), ['single', 'adjacent']);
  assert.ok(sk('1307', 'ult').effects.some((x) => x.stat === 'vuln' && x.target.startsWith('enem')));
  assert.ok(sk('1307', 'talent').hits.every((h) => h.dmgType === 'dot'));
  const fE = sk('1310', 'enhancedSkill');
  assert.ok(fE && fE.hits[0].extra && fE.hits[0].extra.stat === 'breakEffect');
  assert.deepEqual(fE.toughness, { main: 90, aoe: 0, adjacent: 45 });
  assert.ok(sk('1310', 'enhancedBasic').hits.length === 1);
  assert.ok(sk('1310', 'ult').effects.some((x) => x.stat === 'spd'));
});

test('欢愉：1501 / 1503 / 1506 / 1511', () => {
  const el = sk('1501', 'elation');
  assert.ok(el && el.hits.length >= 2 && el.hits.every((h) => h.scaling === 'elation' && h.dmgType === 'elation'));
  assert.ok(el.hits.some((h) => h.target === 'random' && h.countParam != null));
  assert.equal(sk('1501', 'ult').hits[0].extra.stat, 'elation');
  assert.ok(sk('1501', 'talent').hits.every((h) => h.scaling === 'elation'));
  assert.deepEqual(C['1501'].eidolons[2].skillLevelUp, { skill: 2, basic: 1, elation: 1 });
  assert.equal(sk('1503', 'basic').hits[0].scaling, 'def');
  assert.ok(sk('1503', 'ult').hits.some((h) => h.scaling === 'elation'));
  assert.ok(sk('1503', 'talent').hits.length === 0, '“抵挡伤害”不是伤害段');
  assert.equal(C['1506'].name, '银狼LV.999');
  assert.ok(sk('1506', 'ult').hits.some((h) => h.scaling === 'elation'));
  assert.equal(sk('1511', 'basic').hits[0].scaling, 'elation');
  assert.ok(sk('1511', 'ult').hits.some((h) => h.target === 'random' && h.countParam != null));
  assert.equal(C['1511'].ultResource, 'custom');
  assert.ok(C['1511'].eidolons[0].effects.some((x) => x.stat === 'amplification'));
});

test('忆灵', () => {
  const m = C['1402'].memosprite;
  assert.ok(m && m.skills.some((s) => s.slot === 'memo' && s.hits.length >= 2));
  assert.ok(m.hpInherit > 0 || m.hpBase > 0);
});

test('推荐配置', () => {
  const r = C['1102'].recommended;
  assert.deepEqual(r.lightcones.slice(0, 1), ['23001']);
  assert.equal(r.relic4[0], '108'); assert.equal(r.relic2[0], '311');
  assert.deepEqual(r.mainStats, { body: 'critRate', feet: 'spd', sphere: 'dmgBonus_Quantum', rope: 'atkPct' });
  assert.ok(r.subStats.includes('critDmg'));
  assert.deepEqual(r.teams[0], ['1102', '1313', '1412', '1409']);
});

test('遗器与敌人', () => {
  const g = DATA.relicSets['108'];
  assert.equal(g.kind, 'cavern'); assert.ok(g.set2.effects.some((e) => e.stat === 'dmgBonus_Quantum'));
  assert.ok(g.set4.effects.some((e) => e.stat === 'defIgnore'));
  assert.equal(DATA.relicSets['305'].kind, 'planar');
  assert.ok(DATA.relicSets['305'].set2.effects.some((e) => e.stat === 'critDmg'));
  assert.equal(DATA.relicSets['305'].set4, null);
  const m = DATA.monsters['1002011'];
  assert.deepEqual(m.weak, ['Fire', 'Thunder']);
  assert.equal(m.res.Fire, 0); assert.equal(m.res.Ice, 0.2);
  assert.equal(m.toughness, 60); assert.equal(m.spd, 100);
  for (const x of Object.values(DATA.monsters)) {
    assert.equal(Object.keys(x.res).length, 7, x.id);
    assert.ok(x.hpBase >= 0 && x.defBase >= 0 && x.spd >= 0);
  }
});


test('v2.1 数据修正：常见辅助的目标/持续/数值', () => {
  const e = (id, slot, stat) => sk(id, slot).effects.find((x) => x.stat === stat);
  // 藿藿终结技：攻击力 → 除自身外队友
  assert.equal(e('1217', 'ult', 'atkPct').target, 'allies');
  // 阮•梅战技【弦外音】持续 3 回合
  assert.equal(e('1303', 'skill', 'dmgBonus').duration, 3);
  assert.equal(e('1303', 'skill', 'weaknessBreakEfficiency').duration, 3);
  assert.equal(e('1303', 'ult', 'resPen').duration, 2);
  // 卡芙卡终结技：只有一条触电 DoT（全体），引爆比例在 specials
  const kq = sk('1005', 'ult');
  assert.equal(kq.hits.filter((h) => h.dmgType === 'dot').length, 1);
  assert.equal(kq.hits.find((h) => h.dmgType === 'dot').target, 'aoe');
  assert.ok(kq.specials.some((x) => x.kind === 'dotDetonate' && lvP(kq)[x.param] === 1));
  // 布洛妮娅：战技立即行动；终结技暴伤转化
  assert.equal(e('1101', 'skill', 'actionAdvance').value, 1);
  const bq = e('1101', 'ult', 'critDmg');
  assert.ok(bq && bq.scaleStat === 'critDmg' && bq.flatAdd && bq.duration === 2);
  // 停云【赐福】持续 3 回合；队友攻击触发的附加伤害以队友面板结算
  assert.equal(e('1202', 'skill', 'atk').duration, 3);
  assert.equal(sk('1202', 'skill').hits[0].trigger, 'onAllyAttack');
  assert.equal(sk('1202', 'skill').hits[0].triggerActor, 'holder');
  // 知更鸟：终结技队友立即行动、附加伤害固定暴击；天赋回能在队友攻击后
  assert.equal(e('1309', 'ult', 'actionAdvance').target, 'allies');
  assert.deepEqual(sk('1309', 'ult').hits[0].fixedCrit, { rate: 1, dmg: 1.5 });
  assert.equal(sk('1309', 'ult').hits[0].triggerActor, 'owner');
  assert.equal(e('1309', 'talent', 'energyFlat').trigger, 'onAllyAttack');
  // 花火：战技点上限 +2
  assert.equal(lvP(sk('1306', 'talent'))[e('1306', 'talent', 'spMax').value.param], 2);
  // 砂金终结技【惊惶】：暴伤挂在敌人身上，持续 3 回合
  const aq = e('1304', 'ult', 'critDmg');
  assert.equal(aq.target, 'enemy'); assert.equal(aq.duration, 3);
  // 阮•梅天赋击破触发
  assert.equal(sk('1303', 'talent').hits[0].trigger, 'onBreak');
  // 即时类效果无持续时间
  for (const c of Object.values(C)) for (const s of allSkills(c)) for (const x of s.effects) {
    if (['energyFlat', 'energyPct', 'actionAdvance', 'spFlat'].includes(x.stat)) assert.equal(x.duration, null, c.id + ' ' + x.key);
  }
});

test('v2.1：effect/hit 提供 rawResolved；敌人 key 与 id 一致', () => {
  let n = 0, withRes = 0;
  for (const c of Object.values(C)) for (const s of allSkills(c)) for (const x of [...s.effects, ...s.hits]) {
    if (!x.raw) continue; n++;
    if (typeof x.rawResolved === 'string' && !/#\d+\[/.test(x.rawResolved)) withRes++;
  }
  assert.ok(n > 500 && withRes === n, withRes + '/' + n);
  for (const [k, m] of Object.entries(DATA.monsters)) assert.equal(String(m.id), k);
  assert.equal(DATA.monsters['8003010'].name, '外宇宙之冰');
  assert.equal(DATA.monsters['1005010'].name, '可可利亚，虚妄之母');
  assert.equal(DATA.monsters['5035010'].name, '贪欢的神颅');
  assert.equal(DATA.monsters['5035011'].name, '贪欢的神颅');
  assert.equal(DATA.monsters['5035012'].name, '贪欢的神颅');
  assert.equal(DATA.monsters['5035020'].name, '「哲学的胎儿」疯狂');
});

test('奇缘星魂入数据、不进伤害', () => {
  for (const id of ['1204', '1213', '1308']) {
    const xs = C[id].exRanks;
    assert.equal(xs.length, 1, id);
    assert.equal(xs[0].modeled, false);
    assert.ok(xs[0].params.length >= 4, id + ' params');
    assert.ok(xs[0].unresolved && xs[0].source);
  }
  assert.equal(C['1511'].exRanks.length, 0);
  assert.deepEqual(C['1308'].exRanks[0].params, [3, 1, 1, 0.8]);
  assert.deepEqual(C['1213'].exRanks[0].params, [5, 5, 1, 2.4, 1, 3]);
  assert.deepEqual(C['1204'].exRanks[0].params, [1, 2.4, 6, 12, 4, 20]);
});

test('SubAvatarTypeList 为空时不改变解析', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/v2/raw/character/1001.json'), 'utf8'));
  const sup = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/v2/raw/support/character.json'), 'utf8'))['1001'];
  const a = buildCharacter('1001', raw, sup);
  const b = buildCharacter('1001', Object.assign({}, raw, { SubAvatarTypeList: [] }), sup);
  const c = buildCharacter('1001', Object.assign({}, raw, { SubAvatarTypeList: ['unused'] }), sup);
  assert.deepEqual(b, a);
  assert.deepEqual(c.base, a.base);
  assert.equal(c.skills.length, a.skills.length);
});
