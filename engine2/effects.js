// engine2/effects.js —— 把 kits 中的 Effect 解析为数值实例
// value.param 引用所属对象的 params：技能 → 当前技能等级（含星魂 3/5 的 +2）；光锥 → 叠影；行迹/星魂/遗器 → 其 param_list
// 星魂按 eidolon 启用；行迹默认全部点亮（80 级）。

export var INSTANT_STATS = { actionAdvance: 1, energyFlat: 1, energyPct: 1, spFlat: 1 };
// 可带 _<dmgType> 后缀的键（effect.appliesTo）与可带 _<Element> 后缀的键（effect.element）
var TYPE_SUFFIX_STATS = { critRate: 1, critDmg: 1, dmgBonus: 1, vuln: 1, defIgnore: 1, resPen: 1, amplification: 1, defShred: 1 };
var ELEM_SUFFIX_STATS = { resShred: 1, resPen: 1, dmgBonus: 1, vuln: 1 };
// 作用于敌人一侧的键（放在敌人身上时对所有攻击者生效）
export var ENEMY_KEYS = { defShred: 1, resShred: 1, vuln: 1 };

var SLOT_LEVEL_KEY = { basic: 'basic', enhancedBasic: 'basic', skill: 'skill', enhancedSkill: 'skill',
  ult: 'ult', talent: 'talent', elation: 'elation', memo: 'memo' };

// 星魂技能等级加成（仅统计已解锁的星魂）
export function eidolonLevelBonus(ch, eidolon) {
  var bonus = {};
  var eids = ch.eidolons || [];
  for (var i = 0; i < eids.length; i++) {
    var e = eids[i];
    if (!e || e.rank > (eidolon || 0) || !e.skillLevelUp) continue;
    for (var k in e.skillLevelUp) bonus[k] = (bonus[k] || 0) + (e.skillLevelUp[k] || 0);
  }
  return bonus;
}

// 某技能的有效等级（含星魂加成，受 params 长度与 maxLevel+加成 约束）
export function skillLevel(ch, member, skill) {
  var lvKey = SLOT_LEVEL_KEY[skill.slot] || skill.slot;
  var levels = member.skillLevels || {};
  var lv = levels[lvKey];
  if (lv == null) lv = skill.defaultLevel || skill.maxLevel || 1;
  var bonus = eidolonLevelBonus(ch, member.eidolon);
  var b = bonus[lvKey] || 0;
  // 忆灵技能随天赋/战技？数据若给了 memo 键则用之，否则不加
  var cap = (skill.maxLevel || lv) + b;
  lv = Math.min(lv + b, cap);
  var n = (skill.params && skill.params.length) || 1;
  return Math.max(1, Math.min(lv, n));
}

export function skillParams(ch, member, skill) {
  if (!skill.params || !skill.params.length) return [];
  var lv = skillLevel(ch, member, skill);
  var p = skill.params[lv - 1];
  return Array.isArray(p) ? p : skill.params;
}

// 通用：params 可能是扁平数组或按等级/叠影的二维数组
export function pickParams(params, index1) {
  if (!params || !params.length) return [];
  if (Array.isArray(params[0])) {
    var i = Math.max(1, Math.min(index1 || 1, params.length));
    return params[i - 1];
  }
  return params;
}

export function resolveValue(value, params) {
  if (typeof value === 'number') return value;
  if (value == null) return 0;
  if (typeof value === 'object') {
    var base = 0;
    if (value.param != null) {
      var v = params ? params[value.param] : undefined;
      base = typeof v === 'number' ? v : 0;
    } else if (typeof value.value === 'number') base = value.value;
    if (typeof value.mul === 'number') base *= value.mul;
    if (typeof value.scale === 'number') base *= value.scale;
    if (value.negate) base = -base;
    return base;
  }
  var n = Number(value);
  return isFinite(n) ? n : 0;
}

// 面板效果：常驻、无条件、仅作用于自身、属于面板属性 → 折入局外面板（战斗中不再重复叠加）
var PANEL_STATS = { hp: 1, hpPct: 1, atk: 1, atkPct: 1, def: 1, defPct: 1, spd: 1, spdPct: 1, critRate: 1, critDmg: 1,
  breakEffect: 1, energyRegen: 1, effectHitRate: 1, effectRes: 1, outgoingHeal: 1, elation: 1, dmgBonus: 1 };
export function isPanelStat(stat) { return !!PANEL_STATS[stat] || /^dmgBonus_(Physical|Fire|Ice|Thunder|Wind|Quantum|Imaginary)$/.test(stat); }
export function isPanelEffect(e) {
  return e.trigger === 'passive' && !e.condition && (e.target === 'self' || !e.target) && e.duration == null &&
    isPanelStat(e.stat) && !e.fromExtra && !e.scaleStat;
}

var CASTER_TICK_RE = /(自身|[^，。、\s]{1,10})每回合开始时(结界)?持续回合数减1/;
var FLAT_STATS = { hp: 1, atk: 1, def: 1, spd: 1, energyFlat: 1, spFlat: 1 };
export function fmtStat(stat, v) {
  if (FLAT_STATS[stat]) return stat + (v >= 0 ? '+' : '') + (Math.round(v * 10) / 10);
  return stat + (v >= 0 ? '+' : '') + (Math.round(v * 1000) / 10) + '%';
}

function pushEff(out, ctx, e, params, meta, opts, disabled) {
  if (!e || !e.stat) return;
  var key = e.key || (meta.sourceKey + ':' + out.length);
  if (disabled[key]) return;
  if (opts.ignoreConditions && e.condition) return;
  var v = resolveValue(e.value, params);
  var stat = e.stat;
  // appliesTo：只作用于某类伤害 → 键加 _<dmgType> 后缀；element：指定元素 → 键加 _<Element> 后缀
  if (e.appliesTo && TYPE_SUFFIX_STATS[stat]) stat = stat + '_' + e.appliesTo;
  else if (e.element && ELEM_SUFFIX_STATS[stat]) stat = stat + '_' + e.element;
  var inst = {
    key: key, stat: stat, value: v,
    target: e.target || 'self', duration: e.duration == null ? null : e.duration,
    trigger: e.trigger || 'passive', maxStacks: e.maxStacks || 1,
    condition: e.condition || null, confidence: e.confidence || 'high',
    sourceKind: meta.kind, sourceSlot: meta.slot || null, skillId: meta.skillId || null,
    label: meta.label + ' ' + fmtStat(stat, v), raw: e.raw || '', fromExtra: !!meta.fromExtra,
    ownerId: ctx.charId
  };
  // 转化类：数值 = 施放者 scaleStat 面板 × value + flatAdd，封顶 cap（在挂载时按施放者当时面板计算）
  if (e.scaleStat) {
    inst.scaleStat = e.scaleStat;
    inst.flatAdd = e.flatAdd != null ? resolveValue(e.flatAdd, params) : 0;
    inst.cap = e.cap != null ? resolveValue(e.cap, params) : null;
    inst.label = meta.label + ' ' + stat + '=' + e.scaleStat + '×' + (Math.round(v * 10000) / 100) + '%' + (inst.flatAdd ? '+' + (Math.round(inst.flatAdd * 1000) / 1000) : '');
  }
  if (e.appliesTo) inst.appliesTo = e.appliesTo;
  // 能量：默认受能量恢复效率影响（Fandom「Energy」：Real Energy = Base × ERR），描述含「固定恢复」者除外；
  // energyPct（按上限比例，如藿藿终结技、流萤战技）按固定值处理；停云终结技/秘技为官方列出的不受充能影响项（描述未写「固定」）。
  if (stat === 'energyFlat' || stat === 'energyPct') {
    inst.fixedEnergy = stat === 'energyPct' || /固定(恢复|回复)/.test(meta.desc || '') ||
      (ctx.charId === '1202' && meta.kind === 'skill' && (meta.slot === 'ult' || meta.slot === 'technique'));
  }
  // 「<施放者>每回合开始时持续回合数减1」：该技能施加的有持续时间的效果在施放者回合开始时递减（而非持有者回合结束）
  if (meta.kind === 'skill' && inst.duration != null && CASTER_TICK_RE.test(meta.desc || '')) inst.tickOnCaster = true;
  out.push(inst);
}

/**
 * 收集一名成员的全部效果实例（已解析为数值）。
 * opts: { ignoreConditions }
 * 返回 { list: [EffectInstance], warnings: [] }
 */
export function collectEffects(data, member, opts) {
  opts = opts || {};
  var ch = data.characters[member.charId];
  var out = [], warnings = [];
  var disabled = {};
  (member.disabledEffects || []).forEach(function (k) { disabled[k] = 1; });
  var ctx = { charId: member.charId };
  // 技能
  (ch.skills || []).forEach(function (s) {
    var p = skillParams(ch, member, s);
    (s.effects || []).forEach(function (e) {
      pushEff(out, ctx, e, p, { kind: 'skill', slot: s.slot, skillId: s.id, label: (s.typeName || s.slot) + '·' + s.name, sourceKey: member.charId + ':skill:' + s.id, desc: s.desc }, opts, disabled);
    });
  });
  // 行迹（额外能力，默认全部点亮）
  (ch.traces || []).forEach(function (t) {
    (t.effects || []).forEach(function (e) {
      pushEff(out, ctx, e, pickParams(t.params, 1), { kind: 'trace', label: '行迹·' + t.name, sourceKey: member.charId + ':trace:' + t.id, desc: t.desc }, opts, disabled);
    });
  });
  // 星魂
  (ch.eidolons || []).forEach(function (r) {
    if (r.rank > (member.eidolon || 0)) return;
    (r.effects || []).forEach(function (e) {
      pushEff(out, ctx, e, pickParams(r.params, 1), { kind: 'eidolon', label: '星魂' + r.rank + '·' + r.name, sourceKey: member.charId + ':e' + r.rank, desc: r.desc }, opts, disabled);
    });
  });
  // 光锥（命途不符时被动不生效）
  if (member.lightcone && member.lightcone.id) {
    var lc = data.lightcones[member.lightcone.id];
    if (lc) {
      if (lc.path && ch.path && lc.path !== ch.path) warnings.push(ch.name + '：光锥「' + lc.name + '」命途不符，被动不生效');
      else {
        var lp = pickParams(lc.params, member.lightcone.superimposition || 1);
        (lc.effects || []).forEach(function (e) {
          pushEff(out, ctx, e, lp, { kind: 'lightcone', label: '光锥·' + lc.name, sourceKey: 'lc:' + lc.id, desc: lc.rawDesc }, opts, disabled);
        });
      }
    }
  }
  // 遗器套装：set4 → 该套 2+4 件；set2 → 该套 2 件（若 set2 与 set4 相同则视为 4 件）
  var rel = member.relics || {};
  var addSet = function (id, four) {
    var rs = data.relicSets[id];
    if (!rs) { warnings.push('未知遗器套装 ' + id); return; }
    var parts = [['set2', rs.set2]];
    if (four && rs.set4) parts.push(['set4', rs.set4]);
    parts.forEach(function (pp) {
      var part = pp[1];
      if (!part) return;
      (part.effects || []).forEach(function (e) {
        pushEff(out, ctx, e, pickParams(part.params, 1), { kind: 'relic', label: '遗器·' + rs.name + (pp[0] === 'set4' ? '(4)' : '(2)'), sourceKey: 'relic:' + id + ':' + pp[0], desc: part.desc }, opts, disabled);
      });
    });
  };
  if (rel.set4) addSet(rel.set4, true);
  if (rel.set2 && rel.set2 !== rel.set4) addSet(rel.set2, false);
  if (rel.set2b && rel.set2b !== rel.set2) addSet(rel.set2b, false);
  // 用户自定义
  (member.extraBuffs || []).forEach(function (e, i) {
    var ee = Object.assign({ key: member.charId + ':extra:' + i, trigger: 'passive', target: 'self' }, e);
    pushEff(out, ctx, ee, [], { kind: 'extra', label: '自定义', sourceKey: member.charId + ':extra', fromExtra: true }, opts, disabled);
  });
  return { list: out, warnings: warnings };
}
