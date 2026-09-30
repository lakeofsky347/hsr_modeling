// engine2/stats.js —— 面板计算（局外面板，不含战斗内 buff）
// 顺序：角色基础 + 光锥基础 → 行迹属性（百分比/固定值）→ 遗器主/副词条（5★+15 主词条、副词条中位数）
//       → 常驻无条件自身效果（行迹额外能力 / 光锥被动 / 2 件套 / 4 件套 / 星魂）→ statOverrides
import { collectEffects, isPanelEffect } from './effects.js';

export const ELEMENTS = ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'];

// 5★+15 主词条（与 engine/relics.js MAIN_STAT_VALUES 一致，键换成 §4 统一键）
export const MAIN_STAT_VALUES = {
  hp: 705.6, atk: 352.8,
  critRate: 0.324, critDmg: 0.648, atkPct: 0.432, hpPct: 0.432, defPct: 0.54,
  spd: 25.032, outgoingHeal: 0.3456, energyRegen: 0.1944, effectHitRate: 0.432,
  breakEffect: 0.648, dmgBonus: 0.3888
};
// 副词条：1 个有效词条 = 5★ 单次强化的「中档」值（三档等差，中档 = 三档平均值 = 期望值；除速度外三档 = 最大值 × 0.8 / 0.9 / 1.0）。
// 5★ 三档：暴击率 2.592/2.916/3.240%，暴伤 5.184/5.832/6.480%，攻%/生%/命中/抵抗 3.456/3.888/4.320%，
// 防% 4.320/4.860/5.400%，速度 2.0/2.3/2.6，击破 5.184/5.832/6.480%，小攻/小防 16.935/19.051/21.168，小生 33.870/38.103/42.337。
// （v2.1 以前沿用 engine/relics.js：速度 2.0、命中/抵抗 3.45%、击破 5.18% 取的是低档，与其他键的中档不一致，已统一为中档。）
export const SUBSTAT_VALUES = {
  critRate: 0.02916, critDmg: 0.05832, atkPct: 0.03888, hpPct: 0.03888, defPct: 0.0486,
  spd: 2.3, effectHitRate: 0.03888, effectRes: 0.03888, breakEffect: 0.05832,
  atk: 19.051, hp: 38.103, def: 19.051
};
export const MAIN_SLOTS = { body: 1, feet: 1, sphere: 1, rope: 1 };

// 面板里出现的键（其余键——减防/穿透/易伤等——只在战斗中生效，但仍会被记录在 extra 中）
export const PANEL_KEYS = ['hp', 'hpPct', 'atk', 'atkPct', 'def', 'defPct', 'spd', 'spdPct', 'critRate', 'critDmg',
  'breakEffect', 'energyRegen', 'effectHitRate', 'effectRes', 'outgoingHeal', 'elation'];

export function addStat(bag, k, v) { if (v) bag[k] = (bag[k] || 0) + v; }

// 把原始加成袋 bag 与基础值合成为 FinalStats 形式
export function composeStats(base, bag, element) {
  var s = {};
  s.hp = base.hp * (1 + (bag.hpPct || 0)) + (bag.hp || 0);
  s.atk = base.atk * (1 + (bag.atkPct || 0)) + (bag.atk || 0);
  s.def = base.def * (1 + (bag.defPct || 0)) + (bag.def || 0);
  s.spd = base.spd * (1 + (bag.spdPct || 0)) + (bag.spd || 0);
  s.critRate = (base.critRate || 0) + (bag.critRate || 0);
  s.critDmg = (base.critDmg || 0) + (bag.critDmg || 0);
  s.breakEffect = bag.breakEffect || 0;
  s.energyRegen = bag.energyRegen || 0;
  s.effectHitRate = bag.effectHitRate || 0;
  s.effectRes = bag.effectRes || 0;
  s.outgoingHeal = bag.outgoingHeal || 0;
  s.elation = bag.elation || 0;
  var db = { all: bag.dmgBonus || 0 };
  for (var i = 0; i < ELEMENTS.length; i++) db[ELEMENTS[i]] = bag['dmgBonus_' + ELEMENTS[i]] || 0;
  ['basic', 'skill', 'ult', 'fua', 'dot', 'memo', 'elation', 'break'].forEach(function (t) {
    if (bag['dmgBonus_' + t]) db[t] = bag['dmgBonus_' + t];
  });
  s.dmgBonus = db;
  s.elementDmg = (bag.dmgBonus || 0) + (bag['dmgBonus_' + element] || 0);
  return s;
}

/**
 * 计算局外面板。
 * @returns FinalStats + 内部字段 _base（白值）、_bag（全部加成原始值，用于战斗中叠加 buff）、_overrides、_sources
 */
export function computeStatsWith(data, member, opts) {
  opts = opts || {};
  var ch = data.characters[member.charId];
  if (!ch) throw new Error('未知角色 ' + member.charId);
  var warnings = [];
  var b = ch.base || {};
  var base = { hp: b.hp || 0, atk: b.atk || 0, def: b.def || 0, spd: b.spd || 100,
    critRate: b.critRate == null ? 0.05 : b.critRate, critDmg: b.critDmg == null ? 0.5 : b.critDmg };
  var lc = member.lightcone && member.lightcone.id ? data.lightcones[member.lightcone.id] : null;
  if (member.lightcone && member.lightcone.id && !lc) warnings.push('未知光锥 ' + member.lightcone.id);
  if (lc && lc.base) { base.hp += lc.base.hp || 0; base.atk += lc.base.atk || 0; base.def += lc.base.def || 0; }

  var bag = {};
  var sources = [];
  // 行迹属性
  var ts = ch.traceStats || {};
  for (var k in ts) addStat(bag, k, ts[k]);
  if (Object.keys(ts).length) sources.push('行迹属性');
  // 遗器：头/手固定主词条
  var rel = member.relics;
  if (rel) {
    addStat(bag, 'hp', MAIN_STAT_VALUES.hp);
    addStat(bag, 'atk', MAIN_STAT_VALUES.atk);
    var ms = rel.mainStats || {};
    for (var slot in ms) {
      var key = ms[slot];
      if (!key) continue;
      var statKey = key, val = MAIN_STAT_VALUES[key];
      if (key === 'dmgBonus') { statKey = 'dmgBonus_' + ch.element; val = MAIN_STAT_VALUES.dmgBonus; }
      else if (/^dmgBonus_/.test(key)) { val = MAIN_STAT_VALUES.dmgBonus; }
      if (val == null) { warnings.push('未知主词条 ' + slot + ':' + key); continue; }
      addStat(bag, statKey, val);
    }
    var ss = rel.subStats || {};
    for (var sk in ss) {
      var sv = SUBSTAT_VALUES[sk];
      if (sv == null) { warnings.push('未知副词条 ' + sk); continue; }
      addStat(bag, sk, sv * (ss[sk] || 0));
    }
    sources.push('遗器主副词条');
  }
  // 常驻无条件自身效果（折入面板）
  var effs = collectEffects(data, member, opts);
  for (var i = 0; i < effs.list.length; i++) {
    var e = effs.list[i];
    if (!isPanelEffect(e)) continue;
    addStat(bag, e.stat, e.value * (e.maxStacks > 1 && opts.fullStacks !== false ? e.maxStacks : 1));
    sources.push(e.label);
  }
  warnings = warnings.concat(effs.warnings);

  var st = composeStats(base, bag, ch.element);
  // statOverrides：直接覆盖最终面板
  var ov = {};
  var so = member.statOverrides || {};
  for (var ok in so) {
    if (so[ok] == null || so[ok] === '') continue;
    var v = Number(so[ok]);
    if (!isFinite(v)) continue;
    ov[ok] = v;
    if (ok === 'dmgBonus' || ok === 'elementDmg') st.elementDmg = v;
    else st[ok] = v;
  }
  st.charId = member.charId;
  st.name = ch.name;
  st.element = ch.element;
  st.level = member.level || 80;
  st._base = base;
  st._bag = bag;
  st._overrides = ov;
  st._sources = sources;
  st._warnings = warnings;
  return st;
}

// 对外展示：去掉内部字段并做舍入
export function publicStats(st) {
  var o = {};
  for (var k in st) {
    if (k[0] === '_') continue;
    var v = st[k];
    if (typeof v === 'number') o[k] = Math.round(v * 10000) / 10000;
    else if (v && typeof v === 'object') { o[k] = {}; for (var j in v) o[k][j] = Math.round(v[j] * 10000) / 10000; }
    else o[k] = v;
  }
  return o;
}
