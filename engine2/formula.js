// engine2/formula.js —— 复制自 engine/formula.js（v1 保持不动），并追加击破/超击破公式。
// 保持自包含以便单文件打包。
// ============================================================================
// 伤害乘区实现（欢愉伤害 / 常规伤害 / 真实伤害）
// 依据：
//   1) 站点数据 hsr.nanoka.cc 4.6.51（技能倍率、行迹、星魂）
//   2) 公开乘区拆解：欢愉伤害 = 倍率 x 7535.107 x (1+欢愉度) x (1+笑点x5/(笑点+240))
//      x 暴击区 x 易伤区 x 抗性区 x 韧性减伤区 x 防御区 x (1+增笑)
//      回归样例（0.2 倍率 / 120% 欢愉度 / 2 笑点 / 127.4% 暴伤 / 26% 易伤 /
//      20% 抗性 / 10% 韧性减伤 / 攻方 80 级 / 受方 76 级）约等于 3633.83
// 说明：欢愉伤害不吃攻击力、生命、增伤（伤害提高）类效果，只吃上面的乘区。
// ============================================================================

export const ELATION_BASE_VALUE = 7535.107;   // 80 级角色固定基础值
export const DEF_BASE = 200;                  // 防御常数
export const DEF_PER_LEVEL = 10;              // 每级防御系数
export const JOKE_K = 5;                      // 笑点乘区系数
export const JOKE_C = 240;                    // 笑点乘区常数

export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// 防御区：(200 + 攻方等级 x 10) / [(200 + 攻方等级 x 10) + (200 + 受方等级 x 10) x (1 - 减防 - 无视防御)]
export function defenseRegion(attackerLevel, targetLevel, defShred, defIgnore, defBase, defPerLevel) {
  var b = defBase === undefined ? DEF_BASE : defBase;
  var p = defPerLevel === undefined ? DEF_PER_LEVEL : defPerLevel;
  var a = b + attackerLevel * p;
  var d = (b + targetLevel * p) * (1 - clamp((defShred || 0) + (defIgnore || 0), 0, 1));
  return a / (a + d);
}

// 抗性区：1 - (基础抗性 - 减抗 - 抗性穿透)；有效抗性限制在 [-100%, 90%]，即抗性区 ∈ [0.1, 2]
// 依据：Fandom「Damage RES」—— "Damage RES ranges between -100% and 90%. Therefore, RES Multiplier ranges between 10% and 200%."
export var RES_MIN = -1, RES_MAX = 0.9;
export function resistanceRegion(res, shred) {
  return 1 - clamp((res || 0) - (shred || 0), RES_MIN, RES_MAX);
}

// 笑点 / 好活当赏区：1 + (笑点 x k) / (笑点 + c)，区间 (1, 1+k)
export function jokeRegion(joke, k, c) {
  var kk = k === undefined ? JOKE_K : k;
  var cc = c === undefined ? JOKE_C : c;
  var j = Math.max(0, joke || 0);
  return 1 + (j * kk) / (j + cc);
}

// 暴击区：理想轴（必定暴击）为 1 + 暴伤；期望值模式为 1 + 暴击率 x 暴伤
export function critRegion(critRate, critDmg, alwaysCrit) {
  return alwaysCrit ? (1 + (critDmg || 0)) : (1 + (critRate || 0) * (critDmg || 0));
}

// 韧性减伤区：未击破时通常有 10% 减伤，击破后为 0
export function toughnessRegion(toughnessDR, broken) {
  return broken ? 1 : (1 - (toughnessDR || 0));
}

// 易伤区：同类加算
export function vulnerabilityRegion(list) {
  var s = 0;
  for (var i = 0; i < list.length; i++) s += list[i] || 0;
  return 1 + s;
}

// 增笑区：目前仅存在于部分星魂
export function amplificationRegion(list) {
  var s = 0;
  for (var i = 0; i < list.length; i++) s += list[i] || 0;
  return 1 + s;
}

// 欢愉伤害
export function elationHit(p) {
  var base = (p.baseValue === undefined ? ELATION_BASE_VALUE : p.baseValue);
  var dmg = (p.multiplier || 0) * base;
  dmg *= (1 + (p.elationDegree || 0));
  dmg *= jokeRegion(p.joke, p.jokeK, p.jokeC);
  dmg *= critRegion(p.critRate, p.critDmg, p.alwaysCrit);
  dmg *= vulnerabilityRegion(p.vulnerability || []);
  dmg *= resistanceRegion(p.res, p.resShred);
  dmg *= toughnessRegion(p.toughnessDR, p.broken);
  dmg *= defenseRegion(p.attackerLevel, p.targetLevel, p.defShred, p.defIgnore, p.defBase, p.defPerLevel);
  dmg *= amplificationRegion(p.amplification || []);
  dmg *= (p.finalMultiplier === undefined ? 1 : p.finalMultiplier);
  return { damage: dmg, kind: 'elation' };
}

// 常规伤害（攻击力 / 防御力 / 生命值 缩放，吃增伤与攻击力）
export function normalHit(p) {
  var scale = p.scalingValue || 0;
  var dmg = scale * (p.multiplier || 0) + (p.flat || 0);
  dmg *= (1 + (p.dmgBonus || 0));
  dmg *= critRegion(p.critRate, p.critDmg, p.alwaysCrit);
  dmg *= vulnerabilityRegion(p.vulnerability || []);
  dmg *= resistanceRegion(p.res, p.resShred);
  dmg *= toughnessRegion(p.toughnessDR, p.broken);
  dmg *= defenseRegion(p.attackerLevel, p.targetLevel, p.defShred, p.defIgnore, p.defBase, p.defPerLevel);
  dmg *= (p.finalMultiplier === undefined ? 1 : p.finalMultiplier);
  return { damage: dmg, kind: 'normal' };
}

// 真实伤害：不受任何效果影响（按参考伤害的比例结算）
export function trueDamage(ratio, referenceDamage) {
  return { damage: (ratio || 0) * (referenceDamage || 0), kind: 'true' };
}

// ============================================================================
// v2 追加：击破 / 超击破 / 抗性等辅助（§5）
// 注意：韧性单位沿用站点数据（show_stance_list 普攻=30，敌人 stance_base 精英=300），
// 即社区常用单位的 3 倍，故 (0.5 + 韧性上限/40) 中的韧性按 数据值/3 代入。
// ============================================================================

export const BREAK_BASE_LV80 = 3767.5533;
export const TOUGHNESS_UNIT = 3;              // 数据单位 / 社区单位
export const BREAK_ELEMENT_COEF = { Physical: 2, Fire: 2, Wind: 1.5, Thunder: 1, Ice: 1, Quantum: 0.5, Imaginary: 0.5 };

// 击破伤害（不吃暴击/增伤），maxToughness 为数据单位（÷3 = 游戏显示韧性，如可可利亚 540 → 180）
// broken=false → ×0.9：Fandom「Toughness」—— "As long as the enemy is not Weakness Broken, all incoming DMG will be
// multiplied by 0.9, including the Break DMG from Toughness depletion."（sim 在削韧归零时按未击破 0.9 结算）
export function breakHit(p) {
  var coef = BREAK_ELEMENT_COEF[p.element] || 1;
  var dmg = coef * BREAK_BASE_LV80 * (0.5 + (p.maxToughness || 0) / TOUGHNESS_UNIT / 40);
  dmg *= (1 + (p.breakEffect || 0));
  dmg *= vulnerabilityRegion(p.vulnerability || []);
  dmg *= resistanceRegion(p.res, p.resShred);
  dmg *= defenseRegion(p.attackerLevel, p.targetLevel, p.defShred, p.defIgnore);
  dmg *= (p.broken ? 1 : 0.9);
  dmg *= (p.finalMultiplier === undefined ? 1 : p.finalMultiplier);
  return { damage: dmg, kind: 'break' };
}

// 超击破：3767.5533 × 削韧(社区单位)/10 × 超击破倍率 × (1+击破特攻) × 易伤 × 抗性 × 防御 × 韧性区(已击破=1)
export function superBreakHit(p) {
  var dmg = BREAK_BASE_LV80 * ((p.toughnessReduced || 0) / TOUGHNESS_UNIT / 10) * (p.superBreak || 0);
  dmg *= (1 + (p.breakEffect || 0));
  dmg *= vulnerabilityRegion(p.vulnerability || []);
  dmg *= resistanceRegion(p.res, p.resShred);
  dmg *= defenseRegion(p.attackerLevel, p.targetLevel, p.defShred, p.defIgnore);
  return { damage: dmg, kind: 'superBreak' };
}
