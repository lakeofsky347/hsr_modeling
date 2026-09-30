// 1212 镜流 —— 朔望 / 转魄（寒川映月 E+）
// 简化假设：
//  * 战技 +1 朔望、行动提前 10%（行迹）；终结技后 +1 朔望；秘技开场 +1 朔望。朔望达 2 → 进入【转魄】：行动提前 100%、暴击率 +p6、
//    朔望上限 3（E6 4 并 +1 层）；转魄期间只能 E+（不耗战技点），每次 −1 朔望，0 层退出。
//  * 转魄攻击时消耗队友 4% 生命上限：攻击力 + min(p3×基础攻击, p2 × Σ队友4%生命上限)（E2 +90% / 上限 +30%），本次攻击期间生效；按满额可消耗计算。
//  * 行迹：转魄期间终结技增伤 +20%；E1 终结技/E+ 暴伤 +24%，单目标额外 100% 攻击力；E6 转魄期间暴伤 +50%。
import { skillById, paramsOf, note } from './_util.js';

function P(api) { return api.member.ch._ovp; }
function enter(api) {
  var c = api.custom, p = P(api);
  c.trans = true;
  c.cap = p.e >= 6 ? 4 : 3;
  if (p.e >= 6) c.syz = Math.min(c.cap, c.syz + 1);
  api.addBuff({ key: 'jl:cr', stat: 'critRate', value: p.tal[6] || 0.5, duration: null, label: '转魄·暴击率' });
  if (p.e >= 6) api.addBuff({ key: 'jl:e6', stat: 'critDmg', value: 0.5, duration: null, label: '镜流E6' });
  api.advance(1);
}
function gain(api, n) {
  var c = api.custom;
  c.syz = Math.min(c.trans ? c.cap : 3, (c.syz || 0) + n);
  if (!c.trans && c.syz >= 2) enter(api);
}

export var override = {
  name: '镜流',
  patchKit: function (kit, member) {
    kit._ovp = { e: (member && member.eidolon) || 0, tal: paramsOf(kit, member, '121204') };
    var t = skillById(kit, '121204');
    if (t) t.effects = [];
    note(kit, '镜流 朔望/转魄手写机制');
    return kit;
  },
  hooks: {
    onBattleStart: function (api) { var c = api.custom; c.syz = 0; c.trans = false; c.cap = 3; gain(api, 1); },
    actions: function (api) {
      if (api.custom.trans) return [{ code: 'E+', slot: 'enhancedSkill', spCost: 0 }];
      return undefined;
    },
    onAction: function (api) {
      var c = api.custom, p = P(api), s = api.skill;
      if (!s) return;
      var attack = s.slot === 'enhancedSkill' || (s.slot === 'ult' && c.trans);
      if (api.phase === 'before') {
        if (attack) {
          var hpSum = 0;
          for (var j = 0; j < api.ctx.members.length; j++) if (j !== api.index) hpSum += 0.04 * api.stats(j).hp;
          var base = (api.member.panel && api.member.panel._base && api.member.panel._base.atk) || api.stats().atk / 2;
          var gainAtk = Math.min(((p.tal[3] || 1.8) + (p.e >= 2 ? 0.3 : 0)) * base, ((p.tal[2] || 5.4) + (p.e >= 2 ? 0.9 : 0)) * hpSum);
          api.addBuff({ key: 'jl:atk', stat: 'atk', value: gainAtk, duration: 1, label: '转魄·攻击力' });
          if (s.slot === 'ult') api.addBuff({ key: 'jl:ultdb', stat: 'dmgBonus', value: 0.2, duration: 1, label: '转魄·终结技增伤' });
          if (p.e >= 1) api.addBuff({ key: 'jl:e1', stat: 'critDmg', value: 0.24, duration: 1, label: '镜流E1' });
        }
        return;
      }
      api.removeBuff('jl:atk'); api.removeBuff('jl:ultdb'); api.removeBuff('jl:e1');
      if (s.slot === 'skill') { gain(api, 1); api.advance(0.1); }
      else if (s.slot === 'ult') gain(api, 1);
      else if (s.slot === 'enhancedSkill') {
        if (p.e >= 1 && api.ctx.enemyCount === 1) api.deal({ scaling: 'atk', mult: 1, target: 'single', dmgType: 'skill' }, '镜流E1·额外', api.entry);
        c.syz -= 1;
        if (c.syz <= 0) { c.syz = 0; c.trans = false; api.removeBuff('jl:cr'); api.removeBuff('jl:e6'); }
      }
    }
  }
};
