/* plans.js — v3.2 分享链接 + 本地方案界面。逻辑在 share.js（window.SimShare，后端技术支持维护），这里只做界面： 约定见 ../ww/COMPONENTS.md。 */
(function () {
  'use strict';
  var G = window.__gui; if (!G || window.__gplans) return;
  var D = document, esc = G.esc, game = G.game(), hadShare = !!window.SimShare, seenShare = false;
  var GAME_ZH = { hsr: '星穹铁道', endfield: '终末地', ww: '鸣潮' };
  function S() { return window.SimShare || null; }
  function assetVer() { var a = window.__simAssets; return a && a.engineVersion ? String(a.engineVersion) : null; }
  function engVer() { var r = window.__simResult || G.last, a = window.__simAssets; var v = (r && r.engineVersion) || (a && a.engineVersion); return v ? String(v) : null; }
  function cur() {
    var d = G.last; if (!d || d.config == null) return null;
    var cfg = d.config;
    // v3.5 鸣潮 search.effort：只有 'deep' 才写进分享链接（缺省 = standard）；迁移补上的 'standard' 不写
    if (cfg && cfg.search && typeof cfg.search === 'object' && 'effort' in cfg.search && cfg.search.effort !== 'deep') { cfg = JSON.parse(JSON.stringify(cfg)); delete cfg.search.effort; }
    var o = { game: d.game || game, dataVersion: d.dataVersion || G.dataVersion(), config: cfg }, ev = d.engineVersion || engVer();
    if (ev) o.engineVersion = ev;
    return o;
  }
  var ENG_OLD = '此链接来自旧版引擎，结果已按当前引擎重算，可能与分享时不同';
  function engCheck(r, cb) {
    if (r.engineMismatch) return cb(true);
    if (!r.engineVersion) return cb(game === 'ww');
    var now = assetVer();
    if (now) return cb(now !== String(r.engineVersion));
    D.addEventListener('sim:assets', function h() {
      var n = assetVer(); if (!n) return;
      D.removeEventListener('sim:assets', h); cb(n !== String(r.engineVersion));
    });
  }
  function engBanner(r, base) {
    engCheck(r, function (old) {
      var t = (old ? ENG_OLD + '。' : '') + (base || '');
      if (t) G.banner('link', t, 'warn'); else if (r.applied !== false) G.toast('已打开分享的配置');
    });
  }
  function canApply() { return typeof window.__simApply === 'function'; }
  function applyCfg(cfg, runId) {
    if (!canApply()) return Promise.reject(new Error('页面引擎还没有提供 __simApply'));
    try { return Promise.resolve(window.__simApply(JSON.parse(JSON.stringify(cfg)), { runId: runId })); } catch (e) { return Promise.reject(e); }
  }

  function copy(text) {
    var legacy = function () {
      var t = D.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;left:-9999px;top:0';
      D.body.appendChild(t); t.select(); var ok = false; try { ok = D.execCommand('copy'); } catch (e) { ok = false; } t.remove();
      return ok ? Promise.resolve() : Promise.reject(new Error('copy'));
    };
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).catch(legacy);
    return legacy();
  }
  function share() {
    var c = cur();
    if (!S()) { G.toast('分享模块（share.js）没有加载', 'err'); return; }
    if (!c) { G.toast(G.running ? '正在计算，算完再分享' : '还没有可分享的结果：先运行一次模拟', 'err'); return; }
    S().shareUrl(c).then(function (url) {
      return copy(url).then(function () {
        G.toast('分享链接已复制' + (url.length > 2000 ? '（' + (url.length / 1000).toFixed(1) + 'K 字符，部分聊天软件可能截断）' : ''), url.length > 2000 ? 'warn' : '');
        if (location.protocol === 'file:') G.toast('当前是本地文件打开，别人点这个链接打不开；请用在线版分享', 'warn');
      }, function () {
        G.banner('share', '复制失败，请手动复制：<input class="gbanner-in" readonly value="' + esc(url) + '">', 'warn');
      });
    }).catch(function (e) { G.toast('生成链接失败：' + (e && e.message || e), 'err'); });
  }

  var tools = D.createElement('div'); tools.className = 'gtools';
  tools.innerHTML = '<button type="button" class="gtool" data-act="share" title="复制当前配置的分享链接"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.5 9.5l3-3M7 4.5l1.2-1.2a2.6 2.6 0 013.6 3.6L10.5 8M9 11.5l-1.2 1.2a2.6 2.6 0 01-3.6-3.6L5.5 8"/></svg>分享</button>' +
    '<button type="button" class="gtool" data-act="plans" aria-haspopup="dialog" title="本地保存的方案"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2.5h7l3 3v8H3zM5.5 2.5v3h4v-3M5.5 13.5v-4h5v4"/></svg>方案</button>';
  tools.querySelector('[data-act=share]').onclick = share;
  function openDrawer(b) {   // 方案抽屉按需加载（plans-drawer.js）
    G.lazy('plans-drawer.js').then(function () { window.__gplansDrawer.open(b); }, function () { G.toast('方案界面加载失败，请检查网络后重试', 'err'); });
  }
  tools.querySelector('[data-act=plans]').onclick = function () { openDrawer(this); };
  var cb = D.createElement('button'); cb.type = 'button'; cb.className = 'gtool'; cb.setAttribute('data-act', 'compare'); cb.setAttribute('aria-pressed', 'false');
  cb.title = '把当前结果存为 A，修改配置后与 B 对比';
  cb.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.5h4.5v9H2.5zM9 3.5h4.5v9H9M11.2 6v4M10 8h2.4"/></svg>对比';
  cb.onclick = function () {   // 对比模式按需加载（compare.js 接管这个按钮）
    G.lazy('compare.js').then(function () { if (window.__gcmp) window.__gcmp.toggle(); }, function () { G.toast('对比界面加载失败，请检查网络后重试', 'err'); });
  };
  tools.appendChild(cb);


  function missingTxt(list) {
    return list.slice(0, 8).map(function (x) { return esc(x && typeof x === 'object' ? (x.name ? x.name + (x.id != null ? '（' + x.id + '）' : '') : x.id) : x); }).join('、') + (list.length > 8 ? ' 等 ' + list.length + ' 项' : '');
  }
  function navHref(g) {
    var N = window.__SIM_NAV;
    if (N && typeof N === 'object') return typeof N[g] === 'string' ? N[g] : null;
    return '../' + g + '/';
  }
  var ERRS = {
    'corrupt': '分享链接已损坏或不完整，已按默认配置加载。',
    'unknown-format': '分享链接的格式无法识别（可能来自更新的版本），已按默认配置加载。',
    'unsupported-browser': '当前浏览器不支持解压分享链接，请换用新版 Chrome / Edge / Safari / Firefox 打开。',
    'share-unavailable': '分享模块没有加载，无法打开这个链接，已按默认配置加载。'
  };
  function errBanner(r) {
    var href = r.error === 'game-mismatch' && r.game ? navHref(r.game) : null;
    G.banner('link', r.error === 'game-mismatch'
      ? '这是「' + esc(GAME_ZH[r.game] || r.game) + '」的分享链接' + (href ? '，<a href="' + esc(href + location.hash) + '">去对应页面打开</a>' : '，请到对应页面打开') + '。当前页面已按默认配置加载。'
      : r.error === 'apply-failed' ? '分享的配置套用失败：' + esc(r.message || '') + '。已按默认配置加载。'
      : ERRS[r.error] || ('无法打开分享链接（' + esc(r.error) + '），已按默认配置加载。'), 'err');
  }
  function verNote(r) {
    return r.versionMismatch ? '此链接来自 ' + esc(r.dataVersion || '旧') + ' 版本，已按当前版本' + (G.dataVersion() ? ' ' + esc(G.dataVersion()) : '') + ' 计算。' : '';
  }
  /* v3.4.1：migrateConfig 补过的键 → 迁移提示行；星铁旧链接含银狼LV.999 → a4 提示行（G.bannerLine，与版本提示共存） */
  var GR = 'options.goodRewardOnElationSkill', KZH = { buffTiming: 'buff 判定时刻', outroModuleStats: '赞妮延奏视为光噪伤害', rebeccaTurret: '丽贝卡延奏机枪塔', 'search.portfolio': '组合搜索', 'search.v35': 'v3.5 搜索（旧链接按旧版搜索）', 'search.effort': '搜索档位（标准）' };
  function preA4(ev) {   // 链接引擎版本的缺省值里欢愉技仍计好活当赏 = hsr-calc-3.4.1 之前（不写死版本号，问引擎的迁移表）
    try { var m = window.__simMigrateConfig && window.__simMigrateConfig({}, ev || null); return !!(m && m.filled && m.filled.indexOf(GR) >= 0); } catch (e) { return false; }
  }
  function migLines(r, who) {
    who = who || '此链接';
    var ks = r && r.ok !== false && Array.isArray(r.migratedKeys) ? r.migratedKeys : [], t = null, a4 = null;
    var rest = ks.filter(function (k) { return k !== GR; });
    if (ks.indexOf(GR) >= 0) t = who + '来自旧版引擎，已按当时口径打开『好活当赏计入欢愉技笑点』（可在设置中关闭）';
    if (rest.length) t = (t ? t + '；' : who + '来自旧版引擎，') + '以下设置已按当时口径补齐：' + rest.map(function (k) { return esc(KZH[k] || k); }).join('、');
    if (game === 'hsr' && r && r.ok !== false && r.config && (r.config.team || []).some(function (m) { return m && String(m.charId) === '1506'; }) && preA4(r.engineVersion))
      a4 = '银狼a4 的『计入的笑点』改为只看当前笑点，旧' + who.slice(1) + '含银狼LV.999 时总伤会下降';
    G.bannerLine('link', 'migr', t); G.bannerLine('link', 'a4', a4);
    // v3.5：引擎迁移表的判定修正提示（不可回退，没有开关）；每条一行
    var ns = r && r.ok !== false && Array.isArray(r.migrationNotices) ? r.migrationNotices : [];
    for (var i = 0; i < 4; i++) G.bannerLine('link', 'note' + i, ns[i] ? esc(ns[i].text || ns[i].id) : null);
  }
  var bridged = !!window.__mkSimBridge;
  D.addEventListener('sim:share', function (e) {
    var r = e.detail || {}; bridged = true; seenShare = true;
    if (r.error === 'empty') return;
    migLines(r.applied === false ? null : r);
    if (!r.ok) { errBanner(r); return; }
    var miss = Array.isArray(r.missingIds) ? r.missingIds : [];
    if (miss.length) { G.banner('link', (r.versionMismatch ? '此链接来自 ' + esc(r.dataVersion || '旧') + ' 版本。' : '') + '当前数据里已没有：' + missingTxt(miss) + '，无法按链接计算，已按默认配置加载。', 'warn'); return; }
    if (!r.applied) { var n0 = verNote(r); if (n0) G.banner('link', n0, 'warn'); return; }
    engBanner(r, verNote(r));
  });
  function fromLink(force) {
    if (!/[#&]s=/.test(location.hash)) return;
    if (bridged && !force) return;
    var ss = S(); if (!ss) { G.banner('link', ERRS['share-unavailable'], 'err'); return; }
    var waited = 0;
    (function ready() {
      if (!canApply() && !G.last && waited < 15000) { waited += 250; setTimeout(ready, 250); return; }
      var dopt = { game: game, dataVersion: G.dataVersion(), findMissingIds: window.__simFindMissingIds }, evNow = assetVer();
      if (evNow) dopt.engineVersion = evNow;
      ss.decode(location.hash, dopt).then(function (r) {
        if (!r || r.error === 'empty') return;
        migLines(r);
        if (!r.ok) { errBanner(r); return; }
        var miss = Array.isArray(r.missingIds) ? r.missingIds : [];
        var note = verNote(r) + (miss.length ? ' 当前数据里已没有：' + missingTxt(miss) + '，这些项已按默认处理。' : '');
        if (note) G.banner('link', note, 'warn');
        applyCfg(r.config, 'link').then(function () { engBanner(r, note); }, function (e) {
          G.banner('link', (note ? note + '<br>' : '') + (canApply() ? '分享的配置套用失败：' + esc(e && e.message || e) + '。已按默认配置加载。' : '这个页面版本还不能打开分享链接（引擎尚未接入），已按默认配置加载。'), 'err');
        });
      });
    })();
  }

  G.keep(tools, 'tools');

  /* v3.4.1 星铁：options.goodRewardOnElationSkill 开关，挂在「战斗设置」卡片末尾；改动经 __simApply 重算 */
  if (game === 'hsr') (function () {
    var row = D.createElement('div'), seq = 0; row.className = 'ghsr-gr';
    row.innerHTML = '<label class="ghsr-gr-sw"><input type="checkbox" data-opt="goodRewardOnElationSkill"><i aria-hidden="true"></i><span>好活当赏计入欢愉技笑点（v1 原口径）</span></label>' +
      '<details class="ghsr-gr-n"><summary>口径说明</summary><p>v1 原口径：欢愉技的笑点系数 = 自身【好活当赏】+ 当前笑点。当前引擎（<b class="ghsr-gr-v"></b>）默认只计当前笑点，与 hsr-optimizer 逐项对照一致；' +
      '旧口径在同一用例（火花欢愉技）期望伤害高 55.6%。旧版分享链接打开时会自动按当时口径开启。银狼 LV.999 a4 的「计入的笑点」不受此开关影响。</p>' +
      '<p class="ghsr-gr-src">来源：hsr-optimizer 交叉核对 F3 / F3-on（pipeline/hsr/validation/HSR_OPTIMIZER_CROSSCHECK.md）；欢愉差异表（HSR_ELATION_DIFF.md）</p></details>';
    var cb = row.querySelector('input');
    function val() {
      var U = window.__HSR2_UI__, o = U && U.S && U.S.options, c = G.last && G.last.config;
      if (!o) o = c && c.options;
      return !!(o && o.goodRewardOnElationSkill);
    }
    function sync() { cb.checked = val(); row.querySelector('.ghsr-gr-v').textContent = engVer() || '—'; }
    cb.onchange = function () {
      var U = window.__HSR2_UI__, c = U && typeof U.buildConfig === 'function' ? U.buildConfig() : G.last && G.last.config ? JSON.parse(JSON.stringify(G.last.config)) : null;
      if (!c || !canApply()) { sync(); G.toast('还没有可重算的配置', 'err'); return; }
      c.options = c.options || {}; c.options.goodRewardOnElationSkill = cb.checked;
      applyCfg(c, 'opt-gr-' + (++seq)).then(null, function (e) { sync(); G.toast('重算失败：' + (e && e.message || e), 'err'); });
    };
    G.on('result', sync); sync();
    G.keep(row, 'hsropt');
  })();

  function boot() {
    bridged = bridged || !!window.__mkSimBridge;
    var R = window.__simResult;
    if (bridged && !seenShare && R && R.runId === 'share' && window.SimShare && /[#&]s=/.test(location.hash)) {
      var o = { game: game, dataVersion: G.dataVersion() }; if (assetVer()) o.engineVersion = assetVer();
      SimShare.decode(location.hash, o).then(function (r) { if (r && r.ok) migLines(r), engBanner(Object.assign({ applied: true }, r), verNote(r)); });
    }
    fromLink();
  }
  if (D.readyState === 'complete') boot(); else addEventListener('load', boot);
  addEventListener('hashchange', function () { if (/[#&]s=/.test(location.hash)) fromLink(true); });
  window.__gplans = { bootHadSimShare: hadShare, share: share, payload: cur /* v3.5：分享链接内容（QA 用，不复制） */, open: function () { openDrawer(tools.querySelector('[data-act=plans]')); }, close: function () { if (window.__gplansDrawer) window.__gplansDrawer.close(); },
    _k: { migLines: migLines, G: G, game: game, GAME_ZH: GAME_ZH, S: S, cur: cur, canApply: canApply, applyCfg: applyCfg } };
})();
