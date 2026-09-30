// engine2/core.js —— 引擎工厂：createEngine(DATA, OVERRIDES) → §3 全部 API（index.js 以真实数据实例化）
import { computeStatsWith, publicStats } from './stats.js';
import { collectEffects, skillParams, skillLevel } from './effects.js';
import { resolveSkill } from './sim.js';
import { simulateWith } from './search.js';

export var ENGINE2_VERSION = '2.0.0';

// 命途码 → 规范名（kits 里 path 为站点 base_type 码；也兼容英文名）
var PATH_NORM = {
  Warrior: 'Destruction', Rogue: 'Hunt', Mage: 'Erudition', Shaman: 'Harmony', Warlock: 'Nihility', Knight: 'Preservation',
  Priest: 'Abundance', Memory: 'Remembrance', Elation: 'Elation',
  Destruction: 'Destruction', Hunt: 'Hunt', Erudition: 'Erudition', Harmony: 'Harmony', Nihility: 'Nihility',
  Preservation: 'Preservation', Abundance: 'Abundance', Remembrance: 'Remembrance'
};
export function normPath(p) { return PATH_NORM[p] || p; }

var DEFAULT_MAINS = {
  Destruction: { body: 'critRate', feet: 'spd', sphere: 'dmgBonus', rope: 'atkPct' },
  Hunt: { body: 'critRate', feet: 'spd', sphere: 'dmgBonus', rope: 'atkPct' },
  Erudition: { body: 'critRate', feet: 'spd', sphere: 'dmgBonus', rope: 'atkPct' },
  Harmony: { body: 'hpPct', feet: 'spd', sphere: 'hpPct', rope: 'energyRegen' },
  Nihility: { body: 'effectHitRate', feet: 'spd', sphere: 'dmgBonus', rope: 'energyRegen' },
  Preservation: { body: 'defPct', feet: 'spd', sphere: 'defPct', rope: 'energyRegen' },
  Abundance: { body: 'outgoingHeal', feet: 'spd', sphere: 'hpPct', rope: 'energyRegen' },
  Remembrance: { body: 'critDmg', feet: 'spd', sphere: 'dmgBonus', rope: 'atkPct' },
  Elation: { body: 'critDmg', feet: 'spd', sphere: 'atkPct', rope: 'atkPct' }
};
var DPS_PATHS = { Destruction: 1, Hunt: 1, Erudition: 1, Remembrance: 1, Elation: 1 };
// 站点/文本中可能出现的主词条名称 → 统一键
var STAT_ALIASES = {
  '暴击率': 'critRate', '暴击伤害': 'critDmg', '攻击力': 'atkPct', '攻击力百分比': 'atkPct', '生命值': 'hpPct', '生命值百分比': 'hpPct',
  '防御力': 'defPct', '防御力百分比': 'defPct', '速度': 'spd', '治疗量加成': 'outgoingHeal', '能量恢复效率': 'energyRegen',
  '效果命中': 'effectHitRate', '效果抵抗': 'effectRes', '击破特攻': 'breakEffect', '属性伤害提高': 'dmgBonus',
  CriticalChanceBase: 'critRate', CriticalDamageBase: 'critDmg', AttackAddedRatio: 'atkPct', HPAddedRatio: 'hpPct', DefenceAddedRatio: 'defPct',
  SpeedDelta: 'spd', HealRatioBase: 'outgoingHeal', SPRatioBase: 'energyRegen', StatusProbabilityBase: 'effectHitRate',
  StatusResistanceBase: 'effectRes', BreakDamageAddedRatioBase: 'breakEffect'
};
function normStatKey(k) {
  if (k == null) return null;
  if (Array.isArray(k)) k = k[0];
  if (typeof k === 'object') k = k.stat || k.key || k.type;
  if (STAT_ALIASES[k]) return STAT_ALIASES[k];
  if (/AddedRatio$/.test(k)) return 'dmgBonus';
  if (/属性伤害提高$/.test(k)) return 'dmgBonus';
  return k;
}

export function createEngine(DATA, OVERRIDES) {
  OVERRIDES = OVERRIDES || {};
  var D = DATA || { characters: {}, lightcones: {}, relicSets: {}, monsters: {} };
  D.characters = D.characters || {}; D.lightcones = D.lightcones || {}; D.relicSets = D.relicSets || {}; D.monsters = D.monsters || {};

  function listCharacters() {
    return Object.keys(D.characters).map(function (id) {
      var c = D.characters[id];
      return { id: id, name: c.name, element: c.element, path: c.path, rarity: c.rarity, support: OVERRIDES[id] ? 'manual' : 'auto' };
    });
  }
  function listLightcones(path) {
    return Object.keys(D.lightcones).map(function (id) { var l = D.lightcones[id]; return { id: id, name: l.name, path: l.path, rarity: l.rarity }; })
      .filter(function (l) { return !path || l.path === path || normPath(l.path) === normPath(path); });
  }
  function listRelicSets() {
    return Object.keys(D.relicSets).map(function (id) { var r = D.relicSets[id]; return { id: id, name: r.name, kind: r.kind }; });
  }
  // 敌人列表：key = child id（与 DATA.monsters[id].id 一致）；同名敌人（不同难度/变体）在 label 中附带 id 与韧性以便区分
  var _monsterList = null;
  function listMonsters() {
    if (_monsterList) return _monsterList.map(function (x) { return Object.assign({}, x, { weak: x.weak.slice() }); });
    var cnt = {};
    Object.keys(D.monsters).forEach(function (id) { var n = D.monsters[id].name; cnt[n] = (cnt[n] || 0) + 1; });
    _monsterList = Object.keys(D.monsters).map(function (id) {
      var m = D.monsters[id];
      return { id: id, templateId: m.templateId != null ? String(m.templateId) : id, name: m.name, rank: m.rank, weak: m.weak || [],
        toughness: m.toughness, label: cnt[m.name] > 1 ? m.name + '（' + id + '，韧性 ' + m.toughness + '）' : m.name };
    });
    return listMonsters();
  }
  // 按 id 或名称解析敌人 id（名称同名时取韧性最高的首领）
  function resolveMonsterId(q) {
    if (q == null || q === '') return null;
    var s = String(q);
    if (D.monsters[s]) return s;
    var rankW = { BigBoss: 3, LittleBoss: 2, Elite: 1 };
    var best = null;
    Object.keys(D.monsters).forEach(function (id) {
      var m = D.monsters[id];
      if (m.name !== s && m.name.indexOf(s) < 0) return;
      var sc = (m.name === s ? 1e7 : 0) + (rankW[m.rank] || 0) * 1e4 + (m.toughness || 0) + (String(m.templateId) === id ? 1e5 : 0);
      if (!best || sc > best.sc) best = { id: id, sc: sc };
    });
    return best ? best.id : null;
  }

  function defaultMember(charId) {
    charId = String(charId);
    var c = D.characters[charId];
    if (!c) throw new Error('未知角色 ' + charId);
    var rec = c.recommended || {};
    var path = normPath(c.path);
    var lcId = (rec.lightcones || []).map(String).find(function (id) { return D.lightcones[id]; }) || null;
    if (!lcId) {
      var cands = listLightcones(c.path).sort(function (a, b) { return (b.rarity || 0) - (a.rarity || 0); });
      lcId = cands.length ? cands[0].id : null;
    }
    var set4 = (rec.relic4 || []).map(String).find(function (id) { return D.relicSets[id]; }) ||
      (Object.keys(D.relicSets).find(function (id) { return D.relicSets[id].kind === 'cavern'; }) || null);
    var set2 = (rec.relic2 || []).map(String).find(function (id) { return D.relicSets[id]; }) ||
      (Object.keys(D.relicSets).find(function (id) { return D.relicSets[id].kind === 'planar'; }) || null);
    var mains = Object.assign({}, DEFAULT_MAINS[path] || DEFAULT_MAINS.Hunt);
    var rm = rec.mainStats || {};
    ['body', 'feet', 'sphere', 'rope'].forEach(function (slot) {
      var k = normStatKey(rm[slot]);
      if (k) mains[slot] = k;
    });
    var subs;
    var rs = (rec.subStats || []).map(normStatKey).filter(Boolean);
    if (rs.length) {
      var w = [8, 7, 4, 3, 2];
      subs = {};
      rs.slice(0, 5).forEach(function (k, i) { subs[k] = (subs[k] || 0) + w[i]; });
    } else if (DPS_PATHS[path]) subs = { critRate: 8, critDmg: 10, atkPct: 3, spd: 3 };
    else subs = { spd: 10, hpPct: 5, effectRes: 3, defPct: 3 };
    var sl = { basic: 6, skill: 10, ult: 10, talent: 10 };
    (c.skills || []).forEach(function (s) {
      if (s.slot === 'basic' && s.defaultLevel) sl.basic = s.defaultLevel;
    });
    return {
      charId: charId, level: 80, eidolon: 0, skillLevels: sl,
      lightcone: lcId ? { id: lcId, superimposition: 1 } : null,
      relics: { set4: set4, set2: set2, mainStats: mains, subStats: subs },
      statOverrides: {}, extraBuffs: [], disabledEffects: [],
      policy: { mode: 'auto', ultMode: 'asap', fuaPerTurn: null }
    };
  }

  function pickDefaultMonster() {
    var ids = Object.keys(D.monsters);
    var prefer = ids.filter(function (id) { return D.monsters[id].rank === 'BigBoss'; });
    var q = prefer.find(function (id) { return (D.monsters[id].weak || []).indexOf('Quantum') >= 0; });
    return q || prefer[0] || ids[0] || null;
  }

  function defaultEnemy(monsterId) {
    var id = monsterId == null ? pickDefaultMonster() : resolveMonsterId(monsterId);
    var m = id ? D.monsters[id] : null;
    var res = { Physical: 0.2, Fire: 0.2, Ice: 0.2, Thunder: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 };
    if (m && m.res) for (var k in m.res) res[k] = m.res[k];
    return {
      monsterId: m ? id : null, name: m ? m.name : (monsterId != null ? '自定义敌人（未找到 ' + monsterId + '）' : '自定义敌人'), level: 95, count: 1,
      hp: 1e6, toughness: m && m.toughness ? m.toughness : 160,
      weak: m ? (m.weak || []).slice() : ['Quantum'], res: res, spd: m && m.spd ? m.spd : 132,
      extraDefShred: 0, extraVuln: 0, extraResShred: 0, alwaysBroken: false, allowBreak: true
    };
  }

  function defaultBattle() { return { cycles: 3, firstCycleAV: 150, avPerCycle: 100, startSP: 3, maxSP: 5, startEnergyPct: 0.5 }; }
  function defaultOptions() { return { critMode: 'expected', beamWidth: 24, ignoreConditions: false, teamJoke: 10 }; }

  function defaultConfig() {
    var want = ['1102', '1306', '1303', '1217'];
    var team = want.filter(function (id) { return D.characters[id]; });
    if (team.length < 4) {
      Object.keys(D.characters).forEach(function (id) { if (team.length < 4 && team.indexOf(id) < 0) team.push(id); });
    }
    return { team: team.map(defaultMember), enemy: defaultEnemy(), battle: defaultBattle(), options: defaultOptions() };
  }

  // 应用 override.patchKit 后的数据视图（与 simulate 一致）
  function dataFor(charId, member) {
    var ov = OVERRIDES[charId];
    if (!ov || typeof ov.patchKit !== 'function' || !D.characters[charId]) return D;
    var k = ov.patchKit(JSON.parse(JSON.stringify(D.characters[charId])), member) || D.characters[charId];
    var chars = Object.assign({}, D.characters); chars[charId] = k;
    return Object.assign({}, D, { characters: chars });
  }

  function computeStats(member) {
    var mem = fillMember(member);
    var st = computeStatsWith(dataFor(mem.charId, mem), mem, {});
    var o = publicStats(st);
    o.warnings = st._warnings;
    o.sources = st._sources;
    return o;
  }

  function fillMember(m) {
    var base = D.characters[m.charId] ? defaultMember(m.charId) : {};
    var out = Object.assign({}, base, m);
    out.policy = Object.assign({}, base.policy || {}, m.policy || {});
    out.skillLevels = Object.assign({}, base.skillLevels || {}, m.skillLevels || {});
    return out;
  }

  function describeKit(charId, member) {
    var c = D.characters[charId];
    if (!c) throw new Error('未知角色 ' + charId);
    var mem = fillMember(member || { charId: String(charId) });
    var effs = collectEffects(D, mem, {}).list;
    var byKey = {};
    effs.forEach(function (e) { byKey[e.key] = e; });
    var ov = OVERRIDES[charId];
    return {
      id: charId, name: c.name, element: c.element, path: c.path, support: ov ? 'manual' : 'auto',
      skills: (c.skills || []).map(function (s) {
        var rs = resolveSkill(c, mem, s);
        return {
          id: s.id, slot: s.slot, name: s.name, typeName: s.typeName, desc: s.desc, level: skillLevel(c, mem, s),
          spCost: rs.spCost, spGain: rs.spGain, energyGain: rs.energyGain, toughness: rs.toughness,
          hits: rs.hits.map(function (h) { return { scaling: h.scaling, multiplier: h.mult, count: h.count, target: h.target, element: h.element, dmgType: h.dmgType, raw: h.raw }; }),
          effects: (s.effects || []).map(function (e) { var r = byKey[e.key]; return Object.assign({}, e, { resolved: r ? r.value : null, enabled: !!r }); })
        };
      }),
      traces: (c.traces || []).map(function (t) { return { id: t.id, name: t.name, desc: t.desc, effects: (t.effects || []).map(function (e) { var r = byKey[e.key]; return Object.assign({}, e, { resolved: r ? r.value : null, enabled: !!r }); }) }; }),
      eidolons: (c.eidolons || []).map(function (r) { return { rank: r.rank, name: r.name, desc: r.desc, active: r.rank <= (mem.eidolon || 0), skillLevelUp: r.skillLevelUp || null, effects: r.effects || [] }; }),
      notes: (c.notes || []).concat(ov ? ['已启用手写机制 override'] : [])
    };
  }

  function normalizeConfig(cfg) {
    cfg = cfg || defaultConfig();
    var out = {
      team: (cfg.team || []).slice(0, 4).map(fillMember),
      enemy: normEnemy(cfg.enemy),
      battle: Object.assign(defaultBattle(), cfg.battle || {}),
      options: Object.assign(defaultOptions(), cfg.options || {})
    };
    var r = Object.assign({ Physical: 0.2, Fire: 0.2, Ice: 0.2, Thunder: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 }, out.enemy.res || {});
    out.enemy.res = r;
    return out;
  }

  // 敌人：monsterId 可为 id 或名称；有效 monsterId 时 name 始终取数据中的名称（避免沿用旧名称，除非 customName: true）
  function normEnemy(en) {
    en = en || {};
    var base = defaultEnemy(en.monsterId != null && en.monsterId !== '' ? en.monsterId : undefined);
    var out = Object.assign({}, base, en);
    if (en.monsterId != null && en.monsterId !== '') {
      out.monsterId = base.monsterId;
      if (base.monsterId && !en.customName) out.name = base.name;
    }
    return out;
  }

  function simulate(config) {
    return simulateWith(D, normalizeConfig(config), OVERRIDES);
  }

  return {
    ENGINE2_VERSION: ENGINE2_VERSION, DATA: D,
    listCharacters: listCharacters, listLightcones: listLightcones, listRelicSets: listRelicSets, listMonsters: listMonsters, resolveMonsterId: resolveMonsterId,
    defaultMember: defaultMember, defaultEnemy: defaultEnemy, defaultConfig: defaultConfig,
    computeStats: computeStats, describeKit: describeKit, simulate: simulate, normalizeConfig: normalizeConfig
  };
}
