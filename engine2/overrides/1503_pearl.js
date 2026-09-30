// 1503 真珠 —— 好活当赏（无限持续/上限 50）/ 深度学习（强化普攻充能）/ 美学底本（移植 v1 engine/sim.js）
// 简化假设：
//  * 美学底本 = policy.lordTarget（charId）→ 否则 1506 → 否则主 C（非真珠）。秘技：开场 +20 好活当赏、深度学习 2 充能。
//  * 深度学习充能 > 0 时只用强化普攻（美学底本为欢愉角色 → 幻造星月：防御力全体 + 15% 欢愉（好活当赏）
//    + 60% 欢愉（以美学底本面板/好活当赏结算，计入美学底本）；否则绘制末浪）。
//  * 战技 +15 好活当赏；终结技 +20 好活当赏、+3 充能；美学底本行动提前 10/15/30%（按欢愉人数）；4 名欢愉角色时
//    底本获得 +30 好活当赏、+60 笑点（E2 翻倍、E2 其他欢愉角色也行动提前）。额外回合本身按行动提前 30% 近似。
//  * 感知容差：其他队友回合开始 +5 好活当赏（每轮 ≤50，真珠回合开始重置）；无 onAnyTurnStart 时以队友行动后近似。
//  * 艺术壁垒：美学底本施放终结技时为真珠 +90 能量。治疗 → 阿哈【戏中人的异想国】+1 愿力（每次阿哈终结技后 1 次）。
//  * 欢愉技：全体 10/15/20/40%（按欢愉人数；E4 ×2）欢愉伤害直接结算（v1 同），笑点 = 好活当赏 + 当前笑点，+5 能量。
//  * 行迹洞察万物：防御 ≥2400 欢愉度 +32%，每超 100 点 +3%（最多计入 3600）。E1 全队欢愉度 10/20/60%；E2 全队增笑 15%；E6 抗穿 20% + 强化普攻额外 240%。
import { skillById, dropEffects, paramsOf, traceParams, eidolonParams, note, composeHooks } from './_util.js';
import { REG, commonHooks, gainJoke, gainGR, joke, elHit, cs, elationCount, isElation, sh } from './_elation.js';

var ID = '1503';
function P(api) { return api.custom._p; }
function tier(n, arr) { return arr[Math.max(0, Math.min(arr.length - 1, n - 1))]; }

function healTick(api) {
  var aha = api.findMember('1511');
  if (aha < 0) return;
  var c = cs(api, aha);
  if (!c._healUsed && c._p) { c._healUsed = true; c.fervor = Math.min(8, (c.fervor || 0) + 1); api.setEnergy(c.fervor, aha); }
}

REG[ID] = {
  elationSkill: function (api, j, M) {
    var c = cs(api, j), p = c._p;
    if (!p) return;
    var mult = tier(elationCount(api), p.x) * (p.e >= 4 ? 2 : 1);
    elHit(api, j, { mult: mult, joke: (c.gr || 0) + joke(api), target: 'aoe', note: '渲染理性，解构欢愉', entry: M.entry });
    api.gainEnergy(5, j);
  }
};

function allyTurn(api, actor) {
  if (actor === api.index) return;
  var c = api.custom, p = P(api);
  if (!p) return;
  if ((c.roundGood || 0) < p.t2[1]) { gainGR(api, api.index, p.t2[0]); c.roundGood = (c.roundGood || 0) + p.t2[0]; }
}

export var override = {
  name: '真珠',
  patchKit: function (kit, member) {
    var e = (member && member.eidolon) || 0;
    kit._ovp = {
      e: e, ult: paramsOf(kit, member, '150303'), skill: paramsOf(kit, member, '150302'), ebE: paramsOf(kit, member, '150308'),
      x: paramsOf(kit, member, '150320', 'elation'), t1: traceParams(kit, '洞察万物'), t2: traceParams(kit, '感知容差'),
      t3: traceParams(kit, '艺术壁垒'), e1: eidolonParams(kit, 1), e2: eidolonParams(kit, 2), e6: eidolonParams(kit, 6)
    };
    if (!kit._ovp.t2.length) kit._ovp.t2 = [5, 50];
    ['150303', '150320', '150329'].forEach(function (id) { var s = skillById(kit, id); if (s) { s.hits = []; s.effects = []; } });
    var eb = skillById(kit, '150308');
    if (eb) eb.hits = eb.hits.filter(function (h) { return h.scaling !== 'elation'; });
    dropEffects(kit, function (x, owner) { return owner && (owner.rank === 1 || owner.rank === 2 || owner.name === '洞察万物' || owner.name === '艺术壁垒'); });
    var r6 = (kit.eidolons || []).find(function (r) { return r.rank === 6; });
    if (r6) r6.effects = [{ stat: 'resPen', value: 0.2, target: 'team', trigger: 'passive', key: '1503:e6' }];
    note(kit, '真珠 手写机制（好活当赏/深度学习/美学底本）');
    return kit;
  },
  hooks: composeHooks(commonHooks, {
    onBattleStart: function (api) {
      var c = api.custom;
      var p = c._p = api.member.ch._ovp;
      c.gr = Math.min(50, (c.gr || 0) + 20); c.grT = 0; c.charges = 2; c.roundGood = 0;
      var pol = api.member.policy || {};
      var lord = pol.lordTarget ? api.findMember(String(pol.lordTarget)) : -1;
      if (lord < 0 || lord === api.index) lord = api.findMember('1506');
      if (lord < 0 || lord === api.index) lord = api.ctx.mainC !== api.index ? api.ctx.mainC : (api.index === 0 ? 1 : 0);
      if (lord >= api.ctx.members.length) lord = -1;
      c.lord = lord;
      var n = elationCount(api);
      var def = api.stats().def;
      if (p.t1.length && def >= p.t1[0]) api.addBuff({ key: 'pearl:t1', stat: 'elation', value: p.t1[1] + Math.floor(Math.min(p.t1[4], def - p.t1[0]) / p.t1[2]) * p.t1[3], duration: null, label: '洞察万物' });
      if (p.e >= 1 && n >= 2) api.addBuff({ key: 'pearl:e1', stat: 'elation', value: n >= 4 ? p.e1[2] : n >= 3 ? p.e1[1] : p.e1[0], duration: null, label: '真珠E1' }, 'team');
      if (p.e >= 2) api.addBuff({ key: 'pearl:e2', stat: 'amplification', value: p.e2[0] || 0.15, duration: null, label: '真珠E2·增笑' }, 'team');
    },
    onTurnStart: function (api) { api.custom.roundGood = 0; },
    onAnyTurnStart: function (api) { sh(api)._ats = true; allyTurn(api, api.actor); },
    actions: function (api) {
      var c = api.custom, p = P(api);
      if (c.charges > 0) {
        var lordEl = c.lord >= 0 && isElation(api, c.lord);
        return [{ code: 'A+', run: function (a) {
          var cc = a.custom;
          var sk = a.skill('enhancedBasic');
          var entry = a.cast(sk, { code: 'A+' });
          if (cc.gr > 0 && lordEl) elHit(a, a.index, { mult: p.ebE[4] || 0.15, joke: cc.gr, target: 'single', note: '幻造星月·欢愉', entry: entry });
          if (lordEl) {
            var lg = cs(a, cc.lord).gr || 0;
            elHit(a, cc.lord, { mult: p.ult[1] || 0.6, joke: lg, target: 'single', element: a.member.element, note: '幻造星月·美学底本欢愉（真珠）', entry: entry });
            if (p.e >= 6) elHit(a, cc.lord, { mult: p.e6[1] || 2.4, joke: lg, target: 'single', element: a.member.element, note: '真珠E6·欢愉', entry: entry });
          }
          cc.charges -= 1;
          healTick(a);
        } }];
      }
      var cap = 50;
      return api.defaults.filter(function (d) { return d.slot !== 'skill' || (c.gr || 0) < cap; });
    },
    onAction: function (api) {
      if (api.phase !== 'after') return;
      var c = api.custom, p = P(api), s = api.skill;
      if (!s) return;
      if (s.slot === 'skill') { gainGR(api, api.index, p.skill[0] || 15); healTick(api); }
      if (s.slot === 'ult') {
        gainGR(api, api.index, p.ult[2] || 20);
        c.charges = (c.charges || 0) + (p.ult[0] || 3);
        var n = elationCount(api);
        var adv = tier(Math.min(3, n), [p.ult[3] || 0.1, p.ult[4] || 0.15, p.ult[5] || 0.3]);
        if (c.lord >= 0) {
          api.advance(n >= 4 ? 1 : adv, c.lord);
          if (n >= 4) {
            var times = p.e >= 2 ? 2 : 1;
            gainGR(api, c.lord, (p.ult[7] || 30) * times);
            gainJoke(api, (p.ult[6] || 60) * times);
          }
        }
        if (p.e >= 2) for (var j = 0; j < api.ctx.members.length; j++) if (j !== api.index && j !== c.lord && isElation(api, j)) api.advance(n >= 4 ? 0.3 : adv, j);
      }
    },
    onAnyAction: function (api) {
      var c = api.custom, p = P(api);
      if (!p) return;
      if (!sh(api)._ats && api.skill && api.skill.slot !== 'ult') allyTurn(api, api.actor);
      if (api.actor === c.lord && api.skill && api.skill.slot === 'ult') api.gainEnergy(p.t3[0] || 90);
    }
  })
};