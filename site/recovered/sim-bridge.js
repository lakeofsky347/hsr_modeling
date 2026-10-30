/* sim bridge v3.2 (pipeline/shared/sim_bridge.js, inlined into every page by the build): engine events + promise plumbing for __simApply,
 * and the share-link boot (#s=… → SimShare.decode → __simApply). Contract: frontend/ww/COMPONENTS.md「Engine events & API (v3.2)」. ES5. */
(function (root) {
  'use strict';
  if (root.__mkSimBridge) return;
  function fire(type, detail) {
    try { document.dispatchEvent(new CustomEvent(type, { detail: detail })); } catch (e) { /* old browsers: no CustomEvent constructor */ }
  }
  function jsonClone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  /* v3.3 engineVersion: semantic calculation version (pipeline/shared/engine_version.py ENGINE_VERSION, e.g. 'ww-calc-3.3'). The build
   * also inlines window.__SIM_ENGINE_VERSION__ + a stub window.__simAssets = {game, engineVersion} in <head>, so it is readable before
   * any data / chunk / computation (share-link decode). Carried on __simAssets / sim:assets and on every sim:result / __simResult. */
  function wrapShare() {
    var S = root.SimShare;
    if (!S || typeof S.decode !== 'function' || S.decode.__simMigrate) return false;
    var orig = S.decode;
    var w = function () {
      var p = orig.apply(this, arguments);
      return Promise.resolve(p).then(function (r) {
        var fn = root.__simMigrateConfig;
        if (r && r.ok && r.config && typeof r.config === 'object' && typeof fn === 'function') {
          try { var m = fn(r.config, r.engineVersion || null); r.config = m.config; r.migratedKeys = m.filled; r.migratedFrom = m.from; r.migratedKnown = m.known; r.migrationNotices = Array.isArray(m.notices) ? m.notices : []; }   // v3.5: non-revertible model-correction notices
          catch (e) { r.migrateError = String(e && e.message || e); }
        }
        return r;
      });
    };
    w.__simMigrate = true; S.decode = w;
    return true;
  }
  if (root.addEventListener) {   // before theme plans.js boot (its listeners are registered later): DOMContentLoaded + load
    root.addEventListener('DOMContentLoaded', wrapShare);
    root.addEventListener('load', wrapShare);
  }
  root.__simWrapShare = wrapShare;
  root.__mkSimBridge = function (game, engineVersion) {
    var seq = 0, nextId = null, waiters = {};
    var ev = engineVersion || root.__SIM_ENGINE_VERSION__ || null;
    var B = {
      game: game, engineVersion: ev, clone: jsonClone, fire: fire,
      /** right after data load, before any computation: window.__simAssets = {game, elementIcons} + sim:assets (same detail) */
      assets: function (elementIcons) {
        var d = { game: game, engineVersion: ev, elementIcons: jsonClone(elementIcons && typeof elementIcons === 'object' ? elementIcons : {}) };
        root.__simAssets = d;
        fire('sim:assets', d);
        return d;
      },
      /** a computation starts: consumes a caller-supplied runId (request) or auto-increments; fires sim:start */
      begin: function () {
        var rid = nextId != null ? nextId : String(++seq);
        nextId = null;
        fire('sim:start', { game: game, runId: rid });
        return rid;
      },
      /** __simApply: reserve the runId of the next computation; returns {runId, promise} */
      request: function (rid) {
        var id = rid != null ? String(rid) : String(++seq);
        nextId = id;
        var p = new Promise(function (res, rej) { waiters[id] = { res: res, rej: rej }; });
        return { runId: id, promise: p };
      },
      done: function (rid, detail) {
        detail.game = game; detail.runId = rid; detail.engineVersion = ev;
        if (!('searched' in detail)) detail.searched = false;              // v3.3: every game sets these; defaults for safety
        if (!('rotationSource' in detail)) detail.rotationSource = null;
        root.__simResult = detail;
        fire('sim:result', detail);
        var w = waiters[rid]; if (w) { delete waiters[rid]; w.res(detail); }
      },
      fail: function (rid, message, extra) {
        var d = { game: game, runId: rid, message: String(message == null ? '未知错误' : message) };
        if (extra && typeof extra === 'object') for (var k in extra) if (!(k in d)) d[k] = extra[k];   // v3.3: {phase:'load', code, chunk, file}
        fire('sim:error', d);
        var w = waiters[rid]; if (w) { delete waiters[rid]; var e = new Error(d.message); e.detail = d; w.rej(e); }
      },
      /** reject a reserved run that will never start (validation error before the computation) */
      abort: function (rid, message, extra) { if (nextId === rid) nextId = null; B.fail(rid, message, extra); },
      /** v3.3: hand over a reserved-but-not-started runId (a computation that fails while loading its chunks) */
      takeReserved: function () { var r = nextId; nextId = null; return r; },
      /** after data load: window.__simPresets = list + sim:presets {game, presets} */
      presets: function (list) {
        var P = jsonClone(Array.isArray(list) ? list : []);
        root.__simPresets = P;
        fire('sim:presets', { game: game, presets: P });
        return P;
      },
      /** page boot: with a share link (#s=…) the default computation is skipped — decode with SimShare and, when ok and no ids are
       *  missing, __simApply it (exactly one computation, runId 'share'); otherwise (no link / decode failure / missing ids / apply
       *  failure) runDefault() once. Always fires sim:share {…decode result, applied} first when a link is present. */
      /** v3.4.1 share-link migration: wraps SimShare.decode once (both the bridge boot path and theme plans.js fromLink call it) so that every
       *  ok result's config = __simMigrateConfig(config, engineVersion of the link).config (fills only keys missing from the link with the
       *  defaults of the link's engine version; unknown/missing version → earliest), plus r.migratedKeys / r.migratedFrom.
       *  Saved local plans (theme store) do not pass through decode and are not migrated (documented limitation). */
      wrapShare: wrapShare,
      shareBoot: function (dataVersion, runDefault) {
        var ran = false;
        function dflt() { if (ran) return; ran = true; if (typeof runDefault === 'function') runDefault(); }
        if (!/[#&]s=/.test(String(location.hash || ''))) { dflt(); return; }
        var go = function () {
          wrapShare();
          if (!root.SimShare || typeof root.SimShare.decode !== 'function' || typeof root.__simApply !== 'function') {
            fire('sim:share', { ok: false, error: 'share-unavailable', missingIds: [], applied: false }); dflt(); return;
          }
          var p;
          try { p = root.SimShare.decode(location.hash, { game: game, dataVersion: dataVersion, engineVersion: ev, findMissingIds: root.__simFindMissingIds }); }
          catch (e) { p = Promise.resolve({ ok: false, error: 'corrupt', missingIds: [] }); }
          Promise.resolve(p).then(null, function () { return { ok: false, error: 'corrupt', missingIds: [] }; }).then(function (r) {
            r = r || { ok: false, error: 'corrupt', missingIds: [] };
            var apply = !!(r.ok && !(r.missingIds && r.missingIds.length));
            r.applied = apply;
            fire('sim:share', r);
            if (!apply) { dflt(); return; }
            ran = true;
            root.__simApply(r.config, { runId: 'share' })['catch'](function (e) {
              fire('sim:share', { ok: false, error: 'apply-failed', message: String(e && e.message || e), missingIds: [], applied: false });
              ran = false; dflt();
            });
          });
        };
        if (root.SimShare || document.readyState === 'complete') go(); else root.addEventListener('load', go);
      }
    };
    return B;
  };
})(typeof window !== 'undefined' ? window : this);
