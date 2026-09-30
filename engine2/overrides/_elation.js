// engine2/overrides/_elation.js —— 「欢愉」命途共用机制（移植自 v1 engine/sim.js）
// 资源：
//   shared.joke        笑点（全队共享；阿哈时刻结束清空）          shared.jokeTotal 累计获得笑点
//   custom.gr / grT    好活当赏（每角色：计入笑点值 / 剩余回合；grT=0 表示不过期，真珠无限）
//   shared.upg         「欢愉」命途升格剩余回合（阿哈【欢愉万相】）
//   shared.aha         阿哈时刻：{ spd, next, leader, n }
// 阿哈时刻：独立行动单位，速度 = 基础速度（有星神★阿哈时 = 阿哈面板速度，否则 80）+ 队伍速度降序 /5 /10 /20 /40（v1 同式）。
//   到点时：每名欢愉角色依次施放欢愉技（REG[charId].elationSkill）；之后全员获得【好活当赏】= 本次计入笑点（持续 2 回合）；清空笑点。
//   引擎若提供 api.addTimer / hooks.onTimer 则用之；否则在领队（队内第一名欢愉角色）的 onTurnStart / onAnyAction / onEnemyTurn 中补跑到点的阿哈时刻。
// 欢愉伤害：hit.joke = 计入笑点（普攻/战技追加段 = 自身好活当赏；欢愉技 = 好活当赏 + 当前笑点，v1 goodRewardOnElationSkill）。
import { jokeRegion } from '../formula.js';

export var REG = {};   // charId → { elationSkill(api, j, M), onJoke(api, j, n), refresh(api, j), afterMoment(api, j, M) }

export function cidOf(api, j) { return api.ctx.members[j].charId; }
export function cs(api, j) {
  if (j == null || j === api.index) return api.custom;
  var c = cidOf(api, j);
  var root = api.state.custom;
  if (!root[c]) root[c] = {};
  return root[c];
}
export function sh(api) { return api.shared || (api.state.shared = api.state.shared || {}); }
function pathOf(api, j) {
  var m = api.ctx.members[j];
  var ch = m.ch || (api.ctx.data && api.ctx.data.characters[m.charId]) || {};
  return ch.path;
}
export function isElation(api, j) { return pathOf(api, j) === 'Elation'; }
export function elationMembers(api) {
  var out = [];
  for (var j = 0; j < api.ctx.members.length; j++) if (isElation(api, j)) out.push(j);
  return out;
}
export function elationCount(api) { return Math.max(1, elationMembers(api).length); }
export function upgraded(api) { return (sh(api).upg || 0) > 0; }

// ---- 笑点 ----
export function gainJoke(api, n) {
  if (!(n > 0)) return;
  var s = sh(api);
  s.joke = (s.joke || 0) + n;
  s.jokeTotal = (s.jokeTotal || 0) + n;
  for (var j = 0; j < api.ctx.members.length; j++) {
    var r = REG[cidOf(api, j)];
    if (r && r.onJoke) r.onJoke(api, j, n);
  }
  refreshAll(api);
}
export function clearJoke(api) { sh(api).joke = 0; refreshAll(api); }
export function joke(api) { return sh(api).joke || 0; }
export function refreshAll(api) {
  for (var j = 0; j < api.ctx.members.length; j++) {
    var r = REG[cidOf(api, j)];
    if (r && r.refresh) r.refresh(api, j);
  }
}

// ---- 好活当赏 ----
export function grCap(api, j) {
  var c = cidOf(api, j);
  if (c === '1503') return upgraded(api) ? 75 : 50;
  return 9999;
}
export function gainGR(api, j, n) {
  if (!(n > 0)) return;
  var c = cs(api, j);
  c.gr = Math.min(grCap(api, j), (c.gr || 0) + n);
  if (cidOf(api, j) !== '1503') c.grT = 2;
}
export function gr(api, j) { return cs(api, j).gr || 0; }
// 自身回合开始：好活当赏持续回合 −1（v1 tickTurnStart 规则）
export function tickGR(api) {
  var c = api.custom;
  if (c.grT > 0) { c.grT -= 1; if (c.grT <= 0 && api.member.charId !== '1503') c.gr = 0; }
}

// ---- 伤害 ----
export function elHit(api, j, o) {
  var m = api.ctx.members[j];
  var hit = { scaling: 'elation', mult: o.mult, count: o.count || 1, target: o.target || 'single', element: o.element || m.element,
    dmgType: 'elation', joke: Math.max(0, o.joke || 0) };
  if (o.finalMultiplier != null) hit.finalMultiplier = o.finalMultiplier;
  if (o.amplification) hit.amplification = o.amplification;
  if (!(api.features && api.features.hitJoke)) {
    var def = sh(api).joke != null ? sh(api).joke : Number(api.ctx.opts.teamJoke != null ? api.ctx.opts.teamJoke : 10);
    hit.mult = hit.mult * jokeRegion(hit.joke) / jokeRegion(def || 0) * (o.finalMultiplier != null ? o.finalMultiplier : 1);
  }
  var _d = j === api.index ? api.deal(hit, o.note, o.entry) : api.dealAs(j, hit, o.note, o.entry);
  return _d;
}
// 固定参照值的真实伤害（hit.ref）
export function elTrue(api, j, ratio, ref, note, entry) {
  var hit = { scaling: 'true', mult: ratio, ref: ref, target: 'single', dmgType: 'true' };
  return j === api.index ? api.deal(hit, note, entry) : api.dealAs(j, hit, note, entry);
}
export function normalHitAs(api, j, hit, note, entry) {
  return j === api.index ? api.deal(hit, note, entry) : api.dealAs(j, hit, note, entry);
}

// ---- 阿哈时刻 ----
export function ahaSpeed(api) {
  var aha = api.findMember ? api.findMember('1511') : -1;
  var base = aha >= 0 ? api.stats(aha).spd : 80;
  var sp = [];
  for (var j = 0; j < api.ctx.members.length; j++) sp.push(api.stats(j).spd);
  sp.sort(function (a, b) { return b - a; });
  var div = [5, 10, 20, 40];
  for (var k = 0; k < sp.length && k < 4; k++) base += sp[k] / div[k];
  return base;
}
export function initAha(api) {
  var s = sh(api);
  if (s.aha) return;
  var spd = ahaSpeed(api);
  s.aha = { spd: spd, next: api.av() + 10000 / spd, leader: api.index, n: 0, timer: false };
  if (typeof api.addTimer === 'function') {
    api.addTimer({ id: 'ahaMoment', spd: spd, name: '阿哈时刻' });
    s.aha.timer = true;
  }
}
// 阿哈时刻行动提前（阿哈 E6）
export function advanceAha(api, pct) {
  var s = sh(api);
  if (!s.aha) return;
  if (s.aha.timer && typeof api.advanceTimer === 'function') { api.advanceTimer('ahaMoment', pct); return; }
  var rem = s.aha.next - api.av();
  if (rem > 0) s.aha.next = api.av() + rem * (1 - Math.min(1, pct));
}
export function tickAha(api) {
  var s = sh(api);
  if (!s.aha || s.aha.timer || s.aha.leader !== api.index) return;
  var guard = 0;
  while (s.aha.next <= api.av() + 1e-9 && guard++ < 20) {
    runMoment(api);
    s.aha.next += 10000 / s.aha.spd;
  }
}
export function runMoment(api) {
  var s = sh(api);
  var entry = { action: 'AHA', skillName: '阿哈时刻', damage: 0, hits: [], note: '' };
  var counted = s.joke || 0;
  var M = { entry: entry, counted: counted, dmg: 0, start: api.state.dmg };
  var mem = elationMembers(api);
  var before = api.state.dmg;
  mem.forEach(function (j) {
    var r = REG[cidOf(api, j)];
    if (r && r.elationSkill) r.elationSkill(api, j, M);
    M.dmg = api.state.dmg - before;
  });
  mem.forEach(function (j) { gainGR(api, j, counted); });
  mem.forEach(function (j) { var r = REG[cidOf(api, j)]; if (r && r.afterMoment) r.afterMoment(api, j, M); });
  s.aha.n = (s.aha.n || 0) + 1;
  entry.note = (entry.note ? entry.note + '；' : '') + '计入笑点 ' + Math.round(counted * 10) / 10 + ' → 欢愉角色好活当赏；清空笑点';
  s.joke = 0;
  refreshAll(api);
  if (!entry.damage) entry.damage = Math.round((api.state.dmg - before) * 10) / 10;
  api.log(entry);
}

// 每名欢愉角色 override 都挂上的共用 hooks
export var commonHooks = {
  onBattleStart: function (api) { initAha(api); refreshAll(api); },
  onTurnStart: function (api) { tickAha(api); tickGR(api); },
  onAnyAction: function (api) { tickAha(api); },
  onEnemyTurn: function (api) { tickAha(api); },
  onTimer: function (api) {
    var t = api.timer || {};
    if (t.id === 'ahaMoment' && sh(api).aha && sh(api).aha.leader === api.index) runMoment(api);
  }
};