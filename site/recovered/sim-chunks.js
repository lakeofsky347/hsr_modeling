/* sim chunk loader v3.3 (pipeline/shared/sim_chunks.js, inlined into every page by the build, before the sim bridge).
 * Contract: frontend/ww/COMPONENTS.md「v3.3 数据分块与按需加载」. ES5, no dependencies.
 *   var L = window.__mkSimChunks(game, { manifestUrl, base, boot: [{id, kind, url, size}], dataVersion, process(entry, text) → payload })
 *   L.boot() → Promise<{id: payload}>     first-screen chunks (+ the manifest), phase 'boot'
 *   L.load(ids, phase, meta) → Promise<{id: payload}>   one batch (dedup per chunk, retries, sim:progress / sim:loading / sim:loaded)
 *   L.prefetch(ids)                       phase 'prefetch', errors swallowed
 *   L.manifest() → Promise<manifest>,  L.entry(id), L.state()
 * Chunk failures reject with an Error carrying {code, chunk, file}; the caller decides who gets sim:error (see app). */
(function (root) {
  'use strict';
  if (root.__mkSimChunks) return;
  var RETRY_MS = [600, 2000], STALL_MS = 20000, TICK_MS = 100;
  function fire(type, detail) {
    try { document.dispatchEvent(new CustomEvent(type, { detail: detail })); } catch (e) { /* old browsers */ }
  }
  function now() { return (root.performance && performance.now) ? performance.now() : Date.now(); }
  function err(code, msg, entry) {
    var e = new Error(msg); e.code = code; e.chunk = entry ? entry.id : null; e.file = entry ? entry.path || entry.url : null; return e;
  }
  root.__mkSimChunks = function (game, opts) {
    opts = opts || {};
    var M = null, byId = {}, mPromise = null, done = {}, inflight = {}, failed = {}, batchSeq = 0;
    (opts.boot || []).forEach(function (b) { byId[b.id] = { id: b.id, kind: b.kind, url: b.url, size: b.size || 0, boot: true, path: String(b.url).split('?')[0] }; });
    var fileProto = String(root.location && root.location.protocol) === 'file:';

    function urlOf(e) { return e.url || ((opts.base || '') + e.path + '?v=' + e.v); }   // base: '' (per-game package) or '../' (legacy shared dist/)
    function setManifest(m) {
      if (!m || m.schema !== 'sim-chunks-1' || m.game !== game) throw err('mismatch', '分块清单格式不对（' + (m && m.schema) + ' / ' + (m && m.game) + '）', { id: 'chunks.json', path: 'data/chunks.json' });
      if (opts.dataVersion != null && m.dataVersion !== opts.dataVersion) throw err('mismatch', '分块清单版本不匹配：页面 ' + opts.dataVersion + '，清单 ' + m.dataVersion + '（可能是缓存的旧文件，请强制刷新）', { id: 'chunks.json', path: 'data/chunks.json' });
      M = m;
      (m.chunks || []).forEach(function (c) { var o = byId[c.id] || {}; byId[c.id] = c; if (o.url) c.url = o.url; });
      root.__simChunks = m;
      return m;
    }

    /* one HTTP attempt, streamed: onBytes(n) after every read */
    function fetchOnce(e, onBytes) {
      return new Promise(function (resolve, reject) {
        var ctl = typeof AbortController === 'function' ? new AbortController() : null, timer = null, stalled = false;
        function arm() { if (!ctl) return; clearTimeout(timer); timer = setTimeout(function () { stalled = true; ctl.abort(); }, STALL_MS); }
        arm();
        fetch(urlOf(e), { credentials: 'same-origin', signal: ctl ? ctl.signal : undefined }).then(function (r) {
          if (!r.ok) { var x = err('http-' + r.status, 'HTTP ' + r.status + '（' + e.path + '）', e); x.noRetry = r.status >= 400 && r.status < 500; throw x; }
          if (!r.body || typeof r.body.getReader !== 'function' || typeof TextDecoder !== 'function') return r.text().then(function (t) { onBytes(t.length, true); return t; });
          var rd = r.body.getReader(), dec = new TextDecoder('utf-8'), parts = [], n = 0;
          return (function pump() {
            return rd.read().then(function (s) {
              if (s.done) { parts.push(dec.decode()); onBytes(n, true); return parts.join(''); }
              n += s.value.byteLength; arm(); parts.push(dec.decode(s.value, { stream: true })); onBytes(n, false);
              return pump();
            });
          })();
        }).then(function (t) { clearTimeout(timer); resolve(t); }, function (x) {
          clearTimeout(timer);
          if (x && x.code) return reject(x);
          reject(stalled ? err('stall', '下载卡住（' + (STALL_MS / 1000) + ' 秒没有收到数据）：' + e.path, e) : err('network', '网络错误：' + (x && x.message || x) + '（' + e.path + '）', e));
        });
      });
    }

    function getOne(id, B) {
      if (done[id]) return Promise.resolve(done[id].payload);
      var e = byId[id];
      if (inflight[id]) {   // already downloading for another batch (e.g. a prefetch): count it in this batch too
        var sz = e && e.size || 0; B.total += sz; B.files += 1;
        return inflight[id].then(function (pl) {
          B.loaded += sz; B.filesDone += 1;
          fire('sim:progress', { game: game, phase: B.phase, state: 'done', chunk: id, file: e && e.path, loaded: sz, total: sz, attempt: 1,
            batch: { id: B.id, loaded: B.loaded, total: B.total, files: B.files, filesDone: B.filesDone, startedAt: B.startedAt } });
          return pl;
        });
      }
      if (!e) return Promise.reject(err('unknown', '分块清单里没有 ' + id, { id: id, path: id }));
      if (fileProto) return Promise.reject(err('file-protocol', '请用本地服务器打开（file:// 无法按需加载数据），例如在包目录运行 python3 -m http.server', e));
      var total = e.size || 0, attempt = 1, last = 0, got = 0;
      B.total += total; B.files += 1;
      function prog(state, loaded) {
        B.loaded += loaded - (B.cur[id] || 0); B.cur[id] = loaded;
        fire('sim:progress', { game: game, phase: B.phase, state: state, chunk: id, file: e.path, loaded: loaded, total: total, attempt: attempt,
          batch: { id: B.id, loaded: B.loaded, total: B.total, files: B.files, filesDone: B.filesDone, startedAt: B.startedAt } });
      }
      prog('loading', 0);
      var p = new Promise(function (resolve, reject) {
        (function tryOnce() {
          fetchOnce(e, function (n, fin) { got = n; var t = now(); if (fin || t - last >= TICK_MS) { last = t; if (!fin) prog('loading', n); } }).then(function (text) {
            var payload;
            try { payload = opts.process ? opts.process(e, text) : text; } catch (x) { throw (x && x.code) ? x : err('parse', '分块内容无法使用（' + e.path + '）：' + (x && x.message || x), e); }
            B.filesDone += 1; prog('done', total || got);
            done[id] = { payload: payload }; delete failed[id];
            resolve(payload);
          }).then(null, function (x) {
            if (!x.noRetry && x.code !== 'parse' && x.code !== 'mismatch' && attempt <= RETRY_MS.length) {
              var wait = RETRY_MS[attempt - 1]; attempt += 1; prog('retry', 0);
              setTimeout(tryOnce, wait); return;
            }
            failed[id] = x.code || 'error'; prog('error', B.cur[id] || 0);
            reject(x);
          });
        })();
      });
      inflight[id] = p;
      var clear = function () { delete inflight[id]; };
      p.then(clear, clear);
      return p;
    }

    function newBatch(phase) { batchSeq += 1; return { id: phase === 'boot' ? 'boot' : phase + ':' + batchSeq, phase: phase, loaded: 0, total: 0, files: 0, filesDone: 0, cur: {}, startedAt: Date.now() }; }

    var L = {
      game: game,
      entry: function (id) { return byId[id] || null; },
      has: function (id) { return !!done[id]; },
      payload: function (id) { return done[id] ? done[id].payload : undefined; },
      manifest: function () {
        if (M) return Promise.resolve(M);
        if (mPromise) return mPromise;
        if (fileProto) return Promise.reject(err('file-protocol', '请用本地服务器打开（file:// 无法按需加载数据）', { id: 'chunks.json', path: 'data/chunks.json' }));
        var me = { id: 'chunks.json', kind: 'manifest', url: opts.manifestUrl, path: 'data/chunks.json' }, attempt = 0;
        mPromise = new Promise(function (resolve, reject) {
          (function tryOnce() {
            attempt += 1;
            fetchOnce(me, function () {}).then(function (t) { resolve(setManifest(JSON.parse(t))); }).then(null, function (x) {
              if (!x.noRetry && !(x instanceof SyntaxError) && x.code !== 'mismatch' && attempt <= RETRY_MS.length) { setTimeout(tryOnce, RETRY_MS[attempt - 1]); return; }
              mPromise = null; reject(x && x.code ? x : err('parse', '分块清单无法解析：' + (x && x.message || x), me));
            });
          })();
        });
        return mPromise;
      },
      /** ids: chunk ids; phase 'boot' | 'lazy' | 'prefetch'; meta.ids = {resonator:[], weapon:[], echo:[]} (echoed in sim:loading / sim:loaded) */
      load: function (ids, phase, meta) {
        ids = (ids || []).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
        var need = ids.filter(function (id) { return !done[id]; });
        var out = function () { var o = {}; ids.forEach(function (id) { o[id] = done[id] ? done[id].payload : undefined; }); return o; };
        if (!need.length) return Promise.resolve(out());
        var B = newBatch(phase || 'lazy'), t0 = Date.now(), quiet = B.phase === 'boot' || B.phase === 'prefetch';
        var known = need.every(function (id) { return byId[id]; });
        return (known ? Promise.resolve() : L.manifest()).then(function () {
          if (!quiet) fire('sim:loading', { game: game, phase: B.phase, batch: B.id, chunks: need.slice(), ids: (meta && meta.ids) || {} });
          return Promise.all(need.map(function (id) { return getOne(id, B); }));
        }).then(function () {
          if (!quiet) fire('sim:loaded', { game: game, phase: B.phase, batch: B.id, chunks: need.slice(), ids: (meta && meta.ids) || {}, bytes: B.loaded, ms: Date.now() - t0 });
          return out();
        });
      },
      boot: function () {
        var ids = (opts.boot || []).map(function (b) { return b.id; });
        var mp = opts.manifestUrl ? L.manifest().then(null, function () { return null; }) : Promise.resolve(null);   // manifest failure is not fatal at boot (retried on first lazy load)
        return Promise.all([L.load(ids, 'boot'), mp]).then(function (r) { return r[0]; });
      },
      prefetch: function (ids) { L.load(ids, 'prefetch').then(null, function () { /* retried when really needed */ }); },
      state: function () {
        var all = Object.keys(byId);
        return { loaded: Object.keys(done), pending: Object.keys(inflight), failed: Object.keys(failed), known: all.length };
      }
    };
    root.__simLoadChunk = function (id) { return L.load([id], 'lazy').then(function (o) { return o[id]; }); };
    root.__simLoadState = function () { return L.state(); };
    return L;
  };
})(typeof window !== 'undefined' ? window : this);

/* sim data loader (generated by pipeline/build_pages.py) */
(function () {
"use strict";
var CFG = {"game": "hsr", "url": "data/hsr.json?v=466787ce8e09", "engineGlobal": "HSR2", "requiredKeys": ["version", "characters", "lightcones", "relicSets", "monsters"], "versionPath": ["version"], "version": "4.7", "keepText": true, "chunksUrl": "data/chunks.json?v=bc43504cf112", "base": "", "boot": [{"id": "index", "kind": "index", "url": "data/hsr.json?v=466787ce8e09", "size": 2687263}]};
function ui(name, arg) {
  function go() {
    var f = window[name];
    if (typeof f === 'function') { try { f(arg); } catch (e) { /* theme hook failure must not break the page */ } return; }
    if (name === '__uiError') {  // no theme: plain inline message
      var d = document.createElement('div');
      d.setAttribute('role', 'alert'); d.id = 'sim-load-error';
      d.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:9999;padding:16px 20px;background:#3a1515;color:#ffd7d7;font:14px/1.5 sans-serif;white-space:pre-wrap';
      d.textContent = '加载失败：' + arg;
      (document.body || document.documentElement).appendChild(d);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
}
function fail(msg) { window.__SIM_LOAD_ERROR__ = msg; ui('__uiError', msg); }
function pick(o, path) { for (var i = 0; i < path.length; i++) { if (o == null) return undefined; o = o[path[i]]; } return o; }
function boot() {
  var errs = [];
  function onerr(ev) { errs.push(ev && ev.message || String(ev)); }
  window.addEventListener('error', onerr);
  var ss = document.querySelectorAll('script[type="text/x-sim-deferred"]');
  for (var i = 0; i < ss.length; i++) {
    var s = document.createElement('script');
    s.setAttribute('data-sim-run', ss[i].getAttribute('data-sim') || '');
    s.text = ss[i].textContent;
    ss[i].parentNode.insertBefore(s, ss[i].nextSibling);  // inline script: runs synchronously
  }
  window.removeEventListener('error', onerr);
  if (!window[CFG.engineGlobal]) { fail('引擎初始化失败：' + (errs[0] || ('未找到 ' + CFG.engineGlobal))); return; }
  if (errs.length) { fail('界面初始化出错：' + errs[0]); return; }
  ui('__uiReady');
}
if (typeof fetch !== 'function') { fail('浏览器不支持 fetch，无法加载数据'); return; }
// v3.3: one data chunk (index) per page, streamed with sim:progress (COMPONENTS.md「v3.3 数据分块与按需加载」); no per-character split yet
var LD = window.__mkSimChunks(CFG.game, { manifestUrl: CFG.chunksUrl, base: CFG.base, boot: CFG.boot, dataVersion: CFG.version });
window.__simEnsure = function () { return Promise.resolve([]); };
window.__simPrefetch = function () {};
LD.boot().then(function (o) { return o.index; }, function (e) {
  try { document.dispatchEvent(new CustomEvent('sim:error', { detail: { game: CFG.game, runId: null, message: '数据请求失败：' + (e && e.message || e), phase: 'load',
    code: (e && e.code) || 'error', chunk: (e && e.chunk) || null, file: (e && e.file) || null } })); } catch (x) { /* old browsers */ }
  throw new Error('数据请求失败：' + (e && e.message || e) + '（' + CFG.url + '）');
}).then(function (text) {
  var data;
  try { data = JSON.parse(text); } catch (e) { throw new Error('数据 JSON 解析失败：' + (e && e.message || e)); }
  if (!data || typeof data !== 'object') throw new Error('数据格式错误：顶层不是对象');
  var missing = CFG.requiredKeys.filter(function (k) { return !(k in data); });
  if (missing.length) throw new Error('数据缺少字段：' + missing.join(', '));
  var got = pick(data, CFG.versionPath);
  if (got !== CFG.version) throw new Error('数据版本不匹配：页面需要 ' + CFG.versionPath.join('.') + ' = ' + CFG.version + '，实际为 ' + got + '（可能是缓存的旧数据，请强制刷新）');
  window.__SIM_DATA__ = data;
  window.__SIM_DATA_TEXT__ = CFG.keepText ? text : null;
  boot();
}).catch(function (e) { fail(e && e.message || String(e)); });
})();
