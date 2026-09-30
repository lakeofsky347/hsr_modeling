/* 由 scripts/build-ui.mjs 自动生成，请勿手改；改 engine/*.js 后重新构建 */
(function () {
"use strict";

/* ===== formula.js ===== */
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

const ELATION_BASE_VALUE = 7535.107;   // 80 级角色固定基础值
const DEF_BASE = 200;                  // 防御常数
const DEF_PER_LEVEL = 10;              // 每级防御系数
const JOKE_K = 5;                      // 笑点乘区系数
const JOKE_C = 240;                    // 笑点乘区常数

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// 防御区：(200 + 攻方等级 x 10) / [(200 + 攻方等级 x 10) + (200 + 受方等级 x 10) x (1 - 减防 - 无视防御)]
function defenseRegion(attackerLevel, targetLevel, defShred, defIgnore, defBase, defPerLevel) {
  var b = defBase === undefined ? DEF_BASE : defBase;
  var p = defPerLevel === undefined ? DEF_PER_LEVEL : defPerLevel;
  var a = b + attackerLevel * p;
  var d = (b + targetLevel * p) * (1 - clamp((defShred || 0) + (defIgnore || 0), 0, 1));
  return a / (a + d);
}

// 抗性区：1 - (基础抗性 - 减抗 - 抗性穿透)；可为负抗性，此时大于 1
function resistanceRegion(res, shred) {
  return 1 - clamp((res || 0) - (shred || 0), -1.5, 1);
}

// 笑点 / 好活当赏区：1 + (笑点 x k) / (笑点 + c)，区间 (1, 1+k)
function jokeRegion(joke, k, c) {
  var kk = k === undefined ? JOKE_K : k;
  var cc = c === undefined ? JOKE_C : c;
  var j = Math.max(0, joke || 0);
  return 1 + (j * kk) / (j + cc);
}

// 暴击区：理想轴（必定暴击）为 1 + 暴伤；期望值模式为 1 + 暴击率 x 暴伤
function critRegion(critRate, critDmg, alwaysCrit) {
  return alwaysCrit ? (1 + (critDmg || 0)) : (1 + (critRate || 0) * (critDmg || 0));
}

// 韧性减伤区：未击破时通常有 10% 减伤，击破后为 0
function toughnessRegion(toughnessDR, broken) {
  return broken ? 1 : (1 - (toughnessDR || 0));
}

// 易伤区：同类加算
function vulnerabilityRegion(list) {
  var s = 0;
  for (var i = 0; i < list.length; i++) s += list[i] || 0;
  return 1 + s;
}

// 增笑区：目前仅存在于部分星魂
function amplificationRegion(list) {
  var s = 0;
  for (var i = 0; i < list.length; i++) s += list[i] || 0;
  return 1 + s;
}

// 欢愉伤害
function elationHit(p) {
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
function normalHit(p) {
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
function trueDamage(ratio, referenceDamage) {
  return { damage: (ratio || 0) * (referenceDamage || 0), kind: 'true' };
}


/* ===== skilltables.js ===== */
// 由 scripts/gen_skill_tables.mjs 自动生成（数据源 hsr.nanoka.cc 4.6.51），请勿手改
// levels[等级-1] = 该等级的参数数组（与技能描述里的 #1 #2 ... 一一对应）
const SKILL_TABLES = {"150101":{"name":"哑火了吗","type":"普攻","slot":"basic","levels":[[0.5],[0.6],[0.7],[0.8],[0.9],[1],[1.1],[1.2],[1.3],[1.4]]},"150102":{"name":"尖叫！火花花连线中","type":"战技","slot":"skill","levels":[[20,28,3,7,4],[20,28,3,7,4],[20,28,3,7,4],[20,28,3,7,4],[20,28,3,7,4],[20,28,3,7,4],[20,28,3,7,4],[20,28,3,7,4],[20,28,3,7,4],[20,28,3,7,4],[20,28,3,7,4],[20,28,3,7,4],[20,28,3,7,4],[20,28,3,7,4],[20,28,3,7,4]]},"150103":{"name":"万我狂欢，镜头不要停","type":"终结技","slot":"ult","levels":[[2,0.3,0.6],[2,0.32,0.6],[2,0.34,0.6],[2,0.36,0.6],[2,0.38,0.6],[2,0.4,0.6],[2,0.425,0.6],[2,0.45,0.6],[2,0.475,0.6],[2,0.5,0.6],[2,0.52,0.6],[2,0.54,0.6],[2,0.56,0.6],[2,0.58,0.6],[2,0.6,0.6]]},"150104":{"name":"幕后花手","type":"天赋","slot":"talent","levels":[[0.1,0.24,0.2,0.1],[0.11,0.264,0.22,0.11],[0.12,0.288,0.24,0.12],[0.13,0.312,0.26,0.13],[0.14,0.336,0.28,0.14],[0.15,0.36,0.3,0.15],[0.1625,0.39,0.325,0.1625],[0.175,0.42,0.35,0.175],[0.1875,0.45,0.375,0.1875],[0.2,0.48,0.4,0.2],[0.21,0.504,0.42,0.21],[0.22,0.528,0.44,0.22],[0.23,0.552,0.46,0.23],[0.24,0.576,0.48,0.24],[0.25,0.6,0.5,0.25]]},"150106":{"name":"攻击","type":"衍生","slot":null,"levels":[[]]},"150107":{"name":"流量变现","type":"秘技","slot":"maze","levels":[[2,0.5,10]]},"150108":{"name":"百花齐放，胜者独享！","type":"普攻","slot":"basic","levels":[[0.5,0.25],[0.6,0.3],[0.7,0.35],[0.8,0.4],[0.9,0.45],[1,0.5],[1.1,0.55],[1.2,0.6],[1.3,0.65],[1.4,0.7]]},"150109":{"name":"互动陷阱","type":"战技","slot":"skill","levels":[[2,1,2,0.1,0.05],[2,1,2,0.11,0.055],[2,1,2,0.12,0.06],[2,1,2,0.13,0.065],[2,1,2,0.14,0.07],[2,1,2,0.15,0.075],[2,1,2,0.1625,0.08125],[2,1,2,0.175,0.0875],[2,1,2,0.1875,0.09375],[2,1,2,0.2,0.1],[2,1,2,0.21,0.105],[2,1,2,0.22,0.11],[2,1,2,0.23,0.115],[2,1,2,0.24,0.12],[2,1,2,0.25,0.125]]},"150110":{"name":"百花齐放，胜者独享！","type":"普攻","slot":null,"levels":[[0.5,0.25],[0.6,0.3],[0.7,0.35],[0.8,0.4],[0.9,0.45],[1,0.5],[1.1,0.55],[1.2,0.6],[1.3,0.65],[1.4,0.7]]},"150120":{"name":"信号溢出：好戏返场！","type":"欢愉技","slot":"elationSkill","levels":[[0.125,0.25,20,2],[0.1375,0.275,20,2],[0.15,0.3,20,2],[0.1625,0.325,20,2],[0.175,0.35,20,2],[0.1875,0.375,20,2],[0.203125,0.40625,20,2],[0.21875,0.4375,20,2],[0.234375,0.46875,20,2],[0.25,0.5,20,2],[0.2625,0.525,20,2],[0.275,0.55,20,2],[0.2875,0.575,20,2],[0.3,0.6,20,2],[0.3125,0.625,20,2]]},"150129":{"name":"欢愉万相★兔子戏法","type":"固有行迹","slot":"innate","levels":[[0.15,10,1,8,0.3],[0.2,10,1,10,1.2]]},"150301":{"name":"行笔，临摹断水","type":"普攻","slot":"basic","levels":[[0.45],[0.54],[0.63],[0.72],[0.81],[0.9],[0.99],[1.08],[1.17],[1.26]]},"150302":{"name":"补缀生命的柔光","type":"战技","slot":"skill","levels":[[15,0.06,120],[15,0.066,132],[15,0.072,144],[15,0.078,156],[15,0.084,168],[15,0.09,180],[15,0.0975,195],[15,0.105,210],[15,0.1125,225],[15,0.12,240],[15,0.126,252],[15,0.132,264],[15,0.138,276],[15,0.144,288],[15,0.15,300]]},"150303":{"name":"鉴映灵魂的底色","type":"终结技","slot":"ult","levels":[[3,0.3,20,0.1,0.15,0.3,60,30],[3,0.33,20,0.1,0.15,0.3,60,30],[3,0.36,20,0.1,0.15,0.3,60,30],[3,0.39,20,0.1,0.15,0.3,60,30],[3,0.42,20,0.1,0.15,0.3,60,30],[3,0.45,20,0.1,0.15,0.3,60,30],[3,0.4875,20,0.1,0.15,0.3,60,30],[3,0.525,20,0.1,0.15,0.3,60,30],[3,0.5625,20,0.1,0.15,0.3,60,30],[3,0.6,20,0.1,0.15,0.3,60,30],[3,0.63,20,0.1,0.15,0.3,60,30],[3,0.66,20,0.1,0.15,0.3,60,30],[3,0.69,20,0.1,0.15,0.3,60,30],[3,0.72,20,0.1,0.15,0.3,60,30],[3,0.75,20,0.1,0.15,0.3,60,30]]},"150304":{"name":"吞纳沙砾，重塑生机","type":"天赋","slot":"talent","levels":[[0.5,0.6,50,0.15,200],[0.5,0.6,50,0.165,200],[0.5,0.6,50,0.18,200],[0.5,0.6,50,0.195,200],[0.5,0.6,50,0.21,200],[0.5,0.6,50,0.225,200],[0.5,0.6,50,0.24375,200],[0.5,0.6,50,0.2625,200],[0.5,0.6,50,0.28125,200],[0.5,0.6,50,0.3,200],[0.5,0.6,50,0.315,200],[0.5,0.6,50,0.33,200],[0.5,0.6,50,0.345,200],[0.5,0.6,50,0.36,200],[0.5,0.6,50,0.375,200]]},"150306":{"name":"攻击","type":"衍生","slot":null,"levels":[[]]},"150307":{"name":"凝润珠光，复刻真迹","type":"秘技","slot":"maze","levels":[[2,20]]},"150308":{"name":"行笔，幻造星月","type":"普攻","slot":"basic","levels":[[0.5,0.04,1,80,0.1],[0.6,0.048,1,96,0.11],[0.7,0.056,1,112,0.12],[0.8,0.064,1,128,0.13],[0.9,0.072,1,144,0.14],[1,0.08,1,160,0.15],[1.1,0.088,1,176,0.1625],[1.2,0.096,1,192,0.175],[1.3,0.104,1,208,0.1875],[1.4,0.112,1,224,0.2]]},"150310":{"name":"行笔，绘制末浪","type":"普攻","slot":"basic","levels":[[0.5,0.04,1,80],[0.6,0.048,1,96],[0.7,0.056,1,112],[0.8,0.064,1,128],[0.9,0.072,1,144],[1,0.08,1,160],[1.1,0.088,1,176],[1.2,0.096,1,192],[1.3,0.104,1,208],[1.4,0.112,1,224]]},"150320":{"name":"渲染理性，解构欢愉","type":"欢愉技","slot":"elationSkill","levels":[[0.05,0.075,0.1,0.2],[0.055,0.0825,0.11,0.22],[0.06,0.09,0.12,0.24],[0.065,0.0975,0.13,0.26],[0.07,0.105,0.14,0.28],[0.075,0.1125,0.15,0.3],[0.08125,0.121875,0.1625,0.325],[0.0875,0.13125,0.175,0.35],[0.09375,0.140625,0.1875,0.375],[0.1,0.15,0.2,0.4],[0.105,0.1575,0.21,0.42],[0.11,0.165,0.22,0.44],[0.115,0.1725,0.23,0.46],[0.12,0.18,0.24,0.48],[0.125,0.1875,0.25,0.5]]},"150329":{"name":"欢愉万相★跃然纸上","type":"固有行迹","slot":"innate","levels":[[75,0.1,0.1],[75,0.2,0.2]]},"150601":{"name":"拳头硬了！","type":"普攻","slot":"basic","levels":[[0.5],[0.6],[0.7],[0.8],[0.9],[1],[1.1],[1.2],[1.3],[1.4]]},"150602":{"name":"Shoot属性大爆发","type":"战技","slot":"skill","levels":[[0.8,5],[0.88,5],[0.96,5],[1.04,5],[1.12,5],[1.2,5],[1.3,5],[1.4,5],[1.5,5],[1.6,5],[1.68,5],[1.76,5],[1.84,5],[1.92,5],[2,5]]},"150603":{"name":"无敌玩家，启动！","type":"终结技","slot":"ult","levels":[[60,0,0.45,0.2,0.2,3,2],[60,0,0.495,0.2,0.2,3,2],[60,0,0.54,0.2,0.2,3,2],[60,0,0.585,0.2,0.2,3,2],[60,0,0.63,0.2,0.2,3,2],[60,0,0.675,0.2,0.2,3,2],[60,0,0.73125,0.2,0.2,3,2],[60,0,0.7875,0.2,0.2,3,2],[60,0,0.84375,0.2,0.2,3,2],[60,0,0.9,0.2,0.2,3,2],[60,0,0.945,0.2,0.2,3,2],[60,0,0.99,0.2,0.2,3,2],[60,0,1.035,0.2,0.2,3,2],[60,0,1.08,0.2,0.2,3,2],[60,0,1.125,0.2,0.2,3,2]]},"150604":{"name":"有我在，把把都是顺风局","type":"天赋","slot":"talent","levels":[[60,240,0.2,0.002,3,0.004],[60,240,0.22,0.0022,3,0.0044],[60,240,0.24,0.0024,3,0.0048],[60,240,0.26,0.0026,3,0.0052],[60,240,0.28,0.0028,3,0.0056],[60,240,0.3,0.003,3,0.006],[60,240,0.325,0.00325,3,0.0065],[60,240,0.35,0.0035,3,0.007],[60,240,0.375,0.00375,3,0.0075],[60,240,0.4,0.004,3,0.008],[60,240,0.42,0.0042,3,0.0084],[60,240,0.44,0.0044,3,0.0088],[60,240,0.46,0.0046,3,0.0092],[60,240,0.48,0.0048,3,0.0096],[60,240,0.5,0.005,3,0.01]]},"150606":{"name":"攻击","type":"衍生","slot":null,"levels":[[]]},"150607":{"name":"朋友，这才是T0级秘技","type":"秘技","slot":"maze","levels":[[99]]},"150608":{"name":"奖励关：「狼尊时刻」","type":"普攻","slot":"basic","levels":[[1.2,0,100,0.5,3,60,2,0.15],[1.44,0,100,0.6,3,60,2,0.15],[1.68,0,100,0.7,3,60,2,0.15],[1.92,0,100,0.8,3,60,2,0.15],[2.16,0,100,0.9,3,60,2,0.15],[2.4,0,100,1,3,60,2,0.15],[2.64,0,100,1.1,3,60,2,0.15],[2.88,0,100,1.2,3,60,2,0.15],[3.12,0,100,1.3,3,60,2,0.15],[3.36,0,100,1.4,3,60,2,0.15]]},"150610":{"name":"超超超大剑","type":"普攻","slot":"basic","levels":[[],[],[],[],[],[],[],[],[],[]]},"150612":{"name":"爆爆爆炸蛋","type":"普攻","slot":"basic","levels":[[],[],[],[],[],[],[],[],[],[]]},"150618":{"name":"怪怪怪味豆","type":"普攻","slot":"basic","levels":[[],[],[],[],[],[],[],[],[],[]]},"150620":{"name":"殿堂级操作回放","type":"欢愉技","slot":"elationSkill","levels":[[15],[15],[15],[15],[15],[15],[15],[15],[15],[15],[15],[15],[15],[15],[15]]},"150621":{"name":"崩坏级伤害演示","type":"欢愉技","slot":"elationSkill","levels":[[0.45,6],[0.495,6],[0.54,6],[0.585,6],[0.63,6],[0.675,6],[0.73125,6],[0.7875,6],[0.84375,6],[0.9,6],[0.945,6],[0.99,6],[1.035,6],[1.08,6],[1.125,6]]},"150629":{"name":"欢愉万相★全息幻象","type":"固有行迹","slot":"innate","levels":[[360,0.2,0.4],[999,0.4,0.4]]},"151101":{"name":"点星，开幕！","type":"普攻","slot":"basic","levels":[[0.25,1],[0.3,1],[0.35,1],[0.4,1],[0.45,1],[0.5,1],[0.55,1],[0.6,1],[0.65,1],[0.7,1]]},"151102":{"name":"此乃令使，阿哈认证™","type":"战技","slot":"skill","levels":[[0.1,0.25,0,0,1,1],[0.11,0.275,0,0,1,1],[0.12,0.3,0,0,1,1],[0.13,0.325,0,0,1,1],[0.14,0.35,0,0,1,1],[0.15,0.375,0,0,1,1],[0.1625,0.40625,0,0,1,1],[0.175,0.4375,0,0,1,1],[0.1875,0.46875,0,0,1,1],[0.2,0.5,0,0,1,1],[0.21,0.525,0,0,1,1],[0.22,0.55,0,0,1,1],[0.23,0.575,0,0,1,1],[0.24,0.6,0,0,1,1],[0.25,0.625,0,0,1,1]]},"151103":{"name":"啊哈！宇宙笑点大爆炸","type":"终结技","slot":"ult","levels":[[8,1.2,5,0.36,0,3],[8,1.28,5,0.384,0,3],[8,1.36,5,0.408,0,3],[8,1.44,5,0.432,0,3],[8,1.52,5,0.456,0,3],[8,1.6,5,0.48,0,3],[8,1.7,5,0.51,0,3],[8,1.8,5,0.54,0,3],[8,1.9,5,0.57,0,3],[8,2,5,0.6,0,3],[8,2.08,5,0.624,0,3],[8,2.16,5,0.648,0,3],[8,2.24,5,0.672,0,3],[8,2.32,5,0.696,0,3],[8,2.4,5,0.72,0,3]]},"151104":{"name":"与祂共演，奇迹新篇","type":"天赋","slot":"talent","levels":[[1,40,1,0,20,8,1,8,0.12,3],[1,40,1,0,20,8,1,8,0.132,3],[1,40,1,0,20,8,1,8,0.144,3],[1,40,1,0,20,8,1,8,0.156,3],[1,40,1,0,20,8,1,8,0.168,3],[1,40,1,0,20,8,1,8,0.18,3],[1,40,1,0,20,8,1,8,0.195,3],[1,40,1,0,20,8,1,8,0.21,3],[1,40,1,0,20,8,1,8,0.225,3],[1,40,1,0,20,8,1,8,0.24,3],[1,40,1,0,20,8,1,8,0.252,3],[1,40,1,0,20,8,1,8,0.264,3],[1,40,1,0,20,8,1,8,0.276,3],[1,40,1,0,20,8,1,8,0.288,3],[1,40,1,0,20,8,1,8,0.3,3]]},"151106":{"name":"攻击","type":"衍生","slot":null,"levels":[[]]},"151107":{"name":"ABRACADABRA！","type":"秘技","slot":"maze","levels":[[20,20]]},"151120":{"name":"满月，是神在的时间","type":"欢愉技","slot":"elationSkill","levels":[[0.3,0.2],[0.33,0.2],[0.36,0.2],[0.39,0.2],[0.42,0.2],[0.45,0.2],[0.4875,0.2],[0.525,0.2],[0.5625,0.2],[0.6,0.2],[0.63,0.2],[0.66,0.2],[0.69,0.2],[0.72,0.2],[0.75,0.2]]},"151129":{"name":"欢愉万相★无中生有","type":"固有行迹","slot":"innate","levels":[[0.1,0.3],[0.1,0.6]]},"151131":{"name":"阿哈正传","type":"天赋","slot":null,"levels":[[0.25,1,0.1]]}};

// 角色各槽位对应的技能 ID（同一槽位共享等级）
const SKILL_SLOTS = {
 "1501": {
  "basic": [
   "150101",
   "150108"
  ],
  "skill": [
   "150102",
   "150109"
  ],
  "ult": [
   "150103"
  ],
  "talent": [
   "150104"
  ],
  "maze": [
   "150107"
  ],
  "elationSkill": [
   "150120"
  ],
  "innate": [
   "150129"
  ]
 },
 "1503": {
  "basic": [
   "150301",
   "150308",
   "150310"
  ],
  "skill": [
   "150302"
  ],
  "ult": [
   "150303"
  ],
  "talent": [
   "150304"
  ],
  "maze": [
   "150307"
  ],
  "elationSkill": [
   "150320"
  ],
  "innate": [
   "150329"
  ]
 },
 "1506": {
  "basic": [
   "150601",
   "150608",
   "150610",
   "150612",
   "150618"
  ],
  "skill": [
   "150602"
  ],
  "ult": [
   "150603"
  ],
  "talent": [
   "150604"
  ],
  "maze": [
   "150607"
  ],
  "elationSkill": [
   "150620",
   "150621"
  ],
  "innate": [
   "150629"
  ]
 },
 "1511": {
  "basic": [
   "151101"
  ],
  "skill": [
   "151102"
  ],
  "ult": [
   "151103"
  ],
  "talent": [
   "151104"
  ],
  "maze": [
   "151107"
  ],
  "elationSkill": [
   "151120"
  ],
  "innate": [
   "151129"
  ]
 }
};

// 0 魂时各技能的基础等级上限（星魂加成在此之上叠加）
const SKILL_BASE_CAPS = {
 "150101": 6,
 "150102": 10,
 "150103": 10,
 "150104": 10,
 "150107": 1,
 "150108": 6,
 "150109": 10,
 "150120": 10,
 "150129": 2,
 "150301": 6,
 "150302": 10,
 "150303": 10,
 "150304": 10,
 "150307": 1,
 "150308": 6,
 "150310": 6,
 "150320": 10,
 "150329": 2,
 "150601": 6,
 "150602": 10,
 "150603": 10,
 "150604": 10,
 "150607": 1,
 "150608": 6,
 "150610": 6,
 "150612": 6,
 "150618": 6,
 "150620": 10,
 "150621": 10,
 "150629": 2,
 "151101": 6,
 "151102": 10,
 "151103": 10,
 "151104": 10,
 "151107": 1,
 "151120": 10,
 "151129": 2
};

// 同上，按角色分组（便于核对）
const SKILL_BASE_CAPS_BY_CHAR = {
 "1501": {
  "150101": 6,
  "150102": 10,
  "150103": 10,
  "150104": 10,
  "150107": 1,
  "150108": 6,
  "150109": 10,
  "150120": 10,
  "150129": 2
 },
 "1503": {
  "150301": 6,
  "150302": 10,
  "150303": 10,
  "150304": 10,
  "150307": 1,
  "150308": 6,
  "150310": 6,
  "150320": 10,
  "150329": 2
 },
 "1506": {
  "150601": 6,
  "150602": 10,
  "150603": 10,
  "150604": 10,
  "150607": 1,
  "150608": 6,
  "150610": 6,
  "150612": 6,
  "150618": 6,
  "150620": 10,
  "150621": 10,
  "150629": 2
 },
 "1511": {
  "151101": 6,
  "151102": 10,
  "151103": 10,
  "151104": 10,
  "151107": 1,
  "151120": 10,
  "151129": 2
 }
};

// 星魂文案（名称与效果原文）
const EIDOLON_INFO = {
 "1501": [
  {
   "rank": 1,
   "name": "#全网热搜：她是谁？",
   "desc": "阿哈时刻结束时获得5个笑点。当前每拥有1个笑点，使我方全体全属性抗性穿透提高1.5%，最多提高15%。"
  },
  {
   "rank": 2,
   "name": "#观众的眼睛是雪亮的",
   "desc": "阿哈时刻结束时使火花获得1个额外回合和2个【爆点】。每消耗1个【爆点】使自身暴击伤害提高10%，持续2回合，最多叠加4层。"
  },
  {
   "rank": 3,
   "name": "#请点击：心跳超链接",
   "desc": "战技等级+2，最多不超过15级；普攻等级+1，最多不超过10级；欢愉技等级+1，最多不超过15级。"
  },
  {
   "rank": 4,
   "name": "#硬控！顶级表情管理",
   "desc": "施放终结技时额外获得5个笑点，使自身欢愉度提高36%，持续3回合。"
  },
  {
   "rank": 5,
   "name": "#世界破烂，小花缝补",
   "desc": "终结技等级+2，最多不超过15级；天赋等级+2，最多不超过15级；欢愉技等级+1，最多不超过15级。"
  },
  {
   "rank": 6,
   "name": "#锵锵，即将绝版的我",
   "desc": "全属性抗性穿透提高20%。欢愉技每计入1个笑点使其造成的额外伤害次数增加1次，最多增加至40次。"
  }
 ],
 "1503": [
  {
   "rank": 1,
   "name": "珍珠，藏在海的留白处",
   "desc": "队伍中「欢愉」命途角色数量等于2/3/4或以上时，使我方全体欢愉度提高10%/20%/60%。若我方目标受到致命伤害，不会陷入无法战斗状态，并立即回复等同于其生命上限50%的生命值。该效果单场战斗中可以触发2次。"
  },
  {
   "rank": 2,
   "name": "截取，顷刻破晓的光斑",
   "desc": "我方全体目标的欢愉伤害增笑15%。施放终结技时，使除真珠和【美学底本】外的其他我方「欢愉」命途角色也触发行动提前效果，并使终结技提供的额外回合开始时获得的【好活当赏】和笑点提高100%。"
  },
  {
   "rank": 3,
   "name": "速写，惊涛悬停的刹那",
   "desc": "终结技等级+2，最多不超过15级；普攻等级+1，最多不超过10级；欢愉技等级+1，最多不超过15级。"
  },
  {
   "rank": 4,
   "name": "解译，唇角模糊的笑意",
   "desc": "欢愉技为我方全体目标提供的欢愉伤害倍率提高原倍率的100%。"
  },
  {
   "rank": 5,
   "name": "透视，笔端星夜的肌理",
   "desc": "战技等级+2，最多不超过15级；天赋等级+2，最多不超过15级；欢愉技等级+1，最多不超过15级。"
  },
  {
   "rank": 6,
   "name": "用一副躯壳，演算生命",
   "desc": "【深度学习】时，我方全体目标的全属性抗性穿透提高20%。真珠的强化普攻额外造成240%的冰属性欢愉伤害，该次欢愉伤害使用【美学底本】的属性值计算。"
  }
 ],
 "1506": [
  {
   "rank": 1,
   "name": "以太编辑：星魂+1",
   "desc": "结界中的敌方目标受到的伤害提高20%。\n退出【无敌玩家】状态时不会清空【隐藏分】，改为保留20%的【隐藏分】。"
  },
  {
   "rank": 2,
   "name": "是机制，不是BUG",
   "desc": "进入【无敌玩家】状态后，使自身所有增益效果延长1回合。本次【无敌玩家】状态下每使【隐藏分】提高120点（含初始【隐藏分】），「银狼LV.999」获得1个额外回合并恢复1次强化普攻的可施放次数。"
  },
  {
   "rank": 3,
   "name": "只有15级？谁填的",
   "desc": "战技等级+2，最多不超过15级；普攻等级+1，最多不超过10级；欢愉技等级+1，最多不超过15级。"
  },
  {
   "rank": 4,
   "name": "我来，我见，我..秒了",
   "desc": "【崩坏级伤害演示】造成的欢愉伤害额外计入5倍的笑点。"
  },
  {
   "rank": 5,
   "name": "平A即是大招",
   "desc": "终结技等级+2，最多不超过15级；天赋等级+2，最多不超过15级；欢愉技等级+1，最多不超过15级。"
  },
  {
   "rank": 6,
   "name": "我独自满级！",
   "desc": "强化普攻期间造成的欢愉伤害增笑50%。\n敌方目标进入战斗时，会被植入【禁限弱点】：拥有全属性弱点并且全属性基础抗性降低至0（若基础抗性为0则改为对应属性抗性降低20%）。"
  }
 ],
 "1511": [
  {
   "rank": 1,
   "name": "谁在太初噤声时笑场",
   "desc": "进入战斗时，立即获得4点【愿力】，我方全体目标造成的欢愉伤害增笑15%。"
  },
  {
   "rank": 2,
   "name": "在祂的眼睛和你之间",
   "desc": "使「欢愉」命途升格效果获得加强：\n#{series_ref_skill_desc:UIText_SeriesSkillDescFormat,151129,2}\n"
  },
  {
   "rank": 3,
   "name": "牌叠起，令悲喜轮回",
   "desc": "终结技等级+2，最多不超过15级；普攻等级+1，最多不超过10级；欢愉技等级+1，最多不超过15级。"
  },
  {
   "rank": 4,
   "name": "黑箱一个玩笑的命运",
   "desc": "欢愉技造成的真实伤害倍率提高原倍率的25%。星神★阿哈造成的欢愉伤害，会额外计入队友持有的【好活当赏】总和的100%。"
  },
  {
   "rank": 5,
   "name": "台前幕后，是我非我",
   "desc": "战技等级+2，最多不超过15级；天赋等级+2，最多不超过15级；欢愉技等级+1，最多不超过15级。"
  },
  {
   "rank": 6,
   "name": "因为神说：你就是欢愉",
   "desc": "敌方目标始终拥有至少等同于该目标生命上限20%的【欢愉负债】效果。星神★阿哈首次施放终结技时，立即使阿哈获得1个固定计入40笑点的额外回合，之后每次施放终结技，可使阿哈行动提前20%。"
  }
 ]
};


/* ===== lightconedata.js ===== */
// 由 scripts/gen_lightcone_data.mjs 自动生成（数据源 hsr.nanoka.cc 4.6.51 的专属光锥数据），请勿手改
// levels[叠影-1] = 该叠影下的参数数组（与 desc 里的 #1 #2 ... 一一对应）
const LIGHTCONES = {
 "23053": {
  "name": "花花世界迷人眼",
  "passive": "瞩目",
  "rarity": 5,
  "path": "Elation",
  "desc": "使装备者的暴击伤害提高#1[i]%。装备者在场时，队伍中每有1名「欢愉」命途的角色，战技点上限提高#2[i]点，最多提高#3[i]点；装备者每消耗1个战技点使自身造成的欢愉伤害无视敌方目标#6[f1]%的防御力，最多叠加#5[i]层，若在同一回合内消耗大于等于#7[i]个战技点则使装备者获得【推流】。装备者持有【推流】时，我方全体欢愉度提高#4[i]%。同类光锥效果无法叠加。",
  "levels": [
   [
    0.48,
    1,
    3,
    0.2,
    4,
    0.05,
    4
   ],
   [
    0.56,
    1,
    3,
    0.24,
    4,
    0.06,
    4
   ],
   [
    0.64,
    1,
    3,
    0.28,
    4,
    0.07,
    4
   ],
   [
    0.72,
    1,
    3,
    0.32,
    4,
    0.08,
    4
   ],
   [
    0.8,
    1,
    3,
    0.36,
    4,
    0.09,
    4
   ]
  ],
  "stats": {
   "hp": 1058.4,
   "atk": 582.1,
   "def": 463.1
  },
  "atkCheck": 582
 },
 "23055": {
  "name": "献给明日的色彩",
  "passive": "挥墨",
  "rarity": 5,
  "path": "Elation",
  "desc": "使装备者的防御力提高#1[i]%。装备者对我方全体施放欢愉技时，使敌方全体受到的伤害提高#4[i]%，持续#3[i]回合，为装备者固定恢复#2[i]点能量，并为我方全体回复等同于装备者防御力#5[i]%的生命值。",
  "levels": [
   [
    0.48,
    10,
    3,
    0.22,
    0.1
   ],
   [
    0.6,
    10,
    3,
    0.275,
    0.125
   ],
   [
    0.72,
    10,
    3,
    0.33,
    0.15
   ],
   [
    0.84,
    10,
    3,
    0.385,
    0.175
   ],
   [
    0.96,
    10,
    3,
    0.44,
    0.2
   ]
  ],
  "stats": {
   "hp": 1058.4,
   "atk": 476.3,
   "def": 595.3
  },
  "atkCheck": 476
 },
 "23057": {
  "name": "欢迎来到银河城",
  "passive": "稳赢",
  "rarity": 5,
  "path": "Elation",
  "desc": "使装备者的速度提高#1[i]%，造成的欢愉伤害无视目标#2[i]%的防御力。当装备者对自身单体施放终结技时，获得#3[i]点【笑点】。该效果最多触发1次，施放#4[i]次普攻后重置可触发次数。",
  "levels": [
   [
    0.18,
    0.2,
    20,
    3
   ],
   [
    0.21,
    0.24,
    25,
    3
   ],
   [
    0.24,
    0.28,
    30,
    3
   ],
   [
    0.27,
    0.32,
    35,
    3
   ],
   [
    0.3,
    0.36,
    40,
    3
   ]
  ],
  "stats": {
   "hp": 1164.2,
   "atk": 476.3,
   "def": 529.2
  },
  "atkCheck": 476
 },
 "23065": {
  "name": "当第一声「阿哈」响起",
  "passive": "即兴巡演",
  "rarity": 5,
  "path": "Elation",
  "desc": "使装备者的基础速度提高#1[i]点。对我方其他单体施放战技时，获得#2[i]个笑点，该效果每#3[i]回合最多触发1次，随后使我方全体在本场战斗中造成伤害时无视敌方目标#4[i]%的防御力，该效果无法叠加。",
  "levels": [
   [
    12,
    10,
    2,
    0.16
   ],
   [
    14,
    12,
    2,
    0.18
   ],
   [
    16,
    14,
    2,
    0.2
   ],
   [
    18,
    16,
    2,
    0.22
   ],
   [
    20,
    18,
    2,
    0.24
   ]
  ],
  "stats": {
   "hp": 952.6,
   "atk": 582.1,
   "def": 529.2
  },
  "atkCheck": 582
 }
};

// 角色 -> 专属光锥 ID
const SIGNATURE_LIGHTCONE = {
 "1501": "23053",
 "1503": "23055",
 "1506": "23057",
 "1511": "23065"
};

// 光锥满级等级（用于属性计算校验）
const LIGHTCONE_MAX_LEVEL = 80;


/* ===== lightcones.js ===== */
// ============================================================================
// 专属光锥：数据解析 + 属性/机制应用
// 数据源：engine/lightconedata.js（由 scripts/gen_lightcone_data.mjs 从站点数据生成）
//   levels[叠影-1] = 该叠影下的参数数组，与 desc 中的 #1 #2 ... 一一对应
// 四把专属光锥（均为「欢愉」命途 5★）：
//   23057 欢迎来到银河城（银狼LV.999）· 稳赢
//   23053 花花世界迷人眼（火花）      · 瞩目
//   23055 献给明日的色彩（真珠）      · 挥墨
//   23065 当第一声「阿哈」响起（阿哈）· 即兴巡演
// ============================================================================




// 解析某角色应装备的光锥（cfg.characters[id].lightcone = { id, superimpose }）
function resolveLightcone(avatarId, charCfg) {
  var conf = (charCfg && charCfg.lightcone) || {};
  var id = conf.id === undefined || conf.id === null ? SIGNATURE_LIGHTCONE[avatarId] : String(conf.id);
  if (!id || id === 'none' || conf.enabled === false) return null;
  var data = LIGHTCONES[id];
  if (!data) return null;
  var sp = Math.max(1, Math.min(5, Number(conf.superimpose) || 1));
  return {
    id: id,
    name: data.name,
    passive: data.passive,
    desc: data.desc,
    rarity: data.rarity,
    path: data.path,
    superimpose: sp,
    params: data.levels[sp - 1] || data.levels[0] || [],
    stats: data.stats
  };
}

// 参数取值（越界返回 0）
function lcParam(lc, index) {
  if (!lc || !lc.params) return 0;
  var v = lc.params[index];
  return typeof v === 'number' ? v : 0;
}

// 光锥基础属性并入面板：先加固定值，再乘百分比加成（与游戏内算法一致）
// 返回加成明细，便于 UI/CLI 展示
function applyLightconeStats(unit, lc) {
  if (!lc) return null;
  var p = lc.params;
  var bonus = { hp: lc.stats.hp, atk: lc.stats.atk, def: lc.stats.def,
                defPct: 0, critDmg: 0, spdFlat: 0, spdPct: 0, critRate: 0, elationDegree: 0 };
  if (lc.id === '23055') bonus.defPct = p[0];          // 挥墨：防御力提高 48%（S1）
  if (lc.id === '23053') bonus.critDmg = p[0];        // 瞩目：暴击伤害提高 48%（S1）
  if (lc.id === '23057') bonus.spdPct = p[0];         // 稳赢：速度提高 18%（S1）
  if (lc.id === '23065') bonus.spdFlat = p[0];        // 即兴巡演：基础速度提高 12 点（S1）
  unit.stats.hp += bonus.hp;
  unit.stats.atk += bonus.atk;
  unit.stats.def += bonus.def;
  if (bonus.defPct) unit.stats.def = unit.stats.def * (1 + bonus.defPct);
  if (bonus.critDmg) unit.stats.critDmg += bonus.critDmg;
  if (bonus.spdFlat) unit.stats.spd += bonus.spdFlat;
  if (bonus.spdPct) unit.stats.spd = unit.stats.spd * (1 + bonus.spdPct);
  unit.stats.spd = Math.round(unit.stats.spd * 100) / 100;
  unit.stats.atk = Math.round(unit.stats.atk * 10) / 10;
  unit.stats.def = Math.round(unit.stats.def * 10) / 10;
  unit.stats.hp = Math.round(unit.stats.hp * 10) / 10;
  bonus.totalSpd = unit.stats.spd;
  return bonus;
}

// 光锥一览（UI 用）：当前是否装备、叠影、效果原文、满级属性
function lightconeInfo(avatarId, cfg) {
  var charCfg = cfg && cfg.characters ? cfg.characters[avatarId] : null;
  var cur = resolveLightcone(avatarId, charCfg);
  var sigId = SIGNATURE_LIGHTCONE[avatarId];
  var data = LIGHTCONES[sigId];
  var out = [];
  if (data) {
    out.push({ id: sigId, name: data.name, passive: data.passive, desc: data.desc,
               rarity: data.rarity, stats: data.stats, signature: true,
               equipped: !!cur && cur.id === sigId, superimpose: cur && cur.id === sigId ? cur.superimpose : 0,
               params: cur && cur.id === sigId ? cur.params : null });
  }
  out.push({ id: 'none', name: '不带光锥', passive: '', desc: '仅使用角色面板属性（可手动填写替代光锥的数值）',
             rarity: 0, stats: { hp: 0, atk: 0, def: 0 }, signature: false,
             equipped: !cur, superimpose: 0, params: null });
  return { current: cur ? cur.id : 'none', currentSuperimpose: cur ? cur.superimpose : 0, options: out };
}


/* ===== relicdata.js ===== */
// 由 scripts/gen_relic_data.mjs 自动生成（数据源 hsr.nanoka.cc 4.6.51），请勿手改
// 2 件套 / 4 件套效果文本与参数（params 与 desc 中的 #1 #2 ... 一一对应）
const RELICS = {
 "112": {
  "name": "盗匪荒漠的废土客",
  "nameEn": "Wastelander of Banditry Desert",
  "two": {
   "desc": "虚数属性伤害提高#1[i]%。",
   "params": [
    0.1
   ]
  },
  "four": {
   "desc": "装备者对陷入负面效果的敌方目标造成伤害时暴击率提高#1[i]%，对陷入禁锢状态的敌方目标造成伤害时暴击伤害提高#2[i]%。",
   "params": [
    0.1,
    0.2
   ]
  }
 },
 "114": {
  "name": "骇域漫游的信使",
  "nameEn": "Messenger Traversing Hackerspace",
  "two": {
   "desc": "速度提高#1[i]%。",
   "params": [
    0.06
   ]
  },
  "four": {
   "desc": "当装备者对我方目标施放终结技时，我方全体速度提高#1[i]%，持续#2[i]回合，该效果无法叠加。",
   "params": [
    0.12,
    1
   ]
  }
 },
 "121": {
  "name": "重循苦旅的司铎",
  "nameEn": "Sacerdos' Relived Ordeal",
  "two": {
   "desc": "速度提高#1[i]%。",
   "params": [
    0.06
   ]
  },
  "four": {
   "desc": "对我方单体目标施放战技或终结技时，使技能目标的暴击伤害提高#1[i]%，持续#2[i]回合，该效果最多叠加#3[i]次。",
   "params": [
    0.18,
    2,
    2
   ]
  }
 },
 "126": {
  "name": "恶海逐波的船长",
  "nameEn": "Wavestrider Captain",
  "two": {
   "desc": "暴击伤害提高#1[i]%。",
   "params": [
    0.16
   ]
  },
  "four": {
   "desc": "装备者成为其他我方目标的技能目标时，获得1层【助力】，最多叠加#1[i]层。施放终结技时，若持有#1[i]层【助力】，消耗所有【助力】，使装备者攻击力提高#2[i]%，持续#3[i]回合。",
   "params": [
    2,
    0.48,
    1
   ]
  }
 },
 "129": {
  "name": "闪耀功勋的魔法少女",
  "nameEn": "Ever-Glorious Magical Girl",
  "two": {
   "desc": "暴击伤害提高#1[i]%。",
   "params": [
    0.16
   ]
  },
  "four": {
   "desc": "装备者及其忆灵造成的欢愉伤害无视目标#1[i]%的防御力，我方每累计获得#2[i]点笑点，造成的欢愉伤害额外无视目标#3[i]%的防御力，最多叠加#4[i]层。",
   "params": [
    0.1,
    5,
    0.01,
    10
   ]
  }
 },
 "130": {
  "name": "应天涉远的卜者",
  "nameEn": "Diviner of Distant Reach",
  "two": {
   "desc": "速度提高#1[i]%。",
   "params": [
    0.06
   ]
  },
  "four": {
   "desc": "进入战斗前，若装备者的速度大于等于#1[i]/#2[i]，使装备者的暴击率提高#3[i]%/#4[i]%。装备者每场战斗首次施放欢愉技时，使我方全体欢愉度提高#5[i]%，该效果无法叠加。",
   "params": [
    120,
    160,
    0.1,
    0.18,
    0.1
   ]
  }
 },
 "133": {
  "name": "戏梦点星的伶人",
  "nameEn": "Dreamlit Actor",
  "two": {
   "desc": "速度提高#1[i]%。",
   "params": [
    0.06
   ]
  },
  "four": {
   "desc": "当装备者对我方其他单体目标施放战技或终结技时，使技能目标的欢愉度提高#1[i]%，持续#2[i]回合，若装备者持有的好活当赏大于等于#3[i]点，则额外使我方全体目标的暴击伤害提高#4[i]%，持续#5[i]回合。",
   "params": [
    0.16,
    3,
    10,
    0.12,
    3
   ]
  }
 },
 "308": {
  "name": "生命的翁瓦克",
  "nameEn": "Sprightly Vonwacq",
  "two": {
   "desc": "使装备者的能量恢复效率提高#1[i]%。当装备者的速度大于等于#2[i]时，进入战斗时立刻使行动提前#3[i]%。",
   "params": [
    0.05,
    120,
    0.4
   ]
  },
  "four": null
 },
 "309": {
  "name": "繁星竞技场",
  "nameEn": "Rutilant Arena",
  "two": {
   "desc": "使装备者的暴击率提高#1[i]%。当装备者的当前暴击率大于等于#2[i]%时，普攻和战技造成的伤害提高#3[i]%。",
   "params": [
    0.08,
    0.7,
    0.2
   ]
  },
  "four": null
 },
 "310": {
  "name": "折断的龙骨",
  "nameEn": "Broken Keel",
  "two": {
   "desc": "使装备者的效果抵抗提高#1[i]%。当装备者的效果抵抗大于等于#2[i]%时，我方全体暴击伤害提高#3[i]%。",
   "params": [
    0.1,
    0.3,
    0.1
   ]
  },
  "four": null
 },
 "313": {
  "name": "无主荒星茨冈尼亚",
  "nameEn": "Sigonia, the Unclaimed Desolation",
  "two": {
   "desc": "使装备者的暴击率提高#3[i]%。当敌方目标被消灭时，装备者暴击伤害提高#1[i]%，最多叠加#2[i]层。",
   "params": [
    0.04,
    10,
    0.04
   ]
  },
  "four": null
 },
 "317": {
  "name": "沉陆海域露莎卡",
  "nameEn": "Lushaka, the Sunken Seas",
  "two": {
   "desc": "使装备者的能量恢复效率提高#1[i]%，如果装备者不是编队中的第一位角色，使编队中的第一位角色攻击力提高#2[i]%。",
   "params": [
    0.05,
    0.12
   ]
  },
  "four": null
 },
 "318": {
  "name": "奇想蕉乐园",
  "nameEn": "The Wondrous BananAmusement Park",
  "two": {
   "desc": "使装备者的暴击伤害提高#1[i]%，当存在装备者召唤的目标时，暴击伤害额外提高#2[i]%。",
   "params": [
    0.16,
    0.32
   ]
  },
  "four": null
 },
 "324": {
  "name": "天国@直播间",
  "nameEn": "Tengoku@Livestream",
  "two": {
   "desc": "使装备者的暴击伤害提高#1[i]%，若在同一回合内消耗大于等于#2[i]点战技点，额外使装备者暴击伤害提高#3[i]%，持续#4[i]回合。",
   "params": [
    0.16,
    3,
    0.32,
    3
   ]
  },
  "four": null
 },
 "325": {
  "name": "零号关卡朋克洛德",
  "nameEn": "Punklorde Stage Zero",
  "two": {
   "desc": "使装备者的欢愉度提高#1[i]%。战斗中欢愉度首次达到#2[i]%/#3[i]%时，使装备者暴击伤害提高#4[i]%/#5[i]%。",
   "params": [
    0.08,
    0.4,
    0.8,
    0.2,
    0.32
   ]
  },
  "four": null
 },
 "329": {
  "name": "神的瞬息欢愉",
  "nameEn": "God's Moment of Joy",
  "two": {
   "desc": "使装备者的速度提高#1[i]%。当装备者的欢愉度大于等于#2[i]%时，进入战斗时立刻使行动提前#3[i]%。",
   "params": [
    0.06,
    0.4,
    0.4
   ]
  },
  "four": null
 }
};

// 站点给出的推荐顺序（首个为首选）；mainStats 为四个部位的主词条推荐
const RECOMMENDED_RELICS = {
 "1501": {
  "set4": [
   "129",
   "126"
  ],
  "set2": [
   "324",
   "318",
   "309"
  ],
  "mainStats": [
   {
    "slot": "躯干",
    "prop": "暴击率",
    "propCode": "CriticalChanceBase"
   },
   {
    "slot": "脚部",
    "prop": "攻击力百分比",
    "propCode": "AttackAddedRatio"
   },
   {
    "slot": "位面球",
    "prop": "攻击力百分比",
    "propCode": "AttackAddedRatio"
   },
   {
    "slot": "连结绳",
    "prop": "攻击力百分比",
    "propCode": "AttackAddedRatio"
   }
  ],
  "subStats": [
   "暴击率",
   "暴击伤害",
   "攻击力百分比"
  ]
 },
 "1503": {
  "set4": [
   "133",
   "130",
   "114"
  ],
  "set2": [
   "308",
   "317",
   "310"
  ],
  "mainStats": [
   {
    "slot": "躯干",
    "prop": "治疗量加成",
    "propCode": "HealRatioBase"
   },
   {
    "slot": "脚部",
    "prop": "速度",
    "propCode": "SpeedDelta"
   },
   {
    "slot": "位面球",
    "prop": "防御力百分比",
    "propCode": "DefenceAddedRatio"
   },
   {
    "slot": "连结绳",
    "prop": "能量恢复效率",
    "propCode": "SPRatioBase"
   }
  ],
  "subStats": [
   "防御力百分比",
   "速度"
  ]
 },
 "1506": {
  "set4": [
   "129",
   "126",
   "112"
  ],
  "set2": [
   "325",
   "313",
   "324"
  ],
  "mainStats": [
   {
    "slot": "躯干",
    "prop": "暴击率",
    "propCode": "CriticalChanceBase"
   },
   {
    "slot": "脚部",
    "prop": "速度",
    "propCode": "SpeedDelta"
   },
   {
    "slot": "位面球",
    "prop": "生命值百分比",
    "propCode": "HPAddedRatio"
   },
   {
    "slot": "连结绳",
    "prop": "防御力百分比",
    "propCode": "DefenceAddedRatio"
   }
  ],
  "subStats": [
   "速度",
   "暴击率",
   "暴击伤害"
  ]
 },
 "1511": {
  "set4": [
   "133",
   "130",
   "121"
  ],
  "set2": [
   "329",
   "308",
   "310"
  ],
  "mainStats": [
   {
    "slot": "躯干",
    "prop": "暴击率",
    "propCode": "CriticalChanceBase"
   },
   {
    "slot": "脚部",
    "prop": "速度",
    "propCode": "SpeedDelta"
   },
   {
    "slot": "位面球",
    "prop": "生命值百分比",
    "propCode": "HPAddedRatio"
   },
   {
    "slot": "连结绳",
    "prop": "防御力百分比",
    "propCode": "DefenceAddedRatio"
   }
  ],
  "subStats": [
   "暴击率",
   "暴击伤害",
   "速度"
  ]
 }
};


/* ===== relics.js ===== */
// ============================================================================
// 遗器：面板属性（主词条 + 副词条 + 2 件套）与套装机制（4 件套 / 2 件套条件效果）
// 数据源：engine/relicdata.js（由 scripts/gen_relic_data.mjs 从站点数据生成）
// 说明：
//   * 主词条按 5★ 遗器满级（+15）标准值计入
//   * 副词条按「有效词条数 × 中位数值」折算，分配比例沿用站点给出的副词条优先级
//   * 4 件套/条件型 2 件套在 collectBuffs 中按战斗状态结算
// ============================================================================




// 5★ 遗器满级主词条数值
const MAIN_STAT_VALUES = {
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
const SUBSTAT_VALUES = {
  '暴击率': { critRate: 0.0292 }, '暴击伤害': { critDmg: 0.0583 },
  '攻击力百分比': { atkPct: 0.0389 }, '生命值百分比': { hpPct: 0.0389 }, '防御力百分比': { defPct: 0.0486 },
  '速度': { spdFlat: 2.0 }, '效果命中': { statusHit: 0.0345 }, '效果抵抗': { statusRes: 0.0345 },
  '击破特攻': { breakEffect: 0.0518 }
};

// 各套装的机制定义（只覆盖四个角色推荐列表中的 16 套）
// stats：无条件并入面板；cond：战斗中的条件效果（在 relicBuffs 中解释）
const RELIC_EFFECTS = {
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
function resolveRelics(avatarId, charCfg) {
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
function relicPanelBonus(rc) {
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
function applyRelicStats(unit, bonus) {
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
function relicInfo(avatarId, cfg) {
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


/* ===== characters.js ===== */
// ============================================================================
// 四角色机制数据（手工整理，全部数值来自 hsr.nanoka.cc 4.6.51 的角色详情数据）
// 每个条目注释中的 ID 为站点技能 ID，tests/consistency.test.mjs 会回查归一化数据核对。
// 只收录与「伤害模拟」相关的机制；纯生存类效果（抵御值、治疗量）仅保留影响资源的部分。
// ============================================================================

const ELATION_COUNT_TIERS = [1, 2, 3, 4];

const CHARACTERS = [
  // --------------------------------------------------------------------------
  // 1506 银狼LV.999（欢愉 / 虚数）—— 变身流主C
  // --------------------------------------------------------------------------
  {
    id: '1506',
    name: '银狼LV.999',
    nameEn: 'Silver Wolf LV.999',
    element: 'Imaginary',
    elementZh: '虚数',
    role: '主C',
    base: { atk: 388.1, def: 654.9, hp: 1047.8, spd: 110, critRate: 0.05, critDmg: 0.5, elationDegree: 0.10 },
    traceBonus: { critRate: 0.187, spd: 9, elationDegree: 0.10 },   // 行迹属性节点合计
    energy: { max: 60, perBasic: 20, perSkill: 30, perUlt: 5, perHit: 10 },
    kit: {
      // 150601 普攻 拳头硬了！
      basic: { id: '150601', name: '拳头硬了！', multiplier: 1.4, scaling: 'atk', kind: 'normal', spAdd: 1, energy: 20 },
      // 150602 战技 Shoot属性大爆发：200% 攻击力虚数伤害 + 5 笑点
      skill: { id: '150602', name: 'Shoot属性大爆发', multiplier: 2.0, scaling: 'atk', kind: 'normal',
               spCost: 1, jokeAdd: 5, energy: 30 },
      // 150603 终结技 无敌玩家，启动！：进入无敌玩家（结界）+ 行动提前 100%
      ult: { id: '150603', name: '无敌玩家，启动！', spCost: 0, energy: 5, hiddenRequire: 60,
             enterStance: 'invincible', advance: 1.0,
             blindbox: { multiplier: 1.125, kind: 'elation', trueRatio: 0.2, spBack: 3, jokeAdd: 2,
                         procChanceInit: 1.0, procChanceDecay: 0.2, segmentPause: 1 } },
      // 150604 天赋 有我在，把把都是顺风局
      talent: { hiddenThreshold: 60, hiddenOverflow: 240, hiddenOverflowUpgraded: 999,
                critRatePerPoint: 0.005, critDmgPerPoint: 0.01,
                elationAppendPerSpend: 0.5,          // 持好活当赏时普攻/战技追加 50% 欢愉伤害
                invincibleBasics: 3, exitClearsHidden: true },
      // 150608 强化普攻 奖励关：「狼尊时刻」
      enhancedBasic: { id: '150608', name: '奖励关：「狼尊时刻」', kind: 'elation',
                       total: 3.36, segments: 100, blindboxTriggers: 3, finisher: 1.4,
                       spAdd: 0, energy: 20, bonusPer60Hidden: 0.15, bonusMaxStacks: 2 },
      // 150620 / 150621 欢愉技
      elationSkills: [
        { id: '150620', name: '殿堂级操作回放', kind: 'buff', hiddenAdd: 15, multiplier: 0 },
        { id: '150621', name: '崩坏级伤害演示', kind: 'elation', hits: 6, multiplier: 1.125, resetBlindbox: true }
      ],
      // 150607 秘技：召唤怪怪怪味豆，每波次触发 1 次盲盒，固定计入 99 点好活当赏
      maze: { id: '150607', name: '朋友，这才是T0级秘技', blindboxPerWave: 1, fixedGoodReward: 99 },
      // 150629 固有行迹 欢愉万相★全息幻象
      innate: { id: '150629', name: '欢愉万相★全息幻象', overflowTo: 999, critDmg: 0.4, hiddenRefundRatio: 0.4 }
    },
    traces: {
      // 假结局速通攻略：速度 >= 160 时欢愉度 +50%，每超 1 点再 +2%，最多计 100 点
      a2: { name: '假结局速通攻略', spdThreshold: 160, elationBase: 0.50, elationPerPoint: 0.02, maxPoints: 100 },
      // 真结局解锁条件：欢愉技计入笑点 >= 20 额外 +20 隐藏分，>= 40 再 +20
      a4: { name: '真结局解锁条件', jokeTiers: [20, 40], hiddenPerTier: 20 },
      // 隐藏关卡全成就：进入无敌玩家 +20 隐藏分
      a6: { name: '隐藏关卡全成就', hiddenOnEnter: 20 }
    },
    eidolons: {
      1: { name: '以太编辑：星魂+1', domainVulnerability: 0.20, keepHiddenOnExit: 0.20 },
      2: { name: '是机制，不是BUG', extraTurnPerHidden: 120, restoreEnhancedBasic: 1 },
      3: { name: '只有15级？谁填的', skillLv: 2, basicLv: 1, elationLv: 1 },
      4: { name: '我来，我见，我..秒了', jokeMultiplierOnElationSkill: 5 },
      5: { name: '平A即是大招', ultLv: 2, talentLv: 2, elationLv: 1 },
      6: { name: '我独自满级！', amplificationOnEnhancedBasic: 0.50, implantAllWeakness: true }
    }
  },

  // --------------------------------------------------------------------------
  // 1501 火花（欢愉 / 火）—— 强化普攻 + 终结技主C
  // --------------------------------------------------------------------------
  {
    id: '1501',
    name: '火花',
    nameEn: 'Sparxie',
    element: 'Fire',
    elementZh: '火',
    role: '主C',
    base: { atk: 640.3, def: 460.8, hp: 1047.8, spd: 107, critRate: 0.05, critDmg: 0.5, elationDegree: 0.0 },
    traceBonus: { critRate: 0.12, critDmg: 0.133, elationDegree: 0.28 },
    energy: { max: 160, perBasic: 20, perSkill: 30, perUlt: 5, perHit: 10 },
    kit: {
      // 150101 普攻 哑火了吗：140% 攻击力火伤
      basic: { id: '150101', name: '哑火了吗', multiplier: 1.4, scaling: 'atk', kind: 'normal', spAdd: 1, energy: 20 },
      // 150108 强化普攻 百花齐放，胜者独享！：单体 140% + 相邻 70%（扩散）
      enhancedBasic: { id: '150108', name: '百花齐放，胜者独享！', kind: 'normal', scaling: 'atk',
                       multiplier: 1.4, adjacentMultiplier: 0.7, spAdd: 1, energy: 20 },
      // 150102 战技 尖叫！火花花连线中：开启连线，最多发动 20 次互动陷阱
      skill: { id: '150102', name: '尖叫！火花花连线中', spCost: 1, energy: 30, maxTraps: 20, kind: 'buff',
               trapsPerCast: 1 },
      // 150109 互动陷阱：强化普攻单体 +25% / 相邻 +12.5%，随机礼物（红红火火 +2 笑点 +2 战技点 / 恍恍惚惚 +1 笑点）
      trap: { id: '150109', name: '互动陷阱', spCost: 1, multiplierBonus: 0.25, adjacentBonus: 0.125,
              gift: [ { name: '红红火火', joke: 2, sp: 2, weight: 0.5 }, { name: '恍恍惚惚', joke: 1, sp: 0, weight: 0.5 } ] },
      // 150103 终结技 万我狂欢，镜头不要停：2 笑点；全体 (0.6 x 欢愉度 + 60%) 攻击力火伤
      ult: { id: '150103', name: '万我狂欢，镜头不要停', jokeAdd: 2, kind: 'normal', scaling: 'atk',
             multiplier: 0.6, elationDegreeCoef: 0.6, energy: 5 },
      // 150104 天赋 幕后花手：持好活当赏时，强化普攻 50%/25% 欢愉伤害、每次陷阱追加 25%、终结技 60% 欢愉伤害
      talent: { id: '150104', name: '幕后花手', requireGoodReward: true,
                enhancedBasicElation: 0.50, enhancedBasicAdjacentElation: 0.25,
                perTrapElation: 0.25, ultElation: 0.60 },
      // 150120 欢愉技 信号溢出：好戏返场！：全体 62.5% + 20 次 x 31.25%，+2 爆点
      elationSkills: [ { id: '150120', name: '信号溢出：好戏返场！', kind: 'elation', multiplier: 0.625,
                         extraHits: 20, extraMultiplier: 0.3125, sparkAdd: 2, energy: 5 } ],
      // 150107 秘技 流量变现：进战回 2 战技点，对全体 50% 攻击力火伤
      maze: { id: '150107', name: '流量变现', spGain: 2, multiplier: 0.5, kind: 'normal', scaling: 'atk' },
      // 150129 固有行迹 欢愉万相★兔子戏法
      innate: { id: '150129', name: '欢愉万相★兔子戏法', critDmg: 1.20, defIgnore: 0.20, sparkPer10: 1, sparkMax: 10 }
    },
    traces: {
      // 甜蜜！笑点签售会：攻击力 > 2000 后每超 100 点，欢愉度 +5%，最多 +80%
      p6: { name: '甜蜜！笑点签售会', atkThreshold: 2000, elationPer100: 0.05, elationMax: 0.80 },
      // 炫目！人设万花筒：队内欢愉人数 1/2/3+ -> 终结技额外 +2/4/8 笑点与 1/1/4 爆点
      p7: { name: '炫目！人设万花筒', jokeByCount: { 1: 2, 2: 4, 3: 8, 4: 8 }, sparkByCount: { 1: 1, 2: 1, 3: 4, 4: 4 } },
      // 沸腾！真伪调色盘：每 1 笑点使全队暴伤 +8%，最多 +80%
      p8: { name: '沸腾！真伪调色盘', critDmgPerJoke: 0.08, critDmgMax: 0.80 }
    },
    eidolons: {
      1: { name: '#全网热搜：她是谁？', jokeOnAhaMoment: 5, resPenPerJoke: 0.015, resPenMax: 0.15 },
      2: { name: '#观众的眼睛是雪亮的', extraTurnOnAhaMoment: true, sparkOnAhaMoment: 2,
           critDmgPerSpark: 0.10, critDmgMaxStacks: 4 },
      3: { name: '#请点击：心跳超链接', skillLv: 2, basicLv: 1, elationLv: 1 },
      4: { name: '#硬控！顶级表情管理', jokeOnUlt: 5, elationDegreeOnUlt: 0.36, elationTurns: 3 },
      5: { name: '#世界破烂，小花缝补', ultLv: 2, talentLv: 2, elationLv: 1 },
      6: { name: '#锵锵，即将绝版的我', resPen: 0.20, extraHitPerJoke: 1, extraHitMax: 40 }
    }
  },

  // --------------------------------------------------------------------------
  // 1503 真珠（欢愉 / 冰）—— 防御力驱动的治疗 / 挡伤副坦
  // --------------------------------------------------------------------------
  {
    id: '1503',
    name: '真珠',
    nameEn: 'Pearl',
    element: 'Ice',
    elementZh: '冰',
    role: '生存/辅助',
    base: { atk: 465.7, def: 727.7, hp: 1203.0, spd: 99, critRate: 0.05, critDmg: 0.5, elationDegree: 0.0 },
    traceBonus: { spd: 9, defPct: 0.225, statusRes: 0.10, elationDegree: 0.10 },
    energy: { max: 180, perBasic: 20, perSkill: 30, perUlt: 5, perHit: 10 },
    kit: {
      // 150301 普攻 行笔，临摹断水：126% 防御力冰伤
      basic: { id: '150301', name: '行笔，临摹断水', multiplier: 1.26, scaling: 'def', kind: 'normal',
               spAdd: 1, energy: 20 },
      // 150308 / 150310 强化普攻：140% 防御力全体冰伤 + 治疗 11.2% 防御 + 224
      enhancedBasic: { id: '150310', name: '行笔，绘制末浪', multiplier: 1.4, scaling: 'def', kind: 'normal',
                       healPct: 0.112, healFlat: 224, spAdd: 1, energy: 20, aoe: true,
                       elationAppend: { id: '150308', multiplier: 0.20 } },
      // 150302 战技 补缀生命的柔光：+15 好活当赏，治疗 15% 防御 + 300
      skill: { id: '150302', name: '补缀生命的柔光', goodReward: 15, healPct: 0.15, healFlat: 300,
               spCost: 1, energy: 30 },
      // 150303 终结技 鉴映灵魂的底色：+20 好活当赏，深度学习 3 充能，指定美学底本
      ult: { id: '150303', name: '鉴映灵魂的底色', goodReward: 20, charges: 3, spCost: 0, energy: 5,
             advanceByCount: { 1: 0.10, 2: 0.15, 3: 0.30, 4: 0.30 }, extraTurnAtCount: 4,
             extraTurnGoodReward: 30, extraTurnJoke: 60, extraTurnElation: 0.75 },
      // 150304 天赋 吞纳沙砾，重塑生机：1 点好活当赏 = 200 抵御值，抵挡 60% 伤害，上限 50
      talent: { id: '150304', name: '吞纳沙砾，重塑生机', goodRewardCap: 50, goodRewardCapUpgraded: 75,
                wardPerPoint: 200, blockRatio: 0.60, lowHpThreshold: 0.50, lowHpDR: 0.375,
                infiniteDuration: true, teamDefence: true },
      // 150320 欢愉技 渲染理性，解构欢愉：按欢愉人数 12.5/18.75/25/50%
      elationSkills: [ { id: '150320', name: '渲染理性，解构欢愉', kind: 'elation', multiplierByCount: [0.125, 0.1875, 0.25, 0.50],
                         energy: 5 } ],
      // 150307 秘技 凝润珠光，复刻真迹：+20 好活当赏、2 充能
      maze: { id: '150307', name: '凝润珠光，复刻真迹', goodReward: 20, charges: 2 },
      // 150329 固有行迹 欢愉万相★跃然纸上
      innate: { id: '150329', name: '欢愉万相★跃然纸上', capTo: 75, extraTurnKeepRatio: 0.20, extraTurnKeepJoke: 0.20 }
    },
    traces: {
      // 洞察万物：防御力 >= 2400 时欢愉度 +32%，每超 100 再 +3%（最多计 3600），并获得欢愉度 20% 的治疗量加成
      t1: { name: '洞察万物', defThreshold: 2400, elationBase: 0.32, elationPer100: 0.03, maxPoints: 3600 },
      // 感知容差：持好活当赏时全队效果抵抗 +50%；我方每回合 +5 好活当赏（上限 50，真珠回合开始重置）
      t2: { name: '感知容差', goodRewardPerAllyTurn: 5, goodRewardPerRound: 50, statusRes: 0.50 },
      // 艺术壁垒：美学底本施放终结技时，为其固定回复 90 点能量（不叠加）
      t3: { name: '艺术壁垒', energyRefund: 90 }
    },
    eidolons: {
      1: { name: '珍珠，藏在海的留白处', elationDegreeByCount: { '2': 0.10, '3': 0.20, '4': 0.60 }, cheatDeath: true },
      2: { name: '截取，顷刻破晓的光斑', amplification: 0.15, extraTurnDouble: true, advanceOthersOnUlt: true },
      3: { name: '速写，惊涛悬停的刹那', ultLv: 2, basicLv: 1, elationLv: 1 },
      4: { name: '解译，唇角模糊的笑意', elationSkillMultiplierBonus: 1.0 },
      5: { name: '透视，笔端星夜的肌理', skillLv: 2, talentLv: 2, elationLv: 1 },
      6: { name: '用一副躯壳，演算生命', resPen: 0.20, enhancedBasicElation: 2.40 }
    }
  },

  // --------------------------------------------------------------------------
  // 1511 星神★阿哈（欢愉 / 量子）—— 体系辅助
  // --------------------------------------------------------------------------
  {
    id: '1511',
    name: '星神★阿哈',
    nameEn: 'Aeon ★ Aha',
    element: 'Quantum',
    elementZh: '量子',
    role: '辅助',
    base: { atk: 679.1, def: 509.4, hp: 1047.8, spd: 94, critRate: 0.05, critDmg: 0.5, elationDegree: 0.0 },
    traceBonus: { spd: 5, critRate: 0.12, critDmg: 0.373 },
    energy: { max: 8, perBasic: 1, perSkill: 1, perUlt: 0, perHit: 0, fervorMode: true },
    kit: {
      // 151101 普攻 点星，开幕！：70% 量子欢愉伤害
      basic: { id: '151101', name: '点星，开幕！', multiplier: 0.7, kind: 'elation', spAdd: 1, fervor: 1 },
      // 151102 战技 此乃令使，阿哈认证™：令使 +25% 欢愉度，追加全体 62.5% 欢愉伤害
      skill: { id: '151102', name: '此乃令使，阿哈认证™', multiplier: 0.625, kind: 'elation', spCost: 1,
               lordElationDegree: 0.25, lordFervor: 1, fervor: 1 },
      // 151103 终结技 啊哈！宇宙笑点大爆炸：240% 全体 + 5 x 72%
      ult: { id: '151103', name: '啊哈！宇宙笑点大爆炸', multiplier: 2.4, extraHits: 5, extraMultiplier: 0.72,
             kind: 'elation', fervorCost: 8, stanceTurns: 3, stanceDefIgnore: 0.30, defIgnoreE2: 0.60 },
      // 151104 天赋 与祂共演，奇迹新篇
      talent: { id: '151104', name: '与祂共演，奇迹新篇', fervorMax: 8, jokeThreshold: 40,
                teamCritDmg: 0.30, critDmgTurns: 3 },
      // 151120 欢愉技 满月，是神在的时间：75% 全体 + 本次阿哈时刻总伤害 20% 真伤
      elationSkills: [ { id: '151120', name: '满月，是神在的时间', kind: 'elation', multiplier: 0.75,
                         trueRatio: 0.20, trueRatioE4: 0.25, fervor: 1 } ],
      // 151107 秘技 ABRACADABRA！：进战使阿哈获得固定计入 20 点笑点的额外回合
      maze: { id: '151107', name: 'ABRACADABRA！', extraTurnJoke: 20, fervor: 0 },
      // 151129 固有行迹 欢愉万相★无中生有
      innate: { id: '151129', name: '欢愉万相★无中生有', defIgnore: 0.30, sparkRefundRatio: 0.10 },
      // 151131 阿哈正传（专属行迹技能）：欢愉负债 = 伤害值 25%，上限目标生命上限 10%
      debt: { id: '151131', name: '阿哈正传', ratio: 0.25, capMaxHpRatio: 0.10, e6AlwaysOn: 0.20 }
    },
    traces: {
      // 愚弄众神的玩笑：战技追加攻击额外对令使目标造成 20% 欢愉伤害并回 1 战技点
      t1: { name: '愚弄众神的玩笑', lordExtraElation: 0.20, spRefund: 1 },
      // 戏中人的异想国：受治疗/护盾时 +1 愿力，每轮 1 次，开大重置
      t2: { name: '戏中人的异想国', fervorOnHeal: 1, oncePerUlt: true },
      // 盒中蕴藏的世界：速度 >= 125 -> 欢愉度 +20%；>= 150 -> +50%
      t3: { name: '盒中蕴藏的世界', tiers: [ { spd: 125, elationDegree: 0.20 }, { spd: 150, elationDegree: 0.50 } ] }
    },
    // unique：阿哈时刻在（阿哈时刻基础速度 80 -> 星神★阿哈的基础速度）
    unique: { name: '阿哈时刻在', useOwnerSpeed: true, baseSpeed: 80 },
    eidolons: {
      1: { name: '谁在太初噤声时笑场', fervorOnStart: 4, amplification: 0.15 },
      2: { name: '在祂的眼睛和你之间', defIgnore: 0.60 },
      3: { name: '牌叠起，令悲喜轮回', ultLv: 2, basicLv: 1, elationLv: 1 },
      4: { name: '黑箱一个玩笑的命运', trueRatio: 0.25, countAlliesGoodReward: true },
      5: { name: '台前幕后，是我非我', skillLv: 2, talentLv: 2, elationLv: 1 },
      6: { name: '因为神说：你就是欢愉', debtAlwaysOn: 0.20, firstUltExtraTurnJoke: 40, ultAdvance: 0.20 }
    }
  }
];

function getCharacter(id) {
  for (var i = 0; i < CHARACTERS.length; i++) {
    if (CHARACTERS[i].id === String(id)) return CHARACTERS[i];
  }
  return null;
}



/* ===== sim.js ===== */
// ============================================================================
// 四人队伍模拟器内核：行动值时间轴 + 资源系统 + 完美轴策略 + 伤害结算
// 设计要点：
//   * 时间轴以行动值 AV 为单位（1 回合 = 10000 / 速度）
//   * 阿哈时刻是独立行动单位，速度由队伍欢愉角色速度推导（可用 unique 覆盖为阿哈自身速度）
//   * 好活当赏：参演阿哈时刻的角色获得「本次计入笑点」层数，持续 2 回合（真珠为无限）
//   * 欢愉伤害不吃攻击力/增伤，只吃 倍率 x 7535.107 x (1+欢愉度) x 笑点区 x 暴击 x 易伤 x 抗性 x 韧性 x 防御 x 增笑
// ============================================================================







// ---------------------------------------------------------------------------
// 星魂对技能等级的加成（逐字取自各角色 E3 / E5 原文，注意四人的 +2 技能并不相同）
//   1506 银狼   E3: 战技+2 普攻+1 欢愉技+1   E5: 终结技+2 天赋+2 欢愉技+1
//   1501 火花   E3: 战技+2 普攻+1 欢愉技+1   E5: 终结技+2 天赋+2 欢愉技+1
//   1503 真珠   E3: 终结技+2 普攻+1 欢愉技+1 E5: 战技+2 天赋+2 欢愉技+1
//   1511 阿哈   E3: 终结技+2 普攻+1 欢愉技+1 E5: 战技+2 天赋+2 欢愉技+1
// ---------------------------------------------------------------------------
const EIDOLON_SKILL_BONUS = {
  '1506': { 3: { skill: 2, basic: 1, elationSkill: 1 }, 5: { ult: 2, talent: 2, elationSkill: 1 } },
  '1501': { 3: { skill: 2, basic: 1, elationSkill: 1 }, 5: { ult: 2, talent: 2, elationSkill: 1 } },
  '1503': { 3: { ult: 2, basic: 1, elationSkill: 1 }, 5: { skill: 2, talent: 2, elationSkill: 1 } },
  '1511': { 3: { ult: 2, basic: 1, elationSkill: 1 }, 5: { skill: 2, talent: 2, elationSkill: 1 } }
};
const SLOT_CAPS = { basic: 10, skill: 15, ult: 15, talent: 15, elationSkill: 15, innate: 2, maze: 1 };
const SLOT_LABELS = { basic: '普攻', skill: '战技', ult: '终结技', talent: '天赋',
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
    ['kit.talent.teamCritDmg', '151104', 8],
    ['kit.elationSkills.0.multiplier', '151120', 0],
    ['kit.innate.defIgnore', '151129', 1]
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
function baseSkillLevel(unit, slot) {
  var v = unit.cfg && unit.cfg.skillLevels ? unit.cfg.skillLevels[slot] : undefined;
  if (typeof v === 'number' && v > 0) return v;
  var sids = (SKILL_SLOTS[unit.id] || {})[slot] || [];
  return sids.length ? (SKILL_BASE_CAPS[sids[0]] || 10) : 10;
}

// 实际生效等级 = 基础等级 + 星魂加成（受上限约束）
function effectiveSkillLevel(unit, slot, innateLv) {
  if (slot === 'innate') return innateLv || 1;
  var lv = baseSkillLevel(unit, slot);
  var bonus = EIDOLON_SKILL_BONUS[unit.id] || {};
  for (var r = 1; r <= (unit.eidolon || 0); r++) {
    if (bonus[r] && bonus[r][slot]) lv += bonus[r][slot];
  }
  return Math.max(1, Math.min(SLOT_CAPS[slot] || 15, lv));
}

// 固有行迹等级：默认 1 级；星神★阿哈 2 魂使「欢愉」命途升格效果加强 -> 2 级
function innateLevelOf(st) {
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
function eidolonInfo(id, unlocked) {
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
function characterInfo(id, cfg) {
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
function skillLevelInfo(unit, innateLv) {
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

const ENGINE_VERSION = '1.2.0';

var CYCLE_AV = 100;
var FIRST_CYCLE_AV = 150;

function round2(v) { return Math.round(v * 100) / 100; }
function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }

// 默认配置：面板默认值 = 站点满级基础值 + 行迹属性节点（裸装）。请按实际面板调整。
function defaultConfig() {
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
      add('critDmg', unit.def.kit.innate.critDmg, '固有行迹·兔子戏法');
      add('defIgnore', unit.def.kit.innate.defIgnore, '固有行迹·兔子戏法无视防御');
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
        st.lcAhaCd = lcParam(unit.lc, 2) || 2;
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
      if (unit.eidolon >= 6) {
        var e6 = unit.def.eidolons[6];
        advanceUnit(st, st.ahaMoment, e6.ultAdvance);          // 每次开大：阿哈行动提前 20%
        if (!unit.__e6FirstUlt) {
          unit.__e6FirstUlt = true;
          st.joke += e6.firstUltExtraTurnJoke;                  // 固定计入 40 笑点
          advanceUnit(st, st.ahaMoment, 1.0);                   // 立即获得 1 个额外回合
          entry.note = (entry.note ? entry.note + '；' : '') + '星魂6：阿哈立即获得额外回合（固定计入 ' + e6.firstUltExtraTurnJoke + ' 笑点）';
        }
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

// 行动提前
function advanceUnit(st, unit, ratio) {
  if (!ratio) return;
  var remaining = unit.nextAV - st.av;
  unit.nextAV = st.av + remaining * (1 - Math.min(1, ratio));
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
  if (sk.hits) {
    dealElation(st, unit, entry, { skillId: sk.id, skillName: sk.name, multiplier: mult, joke: joke, count: sk.hits });
  } else if (mult) {
    dealElation(st, unit, entry, { skillId: sk.id, skillName: sk.name, multiplier: mult, joke: joke, aoe: true });
  }
  if (sk.extraHits) {
    var extra = sk.extraMultiplier;
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
function defaultSkillLevels(id) {
  var out = {};
  var slots = SKILL_SLOTS[id] || {};
  for (var slot in slots) {
    // innate（固有行迹）等级由「命途升格 + 阿哈 2 魂」决定，不作为用户可调的基础等级
    if (slot === 'maze' || slot === 'innate') continue;
    out[slot] = SKILL_BASE_CAPS[slots[slot][0]] || 10;
  }
  return out;
}

function normalizeConfig(config) {
  return deepMerge(defaultConfig(), config || {});
}

function simulate(config) {
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

const ASSUMPTIONS = [
  '欢愉伤害公式：倍率 x 7535.107 x (1+欢愉度) x (1+笑点x5/(笑点+240)) x 暴击区 x 易伤区 x 抗性区 x 韧性减伤区 x 防御区 x (1+增笑)；不吃攻击力、生命与增伤。',
  '常规伤害使用标准公式（攻击力/防御力 x 倍率 x 增伤 x 暴击 x 防御区 x 抗性区 x 韧性区）。',
  '好活当赏层数 = 阿哈时刻计入的笑点；欢愉技同时吃好活当赏与当前笑点（可在配置中关闭）。',
  '阿哈时刻速度 = 80（经 unique 覆盖为阿哈自身速度）+ 队伍最快速度/5 + 次快/10 + 第三/20 + 第四/40。',
  '理想轴：必定暴击、盲盒固定触发（概率衰减仍生效）、礼物取主流选项、资源按完美轴分配。',
  '真珠的抵御值消耗不影响好活当赏层数（数据未说明二者是否同池），因此按层数不衰减处理。',
  '单目标环境（targetCount=1）；群攻技能对每个目标结算，由全体均分的技能按总量计。',
  '未建模：治疗量与生存、欢愉负债的逐次结算、击破流程、敌方行动造成的影响。'
];




/* ===== schema.js ===== */
// ============================================================================
// 参数表单描述：UI 与 CLI 都据此渲染 / 校验
// path 为 Config 的点号路径；default 与 defaultConfig() 保持一致
// ============================================================================







function f(path, label, type, extra) {
  return Object.assign({ path: path, label: label, type: type }, extra || {});
}
function n(path, label, dflt, min, max, step, help, unit) {
  return f(path, label, 'number', { default: dflt, min: min, max: max, step: step, help: help, unit: unit || '' });
}
function b(path, label, dflt, help) {
  return f(path, label, 'boolean', { default: dflt, help: help });
}
function s(path, label, options, dflt, help) {
  return f(path, label, 'select', { options: options, default: dflt, help: help });
}

function paramSchema() {
  var groups = [];

  groups.push({
    id: 'global', label: '全局 / 战斗环境', description: '影响所有人的乘区与时间轴设置',
    fields: [
      n('duration.cycles', '模拟轮数', 3, 1, 12, 1, '总行动值 = 首轮 150 + (轮数-1) x 100（3 轮 = 350 行动值）'),
      n('enemy.level', '敌人等级', 80, 1, 95, 1, '影响防御乘区'),
      b('enemy.weakness', '敌人有我方属性弱点', true, '有弱点时抗性 0%，否则按基础抗性 20% 计算'),
      n('enemy.resBase', '基础抗性（无弱点时）', 0.2, -1, 1, 0.05, '通常为 20%', '%'),
      n('enemy.resShred', '额外减抗', 0, -1, 1, 0.05, '来自遗器/辅助等外部来源', '%'),
      n('enemy.vulnerability', '易伤（受到的伤害提高）', 0, -1, 2, 0.05, '同类加算', '%'),
      n('enemy.toughnessDR', '未击破韧性减伤', 0.1, 0, 0.5, 0.05, '通常 10%', '%'),
      b('enemy.broken', '已击破（无韧性减伤）', false, '击破后韧性减伤为 0'),
      n('enemy.targetCount', '敌人数量', 1, 1, 5, 1, '影响群攻技能的结算目标数'),
      n('team.skillPoints.start', '初始战技点', 3, 0, 5, 1, ''),
      n('team.skillPoints.max', '战技点上限', 5, 1, 5, 1, ''),
      n('team.jokePoints.start', '初始笑点', 0, 0, 500, 1, ''),
      b('options.alwaysCrit', '必定暴击（理想轴）', true, '关闭后按 暴击率 x 暴伤 计算期望伤害'),
      b('options.infiniteSkillPoints', '无限战技点（理论上限）', false, '开启后忽略战技点约束，用于查看完美轴的理论上限'),
      b('options.includeMaze', '计入秘技进场效果', true, '真珠 +20 好活当赏/2 充能、银狼 99 层好活当赏、阿哈 20 笑点等'),
      s('options.blindboxMode', '银狼【头号补给盲盒】结算方式', [
        { value: 'expected', label: '期望值（推荐）：按触发概率折算，概率会衰减' },
        { value: 'always', label: '理论上限：每次消耗战技点都触发' }
      ], 'expected', '游戏内每次成功触发后概率降为当前的 20%，因此期望触发次数远小于消耗次数'),
      b('options.includeTrueDamage', '计入真实伤害', true, '真珠/阿哈/银狼盲盒的真伤'),
      b('options.goodRewardOnElationSkill', '欢愉技同时吃笑点与好活当赏', true, '关闭后欢愉技只吃自身好活当赏'),
      n('options.elationBaseValue', '欢愉伤害基础值（80 级）', ELATION_BASE_VALUE, 0, 20000, 0.001, '官方数值 7535.107'),
      n('options.jokeCurveK', '笑点乘区系数 k', JOKE_K, 0, 20, 0.5, '乘区 = 1 + 笑点 x k / (笑点 + c)'),
      n('options.jokeCurveC', '笑点乘区常数 c', JOKE_C, 1, 1000, 1, ''),
      b('team.ahaMoment.useOwnerSpeed', '阿哈时刻使用阿哈自身速度作基础', true, '对应专属机制「阿哈时刻在」：基础速度 80 -> 阿哈速度'),
      n('team.ahaMoment.baseSpeed', '阿哈时刻基础速度', 80, 0, 200, 1, '未启用「阿哈时刻在」时生效'),
      n('team.ahaMoment.divisor1', '队伍最快速度除数', 5, 1, 50, 1, '阿哈速度 += 最快速度 / 除数'),
      n('team.ahaMoment.divisor2', '第二快速度除数', 10, 1, 50, 1, ''),
      n('team.ahaMoment.divisor3', '第三快速度除数', 20, 1, 50, 1, ''),
      n('team.ahaMoment.divisor4', '第四快速度除数', 40, 1, 50, 1, '')
    ]
  });

  var statFields = function (id) {
    return [
      b('characters.' + id + '.enabled', '启用该角色', true, ''),
      n('characters.' + id + '.level', '等级', 80, 1, 80, 1, ''),
      s('characters.' + id + '.eidolon', '星魂解锁等级', eidolonOptions(id), 0,
        '选择已解锁的星魂等级；3、5 魂提升技能等级，其余为机制质变'),
      n('characters.' + id + '.stats.atk', '攻击力', 0, 0, 20000, 1, '欢愉伤害不吃攻击力，但影响行迹「笑点签售会」等判定'),
      n('characters.' + id + '.stats.def', '防御力', 0, 0, 20000, 1, '真珠的伤害与治疗按防御力缩放'),
      n('characters.' + id + '.stats.hp', '生命值', 0, 0, 30000, 1, ''),
      n('characters.' + id + '.stats.spd', '速度', 0, 50, 300, 0.1, '决定出手频率与阿哈时刻速度'),
      n('characters.' + id + '.stats.critRate', '暴击率', 0, 0, 1, 0.01, '理想轴下仅影响期望模式', '%'),
      n('characters.' + id + '.stats.critDmg', '暴击伤害', 0, 0, 10, 0.01, '理想轴核心乘区之一', '%'),
      n('characters.' + id + '.stats.elationDegree', '欢愉度', 0, 0, 20, 0.01, '欢愉伤害的独立乘区', '%'),
      b('characters.' + id + '.rotation.useMaze', '使用秘技进场', true, ''),
      s('characters.' + id + '.rotation.mode', '循环策略', [
        { value: 'perfect', label: '完美轴（推荐）' },
        { value: 'conservative', label: '保守轴（省战技点）' }
      ], 'perfect', '完美轴：资源全开追求上限')
    ];
  };

  for (var i = 0; i < CHARACTERS.length; i++) {
    var c = CHARACTERS[i];
    var d = defaultStatFor(c);
    var fields = statFields(c.id);
    // 覆盖默认值
    for (var j = 0; j < fields.length; j++) {
      var p = fields[j].path;
      if (p.indexOf('.stats.') >= 0) fields[j].default = d[p.split('.stats.')[1]];
    }
    if (c.id === '1511') {
      fields.push(s('characters.1511.rotation.lordTarget', '「欢愉」令使目标', [
        { value: '1506', label: '银狼LV.999' },
        { value: '1501', label: '火花' },
        { value: '1503', label: '真珠' },
        { value: '1511', label: '星神★阿哈' }
      ], '1506', '令使提供 +25% 欢愉度，并让阿哈回合开始回愿力'));
    }
    if (c.id === '1501') {
      fields.push(n('characters.1501.rotation.maxTrapsPerTurn', '每次连线最多发动互动陷阱', 20, 0, 20, 1, '每次消耗 1 战技点'));
    }
    // 专属光锥：默认装备；叠影 1-5 可调
    var sigId = SIGNATURE_LIGHTCONE[c.id];
    var sig = LIGHTCONES[sigId];
    if (sig) {
      fields.push(b('characters.' + c.id + '.lightcone.enabled',
        '装备专属光锥（' + sig.name + '）', true,
        sig.rarity + '★ ' + sig.passive + '：' + (sig.desc || '').slice(0, 60) + '…'));
      fields.push(s('characters.' + c.id + '.lightcone.superimpose', '光锥叠影', [
        { value: 1, label: '叠影 1' }, { value: 2, label: '叠影 2' }, { value: 3, label: '叠影 3' },
        { value: 4, label: '叠影 4' }, { value: 5, label: '叠影 5' }
      ], 1, '叠影越高，光锥被动数值越高'));
    }
    // 遗器：外圈 4 件套 / 内圈 2 件套 / 副词条有效词条数
    var rec = RECOMMENDED_RELICS[c.id];
    if (rec) {
      var opts4 = (rec.set4 || []).map(function (sid2) {
        return { value: sid2, label: (RELICS[sid2] ? RELICS[sid2].name : sid2) + (sid2 === rec.set4[0] ? '（首选）' : '') };
      });
      var opts2 = (rec.set2 || []).map(function (sid2) {
        return { value: sid2, label: (RELICS[sid2] ? RELICS[sid2].name : sid2) + (sid2 === rec.set2[0] ? '（首选）' : '') };
      });
      fields.push(b('characters.' + c.id + '.relics.enabled', '装备遗器（主词条 + 副词条 + 套装）', true,
        '关闭后只按角色面板计算'));
      fields.push(s('characters.' + c.id + '.relics.set4', '外圈 4 件套', opts4, rec.set4[0], ''));
      fields.push(s('characters.' + c.id + '.relics.set2', '内圈 2 件套', opts2, rec.set2[0], ''));
      fields.push(n('characters.' + c.id + '.relics.substatRolls', '副词条有效词条数', 20, 0, 45, 1,
        '0 = 只算主词条；中等练度约 18–22 条，毕业约 28–32 条（按站点给出的副词条优先级加权分配）'));
    }
    // 技能基础等级（不含星魂加成）：默认 = 行迹节点上限，星魂 3/5 再叠加
    var slots = SKILL_SLOTS[c.id] || {};
    for (var slotName of ['basic', 'skill', 'ult', 'talent', 'elationSkill']) {
      if (!slots[slotName]) continue;
      var cap = SKILL_BASE_CAPS[slots[slotName][0]] || 10;
      fields.push(n('characters.' + c.id + '.skillLevels.' + slotName,
        SLOT_LABELS[slotName] + '基础等级（未含星魂加成）', cap, 1, cap, 1,
        '0 魂上限 ' + cap + '，满星魂后上限 ' + (SLOT_CAPS[slotName] || 15)));
    }
    groups.push({
      id: c.id, label: c.name + '（' + c.elementZh + ' / 欢愉）',
      description: c.role + '，基础速度 ' + c.base.spd,
      fields: fields
    });
  }
  return { version: '1.0.0', groups: groups };
}

// 星魂下拉选项：把每一级的效果摘要写进标签，便于直接挑选
function eidolonOptions(id) {
  var list = EIDOLON_INFO[id] || [];
  var bonus = EIDOLON_SKILL_BONUS[id] || {};
  var opts = [{ value: 0, label: '0 魂（未解锁）' }];
  var acc = {};
  for (var r = 1; r <= 6; r++) {
    var info = list[r - 1] || {};
    var skillPart = '';
    if (bonus[r]) {
      var parts = [];
      for (var slot in bonus[r]) {
        acc[slot] = (acc[slot] || 0) + bonus[r][slot];
        parts.push(SLOT_LABELS[slot] + '+' + bonus[r][slot]);
      }
      skillPart = '（' + parts.join('，') + '）';
    }
    opts.push({ value: r, label: r + ' 魂 · ' + (info.name || '') + skillPart });
  }
  return opts;
}

function defaultStatFor(c) {
  var t = c.traceBonus || {};
  return {
    atk: Math.round((c.base.atk + (t.atkFlat || 0)) * 100) / 100,
    def: Math.round(c.base.def * (1 + (t.defPct || 0)) * 100) / 100,
    hp: Math.round(c.base.hp * 100) / 100,
    spd: Math.round((c.base.spd + (t.spd || 0)) * 10) / 10,
    critRate: Math.round((c.base.critRate + (t.critRate || 0)) * 1000) / 1000,
    critDmg: Math.round((c.base.critDmg + (t.critDmg || 0)) * 1000) / 1000,
    elationDegree: Math.round((c.base.elationDegree + (t.elationDegree || 0)) * 1000) / 1000
  };
}


var API = { ENGINE_VERSION: ENGINE_VERSION, paramSchema: paramSchema, defaultConfig: defaultConfig, simulate: simulate, normalizeConfig: normalizeConfig, CHARACTERS: CHARACTERS, getCharacter: getCharacter, ASSUMPTIONS: ASSUMPTIONS, characterInfo: characterInfo, eidolonInfo: eidolonInfo, skillLevelInfo: skillLevelInfo, defaultSkillLevels: defaultSkillLevels, baseSkillLevel: baseSkillLevel, effectiveSkillLevel: effectiveSkillLevel, innateLevelOf: innateLevelOf, EIDOLON_SKILL_BONUS: EIDOLON_SKILL_BONUS, SLOT_CAPS: SLOT_CAPS, SLOT_LABELS: SLOT_LABELS, LIGHTCONES: LIGHTCONES, SIGNATURE_LIGHTCONE: SIGNATURE_LIGHTCONE, resolveLightcone: resolveLightcone, lightconeInfo: lightconeInfo, applyLightconeStats: applyLightconeStats, RELICS: RELICS, RECOMMENDED_RELICS: RECOMMENDED_RELICS, RELIC_EFFECTS: RELIC_EFFECTS, resolveRelics: resolveRelics, relicPanelBonus: relicPanelBonus, relicInfo: relicInfo, MAIN_STAT_VALUES: MAIN_STAT_VALUES, SUBSTAT_VALUES: SUBSTAT_VALUES };
if (typeof window !== "undefined") window.HSR_ENGINE = API;
if (typeof globalThis !== "undefined") globalThis.HSR_ENGINE = API;
})();
