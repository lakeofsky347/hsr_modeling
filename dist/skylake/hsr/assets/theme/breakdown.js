/* breakdown.js — v3.2 伤害拆解：命中乘区瀑布图弹层 + 汇总区两张占比环图（按角色 / 按技能） + 总伤数字滚动。
   数据只读 sim:result 的 detail（经 gui.js），不从页面 DOM 抠数字。依赖 gui.js；纯 SVG / HTML，无第三方库。
   约定见 ../ww/COMPONENTS.md「v3.2 交互组件」。 */
(function () {
  'use strict';
  var G = window.__gui; if (!G || window.__gbd) return;
  var D = document, esc = G.esc, fmt = G.fmt, num = G.num;

  /* ================= 数据归一 ================= */
  function arr(v) { return Array.isArray(v) ? v : null; }
  /* 引擎的 members 不一定带头像 / 属性：从页面已渲染的 .gava（引擎输出的那份）或 __SIM_DATA__.characters 里按名字 / id 补 */
  function pageChar(name, id) {
    var out = {};
    if (name) {
      var g = Array.prototype.filter.call(D.querySelectorAll('.gava[data-name][data-icon]'), function (x) { return x.getAttribute('data-name') === name && !x.closest('.gbd-donuts,.gbd-pop,.gpre,.gplans'); })[0];
      if (g) { out.avatar = g.getAttribute('data-icon'); out.el = g.getAttribute('data-el') || ''; }
    }
    if (!out.avatar) {
      var C = ((window.__SIM_DATA__ || {}).characters) || [];
      var c = arr(C) && C.filter(function (x) { return x && ((id != null && String(x.id) === String(id)) || (name && x.name === name)); })[0];
      if (c) { out.avatar = c.avatar || null; out.el = out.el || c.element || c.el || ''; }
    }
    return out;
  }
  function memberList(d) {
    var bd = d.breakdown || {}, sm = d.summary || {};
    var base = arr(d.members) || [];
    var withDmg = base.length && base.some(function (m) { return m && num(m.damage) != null; }) ? base
      : arr(bd.byMember) || arr(sm.byMember) || arr(d.share && d.share.byMember) || [];
    return withDmg.map(function (m, i) {
      var j = m.member != null ? m.member : i, ex = base[j] || base[i] || {};
      var nm = m.name || ex.name || ('#' + (i + 1)), id = m.id != null ? m.id : ex.id, pc = (m.avatar || ex.avatar) && (m.el || ex.el) ? {} : pageChar(nm, id);
      return { idx: j, id: id, name: nm, el: m.el || m.element || ex.el || ex.element || pc.el || '',
        avatar: m.avatar || ex.avatar || pc.avatar || null, damage: num(m.damage) || 0 };
    });
  }
  function rowsOf(d) { var bd = d.breakdown || {}; return arr(bd.rows) || arr(bd.hits) || []; }
  function skillList(d, members) {
    var bd = d.breakdown || {}, src = arr(bd.bySkill) || arr(bd.skills), out = [], map = {};
    if (src) return src.map(function (s) {
      var m = members.filter(function (x) { return x.idx === s.member || (x.id != null && String(x.id) === String(s.member)) || x.name === s.memberName || (s.skillName && x.name === s.name); })[0];
      var nm = s.skillName || s.skill || (s.skillName == null ? s.name : null) || s.action || '?';
      return { name: nm, who: (m && m.name) || s.memberName || (s.skillName ? s.name : '') || '', el: s.el || (m && m.el) || '', damage: num(s.damage) || 0 };
    });
    rowsOf(d).forEach(function (r) {
      var nm = (typeof r.action === 'string' && r.action) || r.skillName || r.skill || r.hit || '?', who = r.name || (members[r.member] && members[r.member].name) || '';
      var k = who + '|' + nm;
      if (!map[k]) { map[k] = { name: nm, who: who, el: r.el || '', damage: 0 }; out.push(map[k]); }
      map[k].damage += num(r.damage) || 0;
    });
    return out;
  }
  function totalOf(d, members) {
    var sm = d.summary || {}, t = num(sm.total != null ? sm.total : d.total);
    if (t == null) t = members.reduce(function (a, m) { return a + m.damage; }, 0);
    return t;
  }
  function hasZones(d) {
    var bd = d.breakdown || {};
    if (bd.representative && arr(bd.representative.zones)) return true;
    return rowsOf(d).some(function (r) { return arr(r.zones) && r.zones.length; });
  }

  /* ================= 环图 ================= */
  var donutBox = D.createElement('div'); donutBox.className = 'gbd-donuts'; donutBox.setAttribute('data-gbd', 'auto');
  function findDonutBox() {
    var own = D.querySelector('.gbd-donuts:not([data-gbd="auto"])');   // 页面自带容器优先
    if (own) return own;
    if (!donutBox.isConnected) G.keep(donutBox, 'donuts');
    return donutBox.isConnected ? donutBox : null;
  }
  function donutSvg(items, total, center, sub) {
    var R = 44, C = 2 * Math.PI * R, off = 0, gap = items.length > 1 ? 1.2 : 0, h = '';
    items.forEach(function (it, i) {
      var len = total > 0 ? C * it.damage / total : 0, vis = Math.max(0, len - gap);
      if (vis > 0.01) h += '<circle class="seg" data-i="' + i + '" cx="60" cy="60" r="' + R + '" style="stroke:' + it.color + '" stroke-dasharray="' + vis.toFixed(2) + ' ' + (C - vis).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 60 60)"><title>' + esc(it.label + ' ' + fmt(it.damage) + ' · ' + it.pct + '%') + '</title></circle>';
      off += len;
    });
    return '<svg class="gbd-ring" viewBox="0 0 120 120" role="img" aria-label="' + esc(sub) + '"><circle class="track" cx="60" cy="60" r="' + R + '"/>' + h +
      '<text class="c1" x="60" y="60">' + esc(center) + '</text><text class="c2" x="60" y="75">' + esc(sub) + '</text></svg>';
  }
  function legend(items, withAva) {
    return '<ul class="gbd-legend">' + items.map(function (it, i) {
      return '<li data-i="' + i + '"><i class="sw" style="background:' + it.color + '"></i>' +
        (withAva ? '<span class="gava sm"' + (it.avatar ? ' data-icon="' + esc(it.avatar) + '"' : '') + ' data-el="' + esc(it.el || '') + '" data-name="' + esc(it.label) + '"></span>' : '') +
        '<span class="nm" title="' + esc(it.title || it.label) + '">' + esc(it.label) + (it.who ? '<small>' + esc(it.who) + '</small>' : '') + '</span>' +
        '<span class="pc">' + it.pct + '%</span><span class="vl">' + G.compact(it.damage) + '</span></li>';
    }).join('') + '</ul>';
  }
  function pct(v, t) { return t > 0 ? (Math.round(1000 * v / t) / 10).toFixed(1) : '0.0'; }
  function renderDonuts(d) {
    var box = findDonutBox(); if (!box) return;
    var members = memberList(d), total = totalOf(d, members);
    if (!members.length || !(total > 0)) { box.innerHTML = ''; box.hidden = true; return; }
    box.hidden = false;
    var seen = {}, pal = G.palette();
    var mi = members.map(function (m, i) {
      var c = G.elColor(m.el) || pal[i % pal.length], k = c; seen[k] = (seen[k] || 0) + 1;
      if (seen[k] > 1) c = 'color-mix(in srgb,' + c + ' ' + (seen[k] === 2 ? 55 : 35) + '%,' + (seen[k] === 2 ? '#fff' : '#555') + ')';
      return { label: m.name, el: m.el, avatar: m.avatar, damage: m.damage, color: c, pct: pct(m.damage, total) };
    });
    var sk = skillList(d, members).filter(function (s) { return s.damage > 0; }).sort(function (a, b) { return b.damage - a.damage; });
    var top = sk.slice(0, 7), rest = sk.slice(7).reduce(function (a, s) { return a + s.damage; }, 0);
    var si = top.map(function (s, i) { return { label: s.name, who: s.who, title: s.who + ' · ' + s.name, damage: s.damage, color: pal[i % pal.length], pct: pct(s.damage, total) }; });
    if (rest > 0) si.push({ label: '其他 ' + (sk.length - 7) + ' 项', damage: rest, color: pal[pal.length - 1], pct: pct(rest, total) });
    var skTotal = sk.reduce(function (a, s) { return a + s.damage; }, 0);
    var note = hasZones(d) ? '' : '<div class="gbd-note">乘区明细待补 · 目前只显示汇总</div>';
    box.innerHTML =
      '<figure class="gbd-donut" data-kind="member"><figcaption>按角色</figcaption><div class="gbd-dw">' + donutSvg(mi, total, G.compact(total), '总伤害') + legend(mi, true) + '</div></figure>' +
      (si.length ? '<figure class="gbd-donut" data-kind="skill"><figcaption>按技能</figcaption><div class="gbd-dw">' + donutSvg(si, skTotal || total, String(sk.length), '项技能') + legend(si, false) + '</div></figure>' : '') + note;
    Array.prototype.forEach.call(box.querySelectorAll('.gbd-donut'), function (f) {
      var hl = function (i) { Array.prototype.forEach.call(f.querySelectorAll('[data-i]'), function (x) { x.classList.toggle('hl', i != null && x.getAttribute('data-i') === i); }); f.classList.toggle('hovering', i != null); };
      f.addEventListener('mouseover', function (ev) { var t = ev.target.closest('[data-i]'); hl(t ? t.getAttribute('data-i') : null); });
      f.addEventListener('mouseleave', function () { hl(null); });
    });
  }

  /* ================= 瀑布图 ================= */
  function mulTxt(v) { var a = Math.abs(v), s = a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(2) : v.toFixed(4); return '×' + s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''); }
  /* zones 是按顺序连乘的乘区：base（属性值）× multiplier（倍率）[+flat] 得到基础伤害，其余每层一个系数。
     final 给出时若与连乘结果差 >0.2%，补一层「其他修正」，保证终值和引擎一致。 */
  function waterfall(zones, final) {
    var z = (zones || []).filter(function (x) { return x && num(x.value) != null; });
    if (!z.length) return null;
    var base = z.filter(function (x) { return x.key === 'base'; })[0], mul = z.filter(function (x) { return x.key === 'multiplier'; })[0];
    var steps = [], cur, rest;
    if (base && mul) {
      cur = num(base.value) * num(mul.value) + (num(base.flat) || 0);
      steps.push({ kind: 'start', name: '基础伤害', sub: (base.display || fmt(base.value)) + ' × ' + (mul.display || mulTxt(mul.value)) + (num(base.flat) ? ' + ' + fmt(base.flat) : ''), from: 0, to: cur, mech: base.mech, title: [base.basis, mul.basis].filter(Boolean).join('\n') });
      rest = z.filter(function (x) { return x !== base && x !== mul; });
    } else {
      cur = num(z[0].value);
      steps.push({ kind: 'start', name: z[0].name || '基础', sub: z[0].display || '', from: 0, to: cur, mech: z[0].mech, title: z[0].basis || '' });
      rest = z.slice(1);
    }
    rest.forEach(function (x) {
      var v = num(x.value), nv = cur * v;
      steps.push({ kind: Math.abs(v - 1) < 1e-9 ? 'flat' : v > 1 ? 'up' : 'down', name: x.name || x.key, sub: x.display != null && String(x.display) !== String(x.value) ? String(x.display) : '', mul: v, from: cur, to: nv, mech: x.mech, conf: x.confidence, title: x.basis || '' });
      cur = nv;
    });
    final = final == null || final === '' ? null : num(final);
    if (final != null && cur > 0 && Math.abs(final - cur) / Math.max(final, cur) > 0.002) {
      steps.push({ kind: final > cur ? 'up' : 'down', name: '其他修正', sub: '未拆出的系数 / 取整', mul: final / cur, from: cur, to: final, mech: 'unsolved', title: '连乘结果 ' + fmt(cur) + '，引擎终值 ' + fmt(final) });
      cur = final;
    }
    steps.push({ kind: 'final', name: '最终伤害', from: 0, to: final != null ? final : cur });
    return steps;
  }
  function wfHtml(steps) {
    var max = 0; steps.forEach(function (s) { max = Math.max(max, s.from, s.to); });
    var P = function (v) { return max > 0 ? (100 * v / max) : 0; };
    return '<div class="gbd-wf" role="table" aria-label="乘区瀑布图">' + steps.map(function (s) {
      var lo = Math.min(s.from, s.to), hi = Math.max(s.from, s.to), w = Math.max(P(hi) - P(lo), 0.6);
      var delta = s.kind === 'start' || s.kind === 'final' ? fmt(s.to) : (s.to >= s.from ? '+' : '−') + fmt(Math.abs(s.to - s.from));
      return '<div class="gbd-wf-row ' + s.kind + '" role="row"' + (s.mech ? ' data-mech="' + esc(s.mech) + '"' : '') + (s.title ? ' title="' + esc(s.title) + '"' : '') + '>' +
        '<span class="lb" role="cell">' + esc(s.name) + (s.sub ? '<small>' + esc(s.sub) + '</small>' : '') + '</span>' +
        '<span class="bar" role="cell"><i style="left:' + P(lo).toFixed(2) + '%;width:' + w.toFixed(2) + '%"></i></span>' +
        '<span class="mul" role="cell">' + (s.mul != null ? mulTxt(s.mul) : '') + '</span>' +
        '<span class="val" role="cell">' + delta + '</span></div>';
    }).join('') + '</div>';
  }

  /* ================= 点击目标 → 命中数据 ================= */
  function lanesOf(d) {
    var t = d.timeline; if (t && arr(t.lanes)) return t.lanes;
    var v = G.theme() === 'ww' && window.__WW_UI__ && __WW_UI__.S && __WW_UI__.S.view;   // 鸣潮：detail.timeline 是按 t 排好的扁平数组，分道信息在页面视图里
    return v && v.timeline && arr(v.timeline.lanes) ? v.timeline.lanes : null;
  }
  function flatActs(d) { var t = d.timeline; return arr(t) || (t && arr(t.actions)) || null; }
  function rowHit(r, d) {
    var zs = arr(r.zones), cnt = num(r.count) || 1, dmg = num(r.damage);
    var final = cnt === 1 && dmg != null && !r.truncated ? dmg : null;
    if (final == null && zs) { var w = waterfall(zs, null); final = w ? w[w.length - 1].to : null; }
    return { label: r.hit || r.action || r.name || '命中', type: r.typeZh || r.type || '', zones: zs, value: final, count: cnt, damage: dmg, low: r.confidence === 'low', lowReason: r.lowReason };
  }
  function memberOf(d, idx, name) {
    var ms = arr(d.members) || [], m = ms.filter(function (x, i) { return (x.member != null ? x.member : x.index != null ? x.index : i) === idx || (idx != null && x.id != null && String(x.id) === String(idx)) || (name && x.name === name); })[0] || (typeof idx === 'number' && ms[idx]) || {};
    var nm = m.name || name || '', pc = m.avatar && m.el ? {} : pageChar(nm, m.id);
    return { name: nm, el: m.el || m.element || pc.el || '', avatar: m.avatar || pc.avatar || null };
  }
  var KIND = { ww: { A: 'basic', H: 'basic', E: 'skill', R: 'ult', Q: 'echo', I: 'intro', O: 'outro' },
    hsr: { A: 'basic', E: 'skill', Q: 'ult', F: 'forte' }, endfield: {} };
  var KIND_ZH = { '普攻': 'basic', '重击': 'basic', '战技': 'skill', '共鸣技能': 'skill', '终结技': 'ult', '共鸣解放': 'ult', '连携技': 'ult', '变奏技能': 'intro', '延奏技能': 'outro', '追加攻击': 'forte' };
  var KNORM = { attack: 'basic', normal: 'basic', ultimate: 'ult', combo: 'skill', power_attack: 'basic' };   // 终末地 kind → gskill data-kind
  function skillOf(x) {
    if (!x) return null;
    var k = x.skillKind || x.kind || (KIND[G.theme()] || {})[x.cls || x.key || x.action] || KIND_ZH[x.typeZh] || KIND_ZH[x.label] || '';
    k = KNORM[k] || k;
    if (k && !/^(basic|skill|ult|intro|outro|forte|passive|tune|echo)$/.test(k)) k = 'skill';
    if (!x.skillIcon && !x.skillId && !k) return null;
    return { icon: x.skillIcon || null, id: x.skillId != null ? x.skillId : null, kind: k };
  }
  function fromAction(d, lane, a) {
    var hits = arr(a.hits) && a.hits.some(function (h) { return arr(h.zones); }) ? a.hits.map(function (h) {
      return { label: h.hit || h.name || h.label || '命中', type: h.typeZh || '', zones: h.zones, value: num(h.value != null ? h.value : h.damage), count: 1, damage: num(h.damage) };
    }) : null;
    var mIdx = lane ? lane.member : a.member, mName = lane ? lane.name : (a.actor || a.name);
    var label = a.label || a.skillName || a.action || '动作';
    var rs = rowsOf(d), byIdx = a.index != null && rs.some(function (r) { return typeof r.action === 'number'; });
    if (!hits) hits = rs.filter(function (r) { return byIdx ? r.action === a.index : (r.member === mIdx || (mName && r.name === mName)) && (r.action === label || r.skillName === label); }).map(function (r) { return rowHit(r, d); });
    if (!hits.length && arr(a.hits)) hits = a.hits.map(function (h) { return { label: h.note || h.target || '命中', zones: null, value: num(h.dmg != null ? h.dmg : h.damage), count: 1, damage: num(h.dmg != null ? h.dmg : h.damage) }; });
    var t = num(a.t != null ? a.t : a.av), sa = a;
    if (lane && !a.skillIcon && arr(d.timeline)) {   // 鸣潮：分道视图里的动作不带技能 id，去 detail.timeline 里按角色 + 时间找同一个动作
      sa = d.timeline.filter(function (x) { return x && x.member === lane.member && num(x.t) != null && t != null && Math.abs(x.t - t) < 1e-3 && (!x.label || x.label === label); })[0] || a;
    }
    return { title: label, when: t != null ? (a.av != null && a.t == null ? 'AV ' + t.toFixed(1) : t.toFixed(2) + 's') : '', member: memberOf(d, mIdx, mName), damage: num(a.damage), hits: hits, scope: 'action', skill: skillOf(sa.skillIcon ? sa : a) };
  }
  function fromRow(d, r) {
    return { title: (typeof r.action === 'string' && r.action) || r.skillName || r.hit || '命中', when: '', member: memberOf(d, r.member, r.name), damage: num(r.damage), hits: [rowHit(r, d)], scope: 'row', skill: skillOf(r) };
  }
  function fromRep(d) {
    var r = (d.breakdown || {}).representative; if (!r) return null;
    var h = { label: r.hit || '命中', type: '', zones: r.zones, value: num(r.value), count: 1, damage: num(r.value) };
    return { title: r.action || '代表命中', when: num(r.t) != null ? (+r.t).toFixed(2) + 's' : '', member: memberOf(d, r.member, r.name), damage: num(r.value), hits: [h], scope: 'rep', note: '全程最大单次命中', skill: skillOf(r) };
  }
  /* 解析顺序：引擎给的 data 属性 → 鸣潮的 DOM 顺序兜底（仅在引擎还没输出属性时用） */
  var TRIG = '[data-hit],[data-act],[data-act-index],#ww-timeline .ww-act,#ww-breakdown tbody tr,#ww-breakdown .ww-mult,#resbody tr.ev > td.dmg,#timelineBody > tr';
  function resolve(el, d) {
    var rows = rowsOf(d), v, i, m, lanes = lanesOf(d), acts = flatActs(d);
    if ((v = el.getAttribute('data-hit')) != null) {
      for (i = 0; i < rows.length; i++) if (rows[i].id != null && String(rows[i].id) === v) return fromRow(d, rows[i]);
      if (/^\d+$/.test(v) && rows[+v]) return fromRow(d, rows[+v]);
      return null;
    }
    /* 引擎的 data-act-index = detail.timeline[i].index（平铺下标），优先用它；data-act="<lane>:<laneIndex>" 次之 */
    if ((v = el.getAttribute('data-act-index')) != null && acts) {
      for (i = 0; i < acts.length; i++) if (acts[i] && acts[i].index != null && String(acts[i].index) === v) return fromAction(d, null, acts[i]);
      if (/^\d+$/.test(v) && acts[+v] && acts[+v].index == null) return fromAction(d, null, acts[+v]);
    }
    if ((v = el.getAttribute('data-act')) != null) {
      m = /^(\d+):(\d+)$/.exec(v);
      if (m && acts) { var hit = acts.filter(function (a) { return a && a.lane != null && String(a.lane) === m[1] && String(a.laneIndex) === m[2]; })[0]; if (hit) return fromAction(d, null, hit); }
      if (m && lanes && lanes[+m[1]] && lanes[+m[1]].actions[+m[2]]) return fromAction(d, lanes[+m[1]], lanes[+m[1]].actions[+m[2]]);
      if (acts) for (i = 0; i < acts.length; i++) if (acts[i].id != null && String(acts[i].id) === v) return fromAction(d, null, acts[i]);
      return null;
    }
    if ((v = el.getAttribute('data-act-index')) != null) {
      var li = el.getAttribute('data-lane');
      if (li != null && lanes && lanes[+li]) { var a0 = lanes[+li].actions[+v]; return a0 ? fromAction(d, lanes[+li], a0) : null; }
      if (acts && acts[+v]) return fromAction(d, null, acts[+v]);
      return null;
    }
    /* hsr / 终末地：引擎还没给 data-act-index 时按表格行序对应 detail.timeline（行数一致且角色名对得上才用） */
    if (el.matches('#resbody tr.ev > td.dmg, #timelineBody > tr')) {
      var tr = el.closest('tr'), all = D.querySelectorAll(G.theme() === 'hsr' ? '#resbody tr.ev' : '#timelineBody > tr');
      i = Array.prototype.indexOf.call(all, tr);
      if (!acts || all.length !== acts.length || !acts[i]) return null;
      if (acts[i].actor && tr.textContent.indexOf(acts[i].actor) < 0) return null;
      return fromAction(d, null, acts[i]);
    }
    if (G.theme() !== 'ww') return null;
    if (el.matches('#ww-breakdown .ww-mult')) return fromRep(d);
    if (el.matches('#ww-breakdown tbody tr')) {
      i = Array.prototype.indexOf.call(el.parentNode.children, el);
      return rows[i] ? fromRow(d, rows[i]) : null;
    }
    if (el.matches('#ww-timeline .ww-act') && lanes && !el.classList.contains('no-stamina')) {
      var lane = el.closest('.ww-lane'); if (!lane || lane.classList.contains('status') || lane.classList.contains('res')) return null;
      var allL = Array.prototype.filter.call(lane.parentNode.children, function (x) { return x.classList.contains('ww-lane') && !x.classList.contains('status') && !x.classList.contains('res'); });
      var L = lanes[allL.indexOf(lane)];
      var mine = Array.prototype.filter.call(el.parentNode.children, function (x) { return x.classList.contains('ww-act') && !x.classList.contains('no-stamina'); });
      var a = L && L.actions[mine.indexOf(el)];
      return a ? fromAction(d, L, a) : null;
    }
    return null;
  }

  /* ================= 弹层 ================= */
  var pop = null, scrim = null, opener = null, curInfo = null, curTab = 0;
  function sheetMode() { return window.matchMedia ? matchMedia('(max-width: 640px)').matches : innerWidth <= 640; }
  function close() {
    if (!pop) return;
    pop.remove(); if (scrim) scrim.remove(); pop = scrim = null; curInfo = null;
    D.documentElement.classList.remove('gbd-sheet-open');
    if (opener && opener.focus && opener.isConnected) try { opener.focus({ preventScroll: true }); } catch (e) {}
    opener = null;
  }
  function body(info) {
    var h = info.hits[curTab] || info.hits[0], m = info.member;
    var head = '<header class="gbd-pop-h">' + (m.name ? '<span class="gava md"' + (m.avatar ? ' data-icon="' + esc(m.avatar) + '"' : '') + ' data-el="' + esc(m.el) + '" data-name="' + esc(m.name) + '"></span>' : '') +
      (info.skill ? '<span class="gskill md"' + (info.skill.icon ? ' data-icon="' + esc(info.skill.icon) + '"' : '') + ' data-kind="' + esc(info.skill.kind || '') + '" data-el="' + esc(m.el || '') + '" data-name="' + esc(info.title) + '"></span>' : '') +
      '<div class="tt"><b>' + esc(info.title) + '</b><small>' + esc([m.name, info.when, info.note].filter(Boolean).join(' · ')) + '</small></div>' +
      '<button type="button" class="gbd-x" aria-label="关闭">×</button></header>';
    var tabs = info.hits.length > 1 ? '<div class="gbd-tabs" role="tablist">' + info.hits.map(function (x, i) {
      return '<button type="button" role="tab" aria-selected="' + (i === curTab) + '" data-tab="' + i + '">' + esc(x.label) + '</button>';
    }).join('') + '</div>' : '';
    var main = '';
    if (!h) main = '<div class="gbd-note">' + (G.last && !hasZones(G.last) ? '乘区明细待补 · 引擎目前只给出动作总伤'
      : info.damage === 0 ? '这个动作本身不造成伤害' : '没有找到这个动作的命中数据') + '</div>';
    else {
      var steps = h.zones ? waterfall(h.zones, h.value) : null;
      main += '<div class="gbd-hit"><span>' + esc(h.label) + (h.type && String(h.label).indexOf(h.type) < 0 ? ' · ' + esc(h.type) : '') + '</span>' + (h.low ? '<span class="gbd-low" title="' + esc(h.lowReason || '') + '">低置信</span>' : '') + '</div>';
      if (steps) main += wfHtml(steps) + '<div class="gbd-legend-mech"><span class="table">表格推导</span><span class="corroborated">社区印证</span><span class="community">待验证</span><span class="unsolved">估计</span></div>';
      else main += '<div class="gbd-totals"><div><span>单次</span><b>' + fmt(h.value) + '</b></div></div><div class="gbd-note">乘区明细待补</div>';
      if (h.count > 1 || (h.damage != null && info.scope !== 'rep')) main += '<div class="gbd-sum">' + (h.count > 1 ? '该命中 ' + h.count + ' 次，' : '') + '合计 <b>' + fmt(h.damage) + '</b>' + (h.count > 1 && steps ? '<small>瀑布图为代表实例；不同时刻的增益不同，各次伤害可能有差异</small>' : '') + '</div>';
    }
    var foot = info.scope === 'action' && info.damage != null ? '<footer class="gbd-pop-f">本次动作伤害 <b>' + fmt(info.damage) + '</b>' + (info.hits.length > 1 ? ' · ' + info.hits.length + ' 种命中' : '') + '</footer>' : '';
    return head + tabs + '<div class="gbd-pop-b">' + main + '</div>' + foot;
  }
  function position(anchor) {
    if (!pop) return;
    if (sheetMode()) { pop.classList.add('sheet'); pop.style.left = pop.style.top = ''; return; }
    pop.classList.remove('sheet');
    var r = anchor && anchor.isConnected ? anchor.getBoundingClientRect() : { left: innerWidth / 2, right: innerWidth / 2, top: innerHeight / 3, bottom: innerHeight / 3, width: 0 };
    var w = pop.offsetWidth, h = pop.offsetHeight, x = r.left + r.width / 2 - w / 2, y = r.bottom + 8;
    if (y + h > innerHeight - 8 && r.top - h - 8 > 8) y = r.top - h - 8;
    x = Math.max(8, Math.min(x, innerWidth - w - 8)); y = Math.max(8, Math.min(y, innerHeight - h - 8));
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
  }
  function render() {
    if (!pop || !curInfo) return;
    pop.innerHTML = body(curInfo);
    pop.querySelector('.gbd-x').onclick = close;
    Array.prototype.forEach.call(pop.querySelectorAll('[data-tab]'), function (b) {
      b.onclick = function () { curTab = +b.getAttribute('data-tab'); render(); position(opener); var t = pop.querySelector('[data-tab="' + curTab + '"]'); if (t) t.focus(); };
    });
  }
  function open(info, anchor) {
    close();
    curInfo = info; curTab = 0; opener = anchor;
    if (sheetMode()) { scrim = D.createElement('div'); scrim.className = 'gbd-scrim'; scrim.onclick = close; D.body.appendChild(scrim); D.documentElement.classList.add('gbd-sheet-open'); }
    pop = D.createElement('div'); pop.className = 'gbd-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', '伤害拆解：' + info.title); pop.tabIndex = -1;
    D.body.appendChild(pop); render(); position(anchor);
    try { pop.focus({ preventScroll: true }); } catch (e) { pop.focus(); }
  }
  D.addEventListener('click', function (ev) {
    var t = ev.target.closest && ev.target.closest(TRIG);
    if (!t || (pop && pop.contains(t))) return;
    var d = G.last; if (!d) return;
    var info = resolve(t, d); if (!info) return;
    if (pop && opener === t) { close(); return; }
    open(info, t);
  }, true);   // 捕获阶段：hsr 的可展开行点击后会重绘表格，冒泡到 document 时行已脱离 DOM、取不到行序
  D.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && pop) { ev.stopPropagation(); close(); return; }
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches && ev.target.matches('[data-hit],[data-act],[data-act-index]') && G.last) {
      var info = resolve(ev.target, G.last); if (info) { ev.preventDefault(); open(info, ev.target); }
    }
    if (ev.key === 'Tab' && pop && pop.classList.contains('sheet')) {        // 底部抽屉时把焦点圈在里面
      var f = pop.querySelectorAll('button'); if (!f.length) return;
      if (ev.shiftKey && D.activeElement === f[0]) { ev.preventDefault(); f[f.length - 1].focus(); }
      else if (!ev.shiftKey && D.activeElement === f[f.length - 1]) { ev.preventDefault(); f[0].focus(); }
    }
  }, true);
  D.addEventListener('pointerdown', function (ev) {
    if (!pop || pop.contains(ev.target)) return;
    var t = ev.target.closest && ev.target.closest(TRIG);
    if (t && G.last && resolve(t, G.last)) return;          // 点另一个动作块：交给 click 切换
    close();
  }, true);
  addEventListener('resize', function () { if (pop) position(opener); });
  addEventListener('scroll', function () { if (pop && !pop.classList.contains('sheet')) { if (opener && opener.isConnected) position(opener); else close(); } }, true);

  /* ================= 总伤数字滚动 =================
     只改文字、不改数值：动画结束（或被打断、页面在后台、超时）时一定写回引擎原文。
     引擎在动画中途改写了文字就立即让位。 */
  var lastTotal = null, ANIM = typeof WeakMap === 'function' ? new WeakMap() : null;
  function stopAnim(el) {
    var st = ANIM && ANIM.get(el); if (!st) return null;
    ANIM.delete(el); st.dead = true; clearTimeout(st.guard); el.classList.remove('groll');
    if (el.textContent === st.wrote) el.textContent = st.txt;          // 还停在中间值 → 写回原文
    return st.txt;
  }
  function roll(d) {
    var target = num((d.summary || {}).total != null ? d.summary.total : d.total);
    var prev = lastTotal; lastTotal = target;
    if (G.reduced() || target == null || !ANIM) return;
    if (prev == null) prev = 0;                                   // 首次结果从 0 滚起
    (window.requestAnimationFrame || setTimeout)(function () {
      if (D.hidden) return;
      Array.prototype.forEach.call(D.querySelectorAll(G.totalSel() + ',[data-roll]'), function (el) {
        stopAnim(el);
        var txt = el.textContent, m = /^([^\d-]*)(-?[\d,]+(?:\.\d+)?)(.*)$/.exec(txt); if (!m) return;
        var to = num(m[2]); if (to == null || to === prev) return;
        var dec = (m[2].split('.')[1] || '').length, comma = m[2].indexOf(',') >= 0, from = prev, t0 = performance.now(), dur = 650;
        var st = { txt: txt, wrote: txt, dead: false };
        function f(x) { var s = x.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }); return m[1] + (comma ? s : s.replace(/,/g, '')) + m[3]; }
        function step(now) {
          if (st.dead) return;
          if (!el.isConnected || el.textContent !== st.wrote) { ANIM.delete(el); st.dead = true; clearTimeout(st.guard); el.classList.remove('groll'); return; }
          var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
          if (k < 1) { st.wrote = f(from + (to - from) * e); el.textContent = st.wrote; requestAnimationFrame(step); }
          else stopAnim(el);
        }
        ANIM.set(el, st); el.classList.add('groll');
        st.wrote = f(from); el.textContent = st.wrote;
        st.guard = setTimeout(function () { stopAnim(el); }, dur + 400);  // rAF 被节流也保证写回
        requestAnimationFrame(step);
      });
    });
  }

  /* ================= 鸣潮时间轴动作块上的技能图标 =================
     引擎在 timeline.lanes[i].actions[j] 上给 skillIcon（可为 null，声骸 / 切人动作等）时，在对应 .ww-act 前面补一个 .gskill.sm。
     引擎自己已经输出 .gskill 的块不动。没有 skillIcon 字段时什么都不做。 */
  function decorateTimeline(d) {
    var lanes = lanesOf(d); if (!lanes || G.theme() !== 'ww') return;
    if (!lanes.some(function (l) { return (l.actions || []).some(function (a) { return a && a.skillIcon; }); })) return;
    var domL = Array.prototype.filter.call(D.querySelectorAll('#ww-timeline .ww-lane'), function (x) { return !x.classList.contains('status') && !x.classList.contains('res'); });
    domL.forEach(function (lane, li) {
      var L = lanes[li]; if (!L) return;
      var ms = memberOf(d, L.member, L.name);
      Array.prototype.filter.call(lane.querySelectorAll('.track > .ww-act'), function (x) { return !x.classList.contains('no-stamina'); }).forEach(function (el, j) {
        var m = /^(\d+):(\d+)$/.exec(el.getAttribute('data-act') || ''), a = m ? (lanes[+m[1]] || {}).actions[+m[2]] : L.actions[j];
        if (el.querySelector(':scope > .gskill')) { el.classList.add('has-gskill'); return; }
        if (!a || !a.skillIcon || a.coord) return;
        var sk = D.createElement('span'); sk.className = 'gskill sm'; sk.setAttribute('data-icon', a.skillIcon);
        sk.setAttribute('data-kind', (skillOf(a) || {}).kind || ''); sk.setAttribute('data-el', ms.el || L.el || ''); sk.setAttribute('aria-hidden', 'true');
        el.insertBefore(sk, el.firstChild); el.classList.add('has-gskill');
      });
    });
  }

  G.on('result', function (d) {
    if (pop) close();
    (window.requestAnimationFrame || setTimeout)(function () { renderDonuts(d); decorateTimeline(d); });
    D.documentElement.classList.add('gbd-ready');
    roll(d);
  });
  window.__gbd = { open: function (info, anchor) { open(info, anchor); }, close: close, waterfall: waterfall, refresh: function () { if (G.last) renderDonuts(G.last); } };
})();
