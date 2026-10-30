/* presets.js — v3.2 首屏预设卡片：队伍头像 + 名称 + 一句说明 + 预计总伤，点一下套用并开算 约定见 ../ww/COMPONENTS.md。 */
(function () {
  'use strict';
  var G = window.__gui; if (!G || window.__gpre) return;
  var D = document, esc = G.esc, game = G.game();
  var LS_C = 'gpre:' + game + ':collapsed', LS_T = 'gpre:' + game + ':totals';
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }

  function findSelect() {
    var s = D.getElementById('ww-preset'); if (s) return s;
    var all = D.querySelectorAll('header select, #top select, .topbar select'), i;
    for (i = 0; i < all.length; i++) if (all[i].options.length > 1 && /预设/.test(all[i].options[0].text)) return all[i];
    return null;
  }
  function wwMembers(i) {
    var P = window.__WW_PAGE__, U = window.__WW_UI__, p = P && P.presets && P.presets[i], chars = U && U.S && U.S.chars;
    if (!p || !p.config || !Array.isArray(p.config.team)) return null;
    return p.config.team.map(function (m) { var R = chars && chars[m.id]; return R ? { name: R.name, el: R.element, avatar: R.avatar || null } : { name: String(m.id), el: '' }; });
  }
  function fromSelect(sel) {
    var out = [];
    Array.prototype.forEach.call(sel.options, function (o) {
      if (o.value === '' || o.disabled) return;
      var txt = o.text.trim(), cut = txt.indexOf(' · '), head = cut > 0 ? txt.slice(0, cut) : '', tail = cut > 0 ? txt.slice(cut + 3) : txt;
      var members = game === 'ww' && /^\d+$/.test(o.value) ? wwMembers(+o.value) : null;
      if (!members && head.indexOf('/') > 0) members = head.split('/').map(function (n) { return { name: n.trim(), el: '' }; });
      var cfg = game === 'ww' && window.__WW_PAGE__ && window.__WW_PAGE__.presets && window.__WW_PAGE__.presets[+o.value];
      out.push({ id: o.value, name: members && head ? tail : txt, team: members && head ? head : '', desc: '', members: members || [],
        expected: null, config: cfg ? cfg.config : null, selectValue: o.value, group: o.parentNode && o.parentNode.label || '' });
    });
    return out;
  }
  function source() {
    var P = window.__simPresets;

    if (Array.isArray(P) && P.length) return { kind: 'data', list: P.map(function (p, i) { return Object.assign({}, p, { id: p.id != null ? String(p.id) : String(i), desc: p.desc || p.description || '', team: typeof p.team === 'string' ? p.team : '' }); }) };
    var sel = findSelect();
    if (sel) return { kind: 'select', sel: sel, list: fromSelect(sel) };
    return null;
  }

  var box = D.createElement('section'); box.className = 'gpre'; box.setAttribute('aria-label', '预设队伍');
  var viaSelect = false, src = null, pending = null, active = lsGet('gpre:' + game + ':active', null), sig = '';
  function collapsed() { return lsGet(LS_C, false) === true; }
  function card(p) {
    var totals = lsGet(LS_T, {}), ex = G.num(p.expected != null ? p.expected : p.expectedTotal), last = totals[p.id];
    var exHtml = ex != null ? '<span>预计总伤</span><b>' + G.fmt(ex) + '</b>' : last != null ? '<span>上次计算</span><b>' + G.fmt(last) + '</b>' : '<span>点击开算</span><b>—</b>';
    var ms = (p.members || []).slice(0, 4);
    return '<button type="button" class="gpre-card' + (String(p.id) === String(active) ? ' on' : '') + (pending != null && String(p.id) === String(pending) ? ' busy' : '') + '"' + (pending != null && String(p.id) === String(pending) ? ' aria-busy="true"' : '') + ' data-id="' + esc(p.id) + '" title="' + esc((p.team ? p.team + ' · ' : '') + p.name + (p.desc ? '\n' + p.desc : '')) + '">' +
      '<span class="gpre-ava">' + (ms.length ? ms.map(function (m) { return '<span class="gava md"' + (m.avatar ? ' data-icon="' + esc(m.avatar) + '"' : '') + ' data-el="' + esc(m.el || '') + '" data-name="' + esc(m.name || '?') + '"></span>'; }).join('') : '<span class="gpre-none" aria-hidden="true">✦</span>') + '</span>' +
      '<span class="gpre-nm">' + esc(p.name) + '</span>' +
      (p.team ? '<span class="gpre-tm">' + esc(p.team) + '</span>' : '') +
      '<span class="gpre-ds">' + esc(p.desc || '') + '</span>' +
      '<span class="gpre-ex">' + exHtml + '</span></button>';
  }
  function render() {
    src = source();
    if (!src || !src.list.length) { box.hidden = true; return; }
    box.hidden = false;
    var c = collapsed();
    box.classList.toggle('collapsed', c);
    box.innerHTML = '<header class="gpre-h"><b>快速开始</b><small>' + src.list.length + ' 个预设 · 点卡片套用并计算</small>' +
      '<button type="button" class="gpre-tg" aria-expanded="' + !c + '" aria-controls="gpre-list">' + (c ? '展开预设' : '收起') + '</button></header>' +
      '<div class="gpre-list" id="gpre-list"' + (c ? ' hidden' : '') + '>' + src.list.map(card).join('') + '</div>';
    box.querySelector('.gpre-tg').onclick = function () { lsSet(LS_C, !collapsed()); render(); };
    Array.prototype.forEach.call(box.querySelectorAll('.gpre-card'), function (b) { b.onclick = function () { apply(b.getAttribute('data-id')); }; });
  }
  function apply(id) {
    var p = src && src.list.filter(function (x) { return String(x.id) === String(id); })[0]; if (!p) return;
    pending = p.id; viaSelect = !(p.config && typeof window.__simApply === 'function');
    if (!viaSelect) {
      try { Promise.resolve(window.__simApply(JSON.parse(JSON.stringify(p.config)), { runId: 'preset:' + p.id })).catch(function (e) { G.toast('套用失败：' + (e && e.message || e), 'err'); pending = null; }); }
      catch (e) { G.toast('套用失败：' + (e && e.message || e), 'err'); pending = null; return; }
    } else {
      var sel = src.kind === 'select' ? src.sel : findSelect();
      if (!sel || p.selectValue == null && ![].some.call(sel.options, function (o) { return o.value === String(p.id); })) { G.toast('这个预设需要引擎提供 __simApply 才能套用', 'err'); pending = null; return; }
      sel.value = p.selectValue != null ? p.selectValue : String(p.id);
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    active = p.id; lsSet('gpre:' + game + ':active', active);
    if (!collapsed()) lsSet(LS_C, true);
    render();
  }
  G.on('error', function (d) { if (pending != null && d && d.runId === 'preset:' + pending) { pending = null; render(); } });
  G.on('result', function (d) {
    if (pending != null && d && (d.runId === 'preset:' + pending || viaSelect)) {
      var t = G.num((d.summary || {}).total != null ? d.summary.total : d.total);
      if (t != null) { var m = lsGet(LS_T, {}); m[pending] = Math.round(t); lsSet(LS_T, m); }
      pending = null;
    }
    var s = source(), k = s ? s.kind + ':' + s.list.length : '';
    if (k !== sig || !box.querySelector('.gpre-card') !== !s) { sig = k; }
    render();
  });
  D.addEventListener('sim:presets', render);

  var PF_DELAY = 80, pfTimer = null, pfCard = null, pfDone = {};
  function prefetchPreset(id) {
    var f = window.__simPrefetch; if (typeof f !== 'function' || !src) return;
    var p = src.list.filter(function (x) { return String(x.id) === String(id); })[0]; if (!p) return;
    var want = [], T = p.config && Array.isArray(p.config.team) ? p.config.team : [];
    (Array.isArray(p.memberIds) ? p.memberIds : (p.members || []).map(function (m) { return m && m.id; })).forEach(function (mid) { if (mid != null) want.push(['resonator', mid]); });
    T.forEach(function (m) {
      if (!m) return;
      if (m.id != null) want.push(['resonator', m.id]);
      if (m.weapon && m.weapon.id != null) want.push(['weapon', m.weapon.id]);
      (m.echoes || []).forEach(function (e) { var eid = e && (e.echoId != null ? e.echoId : e.id); if (eid != null) want.push(['echo', eid]); });
    });
    want.forEach(function (w) { var k = w[0] + ':' + w[1]; if (pfDone[k]) return; pfDone[k] = 1; try { f(w[0], +w[1] || w[1]); } catch (e) {} });
  }
  function pfStart(card) {
    if (!card || card === pfCard) return;
    clearTimeout(pfTimer); pfCard = card;
    pfTimer = setTimeout(function () { pfTimer = null; if (pfCard === card) prefetchPreset(card.getAttribute('data-id')); }, PF_DELAY);
  }
  function pfCancel(card) { if (!card || card === pfCard) { clearTimeout(pfTimer); pfTimer = null; pfCard = null; } }
  box.addEventListener('pointerover', function (e) { pfStart(e.target.closest && e.target.closest('.gpre-card')); });
  box.addEventListener('pointerout', function (e) { var c = e.target.closest && e.target.closest('.gpre-card'); if (c && !(e.relatedTarget && c.contains(e.relatedTarget))) pfCancel(c); });
  box.addEventListener('touchstart', function (e) { var c = e.target.closest && e.target.closest('.gpre-card'); if (c) { pfCard = null; pfStart(c); } }, { passive: true });
  box.addEventListener('focusin', function (e) { pfStart(e.target.closest && e.target.closest('.gpre-card')); });
  box.addEventListener('focusout', function (e) { pfCancel(e.target.closest && e.target.closest('.gpre-card')); });
  var tries = 0;
  (function wait() {
    var s = source();
    if (s && s.list.length) { sig = s.kind + ':' + s.list.length; render(); }
    else if (++tries < 60) setTimeout(wait, 400);
  })();
  G.keep(box, 'presets');
  window.__gpre = { refresh: render, apply: apply, prefetched: function () { return Object.keys(pfDone); } };
})();
