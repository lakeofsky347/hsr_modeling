/* share.js — 分享链接与本地方案（纯前端，无后端）
 * 挂到 window.SimShare。格式：#s=v1.<deflate-raw + base64url>，
 * 浏览器不支持 CompressionStream 时退回 #s=v1u.<base64url 未压缩>，解码两种都认。
 * payload = { g: game, d: dataVersion, c: config }
 */
(function (root) {
  'use strict';
  var PREFIX = '#s=';
  var HAS_CS = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

  function b64urlFromBytes(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function bytesFromB64url(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    var bin = atob(str), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function pipe(bytes, stream) {
    return new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()
      .then(function (b) { return new Uint8Array(b); });
  }

  /** encode({game, dataVersion, engineVersion?, config}) -> Promise<'#s=v1.…'> */
  function encode(p) {
    if (!p || !p.game || p.config == null) return Promise.reject(new Error('encode: game 和 config 必填'));
    var raw = new TextEncoder().encode(JSON.stringify(p.engineVersion ? { g: p.game, d: p.dataVersion || null, e: p.engineVersion, c: p.config } : { g: p.game, d: p.dataVersion || null, c: p.config }));
    if (!HAS_CS) return Promise.resolve(PREFIX + 'v1u.' + b64urlFromBytes(raw));
    return pipe(raw, new CompressionStream('deflate-raw'))
      .then(function (z) { return PREFIX + 'v1.' + b64urlFromBytes(z); });
  }

  /** decode(hash, opts?) -> Promise<{ok, game, dataVersion, config, versionMismatch, missingIds, error?}>
   * opts.game            当前页面的游戏，链接游戏不同则 ok=false, error='game-mismatch'
   * opts.dataVersion     当前数据版本，不一致时 versionMismatch=true（仍 ok）
 * opts.engineVersion   当前引擎版本，链接里带 e 且不一致时 engineMismatch=true（仍 ok）；旧链接没有 e，视为不知道，不报
   * opts.findMissingIds  (config) => string[]，由引擎提供，列出当前数据里已不存在的 id
   * 没有 #s= 时返回 { ok:false, error:'empty' }，页面照常加载默认配置即可。
   */
  function decode(hash, opts) {
    opts = opts || {};
    var fail = function (e) { return { ok: false, error: e, missingIds: [] }; };
    hash = String(hash || '');
    var i = hash.indexOf(PREFIX.slice(1));
    if (i < 0) return Promise.resolve(fail('empty'));
    var body = hash.slice(i + 2).split('&')[0];
    var dot = body.indexOf('.');
    var ver = body.slice(0, dot), data = body.slice(dot + 1);
    var p;
    try {
      var bytes = bytesFromB64url(data);
      if (ver === 'v1u') p = Promise.resolve(bytes);
      else if (ver === 'v1') {
        if (!HAS_CS) return Promise.resolve(fail('unsupported-browser'));
        p = pipe(bytes, new DecompressionStream('deflate-raw'));
      } else return Promise.resolve(fail('unknown-format'));
    } catch (e) { return Promise.resolve(fail('corrupt')); }
    return p.then(function (b) {
      var o = JSON.parse(new TextDecoder().decode(b));
      if (!o || !o.g || o.c == null) return fail('corrupt');
      if (opts.game && opts.game !== o.g) return Object.assign(fail('game-mismatch'), { game: o.g });
      var missing = [];
      if (typeof opts.findMissingIds === 'function') {
        try { missing = opts.findMissingIds(o.c) || []; } catch (e) { missing = []; }
      }
      return {
        ok: true, game: o.g, dataVersion: o.d, config: o.c,
        versionMismatch: !!(opts.dataVersion && o.d && opts.dataVersion !== o.d),
        engineVersion: o.e || null,
        engineMismatch: !!(opts.engineVersion && o.e && opts.engineVersion !== o.e),
        missingIds: missing
      };
    }, function () { return fail('corrupt'); }).catch(function () { return fail('corrupt'); });
  }

  /** shareUrl(p) -> Promise<完整链接>，基于当前地址去掉旧 hash */
  function shareUrl(p) {
    return encode(p).then(function (h) { return location.href.split('#')[0] + h; });
  }

  // ---- 本地方案：localStorage key = sim:<game>:plans，值为数组 ----
  function key(g) { return 'sim:' + g + ':plans'; }
  function read(g) {
    try { var v = JSON.parse(localStorage.getItem(key(g)) || '[]'); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function write(g, arr) {
    try { localStorage.setItem(key(g), JSON.stringify(arr)); return true; }
    catch (e) { return false; } // 隐私模式或配额满
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  var store = {
    /** -> [{id, name, savedAt, dataVersion, engineVersion, config}]，按保存时间倒序；engineVersion 为 null 表示 v3.4.1 之前保存 */
    list: function (g) { return read(g).sort(function (a, b) { return b.savedAt - a.savedAt; }); },
    /** save(game, name, {dataVersion, engineVersion, config}, id?) -> 方案对象；传 id 则覆盖同名方案 */
    save: function (g, name, payload, id) {
      var arr = read(g), now = Date.now();
      var plan = { id: id || uid(), name: String(name || '未命名方案'), savedAt: now,
        dataVersion: payload && payload.dataVersion || null,
        engineVersion: payload && payload.engineVersion || null, // v3.4.1：旧方案没有这个字段，按最早版本迁移
        config: payload && payload.config };
      var idx = arr.findIndex(function (x) { return x.id === plan.id; });
      if (idx >= 0) arr[idx] = plan; else arr.push(plan);
      if (!write(g, arr)) throw new Error('本地存储不可用');
      return plan;
    },
    remove: function (g, id) { return write(g, read(g).filter(function (x) { return x.id !== id; })); },
    /** -> JSON 字符串，可直接存成 .json 文件 */
    exportJSON: function (g) {
      return JSON.stringify({ format: 'sim-plans', v: 1, game: g, exportedAt: new Date().toISOString(), plans: read(g) }, null, 2);
    },
    /** importJSON(game, text) -> {added, skipped, error?}；同 id 不重复导入，游戏不符则拒绝 */
    importJSON: function (g, text) {
      var o;
      try { o = JSON.parse(text); } catch (e) { return { added: 0, skipped: 0, error: 'invalid-json' }; }
      if (!o || o.format !== 'sim-plans' || !Array.isArray(o.plans)) return { added: 0, skipped: 0, error: 'invalid-format' };
      if (o.game && o.game !== g) return { added: 0, skipped: 0, error: 'game-mismatch' };
      var arr = read(g), have = {}, added = 0, skipped = 0;
      arr.forEach(function (x) { have[x.id] = 1; });
      o.plans.forEach(function (p) {
        if (!p || p.config == null || have[p.id]) { skipped++; return; }
        arr.push({ id: p.id || uid(), name: String(p.name || '导入方案'), savedAt: p.savedAt || Date.now(),
          dataVersion: p.dataVersion || null, engineVersion: p.engineVersion || null, config: p.config });
        have[p.id] = 1; added++;
      });
      if (!write(g, arr)) return { added: 0, skipped: skipped, error: 'storage-unavailable' };
      return { added: added, skipped: skipped };
    }
  };

  root.SimShare = { encode: encode, decode: decode, shareUrl: shareUrl, store: store, compressed: HAS_CS };
})(typeof window !== 'undefined' ? window : globalThis);
