/* 鸣潮：v3.3 双时钟 / 排轴来源 / 搜索空状态；v3.4 切人冷却顺延（提示条一行 + 时间轴虚线空档）。约定见 ../ww/COMPONENTS.md。 */
(function () {
  var D = document, G = window.__gui;
  if (!G || window.__gclock || !D.getElementById('ww-summary')) return;
  var last = null, painting = false;
  function f2(x) { return (Math.round(x * 100) / 100).toFixed(2) + 's'; }
  function clockOf(d) {
    if (!d) return null;
    var s = d.summary || {}, c = s.clock || d.clock || null;
    if (c && isFinite(+c.gameTime) && isFinite(+c.realTime)) return c;
    if (isFinite(+s.duration)) return { mode: 'open', gameTime: +s.duration, realTime: +s.duration, frozen: 0, dpsClock: 'game', fallback: true };
    return null;
  }
  var SRC = { search: '自动搜索', preset: '预设排轴', manual: '手写', locked: '锁定', origin: '分享排轴（搜索所得）' };
  function srcKey(d) {   // manual 且排轴出自搜索结果（config.rotation.origin==='search'，例如打开搜索结果的分享链接）→ origin
    var k = d && typeof d.rotationSource === 'string' ? d.rotationSource : null, c = d && d.config || {};
    return k === 'manual' && ((c.rotation && c.rotation.origin) || c.origin) === 'search' ? 'origin' : k;
  }
  function srcTag(d) {
    var k = srcKey(d);
    return k && SRC[k] ? '<span class="gsrc" data-src="' + k + '" title="本次结果的排轴来源">' + SRC[k] + '</span>' : '';
  }
  function html(d) { return srcTag(d) + clockHtml(d); }
  function clockHtml(d) {
    var c = clockOf(d);
    if (!c) return '<span class="gclk-t">战斗时间 <b>—</b></span>';
    var g = +c.gameTime, r = +c.realTime, fz = isFinite(+c.frozen) ? +c.frozen : r - g;
    var single = c.mode === 'open' || Math.abs(r - g) < 0.005;
    var dps = c.dpsClock === 'real' ? 'real' : 'game';
    var mark = '<i class="gclk-dps" title="DPS = 总伤害 ÷ 这个时间">DPS</i>';
    if (single) return '<span class="gclk-t on" title="' + (c.mode === 'open' ? '时停按完整动画计时：游戏时间与真实时间相同' : '本轮没有被扣除的时停') + '">战斗时间 <b>' + f2(g) + '</b>' + mark + '</span>';
    return '<span class="gclk-t' + (dps === 'game' ? ' on' : '') + '" title="游戏时间：战斗计时（窗口、增益、冷却），时停期间冻结">游戏时间 <b>' + f2(g) + '</b>' + (dps === 'game' ? mark : '') + '</span>' +
      '<span class="gclk-sep" aria-hidden="true">·</span>' +
      '<span class="gclk-t' + (dps === 'real' ? ' on' : '') + '" title="真实时间：按完整动画时长（含时停）">真实时间 <b>' + f2(r) + '</b>' + (dps === 'real' ? mark : '') + '</span>' +
      '<span class="gclk-fz">（时停 ' + f2(fz) + '）</span>';
  }
  function tips(d) {
    var tl = d && Array.isArray(d.timeline) ? d.timeline : null; if (!tl) return;
    tl.forEach(function (a) {
      if (!a || a.rt == null || a.index == null) return;
      var el = D.querySelector('#ww-timeline [data-act-index="' + a.index + '"]'); if (!el) return;
      var tag = '真实时间 ' + f2(+a.rt) + (a.rtEnd != null ? '–' + f2(+a.rtEnd) : '');
      var t = el.getAttribute('title') || '';
      if (t.indexOf('真实时间 ') < 0) el.setAttribute('title', (t ? t + '\n' : '') + tag);
      el.setAttribute('data-rt', (+a.rt).toFixed(3));
    });
  }
  function paint() {
    var hero = D.querySelector('#ww-summary .ww-card.hero'); if (!hero || painting) return;
    painting = true;
    var row = hero.querySelector('.gclk');
    if (!row) { row = D.createElement('div'); row.className = 'gclk'; row.setAttribute('aria-label', '计时'); hero.appendChild(row); }
    var h = html(last);
    if (row.getAttribute('data-h') !== h) { row.innerHTML = h; row.setAttribute('data-h', h); }
    painting = false;
    tips(last);
  }
  function hint(d) {
    var k = srcKey(d);
    if (k === 'origin') return '当前为分享的排轴（搜索所得），点「运行自动搜索」重新生成候选';
    if (k === 'preset') return '当前为预设固定排轴，点「运行自动搜索」生成候选';
    if (k === 'manual') return '当前为手写排轴，点「运行自动搜索」生成候选';
    if (k === 'locked') return '当前为锁定排轴，点「运行自动搜索」生成候选';
    return '尚无搜索结果，点「运行自动搜索」生成候选';
  }
  function searchEmpty() {
    var box = D.getElementById('ww-search'); if (!box) return;
    var e = box.querySelector('.ww-empty'); if (!e) return;
    e.classList.add('gsrch-empty');
    var t = (e.textContent || '').trim();
    if (/搜索中/.test(t)) { e.classList.add('busy'); return; }
    e.classList.remove('busy');
    var h = hint(last);
    if (e.getAttribute('data-h') !== h) { e.setAttribute('data-h', h); e.innerHTML = '<span class="gsrch-t">' + h + '</span>'; }
  }
  function sx(x) { return String(Math.round(x * 100) / 100); }
  function view(d) {
    var U = window.__WW_UI__, V = U && U.S && U.S.view, a = V && V.summary, b = d && d.summary;
    return a && b && a.total === b.total ? V : null;
  }
  function delays(d) {
    var out = [], tl = d && Array.isArray(d.timeline) ? d.timeline : [], V;
    tl.forEach(function (a) { if (a && +a.delayedBy > 0) out.push({ sel: a.index != null ? '[data-act-index="' + a.index + '"]' : '[data-act="' + a.lane + ':' + a.laneIndex + '"]', t: +a.t, by: +a.delayedBy }); });
    if (!out.length && (V = view(d)) && V.timeline && Array.isArray(V.timeline.lanes)) V.timeline.lanes.forEach(function (l, li) {
      (l.actions || []).forEach(function (a, ai) { if (a && +a.delayedBy > 0) out.push({ sel: '[data-act="' + li + ':' + ai + '"]', t: +a.t, by: +a.delayedBy }); });
    });
    if (!out.length && V && V.timeline && Array.isArray(V.timeline.swaps)) V.timeline.swaps.forEach(function (w) {
      if (w && +w.delayedBy > 0) out.push({ sel: '[data-act^="' + w.to + ':"]', t: +w.t, by: +w.delayedBy, pct: +w.leftPct });
    });
    return out;
  }
  function adjOf(d) {
    var V = view(d), a = d && (d.adjust || (d.summary && d.summary.adjust)) || (V && V.adjust), ds;
    if (!a || !(+a.swapCdDelays >= 0)) { ds = delays(d); a = ds.length ? { swapCdDelays: ds.length, swapCdDelaySec: ds.reduce(function (s, x) { return s + x.by; }, 0) } : null; }
    var cd = +((d && d.swapCooldown) != null ? d.swapCooldown : V && V.swapCooldown);
    return a ? { n: +a.swapCdDelays || 0, sec: +a.swapCdDelaySec || 0, cd: cd > 0 ? cd : 1 } : null;
  }
  function swLine(d) {
    var a = adjOf(d);
    if (G.bannerLine) G.bannerLine('link', 'swcd', a && a.n > 0 ? '排轴中有 ' + a.n + ' 处切人已按 ' + sx(a.cd) + ' 秒冷却顺延（共 ' + sx(a.sec) + ' 秒）' : null);
  }
  function gaps(d) {
    var box = D.getElementById('ww-timeline'); if (!box) return;
    var want = {};
    (d ? delays(d) : []).forEach(function (x) {
      var el = box.querySelector('.ww-act' + x.sel), tr = el && el.parentNode; if (!tr) return;
      var L = x.pct >= 0 ? x.pct : parseFloat(el.style.left), c = d.clock || (d.summary || {}).clock || {}, T = +c.gameEnd || +c.gameTime || +(d.summary || {}).duration;
      var k = L > 0 && x.t > 0 ? L / x.t : T > 0 ? 100 / T : 0; if (!(k > 0) || !isFinite(L)) return;
      var key = x.sel + '|' + x.by; want[key] = 1;
      if (Array.prototype.some.call(tr.querySelectorAll('.gswcd'), function (e) { return e.getAttribute('data-k') === key; })) return;
      var g = D.createElement('i'); g.className = 'gswcd'; g.setAttribute('data-k', key);
      g.style.left = Math.max(0, L - x.by * k).toFixed(3) + '%'; g.style.width = Math.min(L, x.by * k).toFixed(3) + '%';
      if (el.offsetHeight && x.pct == null) { g.style.top = el.offsetTop + 'px'; g.style.height = el.offsetHeight + 'px'; }
      g.title = '切人冷却顺延 ' + sx(x.by) + ' s'; g.setAttribute('role', 'img'); g.setAttribute('aria-label', g.title);
      tr.insertBefore(g, tr.firstChild);
    });
    Array.prototype.forEach.call(box.querySelectorAll('.gswcd'), function (g) { if (!want[g.getAttribute('data-k')]) g.remove(); });
  }
  G.on('result', function (d) { last = d; paint(); searchEmpty(); swLine(d); gaps(d); });
  var sb = D.getElementById('ww-search');
  if (sb) new MutationObserver(searchEmpty).observe(sb, { childList: true, subtree: false });
  var mo = new MutationObserver(function () { if (!D.querySelector('#ww-summary .ww-card.hero .gclk')) paint(); else tips(last); gaps(last); });
  mo.observe(D.getElementById('ww-summary'), { childList: true, subtree: true });
  var tlEl = D.getElementById('ww-timeline'); if (tlEl) mo.observe(tlEl, { childList: true, subtree: true });
  if (!last && window.__simResult) last = window.__simResult;
  paint(); searchEmpty(); if (last) { swLine(last); gaps(last); }
  window.__gclock = { text: function () { var r = D.querySelector('#ww-summary .gclk'); return r ? r.textContent : null; }, html: html, adjust: adjOf, delays: delays };
})();
