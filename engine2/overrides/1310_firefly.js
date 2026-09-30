// 1310 流萤 —— 完全燃烧（强化普攻 A+ / 强化战技 E+）
// 简化假设：
//  * 终结技进入【完全燃烧】：行动提前 100%（数据）、速度 +p2、弱点击破效率 +p1、受装甲击破伤害 +p0（按自身 vuln_break 近似）；
//    持续到倒计时（速度 p3=70）行动：按 10000/70 AV 计，到期后于自身回合开始退出。燃烧期间只能 A+/E+。
//  * E+ 倍率 = p3 + p4×击破特攻（相邻 p1 + p5×击破特攻），击破特攻计入上限 p6；E1 起不耗战技点、无视 15% 防御。
//  * 行迹：击破特攻 ≥200%/360% 时燃烧期间获得 35%/50% 超击破（引擎 superBreak 键）；攻击力 >1800 每 10 点击破特攻 +0.8%（开场计算一次）。
//  * 普通战技：回复 60% 能量上限（energyPct，数据）并行动提前 25%。火属性弱点按敌人配置（未模拟强化战技植入弱点）。
import { skillById, paramsOf, note, composeHooks } from './_util.js';

function P(api) { return api.member.ch._ovp; }
function burnOn(api) { return !!api.custom.burn; }
function exitBurn(api) {
  var c = api.custom;
  c.burn = false;
  ['ff:spd', 'ff:wbe', 'ff:vb', 'ff:sb', 'ff:e6'].forEach(function (k) { api.removeBuff(k); });
}

export var override = {
  name: '流萤',
  patchKit: function (kit, member) {
    kit._ovp = { e: (member && member.eidolon) || 0, ult: paramsOf(kit, member, '131003'), es: paramsOf(kit, member, '131009') };
    var u = skillById(kit, '131003');
    if (u) u.effects = u.effects.filter(function (x) { return x.stat === 'actionAdvance'; });
    var es = skillById(kit, '131009');
    if (es) {
      // v2.2：保留数据伤害段（倍率 = p0/p1 + p4/p5 × min(击破特攻, p6)），走通用结算，以便计入削韧 / 超击破 / 协奏等「攻击」触发。
      // （此前清空 hits 并在 onUse 里 deal，导致强化战技不削韧、不触发超击破与队友“攻击后”效果，搜索因此只选 A+。）
      (es.hits || []).forEach(function (h) { if (h.extra && h.extra.stat === 'breakEffect') h.extra.capParam = 6; });
      if (kit._ovp.e >= 1) es.spCost = 0;
    }
    // 星魂 E1（强化战技无视 15% 防御）/ E4 / E6 由下方 hooks 在「完全燃烧」期间按条件施加；删除数据中常驻化的对应效果，避免全程生效与重复。
    (kit.eidolons || []).forEach(function (r) { if (r.rank === 1 || r.rank === 4 || r.rank === 6) r.effects = []; });
    // 行迹「γ模组-过载核心」（攻击力 >1800 时每 10 点 +0.8% 击破特攻）由 onBattleStart 的 ff:atkbe 按面板计算；
    // 数据把它解析成常驻 +0.8%，与 ff:atkbe 重复，删除。
    (kit.traces || []).forEach(function (t) { if (/过载核心/.test(t.name || '')) t.effects = (t.effects || []).filter(function (e) { return e.stat !== 'breakEffect'; }); });
    note(kit, '流萤 完全燃烧手写机制');
    return kit;
  },
  hooks: {
    onBattleStart: function (api) {
      var s = api.stats();
      if (s.atk > 1800) api.addBuff({ key: 'ff:atkbe', stat: 'breakEffect', value: Math.floor((s.atk - 1800) / 10) * 0.008, duration: null, label: '流萤行迹·攻击转击破' });
    },
    onTurnStart: function (api) {
      var c = api.custom;
      if (c.burn && api.av() >= c.burnEnd - 1e-6) exitBurn(api);
    },
    actions: function (api) {
      if (!burnOn(api)) return undefined;
      var p = P(api);
      var es = api.skill('enhancedSkill');
      var spc = es ? (es.spCost || 0) : 1;
      var out = [{ code: 'A+', slot: 'enhancedBasic' }];
      if (api.sp() >= spc) out.unshift({ code: 'E+', slot: 'enhancedSkill', spCost: spc });
      return out;
    },
    onAction: function (api) {
      var p0 = P(api);
      if (api.skill && api.skill.slot === 'enhancedSkill' && p0.e >= 1) {
        if (api.phase === 'before') api.addBuff({ key: 'ff:e1', stat: 'defIgnore', value: 0.15, duration: null, label: '流萤E1·无视防御' });
        else api.removeBuff('ff:e1');
      }
      if (api.phase !== 'after' || !api.skill || api.skill.slot !== 'ult') return;
      var p = P(api), c = api.custom;
      c.burn = true;
      c.burnEnd = api.av() + 10000 / (p.ult[3] || 70);
      api.addBuff({ key: 'ff:spd', stat: 'spd', value: p.ult[2] || 60, duration: null, label: '完全燃烧·速度' });
      api.addBuff({ key: 'ff:wbe', stat: 'weaknessBreakEfficiency', value: (p.ult[1] || 0.5) + (p.e >= 6 ? 0.5 : 0), duration: null, label: '完全燃烧·击破效率' });
      api.addBuff({ key: 'ff:vb', stat: 'vuln_break', value: p.ult[0] || 0.2, duration: null, label: '完全燃烧·击破易伤' });
      if (p.e >= 6) api.addBuff({ key: 'ff:e6', stat: 'resPen_Fire', value: 0.2, duration: null, label: '流萤E6' });
      var be = api.stats().breakEffect;
      if (be >= 2) api.addBuff({ key: 'ff:sb', stat: 'superBreak', value: be >= 3.6 ? 0.5 : 0.35, duration: null, label: '流萤行迹·超击破' });
    }
  }
};
