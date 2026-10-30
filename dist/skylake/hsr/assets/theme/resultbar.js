/* resultbar.js — 手机底部吸附结果条（总伤 + 状态 + 「看结果」）。
   三款共用：总伤读 __gui.totalSel()（hsr #resbody .card.hero .v / ww #ww-summary .ww-card.hero .v / endfield #statGrid .stat.hero .v），
   状态读 #top .status（或 .ww-top .status、.masthead .status），跳转到 #right / #ww-summary / #statGrid。
   只在 ≤720px 显示，并给 <html> 加上 gresultbar-on，供 interact.css 留出 scroll-padding-bottom。 */
(function () {
  'use strict';
  if (window.__gresult) return;
  var G = window.__gui;
  var D = document;
  function boot() {
    if (window.__gresult) return;
    var bar = D.createElement('div');
    bar.className = 'gresultbar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', '当前结果');
    bar.innerHTML = '<div class="gresultbar-main"><span class="k">总伤害</span><b class="v">—</b><span class="st"></span></div>' +
      '<button type="button" class="jump">看结果</button>';
    (D.body || D.documentElement).appendChild(bar);
    var mq = window.matchMedia('(max-width: 720px)');
    function vis() {
      var on = !!mq.matches;
      bar.hidden = !on;
      D.documentElement.classList.toggle('gresultbar-on', on);
    }
    if (mq.addEventListener) mq.addEventListener('change', vis); else if (mq.addListener) mq.addListener(vis);
    vis();
    function text(sel) { var el = sel && D.querySelector(sel); return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : ''; }
    function refresh() {
      var v = G && G.totalSel ? text(G.totalSel()) : text('#resbody .card.hero .v, #ww-summary .ww-card.hero .v, #statGrid .stat.hero .v');
      bar.querySelector('.v').textContent = v || '—';
      var st = text('#top .status') || text('.ww-top .status') || text('.masthead .status') || text('.status');
      bar.querySelector('.st').textContent = st;
      bar.classList.toggle('bad', !!D.querySelector('input[aria-invalid="true"]') || /未生效|失败/.test(st));
    }
    bar.querySelector('.jump').onclick = function () {
      var t = D.querySelector('#right, #resbody, #ww-summary, #statGrid, [data-results]');
      if (t && t.scrollIntoView) t.scrollIntoView({ behavior: (G && G.reduced && G.reduced()) ? 'auto' : 'smooth', block: 'start' });
    };
    var queued = false;
    function kick(recs) {
      if (recs && recs.length) {
        var inside = true;
        for (var i = 0; i < recs.length; i++) if (!bar.contains(recs[i].target)) { inside = false; break; }
        if (inside) return;
      }
      if (queued) return; queued = true; (window.requestAnimationFrame || setTimeout)(function () { queued = false; refresh(); });
    }
    ['sim:result', 'sim:error', 'sim:start', 'sim:compare'].forEach(function (ev) { D.addEventListener(ev, function () { kick(); }); });
    if (window.MutationObserver && D.body) new MutationObserver(kick).observe(D.body, { childList: true, subtree: true, characterData: true });
    refresh();
    window.__gresult = { refresh: refresh, el: bar };
  }
  if (D.body) boot(); else D.addEventListener('DOMContentLoaded', boot);
})();
