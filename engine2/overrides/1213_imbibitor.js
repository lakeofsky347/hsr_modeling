// 1213 丹恒•饮月 —— 强化普攻三档（瞬华/天矢阴/盘拏耀跃）+ 逆鳞 + 亢心/叱咤
// 简化假设：
//  * 普攻强化 1/2/3 档分别消耗 1/2/3 战技点（数据 spCost），每个【逆鳞】抵扣 1 点；终结技 +2 逆鳞（上限 3），E2 +1 并行动提前 100%。
//  * 亢心：每段攻击后 +1 层（E1 +2 层，上限 6 / E1 10），持续到回合结束 → 按各段平均层数折算为本次攻击的增伤（瞬华 3 段、天矢阴 5 段、盘拏耀跃 7 段、终结技 3 段）。
//  * 叱咤：强化 n 档 → n 层暴伤 +p0（战技 121302），本次攻击期间生效。
//  * 默认候选：A、A+（1 档）、A++（2 档）、A+++（3 档），由搜索器选择；战技 121302 不单独作为动作。
import { skillById, paramsOf, levelOf, note } from './_util.js';

var LV = [{ id: '121308', code: 'A+', slot: 'enhancedBasic', hits: 3 }, { id: '121310', code: 'A++', slot: 'enhancedBasic2', hits: 5 }, { id: '121312', code: 'A+++', slot: 'enhancedBasic3', hits: 7 }];
function P(api) { return api.member.ch._ovp; }
function avgStacks(n, per, cap) { var s = 0; for (var k = 0; k < n; k++) s += Math.min(cap, k * per); return s / n; }

export var override = {
  name: '丹恒•饮月',
  patchKit: function (kit, member) {
    var e = (member && member.eidolon) || 0;
    kit._ovp = { e: e, skill: paramsOf(kit, member, '121302', 'skill'), tal: paramsOf(kit, member, '121304'), ult: paramsOf(kit, member, '121303') };
    // 第 2/3 档改为独立 slot（引擎每个 slot 只取第一个技能）；等级按普攻等级固定
    LV.forEach(function (l, i) {
      var s = skillById(kit, l.id);
      if (!s) return;
      if (i > 0) { s.defaultLevel = levelOf(kit, member, s, 'basic'); s.slot = l.slot; }
    });
    var t = skillById(kit, '121304');
    if (t) t.effects = [];
    var sk = skillById(kit, '121302');
    if (sk) sk.effects = [];
    note(kit, '丹恒•饮月 强化普攻三档 + 逆鳞');
    return kit;
  },
  hooks: {
    onBattleStart: function (api) { api.custom.sq = 0; },
    actions: function (api) {
      var p = P(api), c = api.custom;
      var out = [];
      LV.forEach(function (l, i) {
        var sk = api.skill(l.slot);
        if (!sk) return;
        var cost = sk.spCost != null ? sk.spCost : i + 1;
        var useSq = Math.min(c.sq || 0, cost);
        var spc = cost - useSq;
        if (api.sp() < spc) return;
        out.push({ code: l.code, slot: l.slot, spCost: spc, onUse: function (a) { a.custom.sq = (a.custom.sq || 0) - useSq; }, _lv: i + 1, _hits: l.hits });
      });
      out.reverse();
      out.push({ code: 'A', slot: 'basic' });
      return out;
    },
    onAction: function (api) {
      var p = P(api), s = api.skill;
      if (!s) return;
      var lv = s.id === '121308' ? 1 : s.id === '121310' ? 2 : s.id === '121312' ? 3 : 0;
      var hits = lv ? LV[lv - 1].hits : s.slot === 'ult' ? 3 : s.slot === 'basic' ? 2 : 0;
      if (api.phase === 'before' && hits) {
        var per = p.e >= 1 ? 2 : 1, cap = p.e >= 1 ? 10 : 6;
        api.addBuff({ key: 'il:kx', stat: 'dmgBonus', value: avgStacks(hits, per, cap) * (p.tal[0] || 0.1), duration: 1, label: '亢心(平均)' });
        if (lv) api.addBuff({ key: 'il:cz', stat: 'critDmg', value: lv * (p.skill[0] || 0.12), duration: 1, label: '叱咤' });
      } else if (api.phase === 'after') {
        api.removeBuff('il:kx'); api.removeBuff('il:cz');
        if (s.slot === 'ult') {
          api.custom.sq = Math.min(3, (api.custom.sq || 0) + (p.ult[2] || 2) + (p.e >= 2 ? 1 : 0));
          if (p.e >= 2) api.advance(1);
        }
      }
    }
  }
};
