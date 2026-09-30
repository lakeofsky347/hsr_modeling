// 1306 花火 —— 梦游鱼（主 C 行动提前 50% + 暴伤转化）/ 叙述性诡计 / 谜诡
// 简化假设：
//  * 战技目标 = policy.buffTarget（charId）→ 主 C；暴伤 +(p0×花火暴伤 + p1)（E6 再 +30%×花火暴伤），持续到目标下一回合结束（人造花 → 持续 1 回合按目标回合计）；
//    目标行动提前 p3（50%）（数据效果保留）。
//  * 天赋：队友每次施放消耗战技点的动作 → 全队增伤 +p1×层（≤3 层，2 回合）；【谜诡】期间每层额外 +p2（终结技 2 回合，E1 3 回合 + 攻击力 40%）。
//  * 战技点上限 +2（E4 +3）：数据 spMax 由引擎处理（若引擎未处理则无此效果）；终结技回 4 点（数据）E4 +1。
import { skillById, paramsOf, note } from './_util.js';

function P(api) { return api.member.ch._ovp; }
function target(api) {
  var pol = api.member.policy || {};
  var t = pol.buffTarget ? api.findMember(String(pol.buffTarget)) : -1;
  if (t < 0 || t === api.index) t = api.ctx.mainC;
  if (t === api.index) t = api.index === 0 ? (api.ctx.members.length > 1 ? 1 : 0) : 0;
  return t;
}
function talentVal(api) {
  var p = P(api), c = api.custom;
  return (p.tal[1] || 0.06) + (c.cipher > 0 ? (p.ult[2] || 0.1) : 0);
}

export var override = {
  name: '花火',
  patchKit: function (kit, member) {
    kit._ovp = { e: (member && member.eidolon) || 0, skill: paramsOf(kit, member, '130602'), ult: paramsOf(kit, member, '130603'), tal: paramsOf(kit, member, '130604') };
    var s = skillById(kit, '130602');
    if (s) s.effects = s.effects.filter(function (e) { return e.stat !== 'critDmg'; });
    var t = skillById(kit, '130604');
    if (t) t.effects = t.effects.filter(function (e) { return e.stat !== 'dmgBonus'; });
    if (kit._ovp.e >= 4) { var u = skillById(kit, '130603'); if (u) u.effects.forEach(function (e) { if (e.stat === 'spFlat') { e.value = (kit._ovp.ult[1] || 4) + 1; } }); }
    note(kit, '花火 战技暴伤转化/天赋增伤手写机制');
    return kit;
  },
  hooks: {
    onBattleStart: function (api) { api.custom.cipher = 0; },
    onTurnStart: function (api) { if (api.custom.cipher > 0) api.custom.cipher -= 1; },
    onAction: function (api) {
      var s = api.skill, p = P(api);
      if (!s || api.phase !== 'after') return;
      if (s.slot === 'skill') {
        var cd = api.stats().critDmg;
        var v = (p.skill[0] || 0.24) * cd + (p.skill[1] || 0.45) + (p.e >= 6 ? 0.3 * cd : 0);
        var t = target(api);
        api.addBuff({ key: 'spk:cd', stat: 'critDmg', value: v, duration: 1, label: '梦游鱼·暴伤' }, t);
        if (t !== api.index && !(s.effects || []).some(function (e) { return e.stat === 'actionAdvance'; })) api.advance(p.skill[3] || 0.5, t);
      } else if (s.slot === 'ult') {
        api.custom.cipher = p.e >= 1 ? 3 : 2;
        if (p.e >= 1) api.addBuff({ key: 'spk:e1', stat: 'atkPct', value: 0.4, duration: 3, label: '花火E1·谜诡攻击' }, 'team');
        var b = api.getBuff('spk:tal', 'team');
        if (b) { api.addBuff({ key: 'spk:tal', stat: 'dmgBonus', value: talentVal(api), duration: 2, maxStacks: 3, label: '叙述性诡计' }, 'team'); api.setStacks('spk:tal', b.stacks, 'team'); }
      }
    },
    onAnyAction: function (api) {
      var s = api.skill;
      if (!s || !((s.spCost || 0) > 0)) return;
      var n = Math.min(3, s.spCost);
      for (var k = 0; k < n; k++) api.addBuff({ key: 'spk:tal', stat: 'dmgBonus', value: talentVal(api), duration: 2, maxStacks: 3, label: '叙述性诡计' }, 'team');
    }
  }
};