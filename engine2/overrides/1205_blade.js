// 1205 刃 —— 地狱变（强化普攻 无间剑树）/ 充能追击
// 简化假设：
//  * 战技进入【地狱变】3 回合（数据增伤 40%），施放战技不结束回合 → 以额外回合立即接强化普攻；地狱变期间只能 A+（不耗不回战技点）。
//  * 充能：战技、A+、终结技（消耗生命）各 +1；每个敌人回合按受击 +1（刃为嘲讽高的毁灭，假设每回合必被攻击）；满 5 层（E6 4 层）立即追加攻击
//    （天赋 44% 攻击 + 110% 生命 全体，E6 + 50% 生命），清零。通用追加攻击关闭（天赋段改由此处触发）。
//  * 终结技额外按「累计已损失生命值」= 90% 生命上限（上限）计入：主目标 +p4×0.9 生命，相邻 +p5×0.9 生命；E1 主目标 +150%×0.9 生命。
import { skillById, paramsOf, note } from './_util.js';

function P(api) { return api.member.ch._ovp; }
function charge(api, n) {
  var c = api.custom, p = P(api);
  c.ch = (c.ch || 0) + n;
  var cap = p.e >= 6 ? 4 : 5;
  if (c.ch >= cap) {
    c.ch = 0;
    var entry = null;
    var hp = api.stats().hp;
    api.deal({ scaling: 'atk', mult: p.tal[1] || 0.44, target: 'aoe', dmgType: 'fua' }, '倏忽恩赐·追加攻击', entry);
    api.deal({ scaling: 'hp', mult: (p.tal[3] || 1.1) + (p.e >= 6 ? 0.5 : 0), target: 'aoe', dmgType: 'fua' }, '倏忽恩赐·生命段', entry);
    api.gainEnergy(10, api.index, { regen: true });
    void hp;
  }
}

export var override = {
  name: '刃',
  patchKit: function (kit, member) {
    kit._ovp = { e: (member && member.eidolon) || 0, tal: paramsOf(kit, member, '120504'), ult: paramsOf(kit, member, '120503') };
    var t = skillById(kit, '120504');
    if (t) { t.hits = []; }
    note(kit, '刃 地狱变/充能追击手写机制');
    return kit;
  },
  hooks: {
    onBattleStart: function (api) { api.custom.hell = 0; api.custom.ch = 0; },
    onTurnStart: function (api) { if (api.custom.hell > 0 && !api.custom._extra) api.custom.hell -= 1; api.custom._extra = false; },
    onEnemyTurn: function (api) { charge(api, 1); },
    actions: function (api) {
      var c = api.custom;
      if (c.hell > 0) return [{ code: 'A+', slot: 'enhancedBasic', spCost: 0 }];
      var out = [];
      if (api.sp() >= 1) out.push({ code: 'E', slot: 'skill', onUse: function (a) { a.custom.hell = 3; a.custom._extra = true; a.extraTurn(); } });
      out.push({ code: 'A', slot: 'basic' });
      return out;
    },
    onAction: function (api) {
      var s = api.skill, p = P(api);
      if (!s || api.phase !== 'after') return;
      if (s.slot === 'skill' || s.slot === 'enhancedBasic' || s.slot === 'ult') charge(api, 1);
      if (s.slot === 'ult') {
        var lost = 0.9;
        api.deal({ scaling: 'hp', mult: (p.ult[4] || 1) * lost + (p.e >= 1 ? 1.5 * lost : 0), target: 'single', dmgType: 'ult' }, '大辟万死·已损失生命', api.entry);
        if (api.ctx.enemyCount > 1) api.deal({ scaling: 'hp', mult: (p.ult[5] || 0.4) * lost, target: 'adjacent', dmgType: 'ult' }, '大辟万死·相邻已损失生命', api.entry);
      }
    }
  }
};
