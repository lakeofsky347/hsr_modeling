// 1308 黄泉 —— 残梦（9 层开大）/ 集真赤 / 啼泽雨斩
// 简化假设：
//  * 残梦：开场 5（行迹赤鬼）；自身战技 +1；任一队友施放战技/终结技且该技能对敌方施加负面（effects 目标为 enemy）或施放者为「虚无」命途时 +1；
//    E2 自身回合开始 +1。9 层可放终结技，施放后清零（溢出/四相断我未建模）。能量条 = 残梦（仅用于显示与搜索启发）。
//  * 终结技：主目标总倍率 p5（3.72，含 3 次啼泽雨斩 + 黄泉返渡），其他目标 3.0（p2 + 3×p0... 按数据最大值）；期间敌方全抗 −p1(20%)；
//    行迹雷心：终结技期间增伤 30%×3 层，黄泉返渡追加 6×25% 随机单体（终结技伤害）。
//  * 奈落：队内其他「虚无」命途 1/2 名 → 普攻/战技/终结技伤害 ×1.15/1.6（E2 需求数 −1）。
import { skillById, paramsOf, note } from './_util.js';

function P(api) { return api.member.ch._ovp; }
function setSt(api, v) { api.custom.st = Math.max(0, Math.min(9, v)); api.setEnergy(api.custom.st); }
function nihilCount(api) {
  var n = 0;
  for (var j = 0; j < api.ctx.members.length; j++) {
    if (j === api.index) continue;
    var m = api.ctx.members[j], ch = m.ch || api.ctx.data.characters[m.charId];
    if (ch && ch.path === 'Warlock') n++;
  }
  return n;
}

export var override = {
  name: '黄泉',
  patchKit: function (kit, member) {
    kit._ovp = { e: (member && member.eidolon) || 0, ult: paramsOf(kit, member, '130803', 'ult'), tal: paramsOf(kit, member, '130804') };
    var u = skillById(kit, '130803');
    if (u) { u.hits = []; u.effects = []; }
    var t = skillById(kit, '130804');
    if (t) { t.hits = []; t.effects = []; }
    ['130814', '130815', '130816', '130817'].forEach(function (id) { var s = skillById(kit, id); if (s) { s.hits = []; s.effects = []; } });
    (kit.traces || []).forEach(function (tr) { if (tr.name === '雷心') tr.effects = []; });
    note(kit, '黄泉 残梦/终结技手写机制');
    return kit;
  },
  hooks: {
    onBattleStart: function (api) { setSt(api, 5); },
    onTurnStart: function (api) { if (P(api).e >= 2) setSt(api, api.custom.st + 1); },
    ultReady: function (api) { return (api.custom.st || 0) >= 9; },
    onAnyAction: function (api) {
      var s = api.skill;
      if (!s || api.actor === api.index) return;
      if (s.slot !== 'skill' && s.slot !== 'ult' && s.slot !== 'enhancedSkill') return;
      var m = api.ctx.members[api.actor], ch = m.ch || api.ctx.data.characters[m.charId];
      var debuff = (s.effects || []).some(function (e) { return e.target === 'enemy'; }) || (ch && ch.path === 'Warlock');
      if (debuff) setSt(api, api.custom.st + 1);
    },
    onHit: function (api) {
      var h = api.hit;
      if (!h || api.dot) return;
      var t = h.dmgType;
      if (t !== 'basic' && t !== 'skill' && t !== 'ult') return;
      var need = P(api).e >= 2 ? 1 : 2, n = nihilCount(api);
      var f = n >= need ? 1.6 : n >= need - 1 && n >= 1 ? 1.15 : 1;
      if (f !== 1) return api.result.total * f;
    },
    onAction: function (api) {
      var p = P(api), s = api.skill;
      if (!s) return;
      if (api.phase === 'after' && s.slot === 'skill') setSt(api, api.custom.st + 1);
      if (s.slot !== 'ult') return;
      if (api.phase === 'before') {
        api.addBuff({ key: 'ach:res', stat: 'resShred', value: p.tal[1] || 0.2, duration: 1, label: '红叶时雨·减抗' }, 'enemy');
        api.addBuff({ key: 'ach:lx', stat: 'dmgBonus', value: 0.9, duration: 1, label: '雷心 ×3' });
        var main = p.ult[5] || 3.72, other = 3.0;
        api.deal({ scaling: 'atk', mult: main - other, target: 'single', dmgType: 'ult' }, '啼泽雨斩(主目标)', api.entry);
        api.deal({ scaling: 'atk', mult: other, target: 'aoe', dmgType: 'ult' }, '啼泽雨斩/黄泉返渡', api.entry);
        api.deal({ scaling: 'atk', mult: 0.25, count: 6, target: 'single', dmgType: 'ult' }, '雷心·追加 ×6', api.entry);
      } else {
        api.removeBuff('ach:res', 'enemy'); api.removeBuff('ach:lx');
        setSt(api, 0);
      }
    }
  }
};
