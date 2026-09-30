// 1303 阮•梅 —— 弦外音（战技）/ 常驻结界（终结技）/ 残梅绽 / 天赋击破追伤
// 简化假设：
//  * 战技【弦外音】3 回合（阮梅回合开始 −1）：全队增伤 p0（+ 落烛照水燃：击破特攻 >120% 每 10% +6%，≤36%）、弱点击破效率 +p1。
//  * 终结技结界 2 回合（E6 3，阮梅回合开始 −1）：全队抗穿 p0（25%），E1 无视防御 20%；结界期间敌人从击破恢复时受到残梅绽
//    （p4 × 冰属性击破伤害），延长击破并使其行动延后 10%+20%×击破特攻（引擎 onBreakRecover 触发器，结界 2 回合内每次击破 1 次）。
//  * 天赋：队友速度 +10%（数据）；我方每次使敌人进入击破 → 阮梅追加 p1（120%）冰属性击破伤害（E6 +200%）。
import { skillById, paramsOf, note } from './_util.js';

function P(api) { return api.member.ch._ovp; }

export var override = {
  name: '阮•梅',
  patchKit: function (kit, member) {
    kit._ovp = { e: (member && member.eidolon) || 0, skill: paramsOf(kit, member, '130302'), ult: paramsOf(kit, member, '130303'), tal: paramsOf(kit, member, '130304') };
    // 【残梅绽】保留数据中的 onBreakRecover 触发段，交给引擎通用触发器：敌人尝试从击破恢复时造成 p4 冰属性击破伤害，
    // 并延长击破、行动延后 (10% + 20%×击破特攻)（v2.1 以前在 onEnemyTurn 手动结算，只有伤害、没有延长击破/行动延后）。
    var ult0 = skillById(kit, '130303');
    var bloom = ult0 ? (ult0.hits || []).filter(function (h) { return h.trigger === 'onBreakRecover'; }) : [];
    ['130302', '130303'].forEach(function (id) { var s = skillById(kit, id); if (s) { s.hits = []; s.effects = []; } });
    if (ult0) ult0.hits = bloom;
    var t = skillById(kit, '130304');
    if (t) t.hits = [];
    var tq = skillById(kit, '130307');
    if (tq) tq.hits = [];
    (kit.eidolons || []).forEach(function (r) { if (r.rank === 1) r.effects = []; });
    note(kit, '阮•梅 弦外音/结界手写机制');
    return kit;
  },
  hooks: {
    onBattleStart: function (api) {
      var c = api.custom;
      c.sk = 0; c.field = 0;
      // 秘技：开场自动触发 1 次战技（不耗点）
      c.sk = 3; applySkill(api);
    },
    onTurnStart: function (api) {
      var c = api.custom;
      if (c.sk > 0 && --c.sk === 0) { api.removeBuff('rm:db', 'team'); api.removeBuff('rm:wbe', 'team'); }
      if (c.field > 0 && --c.field === 0) { api.removeBuff('rm:res', 'team'); api.removeBuff('rm:e1', 'team'); }
    },
    onAction: function (api) {
      var s = api.skill, p = P(api), c = api.custom;
      if (!s || api.phase !== 'after') return;
      if (s.slot === 'skill') { c.sk = 3; applySkill(api); }
      if (s.slot === 'ult') {
        c.field = p.e >= 6 ? 3 : 2;
        api.addBuff({ key: 'rm:res', stat: 'resPen', value: p.ult[0] || 0.25, duration: null, label: '阮梅结界·抗穿' }, 'team');
        if (p.e >= 1) api.addBuff({ key: 'rm:e1', stat: 'defIgnore', value: 0.2, duration: null, label: '阮梅E1' }, 'team');
      }
    },
    onBreak: function (api) {
      var p = P(api);
      api.deal({ scaling: 'break', mult: (p.tal[1] || 1.2) + (p.e >= 6 ? 2 : 0), target: 'single', dmgType: 'break', element: 'Ice' }, '分型的螺旋·击破伤害');
    }
  }
};

function applySkill(api) {
  var p = P(api);
  var be = api.stats().breakEffect;
  var extra = be > 1.2 ? Math.min(0.36, Math.floor((be - 1.2) / 0.1 + 1e-9) * 0.06) : 0;
  api.addBuff({ key: 'rm:db', stat: 'dmgBonus', value: (p.skill[0] || 0.32) + extra, duration: null, label: '弦外音·增伤' }, 'team');
  api.addBuff({ key: 'rm:wbe', stat: 'weaknessBreakEfficiency', value: p.skill[1] || 0.5, duration: null, label: '弦外音·击破效率' }, 'team');
}