/* loadui.js — v3.3 鸣潮按需加载反馈（同步加载：首屏就开始监听）。lazy 批次：编队位 / 选择项骨架 + 顶部细进度条； 约定见 ../ww/COMPONENTS.md。 */
(function () {
  var G = window.__gui; if (!G || window.__gload) return;
  var D = document, H = D.documentElement, A = {}, F = null, q = 0, K = ['resonator', 'weapon', 'echo'];
  var top = D.createElement('div'); top.className = 'gload-top'; top.innerHTML = '<i></i>';
  function E() { return { resonator: [], weapon: [], echo: [] }; }
  function add(a, b) { K.forEach(function (k) { (b && b[k] || []).forEach(function (v) { if (a[k].indexOf(+v) < 0) a[k].push(+v); }); }); return a; }
  function own(c) {
    var o = E(), C = window.__simChunks, x = C && C.chunks && C.chunks.filter(function (y) { return y.id === c; })[0], m;
    if (x && x.owner && o[x.owner.type]) o[x.owner.type] = x.owner.ids.map(Number);
    else if ((m = /^(res|mod|wpn|echo):(\d+)$/.exec(c || ''))) o[{ res: 'resonator', mod: 'resonator', wpn: 'weapon', echo: 'echo' }[m[1]]] = [+m[2]];
    return o;
  }
  function hits(ids) {
    var U = window.__WW_UI__, T = (U && U.S && U.S.config && U.S.config.team) || [], out = [];
    D.querySelectorAll('#ww-team .ww-slot[data-slot]').forEach(function (el) {
      var m = T[+el.getAttribute('data-slot')];
      if (m && (ids.resonator.indexOf(+m.id) >= 0 || (m.weapon && ids.weapon.indexOf(+m.weapon.id) >= 0) ||
        (m.echoes || []).some(function (e) { return e && ids.echo.indexOf(+(e.echoId != null ? e.echoId : e.id)) >= 0; }))) out.push(el);
    });
    D.querySelectorAll('.ww-pick .it[data-id]').forEach(function (el) { if (ids.resonator.indexOf(+el.getAttribute('data-id')) >= 0) out.push(el); });
    return out;
  }
  function mark(sel, on, fn) {
    D.querySelectorAll('.' + sel).forEach(function (el) { if (on.indexOf(el) < 0) fn(el, 0); });
    on.forEach(function (el) { fn(el, 1); });
  }
  function skel(el, on) {
    var s = el.querySelector(':scope>.gload-shim');
    if (on && !s) { s = D.createElement('span'); s.className = 'gload-shim'; el.appendChild(s); } else if (!on && s) s.remove();
    el.classList.toggle('gload-skel', !!on); if (on) el.setAttribute('aria-busy', 'true'); else el.removeAttribute('aria-busy');
  }
  function err(el, on) {
    var b = el.querySelector(':scope>.gload-retry'); el.classList.toggle('gload-err', !!on);
    if (on && !b) {
      b = D.createElement('button'); b.type = 'button'; b.className = 'gload-retry'; b.textContent = '重试';
      b.onclick = function (ev) { ev.stopPropagation(); retry(); }; el.appendChild(b);
    } else if (!on && b) b.remove();
  }
  function paint() {
    q = 0; var ks = Object.keys(A), ids = E(), lo = 0, to = 0;
    ks.forEach(function (k) { add(ids, A[k].ids); lo += A[k].l; to += A[k].t; });
    mark('gload-skel', hits(ids), skel); mark('gload-err', F ? hits(F) : [], err);
    if (!top.isConnected && D.body) D.body.appendChild(top);
    if (ks.length) top.style.setProperty('--gl-p', Math.max(.04, to ? Math.min(1, lo / to) : 0).toFixed(3));
    else if (top.classList.contains('on')) top.style.setProperty('--gl-p', 1);
    top.classList.toggle('fin', !ks.length && top.classList.contains('on')); top.classList.toggle('on', !!ks.length);
    H.classList.toggle('gsim-loading', !!ks.length);
  }
  function sch() { if (!q) { q = 1; requestAnimationFrame(paint); } }
  function on(t, f) { D.addEventListener('sim:' + t, function (e) { var d = e.detail || {}; if (d.phase === 'lazy') { f(d, d.batch && d.batch.id || d.batch); sch(); } }); }
  var st = window.__simLoadState && window.__simLoadState(), C = window.__simChunks, boot = (C && C.boot) || [];
  if (st && st.pending) st.pending.forEach(function (c) { if (boot.indexOf(c) < 0) { var a = A.pre || (A.pre = { ids: E(), c: [], l: 0, t: 0 }); add(a.ids, own(c)); a.c.push(c); } });
  on('loading', function (d, b) { var ids = add(E(), d.ids); (d.chunks || []).forEach(function (c) { add(ids, own(c)); }); A[b] = { ids: ids, c: d.chunks || [], l: 0, t: d.batch && +d.batch.total || 0 }; F = null; });
  on('progress', function (d, b) {
    var a = A[b] || (A[b] = { ids: own(d.chunk), c: [d.chunk], l: 0, t: 0 });
    a.l = +d.batch.loaded || 0; a.t = +d.batch.total || a.t;
    if (d.state === 'retry') G.toast('网络不稳，正在重试（第 ' + Math.max(1, (+d.attempt || 2) - 1) + ' 次）…', 'warn');
  });
  on('loaded', function (d, b) { delete A[b]; delete A.pre; });
  G.on('error', function (d) {
    if (!d || d.phase !== 'load' || !H.classList.contains('gload-ready')) return;
    var ids = own(d.chunk), n = Object.keys(A).length;
    Object.keys(A).forEach(function (k) { if (!d.chunk || n === 1 || A[k].c.indexOf(d.chunk) >= 0) { add(ids, A[k].ids); delete A[k]; } });
    F = ids; G.toast('数据加载失败' + (d.code ? '（' + d.code + '）' : '') + '：点出错位置的「重试」', 'err'); sch();
  });
  var busy = 0;
  function retry() {
    var U = window.__WW_UI__, c = (U && U.S && U.S.config) || (window.__simResult || {}).config;
    if (!c || !window.__simApply) return location.reload();
    if (busy) return; busy = 1; F = null; sch();
    var done = function () { busy = 0; }; window.__simApply(JSON.parse(JSON.stringify(c)), { runId: 'retry:' + Date.now() }).then(done, done);
  }
  (function ready() { if (!D.getElementById('loader') && G.last) H.classList.add('gload-ready'); else setTimeout(ready, 300); })();
  G.on('result', function () { H.classList.add('gload-ready'); delete A.pre; if (F) F = null; sch(); });
  new MutationObserver(function () { if (Object.keys(A).length || F) sch(); }).observe(H, { childList: true, subtree: true });
  window.__gload = { state: function () { return { active: A, failed: F }; }, retry: retry };
})();
