// ============================================================================
// 四人队伍模拟器内核：行动值时间轴 + 资源系统 + 完美轴策略 + 伤害结算
// 设计要点：
//   * 时间轴以行动值 AV 为单位（1 回合 = 10000 / 速度）
//   * 阿哈时刻是独立行动单位，速度由队伍欢愉角色速度推导（可用 unique 覆盖为阿哈自身速度）
//   * 好活当赏：参演阿哈时刻的角色获得「本次计入笑点」层数，持续 2 回合（真珠为无限）
//   * 欢愉伤害不吃攻击力/增伤，只吃 倍率 x 7535.107 x (1+欢愉度) x 笑点区 x 暴击 x 易伤 x 抗性 x 韧性 x 防御 x 增笑
// ============================================================================

import { CHARACTERS, getCharacter } from './characters.js';
import {
  elationHit, normalHit, trueDamage, ELATION_BASE_VALUE,
  DEF_BASE, DEF_PER_LEVEL, JOKE_K, JOKE_C
} from './formula.js';
import { SKILL_TABLES, SKILL_SLOTS, SKILL_BASE_CAPS, EIDOLON_INFO } from './skilltables.js';
import { LIGHTCONES, SIGNATURE_LIGHTCONE, resolveLightcone, applyLightconeStats, lcParam, lightconeInfo } from './lightcones.js';
import { RELICS, RECOMMENDED_RELICS, RELIC_EFFECTS, resolveRelics, relicPanelBonus, applyRelicStats, relicInfo } from './relics.js';

// ---------------------------------------------------------------------------
// 星魂对技能等级的加成（逐字取自各角色 E3 / E5 原文，注意四人的 +2 技能并不相同）
//   1506 银狼   E3: 战技+2 普攻+1 欢愉技+1   E5: 终结技+2 天赋+2 欢愉技+1
//   1501 火花   E3: 战技+2 普攻+1 欢愉技+1   E5: 终结技+2 天赋+2 欢愉技+1
//   1503 真珠   E3: 终结技+2 普攻+1 欢愉技+1 E5: 战技+2 天赋+2 欢愉技+1
//   1511 阿哈   E3: 终结技+2 普攻+1 欢愉技+1 E5: 战技+2 天赋+2 欢愉技+1
// ---------------------------------------------------------------------------
export const EIDOLON_SKILL_BONUS = {
  '1506': { 3: { skill: 2, basic: 1, elationSkill: 1 }, 5: { ult: 2, talent: 2, elationSkill: 1 } },
  '1501': { 3: { skill: 2, basic: 1, elationSkill: 1 }, 5: { ult: 2, talent: 2, elationSkill: 1 } },
  '1503': { 3: { ult: 2, basic: 1, elationSkill: 1 }, 5: { skill: 2, talent: 2, elationSkill: 1 } },
  '1511': { 3: { ult: 2, basic: 1, elationSkill: 1 }, 5: { skill: 2, talent: 2, elationSkill: 1 } }
};
export const SLOT_CAPS = { basic: 10, skill: 15, ult: 15, talent: 15, elationSkill: 15, innate: 2, maze: 1 };
export const SLOT_LABELS = { basic: '普攻', skill: '战技', ult: '终结技', talent: '天赋',
                             elationSkill: '欢愉技', innate: '固有行迹', maze: '秘技' };

// 角色 kit 中需要随技能等级缩放的数值：[路径, 技能ID, 参数下标]
// 只列数据表中真正随等级变化的参数（其余为恒定值）
const KIT_SCALE = {
  '1506': [
    ['kit.basic.multiplier', '150601', 0],
    ['kit.skill.multiplier', '150602', 0],
    ['kit.ult.blindbox.multiplier', '150603', 2],
    ['kit.talent.elationAppendPerSpend', '150604', 2],
    ['kit.talent.critRatePerPoint', '150604', 3],
    ['kit.talent.critDmgPerPoint', '150604', 5],
    ['kit.enhancedBasic.total', '150608', 0],
    ['kit.enhancedBasic.finisher', '150608', 3],
    ['kit.elationSkills.1.multiplier', '150621', 0],
    ['kit.innate.critDmg', '150629', 1],
    ['kit.innate.overflowTo', '150629', 0]
  ],
  '1501': [
    ['kit.basic.multiplier', '150101', 0],
    ['kit.enhancedBasic.multiplier', '150108', 0],
    ['kit.enhancedBasic.adjacentMultiplier', '150108', 1],
    ['kit.trap.multiplierBonus', '150109', 3],
    ['kit.trap.adjacentBonus', '150109', 4],
    ['kit.ult.elationDegreeCoef', '150103', 1],
    ['kit.talent.enhancedBasicElation', '150104', 2],
    ['kit.talent.enhancedBasicAdjacentElation', '150104', 3],
    ['kit.talent.perTrapElation', '150104', 0],
    ['kit.talent.ultElation', '150104', 1],
    ['kit.elationSkills.0.multiplier', '150120', 1],
    ['kit.elationSkills.0.extraMultiplier', '150120', 0],
    ['kit.innate.critDmg', '150129', 4],
    ['kit.innate.defIgnore', '150129', 0]
  ],
  '1503': [
    ['kit.basic.multiplier', '150301', 0],
    ['kit.enhancedBasic.multiplier', '150310', 0],
    ['kit.enhancedBasic.healPct', '150310', 1],
    ['kit.enhancedBasic.healFlat', '150310', 3],
    ['kit.enhancedBasic.elationAppend.multiplier', '150308', 4],
    ['kit.skill.healPct', '150302', 1],
    ['kit.skill.healFlat', '150302', 2],
    ['kit.ult.extraTurnElation', '150303', 1],
    ['kit.talent.lowHpDR', '150304', 3],
    ['kit.elationSkills.0.multiplierByCount.0', '150320', 0],
    ['kit.elationSkills.0.multiplierByCount.1', '150320', 1],
    ['kit.elationSkills.0.multiplierByCount.2', '150320', 2],
    ['kit.elationSkills.0.multiplierByCount.3', '150320', 3],
    ['kit.innate.extraTurnKeepRatio', '150329', 1],
    ['kit.innate.extraTurnKeepJoke', '150329', 2]
  ],
  '1511': [
    ['kit.basic.multiplier', '151101', 0],
    ['kit.skill.lordElationDegree', '151102', 0],
    ['kit.skill.multiplier', '151102', 1],
    ['kit.ult.multiplier', '151103', 1],
    ['kit.ult.extraMultiplier', '151103', 3],
    ['kit.ult.advance', '151103', 4],
    ['kit.talent.teamCritDmg', '151104', 8],
    ['kit.elationSkills.0.multiplier', '151120', 0],
    ['kit.innate.defIgnore', '151129', 1],
    ['kit.innate.critRate', '151129', 2]
  ]
};

function getPath(obj, path) {
  var parts = path.split('.');
  var cur = obj;
  for (var i = 0; i < parts.length; i++) {
    if (cur === undefined || cur === null) return undefined;
    cur = cur[parts[i]];
  }
  return cur;
}
function setPath(obj, path, value) {
  var parts = path.split('.');
  var cur = obj;
  for (var i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] === undefined) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

// 用户设定的基础等级（不含星魂加成），默认取行迹节点上限
export function baseSkillLevel(unit, slot) {
  var v = unit.cfg && unit.cfg.skillLevels ? unit.cfg.skillLevels[slot] : undefined;
  if (typeof v === 'number' && v > 0) return v;
  var sids = (SKILL_SLOTS[unit.id] || {})[slot] || [];
  return sids.length ? (SKILL_BASE_CAPS[sids[0]] || 10) : 10;
}

// 实际生效等级 = 基础等级 + 星魂加成（受上限约束）
export function effectiveSkillLevel(unit, slot, innateLv) {
  if (slot === 'innate') return innateLv || 1;
  var lv = baseSkillLevel(unit, slot);
  var bonus = EIDOLON_SKILL_BONUS[unit.id] || {};
  for (var r = 1; r <= (unit.eidolon || 0); r++) {
    if (bonus[r] && bonus[r][slot]) lv += bonus[r][slot];
  }
  return Math.max(1, Math.min(SLOT_CAPS[slot] || 15, lv));
}

// 固有行迹等级：默认 1 级；星神★阿哈 2 魂使「欢愉」命途升格效果加强 -> 2 级
export function innateLevelOf(st) {
  var o = st.cfg.options.innateLevel;
  if (o === 1 || o === 2) return o;
  var aha = null;
  for (var i = 0; i < st.order.length; i++) if (st.order[i].id === '1511') aha = st.order[i];
  return (aha && aha.eidolon >= 2) ? 2 : 1;
}

// 按技能等级把 kit 中的数值缩放到当前等级（基准为数据表最高等级，等价于直接查表）
function scaleKit(def, unit, innateLv) {
  var map = KIT_SCALE[unit.id] || [];
  for (var i = 0; i < map.length; i++) {
    var path = map[i][0], sid = map[i][1], idx = map[i][2];
    var t = SKILL_TABLES[sid];
    if (!t || !t.levels || !t.levels.length) continue;
    var slot = t.slot || 'skill';
    var lvl = slot === 'innate' ? innateLv : effectiveSkillLevel(unit, slot);
    var base = getPath(def, path);
    if (typeof base !== 'number') continue;
    var ref = t.levels[t.levels.length - 1][idx];
    var curRow = t.levels[Math.max(0, Math.min(lvl, t.levels.length) - 1)];
    var cur = curRow ? curRow[idx] : undefined;
    if (!ref || cur === undefined || cur === null) continue;
    setPath(def, path, base * (cur / ref));
  }
}

// 星魂一览（供 UI 展示）：名称、原文效果、是否为技能等级型、当前是否已解锁
export function eidolonInfo(id, unlocked) {
  var list = EIDOLON_INFO[id] || [];
  var bonus = EIDOLON_SKILL_BONUS[id] || {};
  var out = [];
  for (var r = 1; r <= 6; r++) {
    var info = list[r - 1] || {};
    var skillEffect = null;
    if (bonus[r]) {
      var parts = [];
      for (var slot in bonus[r]) parts.push(SLOT_LABELS[slot] + ' 等级 +' + bonus[r][slot]);
      skillEffect = parts.join('，');
    }
    out.push({
      rank: r,
      name: info.name || '',
      desc: info.desc || '',
      type: bonus[r] ? 'skillLevel' : 'mechanic',
      skillEffect: skillEffect,
      unlocked: (unlocked || 0) >= r
    });
  }
  return out;
}

// 角色完整信息（UI 用）：基础信息 + 星魂 + 技能等级 + 关键机制字段
export function characterInfo(id, cfg) {
  var c = getCharacter(id);
  if (!c) return null;
  var cc = (cfg && cfg.characters && cfg.characters[id]) || charCfg(defaultConfig(), id);
  var fake = { id: id, cfg: cc, eidolon: num(cc.eidolon, 0) };
  var ahaEid = num((cfg && cfg.characters && cfg.characters['1511'] && cfg.characters['1511'].eidolon), 0);
  var optInnate = cfg && cfg.options ? cfg.options.innateLevel : undefined;
  var innateLv = (optInnate === 1 || optInnate === 2) ? optInnate
    : ((id === '1511' && num(cc.eidolon, 0) >= 2) ? 2 : (ahaEid >= 2 ? 2 : 1));
  var lc = resolveLightcone(id, cc);
  var statClone = {
    atk: num(cc.stats.atk, c.base.atk), def: num(cc.stats.def, c.base.def), hp: num(cc.stats.hp, c.base.hp),
    spd: num(cc.stats.spd, c.base.spd), critRate: num(cc.stats.critRate, 0.05),
    critDmg: num(cc.stats.critDmg, 0.5), elationDegree: num(cc.stats.elationDegree, 0)
  };
  var lcBonus = applyLightconeStats({ stats: statClone }, lc);
  var relics = resolveRelics(id, cc);
  var relicBonus = relicPanelBonus(relics);
  applyRelicStats({ stats: statClone, dmgBonus: 0, energyRegen: 0, statusRes: 0 }, relicBonus);
  return {
    id: c.id, name: c.name, nameEn: c.nameEn, element: c.element, elementZh: c.elementZh, role: c.role,
    eidolon: num(cc.eidolon, 0),
    eidolons: eidolonInfo(id, num(cc.eidolon, 0)),
    skillLevels: skillLevelInfo(fake, innateLv),
    innateLevel: innateLv,
    lightcone: lightconeInfo(id, cfg),
    lightconeBonus: lcBonus,
    relics: relicInfo(id, cfg),
    relicBonus: relicBonus,
    panelStats: statClone,                 // 面板（角色 + 行迹 + 光锥）
    baseStats: { atk: num(cc.stats.atk, c.base.atk), def: num(cc.stats.def, c.base.def),
                 hp: num(cc.stats.hp, c.base.hp), spd: num(cc.stats.spd, c.base.spd),
                 critRate: num(cc.stats.critRate, 0.05), critDmg: num(cc.stats.critDmg, 0.5),
                 elationDegree: num(cc.stats.elationDegree, 0) }
  };
}

// 各角色技能等级一览（供 UI / CLI 展示）
export function skillLevelInfo(unit, innateLv) {
  var slots = SKILL_SLOTS[unit.id] || {};
  var out = [];
  for (var slot of ['basic', 'skill', 'ult', 'talent', 'elationSkill', 'innate', 'maze']) {
    if (!slots[slot]) continue;
    var lvl = effectiveSkillLevel(unit, slot, innateLv);
    var sids = slots[slot];
    var t = SKILL_TABLES[sids[0]];
    out.push({ slot: slot, label: SLOT_LABELS[slot] || slot, level: lvl,
               base: baseSkillLevel(unit, slot), cap: SLOT_CAPS[slot] || 15,
               skillIds: sids, name: t ? t.name : '' });
  }
  return out;
}

export const ENGINE_VERSION = '1.2.0';

var CYCLE_AV = 100;
var FIRST_CYCLE_AV = 150;

function round2(v) { return Math.round(v * 100) / 100; }
function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }

// 默认配置：面板默认值 = 站点满级基础值 + 行迹属性节点（裸装）。请按实际面板调整。
export function defaultConfig() {
  var cfg = {
    meta: { version: 'hsr-4.6.51', label: '银狼LV.999 + 火花 + 真珠 + 星神★阿哈（欢愉四人队）' },
    duration: { cycles: 3, avPerCycle: CYCLE_AV, firstCycleAV: FIRST_CYCLE_AV },
    enemy: {
      level: 80, defenseBase: DEF_BASE, defensePerLevel: DEF_PER_LEVEL,
      resBase: 0.2, weakness: true, resShred: 0, vulnerability: 0,
      toughnessDR: 0.1, broken: false, targetCount: 1
    },
    team: {
      skillPoints: { start: 3, max: 5 },
      jokePoints: { start: 0 },
      ahaMoment: { baseSpeed: 80, useOwnerSpeed: true, divisor1: 5, divisor2: 10, divisor3: 20, divisor4: 40,
                   minInterval: 50 },
      elationCount: 4
    },
    options: {
      alwaysCrit: true,
      infiniteSkillPoints: false,
      blindboxMode: 'expected',   // 默认按游戏内概率衰减结算；'always' 为理论上限
      includeTrueDamage: true,
      includeMaze: true,
      elationBaseValue: ELATION_BASE_VALUE,
      jokeCurveK: JOKE_K, jokeCurveC: JOKE_C,
      goodRewardOnElationSkill: true
    },
    characters: {}
  };
  for (var i = 0; i < CHARACTERS.length; i++) {
    var c = CHARACTERS[i];
    var t = c.traceBonus || {};
    cfg.characters[c.id] = {
      enabled: true,
      name: c.name,
      level: 80,
      // 默认按「中等练度」假设：2 星魂（各角色 E2 均为质变档：银狼 +40%、火花额外回合+暴伤、
      // 真珠增笑+拉条、阿哈强化命途升格）+ 专属光锥叠影 1
      eidolon: 2,
      // 技能基础等级默认取行迹节点上限（普攻 6 / 战技·终结技·天赋·欢愉技 10），
      // 星魂 3、5 的技能等级加成在此之上叠加（上限 普攻 10 / 其余 15）
      skillLevels: defaultSkillLevels(c.id),
      // 专属光锥：默认装备，叠影 1；enabled=false 或 id='none' 表示不带光锥
      lightcone: { enabled: true, id: SIGNATURE_LIGHTCONE[c.id] || 'none', superimpose: 1 },
      // 遗器：默认启用（站点推荐的首选外圈 4 件 + 内圈 2 件 + 主词条 + 中等练度副词条）
      // 默认与 presets/medium.json（中等练度）一致：推荐套装 + 主词条 + 28 条有效副词条
      relics: { enabled: true, set4: null, set2: null, mainStats: true, substatRolls: 28 },
      stats: {
        atk: round2(c.base.atk + (t.atkFlat || 0)),
        def: round2(c.base.def * (1 + (t.defPct || 0))),
        hp: round2(c.base.hp),
        spd: round2(c.base.spd + (t.spd || 0)),
        critRate: round2(c.base.critRate + (t.critRate || 0)),
        critDmg: round2(c.base.critDmg + (t.critDmg || 0)),
        elationDegree: round2(c.base.elationDegree + (t.elationDegree || 0))
      },
      rotation: {
        mode: 'perfect',
        useMaze: true,
        lordTarget: c.id === '1511' ? '1506' : '',
        maxTrapsPerTurn: 20
      }
    };
  }
  return cfg;
}

// 读取配置中某角色（缺失时回退默认）
function charCfg(cfg, id) {
  return cfg.characters[id] || defaultConfig().characters[id];
}

// 队伍中启用且为欢愉命途的角色数量（四人全为欢愉）
function elationCount(state) {
  var n = 0;
  for (var i = 0; i < state.order.length; i++) {
    if (state.order[i].enabled) n++;
  }
  return Math.max(1, n);
}

function tierIndex(count, tiers) {
  var idx = 0;
  for (var i = 0; i < tiers.length; i++) if (count >= tiers[i]) idx = i;
  return idx;
}

// 战斗状态初始化
function initState(cfg) {
  var st = {
    cfg: cfg,
    av: 0,
    sp: num(cfg.team.skillPoints.start, 3),
    joke: num(cfg.team.jokePoints.start, 0),
    elationCount: 4,
    order: [],
    log: [],
    warnings: [],
    seq: 0,
    ahaStanceTurnsLeft: 0,        // 欢愉万相剩余回合
    upgraded: false,              // 命途升格是否激活
    ahaMoment: null,
    series: []
  };
  var speeds = [];
  // 固有行迹等级：默认 1；星神★阿哈 2 魂使「欢愉」命途升格加强 -> 2
  var ahaEidolon = num((cfg.characters['1511'] || {}).eidolon, 0);
  var innateLv = (cfg.options.innateLevel === 1 || cfg.options.innateLevel === 2)
    ? cfg.options.innateLevel : (ahaEidolon >= 2 ? 2 : 1);
  st.innateLevel = innateLv;
  for (var i = 0; i < CHARACTERS.length; i++) {
    var c = CHARACTERS[i];
    var cc = charCfg(cfg, c.id);
    if (!cc.enabled) continue;
    var spd = num(cc.stats.spd, c.base.spd);
    // 每个单位持有独立的角色定义副本，便于按技能等级缩放 kit 数值而不污染原始数据
    var unit = {
      id: c.id, def: JSON.parse(JSON.stringify(c)), cfg: cc, name: c.name, enabled: true, spd: spd,
      stats: {
        atk: num(cc.stats.atk, c.base.atk), def: num(cc.stats.def, c.base.def),
        hp: num(cc.stats.hp, c.base.hp), spd: spd,
        critRate: num(cc.stats.critRate, 0.05), critDmg: num(cc.stats.critDmg, 0.5),
        elationDegree: num(cc.stats.elationDegree, 0)
      },
      eidolon: num(cc.eidolon, 0),
      energy: 0, energyMax: c.energy.max,
      nextAV: 0,
      hidden: 0, hiddenCap: 240, hiddenCapUpgraded: 999,
      goodReward: 0, goodRewardTurns: 0,
      fervor: 0, charges: 0, sparks: 0,
      stance: null, stanceBasicsLeft: 0, blindboxChance: 1.0,
      trapsUsed: 0, linkOpen: false, trapBonus: 0, trapAdjBonus: 0,
      lordTarget: null, isLord: false,
      inAhaMoment: false,
      damage: 0, hits: 0,
      tempElationTurns: 0, tempElation: 0,
      critDmgStacks: 0, critDmgStackTurns: 0,
      totalDamageByType: { elation: 0, normal: 0, true: 0 }
    };
    if (c.id === '1511') {
      unit.fervorMax = unit.def.kit.talent.fervorMax;
      unit.energyMax = unit.def.kit.talent.fervorMax;
      if (unit.eidolon >= 1) unit.fervor = unit.def.eidolons[1].fervorOnStart;
    }
    unit.innateLevel = innateLv;
    unit.skillLevels = {};
    for (var sl = 0; sl < 7; sl++) {
      var slotName = ['basic', 'skill', 'ult', 'talent', 'elationSkill', 'innate', 'maze'][sl];
      if ((SKILL_SLOTS[c.id] || {})[slotName]) unit.skillLevels[slotName] = effectiveSkillLevel(unit, slotName, innateLv);
    }
    // 按技能等级缩放 kit（伤害倍率、关键资源产出），基准为数据表最高等级
    scaleKit(unit.def, unit, innateLv);
    // 专属光锥：固定属性并入面板，百分比/速度加成随后结算
    unit.lc = resolveLightcone(c.id, cc);
    unit.lcBonus = applyLightconeStats(unit, unit.lc);
    // 遗器：主词条 + 副词条 + 套装无条件属性
    unit.relics = resolveRelics(c.id, cc);
    unit.relicBonus = relicPanelBonus(unit.relics);
    applyRelicStats(unit, unit.relicBonus);
    // 基础速度 = 角色基础 + 行迹 + 固定值加成（光锥/遗器），不含百分比加成
    unit.baseSpd = num(cc.stats.spd, c.base.spd) +
      ((unit.lcBonus && unit.lcBonus.spdFlat) || 0) + ((unit.relicBonus && unit.relicBonus.spdFlat) || 0);
    unit.spd = unit.stats.spd;
    unit.lcStacks = 0;      // 火花光锥·瞩目：每消耗 1 战技点叠 1 层（最多 4 层）
    unit.lcTurnSpend = 0;   // 本回合消耗的战技点
    unit.lcPushTurns = 0;   // 【推流】剩余回合
    unit.lcBasicCount = 0;  // 银狼光锥·稳赢：普攻计数（3 次后重置触发次数）
    unit.lcTrigUsed = false;
    // 秘技进场效果
    if (cc.rotation && cc.rotation.useMaze && cfg.options.includeMaze) {
      applyMaze(st, unit);
    }
    // 遗器开局效果：329 欢愉度 >=40% / 308 速度 >=120 -> 进战行动提前 40%
    (function () {
      var e4 = unit.relics && unit.relics.effects4 && unit.relics.effects4.cond;
      var e2 = unit.relics && unit.relics.effects2 && unit.relics.effects2.cond;
      var conds = [e4, e2];
      for (var ci = 0; ci < conds.length; ci++) {
        var c = conds[ci];
        if (!c) continue;
        if (c.id === 'elationAdvance' && unit.stats.elationDegree >= c.elationNeed) unit.startAdvance = c.advance;
        if (c.id === 'spdAdvance' && unit.stats.spd >= c.spdNeed) unit.startAdvance = c.advance;
        if (c.id === 'spdCritRate') {
          for (var ti = 0; ti < c.tiers.length; ti++) if (unit.stats.spd >= c.tiers[ti].spd) unit.stats.critRate += c.tiers[ti].critRate;
        }
      }
      if (unit.startAdvance) unit.nextAV = (10000 / unit.spd) * (1 - unit.startAdvance);
    })();
    st.order.push(unit);
    speeds.push(unit.spd);
  }
  st.elationCount = st.order.length;
  // 「美学底本」目标：默认跟随阿哈的令使目标（也可单独配置）
  var pearlUnit = findUnit(st, '1503');
  if (pearlUnit) {
    var lt = (pearlUnit.cfg.rotation && pearlUnit.cfg.rotation.lordTarget) ||
             (cfg.characters['1511'] && cfg.characters['1511'].rotation && cfg.characters['1511'].rotation.lordTarget) || '1506';
    pearlUnit.lordTarget = findUnit(st, lt) || findUnit(st, '1506') || st.order[0];
  }
  // 阿哈时刻行动单位：基础速度 + 队伍速度贡献（可用 unique 覆盖为基础速度 = 阿哈速度）
  speeds.sort(function (a, b) { return b - a; });
  var am = cfg.team.ahaMoment;
  var ahaOwner = null;
  for (var k = 0; k < st.order.length; k++) if (st.order[k].id === '1511') ahaOwner = st.order[k];
  var baseSpeed = num(am.baseSpeed, 80);
  if (am.useOwnerSpeed && ahaOwner && ahaOwner.def.unique && ahaOwner.def.unique.useOwnerSpeed) {
    // 「阿哈时刻在」：基础速度由 80 提升至阿哈的**基础速度**（含固定值加成，不含速度百分比）
    baseSpeed = ahaOwner.baseSpd || ahaOwner.stats.spd;
  }
  var ahaSpd = baseSpeed;
  if (speeds.length > 0) ahaSpd += speeds[0] / num(am.divisor1, 5);
  if (speeds.length > 1) ahaSpd += speeds[1] / num(am.divisor2, 10);
  if (speeds.length > 2) ahaSpd += speeds[2] / num(am.divisor3, 20);
  if (speeds.length > 3) ahaSpd += speeds[3] / num(am.divisor4, 40);
  st.ahaMoment = { id: 'aha', name: '阿哈时刻', spd: round2(ahaSpd), nextAV: 10000 / ahaSpd, isAhaMoment: true };
  return st;
}

// 秘技进场
function applyMaze(st, unit) {
  var m = unit.def.kit.maze;
  if (!m) return;
  if (m.goodReward) unit.goodReward = Math.min(unit.goodReward + m.goodReward, goodRewardCapOf(unit, st));
  if (m.charges) unit.charges += m.charges;
  if (m.spGain) addSP(st, m.spGain);
  if (m.fixedGoodReward) unit.goodReward = Math.max(unit.goodReward, m.fixedGoodReward);
  if (m.extraTurnJoke) st.joke += m.extraTurnJoke;
  if (m.blindboxPerWave) unit.blindboxPerWave = m.blindboxPerWave;
}

// 战技点上限：基础上限 + 火花专属光锥「瞩目」（每名欢愉角色 +1，最多 +3）
function spCap(st) {
  var cap = num(st.cfg.team.skillPoints.max, 5);
  var spark = findUnit(st, '1501');
  if (spark && spark.lc && spark.lc.id === '23053') {
    cap += Math.min(lcParam(spark.lc, 2) || 3, st.elationCount * (lcParam(spark.lc, 1) || 1));
  }
  return cap;
}
function addSP(st, n) {
  st.sp = Math.min(spCap(st), st.sp + n);
}
// 消耗战技点；unit 用于触发光锥效果（瞩目叠层与【推流】）
function spendSP(st, n, unit) {
  if (st.cfg.options.infiniteSkillPoints) {
    if (unit) noteSPSpend(st, unit, n);
    return n;
  }
  var paid = Math.min(st.sp, n);
  st.sp -= paid;
  if (unit && paid > 0) noteSPSpend(st, unit, paid);
  return paid;
}
// 火花专属光锥「瞩目」：每消耗 1 点叠 1 层无视防御（最多 4 层）；单回合消耗 >= 4 点获得【推流】
function noteSPSpend(st, unit, n) {
  unit.__spTurnSpent = (unit.__spTurnSpent || 0) + n;   // 遗器·天国@直播间 用
  if (!unit.lc || unit.lc.id !== '23053') return;
  var maxStack = lcParam(unit.lc, 4) || 4;
  unit.lcStacks = Math.min(maxStack, unit.lcStacks + n);
  unit.lcTurnSpend += n;
  if (unit.lcTurnSpend >= (lcParam(unit.lc, 6) || 4)) unit.lcPushTurns = 2;   // 推流持续按 2 回合处理
}


// ============================================================================
// 资源与增益
// ============================================================================

function findUnit(st, id) {
  for (var i = 0; i < st.order.length; i++) if (st.order[i].id === id) return st.order[i];
  return null;
}

function hiddenCap(unit, st) {
  if (unit.def.kit.innate && st.upgraded) return unit.def.kit.innate.overflowTo || 999;
  return unit.def.kit.talent.hiddenOverflow || 240;
}

function goodRewardCapOf(unit, st) {
  var k = unit.def.kit.talent;
  if (!k || !k.goodRewardCap) return 999;
  if (unit.def.kit.innate && st.upgraded && unit.def.kit.innate.capTo) return unit.def.kit.innate.capTo;
  return k.goodRewardCap;
}

function gainGoodReward(st, unit, n) {
  if (n <= 0) return;
  var cap = goodRewardCapOf(unit, st);
  var infinite = unit.def.kit.talent && unit.def.kit.talent.infiniteDuration;
  unit.goodReward = Math.min(cap, unit.goodReward + n);
  if (!infinite) unit.goodRewardTurns = 2;
}

function gainJoke(st, unit, n) {
  if (n <= 0) return;
  st.joke += n;
  st.jokeTotalGained = (st.jokeTotalGained || 0) + n;   // 遗器·魔法少女 4 件套叠层用
  var wolf = findUnit(st, '1506');
  if (wolf && wolf.def.kit.talent) {
    wolf.hidden = Math.min(hiddenCap(wolf, st), wolf.hidden + n);
  }
}

function gainHidden(st, unit, n) {
  if (n <= 0) return;
  unit.hidden = Math.min(hiddenCap(unit, st), unit.hidden + n);
  // 银狼星魂 2：无敌玩家状态下每提高 120 点隐藏分，获得 1 个额外回合并恢复 1 次强化普攻次数
  if (unit.id === '1506' && unit.eidolon >= 2 && unit.stance === 'invincible') {
    var e2 = unit.def.eidolons[2];
    unit.__stanceHidden = (unit.__stanceHidden || 0) + n;
    while (unit.__stanceHidden >= e2.extraTurnPerHidden) {
      unit.__stanceHidden -= e2.extraTurnPerHidden;
      unit.stanceBasicsLeft += (e2.restoreEnhancedBasic || 1);
      unit.__e2Procs = (unit.__e2Procs || 0) + 1;
      advanceUnit(st, unit, 1.0);
    }
  }
}

// 敌人抗性（含银狼星魂 6 的【禁限弱点】植入）
function enemyRes(st) {
  var wolf = findUnit(st, '1506');
  if (wolf && wolf.eidolon >= 6) {
    return st.cfg.enemy.weakness ? -0.2 : 0;   // 全属性弱点；原本已 0 抗性则改为 -20%
  }
  return st.cfg.enemy.weakness ? 0 : num(st.cfg.enemy.resBase, 0.2);
}

function gainFervor(st, unit, n) {
  if (!unit.fervorMax) return;
  unit.fervor = Math.min(unit.fervorMax, unit.fervor + n);
}

function collectBuffs(st, unit, opts) {
  opts = opts || {};
  var b = {
    elationDegree: unit.stats.elationDegree,
    critRate: unit.stats.critRate,
    critDmg: unit.stats.critDmg,
    resShred: num(st.cfg.enemy.resShred, 0),
    defShred: 0, defIgnore: 0,
    atkPct: 0, dmgBonus: 0,
    vulnerability: [num(st.cfg.enemy.vulnerability, 0)],
    amplification: [],
    sources: []
  };
  function add(key, v, why) {
    if (!v) return;
    if (key === 'vulnerability' || key === 'amplification') b[key].push(v);
    else b[key] += v;
    b.sources.push(why + ' +' + Math.round(v * 1000) / 10 + '%');
  }
  var aha = findUnit(st, '1511');
  var pearl = findUnit(st, '1503');
  var spark = findUnit(st, '1501');
  var wolf = findUnit(st, '1506');

  if (unit.isLord && aha && aha.def.kit.skill.lordElationDegree) {
    add('elationDegree', aha.def.kit.skill.lordElationDegree, '「欢愉」令使');
  }
  if (st.upgraded) {
    if (unit.id === '1501' && unit.def.kit.innate) {
      // 4.7：#5 改为欢愉技倍率，不再是暴击伤害。倍率在 executeElationSkill 里乘。
      add('defIgnore', unit.def.kit.innate.defIgnore, '固有行迹·兔子戏法无视防御');
    }
    if (unit.id === '1511' && unit.def.kit.innate && unit.def.kit.innate.critRate) {
      add('critRate', unit.def.kit.innate.critRate, '固有行迹·无中生有');
    }
    if (unit.id === '1506' && unit.def.kit.innate) {
      add('critDmg', unit.def.kit.innate.critDmg, '固有行迹·全息幻象');
    }
  }
  if (unit.id === '1501') {
    var p6 = unit.def.traces.p6;
    if (unit.stats.atk > p6.atkThreshold) {
      add('elationDegree', Math.min(p6.elationMax, Math.floor((unit.stats.atk - p6.atkThreshold) / 100) * p6.elationPer100), '行迹·笑点签售会');
    }
    add('critDmg', Math.min(unit.def.traces.p8.critDmgMax, st.joke * unit.def.traces.p8.critDmgPerJoke), '行迹·真伪调色盘(全队)');
    if (unit.eidolon >= 4 && unit.tempElationTurns > 0) add('elationDegree', unit.def.eidolons[4].elationDegreeOnUlt, '星魂4');
    if (unit.eidolon >= 2) add('critDmg', Math.min(0.10 * unit.sparks, 0.40), '星魂2(爆点)');
    if (unit.eidolon >= 1) add('resShred', Math.min(unit.def.eidolons[1].resPenMax, st.joke * unit.def.eidolons[1].resPenPerJoke), '星魂1(全队穿透)');
    if (unit.eidolon >= 6) add('resShred', unit.def.eidolons[6].resPen, '星魂6穿透');
  }
  if (unit.id === '1506') {
    var a2 = unit.def.traces.a2;
    if (unit.stats.spd >= a2.spdThreshold) {
      add('elationDegree', a2.elationBase + Math.min(a2.maxPoints, unit.stats.spd - a2.spdThreshold) * a2.elationPerPoint, '行迹·假结局速通攻略');
    }
    var tal = unit.def.kit.talent;
    var fromHidden = tal.critRatePerPoint * unit.hidden;
    b.critRate += fromHidden;
    b.sources.push('隐藏分暴击率 +' + Math.round(fromHidden * 1000) / 10 + '%');
    var overflowPts = Math.max(0, (b.critRate - 1) / tal.critRatePerPoint);
    if (overflowPts > 0) add('critDmg', overflowPts * tal.critDmgPerPoint, '隐藏分溢出转暴伤');
    if (unit.eidolon >= 1 && unit.stance === 'invincible') add('vulnerability', unit.def.eidolons[1].domainVulnerability, '星魂1结界易伤');
    if (unit.eidolon >= 6 && opts.isEnhancedBasic) add('amplification', unit.def.eidolons[6].amplificationOnEnhancedBasic, '星魂6增笑');
  }
  if (unit.id === '1503') {
    var t1 = unit.def.traces.t1;
    if (unit.stats.def >= t1.defThreshold) {
      add('elationDegree', t1.elationBase + Math.min(t1.maxPoints, unit.stats.def - t1.defThreshold) / 100 * t1.elationPer100, '行迹·洞察万物');
    }
    if (unit.eidolon >= 1) {
      var arr = unit.def.eidolons[1].elationDegreeByCount;   // { '2':0.10, '3':0.20, '4':0.60 }
      var byCount = arr[String(Math.min(4, st.elationCount))] || 0;
      add('elationDegree', byCount, '星魂1(全队欢愉度 ' + st.elationCount + ' 人档)');
    }
    if (unit.eidolon >= 2) add('amplification', unit.def.eidolons[2].amplification, '星魂2增笑(全队)');
  }
  if (unit.id === '1511') {
    if (st.ahaStanceTurnsLeft > 0) {
      var di = unit.def.kit.ult.stanceDefIgnore;
      if (unit.eidolon >= 2) di = unit.def.kit.ult.defIgnoreE2;
      add('defIgnore', di, '欢愉万相无视防御');
    }
    var t3 = unit.def.traces.t3;
    var tier = 0;
    for (var ti = 0; ti < t3.tiers.length; ti++) {
      if (unit.stats.spd >= t3.tiers[ti].spd) tier = t3.tiers[ti].elationDegree;
    }
    if (tier) add('elationDegree', tier, '行迹·盒中蕴藏的世界');
    if (unit.eidolon >= 1) add('amplification', unit.def.eidolons[1].amplification, '星魂1增笑(全队)');
  }
  if (aha && aha.critDmgTurns > 0) add('critDmg', aha.def.kit.talent.teamCritDmg, '阿哈天赋(全队暴伤)');
  if (spark && spark.eidolon >= 6) add('resShred', spark.def.eidolons[6].resPen, '火花星魂6穿透(全队)');

  // ---- 专属光锥机制（基础属性已在 initState 并入面板）----
  // 真珠「挥墨」：对我方全体施放欢愉技后，敌方全体受到的伤害提高（全队共享）
  if (pearl && pearl.lc && pearl.lc.id === '23055' && st.lcVulnTurns > 0) {
    add('vulnerability', lcParam(pearl.lc, 3), '光锥·挥墨(敌方易伤)');
  }
  // 阿哈「即兴巡演」：触发后我方全体造成伤害无视敌方防御（整场战斗）
  if (aha && aha.lc && aha.lc.id === '23065' && st.lcTeamDefIgnore) {
    add('defIgnore', lcParam(aha.lc, 3), '光锥·即兴巡演(全队无视防御)');
  }
  // 火花「瞩目」：持有【推流】时我方全体欢愉度提高
  if (spark && spark.lc && spark.lc.id === '23053' && spark.lcPushTurns > 0) {
    add('elationDegree', lcParam(spark.lc, 3), '光锥·推流(全队欢愉度)');
  }
  if (unit.lc) {
    if (unit.lc.id === '23057') add('defIgnore', lcParam(unit.lc, 1), '光锥·稳赢(无视防御)');
    if (unit.lc.id === '23053' && unit.lcStacks > 0) {
      add('defIgnore', Math.min(lcParam(unit.lc, 4) || 4, unit.lcStacks) * lcParam(unit.lc, 5),
          '光锥·瞩目(无视防御 x' + unit.lcStacks + ')');
    }
  }

  // ---- 遗器 ----
  if (unit.relics) {
    var rcSelf = unit.relics;
    var selfConds = [rcSelf.effects4 && rcSelf.effects4.cond, rcSelf.effects2 && rcSelf.effects2.cond];
    var selfNames = [rcSelf.set4Name, rcSelf.set2Name];
    for (var si = 0; si < selfConds.length; si++) {
      var sc = selfConds[si];
      if (!sc) continue;
      var sName = '遗器·' + selfNames[si];
      if (sc.id === 'elationDefIgnore') {
        var stk = Math.min(sc.maxStacks, Math.floor((st.jokeTotalGained || 0) / sc.jokeStep));
        add('defIgnore', sc.base + sc.per * stk, sName + '(无视防御 ' + stk + ' 层)');
      } else if (sc.id === 'atkPctAfterUlt') {
        if ((unit.__ultAtkTurns || 0) > 0) { b.atkPct = (b.atkPct || 0) + sc.atkPct; b.sources.push(sName + ' 攻击力+' + Math.round(sc.atkPct * 100) + '%'); }
      } else if (sc.id === 'debuffCrit' && st.cfg.enemy.debuffed !== false) {
        add('critRate', sc.critRate, sName + '(对负面状态敌人)');
        add('critDmg', sc.critDmg, sName + '(禁锢)');
      } else if (sc.id === 'killStacksCritDmg') {
        var kills = num(st.cfg.enemy.killStacks, 0);
        if (kills > 0) add('critDmg', sc.per * Math.min(sc.maxStacks, kills), sName + '(击杀 ' + kills + ' 层)');
      } else if (sc.id === 'spend3CritDmg') {
        if ((unit.__spend3Turns || 0) > 0) add('critDmg', sc.critDmg, sName + '(单回合消耗≥' + sc.spend + ' 战技点)');
      } else if (sc.id === 'critRateDmgBonus') {
        if (b.critRate >= sc.critRateNeed) { b.dmgBonus = (b.dmgBonus || 0) + sc.dmgBonus; b.sources.push(sName + ' 普攻/战技伤害+' + Math.round(sc.dmgBonus * 100) + '%'); }
      } else if (sc.id === 'summonCritDmg') {
        if (unit.hasSummon) add('critDmg', sc.critDmg, sName + '(召唤物)');
      }
    }
    // 325 欢愉度档位（需要先算出当前欢愉度）
    var tierCond = (rcSelf.effects2 && rcSelf.effects2.cond && rcSelf.effects2.cond.id === 'elationTierCritDmg')
      ? rcSelf.effects2.cond
      : ((rcSelf.effects4 && rcSelf.effects4.cond && rcSelf.effects4.cond.id === 'elationTierCritDmg') ? rcSelf.effects4.cond : null);
    if (tierCond) {
      for (var ti2 = 0; ti2 < tierCond.tiers.length; ti2++) {
        if (b.elationDegree >= tierCond.tiers[ti2].elation) add('critDmg', tierCond.tiers[ti2].critDmg, '遗器·' + rcSelf.set2Name + '(欢愉度档位)');
      }
    }
  }
  // ---- 遗器：跨单位效果 ----
  for (var ui = 0; ui < st.order.length; ui++) {
    var wearer = st.order[ui];
    if (wearer === unit || !wearer.relics) continue;
    var wc = [wearer.relics.effects4 && wearer.relics.effects4.cond, wearer.relics.effects2 && wearer.relics.effects2.cond];
    var wn = [wearer.relics.set4Name, wearer.relics.set2Name];
    for (var wi = 0; wi < wc.length; wi++) {
      var wcond = wc[wi];
      if (!wcond) continue;
      var wname = '遗器·' + wn[wi];
      if (wcond.id === 'castOnAlly' && (wearer.__castOnAllyTurns || 0) > 0) {
        if (wearer.lordTarget && wearer.lordTarget.id === unit.id) add('elationDegree', wcond.allyElation, wname + '(目标欢愉度)');
        if (wearer.goodReward >= wcond.goodRewardNeed) add('critDmg', wcond.teamCritDmg, wname + '(全队暴伤)');
      } else if (wcond.id === 'castOnAllyCritDmg' && (wearer.__castOnAllyTurns || 0) > 0) {
        if (wearer.lordTarget && wearer.lordTarget.id === unit.id) {
          add('critDmg', wcond.critDmg * Math.min(wcond.maxStacks, wearer.__castOnAllyStacks || 1), wname + '(目标暴伤)');
        }
      } else if (wcond.id === 'firstElationTeamElation' && wearer.__firstElationDone) {
        add('elationDegree', wcond.firstElationTeamElation, wname + '(全队欢愉度)');
      } else if (wcond.id === 'resCritDmg' && (wearer.statusRes || 0) >= wcond.resNeed) {
        add('critDmg', wcond.critDmg, wname + '(全队暴伤)');
      } else if (wcond.id === 'firstAllyAtk' && st.order[0] === unit) {
        b.atkPct = (b.atkPct || 0) + wcond.atkPct; b.sources.push(wname + ' 首位攻击力+' + Math.round(wcond.atkPct * 100) + '%');
      }
    }
  }
  return b;
}

// ---------------------------------------------------------------------------
// 伤害结算
// ---------------------------------------------------------------------------
function pushHit(st, entry, hit) {
  entry.hits.push(hit);
  entry.damage += hit.damage;
  var unit = findUnit(st, hit.actorId);
  if (unit) {
    unit.damage += hit.damage;
    unit.hits += 1;
    unit.totalDamageByType[hit.kind] += hit.damage;
  }
  st.byType[hit.kind] = (st.byType[hit.kind] || 0) + hit.damage;
}

function enemyTargets(st) { return Math.max(1, num(st.cfg.enemy.targetCount, 1)); }

function dealElation(st, unit, entry, o) {
  var b = collectBuffs(st, unit, o);
  var joke = num(o.joke !== undefined ? o.joke : unit.goodReward, 0);
  if (o.jokeAdd) joke += o.jokeAdd;
  var res = enemyRes(st);
  var r = elationHit({
    multiplier: o.multiplier,
    baseValue: num(st.cfg.options.elationBaseValue, ELATION_BASE_VALUE),
    elationDegree: b.elationDegree,
    joke: joke,
    jokeK: num(st.cfg.options.jokeCurveK, JOKE_K),
    jokeC: num(st.cfg.options.jokeCurveC, JOKE_C),
    critRate: b.critRate, critDmg: b.critDmg,
    alwaysCrit: st.cfg.options.alwaysCrit !== false,
    vulnerability: b.vulnerability,
    amplification: b.amplification,
    res: res, resShred: b.resShred,
    toughnessDR: num(st.cfg.enemy.toughnessDR, 0.1), broken: !!st.cfg.enemy.broken,
    attackerLevel: num(unit.cfg.level, 80), targetLevel: num(st.cfg.enemy.level, 80),
    defBase: num(st.cfg.enemy.defenseBase, DEF_BASE), defPerLevel: num(st.cfg.enemy.defensePerLevel, DEF_PER_LEVEL),
    defShred: b.defShred, defIgnore: b.defIgnore
  });
  var hits = Math.max(1, o.count || 1);
  var total = r.damage * hits * (o.aoe ? enemyTargets(st) : 1);
  pushHit(st, entry, { actorId: unit.id, skillId: o.skillId, skillName: o.skillName, kind: 'elation',
    multiplier: o.multiplier, hits: hits, joke: round2(joke), elationDegree: round2(b.elationDegree),
    crit: st.cfg.options.alwaysCrit !== false, damage: round2(total), sources: b.sources });
  return total;
}

function dealNormal(st, unit, entry, o) {
  var b = collectBuffs(st, unit, o);
  var scaleValue = o.scaling === 'def' ? unit.stats.def * (1 + (b.atkPct || 0)) : (o.scaling === 'hp' ? unit.stats.hp : unit.stats.atk * (1 + (b.atkPct || 0)));
  var res = enemyRes(st);
  var r = normalHit({
    scalingValue: scaleValue, multiplier: o.multiplier, flat: o.flat || 0,
    dmgBonus: num(o.dmgBonus, 0) + (b.dmgBonus || 0),
    critRate: b.critRate, critDmg: b.critDmg,
    alwaysCrit: st.cfg.options.alwaysCrit !== false,
    vulnerability: b.vulnerability,
    res: res, resShred: b.resShred,
    toughnessDR: num(st.cfg.enemy.toughnessDR, 0.1), broken: !!st.cfg.enemy.broken,
    attackerLevel: num(unit.cfg.level, 80), targetLevel: num(st.cfg.enemy.level, 80),
    defBase: num(st.cfg.enemy.defenseBase, DEF_BASE), defPerLevel: num(st.cfg.enemy.defensePerLevel, DEF_PER_LEVEL),
    defShred: b.defShred, defIgnore: b.defIgnore
  });
  var hits = Math.max(1, o.count || 1);
  var total = r.damage * hits * (o.aoe ? enemyTargets(st) : 1);
  pushHit(st, entry, { actorId: unit.id, skillId: o.skillId, skillName: o.skillName, kind: 'normal',
    multiplier: o.multiplier, hits: hits, joke: 0, elationDegree: 0,
    crit: st.cfg.options.alwaysCrit !== false, damage: round2(total), sources: b.sources });
  return total;
}

function dealTrue(st, unit, entry, ratio, reference, label) {
  if (st.cfg.options.includeTrueDamage === false) return 0;
  var r = trueDamage(ratio, reference);
  pushHit(st, entry, { actorId: unit.id, skillId: '', skillName: label || '真实伤害', kind: 'true',
    multiplier: ratio, hits: 1, joke: 0, elationDegree: 0, crit: false,
    damage: round2(r.damage), sources: ['基于参考伤害 ' + round2(reference)] });
  return r.damage;
}

// ============================================================================
// 完美轴策略 + 行动执行
// ============================================================================

function newEntry(st, unit, action, description) {
  st.seq += 1;
  var e = { seq: st.seq, av: round2(st.av), actorId: unit.id, actor: unit.name,
            action: action, description: description || '', damage: 0, hits: [], note: '' };
  st.log.push(e);
  return e;
}

function canUlt(unit) {
  if (unit.id === '1506') return unit.hidden >= unit.def.kit.talent.hiddenThreshold;
  if (unit.id === '1511') return unit.fervor >= unit.def.kit.talent.fervorMax;
  return unit.energy >= unit.energyMax;
}

// 策略：返回下一步行动类型
function chooseAction(st, unit) {
  var id = unit.id;
  var infinite = st.cfg.options.infiniteSkillPoints;
  var sp = infinite ? 99 : st.sp;

  if (id === '1506') {
    if (unit.stance === 'invincible') {
      return unit.stanceBasicsLeft > 0 ? 'enhancedBasic' : 'ult';
    }
    if (canUlt(unit)) return 'ult';
    if (sp >= 1) return 'skill';
    return 'basic';
  }
  if (id === '1501') {
    if (unit.energy >= unit.energyMax) return 'ult';
    // 连线期间：互动陷阱已在施放战技的同一回合内结算完毕，这里直接打强化普攻
    if (unit.linkOpen) return 'enhancedBasic';
    if (sp >= 1) return 'skill';
    return 'basic';
  }
  if (id === '1503') {
    if (unit.charges > 0) return 'enhancedBasic';
    if (unit.energy >= unit.energyMax) return 'ult';
    if (sp >= 1 && unit.goodReward < goodRewardCapOf(unit, st)) return 'skill';
    return 'basic';
  }
  if (id === '1511') {
    if (canUlt(unit)) return 'ult';
    if (!unit.lordTarget) return 'skill';
    if (sp >= 1) return 'skill';
    return 'basic';
  }
  return 'basic';
}

// 银狼盲盒：消耗战技点触发
function tryBlindbox(st, unit, entry, reason) {
  if (!unit || unit.id !== '1506') return 0;
  if (unit.goodReward <= 0) return 0;
  if (unit.stance !== 'invincible') return 0;
  var chance = unit.blindboxChance;
  var bb = unit.def.kit.ult.blindbox;
  var mode = st.cfg.options.blindboxMode || 'always';
  if (mode === 'expected') {
    var expDmg = dealElation(st, unit, entry, {
      skillId: '150603', skillName: '头号补给盲盒(期望)', multiplier: bb.multiplier * chance, joke: unit.goodReward
    });
    unit.blindboxChance = chance * chance * bb.procChanceDecay + chance * (1 - chance);
    entry.note = (reason ? reason + '；' : '') + '盲盒按期望结算（当前概率 ' + Math.round(chance * 1000) / 10 + '%）';
    return expDmg;
  }
  var dmg = dealElation(st, unit, entry, {
    skillId: '150603', skillName: '头号补给盲盒', multiplier: bb.multiplier, joke: unit.goodReward
  });
  var trueDmg = dealTrue(st, unit, entry, bb.trueRatio, dmg, '盲盒·真实伤害');
  gainJoke(st, unit, bb.jokeAdd);
  addSP(st, bb.spBack);
  unit.blindboxChance = Math.max(0, chance * bb.procChanceDecay);
  entry.note = (reason ? reason + '；' : '') + '盲盒触发（理想轴按必定触发，本次基准概率 ' + Math.round(chance * 1000) / 10 + '%）';
  return dmg + trueDmg;
}

// 阿哈对令使目标额外伤害 / 战技追加
function lordExtra(st, unit, entry) {
  var lord = unit.lordTarget;
  if (!lord) return 0;
  var t1 = unit.def.traces.t1;
  return dealElation(st, unit, entry, {
    skillId: '151102', skillName: '令使联动·' + lord.name, multiplier: t1.lordExtraElation, joke: lord.goodReward
  });
}

function executeAction(st, unit, action) {
  var id = unit.id;
  var entry = null;
  var i;
  // 真珠行迹·艺术壁垒：【美学底本】施放终结技时为其固定回复 90 点能量
  if (action === 'ult') {
    var pearl0 = findUnit(st, '1503');
    if (pearl0 && pearl0.lordTarget && pearl0.lordTarget.id === unit.id && pearl0.def.traces.t3) {
      pearl0.energy = Math.min(pearl0.energyMax, pearl0.energy + pearl0.def.traces.t3.energyRefund);
    }
  }

  if (id === '1506') {
    if (action === 'basic') {
      entry = newEntry(st, unit, '普攻·拳头硬了！');
      dealNormal(st, unit, entry, { skillId: '150601', skillName: '拳头硬了！', scaling: 'atk', multiplier: 1.4 });
      if (unit.goodReward > 0) dealElation(st, unit, entry, { skillId: '150604', skillName: '天赋·顺势追击', multiplier: 0.5, joke: unit.goodReward });
      addSP(st, 1); unit.energy += 20;
      noteBasicAttack(st, unit);
    } else if (action === 'skill') {
      entry = newEntry(st, unit, '战技·Shoot属性大爆发');
      dealNormal(st, unit, entry, { skillId: '150602', skillName: 'Shoot属性大爆发', scaling: 'atk', multiplier: 2.0, aoe: true });
      if (unit.goodReward > 0) dealElation(st, unit, entry, { skillId: '150604', skillName: '天赋·顺势追击', multiplier: 0.5, joke: unit.goodReward });
      spendSP(st, 1, unit); unit.energy += 30;
      gainJoke(st, unit, 5);
      tryBlindbox(st, unit, entry, '我方消耗战技点');
    } else if (action === 'ult') {
      entry = newEntry(st, unit, '终结技·无敌玩家，启动！', '进入无敌玩家结界，行动提前 100%');
      unit.stance = 'invincible';
      unit.stanceBasicsLeft = unit.def.kit.talent.invincibleBasics;
      gainHidden(st, unit, unit.def.traces.a6.hiddenOnEnter);
      if (unit.eidolon >= 2) {
        unit.__stanceHidden = unit.hidden;        // 星魂2：含初始隐藏分
        unit.goodRewardTurns += 1;                // 星魂2：进入结界时增益延长 1 回合
        unit.__e2Procs = 0;
        entry.note = '星魂2：以初始隐藏分 ' + Math.round(unit.hidden) + ' 起算，每 +120 点获得额外回合';
      }
      unit.blindboxChance = unit.def.kit.ult.blindbox.procChanceInit;
      advanceUnit(st, unit, unit.def.kit.ult.advance);
      unit.energy = 0;
      // 光锥·稳赢：对自身单体施放终结技时获得笑点（可触发 1 次，若干次普攻后重置）
      if (unit.lc && unit.lc.id === '23057' && !unit.lcTrigUsed) {
        var lcJoke = lcParam(unit.lc, 2);
        gainJoke(st, unit, lcJoke);
        unit.lcTrigUsed = true;
        unit.lcBasicCount = 0;
        entry.note = (entry.note ? entry.note + '；' : '') + '光锥·稳赢 +' + lcJoke + ' 笑点';
      }
    } else if (action === 'enhancedBasic') {
      entry = newEntry(st, unit, '强化普攻·奖励关：「狼尊时刻」');
      var stacks = Math.min(unit.def.kit.enhancedBasic.bonusMaxStacks, Math.floor(unit.hidden / 60));
      var finalMul = 1 + stacks * unit.def.kit.enhancedBasic.bonusPer60Hidden;
      dealElation(st, unit, entry, { skillId: '150608', skillName: '奖励关：「狼尊时刻」', multiplier: unit.def.kit.enhancedBasic.total, joke: unit.goodReward, finalMultiplier: finalMul, isEnhancedBasic: true });
      dealElation(st, unit, entry, { skillId: '150608', skillName: '狼尊时刻·收尾一击', multiplier: unit.def.kit.enhancedBasic.finisher, joke: unit.goodReward, isEnhancedBasic: true });
      for (i = 0; i < unit.def.kit.enhancedBasic.blindboxTriggers; i++) tryBlindbox(st, unit, entry, '强化普攻弹射间隙');
      unit.stanceBasicsLeft -= 1;
      noteBasicAttack(st, unit);
      if (unit.stanceBasicsLeft <= 0) {
        var keep = unit.eidolon >= 1 ? unit.def.eidolons[1].keepHiddenOnExit : 0;
        unit.hidden = Math.round(unit.hidden * keep);
        unit.stance = null;
        entry.note = (entry.note ? entry.note + '；' : '') + '结界结束，隐藏分清空' + (keep ? '（星魂1 保留 ' + Math.round(keep * 100) + '%）' : '');
      }
      unit.energy += 20;
    }
  } else if (id === '1501') {
    if (action === 'basic') {
      entry = newEntry(st, unit, '普攻·哑火了吗');
      dealNormal(st, unit, entry, { skillId: '150101', skillName: '哑火了吗', scaling: 'atk', multiplier: 1.4 });
      addSP(st, 1); unit.energy += 20;
    } else if (action === 'skill' || action === 'trap') {
      entry = newEntry(st, unit, action === 'skill' ? '战技·尖叫！火花花连线中' : '战技·互动陷阱');
      if (action === 'skill') {
        unit.linkOpen = true; unit.trapsUsed = 0; unit.trapBonus = 0; unit.trapAdjBonus = 0;
        spendSP(st, 1, unit); unit.energy += 30;
        // 技能自带的 1 次互动陷阱
        fireTrap(st, unit, entry);
        // 同一次施放内可重复发动（最多 20 次，每次消耗 1 战技点）——完美轴把战技点尽量换成层数
        var maxTraps = num(unit.cfg.rotation.maxTrapsPerTurn, 20);
        while (unit.trapsUsed < maxTraps &&
               (st.cfg.options.infiniteSkillPoints || st.sp > 0)) {
          if (!fireTrap(st, unit, entry)) break;
        }
      } else {
        fireTrap(st, unit, entry);
      }
      tryBlindbox(st, findUnit(st, '1506'), entry, '火花消耗战技点');
    } else if (action === 'ult') {
      entry = newEntry(st, unit, '终结技·万我狂欢，镜头不要停');
      var b = collectBuffs(st, unit, {});
      var mult = unit.def.kit.ult.multiplier + unit.def.kit.ult.elationDegreeCoef * b.elationDegree;
      dealNormal(st, unit, entry, { skillId: '150103', skillName: '万我狂欢，镜头不要停', scaling: 'atk', multiplier: mult, aoe: true });
      if (unit.goodReward > 0) dealElation(st, unit, entry, { skillId: '150104', skillName: '天赋·终结技欢愉伤害', multiplier: unit.def.kit.talent.ultElation, joke: unit.goodReward, aoe: true });
      var jokeGain = unit.def.kit.ult.jokeAdd + (unit.eidolon >= 1 ? unit.def.eidolons[1].jokeOnAhaMoment : 0) + (unit.eidolon >= 4 ? unit.def.eidolons[4].jokeOnUlt : 0);
      gainJoke(st, unit, jokeGain);
      if (unit.eidolon >= 4) { unit.tempElation = unit.def.eidolons[4].elationDegreeOnUlt; unit.tempElationTurns = unit.def.eidolons[4].elationTurns; }
      unit.energy = 0; addSP(st, 0);
      tryBlindbox(st, findUnit(st, '1506'), entry, '火花施放终结技');
    } else if (action === 'enhancedBasic') {
      entry = newEntry(st, unit, '强化普攻·百花齐放，胜者独享！');
      var mult2 = unit.def.kit.enhancedBasic.multiplier + unit.trapBonus;
      var adj = unit.def.kit.enhancedBasic.adjacentMultiplier + unit.trapAdjBonus;
      dealNormal(st, unit, entry, { skillId: '150108', skillName: '百花齐放，胜者独享！', scaling: 'atk', multiplier: mult2 });
      if (num(st.cfg.enemy.targetCount, 1) > 1) {
        dealNormal(st, unit, entry, { skillId: '150108', skillName: '百花齐放·相邻', scaling: 'atk', multiplier: adj, count: 2 });
      }
      if (unit.goodReward > 0) {
        dealElation(st, unit, entry, { skillId: '150104', skillName: '天赋·强化普攻欢愉伤害', multiplier: unit.def.kit.talent.enhancedBasicElation, joke: unit.goodReward, isEnhancedBasic: true });
        if (num(st.cfg.enemy.targetCount, 1) > 1) {
          dealElation(st, unit, entry, { skillId: '150104', skillName: '天赋·相邻欢愉伤害', multiplier: unit.def.kit.talent.enhancedBasicAdjacentElation, joke: unit.goodReward, count: 2, isEnhancedBasic: true });
        }
        if (unit.trapsUsed > 0) {
          dealElation(st, unit, entry, { skillId: '150104', skillName: '天赋·陷阱追击 x' + unit.trapsUsed, multiplier: unit.def.kit.talent.perTrapElation * unit.trapsUsed, joke: unit.goodReward, isEnhancedBasic: true });
        }
      }
      unit.linkOpen = false; unit.trapsUsed = 0; unit.trapBonus = 0; unit.trapAdjBonus = 0;
      addSP(st, 1); unit.energy += 20;
    }
  } else if (id === '1503') {
    if (action === 'basic') {
      entry = newEntry(st, unit, '普攻·行笔，临摹断水');
      dealNormal(st, unit, entry, { skillId: '150301', skillName: '行笔，临摹断水', scaling: 'def', multiplier: 1.26 });
      addSP(st, 1); unit.energy += 20;
    } else if (action === 'skill') {
      entry = newEntry(st, unit, '战技·补缀生命的柔光', '+15 好活当赏');
      gainGoodReward(st, unit, unit.def.kit.skill.goodReward);
      spendSP(st, 1, unit); unit.energy += 30;
      healTick(st, entry);
      tryBlindbox(st, findUnit(st, '1506'), entry, '真珠消耗战技点');
    } else if (action === 'ult') {
      entry = newEntry(st, unit, '终结技·鉴映灵魂的底色', '+20 好活当赏 / 3 层深度学习');
      gainGoodReward(st, unit, unit.def.kit.ult.goodReward);
      unit.charges += unit.def.kit.ult.charges;
      var idx = tierIndex(st.elationCount, [1, 2, 3, 4]);
      var lord = unit.lordTarget;
      // 星魂 2：除真珠与【美学底本】外的其他「欢愉」角色也触发行动提前
      if (unit.eidolon >= 2 && unit.def.eidolons[2].advanceOthersOnUlt) {
        var advAmt = unit.def.kit.ult.advanceByCount[Math.min(4, st.elationCount)] || 0;
        for (var oi = 0; oi < st.order.length; oi++) {
          var ally = st.order[oi];
          if (ally !== unit && ally !== lord) advanceUnit(st, ally, advAmt);
        }
      }
      if (lord) {
        advanceUnit(st, lord, unit.def.kit.ult.advanceByCount[Math.min(4, st.elationCount)] || 0);
        if (st.elationCount >= 4) {
          gainGoodReward(st, lord, unit.def.kit.ult.extraTurnGoodReward);
          gainJoke(st, unit, unit.def.kit.ult.extraTurnJoke);
          dealElation(st, unit, entry, { skillId: '150303', skillName: '美学底本·追加欢愉伤害', multiplier: unit.def.kit.ult.extraTurnElation, joke: lord.goodReward });
          if (unit.eidolon >= 2) {
            gainGoodReward(st, lord, unit.def.kit.ult.extraTurnGoodReward);
            gainJoke(st, unit, unit.def.kit.ult.extraTurnJoke);
            dealElation(st, unit, entry, { skillId: '150303', skillName: '星魂2·额外回合追加', multiplier: unit.def.kit.ult.extraTurnElation, joke: lord.goodReward });
          }
        }
      }
      unit.energy = 0;
    } else if (action === 'enhancedBasic') {
      entry = newEntry(st, unit, '强化普攻·行笔，绘制末浪');
      dealNormal(st, unit, entry, { skillId: '150310', skillName: '行笔，绘制末浪', scaling: 'def', multiplier: 1.4, aoe: true });
      dealElation(st, unit, entry, { skillId: '150308', skillName: '行笔，幻造星月·追加欢愉伤害', multiplier: 0.2, joke: unit.goodReward });
      if (unit.eidolon >= 6) {
        dealElation(st, unit, entry, { skillId: '150309', skillName: '星魂6·追加欢愉伤害', multiplier: unit.def.eidolons[6].enhancedBasicElation, joke: unit.goodReward });
      }
      unit.charges -= 1;
      addSP(st, 1); unit.energy += 20;
      healTick(st, entry);
    }
  } else if (id === '1511') {
    if (action === 'basic') {
      entry = newEntry(st, unit, '普攻·点星，开幕！');
      dealElation(st, unit, entry, { skillId: '151101', skillName: '点星，开幕！', multiplier: 0.7, joke: unit.goodReward });
      addSP(st, 1); gainFervor(st, unit, 1);
    } else if (action === 'skill') {
      entry = newEntry(st, unit, '战技·此乃令使，阿哈认证™');
      if (!unit.lordTarget) {
        var target = findUnit(st, unit.cfg.rotation.lordTarget) || findUnit(st, '1506') || st.order[0];
        unit.lordTarget = target;
        target.isLord = true;
        entry.note = '指定「' + target.name + '」为【「欢愉」令使】';
      }
      dealElation(st, unit, entry, { skillId: '151102', skillName: '此乃令使，阿哈认证™', multiplier: 0.625, joke: unit.goodReward, aoe: true });
      lordExtra(st, unit, entry);
      spendSP(st, 1, unit);
      // 光锥·即兴巡演：对我方其他单体施放战技 -> 获得笑点并使全队无视敌方防御（整场，不叠加）
      if (unit.lc && unit.lc.id === '23065' && !st.lcAhaCd) {
        var lcJoke = lcParam(unit.lc, 1);
        gainJoke(st, unit, lcJoke);
        st.lcTeamDefIgnore = true;
        // 4.7 文案是「每间隔 #3 回合」。#3=1 表示两次触发之间空过 1 个回合，不是每个回合都触发。
        // 冷却在下一次回合开始才减 1，所以计数要比间隔多 1，才会真正空过那一回合。
        st.lcAhaCd = (lcParam(unit.lc, 2) || 0) + 1;
        entry.note = (entry.note ? entry.note + '；' : '') + '光锥·即兴巡演 +' + lcJoke + ' 笑点，全队无视防御 ' +
          Math.round(lcParam(unit.lc, 3) * 1000) / 10 + '%';
      }
      var refund = unit.def.traces.t1.spRefund;
      if (refund) addSP(st, refund);
      gainFervor(st, unit, 1);
      tryBlindbox(st, findUnit(st, '1506'), entry, '阿哈消耗战技点');
    } else if (action === 'ult') {
      entry = newEntry(st, unit, '终结技·啊哈！宇宙笑点大爆炸', '获得【欢愉万相】，我方「欢愉」命途升格');
      dealElation(st, unit, entry, { skillId: '151103', skillName: '啊哈！宇宙笑点大爆炸', multiplier: 2.4, joke: unit.goodReward, aoe: true });
      dealElation(st, unit, entry, { skillId: '151103', skillName: '宇宙笑点大爆炸·弹射', multiplier: 0.72, joke: unit.goodReward, count: 5 });
      unit.fervor = 0;
      st.ahaStanceTurnsLeft = unit.def.kit.ult.stanceTurns;
      st.upgraded = true;
      if (unit.def.kit.ult.advance) advanceAhaMoment(st, unit.def.kit.ult.advance);
      if (unit.eidolon >= 6 && !unit.__e6FirstUlt) {
        unit.__e6FirstUlt = true;
        var e6 = unit.def.eidolons[6];
        var joke6 = e6.firstUltJoke || 0;
        st.joke += joke6;
        advanceAhaMoment(st, e6.firstUltAdvance || 1);
        entry.note = (entry.note ? entry.note + '；' : '') + '星魂6：首次终结技，阿哈行动提前 ' +
          Math.round((e6.firstUltAdvance || 1) * 100) + '%，笑点 +' + joke6;
      }
      /* 艺术壁垒回能统一在 executeAction 开头处理 */
    }
  }
  if (!entry) entry = newEntry(st, unit, action);
  entry.resources = { sp: round2(st.sp), joke: round2(st.joke), hidden: round2(unit.hidden), fervor: round2(unit.fervor || 0), goodReward: round2(unit.goodReward) };
  return entry;
}

// 光锥·稳赢：累计普攻次数，达到阈值后重置终结技触发次数
function noteBasicAttack(st, unit) {
  if (!unit.lc || unit.lc.id !== '23057') return;
  unit.lcBasicCount = (unit.lcBasicCount || 0) + 1;
  if (unit.lcBasicCount >= (lcParam(unit.lc, 3) || 3)) {
    unit.lcBasicCount = 0;
    unit.lcTrigUsed = false;
  }
}

// 火花互动陷阱
function fireTrap(st, unit, entry) {
  var tr = unit.def.kit.trap;
  var paid = spendSP(st, tr.spCost, unit);
  if (!st.cfg.options.infiniteSkillPoints && paid < tr.spCost) { entry.note = '战技点不足，互动陷阱未发动'; return 0; }
  unit.trapsUsed += 1;
  unit.trapBonus += tr.multiplierBonus;
  unit.trapAdjBonus += tr.adjacentBonus;
  if (st.cfg.options.deterministic) {
    // 理想轴按期望结算礼物：红红火火 +2 笑点 +2 战技点 / 恍恍惚惚 +1 笑点，各 50%
    var expJoke = 0, expSp = 0;
    for (var gi = 0; gi < tr.gift.length; gi++) {
      expJoke += (tr.gift[gi].weight || 0) * tr.gift[gi].joke;
      expSp += (tr.gift[gi].weight || 0) * (tr.gift[gi].sp || 0);
    }
    gainJoke(st, unit, expJoke);
    addSP(st, expSp);
    entry.note = '互动陷阱 x' + unit.trapsUsed + '（礼物期望：+' + expJoke + ' 笑点，+' + expSp + ' 战技点）';
    return 1;
  }
  var gift = Math.random() < tr.gift[1].weight ? tr.gift[1] : tr.gift[0];
  gainJoke(st, unit, gift.joke);
  addSP(st, gift.sp);
  entry.note = '互动陷阱 x' + unit.trapsUsed + '（' + gift.name + '：+' + gift.joke + ' 笑点' + (gift.sp ? '，+' + gift.sp + ' 战技点' : '') + '）';
  return 1;
}

// 真珠治疗 -> 阿哈行迹 t2 回愿力
function healTick(st, entry) {
  var aha = findUnit(st, '1511');
  if (aha && aha.def.traces.t2 && !aha.__healTriggered) {
    gainFervor(st, aha, aha.def.traces.t2.fervorOnHeal);
    aha.__healTriggered = true;
    entry.note = (entry.note ? entry.note + '；' : '') + '阿哈行迹·异想国 +1 愿力';
  }
}

// 行动提前（按剩余行动值的比例。原有调用保持这个口径）
function advanceUnit(st, unit, ratio) {
  if (!ratio) return;
  var remaining = unit.nextAV - st.av;
  unit.nextAV = st.av + remaining * (1 - Math.min(1, ratio));
}
// 阿哈时刻的行动提前：减去「比例 × 10000/速度」，与 engine2 advanceTimer、tests/v2/rotation.test.mjs 一致
function advanceAhaMoment(st, ratio) {
  var m = st.ahaMoment;
  if (!ratio || !m) return;
  var cut = Math.min(1, ratio) * 10000 / Math.max(1, m.spd || 1);
  m.nextAV = Math.max(st.av, m.nextAV - cut);
}

// 欢愉技（阿哈时刻内逐个施放）
function castElationSkill(st, unit, momentEntry) {
  var skill = unit.def.kit.elationSkills && unit.def.kit.elationSkills[0];
  if (!skill) return 0;
  for (var i = 0; i < unit.def.kit.elationSkills.length; i++) {
    var sk = unit.def.kit.elationSkills[i];
    if (!sk.multiplier && !sk.multiplierByCount && !sk.hiddenAdd) continue;
    if (unit.id === '1506' && sk.id === '150620' && unit.stance === 'invincible') continue;
    if (unit.id === '1506' && sk.id === '150621' && unit.stance !== 'invincible') continue;
    executeElationSkill(st, unit, momentEntry, sk);
  }
  return 1;
}

function executeElationSkill(st, unit, entry, sk) {
  var buffs = collectBuffs(st, unit, {});
  var joke = unit.goodReward + (st.cfg.options.goodRewardOnElationSkill ? st.joke : 0);
  // 银狼星魂 4：【崩坏级伤害演示】额外计入 5 倍笑点
  if (unit.id === '1506' && unit.eidolon >= 4 && sk.id === '150621') {
    joke = joke * unit.def.eidolons[4].jokeMultiplierOnElationSkill;
  }
  // 阿哈星魂 4：自身欢愉伤害额外计入队友【好活当赏】总和的 100%
  if (unit.id === '1511' && unit.eidolon >= 4 && unit.def.eidolons[4].countAlliesGoodReward) {
    var allySum = 0;
    for (var aq = 0; aq < st.order.length; aq++) if (st.order[aq] !== unit) allySum += st.order[aq].goodReward;
    joke += allySum;
  }
  if (unit.id === '1506' && sk.id === '150620') {
    gainHidden(st, unit, sk.hiddenAdd);
    entry.note = (entry.note ? entry.note + '；' : '') + '殿堂级操作回放 +' + sk.hiddenAdd + ' 隐藏分';
    return;
  }
  if (sk.hiddenAdd) gainHidden(st, unit, sk.hiddenAdd);
  var mult = sk.multiplier;
  if (sk.multiplierByCount) mult = sk.multiplierByCount[tierIndex(st.elationCount, [1, 2, 3, 4])];
  if (unit.id === '1503' && unit.eidolon >= 4) mult = mult * 2;
  var asc = (unit.id === '1501' && st.upgraded && unit.def.kit.innate) ? (1 + (unit.def.kit.innate.critDmg || 0)) : 1;
  if (asc !== 1) mult = mult * asc;
  if (sk.hits) {
    dealElation(st, unit, entry, { skillId: sk.id, skillName: sk.name, multiplier: mult, joke: joke, count: sk.hits });
  } else if (mult) {
    dealElation(st, unit, entry, { skillId: sk.id, skillName: sk.name, multiplier: mult, joke: joke, aoe: true });
  }
  if (sk.extraHits) {
    var extra = sk.extraMultiplier;
    if (asc !== 1) extra = extra * asc;
    if (unit.id === '1501' && unit.eidolon >= 6) extra = extra * (1 + 0);
    var extraCount = sk.extraHits + (unit.id === '1501' && unit.eidolon >= 6 ? Math.min(20, st.joke) : 0);
    dealElation(st, unit, entry, { skillId: sk.id, skillName: sk.name + '·额外伤害 x' + extraCount, multiplier: extra, joke: joke, count: extraCount });
  }
  if (sk.sparkAdd) unit.sparks += sk.sparkAdd;
  if (sk.id === '150621') {
    var wolf = unit;
    wolf.blindboxChance = wolf.def.kit.ult.blindbox.procChanceInit;
    entry.note = (entry.note ? entry.note + '；' : '') + '盲盒概率重置为 100%';
  }
  // 银狼行迹 a4：欢愉技计入笑点 >= 20 / >= 40 额外 +20 隐藏分
  if (unit.id === '1506' && unit.def.traces.a4) {
    var a4 = unit.def.traces.a4;
    if (joke >= a4.jokeTiers[1]) gainHidden(st, unit, a4.hiddenPerTier * 2);
    else if (joke >= a4.jokeTiers[0]) gainHidden(st, unit, a4.hiddenPerTier);
  }
  // 阿哈欢愉技：按本次阿哈时刻总伤害比例造成真实伤害
  if (unit.id === '1511' && sk.trueRatio) {
    var ratio = unit.eidolon >= 4 ? sk.trueRatioE4 : sk.trueRatio;
    var ref = entry.damage || st.currentMomentDamage || 0;
    dealTrue(st, unit, entry, ratio, ref, '欢愉技·真实伤害（阿哈时刻总伤害 ' + round2(ref) + '）');
  }
  if (sk.fervor) gainFervor(st, unit, sk.fervor);
  unit.energy += sk.energy || 0;
  // 光锥·挥墨（真珠）：对我方全体施放欢愉技时，敌方全体易伤 + 固定回能
  if (unit.id === '1503' && sk.id === '150320' && unit.lc && unit.lc.id === '23055') {
    st.lcVulnTurns = lcParam(unit.lc, 2) || 3;
    var lcEnergy = lcParam(unit.lc, 1) || 0;
    unit.energy = Math.min(unit.energyMax, unit.energy + lcEnergy);
    entry.note = (entry.note ? entry.note + '；' : '') + '光锥·挥墨：敌方易伤 +' +
      Math.round(lcParam(unit.lc, 3) * 1000) / 10 + '%（' + st.lcVulnTurns + ' 回合），回能 +' + lcEnergy;
  }
}

// ============================================================================
// 阿哈时刻 + 主循环
// ============================================================================

function tickTurnStart(st, unit) {
  if (unit.goodRewardTurns > 0) {
    unit.goodRewardTurns -= 1;
    if (unit.goodRewardTurns <= 0) {
      var infinite = unit.def.kit.talent && unit.def.kit.talent.infiniteDuration;
      if (!infinite) unit.goodReward = 0;
    }
  }
  var pearl = findUnit(st, '1503');
  if (pearl && pearl.def.traces.t2) {
    if (unit.id === '1503') {
      pearl.__roundGood = 0;
    } else if ((pearl.__roundGood || 0) < pearl.def.traces.t2.goodRewardPerRound) {
      gainGoodReward(st, pearl, pearl.def.traces.t2.goodRewardPerAllyTurn);
      pearl.__roundGood = (pearl.__roundGood || 0) + pearl.def.traces.t2.goodRewardPerAllyTurn;
    }
  }
  if (unit.id === '1511') {
    if (st.ahaStanceTurnsLeft > 0) st.ahaStanceTurnsLeft -= 1;
    if (unit.critDmgTurns > 0) unit.critDmgTurns -= 1;
    unit.__healTriggered = false;
  }
  if (unit.id === '1501') {
    if (unit.tempElationTurns > 0) unit.tempElationTurns -= 1;
    unit.lcTurnSpend = 0;                                  // 光锥·瞩目：按回合统计消耗
    if (unit.lcPushTurns > 0) unit.lcPushTurns -= 1;        // 【推流】持续回合
  }
  if (unit.id === '1503' && st.lcVulnTurns > 0) st.lcVulnTurns -= 1;   // 光锥·挥墨易伤计时
  if (unit.id === '1511' && st.lcAhaCd > 0) st.lcAhaCd -= 1;           // 光锥·即兴巡演冷却
  var aha = findUnit(st, '1511');
  if (aha && unit.isLord && aha.def.kit.skill.lordFervor) {
    gainFervor(st, aha, aha.def.kit.skill.lordFervor);
  }
  if (aha && st.joke >= aha.def.kit.talent.jokeThreshold && !aha.__jokeThresholdDone) {
    aha.__jokeThresholdDone = true;
    gainFervor(st, aha, 1);
    aha.critDmgTurns = aha.def.kit.talent.critDmgTurns;
  }
}

function executeAhaMoment(st) {
  var m = st.ahaMoment;
  var entry = newEntry(st, { id: 'aha', name: '阿哈时刻' }, '阿哈时刻', '全体可施放欢愉技的角色依次施放欢愉技');
  entry.actorId = 'aha';
  var counted = st.joke;
  st.currentMomentDamage = 0;
  for (var i = 0; i < st.order.length; i++) {
    var u = st.order[i];
    if (u.enabled) castElationSkill(st, u, entry);
    st.currentMomentDamage = entry.damage;
  }
  for (var j = 0; j < st.order.length; j++) {
    gainGoodReward(st, st.order[j], counted);
  }
  entry.note = (entry.note ? entry.note + '；' : '') +
    '计入笑点 ' + round2(counted) + ' -> 全体好活当赏 +' + round2(counted) + '；阿哈行动后清空笑点';
  var spark = findUnit(st, '1501');
  if (spark) {
    if (spark.eidolon >= 1) {
      gainJoke(st, spark, spark.def.eidolons[1].jokeOnAhaMoment);
      entry.note += '；星魂1 +' + spark.def.eidolons[1].jokeOnAhaMoment + ' 笑点';
    }
    if (spark.eidolon >= 2) {
      spark.sparks += spark.def.eidolons[2].sparkOnAhaMoment;
      advanceUnit(st, spark, 1.0);
      entry.note += '；星魂2 获得额外回合与 ' + spark.def.eidolons[2].sparkOnAhaMoment + ' 爆点';
    }
  }
  st.joke = 0;
  m.nextAV += 10000 / m.spd;
  recordSeries(st);
  return entry;
}

function recordSeries(st) {
  var wolf = findUnit(st, '1506');
  var aha = findUnit(st, '1511');
  var pearl = findUnit(st, '1503');
  st.series.push({
    av: round2(st.av), joke: round2(st.joke), sp: round2(st.sp),
    hidden: wolf ? round2(wolf.hidden) : 0,
    fervor: aha ? round2(aha.fervor) : 0,
    goodReward: round2(pearl ? pearl.goodReward : 0)
  });
}

function deepMerge(base, over) {
  if (!over || typeof over !== 'object') return base;
  var out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
  for (var k in over) {
    if (!Object.prototype.hasOwnProperty.call(over, k)) continue;
    var v = over[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && base && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// 某角色各槽位的默认基础等级（= 行迹节点上限），供 UI / CLI 展示
export function defaultSkillLevels(id) {
  var out = {};
  var slots = SKILL_SLOTS[id] || {};
  for (var slot in slots) {
    // innate（固有行迹）等级由「命途升格 + 阿哈 2 魂」决定，不作为用户可调的基础等级
    if (slot === 'maze' || slot === 'innate') continue;
    out[slot] = SKILL_BASE_CAPS[slots[slot][0]] || 10;
  }
  return out;
}

export function normalizeConfig(config) {
  return deepMerge(defaultConfig(), config || {});
}

export function simulate(config) {
  var cfg = normalizeConfig(config);
  cfg.options.deterministic = true;
  var st = initState(cfg);
  st.byType = { elation: 0, normal: 0, true: 0 };
  var horizon = num(cfg.duration.firstCycleAV, FIRST_CYCLE_AV) +
                (Math.max(1, num(cfg.duration.cycles, 3)) - 1) * num(cfg.duration.avPerCycle, CYCLE_AV);
  st.horizon = horizon;
  var guard = 0;
  while (guard++ < 20000) {
    var next = null;
    for (var i = 0; i < st.order.length; i++) {
      var u = st.order[i];
      if (!next || u.nextAV < next.nextAV) next = u;
    }
    if (!next || st.ahaMoment.nextAV < next.nextAV) next = st.ahaMoment;
    if (next.nextAV > horizon) break;
    st.av = next.nextAV;
    if (next.isAhaMoment) {
      executeAhaMoment(st);
    } else {
      tickTurnStart(st, next);
      next.nextAV += 10000 / next.spd;
      executeAction(st, next, chooseAction(st, next));
      recordSeries(st);
    }
  }
  var byCharacter = [];
  var total = 0;
  for (var k = 0; k < st.order.length; k++) {
    total += st.order[k].damage;
    byCharacter.push({ id: st.order[k].id, name: st.order[k].name, damage: round2(st.order[k].damage),
                       hits: st.order[k].hits, share: 0 });
  }
  for (var b2 = 0; b2 < byCharacter.length; b2++) {
    byCharacter[b2].share = total > 0 ? byCharacter[b2].damage / total : 0;
  }
  var cycles = Math.max(1, num(cfg.duration.cycles, 3));
  var warnings = buildWarnings(st, cfg);
  return {
    ok: true,
    engineVersion: ENGINE_VERSION,
    config: cfg,
    summary: {
      totalDamage: round2(total),
      dps: round2(total / Math.max(1, horizon) * 100),
      damagePerCycle: round2(total / cycles),
      durationAV: round2(horizon),
      cycles: cycles,
      hitCount: st.log.reduce(function (a, e) { return a + e.hits.length; }, 0),
      actionCount: st.log.length,
      ahaMoments: st.log.filter(function (e) { return e.actorId === 'aha'; }).length,
      elationCount: st.elationCount,
      ahaSpeed: st.ahaMoment.spd,
      byCharacter: byCharacter,
      byType: [
        { type: 'elation', label: '欢愉伤害', damage: round2(st.byType.elation) },
        { type: 'normal', label: '常规伤害', damage: round2(st.byType.normal) },
        { type: 'true', label: '真实伤害', damage: round2(st.byType.true) }
      ]
    },
    timeline: st.log.map(function (e) {
      return { seq: e.seq, av: e.av, actorId: e.actorId, actor: e.actor, action: e.action,
               description: e.description, damage: round2(e.damage), note: e.note || '',
               hits: e.hits.map(function (h) {
                 return { skillId: h.skillId, skillName: h.skillName, kind: h.kind,
                          multiplier: h.multiplier, hits: h.hits, joke: h.joke,
                          elationDegree: h.elationDegree, crit: h.crit, damage: round2(h.damage),
                          sources: (h.sources || []).slice() };   // 该段伤害生效的乘区来源
               }) };
    }),
    resources: { series: st.series, final: st.series.length ? st.series[st.series.length - 1] : null },
    warnings: warnings,
    assumptions: ASSUMPTIONS
  };
}

function buildWarnings(st, cfg) {
  var w = [];
  var wolf = findUnit(st, '1506');
  var pearl = findUnit(st, '1503');
  var aha = findUnit(st, '1511');
  var spark = findUnit(st, '1501');
  if (wolf && wolf.damage === 0) w.push('银狼LV.999 未造成伤害：可能隐藏分不足 60（战技点受限或回合数太少）');
  if (pearl && pearl.energy < pearl.energyMax) w.push('真珠在模拟结束时仍未攒满 180 能量，终结技未循环');
  if (wolf && wolf.stance !== 'invincible' && wolf.hidden < wolf.def.kit.talent.hiddenThreshold) {
    w.push('银狼LV.999 全程未进入【无敌玩家】（隐藏分 ' + Math.round(wolf.hidden) + '/60）——可增加轮数或提高速度/战技点');
  }
  if (aha && st.upgraded === false) w.push('星神★阿哈未施放终结技，【欢愉万相】与命途升格未激活');
  if (spark && spark.linkOpen) w.push('火花连线结束时仍有未消耗的互动陷阱');
  if (!cfg.options.infiniteSkillPoints && st.sp === 0) w.push('模拟结束时战技点为 0，完美轴可能因战技点不足损失层数（可勾选「无限战技点」查看上限）');
  if (st.elationCount < 4) w.push('队伍欢愉命途角色少于 4 人，真珠的额外回合与最高档倍率无法激活');
  return w;
}

export const ASSUMPTIONS = [
  '欢愉伤害公式：倍率 x 7535.107 x (1+欢愉度) x (1+笑点x5/(笑点+240)) x 暴击区 x 易伤区 x 抗性区 x 韧性减伤区 x 防御区 x (1+增笑)；不吃攻击力、生命与增伤。',
  '常规伤害使用标准公式（攻击力/防御力 x 倍率 x 增伤 x 暴击 x 防御区 x 抗性区 x 韧性区）。',
  '好活当赏层数 = 阿哈时刻计入的笑点；欢愉技同时吃好活当赏与当前笑点（可在配置中关闭）。',
  '阿哈时刻速度 = 80（经 unique 覆盖为阿哈自身速度）+ 队伍最快速度/5 + 次快/10 + 第三/20 + 第四/40。',
  '理想轴：必定暴击、盲盒固定触发（概率衰减仍生效）、礼物取主流选项、资源按完美轴分配。',
  '真珠的抵御值消耗不影响好活当赏层数（数据未说明二者是否同池），因此按层数不衰减处理。',
  '单目标环境（targetCount=1）；群攻技能对每个目标结算，由全体均分的技能按总量计。',
  '未建模：治疗量与生存、欢愉负债的逐次结算、击破流程、敌方行动造成的影响。'
];


