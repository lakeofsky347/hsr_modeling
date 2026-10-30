// 1501 火花 —— 直播连线 / 互动陷阱 / 强化普攻 / 笑点暴伤（移植 v1 engine/sim.js）
// 简化假设：
//  * 战技：开启连线（不视为战技，但消耗 1 战技点），随后在战技点允许时连续发动互动陷阱（每次耗 1 点，最多 policy.maxTraps 或 20 次）。
//    礼物按期望：红红火火/恍恍惚惚各 50% → 每次 +1.5 笑点、+1 战技点（v1 deterministic）。
//  * 连线期间只能强化普攻：倍率 p0 + 每陷阱 +p3（相邻 p1 + 每陷阱 +p4）；持好活当赏时追加 40%/20% 欢愉伤害 + 每陷阱 20%。
//  * 终结技：(p1 + p2×欢愉度) 攻击力全体；持好活当赏时追加 48% 全体欢愉伤害；+2 笑点 + 行迹 2/4/8（按欢愉人数）+ E4 5。
//  * 行迹：攻击力>2000 每 100 点欢愉度 +5%（≤80%）；每笑点全队暴伤 +8%（≤80%，随笑点实时更新）。
//  * 欢愉技（阿哈时刻）：全体 p1 + 20 次（E6 + min(20, 当前笑点)）× p0 随机单体，笑点 = 好活当赏 + 当前笑点；获得 2 爆点，+5 能量。
//  * E1：阿哈时刻结束 +5 笑点；每笑点全队抗穿 +1.5%（≤15%）。E2：阿哈时刻结束行动提前 100% + 2 爆点，每爆点暴伤 +10%（≤40%，不衰减）。
//  * 升格：暴伤 +120%、自身无视防御 20%（v1 只给火花本人）。爆点抵扣战技点未建模（只计暴伤层数）。
import { skillById, dropEffects, paramsOf, traceParams, eidolonParams, note, composeHooks } from './_util.js';
import { REG, commonHooks, gainJoke, gr, joke, elHit, upgraded, cs, elationCount } from './_elation.js';

var ID = '1501';
function P(api) { return api.custom._p; }

function refresh(api, j) {
  var c = cs(api, j), p = c._p;
  if (!p) return;
  var jk = joke(api);
  api.addBuff({ key: 'spx:p8', stat: 'critDmg', value: Math.min(p.p8[1], jk * p.p8[0]), duration: null, label: '火花·真伪调色盘' }, 'team');
  if (p.e >= 1) api.addBuff({ key: 'spx:e1', stat: 'resPen', value: Math.min(p.e1[2], jk * p.e1[1]), duration: null, label: '火花E1·抗穿' }, 'team');
  if (p.e >= 2) api.addBuff({ key: 'spx:e2', stat: 'critDmg', value: Math.min(0.4, (c.sparks || 0) * 0.1), duration: null, label: '火花E2·爆点暴伤' }, j);
  var up = upgraded(api);
  api.addBuff({ key: 'spx:innCd', stat: 'critDmg', value: up ? p.inn[4] : 0, duration: null, label: '兔子戏法·暴伤' }, j);
  api.addBuff({ key: 'spx:innDi', stat: 'defIgnore', value: up ? p.inn[0] : 0, duration: null, label: '兔子戏法·无视防御' }, j);
}

REG[ID] = {
  refresh: refresh,
  elationSkill: function (api, j, M) {
    var c = cs(api, j), p = c._p;
    if (!p) return;
    var jk = (api.ctx.opts && api.ctx.opts.goodRewardOnElationSkill ? (c.gr || 0) : 0) + joke(api);
    elHit(api, j, { mult: p.x[1], joke: jk, target: 'aoe', note: '信号溢出：好戏返场！', entry: M.entry });
    var n = p.x[2] + (p.e >= 6 ? Math.min(20, joke(api)) : 0);
    elHit(api, j, { mult: p.x[0], count: n, joke: jk, target: 'single', note: '好戏返场·额外 ×' + n, entry: M.entry });
    c.sparks = (c.sparks || 0) + (p.x[3] || 2);
    api.gainEnergy(5, j);
  },
  afterMoment: function (api, j, M) {
    var c = cs(api, j), p = c._p;
    if (!p) return;
    if (p.e >= 1) { gainJoke(api, p.e1[0] || 5); }
    if (p.e >= 2) { c.sparks = (c.sparks || 0) + 2; api.advance(1, j); }
    refresh(api, j);
  }
};

export var override = {
  name: '火花',
  patchKit: function (kit, member) {
    var e = (member && member.eidolon) || 0;
    kit._ovp = {
      e: e, ult: paramsOf(kit, member, '150103'), tal: paramsOf(kit, member, '150104'), eb: paramsOf(kit, member, '150108'),
      trap: paramsOf(kit, member, '150109'), x: paramsOf(kit, member, '150120', 'elation'), inn: paramsOf(kit, member, '150129'),
      p6: traceParams(kit, '甜蜜！笑点签售会'), p7: traceParams(kit, '炫目！人设万花筒'), p8: traceParams(kit, '沸腾！真伪调色盘'),
      e1: eidolonParams(kit, 1), e4: eidolonParams(kit, 4), e6: eidolonParams(kit, 6)
    };
    ['150104', '150120', '150129', '150107'].forEach(function (id) { var s = skillById(kit, id); if (s) { s.hits = []; s.effects = []; } });
    dropEffects(kit, function (x, owner) { return owner && (owner.rank === 1 || owner.rank === 2 || owner.rank === 4 || owner.name === '甜蜜！笑点签售会' || owner.name === '沸腾！真伪调色盘'); });
    // E6 全属性抗穿按全队（v1 collectBuffs 对全队生效）
    var r6 = (kit.eidolons || []).find(function (r) { return r.rank === 6; });
    if (r6) r6.effects = [{ stat: 'resPen', value: 0.2, target: 'team', trigger: 'passive', key: '1501:e6' }];
    note(kit, '火花 手写机制（连线/陷阱/笑点暴伤）');
    return kit;
  },
  hooks: composeHooks(commonHooks, {
    onBattleStart: function (api) {
      var c = api.custom;
      c._p = api.member.ch._ovp;
      c.link = false; c.traps = 0; c.sparks = 0;
      var p = c._p, atk = api.stats().atk;
      if (p.p6.length && atk > p.p6[0]) api.addBuff({ key: 'spx:p6', stat: 'elation', value: Math.min(p.p6[3], Math.floor((atk - p.p6[0]) / p.p6[1]) * p.p6[2]), duration: null, label: '甜蜜！笑点签售会' });
      refresh(api, api.index);
    },
    actions: function (api) {
      var c = api.custom, p = P(api);
      if (c.link) {
        return [{ code: 'A+', run: function (a) {
          var cc = a.custom;
          var sk = JSON.parse(JSON.stringify(a.skill('enhancedBasic')));
          if (sk.hits && sk.hits[0]) sk.hits[0].mult = (sk.hits[0].mult || p.eb[0]) + cc.traps * p.trap[3];
          if (sk.hits && sk.hits[1]) sk.hits[1].mult = (sk.hits[1].mult || p.eb[1]) + cc.traps * p.trap[4];
          var entry = a.cast(sk, { code: 'A+' });
          if (cc.gr > 0) {
            elHit(a, a.index, { mult: p.tal[2], joke: cc.gr, target: 'single', note: '幕后花手·强化普攻', entry: entry });
            if (a.ctx.enemyCount > 1) elHit(a, a.index, { mult: p.tal[3], joke: cc.gr, target: 'adjacent', note: '幕后花手·相邻', entry: entry });
            if (cc.traps > 0) elHit(a, a.index, { mult: p.tal[0], count: cc.traps, joke: cc.gr, target: 'single', note: '幕后花手·陷阱 ×' + cc.traps, entry: entry });
          }
          cc.link = false; cc.traps = 0;
        } }];
      }
      var maxTraps = (api.member.policy && api.member.policy.maxTraps) || 20;
      var out = [];
      if (api.sp() >= 1) out.push({ code: 'E', run: function (a) {
        var cc = a.custom;
        var entry = a.cast('skill', { code: 'E' });
        cc.link = true; cc.traps = 0;
        var fire = function () { cc.traps += 1; gainJoke(a, 1.5); };
        fire();                                   // 技能自带的 1 次
        while (cc.traps < maxTraps && a.sp() > 0) { a.gainSP(-1); fire(); a.gainSP(1); }
        a.gainEnergy(30, a.index, { regen: true });
        if (entry) entry.note = (entry.note ? entry.note + '；' : '') + '互动陷阱 ×' + cc.traps + '（期望 +' + (1.5 * cc.traps) + ' 笑点）';
      } });
      out.push({ code: 'A', slot: 'basic' });
      return out;
    },
    onHit: function (api) {
      // 终结技倍率 = p1 + p2 × 欢愉度
      if (api.hit && api.hit.dmgType === 'ult' && api.hit.scaling === 'atk' && !api.dot) {
        var p = P(api), base = p.ult[1] || 0.5;
        return api.result.total * (base + p.ult[2] * api.stats().elation) / base;
      }
    },
    onAction: function (api) {
      if (api.phase !== 'after') return;
      var c = api.custom, p = P(api), s = api.skill;
      if (!s || s.slot !== 'ult') return;
      if (c.gr > 0) elHit(api, api.index, { mult: p.tal[1], joke: c.gr, target: 'aoe', note: '幕后花手·终结技', entry: api.entry });
      var n = elationCount(api);
      var extra = p.p7.length ? (n >= 3 ? p.p7[2] : n >= 2 ? p.p7[1] : p.p7[0]) : 0;
      gainJoke(api, (p.ult[0] || 2) + extra + (p.e >= 4 ? (p.e4[0] || 5) : 0));
      if (p.e >= 4) api.addBuff({ key: 'spx:e4', stat: 'elation', value: p.e4[1] || 0.36, duration: p.e4[2] || 3, label: '火花E4' });
    }
  })
};