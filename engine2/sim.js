// engine2/sim.js —— 通用战斗模拟（行动值时间轴 + 战技点 + 能量 + buff + 韧性/击破 + DoT + 追加攻击）
// 设计：静态上下文 ctx（kit、面板、解析后的效果/技能段）与可深拷贝的动态状态 state 分离，
// 以便 search.js 做 beam search。state 只含纯 JSON 数据；时间轴日志用共享的不可变链表。
import { normalHit, elationHit, critRegion, breakHit, superBreakHit, clamp } from './formula.js';
import { computeStatsWith, composeStats, publicStats } from './stats.js';
import { collectEffects, skillParams, isPanelEffect, INSTANT_STATS } from './effects.js';

export var ACTION_SLOTS = { basic: 'A', skill: 'E', ult: 'Q', enhancedBasic: 'A+', enhancedSkill: 'E+', elation: 'X', memo: 'M' };
var CODE_NAME = { A: 'basic', E: 'skill', Q: 'ult', F: 'fua', M: 'memo', 'A+': 'enhancedBasic', 'E+': 'enhancedSkill', X: 'elation' };
export var BYTYPE_KEYS = ['basic', 'skill', 'ult', 'fua', 'dot', 'break', 'elation', 'true', 'memo'];
var TRIGGER_OF_SLOT = { basic: 'onBasic', enhancedBasic: 'onBasic', skill: 'onSkill', enhancedSkill: 'onSkill', ult: 'onUlt' };
var SKILL_SPECIFIC_SLOTS = { basic: 1, skill: 1, ult: 1, enhancedBasic: 1, enhancedSkill: 1, elation: 1, memo: 1 };

function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }

// ---------------------------------------------------------------------------
// 静态上下文
// ---------------------------------------------------------------------------
export function buildContext(data, cfg, overrides) {
  overrides = overrides || {};
  var battle = cfg.battle || {};
  var opts = cfg.options || {};
  var enemy = cfg.enemy || {};
  var warnings = [];
  var ctx = {
    data: data, cfg: cfg, opts: opts, enemyCfg: enemy, warnings: warnings,
    battle: {
      cycles: num(battle.cycles, 3), firstCycleAV: num(battle.firstCycleAV, 150), avPerCycle: num(battle.avPerCycle, 100),
      startSP: num(battle.startSP, 3), maxSP: num(battle.maxSP, 5), startEnergyPct: num(battle.startEnergyPct, 0.5)
    },
    members: [], mainC: 0
  };
  ctx.totalAV = ctx.battle.firstCycleAV + Math.max(0, ctx.battle.cycles - 1) * ctx.battle.avPerCycle;
  ctx.enemyCount = clamp(Math.round(num(enemy.count, 1)), 1, 5);
  ctx.enemyLevel = num(enemy.level, 95);
  ctx.enemyToughness = Math.max(0, num(enemy.toughness, 160));
  ctx.enemySpd = Math.max(1, num(enemy.spd, 132));
  ctx.enemyWeak = {};
  (enemy.weak || []).forEach(function (w) { ctx.enemyWeak[w] = 1; });

  (cfg.team || []).forEach(function (member, idx) {
    var ch0 = data.characters[member.charId];
    if (!ch0) { warnings.push('未知角色 ' + member.charId + '，已跳过'); return; }
    var ov = overrides[member.charId] || null;
    var ch = ch0;
    if (ov && typeof ov.patchKit === 'function') {
      ch = ov.patchKit(JSON.parse(JSON.stringify(ch0)), member, enemy) || ch0;
    }
    // patchKit 后的 kit 需要被 computeStats / collectEffects 使用 → 用浅层替换的数据视图
    var dview = ch === ch0 ? data : Object.assign({}, data, { characters: Object.assign({}, data.characters, (function () { var o = {}; o[member.charId] = ch; return o; })()) });
    var panel = computeStatsWith(dview, member, { ignoreConditions: !!opts.ignoreConditions });
    panel._warnings.forEach(function (w) { warnings.push(ch.name + '：' + w); });
    var effs = collectEffects(dview, member, { ignoreConditions: !!opts.ignoreConditions });
    var policy = Object.assign({ mode: 'auto', ultMode: 'asap', fuaPerTurn: null }, member.policy || {});
    var m = {
      idx: ctx.members.length, charId: member.charId, name: ch.name, ch: ch, member: member, panel: panel,
      panelComposed: composeStats(panel._base, panel._bag, ch.element),
      level: num(member.level, 80), element: ch.element,
      energyMax: num(ch.energyMax, 120) || 120,
      effects: effs.list.filter(function (e) { return !isPanelEffect(e); }),
      policy: policy, override: ov, hooks: (ov && ov.hooks) || {},
      skills: {}, fuaSkills: [], dotSkills: [], memoSkill: null, breakHits: [],
      eidolon: num(member.eidolon, 0), ultResource: ch.ultResource || 'energy',
      customUltEvery: Math.max(1, Math.round(num(policy.customUltEvery, 3)))
    };
    var spMax = 0;
    m.effects = m.effects.filter(function (e) {
      if (e.stat !== 'spMax') return true;
      if (e.trigger === 'passive' || e.trigger === 'conditional' || e.trigger === 'battleStart') spMax += num(e.value, 0);
      return false;
    });
    if (spMax) { ctx.battle.maxSP += spMax; }
    (ch.skills || []).forEach(function (s) {
      var rs = resolveSkill(ch, member, s);
      if (!m.skills[s.slot]) m.skills[s.slot] = rs;
      if (s.slot === 'talent' || s.slot === 'other') {
        var fh = rs.hits.filter(function (h) { return h.dmgType === 'fua' && !h.trigger; });
        if (fh.length) m.fuaSkills.push(Object.assign({}, rs, { hits: fh, specials: [] }));
      }
      rs.hits.forEach(function (h) { if (h.trigger === 'onBreak') m.breakHits.push(h); });
    });
    if (m.ultResource === 'custom' && !(ov && ov.hooks && ov.hooks.ultReady)) {
      warnings.push(ch.name + '：终结技使用专属资源（非能量），近似为每 ' + m.customUltEvery + ' 个自身回合释放一次（可在该角色「排轴策略 → 专属资源终结技间隔」中调整）');
    }
    // 忆灵：取第一个带伤害段的技能，随主角色回合出手
    if (ch.memosprite && ch.memosprite.skills) {
      for (var i = 0; i < ch.memosprite.skills.length; i++) {
        var ms = resolveSkill(ch, member, ch.memosprite.skills[i]);
        if (ms.hits.length) { m.memoSkill = ms; break; }
      }
    }
    if ((m.skills.enhancedBasic || m.skills.enhancedSkill) && !(ov && ov.hooks && ov.hooks.actions)) {
      warnings.push(ch.name + '：存在强化普攻/战技，通用引擎不自动进入强化形态（需 override）');
    }
    if (m.skills.elation && !(ov && ov.hooks && ov.hooks.actions)) {
      warnings.push(ch.name + '：欢愉技由专属机制触发，通用引擎暂不释放（需 override）');
    }
    if (!m.skills.basic) warnings.push(ch.name + '：缺少普攻数据');
    ctx.members.push(m);
  });
  if (!ctx.members.length) throw new Error('队伍为空');
  // 伤害估计（无 buff、基础面板）→ 主 C 与启发式
  ctx.members.forEach(function (m) {
    m.est = {};
    ['basic', 'skill', 'ult'].forEach(function (slot) {
      m.est[slot] = m.skills[slot] ? estimateSkill(ctx, m, m.skills[slot]) : 0;
    });
    m.est.fua = m.fuaSkills.reduce(function (a, s) { return a + estimateSkill(ctx, m, s); }, 0);
    m.est.potential = Math.max(m.est.skill, m.est.basic) * 3 + m.est.ult + m.est.fua * 3;
  });
  var best = 0;
  ctx.members.forEach(function (m, i) { if (m.est.potential > ctx.members[best].est.potential) best = i; });
  ctx.mainC = best;
  ctx.members.forEach(function (m) {
    var bt = m.policy.buffTarget;
    m.allyTarget = best;
    if (bt != null) {
      var j = ctx.members.findIndex(function (x, k) { return x.charId === String(bt) || k === bt; });
      if (j >= 0) m.allyTarget = j;
    } else if (best === m.idx && ctx.members.length > 1) {
      // 自己就是主 C 时，“单体队友”取次高者
      var second = -1;
      ctx.members.forEach(function (x, k) { if (k !== m.idx && (second < 0 || x.est.potential > ctx.members[second].est.potential)) second = k; });
      m.allyTarget = second;
    }
  });
  if (ctx.battle.maxSP !== num(battle.maxSP, 5)) warnings.push('战技点上限调整为 ' + ctx.battle.maxSP + '（队伍效果）');
  var dpsGain = 0;
  ctx.members.forEach(function (m) { dpsGain = Math.max(dpsGain, m.est.skill - m.est.basic); });
  ctx.spValue = Math.max(dpsGain, ctx.members[best].est.basic * 0.3) * 0.9;
  return ctx;
}

export function resolveSkill(ch, member, s) {
  var p = skillParams(ch, member, s);
  var hits = (s.hits || []).map(function (h, k) {
    var mult = h.param != null ? num(p[h.param], 0) : num(h.multiplier, 0);
    var cnt = h.countParam != null ? num(p[h.countParam], 1) : num(h.count, 1);
    var o = {
      idx: k, scaling: h.scaling || 'atk', mult: mult, count: Math.max(0, cnt), target: h.target || 'single',
      element: h.element || ch.element, dmgType: h.dmgType || slotDmgType(s.slot), duration: h.duration || null,
      raw: h.raw || ''
    };
    if (h.durationParam != null && p[h.durationParam] != null) o.duration = num(p[h.durationParam], o.duration);
    // 复合倍率：(params[extra.param] × extra.stat 面板 + mult) × 主属性
    if (h.extra && h.extra.stat) {
      o.extraStat = h.extra.stat; o.extraMult = h.extra.param != null ? num(p[h.extra.param], 0) : num(h.extra.mult, 0);
      // 「最多计算 X% 击破特攻」之类的上限：extra.capParam / extra.cap
      if (h.extra.capParam != null && p[h.extra.capParam] != null) o.extraCap = num(p[h.extra.capParam], null);
      else if (h.extra.cap != null) o.extraCap = num(h.extra.cap, null);
    }
    if (h.trigger) o.trigger = h.trigger;
    if (h.triggerActor) o.triggerActor = h.triggerActor;
    if (h.additional) o.additional = true;
    if (h.fixedCrit) o.fixedCrit = h.fixedCrit;
    if (h.alsoTypes) o.alsoTypes = h.alsoTypes.slice();
    return o;
  });
  var specials = (s.specials || []).map(function (x) {
    return { kind: x.kind || x.type, param: x.param, ratio: x.param != null ? num(p[x.param], 0) : num(x.ratio, 0), raw: x.raw || '' };
  });
  return {
    id: s.id, slot: s.slot, name: s.name, tag: s.tag, params: p,
    spCost: num(s.spCost, s.slot === 'skill' ? 1 : 0), spGain: num(s.spGain, s.slot === 'basic' ? 1 : 0),
    energyGain: num(s.energyGain, 0),
    toughness: s.toughness || { main: 0, aoe: 0, adjacent: 0 },
    hits: hits, specials: specials,
    effectDuration: maxEffectDuration(s, p)
  };
}
function maxEffectDuration(s, p) {
  var d = 0;
  (s.effects || []).forEach(function (e) {
    if (INSTANT_STATS[e.stat]) return;
    var v = typeof e.duration === 'number' ? e.duration : null;
    if (v != null && v > d) d = v;
  });
  return d || null;
}
// 普通伤害段（不含 onAllyAttack / onBreak / onBreakRecover 等触发式段）
export function directHits(rs) {
  if (!rs._direct) Object.defineProperty(rs, '_direct', { value: rs.hits.filter(function (h) { return !h.trigger; }), enumerable: false });
  return rs._direct;
}
function isAttackSkill(rs) {
  var d = directHits(rs);
  for (var k = 0; k < d.length; k++) if (d[k].mult > 0 && d[k].dmgType !== 'dot') return true;
  return d.some(function (h) { return h.mult > 0; });
}

function slotDmgType(slot) {
  if (slot === 'basic' || slot === 'enhancedBasic') return 'basic';
  if (slot === 'skill' || slot === 'enhancedSkill') return 'skill';
  if (slot === 'ult') return 'ult';
  if (slot === 'talent') return 'fua';
  if (slot === 'memo') return 'memo';
  if (slot === 'elation') return 'elation';
  return 'skill';
}

function estimateSkill(ctx, m, rs) {
  var st = initialState(ctx);
  var sum = 0;
  directHits(rs).forEach(function (h) {
    if (h.dmgType === 'dot') sum += hitDamage(st, ctx, m.idx, h, 0).total * (h.duration || 2);
    else if (h.scaling !== 'true') sum += hitDamage(st, ctx, m.idx, h, 0).total;
  });
  return sum;
}

// ---------------------------------------------------------------------------
// 动态状态
// ---------------------------------------------------------------------------
export function initialState(ctx) {
  var st = {
    av: 0, sp: ctx.battle.startSP, done: false, dmg: 0, byType: {}, log: null, steps: 0,
    units: ctx.members.map(function (m) {
      var spd = m.panel.spd;
      return {
        nextAv: 10000 / spd, energy: m.energyMax * ctx.battle.startEnergyPct, turns: 0, inTurn: false,
        spdCur: spd, dmg: 0, buffs: [], counts: {}, rot: '', custom: {}, ultTurns: 0
      };
    }),
    enemy: { nextAv: 10000 / ctx.enemySpd, toughness: ctx.enemyToughness, broken: false, turns: 0, spdCur: ctx.enemySpd,
      debuffs: [], dots: [], breaks: 0, triggers: [] },
    custom: {}, shared: {}, auras: [], timers: []
  };
  ctx.members.forEach(function (m) { st.custom[m.charId] = {}; });
  BYTYPE_KEYS.forEach(function (k) { st.byType[k] = 0; });
  return st;
}

export function cloneState(s) {
  var c = {
    av: s.av, sp: s.sp, done: s.done, dmg: s.dmg, byType: Object.assign({}, s.byType), log: s.log, steps: s.steps,
    units: s.units.map(function (u) {
      return {
        nextAv: u.nextAv, energy: u.energy, turns: u.turns, inTurn: u.inTurn, spdCur: u.spdCur, dmg: u.dmg, pendingAdvance: u.pendingAdvance || 0,
        avLock: !!u.avLock,
        buffs: u.buffs.map(function (b) { return Object.assign({}, b); }), counts: Object.assign({}, u.counts), rot: u.rot,
        custom: isEmpty(u.custom) ? {} : deepCopy(u.custom), ultTurns: u.ultTurns || 0
      };
    }),
    enemy: {
      nextAv: s.enemy.nextAv, toughness: s.enemy.toughness, broken: s.enemy.broken, inTurn: false, turns: s.enemy.turns, spdCur: s.enemy.spdCur,
      debuffs: s.enemy.debuffs.map(function (b) { return Object.assign({}, b); }),
      dots: s.enemy.dots.map(function (d) { return Object.assign({}, d); }), breaks: s.enemy.breaks,
      triggers: (s.enemy.triggers || []).map(function (d) { return Object.assign({}, d); })
    },
    custom: copyCustom(s.custom || {}), shared: isEmpty(s.shared || {}) ? {} : deepCopy(s.shared),
    auras: (s.auras || []).map(function (a) { return Object.assign({}, a, { holders: a.holders.slice() }); }),
    timers: (s.timers || []).map(function (t) { return Object.assign({}, t); })
  };
  if (s.pending) c.pending = s.pending; // 选项列表只读，共享
  return c;
}
function deepCopy(o) { return typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)); }
function isEmpty(o) { for (var k in o) return false; return true; }
function copyCustom(c) {
  var o = {};
  for (var k in c) { var v = c[k]; o[k] = v && typeof v === 'object' ? (isEmpty(v) ? (Array.isArray(v) ? [] : {}) : deepCopy(v)) : v; }
  return o;
}

function pushLog(st, e) { st.log = { e: e, p: st.log }; }
export function logToArray(log) {
  var a = [];
  for (var n = log; n; n = n.p) a.push(n.e);
  return a.reverse();
}

// ---------------------------------------------------------------------------
// 属性聚合
// ---------------------------------------------------------------------------
function buffBag(list) {
  var bag = {};
  for (var i = 0; i < list.length; i++) {
    var b = list[i];
    bag[b.stat] = (bag[b.stat] || 0) + b.value * b.stacks;
  }
  return bag;
}

// 战斗内某成员的属性（局外面板 + 身上 buff），bag 为全部原始键之和
export function combatStats(st, ctx, i) {
  var m = ctx.members[i];
  var cb = buffBag(st.units[i].buffs);
  var bag = Object.assign({}, m.panel._bag);
  for (var k in cb) bag[k] = (bag[k] || 0) + cb[k];
  var s = composeStats(m.panel._base, bag, m.element);
  var ov = m.panel._overrides;
  for (var ok in ov) {
    if (ok === 'dmgBonus' || ok === 'elementDmg') { s.elementDmg = ov[ok] + (s.elementDmg - m.panelComposed.elementDmg); continue; }
    if (typeof s[ok] === 'number') s[ok] = ov[ok] + (s[ok] - m.panelComposed[ok]);
  }
  s.bag = bag;
  return s;
}

function refreshSpeed(st, ctx, i) {
  var u = st.units[i];
  var spd = Math.max(1, combatStats(st, ctx, i).spd);
  if (Math.abs(spd - u.spdCur) > 1e-9) {
    // avLock：下一次行动值已被钩子写成绝对时刻（知更鸟协奏倒计时），不随速度比例重算
    if (!u.avLock && u.nextAv > st.av) u.nextAv = st.av + (u.nextAv - st.av) * u.spdCur / spd;
    u.spdCur = spd;
  }
}

// 敌人速度 = 基础速度 × (1+Σ速度%) + Σ固定速度。减速/加速按剩余行动值同比缩放。
function refreshEnemySpeed(st, ctx) {
  var en = st.enemy;
  var bag = buffBag(en.debuffs);
  var spd = Math.max(1, ctx.enemySpd * (1 + (bag.spdPct || 0)) + (bag.spd || 0));
  if (Math.abs(spd - en.spdCur) > 1e-9) {
    if (en.nextAv > st.av) en.nextAv = st.av + (en.nextAv - st.av) * en.spdCur / spd;
    en.spdCur = spd;
  }
}

// ---------------------------------------------------------------------------
// 伤害
// ---------------------------------------------------------------------------
export function targetCount(ctx, target) {
  var n = ctx.enemyCount;
  if (target === 'aoe') return n;
  if (target === 'adjacent') return Math.min(2, n - 1);
  return 1; // single / bounce / random（弹射总段数由 count 表示）
}

/**
 * 计算一段伤害（不修改状态）。返回 { per, total, targets }
 * refDamage：真实伤害参照（本次行动此前各段伤害之和）
 */
export function hitDamage(st, ctx, i, h, refDamage, extra) {
  var m = ctx.members[i];
  var s = combatStats(st, ctx, i);
  var bag = s.bag;
  var eb = buffBag(st.enemy.debuffs);
  var E = ctx.enemyCfg;
  var el = h.element || m.element;
  var t = h.dmgType;
  var targets = targetCount(ctx, h.target);
  if (!targets || (!h.mult && !h.extraStat)) return { per: 0, total: 0, targets: targets };
  var g = function (k) { return (bag[k] || 0) + (eb[k] || 0); };
  var ga = function (p) { var s = 0, at = h.alsoTypes || []; for (var q = 0; q < at.length; q++) if (at[q] !== t) s += g(p + at[q]); return s; };
  var res = E.res && E.res[el] != null ? E.res[el] : 0.2;
  var resShred = g('resShred') + g('resShred_' + el) + g('resPen') + g('resPen_' + el) + g('resPen_' + t) + ga('resPen_') + num(E.extraResShred, 0);
  var vuln = g('vuln') + g('vuln_' + t) + ga('vuln_') + g('vuln_' + el) + num(E.extraVuln, 0);
  var defShred = g('defShred') + num(E.extraDefShred, 0);
  var defIgnore = g('defIgnore') + g('defIgnore_' + t) + ga('defIgnore_');
  var broken = !!E.alwaysBroken || st.enemy.broken;
  var always = ctx.opts.critMode === 'always';
  var cr = Math.min(1, Math.max(0, s.critRate + g('critRate_' + t) + ga('critRate_') + (eb.critRate || 0)));
  var cd = s.critDmg + g('critDmg_' + t) + ga('critDmg_') + (eb.critDmg || 0);
  // 持续伤害不能暴击（Fandom「Damage」：Unless an effect says otherwise, DoT damage cannot CRIT）
  var noCrit = t === 'dot' && !h.fixedCrit && !h.canCrit;
  if (noCrit) { cr = 0; cd = 0; }
  if (h.fixedCrit) { if (h.fixedCrit.rate != null) cr = Math.min(1, h.fixedCrit.rate); if (h.fixedCrit.dmg != null) cd = h.fixedCrit.dmg; }
  var mult = h.mult;
  if (h.extraStat) { var xv = statValue(s, h.extraStat); if (h.extraCap != null) xv = Math.min(xv, h.extraCap); mult += (h.extraMult || 0) * xv; }
  if (!mult) return { per: 0, total: 0, targets: targets };
  var common = {
    critRate: always && !noCrit ? 1 : cr, critDmg: cd, alwaysCrit: always && !noCrit,
    vulnerability: [vuln], res: res, resShred: resShred, toughnessDR: 0.1, broken: broken,
    attackerLevel: m.level, targetLevel: ctx.enemyLevel, defShred: defShred, defIgnore: defIgnore
  };
  var per = 0;
  var cnt = h.count == null ? 1 : h.count;
  var __z = null;
  if (h.scaling === 'true') {
    per = mult * (h.ref != null ? num(h.ref, 0) : (refDamage || 0)) / Math.max(1, targets);
    __z = [__hsrZone('base', '参考伤害', (h.ref != null ? num(h.ref, 0) : (refDamage || 0)), null, 'table', 'high'), __hsrZone('multiplier', '真实伤害比例', mult, null, 'table', 'high'), __hsrZone('split', '均分目标', 1 / Math.max(1, targets))];
  } else if (h.scaling === 'elation') {
    var joke = h.joke != null ? num(h.joke, 0) : st.shared && st.shared.joke != null ? num(st.shared.joke, 0) : num(ctx.opts.teamJoke, 10);
    var __re = elationHit(Object.assign({}, common, {
      multiplier: mult, elationDegree: s.elation, joke: joke,
      amplification: [g('elationAmp') + g('amplification') + g('amplification_elation') + num(h.amplification, 0)]
    })); per = __re.damage * cnt; __z = __hsrScale(__re.zones, cnt);
  } else if (h.scaling === 'break') {
    // 击破类伤害：vuln 已含 vuln_<dmgType>；dmgType 非 break 时补上 vuln_break（v2.1 以前 dmgType=break 时 vuln_break 被计两次）
    var __rb = breakHit({
      element: el, maxToughness: ctx.enemyToughness, breakEffect: s.breakEffect, vulnerability: [vuln + (t === 'break' ? 0 : g('vuln_break'))],
      res: res, resShred: resShred, attackerLevel: m.level, targetLevel: ctx.enemyLevel, defShred: defShred, defIgnore: defIgnore,
      broken: broken
    }); per = mult * (1 + g('dmgBonus_break')) * __rb.damage * cnt;
    __z = [__rb.zones[0], __hsrZone('multiplier', '倍率', mult * cnt, null, 'table', 'high'), __hsrZone('bonus', '击破增伤', 1 + g('dmgBonus_break'))].concat(__rb.zones.slice(1));
  } else {
    var scal = h.scaling === 'hp' ? s.hp : h.scaling === 'def' ? s.def : s.atk;
    var db = g('dmgBonus') + g('dmgBonus_' + el) + g('dmgBonus_' + t) + ga('dmgBonus_') + (h.additional ? g('dmgBonus_additional') : 0);
    var __rn = normalHit(Object.assign({}, common, { scalingValue: scal, multiplier: mult, dmgBonus: db })); per = __rn.damage * cnt; __z = __hsrScale(__rn.zones, cnt);
  }
  if (extra && extra.finalMultiplier != null) { per *= extra.finalMultiplier; if (__z) __z = __z.concat([__hsrZone('final', '最终乘数（调用方）', extra.finalMultiplier)]); }
  if (h.finalMultiplier != null) { per *= num(h.finalMultiplier, 1); if (__z) __z = __z.concat([__hsrZone('final', '最终乘数（命中）', num(h.finalMultiplier, 1))]); }
  return { per: per, total: per * targets, targets: targets, zones: __z };
}

// 战斗属性对象中取某统计键（scaleStat / hit.extra.stat）
export function statValue(s, k) {
  if (k === 'dmgBonus') return s.elementDmg || 0;
  if (typeof s[k] === 'number') return s[k];
  return (s.bag && s.bag[k]) || 0;
}

function addDamage(st, ctx, i, type, dmg) {
  if (!(dmg > 0)) return;
  st.dmg += dmg;
  st.units[i].dmg += dmg;
  var k = type === 'superBreak' ? 'break' : type;
  if (st.byType[k] == null) st.byType[k] = 0;
  st.byType[k] += dmg;
}

// ---------------------------------------------------------------------------
// buff
// ---------------------------------------------------------------------------
function resolveTargets(ctx, i, target) {
  var m = ctx.members[i];
  var n = ctx.members.length;
  if (typeof target === 'number') return target >= 0 && target < n ? [target] : [];
  if (Array.isArray(target)) return target;
  var all = []; for (var k = 0; k < n; k++) all.push(k);
  switch (target) {
    case 'team': return all;
    case 'allies': return all.filter(function (k) { return k !== i; });
    case 'ally': return [m.allyTarget >= 0 ? m.allyTarget : i];
    case 'enemy': case 'enemies': return ['enemy'];
    default: return [i];
  }
}

// 转化类效果的实际数值：施放者当前 scaleStat × value + flatAdd，封顶 cap
function effectValue(st, ctx, i, e) {
  if (!e.scaleStat) return e.value;
  var v = statValue(combatStats(st, ctx, i), e.scaleStat) * (e.value || 0) + (e.flatAdd || 0);
  if (e.cap != null && isFinite(e.cap)) v = Math.min(v, e.cap);
  return v;
}

export function applyEffect(st, ctx, i, e, mode) {
  if (e.scaleStat) {
    var v0 = effectValue(st, ctx, i, e);
    e = Object.assign({}, e, { value: v0, scaleStat: null, label: e.label + ' → ' + (Math.abs(v0) >= 2 ? Math.round(v0) : (Math.round(v0 * 1000) / 10) + '%') });
  }
  if (e.stat === 'spFlat') { st.sp = clamp(st.sp + (e.value || 0), 0, ctx.battle.maxSP); return; } // 战技点为全队共享，只加一次
  var holders = resolveTargets(ctx, i, e.target);
  var full = mode === 'ideal'; // 理想化：条件/常驻效果直接满层、常驻
  for (var h = 0; h < holders.length; h++) {
    var hd = holders[h];
    if (INSTANT_STATS[e.stat]) { applyInstant(st, ctx, i, hd, e); continue; }
    var list, turnNo, inTurn;
    if (hd === 'enemy') { list = st.enemy.debuffs; turnNo = st.enemy.turns; inTurn = !!st.enemy.inTurn; }
    else { list = st.units[hd].buffs; turnNo = st.units[hd].turns; inTurn = st.units[hd].inTurn; }
    var found = null;
    for (var j = 0; j < list.length; j++) if (list[j].key === e.key) { found = list[j]; break; }
    var dur = e.duration == null || full ? null : e.duration;
    if (found) {
      found.stacks = Math.min((e.maxStacks || 1), found.stacks + 1);
      found.value = e.value;
      if (dur == null) found.remaining = null;
      else if (found.remaining != null) found.remaining = Math.max(found.remaining, dur);
      found.appliedIn = inTurn ? turnNo : -1;
      if (e.tickOnCaster && dur != null) found.tickOwner = i;
    } else {
      var nb = { key: e.key, stat: e.stat, value: e.value, stacks: full ? (e.maxStacks || 1) : 1, maxStacks: e.maxStacks || 1, remaining: dur,
        appliedIn: inTurn ? turnNo : -1, src: i, label: e.label || e.key };
      if (e.tickOnCaster && dur != null) nb.tickOwner = i; // 在施放者回合开始时递减（见 tickCasterBuffs）
      list.push(nb);
    }
    if (hd === 'enemy' && (e.stat === 'spd' || e.stat === 'spdPct')) refreshEnemySpeed(st, ctx);
    else if (hd !== 'enemy' && (e.stat === 'spd' || e.stat === 'spdPct')) refreshSpeed(st, ctx, hd);
  }
}

function applyInstant(st, ctx, i, hd, e) {
  var v = e.value || 0;
  if (e.stat === 'spFlat') { st.sp = clamp(st.sp + v, 0, ctx.battle.maxSP); return; }
  if (hd === 'enemy') {
    if (e.stat === 'actionAdvance') st.enemy.nextAv += Math.abs(v) * 10000 / st.enemy.spdCur; // 对敌人 = 行动延后
    return;
  }
  if (e.stat === 'actionAdvance') {
    if (e.noSelfAdvance && hd === i) return; // 「对自身施放时无法触发立即行动/行动提前」
    if (e.noAdvanceOnPath && ctx.members[hd] && ctx.members[hd].ch.path === e.noAdvanceOnPath) return;
  }
  var u = st.units[hd];
  // 回复能量受持有者能量恢复效率影响（fixedEnergy「固定恢复」除外）
  if (e.stat === 'energyFlat') u.energy = Math.min(ctx.members[hd].energyMax, u.energy + v * (e.fixedEnergy ? 1 : 1 + (combatStats(st, ctx, hd).energyRegen || 0)));
  else if (e.stat === 'energyPct') u.energy = Math.min(ctx.members[hd].energyMax, u.energy + v * ctx.members[hd].energyMax);
  else if (e.stat === 'actionAdvance') {
    if (u.inTurn) { u.pendingAdvance = (u.pendingAdvance || 0) + v; return; } // 回合内：在回合结束时结算
    u.nextAv = Math.max(st.av, u.nextAv - v * 10000 / u.spdCur);
  }
}

// 触发：kind = 'battleStart' | 'cast'（slot, skillId）| 'fua'
function fireTriggers(st, ctx, i, kind, slot, skillId, hasHits) {
  var m = ctx.members[i];
  for (var k = 0; k < m.effects.length; k++) {
    var e = m.effects[k];
    var tr = e.trigger;
    var ok = false;
    if (kind === 'allyAttack') {
      ok = tr === 'onAllyAttack';
    } else if (tr === 'onAllyAttack') {
      ok = false;
    } else if (kind === 'battleStart') {
      ok = tr === 'passive' || tr === 'battleStart' || tr === 'conditional' ||
        (e.sourceKind === 'skill' && e.sourceSlot === 'technique');
    } else if (e.sourceKind === 'skill' && SKILL_SPECIFIC_SLOTS[e.sourceSlot]) {
      // 技能自带效果：仅在施放该技能时生效
      ok = kind === 'cast' && e.skillId === skillId && tr !== 'passive' && tr !== 'battleStart' && tr !== 'conditional';
    } else if (kind === 'fua') {
      ok = tr === 'onFua' || (tr === 'onAttack' && hasHits);
    } else if (kind === 'cast') {
      if (e.sourceKind === 'skill' && e.sourceSlot === 'technique') ok = false;
      else ok = (tr === 'onCast' && slot !== 'memo') || tr === TRIGGER_OF_SLOT[slot] || (tr === 'onAttack' && hasHits);
    }
    if (ok) applyEffect(st, ctx, i, e, kind === 'battleStart' && (tr === 'conditional' || tr === 'passive') ? 'ideal' : null);
  }
}

// 回合结束：持有者身上的 buff 递减。施加所在的这一回合也算 1 回合
// （1 回合的自身增益只覆盖当次行动；队友在回合外挂上的 1 回合增益覆盖受益者的下一次行动，并在该次行动结束时消退）。
function tickBuffs(list, turnNo) {
  var out = [];
  var changed = false;
  for (var j = 0; j < list.length; j++) {
    var b = list[j];
    if (b.remaining != null && b.tickOwner == null) { b.remaining -= 1; }
    if (b.remaining != null && b.remaining <= 0) { changed = true; continue; }
    out.push(b);
  }
  return { list: out, changed: changed };
}

// 施放者回合开始：由其施加、tickOwner = i 的 buff/减益（「<施放者>每回合开始时持续回合数减1」）递减
function tickCasterBuffs(st, ctx, i) {
  var dec = function (list) {
    var out = [], changed = false;
    for (var j = 0; j < list.length; j++) {
      var b = list[j];
      if (b.tickOwner === i && b.remaining != null) { b.remaining -= 1; if (b.remaining <= 0) { changed = true; continue; } }
      out.push(b);
    }
    return { list: out, changed: changed };
  };
  for (var k = 0; k < st.units.length; k++) {
    var r = dec(st.units[k].buffs);
    st.units[k].buffs = r.list;
    if (r.changed) refreshSpeed(st, ctx, k);
  }
  st.enemy.debuffs = dec(st.enemy.debuffs).list;
}

// ---------------------------------------------------------------------------
// 行动
// ---------------------------------------------------------------------------
// override API（详见 engine2/OVERRIDE_API.md）
function holderList(st, ctx, i, target) {
  if (target === 'enemy' || target === 'enemies') return [{ list: st.enemy.debuffs }];
  return resolveTargets(ctx, i, target == null ? 'self' : target).map(function (k) { return k === 'enemy' ? { list: st.enemy.debuffs } : { list: st.units[k].buffs, idx: k }; });
}
function unitIndex(i, j) { return j == null ? i : j; }

export function hookApi(st, ctx, i) {
  var m = ctx.members[i];
  if (!st.custom[m.charId]) st.custom[m.charId] = {};
  if (!st.shared) st.shared = {};
  var api = {
    state: st, ctx: ctx, index: i, member: m, unit: st.units[i], eidolon: m.eidolon, teamSize: ctx.members.length,
    custom: st.custom[m.charId], shared: st.shared,
    stats: function (j) { return combatStats(st, ctx, unitIndex(i, j)); },
    features: { hitJoke: true, hitRef: true, hitFinalMultiplier: true, hitAmplification: true, timers: true, onAnyAction: true, actions: true, specials: true, triggers: true },
    skill: function (slot) { return m.skills[slot] || null; },
    skillOf: function (slot) { return m.skills[slot] || null; },
    // 独立计时单位（如阿哈时刻）：按 spd 在时间轴上行动，到点调用添加者的 hooks.onTimer(api)（api.timer = 该计时器）
    addTimer: function (t) {
      st.timers = (st.timers || []).filter(function (x) { return x.id !== t.id; });
      var spd = Math.max(1, num(t.spd, 100));
      st.timers.push({ id: String(t.id), owner: i, spd: spd, name: t.name || String(t.id), nextAv: t.av != null ? num(t.av, st.av) : st.av + 10000 / spd, data: t.data || null });
    },
    advanceTimer: function (id, pct) {
      (st.timers || []).forEach(function (x) { if (x.id === id) x.nextAv = Math.max(st.av, x.nextAv - pct * 10000 / x.spd); });
    },
    setTimerSpd: function (id, spd) {
      (st.timers || []).forEach(function (x) { if (x.id === id) { var rem = x.nextAv - st.av; x.nextAv = st.av + rem * x.spd / Math.max(1, spd); x.spd = Math.max(1, spd); } });
    },
    removeTimer: function (id) { st.timers = (st.timers || []).filter(function (x) { return x.id !== id; }); },
    getTimer: function (id) { var x = (st.timers || []).find(function (y) { return y.id === id; }); return x ? Object.assign({}, x) : null; },
    hitsOf: function (slot) { var rs = m.skills[slot]; return rs ? rs.hits.map(function (h) { return Object.assign({}, h); }) : []; },
    sp: function () { return st.sp; },
    av: function () { return st.av; },
    enemy: function () { return st.enemy; },
    findMember: function (charId) { return ctx.members.findIndex(function (x) { return x.charId === String(charId); }); },
    addShared: function (k, v) { st.shared[k] = num(st.shared[k], 0) + num(v, 0); return st.shared[k]; },
    // 行动 / 伤害
    cast: function (slotOrSkill, opts) {
      var rs = typeof slotOrSkill === 'string' ? m.skills[slotOrSkill] : slotOrSkill;
      if (!rs) return null;
      opts = opts || {};
      return castSkill(st, ctx, i, rs, opts.code || ACTION_SLOTS[rs.slot] || rs.slot, opts);
    },
    deal: function (hit, note, entry) { return dealOne(st, ctx, i, hit, note, entry); },
    dealAs: function (j, hit, note, entry) { return dealOne(st, ctx, j, hit, note, entry); },
    detonateDots: function (ratio, filter, entry) { return detonateDots(st, ctx, i, ratio, filter, entry); },
    // buff
    addBuff: function (e, target) {
      var t = target != null ? target : (e.target || 'self');
      applyEffect(st, ctx, i, Object.assign({ key: m.charId + ':custom:' + (e.stat || 'x'), maxStacks: 1, duration: null, label: e.key || e.stat }, e, { target: t }));
    },
    addDebuff: function (e) { api.addBuff(e, 'enemy'); },
    removeBuff: function (key, target) {
      holderList(st, ctx, i, target).forEach(function (h) {
        var j = h.list.findIndex(function (b) { return b.key === key; });
        if (j >= 0) h.list.splice(j, 1);
        if (h.idx != null) refreshSpeed(st, ctx, h.idx);
      });
    },
    getBuff: function (key, target) {
      var hl = holderList(st, ctx, i, target);
      for (var k = 0; k < hl.length; k++) {
        var b = hl[k].list.find(function (x) { return x.key === key; });
        if (b) return { stacks: b.stacks, remaining: b.remaining, value: b.value };
      }
      return null;
    },
    setStacks: function (key, n, target) {
      holderList(st, ctx, i, target).forEach(function (h) {
        var b = h.list.find(function (x) { return x.key === key; });
        if (b) b.stacks = Math.max(0, Math.min(b.maxStacks || n, n));
        if (h.idx != null) refreshSpeed(st, ctx, h.idx);
      });
    },
    // 资源 / 时间轴
    gainEnergy: function (v, j, o) {
      var k = unitIndex(i, j), u = st.units[k];
      var mul = o && o.regen ? 1 + combatStats(st, ctx, k).energyRegen : 1;
      u.energy = Math.min(ctx.members[k].energyMax, u.energy + v * mul);
    },
    setEnergy: function (v, j) { var k = unitIndex(i, j); st.units[k].energy = clamp(num(v, 0), 0, ctx.members[k].energyMax); },
    gainSP: function (v) { st.sp = clamp(st.sp + v, 0, ctx.battle.maxSP); },
    advance: function (pct, j) {
      if (j === 'enemy') { st.enemy.nextAv += Math.abs(pct) * 10000 / st.enemy.spdCur; return; }
      applyInstant(st, ctx, i, unitIndex(i, j), { stat: 'actionAdvance', value: pct });
    },
    extraTurn: function (j) { st.units[unitIndex(i, j)].custom.extraTurn = true; },
    castUlt: function (j) { var k = unitIndex(i, j); if (ultReady(st, ctx, k)) { castUlt(st, ctx, k); return true; } return false; },
    ultReady: function (j) { return ultReady(st, ctx, unitIndex(i, j)); },
    log: function (e) { pushLog(st, Object.assign({ av: round2(st.av), actor: m.name, charId: m.charId, damage: 0, hits: [], buffs: [] }, e)); }
  };
  return api;
}
function normHit(ctx, i, h) {
  var m = ctx.members[i];
  var o = Object.assign({ scaling: 'atk', mult: 0, count: 1, target: 'single', element: m.element, dmgType: 'skill' }, h);
  if (o.mult == null && o.multiplier != null) o.mult = o.multiplier;
  if (o.extra && o.extra.stat && o.extraStat == null) { o.extraStat = o.extra.stat; o.extraMult = num(o.extra.mult, 0); if (o.extra.cap != null) o.extraCap = num(o.extra.cap, null); }
  delete o.trigger;
  return o;
}
function dealOne(st, ctx, i, hit, note, entry) {
  var own = !entry;
  var m = ctx.members[i];
  if (own) entry = { av: round2(st.av), actor: m.name, charId: m.charId, action: 'custom', skillName: note || '附加伤害', damage: 0, sp: st.sp, energy: 0, hits: [], buffs: [] };
  var h = normHit(ctx, i, hit);
  h._instant = true;
  var d = dealHits(st, ctx, i, [h], entry, note).total;
  if (own) { entry.energy = round1(st.units[i].energy); pushLog(st, entry); }
  return d;
}
// 引爆：敌人身上 DoT 立即结算 ratio 倍（计入各 DoT 施放者）
function detonateDots(st, ctx, i, ratio, filter, entry) {
  var sum = 0;
  st.enemy.dots.forEach(function (d) {
    if (filter && !filter(d)) return;
    var om = ctx.members[d.owner];
    var rs = om.skills[d.skillSlot];
    var h = rs && rs.hits[d.hitIdx];
    if (!h) return;
    var hh = Object.assign({}, h, { mult: h.mult * ratio, dmgType: 'dot', _instant: true });
    var e2 = d.owner === i ? entry : null;
    var r = dealHits(st, ctx, d.owner, [hh], e2, '引爆 ' + d.name + ' ×' + round4(ratio));
    if (!e2 && entry) { entry.damage = round1((entry.damage || 0) + r.total); entry.hits = (entry.hits || []).concat(r.hits.map(function (x) { return Object.assign({}, x, { note: om.name + '·' + x.note }); })); }
    sum += r.total;
  });
  return sum;
}
function callHook(ctx, i, name, st, extra) {
  var hk = ctx.members[i].hooks[name];
  if (typeof hk !== 'function') return undefined;
  return hk(Object.assign(hookApi(st, ctx, i), extra || {}));
}

// 结算一组伤害段，返回 { total, hits:[...] }
function dealHits(st, ctx, i, hits, entry, note) {
  var total = 0, list = [];
  for (var k = 0; k < hits.length; k++) {
    var h = hits[k];
    if (h.dmgType === 'dot' && !h._instant) continue; // DoT 由敌人回合结算
    if (h.trigger && !h._instant) continue;           // 触发式伤害段（队友攻击/击破时）另行结算
    var r = hitDamage(st, ctx, i, h, total);
    var dmg = r.total;
    var hr = callHook(ctx, i, 'onHit', st, { hit: h, result: r });
    if (typeof hr === 'number' && isFinite(hr)) dmg = hr;
    var type = h.scaling === 'true' ? 'true' : h.scaling === 'elation' ? 'elation' : h.scaling === 'break' ? 'break' : h.dmgType;
    addDamage(st, ctx, i, type, dmg);
    total += dmg;
    list.push({ zones: __hsrRowZones(r, dmg), value: dmg / Math.max(1, r.targets || 1), targets: r.targets, dmgRaw: dmg, target: h.target + (r.targets > 1 ? '×' + r.targets : '') + (h.count > 1 ? ' ' + h.count + '段' : ''), dmg: round1(dmg), note: note || ((h.additional ? '附加 ' : '') + h.scaling + '×' + round4(h.mult) + (h.extraStat ? '+' + round4(h.extraMult) + '×' + h.extraStat : '')) });
  }
  if (entry) { entry.damage = round1((entry.damage || 0) + total); entry.hits = (entry.hits || []).concat(list); }
  return { total: total, hits: list };
}

function registerDots(st, ctx, i, rs) {
  rs.hits.forEach(function (h) {
    if (h.dmgType !== 'dot' || h.trigger) return;
    var key = rs.id + ':' + h.idx;
    var dur = h.duration || 2;
    var d = null;
    for (var k = 0; k < st.enemy.dots.length; k++) if (st.enemy.dots[k].key === key) d = st.enemy.dots[k];
    if (d) d.remaining = Math.max(d.remaining, dur);
    else st.enemy.dots.push({ key: key, owner: i, remaining: dur, skillSlot: rs.slot, hitIdx: h.idx, name: rs.name });
  });
}

// 触发式伤害段的挂载：onAllyAttack → 队伍光环；onBreakRecover → 敌人身上的触发器
function registerTriggers(st, ctx, i, rs) {
  var m = ctx.members[i];
  rs.hits.forEach(function (h) {
    if (h.trigger === 'onAllyAttack') {
      var ally = (m.ch.skills || []).some(function (s0) { return s0.id === rs.id && (s0.effects || []).some(function (e) { return e.target === 'ally'; }); });
      var holders = ally ? resolveTargets(ctx, i, 'ally') : resolveTargets(ctx, i, 'allies');
      if (!holders.length) holders = [i];
      var key = rs.id + ':' + h.idx;
      var dur = rs.effectDuration || h.duration || 2;
      var tick = holders.length === 1 ? holders[0] : i;
      var tu = st.units[tick];
      st.auras = (st.auras || []).filter(function (a) { return a.key !== key; });
      st.auras.push({ key: key, owner: i, slot: rs.slot, hitIdx: h.idx, holders: holders, remaining: dur, tick: tick, appliedIn: tu.inTurn ? tu.turns : -1, name: rs.name });
    } else if (h.trigger === 'onBreakRecover') {
      var k2 = rs.id + ':' + h.idx;
      st.enemy.triggers = (st.enemy.triggers || []).filter(function (a) { return a.key !== k2; });
      st.enemy.triggers.push({ key: k2, owner: i, slot: rs.slot, hitIdx: h.idx, remaining: rs.effectDuration || 2, appliedIn: st.units[i].inTurn ? st.units[i].turns : -1, name: rs.name });
    }
  });
}

// 队友攻击后：触发光环附加伤害 + 各成员 trigger=onAllyAttack 的效果
function onTeamAttack(st, ctx, attacker, entry) {
  var auras = st.auras || [];
  for (var k = 0; k < auras.length; k++) {
    var a = auras[k];
    if (a.owner === attacker || a.holders.indexOf(attacker) < 0) continue;
    var om = ctx.members[a.owner];
    var rs = om.skills[a.slot];
    var h = rs && rs.hits[a.hitIdx];
    if (!h) continue;
    var hh = Object.assign({}, h, { _instant: true });
    var who = h.triggerActor === 'holder' ? attacker : a.owner;
    var r = dealHits(st, ctx, who, [hh], null, a.name + '·附加');
    if (entry && r.total) { entry.damage = round1((entry.damage || 0) + r.total); entry.hits = entry.hits.concat(r.hits.map(function (x) { return Object.assign({}, x, { note: ctx.members[who].name + '·' + a.name + '（附加）' }); })); }
  }
  for (var i = 0; i < ctx.members.length; i++) fireTriggers(st, ctx, i, 'allyAttack');
}

function tickAuras(st, i) {
  // 没有队友攻击光环时也要结算击破恢复触发器，否则阮•梅【残梅绽】会在结界结束后一直留着
  if (st.auras && st.auras.length) {
    st.auras = st.auras.filter(function (a) {
      if (a.tick !== i || a.remaining == null) return true;
      a.remaining -= 1;
      return a.remaining > 0;
    });
  }
  if (st.enemy.triggers && st.enemy.triggers.length) {
    st.enemy.triggers = st.enemy.triggers.filter(function (a) {
      if (a.owner !== i || a.remaining == null) return true;
      a.remaining -= 1;
      return a.remaining > 0;
    });
  }
}

function reduceToughness(st, ctx, i, rs, entry) {
  var m = ctx.members[i];
  var E = ctx.enemyCfg;
  if (!directHits(rs).length) return;
  var tg = rs.toughness || {};
  var base = num(tg.main, 0) + num(tg.aoe, 0);
  if (!base) return;
  var s = combatStats(st, ctx, i);
  // 弱点击破效率上限 300%（Fandom「Toughness」）
  var amount = base * (1 + Math.min(3, s.bag.weaknessBreakEfficiency || 0));
  var weak = !!ctx.enemyWeak[m.element];
  // 超击破：敌人处于击破状态时，按削韧值结算
  var broken = !!E.alwaysBroken || st.enemy.broken;
  var sb = s.bag.superBreak || 0;
  if (broken && sb > 0 && weak) {
    var eb = buffBag(st.enemy.debuffs);
    var g = function (k) { return (s.bag[k] || 0) + (eb[k] || 0); };
    var res = E.res && E.res[m.element] != null ? E.res[m.element] : 0.2;
    var __sbr = superBreakHit({
      // 超击破属于击破类伤害：吃 vuln_break / defIgnore_break，另加 *_superBreak 专属项
      toughnessReduced: amount, superBreak: sb, breakEffect: s.breakEffect, vulnerability: [g('vuln') + g('vuln_' + m.element) + g('vuln_break') + g('vuln_superBreak') + num(E.extraVuln, 0)],
      res: res, resShred: g('resShred') + g('resShred_' + m.element) + g('resPen') + g('resPen_' + m.element) + g('resPen_break') + num(E.extraResShred, 0),
      attackerLevel: m.level, targetLevel: ctx.enemyLevel, defShred: g('defShred') + num(E.extraDefShred, 0),
      defIgnore: g('defIgnore') + g('defIgnore_break') + g('defIgnore_superBreak')
    }); var __sbn = (num(tg.aoe, 0) > 0 ? ctx.enemyCount : 1); var d = __sbr.damage * __sbn * (1 + g('dmgBonus_superBreak'));
    var __sbz = __sbr.zones.concat([__hsrZone('bonus', '超击破增伤', 1 + g('dmgBonus_superBreak'))]);
    addDamage(st, ctx, i, 'superBreak', d);
    if (entry) { entry.damage = round1((entry.damage || 0) + d); entry.hits.push({ zones: __sbz, value: d / __sbn, targets: __sbn, dmgRaw: d, target: 'enemy', dmg: round1(d), note: '超击破' }); }
  }
  if (!weak || E.alwaysBroken || E.allowBreak === false || st.enemy.broken) return;
  st.enemy.toughness -= amount;
  if (st.enemy.toughness <= 1e-9) {
    st.enemy.toughness = 0;
    st.enemy.broken = true;
    st.enemy.breaks += 1;
    var bh = { scaling: 'break', mult: 1, count: 1, target: num(tg.aoe, 0) > 0 ? 'aoe' : 'single', element: m.element, dmgType: 'break' };
    var r = hitDamage(st, ctx, i, bh, 0);
    // 击破时敌人尚未处于击破状态 → 0.9 韧性区（hitDamage 已按 broken=true 计为 1，需修正）
    var dmg = r.total * 0.9;
    addDamage(st, ctx, i, 'break', dmg);
    if (entry) { entry.damage = round1((entry.damage || 0) + dmg); entry.hits.push({ zones: __hsrRowZones(r, dmg, [__hsrZone('breakState', '击破瞬间（未击破 ×0.9）', 0.9)]), value: dmg / Math.max(1, r.targets || 1), targets: r.targets, dmgRaw: dmg, target: bh.target, dmg: round1(dmg), note: '击破' }); entry.note = (entry.note ? entry.note + '；' : '') + '击破'; }
    // 击破使敌人行动延后 25%
    st.enemy.nextAv += 0.25 * 10000 / st.enemy.spdCur;
    // 「击破弱点时」触发的击破伤害（如阮•梅天赋）
    for (var bi = 0; bi < ctx.members.length; bi++) {
      var bm = ctx.members[bi];
      for (var bk = 0; bk < bm.breakHits.length; bk++) {
        var bhh = Object.assign({}, bm.breakHits[bk], { element: bm.element });
        // 「击破弱点时」的追加击破伤害在敌人进入击破状态后结算 → 击破区 1.0（与阮•梅 override 一致）
        var br = hitDamage(st, ctx, bi, bhh, 0);
        var bd = br.total;
        addDamage(st, ctx, bi, 'break', bd);
        if (entry) { entry.damage = round1((entry.damage || 0) + bd); entry.hits.push({ zones: __hsrRowZones(br, bd), value: bd / Math.max(1, br.targets || 1), targets: br.targets, dmgRaw: bd, target: bhh.target, dmg: round1(bd), note: bm.name + '·击破触发' }); }
      }
    }
    for (var q = 0; q < ctx.members.length; q++) {
      var qm = ctx.members[q];
      for (var qe = 0; qe < qm.effects.length; qe++) {
        var ef = qm.effects[qe];
        // 行迹「造成弱点击破后，使敌方目标行动延后 N%」（描述中的百分数）
        if (ef.trigger === 'onBreak' && ef.stat === 'actionAdvance') applyEffect(st, ctx, q, ef);
      }
      callHook(ctx, q, 'onBreak', st, { breaker: i, entry: entry });
    }
  }
}

function round1(v) { return Math.round(v * 10) / 10; }
function round2(v) { return Math.round(v * 100) / 100; }
function round4(v) { return Math.round(v * 10000) / 10000; }

function buffLabels(st, i) {
  return st.units[i].buffs.map(function (b) { return b.label + (b.stacks > 1 ? '×' + b.stacks : '') + (b.remaining != null ? '(' + b.remaining + ')' : ''); });
}

// 施放一个技能（普攻/战技/终结技/强化…）
// opt: { noHits, noSP, noEnergy, spCost, followUps }
export function castSkill(st, ctx, i, rs, code, opt) {
  opt = opt || {};
  var m = ctx.members[i];
  var u = st.units[i];
  var s0 = combatStats(st, ctx, i);
  if (rs.slot === 'ult') { u.energy = m.ultResource === 'custom' ? u.energy : 0; u.ultTurns = 0; }
  if (!opt.noSP) {
    var cost = opt.spCost != null ? num(opt.spCost, 0) : rs.spCost;
    st.sp = clamp(st.sp - cost + rs.spGain, 0, ctx.battle.maxSP);
  }
  var attack = isAttackSkill(rs) && !opt.noHits;
  var entry = { av: round2(st.av), actor: m.name, charId: m.charId, action: code, skillName: rs.name, damage: 0, sp: 0, energy: 0, hits: [], buffs: [] };
  st._depth = (st._depth || 0) + 1;
  // 施放效果（理想化：先于伤害生效）
  fireTriggers(st, ctx, i, 'cast', rs.slot, rs.id, attack);
  callHook(ctx, i, 'onAction', st, { skill: rs, code: code, entry: entry, phase: 'before' });
  if (!opt.noHits) {
    dealHits(st, ctx, i, rs.hits, entry);
    registerDots(st, ctx, i, rs);
    registerTriggers(st, ctx, i, rs);
    applySpecials(st, ctx, i, rs, entry);
    reduceToughness(st, ctx, i, rs, entry);
  }
  if (!opt.noEnergy) u.energy = Math.min(m.energyMax, u.energy + rs.energyGain * (1 + s0.energyRegen));
  u.counts[code] = (u.counts[code] || 0) + 1;
  u.rot += (u.rot ? ' ' : '') + code;
  callHook(ctx, i, 'onAction', st, { skill: rs, code: code, entry: entry, phase: 'after' });
  if (attack && st._depth <= 2) onTeamAttack(st, ctx, i, entry);
  if (st._depth <= 3) for (var k = 0; k < ctx.members.length; k++) callHook(ctx, k, 'onAnyAction', st, { actor: i, actorMember: m, skill: rs, code: code, entry: entry, isAttack: attack });
  st._depth -= 1;
  entry.sp = st.sp;
  entry.energy = round1(u.energy);
  entry.buffs = buffLabels(st, i);
  pushLog(st, entry);
  return entry;
}

// skill.specials：dotDetonate（引爆 DoT）、percentOfDamage（按本次伤害比例的真实伤害）；hpLostScaling 忽略
function applySpecials(st, ctx, i, rs, entry) {
  var sp = rs.specials;
  if (!sp || !sp.length) return;
  for (var k = 0; k < sp.length; k++) {
    var x = sp[k];
    if (x.kind === 'dotDetonate' && x.ratio > 0) detonateDots(st, ctx, i, x.ratio, null, entry);
    else if (x.kind === 'percentOfDamage' && x.ratio > 0 && /真实伤害/.test(x.raw || '')) {
      var d = (entry.damage || 0) * x.ratio;
      addDamage(st, ctx, i, 'true', d);
      entry.damage = round1(entry.damage + d);
      entry.hits.push({ target: 'single', dmg: round1(d), note: '真实伤害 ' + round4(x.ratio) + '×本次伤害' });
    }
  }
}

function castFua(st, ctx, i) {
  var m = ctx.members[i];
  var n = m.policy.fuaPerTurn == null ? 1 : num(m.policy.fuaPerTurn, 1);
  for (var c = 0; c < n; c++) {
    for (var k = 0; k < m.fuaSkills.length; k++) {
      var rs = m.fuaSkills[k];
      var s0 = combatStats(st, ctx, i);
      var entry = { av: round2(st.av), actor: m.name, charId: m.charId, action: 'F', skillName: rs.name + '（追加攻击）', damage: 0, sp: 0, energy: 0, hits: [], buffs: [] };
      st._depth = (st._depth || 0) + 1;
      fireTriggers(st, ctx, i, 'fua', 'fua', rs.id, true);
      callHook(ctx, i, 'onAction', st, { skill: rs, code: 'F', entry: entry, phase: 'before' });
      dealHits(st, ctx, i, rs.hits, entry);
      reduceToughness(st, ctx, i, rs, entry);
      var u = st.units[i];
      u.energy = Math.min(m.energyMax, u.energy + rs.energyGain * (1 + s0.energyRegen));
      u.counts.F = (u.counts.F || 0) + 1;
      u.rot += (u.rot ? ' ' : '') + 'F';
      callHook(ctx, i, 'onAction', st, { skill: rs, code: 'F', entry: entry, phase: 'after' });
      if (st._depth <= 2) onTeamAttack(st, ctx, i, entry);
      if (st._depth <= 3) for (var q = 0; q < ctx.members.length; q++) callHook(ctx, q, 'onAnyAction', st, { actor: i, actorMember: m, skill: rs, code: 'F', entry: entry, isAttack: true });
      st._depth -= 1;
      entry.sp = st.sp; entry.energy = round1(u.energy); entry.buffs = buffLabels(st, i);
      pushLog(st, entry);
    }
  }
}

export function ultReady(st, ctx, i) {
  var m = ctx.members[i];
  if (!m.skills.ult) return false;
  var u = st.units[i];
  var energyReady = m.ultResource === 'custom' ? (u.ultTurns || 0) >= m.customUltEvery : u.energy >= m.energyMax - 1e-6;
  if (typeof m.hooks.ultReady === 'function') {
    var r = m.hooks.ultReady(Object.assign(hookApi(st, ctx, i), { energyReady: energyReady }));
    if (typeof r === 'boolean') return r;
  }
  return energyReady;
}
// 终结技进度 0..1（启发式用）
export function ultProgress(st, ctx, i) {
  var m = ctx.members[i], u = st.units[i];
  if (m.ultResource === 'custom') return Math.min(1, (u.ultTurns || 0) / m.customUltEvery);
  return Math.min(1, u.energy / m.energyMax);
}

function castUlt(st, ctx, i) {
  var m = ctx.members[i];
  castSkill(st, ctx, i, m.skills.ult, 'Q');
}

function fireAsapUlts(st, ctx) {
  var fired = true, guard = 0;
  while (fired && guard++ < 8) {
    fired = false;
    for (var i = 0; i < ctx.members.length; i++) {
      if (ctx.members[i].policy.ultMode !== 'auto' && ultReady(st, ctx, i)) { castUlt(st, ctx, i); fired = true; }
    }
  }
}

// 敌人回合：DoT 结算 → 击破恢复 → 减益递减
function enemyTurn(st, ctx) {
  var en = st.enemy;
  en.turns += 1;
  en.inTurn = true;
  for (var k = 0; k < en.dots.length; k++) {
    var d = en.dots[k];
    var m = ctx.members[d.owner];
    var rs = m.skills[d.skillSlot];
    var h = rs && rs.hits[d.hitIdx];
    if (!h) continue;
    var entry = { av: round2(st.av), actor: m.name, charId: m.charId, action: 'DoT', skillName: d.name + '（持续伤害）', damage: 0, sp: st.sp, energy: round1(st.units[d.owner].energy), hits: [], buffs: [] };
    var r = hitDamage(st, ctx, d.owner, h, 0);
    var dmg = r.total;
    var hr = callHook(ctx, d.owner, 'onHit', st, { hit: h, result: r, dot: true });
    if (typeof hr === 'number' && isFinite(hr)) dmg = hr;
    addDamage(st, ctx, d.owner, 'dot', dmg);
    entry.damage = round1(dmg);
    entry.hits.push({ zones: __hsrRowZones(r, dmg), value: dmg / Math.max(1, r.targets || 1), targets: r.targets, dmgRaw: dmg, target: h.target + (r.targets > 1 ? '×' + r.targets : ''), dmg: round1(dmg), note: 'DoT' });
    pushLog(st, entry);
    d.remaining -= 1;
  }
  en.dots = en.dots.filter(function (d) { return d.remaining > 0; });
  for (var i = 0; i < ctx.members.length; i++) callHook(ctx, i, 'onEnemyTurn', st, {});
  var note = '敌人回合';
  var delayed = false;
  if (en.broken) {
    // 「尝试从弱点击破状态恢复时」触发器（如阮•梅【残梅绽】）：延长击破并造成击破伤害，每次击破只触发一次
    var trg = (en.triggers || []).filter(function (t) { return !t.used; });
    if (trg.length) {
      for (var q = 0; q < trg.length; q++) {
        var t = trg[q];
        var om = ctx.members[t.owner];
        var th = om.skills[t.slot] && om.skills[t.slot].hits[t.hitIdx];
        if (!th) continue;
        var hh = Object.assign({}, th, { _instant: true, element: om.element });
        var e2 = { av: round2(st.av), actor: om.name, charId: om.charId, action: 'trigger', skillName: t.name + '（击破恢复时）', damage: 0, sp: st.sp, energy: round1(st.units[t.owner].energy), hits: [], buffs: [] };
        dealHits(st, ctx, t.owner, [hh], e2);
        pushLog(st, e2);
        var be = combatStats(st, ctx, t.owner).breakEffect;
        en.nextAv = st.av + 10000 / en.spdCur * (0.1 + 0.2 * be);
        t.used = true;
      }
      delayed = true;
      note = '击破状态被延长';
    } else {
      en.broken = false;
      en.toughness = ctx.enemyToughness;
      (en.triggers || []).forEach(function (t) { t.used = false; });
      note = '敌人从击破中恢复（跳过行动）';
    }
  }
  pushLog(st, { av: round2(st.av), actor: ctx.enemyCfg.name || '敌人', charId: null, action: 'enemy', skillName: note, damage: 0, sp: st.sp, energy: 0, hits: [], buffs: en.debuffs.map(function (b) { return b.label + (b.remaining != null ? '(' + b.remaining + ')' : ''); }) });
  var tb = tickBuffs(en.debuffs, en.turns);
  en.debuffs = tb.list;
  if (tb.changed) refreshEnemySpeed(st, ctx);
  en.inTurn = false;
  if (!delayed) en.nextAv = st.av + 10000 / en.spdCur;
}

// ---------------------------------------------------------------------------
// 推进到下一个决策点
// ---------------------------------------------------------------------------
export function startBattle(st, ctx) {
  for (var i = 0; i < ctx.members.length; i++) fireTriggers(st, ctx, i, 'battleStart');
  for (var j = 0; j < ctx.members.length; j++) { refreshSpeed(st, ctx, j); callHook(ctx, j, 'onBattleStart', st, {}); }
  // 战斗开始时 speed 可能变化：以最终速度重新计算首轮行动值
  for (var k = 0; k < ctx.members.length; k++) {
    var u = st.units[k];
    if (u.nextAv > 0 && !u.custom._advanced) u.nextAv = Math.min(u.nextAv, 10000 / u.spdCur);
  }
  return st;
}

export function advance(st, ctx) {
  st.pending = null;
  var guard = 0;
  while (guard++ < 10000) {
    fireAsapUlts(st, ctx);
    // 找下一个行动者（同 AV 时我方先于敌人、按队伍顺序）
    var best = -1, bt = Infinity;
    for (var i = 0; i < st.units.length; i++) if (st.units[i].nextAv < bt - 1e-9) { bt = st.units[i].nextAv; best = i; }
    // 计时单位（api.addTimer）：同 AV 时排在我方之后、敌人之前
    var ti = -1, tt = Infinity, tms = st.timers || [];
    for (var z = 0; z < tms.length; z++) if (tms[z].nextAv < tt - 1e-9) { tt = tms[z].nextAv; ti = z; }
    var timerNext = ti >= 0 && tt < bt - 1e-9 && tt <= st.enemy.nextAv + 1e-9;
    var enemyNext = !timerNext && st.enemy.nextAv < bt - 1e-9;
    var t = timerNext ? tt : enemyNext ? st.enemy.nextAv : bt;
    if (t > ctx.totalAV + 1e-9) {
      st.av = ctx.totalAV;
      // 战斗结束前把已满的终结技放掉
      for (var q = 0; q < ctx.members.length; q++) if (ultReady(st, ctx, q)) castUlt(st, ctx, q);
      st.done = true;
      return st;
    }
    st.av = t;
    if (timerNext) {
      var tm = tms[ti];
      tm.nextAv = st.av + 10000 / tm.spd;
      tm.turns = (tm.turns || 0) + 1;
      var tcopy = Object.assign({}, tm);
      callHook(ctx, tm.owner, 'onTimer', st, { timer: tcopy });
      continue;
    }
    if (enemyNext) { enemyTurn(st, ctx); continue; }
    // 角色回合开始
    var u = st.units[best];
    u.turns += 1;
    u.ultTurns = (u.ultTurns || 0) + 1;
    u.inTurn = true;
    tickCasterBuffs(st, ctx, best);
    callHook(ctx, best, 'onTurnStart', st, {});
    if (u.custom._skipTurn) { u.custom._skipTurn = false; endTurn(st, ctx, best); continue; }
    st.pending = { unit: best, options: decisionOptions(st, ctx, best) };
    return st;
  }
  st.done = true;
  return st;
}

// 当前角色可选动作（受 policy 约束），以及可插入的终结技组合
export function actionCandidates(st, ctx, i, policyMode) {
  var m = ctx.members[i];
  var mode = policyMode || m.policy.mode || 'auto';
  var list = [];
  var sk = m.skills.skill;
  var canSkill = sk && st.sp >= sk.spCost;
  if (mode === 'basicOnly' || !canSkill) list.push({ code: 'A', slot: 'basic' });
  else if (mode === 'skillFirst') list.push({ code: 'E', slot: 'skill' });
  else { list.push({ code: 'E', slot: 'skill' }); list.push({ code: 'A', slot: 'basic' }); }
  if (!m.skills.basic) list = list.filter(function (a) { return a.slot !== 'basic'; });
  if (!list.length && canSkill) list.push({ code: 'E', slot: 'skill' });
  var hk = m.hooks.actions;
  if (typeof hk === 'function') {
    var r = hk(Object.assign(hookApi(st, ctx, i), { defaults: list, mode: mode }));
    if (Array.isArray(r) && r.length) {
      // 丢弃战技点不足 / 引用不存在技能的动作
      var ok = r.filter(function (a) {
        if (!a) return false;
        if (a.run) return true;
        var rs = a.slot && m.skills[a.slot];
        if (!rs) return false;
        var cost = a.spCost != null ? num(a.spCost, 0) : rs.spCost;
        return cost <= st.sp;
      });
      list = ok.length ? ok : list.filter(function (a) { return a.slot === 'basic'; });
    }
  }
  if (!list.length) list.push({ code: 'wait', slot: null });
  return list;
}

function decisionOptions(st, ctx, i) {
  var acts = actionCandidates(st, ctx, i);
  var ready = [];
  for (var k = 0; k < ctx.members.length; k++) if (ctx.members[k].policy.ultMode === 'auto' && ultReady(st, ctx, k)) ready.push(k);
  var ultSets = [[]];
  ready.forEach(function (k) { ultSets.push([k]); });
  if (ready.length > 1) ultSets.push(ready.slice());
  var out = [];
  ultSets.forEach(function (us) { acts.forEach(function (a) { out.push({ ults: us, action: a }); }); });
  return out;
}

// 执行决策：先插入终结技，再执行当前角色的行动，之后追加攻击/忆灵，回合结束
export function applyDecision(st, ctx, opt) {
  var i = st.pending.unit;
  st.pending = null;
  st.steps += 1;
  for (var k = 0; k < opt.ults.length; k++) if (ultReady(st, ctx, opt.ults[k])) castUlt(st, ctx, opt.ults[k]);
  fireAsapUlts(st, ctx);
  var m = ctx.members[i];
  var a = opt.action;
  if (a.run) a.run(hookApi(st, ctx, i));
  else if (a.slot && m.skills[a.slot]) {
    var rs = m.skills[a.slot];
    var cost = a.spCost != null ? num(a.spCost, 0) : rs.spCost;
    var co = { spCost: a.spCost };
    if (cost > st.sp) { rs = m.skills.basic || rs; co = {}; }
    var entry = castSkill(st, ctx, i, rs, a.code || ACTION_SLOTS[rs.slot] || rs.slot, co);
    if (typeof a.onUse === 'function') a.onUse(hookApi(st, ctx, i), entry);
    if (a.followUps !== false) {
      // 追加攻击（默认每个自身回合 1 次）
      if (m.fuaSkills.length) castFua(st, ctx, i);
      // 忆灵随回合出手
      if (m.memoSkill) castSkill(st, ctx, i, m.memoSkill, 'M');
    }
  }
  // 本回合行动/追加攻击刚刚补满的终结技，在回合结束、buff 消退之前插入（否则 1 回合增益盖不到这次终结技）
  fireAsapUlts(st, ctx);
  endTurn(st, ctx, i);
  return st;
}

function endTurn(st, ctx, i) {
  var u = st.units[i];
  var t = tickBuffs(u.buffs, u.turns);
  u.buffs = t.list;
  tickAuras(st, i);
  u.inTurn = false;
  if (t.changed) refreshSpeed(st, ctx, i);
  if (u.custom.extraTurn) {
    u.custom.extraTurn = false;
    u.avLock = false;
    u.pendingAdvance = 0;
    u.nextAv = st.av;
  } else if (u.avLock) {
    // 钩子已指定下一次行动时刻（知更鸟离开行动序列，改走协奏倒计时）
    u.avLock = false;
    u.pendingAdvance = 0;
  } else {
    u.nextAv = st.av + 10000 / u.spdCur;
    if (u.pendingAdvance) { u.nextAv = Math.max(st.av, u.nextAv - u.pendingAdvance * 10000 / u.spdCur); u.pendingAdvance = 0; }
  }
}

// ---------------------------------------------------------------------------
// 结果汇总
// ---------------------------------------------------------------------------
export function buildResult(st, ctx, extraWarnings) {
  var total = st.dmg;
  var byMember = ctx.members.map(function (m, i) {
    var u = st.units[i];
    var actions = {};
    for (var c in u.counts) actions[CODE_NAME[c] || c] = u.counts[c];
    return { charId: m.charId, name: m.name, damage: round1(u.dmg), share: total > 0 ? round4(u.dmg / total) : 0, actions: actions };
  });
  var rotation = {};
  ctx.members.forEach(function (m, i) { rotation[m.charId] = st.units[i].rot; });
  var byType = {};
  for (var k in st.byType) byType[k] = round1(st.byType[k]);
  return {
    total: round1(total), perCycle: round1(total / Math.max(1, ctx.battle.cycles)), totalAV: ctx.totalAV,
    byMember: byMember, byType: byType, timeline: logToArray(st.log), rotation: rotation,
    finalStats: ctx.members.map(function (m) { return publicStats(m.panel); }),
    mainC: ctx.members[ctx.mainC] ? ctx.members[ctx.mainC].charId : null,
    breaks: st.enemy.breaks, maxSP: ctx.battle.maxSP,
    warnings: ctx.warnings.concat(extraWarnings || [])
  };
}