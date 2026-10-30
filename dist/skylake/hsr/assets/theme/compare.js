/* compare.js — v3.2 对比模式：把当前结果快照成 A，用户改配置后得到 B，A / B 两张卡并排（手机上下叠）显示总伤、DPS、各角色伤害和差值 约定见 ../ww/COMPONENTS.md。 */
(function () {
  'use strict';
  var G = window.__gui; if (!G || window.__gcmp) return;
  var D = document, H = D.documentElement, esc = G.esc, fmt = G.fmt, num = G.num;
  var game = G.theme(), LOCKABLE = game === 'ww';
  var LS_MODE = 'gcmp:' + game + ':mode';
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function searchedOf(d) {
    if (typeof d.searched === 'boolean') return d.searched;
    if (typeof d.rotationSource === 'string') return d.rotationSource === 'search';
    var r = d.config && d.config.rotation; return r && r.mode === 'search' ? true : null;
  }
  var SRC = { search: '自动搜索', preset: '预设排轴', manual: '手写排轴', locked: '锁定排轴', origin: '分享排轴（搜索所得）' };
  function srcOf(d) {
    var k = typeof d.rotationSource === 'string' ? d.rotationSource : null, c = d.config || {};
    return k === 'manual' && ((c.rotation && c.rotation.origin) || c.origin) === 'search' ? 'origin' : k;
  }
  function srcTag(x) {
    var k = x && (x.src || (x.searched === true ? 'search' : null));
    return k && SRC[k] ? '<span class="gcmp-src" data-src="' + esc(k) + '">' + SRC[k] + '</span>' : '';
  }
  function snap(d) {
    return { runId: d.runId, dataVersion: d.dataVersion, config: clone(d.config), rotation: clone(d.rotation || null),
      searched: searchedOf(d), src: srcOf(d),
      summary: clone(d.summary || {}), members: clone(d.members || []), illegal: clone(d.illegal || []), waits: clone(d.waits || []) };
  }
  var S = { on: false, A: null, B: null, mode: LOCKABLE && lsGet(LS_MODE) !== 'free' ? 'lock' : 'free', busy: false, err: null, lastPage: null, seq: 0 };

  var panel = D.createElement('section'); panel.className = 'gcmp'; panel.setAttribute('aria-label', '方案对比'); panel.hidden = true;
  function lockOK() { return LOCKABLE && S.A && Array.isArray(S.A.rotation) && S.A.rotation.length > 0; }
  function modeTag() {
    if (!LOCKABLE) return '<span class="gcmp-tag">各自计算</span>';
    if (S.mode === 'lock' && lockOK()) return '<span class="gcmp-tag lock">锁定同一排轴</span>';
    if (S.B && S.B.searched === true) return '<span class="gcmp-tag free">各自搜索·含搜索波动</span>';
    if (S.B && S.B.searched === false) return '<span class="gcmp-tag free">各自计算·' + (SRC[S.B.src] || '未搜索') + '</span>';
    return '<span class="gcmp-tag free">各自计算</span>';   // 判断不出是否搜索过：不声称搜索
  }
  function rate(x) {
    var s = x.summary || {}, t = num(s.total);
    if (num(s.dps) != null) return { v: num(s.dps), lb: 'DPS' };
    if (t != null && num(s.duration) > 0) return { v: t / num(s.duration), lb: 'DPS' };
    if (t != null && num(s.cycles) > 0) return { v: t / num(s.cycles), lb: '每轮' };
    return { v: null, lb: 'DPS' };
  }
  function ava(name) {
    var g = Array.prototype.filter.call(D.querySelectorAll('.gava[data-name][data-icon]'), function (x) { return x.getAttribute('data-name') === name && !x.closest('.gcmp,.gbd-donuts,.gbd-pop,.gpre,.gplans'); })[0];
    return '<span class="gava sm"' + (g ? ' data-icon="' + esc(g.getAttribute('data-icon')) + '" data-el="' + esc(g.getAttribute('data-el') || '') + '"' : '') + ' data-name="' + esc(name) + '"></span>';
  }
  function mkey(m) { return m.id != null ? 'id:' + m.id : 'nm:' + m.name; }
  function chip(b, a, pct) {
    if (b == null || a == null) return '';
    var d = b - a, p = a ? d / a * 100 : 0;
    if (Math.abs(d) < 0.5) return '<span class="gcmp-d eq">±0</span>';
    return '<span class="gcmp-d ' + (d > 0 ? 'up' : 'down') + '">' + (d > 0 ? '+' : '−') + G.compact(Math.abs(d)) + (pct !== false && a ? ' · ' + (d > 0 ? '+' : '−') + Math.abs(p).toFixed(p && Math.abs(p) < 10 ? 1 : 0) + '%' : '') + '</span>';
  }
  function card(x, tag, other) {
    if (!x) return '<div class="gcmp-card empty" data-side="' + tag + '"><header><b>' + tag + '</b></header><p>' +
      (S.busy ? '计算中…' : S.err ? '计算失败：' + esc(S.err) : '修改配置后自动计算 B，与 A 对比。') + '</p></div>';
    var t = num((x.summary || {}).total), r = rate(x), ot = other && num((other.summary || {}).total), orr = other && rate(other);
    var om = {}; (other && other.members || []).forEach(function (m) { om[mkey(m)] = m; });
    var rows = (x.members || []).map(function (m) {
      var o = om[mkey(m)], dm = num(m.damage);
      return '<li>' + ava(m.name || '') + '<span class="nm">' + esc(m.name || '') + '</span><span class="vl">' + fmt(dm) + '</span>' +
        (other ? (o ? chip(dm, num(o.damage), false) : '<span class="gcmp-d new">新</span>') : '') + '</li>';
    }).join('');
    var ill = Array.isArray(x.illegal) && x.illegal.length ? '<div class="gcmp-ill" role="note"><b>排轴里有 ' + x.illegal.length + ' 步在 B 配置下不合法：</b><ol>' +
      x.illegal.slice(0, 8).map(function (s) { return '<li><code>' + esc(s.token) + '</code> 第 ' + ((num(s.index) || 0) + 1) + ' 步 · ' + esc(s.reason || '') + '</li>'; }).join('') +
      (x.illegal.length > 8 ? '<li class="more">…另外 ' + (x.illegal.length - 8) + ' 步</li>' : '') + '</ol></div>' : '';
    var waits = Array.isArray(x.waits) && x.waits.length && tag === 'B' && S.mode === 'lock' ? '<div class="gcmp-note">有 ' + x.waits.length + ' 步被迫等待（冷却 / 能量未就绪）</div>' : '';
    return '<div class="gcmp-card" data-side="' + tag + '"><header><b>' + tag + '</b>' + (tag === 'A' ? '<small>进入对比时的结果</small>' + srcTag(x) : modeTag()) + '</header>' +
      '<div class="gcmp-big"><span class="lb">总伤害</span><span class="v">' + fmt(t) + '</span>' + (other ? chip(t, ot) : '') + '</div>' +
      '<div class="gcmp-sub"><span class="lb">' + r.lb + '</span><span class="v">' + fmt(r.v) + '</span>' + (other ? chip(r.v, orr.v) : '') + '</div>' +
      '<ul class="gcmp-mem">' + rows + '</ul>' + ill + waits + '</div>';
  }
  function render() {
    if (!S.on) { panel.hidden = true; panel.innerHTML = ''; return; }
    panel.hidden = false;
    var seg = LOCKABLE ? '<div class="gcmp-seg" role="radiogroup" aria-label="对比口径">' +
      '<button type="button" role="radio" data-mode="lock" aria-checked="' + (S.mode === 'lock') + '"' + (lockOK() ? '' : ' disabled title="A 没有可重放的排轴"') + '>锁定同一排轴</button>' +
      '<button type="button" role="radio" data-mode="free" aria-checked="' + (S.mode !== 'lock') + '">各自搜索</button></div>'
      : '<span class="gcmp-tag">各自计算</span>';
    panel.innerHTML = '<header class="gcmp-h"><b>方案对比</b>' + seg + '<span class="sp"></span>' +
      '<button type="button" class="gtool" data-cmp="back" title="把配置恢复成 A"' + (S.busy ? ' disabled' : '') + '>回到 A</button>' +
      '<button type="button" class="gtool" data-cmp="exit">退出对比</button></header>' +
      '<div class="gcmp-cards' + (S.busy ? ' busy' : '') + '">' + card(S.A, 'A', null) + card(S.B, 'B', S.A) + '</div>' +
      (LOCKABLE && S.mode === 'lock' ? '<p class="gcmp-hint">锁定口径：B 重放 A 的排轴，只比较配置差异；不合法的步骤不会被跳过，会列出来。</p>'
        : LOCKABLE ? '<p class="gcmp-hint">' + freeHint() + '</p>' : '');
  }
  function freeHint() {
    var a = S.A, b = S.B;
    var bt = b && b.searched === true ? 'B 重新搜索了最优排轴' : b && b.searched === false ? 'B 按' + (SRC[b.src] || '固定排轴') + '计算（没有搜索）' : 'B 各自计算';
    var at = a && a.searched === true ? 'A 也是搜索结果' : a && a.searched === false ? 'A 是' + (SRC[a.src] || '固定排轴') + '（没有搜索）' : '';
    return '各自口径：' + bt + (at ? '，' + at : '') + (b && b.searched === true ? '；差值里含搜索波动。' : '。');
  }
  panel.addEventListener('click', function (ev) {
    var b = ev.target.closest('button'); if (!b || b.disabled) return;
    if (b.getAttribute('data-mode')) { setMode(b.getAttribute('data-mode')); return; }
    var a = b.getAttribute('data-cmp');
    if (a === 'exit') toggle(false);
    else if (a === 'back' && S.A) apply(S.A.config, 'A').then(function () { S.B = null; render(); }, function (e) { G.toast('恢复 A 失败：' + (e && e.message || e), 'err'); });
  });

  function apply(cfg, runId, opts) {
    if (typeof window.__simApply !== 'function') return Promise.reject(new Error('页面引擎还没有提供 __simApply'));
    var o = { runId: runId };
    if (opts && opts.lockRotation) o.lockRotation = opts.lockRotation;
    else if (opts && opts.search) o.search = true;
    try { return Promise.resolve(window.__simApply(clone(cfg), o)); } catch (e) { return Promise.reject(e); }
  }
  var tmr = null;
  function runB(cfg, free) {
    clearTimeout(tmr);
    tmr = setTimeout(function () {
      var my = ++S.seq; S.busy = true; S.err = null; render();
      apply(cfg, 'B', free ? (LOCKABLE ? { search: true } : null) : { lockRotation: S.A.rotation }).then(function (d) {
        if (my !== S.seq || !S.on) return; S.busy = false; S.B = snap(d); render();
      }, function (e) {
        if (my !== S.seq || !S.on) return; S.busy = false; S.err = e && e.message || String(e); S.B = null; render();
      });
    }, 250);
  }
  function fromPage(d) {
    S.lastPage = d;
    if (S.mode === 'lock' && lockOK()) runB(d.config);
    else {
      S.seq++; S.busy = false; S.err = null; S.B = snap(d); render();
      if (LOCKABLE && S.B.searched === false) runB(d.config, true);
    }
  }
  function setMode(m) {
    if (!LOCKABLE || m === S.mode) return;
    S.mode = m; lsSet(LS_MODE, m);
    var src = S.lastPage || (S.B && S.B.config ? S.B : null);
    S.B = null; render();
    if (!src || !src.config) return;
    if (m === 'lock' && lockOK()) runB(src.config);
    else if (window.__simResult && window.__simResult.runId === 'B') runB(src.config, true);
    else fromPage(src);
  }
  G.on('result', function (d) {
    if (!S.on || !d) return;
    if (d.runId === 'B') return;
    if (d.runId === 'A') { S.B = null; S.lastPage = null; render(); return; }
    fromPage(d);
  });
  G.on('error', function (d) {
    if (!S.on || !d || d.runId === 'B' || d.runId === 'A') return;
    S.busy = false; S.err = d.message || '计算失败'; render();
  });

  function toggle(force) {
    var on = force != null ? force : !S.on;
    if (on) {
      var d = window.__simResult || G.last;
      if (!d || !d.config) { G.toast('还没有可对比的结果（引擎尚未给出配置）', 'err'); return; }
      S.on = true; S.A = snap(d); S.B = null; S.lastPage = null; S.err = null; S.busy = false;
      if (!lockOK()) S.mode = 'free';
      else if (LOCKABLE) S.mode = lsGet(LS_MODE) === 'free' ? 'free' : 'lock';
      H.classList.add('gcmp-on'); G.keep(panel, 'compare'); render();
      G.toast('已把当前结果存为 A，修改配置后自动计算 B');
    } else {
      S.on = false; S.seq++; clearTimeout(tmr); S.A = S.B = S.lastPage = null; H.classList.remove('gcmp-on'); render();
    }
    if (btn) { btn.setAttribute('aria-pressed', String(S.on)); btn.classList.toggle('on', S.on); }
  }

  var btn = D.querySelector('.gtool[data-act=compare]');   // plans.js 先放了占位按钮（compare.js 按需加载）
  if (!btn) { btn = D.createElement('button'); btn.type = 'button'; btn.className = 'gtool'; btn.setAttribute('data-act', 'compare'); btn.setAttribute('aria-pressed', 'false');
  btn.title = '把当前结果存为 A，修改配置后与 B 对比';
  btn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.5h4.5v9H2.5zM9 3.5h4.5v9H9M11.2 6v4M10 8h2.4"/></svg>对比'; }
  btn.onclick = function () { toggle(); };
  function mountBtn() {
    var t = D.querySelector('.gtools');
    if (t && btn.parentNode !== t) t.appendChild(btn);
  }
  var tries = 0;
  (function poll() { mountBtn(); if (!btn.isConnected && tries++ < 120) setTimeout(poll, 250); })();
  if (window.MutationObserver) new MutationObserver(function () { if (!btn.isConnected) mountBtn(); }).observe(D.body || H, { childList: true, subtree: true });

  window.__gcmp = { toggle: toggle, state: S, setMode: setMode };
})();
