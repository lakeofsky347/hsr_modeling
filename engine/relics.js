// ============================================================================
// 遗器：面板属性（主词条 + 副词条 + 2 件套）与套装机制（4 件套 / 2 件套条件效果）
// 数据源：engine/relicdata.js（由 scripts/gen_relic_data.mjs 从站点数据生成）
// 说明：
//   * 主词条按 5★ 遗器满级（+15）标准值计入
//   * 副词条按「有效词条数 × 中位数值」折算，分配比例沿用站点给出的副词条优先级
//   * 4 件套/条件型 2 件套在 collectBuffs 中按战斗状态结算
// ============================================================================
import { RELICS, RECOMMENDED_RELICS } from './relicdata.js';

export { RELICS, RECOMMENDED_RELICS };

// 5★ 遗器满级主词条数值
export const MAIN_STAT_VALUES = {
  '暴击率': { critRate: 0.324 }, '暴击伤害': { critDmg: 0.648 },
  '攻击力百分比': { atkPct: 0.432 }, '生命值百分比': { hpPct: 0.432 }, '防御力百分比': { defPct: 0.54 },
  '速度': { spdFlat: 25.032 }, '治疗量加成': { healBonus: 0.3456 }, '能量恢复效率': { energyRegen: 0.1944 },
  '效果命中': { statusHit: 0.432 }, '击破特攻': { breakEffect: 0.648 },
  '物理属性伤害提高': { dmgBonus: 0.3888 }, '火属性伤害提高': { dmgBonus: 0.3888 },
  '冰属性伤害提高': { dmgBonus: 0.3888 }, '雷属性伤害提高': { dmgBonus: 0.3888 },
  '风属性伤害提高': { dmgBonus: 0.3888 }, '量子属性伤害提高': { dmgBonus: 0.3888 },
  '虚数属性伤害提高': { dmgBonus: 0.3888 }
};

// 副词条中位数值（1 个有效词条）
export const SUBSTAT_VALUES = {
  '暴击率': { critRate: 0.0292 }, '暴击伤害': { critDmg: 0.0583 },
  '攻击力百分比': { atkPct: 0.0389 }, '生命值百分比': { hpPct: 0.0389 }, '防御力百分比': { defPct: 0.0486 },
  '速度': { spdFlat: 2.0 }, '效果命中': { statusHit: 0.0345 }, '效果抵抗': { statusRes: 0.0345 },
  '击破特攻': { breakEffect: 0.0518 }
};

// 各套装的机制定义（只覆盖四个角色推荐列表中的 16 套）
// stats：无条件并入面板；cond：战斗中的条件效果（在 relicBuffs 中解释）
export const RELIC_EFFECTS = {
  '129': { stats: { critDmg: 0.16 },
           cond: { id: 'elationDefIgnore', base: 0.10, per: 0.01, jokeStep: 5, maxStacks: 10 },
           note: '4 件套：欢愉伤害无视 10% 防御，每累计获得 5 点笑点再 +1%（最多 10 层）' },
  '126': { stats: { critDmg: 0.16 },
           cond: { id: 'atkPctAfterUlt', atkPct: 0.48, turns: 1 },
           note: '4 件套：施放终结技时若持有 2 层【助力】，攻击力 +48%（1 回合）' },
  '133': { stats: { spdPct: 0.06 },
           cond: { id: 'castOnAlly', allyElation: 0.16, allyElationTurns: 3, teamCritDmg: 0.12, teamCritDmgTurns: 3, goodRewardNeed: 10 },
           note: '4 件套：对我方单体施放战技/终结技时目标欢愉度 +16%（3 回合）；好活当赏 ≥10 时全队暴伤 +12%（3 回合）' },
  '130': { stats: { spdPct: 0.06 },
           cond: { id: 'spdCritRate', tiers: [ { spd: 120, critRate: 0.10 }, { spd: 160, critRate: 0.18 } ], firstElationTeamElation: 0.10 },
           note: '4 件套：速度 ≥120/160 时暴击率 +10%/+18%；首次施放欢愉技时全队欢愉度 +10%' },
  '114': { stats: { spdPct: 0.06 },
           cond: { id: 'ultOnAllyTeamSpd', spdPct: 0.12, turns: 1 },
           note: '4 件套：对我方目标施放终结技时全队速度 +12%（1 回合）' },
  '121': { stats: { spdPct: 0.06 },
           cond: { id: 'castOnAllyCritDmg', critDmg: 0.18, turns: 2, maxStacks: 2 },
           note: '4 件套：对我方单体施放战技/终结技时目标暴伤 +18%（2 回合，最多 2 层）' },
  '112': { stats: { dmgBonus: 0.10 },
           cond: { id: 'debuffCrit', critRate: 0.10, critDmg: 0.20 },
           note: '4 件套：对陷入负面效果的敌人暴击率 +10%（禁锢时暴伤 +20%）' },
  '325': { stats: { elationDegree: 0.08 },
           cond: { id: 'elationTierCritDmg', tiers: [ { elation: 0.40, critDmg: 0.20 }, { elation: 0.80, critDmg: 0.32 } ] },
           note: '2 件套：欢愉度 +8%；战斗中欢愉度首次达到 40%/80% 时暴伤 +20%/+32%' },
  '313': { stats: { critRate: 0.04 },
           cond: { id: 'killStacksCritDmg', per: 0.04, maxStacks: 10 },
           note: '2 件套：暴击率 +4%；敌方被消灭时暴伤 +4%（最多 10 层）' },
  '324': { stats: { critDmg: 0.16 },
           cond: { id: 'spend3CritDmg', spend: 3, critDmg: 0.32, turns: 3 },
           note: '2 件套：暴伤 +16%；同回合消耗 ≥3 战技点时再 +32% 暴伤（3 回合）' },
  '329': { stats: { spdPct: 0.06 },
           cond: { id: 'elationAdvance', elationNeed: 0.40, advance: 0.40 },
           note: '2 件套：速度 +6%；欢愉度 ≥40% 时进战立即行动提前 40%' },
  '308': { stats: { energyRegen: 0.05 },
           cond: { id: 'spdAdvance', spdNeed: 120, advance: 0.40 },
           note: '2 件套：能量恢复 +5%；速度 ≥120 时进战立即行动提前 40%' },
  '317': { stats: { energyRegen: 0.05 },
           cond: { id: 'firstAllyAtk', atkPct: 0.12 },
           note: '2 件套：能量恢复 +5%；非首位时使编队首位攻击力 +12%' },
  '310': { stats: { statusRes: 0.10 },
           cond: { id: 'resCritDmg', resNeed: 0.30, critDmg: 0.10 },
           note: '2 件套：效果抵抗 +10%；效果抵抗 ≥30% 时全队暴伤 +10%' },
  '318': { stats: { critDmg: 0.16 },
           cond: { id: 'summonCritDmg', critDmg: 0.32 },
           note: '2 件套：暴伤 +16%；存在召唤物时再 +32%' },
  '309': { stats: { critRate: 0.08 },
           cond: { id: 'critRateDmgBonus', critRateNeed: 0.70, dmgBonus: 0.20 },
           note: '2 件套：暴击率 +8%；暴击率 ≥70% 时普攻与战技伤害 +20%（只影响常规伤害）' }
};

const WEIGHTS = [0.5, 0.3, 0.2];

// 解析某角色的遗器配置
export function resolveRelics(avatarId, charCfg) {
  var conf = (charCfg && charCfg.relics) || {};
  var rec = RECOMMENDED_RELICS[avatarId] || { set4: [], set2: [], mainStats: [], subStats: [] };
  if (conf.enabled === false) return null;
  var set4 = String(conf.set4 || rec.set4[0] || '');
  var set2 = String(conf.set2 || rec.set2[0] || '');
  return {
    set4: set4, set2: set2,
    set4Name: RELICS[set4] ? RELICS[set4].name : '',
    set2Name: RELICS[set2] ? RELICS[set2].name : '',
    mainStats: conf.mainStats === false ? [] : (rec.mainStats || []),
    substatRolls: conf.substatRolls === undefined ? 20 : Number(conf.substatRolls),
    subStats: rec.subStats || [],
    effects4: RELIC_EFFECTS[set4] || null,
    effects2: RELIC_EFFECTS[set2] || null,
    recommended: rec
  };
}

function addTo(bonus, key, v) { bonus[key] = (bonus[key] || 0) + v; }

// 面板加成：主词条 + 副词条 + 两套的无条件 stats
export function relicPanelBonus(rc) {
  var bonus = { atkPct: 0, hpPct: 0, defPct: 0, critRate: 0, critDmg: 0, spdFlat: 0, spdPct: 0,
                elationDegree: 0, dmgBonus: 0, energyRegen: 0, statusRes: 0, healBonus: 0, sources: [] };
  if (!rc) return bonus;
  // 主词条
  for (var i = 0; i < rc.mainStats.length; i++) {
    var m = rc.mainStats[i];
    var mv = MAIN_STAT_VALUES[m.prop];
    if (!mv) continue;
    for (var k in mv) addTo(bonus, k, mv[k]);
    bonus.sources.push('主词条·' + m.slot + ' ' + m.prop);
  }
  // 副词条（按优先级加权分配有效词条数）
  var rolls = Math.max(0, rc.substatRolls || 0);
  var list = rc.subStats.slice(0, 3);
  var wsum = 0;
  for (var w = 0; w < list.length; w++) wsum += WEIGHTS[w];
  for (var j = 0; j < list.length; j++) {
    var n = rolls * (WEIGHTS[j] / wsum);
    var sv = SUBSTAT_VALUES[list[j]];
    if (!sv) continue;
    for (var k2 in sv) addTo(bonus, k2, sv[k2] * n);
    bonus.sources.push('副词条·' + list[j] + ' ×' + (Math.round(n * 10) / 10));
  }
  // 套装无条件属性
  [rc.effects4, rc.effects2].forEach(function (e) {
    if (!e || !e.stats) return;
    for (var k3 in e.stats) addTo(bonus, k3, e.stats[k3]);
  });
  return bonus;
}

// 把遗器面板加成并入单位属性（百分比乘算，速度在最后统一处理）
export function applyRelicStats(unit, bonus) {
  if (!bonus) return;
  unit.stats.atk *= (1 + (bonus.atkPct || 0));
  unit.stats.hp *= (1 + (bonus.hpPct || 0));
  unit.stats.def *= (1 + (bonus.defPct || 0));
  unit.stats.critRate += (bonus.critRate || 0);
  unit.stats.critDmg += (bonus.critDmg || 0);
  unit.stats.elationDegree += (bonus.elationDegree || 0);
  unit.stats.spd += (bonus.spdFlat || 0);
  unit.stats.spd *= (1 + (bonus.spdPct || 0));
  unit.stats.atk = Math.round(unit.stats.atk * 10) / 10;
  unit.stats.def = Math.round(unit.stats.def * 10) / 10;
  unit.stats.hp = Math.round(unit.stats.hp * 10) / 10;
  unit.stats.spd = Math.round(unit.stats.spd * 100) / 100;
  unit.stats.critRate = Math.round(unit.stats.critRate * 10000) / 10000;
  unit.stats.critDmg = Math.round(unit.stats.critDmg * 10000) / 10000;
  unit.stats.elationDegree = Math.round(unit.stats.elationDegree * 10000) / 10000;
  unit.dmgBonus = (unit.dmgBonus || 0) + (bonus.dmgBonus || 0);
  unit.energyRegen = (unit.energyRegen || 0) + (bonus.energyRegen || 0);
  unit.statusRes = (unit.statusRes || 0) + (bonus.statusRes || 0);
  unit.relicSources = (bonus.sources || []).slice();
}

// 遗器一览（UI 用）
export function relicInfo(avatarId, cfg) {
  var charCfg = cfg && cfg.characters ? cfg.characters[avatarId] : null;
  var rc = resolveRelics(avatarId, charCfg);
  var rec = RECOMMENDED_RELICS[avatarId] || { set4: [], set2: [] };
  var out = [];
  if (rc) {
    out.push({ slot: 'set4', id: rc.set4, name: rc.set4Name, effects: rc.effects4,
               data: RELICS[rc.set4] || null, equipped: true });
    out.push({ slot: 'set2', id: rc.set2, name: rc.set2Name, effects: rc.effects2,
               data: RELICS[rc.set2] || null, equipped: true });
  }
  return { current: rc, options4: rec.set4, options2: rec.set2, list: out };
}
