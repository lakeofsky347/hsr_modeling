// engine2/search.js —— 自动排轴（beam search）
// 决策点：每个角色回合（可选动作 × 是否插入 ultMode=auto 角色的终结技）。
// 评估 = 已造成伤害 + 启发式（剩余战技点价值 + 各角色能量进度 × 终结技估计伤害）。
// 另外把「纯战技优先」「纯普攻」两条基线轨迹与 beam 结果比较取最大，保证不劣于基线。
import { buildContext, initialState, startBattle, advance, applyDecision, cloneState, buildResult, ultProgress } from './sim.js';

// 资源（战技点、终结技进度）只在剩余时间内有价值：最后一轮内按剩余 AV 线性衰减到 0，
// 否则 beam 会在战斗末段偏好“攒点/攒能量”的状态（这些资源在战斗结束时不产生伤害）。
function resourceWeight(st, ctx) {
  var left = ctx.totalAV - (st.av || 0);
  var span = Math.max(1, ctx.battle.avPerCycle || 100);
  return Math.max(0, Math.min(1, left / span));
}
function heuristic(st, ctx) {
  if (st.done) return st.dmg;
  var w = resourceWeight(st, ctx);
  var h = st.dmg + st.sp * ctx.spValue * w;
  for (var i = 0; i < ctx.members.length; i++) {
    var m = ctx.members[i];
    h += ultProgress(st, ctx, i) * m.est.ult * 0.8 * w;
  }
  return h;
}

function listSig(list) {
  var s = '';
  for (var i = 0; i < list.length; i++) {
    var b = list[i];
    s += (b.key || '') + '=' + (b.stacks || 1) + '/' + (b.remaining == null ? 'p' : b.remaining) + '/' + Math.round((b.value || 0) * 1000) + ';';
  }
  return s;
}
function signature(st) {
  var s = Math.round(st.dmg) + '|' + st.sp + '|' + Math.round(st.enemy.toughness) + '|' + (st.enemy.broken ? 1 : 0) + '|' + Math.round(st.enemy.nextAv * 10);
  s += '|D' + listSig(st.enemy.debuffs || []);
  if (st.enemy.dots && st.enemy.dots.length) {
    for (var d = 0; d < st.enemy.dots.length; d++) s += '|O' + st.enemy.dots[d].key + ':' + st.enemy.dots[d].remaining;
  }
  for (var i = 0; i < st.units.length; i++) {
    var u = st.units[i];
    s += '|' + Math.round(u.nextAv * 10) + ',' + Math.round(u.energy) + ',' + listSig(u.buffs) + ',' + (u.ultTurns || 0);
  }
  // override 自定义状态参与去重（避免把资源不同的状态误判为相同）
  if (st.custom) for (var k in st.custom) { var c = st.custom[k]; if (c && !isEmptyObj(c)) s += '|' + k + ':' + JSON.stringify(c); }
  if (st.shared && !isEmptyObj(st.shared)) s += '|S' + JSON.stringify(st.shared);
  if (st.auras && st.auras.length) s += '|A' + st.auras.length;
  if (st.timers && st.timers.length) for (var t = 0; t < st.timers.length; t++) s += '|T' + Math.round(st.timers[t].nextAv * 10);
  return s;
}

function isEmptyObj(o) { for (var k in o) return false; return true; }

// 贪心/固定策略跑一遍（每个决策点取第一个选项）
export function runGreedy(ctx) {
  var st = advance(startBattle(initialState(ctx), ctx), ctx);
  var guard = 0;
  while (!st.done && guard++ < 5000) {
    applyDecision(st, ctx, st.pending.options[0]);
    advance(st, ctx);
  }
  return st;
}

export function beamSearch(ctx, beamWidth) {
  var W = Math.max(1, beamWidth || 24);
  var start = advance(startBattle(initialState(ctx), ctx), ctx);
  var frontier = [start];
  var finished = [];
  var steps = 0, expanded = 0;
  while (frontier.length && steps++ < 2000) {
    var next = [];
    var seen = {};
    for (var f = 0; f < frontier.length; f++) {
      var s = frontier[f];
      if (s.done) { finished.push(s); continue; }
      var opts = s.pending.options;
      for (var k = 0; k < opts.length; k++) {
        var c = k === opts.length - 1 ? s : cloneState(s); // 最后一个分支复用原状态，少一次拷贝
        applyDecision(c, ctx, opts[k]);
        advance(c, ctx);
        expanded++;
        if (c.done) { finished.push(c); continue; }
        var sig = signature(c);
        if (seen[sig]) continue;
        seen[sig] = 1;
        c._h = heuristic(c, ctx);
        next.push(c);
      }
    }
    next.sort(function (a, b) { return b._h - a._h; });
    frontier = next.slice(0, W);
  }
  finished.sort(function (a, b) { return b.dmg - a.dmg; });
  return { best: finished[0] || start, expanded: expanded, finishedCount: finished.length };
}

function needsSearch(ctx) {
  return ctx.members.some(function (m) { return m.policy.mode === 'auto' || m.policy.ultMode === 'auto' || !!m.hooks.actions; });
}

// 基线：把 auto 成员替换为指定策略（ult 一律 asap）
function baselineCtx(ctx, mode) {
  var c = Object.assign({}, ctx);
  c.members = ctx.members.map(function (m) {
    if (m.policy.mode !== 'auto' && m.policy.ultMode !== 'auto') return m;
    return Object.assign({}, m, { policy: Object.assign({}, m.policy, { mode: m.policy.mode === 'auto' ? mode : m.policy.mode, ultMode: 'asap' }) });
  });
  return c;
}

export function simulateWith(data, config, overrides) {
  var t0 = Date.now();
  var ctx = buildContext(data, config, overrides);
  var extra = [];
  var best, info = {};
  if (needsSearch(ctx)) {
    var r = beamSearch(ctx, (config.options || {}).beamWidth);
    best = r.best; info.expanded = r.expanded;
    info.strategy = 'beam';
    // ultMode=auto 时，beam 的终结技决策只发生在角色回合；再以「终结技 asap」跑一遍 beam 取较优
    if (ctx.members.some(function (m) { return m.policy.ultMode === 'auto'; })) {
      var ac = Object.assign({}, ctx);
      ac.members = ctx.members.map(function (m) { return Object.assign({}, m, { policy: Object.assign({}, m.policy, { ultMode: 'asap' }) }); });
      var r2 = beamSearch(ac, (config.options || {}).beamWidth);
      info.expanded += r2.expanded;
      info.beam_ultAsap = Math.round(r2.best.dmg);
      if (r2.best.dmg > best.dmg + 1e-6) { best = r2.best; info.strategy = 'beam(ult asap)'; }
    }
    ['skillFirst', 'basicOnly'].forEach(function (mode) {
      var bc = baselineCtx(ctx, mode);
      var s = runGreedy(bc);
      info['baseline_' + mode] = Math.round(s.dmg);
      if (s.dmg > best.dmg + 1e-6) { best = s; info.strategy = 'baseline:' + mode; }
    });
  } else {
    best = runGreedy(ctx);
    info.strategy = 'fixed';
  }
  var res = buildResult(best, ctx, extra);
  info.ms = Date.now() - t0;
  res.search = info;
  return res;
}
