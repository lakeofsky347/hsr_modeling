// 1511 星神★阿哈 —— 愿力（8 点开大）/「欢愉」令使 / 欢愉万相（命途升格）/ 阿哈时刻真伤（移植 v1 engine/sim.js）
// 简化假设：
//  * 愿力：普攻/战技/欢愉技 +1；令使回合开始 +1（无 onAnyTurnStart 时按令使行动后近似）；笑点首次 ≥40 +1 并全队暴伤 +24% 3 回合（v1：整场 1 次）；
//    受治疗 +1（真珠治疗触发，每次终结技后重置）；E1 开场 4 点。终结技需 8 点，施放后清零。
//  * 令使目标 = policy.lordTarget → 1506 → 主 C；首次战技指定，欢愉度 +p0（整场）。无令使时优先战技。
//  * 战技：全体 p1 欢愉（好活当赏）+ 令使额外 20% 欢愉（按令使好活当赏）+ 回 1 战技点（行迹）。普攻：p0 单体欢愉。
//  * 终结技：全体 p1 + 5 × p3 随机单体欢愉；【欢愉万相】3 回合（阿哈回合开始 −1）→ 命途升格；期间自身无视防御 30%（E2 60%）。
//  * 欢愉技（阿哈时刻）：全体 p0 欢愉，笑点 = 好活当赏 + 当前笑点（E4 + 队友好活当赏之和）；再按本次阿哈时刻已造成伤害 × 20%（E4 25%）造成真伤。
//  * 秘技：开场笑点 +20（v1 同）。行迹「盒中蕴藏的世界」：速度 ≥125/150 欢愉度 +120%/150%（按 4.6.51 数据；v1 为 20%/50%）。
//  * E1 全队增笑 15%；E6 每次终结技阿哈时刻行动提前 20%，首次终结技 +40 笑点并立即触发阿哈时刻。欢愉负债未建模。
import { skillById, dropEffects, paramsOf, traceParams, eidolonParams, note, composeHooks } from './_util.js';
import { REG, commonHooks, gainJoke, joke, elHit, elTrue, cs, sh, advanceAha, runMoment } from './_elation.js';

var ID = '1511';
function P(api) { return api.custom._p; }

function setFervor(api, j, v) {
  var c = cs(api, j);
  c.fervor = Math.max(0, Math.min(8, v));
  api.setEnergy(c.fervor, j);
}
function addFervor(api, j, n) { setFervor(api, j, (cs(api, j).fervor || 0) + n); }

function lordOf(api) {
  var pol = api.member.policy || {};
  var l = pol.lordTarget ? api.findMember(String(pol.lordTarget)) : -1;
  if (l < 0) l = api.findMember('1506');
  if (l < 0) l = api.ctx.mainC;
  return l;
}
function checkJoke40(api, j) {
  var c = cs(api, j), p = c._p;
  if (!p || c.j40) return;
  if (joke(api) >= (p.tal[1] || 40)) {
    c.j40 = true;
    addFervor(api, j, 1);
    api.addBuff({ key: 'aha:cd24', stat: 'critDmg', value: p.tal[8] || 0.24, duration: p.tal[9] || 3, label: '与祂共演·暴伤' }, 'team');
  }
}

REG[ID] = {
  refresh: function (api, j) {
    var c = cs(api, j), p = c._p;
    if (!p) return;
    checkJoke40(api, j);
    var up = (sh(api).upg || 0) > 0;
    api.addBuff({ key: 'aha:inn', stat: 'defIgnore', value: up ? (p.e >= 2 ? 0.6 : (p.inn[0] || 0.1) * 3) : 0, duration: null, label: '无中生有·无视防御' }, j);
  },
  elationSkill: function (api, j, M) {
    var c = cs(api, j), p = c._p;
    if (!p) return;
    var jk = (api.ctx.opts && api.ctx.opts.goodRewardOnElationSkill ? (c.gr || 0) : 0) + joke(api);
    if (p.e >= 4) for (var k = 0; k < api.ctx.members.length; k++) if (k !== j) jk += cs(api, k).gr || 0;
    elHit(api, j, { mult: p.x[0], joke: jk, target: 'aoe', note: '满月，是神在的时间', entry: M.entry });
    var ratio = (p.x[1] || 0.2) * (p.e >= 4 ? 1.25 : 1);
    var base = api.state.dmg - M.start;          // 本次阿哈时刻至此的伤害总和（含阿哈本段）
    if (base > 0) elTrue(api, j, ratio, base, '满月·真实伤害（参照 ' + Math.round(base) + '）', M.entry);
    addFervor(api, j, 1);
  }
};

export var override = {
  name: '星神★阿哈',
  patchKit: function (kit, member) {
    var e = (member && member.eidolon) || 0;
    kit._ovp = {
      e: e, basic: paramsOf(kit, member, '151101'), skill: paramsOf(kit, member, '151102'), ult: paramsOf(kit, member, '151103'),
      tal: paramsOf(kit, member, '151104'), x: paramsOf(kit, member, '151120', 'elation'), inn: paramsOf(kit, member, '151129'),
      t1: traceParams(kit, '愚弄众神的玩笑'), t3: traceParams(kit, '盒中蕴藏的世界'), e1: eidolonParams(kit, 1), e6: eidolonParams(kit, 6)
    };
    ['151101', '151102', '151103', '151104', '151120', '151129', '151131'].forEach(function (id) { var s = skillById(kit, id); if (s) { s.hits = []; s.effects = []; } });
    dropEffects(kit, function (x, owner) { return owner && (owner.rank === 1 || owner.rank === 6 || owner.name === '盒中蕴藏的世界'); });
    note(kit, '星神★阿哈 手写机制（愿力/令使/欢愉万相/阿哈时刻真伤）');
    return kit;
  },
  hooks: composeHooks(commonHooks, {
    onBattleStart: function (api) {
      var c = api.custom;
      var p = c._p = api.member.ch._ovp;
      c.lord = -1; c.j40 = false; c._healUsed = false; c.e6first = false;
      setFervor(api, api.index, p.e >= 1 ? (p.e1[0] || 4) : 0);
      gainJoke(api, (p.x && 20) || 20);          // 秘技：固定计入 20 笑点的额外回合 → 按 +20 笑点（v1 同）
      var spd = api.stats().spd, t3 = p.t3.length ? p.t3 : [125, 150, 1.2, 1.5];
      var ed = spd >= t3[1] ? t3[3] : spd >= t3[0] ? t3[2] : 0;
      if (ed) api.addBuff({ key: 'aha:t3', stat: 'elation', value: ed, duration: null, label: '盒中蕴藏的世界' });
      if (p.e >= 1) api.addBuff({ key: 'aha:e1', stat: 'amplification', value: p.e1[1] || 0.15, duration: null, label: '阿哈E1·增笑' }, 'team');
    },
    onTurnStart: function (api) {
      var s = sh(api);
      if (s.upg > 0) s.upg -= 1;
      api.custom._healUsed = false;
      REG[ID].refresh(api, api.index);
    },
    onAnyTurnStart: function (api) {
      sh(api)._ats = true;
      if (api.actor === api.custom.lord && api.actor !== api.index) addFervor(api, api.index, 1);
    },
    ultReady: function (api) { return (api.custom.fervor || 0) >= 8; },
    actions: function (api) {
      var c = api.custom;
      if (c.lord < 0 && api.sp() >= 1) return [{ code: 'E', slot: 'skill' }];
      return undefined;
    },
    onAction: function (api) {
      if (api.phase !== 'after') return;
      var c = api.custom, p = P(api), s = api.skill;
      if (!s) return;
      if (s.slot === 'basic') {
        elHit(api, api.index, { mult: p.basic[0] || 0.5, joke: c.gr || 0, target: 'single', note: '点星，开幕！', entry: api.entry });
        addFervor(api, api.index, 1);
      } else if (s.slot === 'skill') {
        if (c.lord < 0) {
          c.lord = lordOf(api);
          if (c.lord >= 0) api.addBuff({ key: 'aha:lord', stat: 'elation', value: p.skill[0] || 0.2, duration: null, label: '「欢愉」令使' }, c.lord);
        }
        elHit(api, api.index, { mult: p.skill[1] || 0.5, joke: c.gr || 0, target: 'aoe', note: '此乃令使，阿哈认证™', entry: api.entry });
        if (c.lord >= 0) elHit(api, api.index, { mult: (p.t1[0] || 0.2), joke: cs(api, c.lord).gr || 0, target: 'single', element: api.ctx.members[c.lord].element, note: '令使联动', entry: api.entry });
        api.gainSP(p.t1[2] || 1);
        addFervor(api, api.index, 1);
      } else if (s.slot === 'ult') {
        elHit(api, api.index, { mult: p.ult[1] || 2, joke: c.gr || 0, target: 'aoe', note: '啊哈！宇宙笑点大爆炸', entry: api.entry });
        elHit(api, api.index, { mult: p.ult[3] || 0.6, count: p.ult[2] || 5, joke: c.gr || 0, target: 'single', note: '宇宙笑点大爆炸·弹射', entry: api.entry });
        setFervor(api, api.index, 0);
        sh(api).upg = p.ult[5] || 3;
        c._healUsed = false;
        if (p.e >= 6) {
          advanceAha(api, p.e6[0] || 0.2);
          if (!c.e6first) { c.e6first = true; gainJoke(api, p.e6[1] || 40); runMoment(api); }
        }
        REG[ID].refresh(api, api.index);
        for (var j = 0; j < api.ctx.members.length; j++) { var r = REG[api.ctx.members[j].charId]; if (r && r.refresh) r.refresh(api, j); }
      }
    },
    onAnyAction: function (api) {
      var c = api.custom;
      if (!sh(api)._ats && api.actor === c.lord && api.actor !== api.index && api.skill && api.skill.slot !== 'ult') addFervor(api, api.index, 1);
      checkJoke40(api, api.index);
    }
  })
};