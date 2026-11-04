// 1309 知更鸟 —— 协奏（终结技状态）
// 简化假设：
//  * 终结技进入【协奏】：全队攻击力 +(p0×知更鸟攻击力 + p2)（开大时快照），除自身外队友行动提前 100%（数据）；
//    知更鸟移出行动序列直到倒计时（速度 p1=90 → 10000/90 AV）结束，届时退出协奏并立即行动。
//  * 协奏期间队友每次攻击后，知更鸟追加 p3（120%）攻击力物理附加伤害，暴击率固定 100%、暴伤固定 150%（E6 +450%，最多 8 次）。
//  * 天赋：全队暴伤 +20%（数据）；队友每次攻击知更鸟 +2 能量（E2 +1）。E1 协奏期间全队抗穿 24%；E2 协奏期间全队速度 +16%。
//  * 行迹：开场行动提前 25%；协奏期间追加攻击暴伤 +25%（手写）；战技额外 +5 能量（数据效果，受充能影响）。
import { skillById, paramsOf, note } from './_util.js';

function P(api) { return api.member.ch._ovp; }
function endConcerto(api) {
  var c = api.custom;
  c.conc = false;
  ['rb:atk', 'rb:e1', 'rb:e2', 'rb:fua'].forEach(function (k) { api.removeBuff(k, 'team'); });
}

export var override = {
  name: '知更鸟',
  patchKit: function (kit, member) {
    kit._ovp = { e: (member && member.eidolon) || 0, ult: paramsOf(kit, member, '130903', 'ult'), tal: paramsOf(kit, member, '130904') };
    var u = skillById(kit, '130903');
    if (u) { u.hits = []; u.effects = u.effects.filter(function (e) { return e.stat === 'actionAdvance'; }); }
    var t = skillById(kit, '130904');
    if (t) t.effects = t.effects.filter(function (e) { return e.stat !== 'energyFlat'; });
    // 行迹「即兴装饰」（协奏期间追加攻击暴伤 +25%）由 onAction 的 rb:fua（critDmg_fua，协奏结束移除）实现；
    // 数据把它解析成全队常驻的通用暴伤 +25%，删除。行迹「模进乐段」（战技 +5 能量）保留数据效果（onSkill，受充能影响），
    // 不再在 hook 里重复 +5。
    (kit.traces || []).forEach(function (t) { if (t.name === '即兴装饰') t.effects = []; });
    note(kit, '知更鸟 协奏手写机制');
    return kit;
  },
  hooks: {
    // 行迹「华彩花腔」开场行动提前 25% 由数据效果（battleStart actionAdvance）处理；此前这里再 advance(0.25) 造成重复（首动 40.9 → 61.3 AV）
    onBattleStart: function (api) { api.custom.conc = false; api.custom.e6 = 0; },
    onTurnStart: function (api) { if (api.custom.conc) endConcerto(api); },
    onAction: function (api) {
      var s = api.skill, p = P(api), c = api.custom;
      if (!s || api.phase !== 'after') return;
      if (s.slot !== 'ult') return;
      c.conc = true; c.e6 = 0;
      api.addBuff({ key: 'rb:atk', stat: 'atk', value: (p.ult[0] || 0.228) * api.stats().atk + (p.ult[2] || 200), duration: null, label: '协奏·攻击力' }, 'team');
      api.addBuff({ key: 'rb:fua', stat: 'critDmg_fua', value: 0.25, duration: null, label: '即兴装饰' }, 'team');
      if (p.e >= 1) api.addBuff({ key: 'rb:e1', stat: 'resPen', value: 0.24, duration: null, label: '知更鸟E1' }, 'team');
      if (p.e >= 2) api.addBuff({ key: 'rb:e2', stat: 'spdPct', value: 0.16, duration: null, label: '知更鸟E2' }, 'team');
      // 倒计时：知更鸟下次行动 = 当前 + 10000/90
      api.unit.nextAv = api.av() + 10000 / (p.ult[1] || 90);
      // 只在回合内开大时锁住时刻：回合外插入不会被 endTurn 覆盖，锁留下来会吞掉她下一回合的正常轴
      if (api.unit.inTurn) api.unit.avLock = true;
      api.unit.custom._advanced = true;
    },
    onAnyAction: function (api) {
      if (api.actor === api.index || !api.isAttack) return;
      var p = P(api), c = api.custom;
      api.gainEnergy((p.tal[1] || 2) + (p.e >= 2 ? 1 : 0), api.index, { regen: true });
      if (!c.conc) return;
      var cd = 1.5 + (p.e >= 6 && c.e6 < 8 ? 4.5 : 0);
      if (p.e >= 6) c.e6 += 1;
      api.deal({ scaling: 'atk', mult: p.ult[3] || 1.2, target: 'single', dmgType: 'ult', element: 'Physical', additional: true, fixedCrit: { rate: 1, dmg: cd } }, '协奏·附加伤害');
    }
  }
};
