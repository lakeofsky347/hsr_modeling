// 1506 银狼LV.999 —— 隐藏分 / 无敌玩家结界 / 强化普攻 / 头号补给盲盒（移植 v1 engine/sim.js）
// 简化假设：
//  * 隐藏分 = 获得的笑点（全队）+ 进结界 20（行迹）+ 欢愉技 15 / 真结局 +20/+40；上限 240（升格 999）。
//  * 暴击率 +p3/点，暴击率超过 100% 的部分按 p5/点 转暴伤（天赋 150604）。
//  * 终结技：隐藏分 ≥ 60 且不在结界时可放；进入结界、行动提前 100%，仅能强化普攻，3 次后退出并清空隐藏分（E1 保留 20%）。
//  * 强化普攻：持好活当赏时按总倍率 p0（×(1+每 60 隐藏分 15%，最多 2 层)）+ 收尾 p3 结算欢愉伤害，否则按攻击力常规伤害；每次触发 3 次盲盒。
//  * 盲盒：结界内且持好活当赏时，队友每次消耗战技点的动作 + 强化普攻 3 次；按期望（v1 blindboxMode=expected）：倍率 × 当前概率，
//    概率 c → c·c·0.2 + c·(1−c)；不结算真伤/回点/加笑点。【崩坏级伤害演示】重置概率。
//  * 秘技：开场好活当赏 = 99（持续到首次阿哈时刻覆盖，v1 同）。
//  * 持好活当赏时普攻/战技追加 p2 欢愉伤害（天赋）。E6 结界内强化普攻增笑 50%，敌方抗性按数据 resShred 处理。
//  * E2：结界内每 +120 隐藏分行动提前 100% 并恢复 1 次强化普攻。
import { skillById, dropEffects, paramsOf, traceParams, eidolonParams, note, composeHooks } from './_util.js';
import { REG, commonHooks, gainJoke, gainGR, gr, joke, elHit, upgraded, cs } from './_elation.js';

var ID = '1506';

function P(api) { return api.custom._p; }
function cap(api, j) { return upgraded(api) ? 999 : 240; }

function gainHidden(api, j, n) {
  var c = cs(api, j);
  var p = c._p;
  c.hidden = Math.min(cap(api, j), (c.hidden || 0) + n);
  if (c.stance && p && p.e >= 2) {
    c.e2acc = (c.e2acc || 0) + n;
    while (c.e2acc >= 120) { c.e2acc -= 120; c.left += 1; api.advance(1, j); }
  }
}

// 隐藏分 → 暴击率/暴伤（按不含本 buff 的暴击率计算溢出）
function refresh(api, j) {
  var c = cs(api, j);
  var p = c._p;
  if (!p) return;
  var h = c.hidden || 0;
  var cur = api.stats(j);
  var own = api.getBuff('sw999:hidden', j);
  var baseCr = cur.critRate - (own ? own.value : 0);
  var crGain = h * p.crPer;
  var over = Math.max(0, baseCr + crGain - 1);
  var crEff = crGain - over;
  var cdGain = (p.crPer > 0 ? over / p.crPer : 0) * p.cdPer;
  api.addBuff({ key: 'sw999:hidden', stat: 'critRate', value: crEff, duration: null, label: '隐藏分·暴击率' }, j);
  api.addBuff({ key: 'sw999:hiddenCd', stat: 'critDmg', value: cdGain + (upgraded(api) ? p.innateCd : 0), duration: null, label: '隐藏分溢出·暴伤 / 全息幻象' }, j);
  api.setEnergy(Math.min(api.ctx.members[j].energyMax, h), j);
}

function blindbox(api, j, entry, why) {
  var c = cs(api, j), p = c._p;
  if (!c.stance || !(c.gr > 0) || !p) return 0;
  var ch = c.bb == null ? 1 : c.bb;
  var d = elHit(api, j, { mult: p.bbMult * ch, joke: c.gr, target: 'single', note: '头号补给盲盒(期望 ' + Math.round(ch * 100) + '%)' + (why ? '·' + why : ''), entry: entry });
  c.bb = ch * ch * 0.2 + ch * (1 - ch);
  return d;
}

function exitStance(api) {
  var c = api.custom, p = P(api);
  c.stance = false;
  c.hidden = Math.round((c.hidden || 0) * (p.e >= 1 ? 0.2 : 0));
  if (p.e >= 1) api.removeBuff('sw999:e1', 'enemy');
  refresh(api, api.index);
}

REG[ID] = {
  onJoke: function (api, j, n) { gainHidden(api, j, n); },
  refresh: refresh,
  elationSkill: function (api, j, M) {
    var c = cs(api, j), p = c._p;
    if (!p) return;
    var jk = (c.gr || 0) + joke(api);
    if (!c.stance) {
      gainHidden(api, j, p.replayHidden);
      M.entry.note = (M.entry.note ? M.entry.note + '；' : '') + '银狼·殿堂级操作回放 +' + p.replayHidden + ' 隐藏分';
    } else {
      var jj = p.e >= 4 ? jk * 5 : jk;
      elHit(api, j, { mult: p.demoMult, count: p.demoHits, target: 'single', joke: jj, note: '崩坏级伤害演示 ×' + p.demoHits, entry: M.entry });
      c.bb = 1;
    }
    if (jk >= p.a4[1]) gainHidden(api, j, p.a4[2] + p.a4[3]);
    else if (jk >= p.a4[0]) gainHidden(api, j, p.a4[2]);
    refresh(api, j);
  }
};

export var override = {
  name: '银狼LV.999',
  patchKit: function (kit, member) {
    var e = (member && member.eidolon) || 0;
    var ult = paramsOf(kit, member, '150603'), tal = paramsOf(kit, member, '150604'), eb = paramsOf(kit, member, '150608');
    var d1 = paramsOf(kit, member, '150621', 'elation'), inn = paramsOf(kit, member, '150629');
    var a2 = traceParams(kit, '假结局速通攻略'), a4 = traceParams(kit, '真结局解锁条件'), a6 = traceParams(kit, '隐藏关卡全成就');
    kit._ovp = {
      e: e, thresh: tal[0] || 60, crPer: tal[3] || 0.005, cdPer: tal[5] || 0.01, append: tal[2] || 0.5,
      bbMult: ult[2] || 1.125, ebTotal: eb[0] || 3.36, ebFin: eb[3] || 1.4, ebPer60: eb[7] || 0.15, ebStacks: eb[6] || 2, ebLeft: eb[4] || 3,
      demoMult: d1[0] || 1.125, demoHits: d1[1] || 6, replayHidden: (paramsOf(kit, member, '150620', 'elation')[0]) || 15,
      innateCd: inn[1] || 0.4, a2: a2.length ? a2 : [160, 0.5, 1, 0.02, 100], a4: a4.length ? a4 : [20, 40, 20, 20], a6: a6[0] || 20,
      e1: eidolonParams(kit, 1), e6: eidolonParams(kit, 6)
    };
    // 自动解析的错误效果/段：终结技（盲盒段、回点）、天赋（按满值常驻暴击）、强化普攻（改为手动）、行迹条件欢愉度、E1 易伤常驻、E6 增笑
    ['150603', '150604', '150608', '150621', '150629'].forEach(function (id) { var s = skillById(kit, id); if (s) { s.effects = s.effects.filter(function (x) { return x.stat === 'actionAdvance'; }); if (id !== '150608') s.hits = []; } });
    var eb0 = skillById(kit, '150608');
    if (eb0) eb0.hits = [];
    dropEffects(kit, function (x, owner) { return owner && (owner.rank === 1 || (owner.rank === 6 && x.stat === 'amplification') || owner.name === '假结局速通攻略'); });
    note(kit, '银狼LV.999 手写机制（隐藏分/结界/盲盒）');
    return kit;
  },
  hooks: composeHooks(commonHooks, {
    onBattleStart: function (api) {
      var c = api.custom;
      c._p = api.member.ch._ovp;
      c.hidden = 0; c.stance = false; c.left = 0; c.bb = 1;
      c.gr = 99; c.grT = 0;              // 秘技：固定计入 99 点好活当赏（持续到首次阿哈时刻）
      var p = c._p, spd = api.stats().spd;
      if (spd >= p.a2[0]) api.addBuff({ key: 'sw999:a2', stat: 'elation', value: p.a2[1] + Math.min(p.a2[4], spd - p.a2[0]) * p.a2[3], duration: null, label: '假结局速通攻略' });
      refresh(api, api.index);
    },
    ultReady: function (api) {
      var c = api.custom;
      return !c.stance && (c.hidden || 0) >= (c._p ? c._p.thresh : 60);
    },
    actions: function (api) {
      var c = api.custom, p = P(api);
      if (c.stance) {
        return [{ code: 'A+', run: function (a) {
          var cc = a.custom;
          var entry = a.cast('enhancedBasic', { code: 'A+', noHits: true, noSP: true });
          var stacks = Math.min(p.ebStacks, Math.floor((cc.hidden || 0) / 60));
          var fm = 1 + stacks * p.ebPer60;
          var amp = p.e >= 6 ? (p.e6[1] || 0.5) : 0;
          if (cc.gr > 0) {
            elHit(a, a.index, { mult: p.ebTotal, joke: cc.gr, target: 'single', finalMultiplier: fm, amplification: amp, note: '狼尊时刻（×' + fm.toFixed(2) + '）', entry: entry });
            elHit(a, a.index, { mult: p.ebFin, joke: cc.gr, target: 'single', amplification: amp, note: '狼尊时刻·收尾', entry: entry });
          } else {
            a.deal({ scaling: 'atk', mult: p.ebTotal * fm, target: 'single', dmgType: 'basic' }, '狼尊时刻（无好活当赏）', entry);
            a.deal({ scaling: 'atk', mult: p.ebFin, target: 'single', dmgType: 'basic' }, '狼尊时刻·收尾', entry);
          }
          for (var k = 0; k < 3; k++) blindbox(a, a.index, entry, '弹射间隙');
          cc.left -= 1;
          if (cc.left <= 0) exitStance(a);
        } }];
      }
      return undefined;
    },
    onAction: function (api) {
      if (api.phase !== 'after') return;
      var c = api.custom, p = P(api), s = api.skill;
      if (!s) return;
      if (s.slot === 'basic' || s.slot === 'skill') {
        if (c.gr > 0) elHit(api, api.index, { mult: p.append, joke: c.gr, target: 'single', note: '天赋·顺势追击', entry: api.entry });
        if (s.slot === 'skill') gainJoke(api, 5);
      } else if (s.slot === 'ult') {
        c.stance = true; c.left = p.ebLeft; c.bb = 1; c.e2acc = c.hidden || 0;
        gainHidden(api, api.index, p.a6);
        if (p.e >= 1) api.addBuff({ key: 'sw999:e1', stat: 'vuln', value: p.e1[0] || 0.2, duration: null, label: '以太编辑·结界易伤' }, 'enemy');
        if (p.e >= 2 && c.grT > 0) c.grT += 1;
        refresh(api, api.index);
      }
    },
    onAnyAction: function (api) {
      if (api.actor === api.index) return;
      var s = api.skill;
      if (s && (s.spCost || 0) > 0) blindbox(api, api.index, null, api.ctx.members[api.actor].name + ' 消耗战技点');
    }
  })
};