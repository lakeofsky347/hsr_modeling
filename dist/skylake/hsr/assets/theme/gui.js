/* gui.js — v3.2 交互组件的公共底座（plans.js / presets.js / breakdown.js 共用），挂到 window.__gui 约定见 ../ww/COMPONENTS.md。 */
(function () {
  'use strict';
  if (window.__gui) return;
  var D = document, H = D.documentElement, BASE = ((D.currentScript && D.currentScript.src) || '').replace(/gui\.js(\?.*)?$/, ''), LZ = {};
  function theme() { return H.getAttribute('data-theme') || ''; }
  function $(sel, root) { try { return (root || D).querySelector(sel); } catch (e) { return null; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(v) { if (v == null || v === '' || typeof v === 'boolean') return null; v = typeof v === 'string' ? +v.replace(/[,\s]/g, '') : +v; return isFinite(v) ? v : null; }
  function fmt(n, d) { n = num(n); if (n == null) return '—'; return n.toLocaleString('en-US', { maximumFractionDigits: d || 0, minimumFractionDigits: d || 0 }); }
  function compact(n) { n = num(n); if (n == null) return '—'; var a = Math.abs(n); return a >= 1e8 ? (n / 1e8).toFixed(2) + '亿' : a >= 1e4 ? (n / 1e4).toFixed(a >= 1e6 ? 0 : 1) + '万' : fmt(n); }
  function reduced() {
    if (typeof window.__reducedMotion === 'boolean') return window.__reducedMotion;
    return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  var SLOTS = {
    tools:   { ww: [['#ww-top-actions', 'after']], hsr: [['#top .tb', 'before']], endfield: [['.masthead .file-actions', 'before']] },
    presets: { ww: [['main.ww-layout', 'before']], hsr: [['#app', 'before']], endfield: [['main.layout', 'before']] },
    donuts:  { ww: [['#ww-summary', 'after']], hsr: [['#resbody > .cards + .row', 'after'], ['#resbody > .cards', 'after']], endfield: [['#statGrid', 'after']] },
    compare: { ww: [['#ww-summary', 'before']], hsr: [['#resbody > .cards', 'before']], endfield: [['#statGrid', 'before']] },
    banner:  { ww: [['.ww-top', 'after']], hsr: [['#top', 'after']], endfield: [['.topbar', 'after']] },
    hsropt:  { hsr: [['#sec-battle > .sec', 'append']] }
  };
  var TOTAL = { ww: '#ww-summary .ww-card.hero .v', hsr: '#resbody .card.hero .v', endfield: '#statGrid .stat.hero .v' };
  function place(node, slot) {
    var list = (SLOTS[slot] || {})[theme()] || [], i, a;
    for (i = 0; i < list.length; i++) {
      a = $(list[i][0]); if (!a) continue;
      if (list[i][1] === 'append') { if (a.lastChild !== node) a.appendChild(node); }
      else if (list[i][1] === 'before') { if (a.previousSibling !== node) a.parentNode.insertBefore(node, a); }
      else if (a.nextSibling !== node) a.parentNode.insertBefore(node, a.nextSibling);
      return true;
    }
    return false;
  }
  var kept = [], kq = false;
  function recheck() {
    kq = false;
    for (var i = 0; i < kept.length; i++) { var k = kept[i]; if (!k.node.isConnected || k.always) place(k.node, k.slot); }
  }
  function keep(node, slot, always) {
    kept.push({ node: node, slot: slot, always: !!always });
    var ok = place(node, slot);
    if (kept.length === 1 && window.MutationObserver) new MutationObserver(function () { if (!kq) { kq = true; (window.requestAnimationFrame || setTimeout)(recheck); } })
      .observe(D.body || H, { childList: true, subtree: true });
    return ok;
  }

  var ELC = { physical: '#c9c9c9', fire: '#f36b45', ice: '#62c9f2', lightning: '#c77bf2', wind: '#5fdca3', quantum: '#8c86f5', imaginary: '#f2d15a',
    heat: '#ff623d', cryo: '#21c6d0', electric: '#ffc000', nature: '#9edc23',
    glacio: '#41aefb', fusion: '#f0744e', electro: '#b46bff', aero: '#55e6b5', spectro: '#f3df6a', havoc: '#e649a6' };
  function elKey(raw) { return window.__gava && window.__gava.normEl ? window.__gava.normEl(raw) : String(raw || '').toLowerCase(); }
  function elColor(raw) { var k = elKey(raw); if (k === 'physical' && theme() === 'endfield') return '#9a9a9a'; if (k === 'physical' && theme() === 'hsr') return '#cfd3dc'; return ELC[k] || null; }
  var PAL = {
    hsr: ['#9db2ff', '#d3a8ff', '#f5d27a', '#7fe0d0', '#ff9db8', '#6fa8ff', '#c6c9ff', '#5d6890'],
    endfield: ['#fadb14', '#9fe870', '#21c6d0', '#ff9f1a', '#ecebe6', '#c49a00', '#8b8b86', '#4a4c53'],
    ww: ['#d9b46a', '#7fd6dc', '#f1d9a0', '#9b8cff', '#e98a6b', '#7aa2c8', '#8fd9a8', '#6b6a64']
  };
  function palette() { return PAL[theme()] || PAL.ww; }

  var toastBox = null;
  function whenParsed(fn) { if (D.readyState !== 'loading') fn(); else D.addEventListener('DOMContentLoaded', fn); }
  function whenBody(fn) { if (D.body) fn(); else D.addEventListener('DOMContentLoaded', fn); }
  function toast(msg, kind) {
    if (!D.body) return whenBody(function () { toast(msg, kind); });
    if (!toastBox) { toastBox = D.createElement('div'); toastBox.className = 'gtoasts'; toastBox.setAttribute('role', 'status'); toastBox.setAttribute('aria-live', 'polite'); D.body.appendChild(toastBox); }
    var t = D.createElement('div'); t.className = 'gtoast' + (kind ? ' ' + kind : ''); t.textContent = msg;
    toastBox.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 300); }, kind === 'err' ? 4200 : 2400);
  }
  var BL = {};
  function drop(n) { for (var i = kept.length - 1; i >= 0; i--) if (kept[i].node === n) kept.splice(i, 1); n.remove(); }
  function uniq(a) { return a.filter(function (x, i) { return x && a.indexOf(x) === i; }); }
  function bRender(id) {
    var s = BL[id], el = D.getElementById('gbanner-' + id), ls = Object.keys(s.lines).map(function (k) { return s.lines[k]; });
    var parts = uniq([s.main].concat(ls)), kind = s.main ? s.kind : 'warn';
    if (!parts.length || (!s.main && parts.join('\n') === s.shut)) { if (el) drop(el); return null; }
    var html = parts.length > 1 ? parts.map(function (x) { return '<div class="gbanner-l">' + x + '</div>'; }).join('') : parts[0];
    if (!el) {
      el = D.createElement('div'); el.id = 'gbanner-' + id;
      el.innerHTML = '<div class="gbanner-t"></div><button type="button" class="gbanner-x" aria-label="关闭提示">×</button>';
      el.querySelector('.gbanner-x').onclick = function () { s.main = null; s.shut = uniq(Object.keys(s.lines).map(function (k) { return s.lines[k]; })).join('\n'); drop(el); };
      if (!keep(el, 'banner')) whenParsed(function () { if (!el.isConnected && !place(el, 'banner')) D.body.insertBefore(el, D.body.firstChild); });
    }
    el.className = 'gbanner' + (kind ? ' ' + kind : ''); el.setAttribute('role', kind === 'err' ? 'alert' : 'status');
    var t = el.querySelector('.gbanner-t'); if (t.innerHTML !== html) t.innerHTML = html;
    return el;
  }
  function banner(id, html, kind) {
    var s = BL[id] || (BL[id] = { lines: {} });
    s.main = html || null; s.kind = kind; s.shut = null;
    return bRender(id);
  }
  function bannerLine(id, key, html) {
    var s = BL[id] || (BL[id] = { lines: {}, main: null });
    if (html) s.lines[key] = html; else delete s.lines[key];
    if (!Object.keys(s.lines).length) s.shut = null;
    return bRender(id);
  }

  var subs = { start: [], result: [], error: [] };
  var G = {
    last: null, running: false, runs: {},
    theme: theme, game: theme, $: $, esc: esc, num: num, fmt: fmt, compact: compact, reduced: reduced,
    keep: keep, place: place, totalSel: function () { return TOTAL[theme()]; },
    elKey: elKey, elColor: elColor, palette: palette, toast: toast, banner: banner, bannerLine: bannerLine,
    on: function (type, fn) { (subs[type] || (subs[type] = [])).push(fn); if (type === 'result' && G.last) try { fn(G.last); } catch (e) { console.error(e); } },
    dataVersion: function () {
      if (G.last && G.last.dataVersion) return String(G.last.dataVersion);
      var d = window.__SIM_DATA__, p = window.__WW_PAGE__;
      if (theme() === 'ww' && p && p.version) return String(p.version);
      if (d && d.version) return String(d.version);
      if (d && d.meta && d.meta.version) return String(d.meta.version);
      return null;
    }
  };
  function emit(type, d) { var l = subs[type] || []; for (var i = 0; i < l.length; i++) { try { l[i](d); } catch (e) { console.error('[gui] ' + type + ' handler', e); } } }
  D.addEventListener('sim:start', function (ev) {
    var d = ev.detail || {}; G.running = true; H.classList.add('gsim-running'); if (d.runId != null) G.runs[d.runId] = 'running'; emit('start', d);
  });
  D.addEventListener('sim:result', function (ev) {
    var d = ev.detail || window.__simResult || {}; G.last = d; G.running = false; H.classList.remove('gsim-running');
    if (d.runId != null) G.runs[d.runId] = 'done'; emit('result', d);
  });
  D.addEventListener('sim:error', function (ev) {
    var d = ev.detail || {}; G.running = false; H.classList.remove('gsim-running'); if (d.runId != null) G.runs[d.runId] = 'error'; emit('error', d);
  });
  if (window.__simResult && typeof window.__simResult === 'object') G.last = window.__simResult;
  if (location.protocol === 'file:') {
    var fb = banner('file', '请用本地服务器打开：在包目录运行 <code>python3 -m http.server</code>，然后访问 <a href="http://localhost:8000/">http://localhost:8000/</a>', 'warn');
    if (fb) fb.classList.add('fixed');
  }
  /* 按需加载主题脚本（compare.js / plans-drawer.js / breakdown.js）：?v= 取 apply-theme.py 写入的 window.__themeV */
  G.lazy = function (fn) {
    if (LZ[fn]) return LZ[fn];
    if (D.querySelector('script[src*="/' + fn + '"]') && ({ 'compare.js': window.__gcmp, 'plans-drawer.js': window.__gplansDrawer, 'breakdown.js': window.__gbd })[fn]) return (LZ[fn] = Promise.resolve());
    return (LZ[fn] = new Promise(function (ok, no) {
      var s = D.createElement('script'), v = (window.__themeV || {})[fn];
      s.src = BASE + fn + (v ? '?v=' + v : ''); s.onload = ok; s.onerror = function () { delete LZ[fn]; s.remove(); no(new Error(fn)); };
      (D.head || H).appendChild(s);
    }));
  };
  /* 拆解图在第一次开始计算时加载（首屏数据已到齐，计算期间下载完），结果出来时 on('result') 立即补发 */
  var bdGo = function () { if (!window.__gbd) G.lazy('breakdown.js').catch(function () {}); bdGo = function () {}; };
  subs.start.push(function () { bdGo(); }); subs.result.push(function () { bdGo(); });
  window.__gui = G;
})();
