// 名称与展示文本检查：DATA 无模板残留 / 未代入占位符；UI 与 CLI 的中文翻译表覆盖 DATA 与引擎中出现的全部属性键
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DATA } from '../../engine2/data.gen.js';
import { applyNameFixes, cleanText } from '../../scripts/v2/names.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// 从源文件中抽取 // __HSR2_ZH_BEGIN__ … // __HSR2_ZH_END__ 段并求值
function loadZh(file) {
  const src = read(file);
  const a = src.indexOf('// __HSR2_ZH_BEGIN__'), b = src.indexOf('// __HSR2_ZH_END__');
  assert.ok(a >= 0 && b > a, file + ' 缺少 __HSR2_ZH_BEGIN__/END__ 翻译表标记');
  return new Function(src.slice(a, b) + '\nreturn { EL_ZH, PATH_ZH, PATHS, ELEMENTS, RANK_ZH, TYPE_ZH, SLOT_ZH, TARGET_ZH, TRIGGER_ZH, HIT_TARGET_ZH, SCALING_ZH, STAT_ZH, statZh, zhText, zhHitNote, zhHitTarget, actType };')();
}
const UI = loadZh('ui2/app.html');
const CLI = loadZh('bin/hsr-sim-v2.mjs');

// 模板残留：{NICKNAME} {RUBY_B#..} {F#..} #{series_ref..} <unbreak> <u> 字面量 \n
const RESIDUE = /\{[A-Z][A-Z_]*[#}]|#\{|<\/?[a-zA-Z][^>]*>|\\n/;
const PLACEHOLDER = /#\d+\[\w+\]/;
const DISPLAY_KEYS = new Set(['name', 'nameEn', 'desc', 'simpleDesc', 'typeName', 'passiveName']);

function walk(o, path, fn) {
  if (Array.isArray(o)) o.forEach((x, i) => walk(x, path + '.' + i, fn));
  else if (o && typeof o === 'object') for (const k of Object.keys(o)) { if (typeof o[k] === 'string') fn(k, o[k], path + '.' + k); else walk(o[k], path + '.' + k, fn); }
}

test('DATA：名称/描述无模板残留与未代入占位符', () => {
  const bad = [];
  for (const g of ['characters', 'lightcones', 'relicSets', 'monsters']) {
    walk(DATA[g], g, (k, v, p) => {
      if ((DISPLAY_KEYS.has(k) || k === 'rawDesc' || k === 'raw' || k === 'condition') && RESIDUE.test(v)) bad.push('残留 ' + p + '：' + v.slice(0, 60));
      if (DISPLAY_KEYS.has(k) && PLACEHOLDER.test(v)) bad.push('占位符 ' + p + '：' + v.slice(0, 60));
      if (DISPLAY_KEYS.has(k) && /(^|[^\w])(undefined|NaN|null)([^\w]|$)/.test(v)) bad.push('空值 ' + p);
    });
  }
  assert.deepEqual(bad.slice(0, 20), []);
});

test('DATA：角色名与 support/character.json 一致（开拓者/同名角色按命途区分）', () => {
  const sup = JSON.parse(read('data/v2/raw/support/character.json'));
  const names = new Set();
  for (const c of Object.values(DATA.characters)) {
    assert.ok(!names.has(c.name), '角色重名：' + c.name);
    names.add(c.name);
    const zh = cleanText(sup[c.id] && sup[c.id].zh);
    if (/^80\d\d$/.test(c.id)) {
      const male = Number(c.id) % 2 === 1;
      assert.equal(c.name, '开拓者（' + UI.PATH_ZH[c.path] + '·' + (male ? '穹' : '星') + '）');
    } else if (zh && c.name !== zh) {
      assert.equal(c.name, zh + '（' + UI.PATH_ZH[c.path] + '）', c.id + ' 名称与站点不一致');
    }
    assert.ok(UI.PATH_ZH[c.path], c.id + ' 未知命途 ' + c.path);
    assert.ok(UI.EL_ZH[c.element], c.id + ' 未知属性 ' + c.element);
  }
  assert.equal(DATA.characters['1001'].name, '三月七（存护）');
  assert.equal(DATA.characters['1224'].name, '三月七（巡猎）');
  assert.equal(DATA.characters['1506'].nameEn, 'Silver Wolf LV.999');
  // 命途码对应（站点 base_type）：抽查
  const P = { 1102: '巡猎', 1005: '虚无', 1306: '同谐', 1217: '丰饶', 1104: '存护', 1212: '毁灭', 1003: '智识', 1402: '记忆', 1501: '欢愉' };
  for (const [id, p] of Object.entries(P)) assert.equal(UI.PATH_ZH[DATA.characters[id].path], p, id);
  for (const l of Object.values(DATA.lightcones)) assert.ok(UI.PATH_ZH[l.path], '光锥 ' + l.id + ' 未知命途 ' + l.path);
});

test('DATA：星神★阿哈 E2 引用技能描述已展开', () => {
  const d = DATA.characters['1511'].eidolons.find((e) => e.rank === 2).desc;
  assert.match(d, /无视敌方目标60%的防御力/);
});

test('names.mjs：applyNameFixes 幂等', () => {
  const copy = JSON.parse(JSON.stringify({ characters: { 8001: DATA.characters['8001'], 1001: DATA.characters['1001'] } }));
  applyNameFixes(copy);
  assert.equal(copy.characters['8001'].name, DATA.characters['8001'].name);
  assert.equal(copy.characters['1001'].name, '三月七（存护）');
});

// 收集 DATA 与引擎中出现的全部属性键
const TYPE_SUFFIX = { critRate: 1, critDmg: 1, dmgBonus: 1, vuln: 1, defIgnore: 1, resPen: 1, amplification: 1, defShred: 1 };
const ELEM_SUFFIX = { resShred: 1, resPen: 1, dmgBonus: 1, vuln: 1 };
function collectStatKeys() {
  const keys = new Set();
  const enums = { appliesTo: new Set(), trigger: new Set(), target: new Set(), dmgType: new Set(), scaling: new Set(), hitTarget: new Set(), slot: new Set(), dynBase: new Set() };
  const eff = (e) => {
    if (!e || !e.stat) return;
    let s = e.stat;
    if (e.appliesTo && TYPE_SUFFIX[s]) s += '_' + e.appliesTo; else if (e.element && ELEM_SUFFIX[s]) s += '_' + e.element;
    keys.add(e.stat); keys.add(s);
    if (e.scaleStat) keys.add(e.scaleStat);
    if (e.appliesTo) enums.appliesTo.add(e.appliesTo);
    if (e.trigger) enums.trigger.add(e.trigger);
    if (e.target) enums.target.add(e.target);
  };
  const hit = (h) => { if (h.extra && h.extra.stat) keys.add(h.extra.stat); enums.dmgType.add(h.dmgType); enums.scaling.add(h.scaling); enums.hitTarget.add(h.target); };
  const sk = (s) => { enums.slot.add(s.slot); (s.effects || []).forEach(eff); (s.hits || []).forEach(hit); };
  for (const c of Object.values(DATA.characters)) {
    (c.skills || []).forEach(sk); if (c.memosprite) (c.memosprite.skills || []).forEach(sk);
    for (const t of (c.traces || []).concat(c.eidolons || [])) { (t.effects || []).forEach(eff); (t.hits || []).forEach(hit); }
    Object.keys(c.traceStats || {}).forEach((k) => keys.add(k));
    const r = c.recommended || {};
    Object.values(r.mainStats || {}).forEach((k) => keys.add(k));
    Object.values(r.mainStatOptions || {}).flat().forEach((k) => keys.add(k));
    (r.subStats || []).forEach((k) => keys.add(k));
  }
  for (const l of Object.values(DATA.lightcones)) (l.effects || []).forEach(eff);
  for (const r of Object.values(DATA.relicSets)) for (const p of ['set2', 'set4']) if (r[p]) (r[p].effects || []).forEach(eff);
  // 引擎/override 源码中出现的键：stat: 'xxx'、'xxx_yyy' 字面量、'xxx_' + 动态后缀
  const dir = join(ROOT, 'engine2');
  const files = readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'data.gen.js').map((f) => join(dir, f))
    .concat(readdirSync(join(dir, 'overrides')).filter((f) => f.endsWith('.js')).map((f) => join(dir, 'overrides', f)));
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/stat:\s*'([A-Za-z_]+)'/g)) keys.add(m[1]);
    for (const m of src.matchAll(/'((?:critRate|critDmg|dmgBonus|vuln|defIgnore|resPen|resShred|amplification|defShred)_[A-Za-z]+)'/g)) keys.add(m[1]);
    for (const m of src.matchAll(/\b(energyPct|energyFlat|spFlat|spMax|elationAmp|superBreak|weaknessBreakEfficiency|actionAdvance)\b/g)) keys.add(m[1]);
    for (const m of src.matchAll(/'([a-zA-Z]+)_'\s*\+/g)) if (TYPE_SUFFIX[m[1]] || ELEM_SUFFIX[m[1]]) enums.dynBase.add(m[1]);
  }
  for (const base of enums.dynBase) {
    if (ELEM_SUFFIX[base]) UI.ELEMENTS.forEach((e) => keys.add(base + '_' + e));
    if (TYPE_SUFFIX[base]) for (const t of ['basic', 'skill', 'ult', 'fua', 'dot', 'break', 'superBreak', 'elation', 'memo', 'true', 'additional']) keys.add(base + '_' + t);
  }
  return { keys, enums };
}

test('UI / CLI：属性键翻译覆盖 DATA 与引擎中出现的全部键（含 _<Element>/_<dmgType> 组合）', () => {
  const { keys, enums } = collectStatKeys();
  assert.ok(keys.size > 50, '收集到的键过少：' + keys.size);
  const ranks = new Set(Object.values(DATA.monsters).map((m) => m.rank));
  for (const Z of [UI, CLI]) {
    const miss = [...keys].filter((k) => { const t = Z.statZh(k); return !t || t === k || /[a-z]{2}/.test(t); });
    assert.deepEqual(miss, [], '缺少中文翻译的属性键');
    for (const a of enums.appliesTo) assert.ok(Z.TYPE_ZH[a], '伤害类型 ' + a);
    for (const t of enums.dmgType) assert.ok(Z.TYPE_ZH[t], '伤害类型 ' + t);
    for (const t of enums.trigger) assert.ok(Z.TRIGGER_ZH[t], '触发 ' + t);
    for (const t of enums.target) assert.ok(Z.TARGET_ZH[t], '目标 ' + t);
    for (const t of enums.scaling) assert.ok(Z.SCALING_ZH[t], '倍率属性 ' + t);
    for (const t of enums.hitTarget) assert.ok(Z.HIT_TARGET_ZH[t], '伤害目标 ' + t);
    for (const t of enums.slot) assert.ok(Z.SLOT_ZH[t], '技能槽位 ' + t);
    for (const r of ranks) assert.ok(Z.RANK_ZH[r], '敌人类别 ' + r);
  }
  for (const k of keys) assert.equal(CLI.statZh(k), UI.statZh(k), 'UI 与 CLI 翻译不一致：' + k);
});

test('UI / CLI：统一的枚举中文名', () => {
  assert.deepEqual(UI.ELEMENTS.map((e) => UI.EL_ZH[e]), ['物理', '火', '冰', '雷', '风', '量子', '虚数']);
  assert.deepEqual(UI.PATHS.map((p) => UI.PATH_ZH[p]), ['毁灭', '巡猎', '智识', '同谐', '虚无', '存护', '丰饶', '记忆', '欢愉']);
  assert.deepEqual([UI.RANK_ZH.BigBoss, UI.RANK_ZH.LittleBoss, UI.RANK_ZH.Elite, UI.RANK_ZH.MinionLv2], ['首领', '小首领', '精英', '普通']);
  assert.equal(UI.statZh('resPen_Quantum'), '量子属性抗性穿透');
  assert.equal(UI.statZh('critDmg_ult'), '终结技暴击伤害');
  assert.equal(UI.statZh('dmgBonus_basic'), '普攻增伤');
  assert.equal(UI.statZh('vuln'), '易伤');
  assert.equal(UI.statZh('defIgnore'), '无视防御');
  assert.equal(UI.statZh('spdPct'), '速度%');
  assert.equal(UI.statZh('energyRegen'), '能量恢复效率');
});

test('UI / CLI：引擎 buff 标签与分段备注翻译', () => {
  for (const Z of [UI, CLI]) {
    assert.equal(Z.zhText('行迹·割裂 resPen_Quantum+20%'), '行迹·割裂 量子属性抗性穿透+20%');
    assert.equal(Z.zhText('光锥·于夜色中 critDmg_ult+12%×6'), '光锥·于夜色中 终结技暴击伤害+12%×6');
    assert.equal(Z.zhText('天赋·叙述性诡计 spMax+200%'), '天赋·叙述性诡计 战技点上限+2');
    assert.equal(Z.zhText('行迹·夜想曲 atkPct+15%'), '行迹·夜想曲 攻击力+15%');
    assert.equal(Z.zhText('战技·梦游鱼 critDmg=critDmg×24%+0.45'), '战技·梦游鱼 暴击伤害=暴击伤害×24%+45%');
    assert.equal(Z.zhText('弦外音·增伤'), '弦外音·增伤');
    assert.equal(Z.zhHitNote('atk×2.2'), '攻击力×220%');
    assert.equal(Z.zhHitNote('DoT'), '持续伤害');
    assert.equal(Z.zhHitNote('atk×2+0.2×breakEffect'), '攻击力×200%+20%×击破特攻');
    assert.equal(Z.zhHitTarget('aoe×5 2段'), '全体×5 2段');
    assert.equal(Z.TYPE_ZH[Z.actType('A+')], '强化普攻');
    const labels = ['遗器·繁星璀璨的天才(4) defIgnore+10%', '自定义 dmgBonus_Fire+10%', '光锥·x amplification_elation+15%', '行迹·x vuln_break+20%', '行迹·x resShred_Ice+10%', '天赋·x energyPct+20%'];
    for (const l of labels) assert.doesNotMatch(Z.zhText(l), /[a-z][A-Za-z]*[A-Z_]/, l);
  }
});
