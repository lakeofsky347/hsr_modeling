/* 角色头像占位 .gava + 技能图标 .gskill + 属性图标（window.__simAssets.elementIcons）。
   角色头像 .gava：引擎输出 <span class="gava" data-icon="assets/avatars/<id>.webp" data-el="spectro" data-name="守岸人"></span>
   有图就叠一张 <img>，没图或加载失败退回徽章（属性色底 + 名字首字）。无依赖，ES5。约定见 ../ww/COMPONENTS.md */
(function () {
  'use strict';
  if (window.__gava) return;
  var SEL = '.gava';
  /* 属性别名 -> 规范键。按当前主题优先查，再查通用表；查不到 = 中性灰 */
  var ALIAS = {
    hsr: { physical: 'physical', '物理': 'physical', fire: 'fire', '火': 'fire', ice: 'ice', '冰': 'ice',
      thunder: 'lightning', lightning: 'lightning', '雷': 'lightning', wind: 'wind', '风': 'wind',
      quantum: 'quantum', '量子': 'quantum', imaginary: 'imaginary', '虚数': 'imaginary' },
    endfield: { physical: 'physical', '物理': 'physical', fire: 'heat', heat: 'heat', '灼热': 'heat',
      cryst: 'cryo', cryo: 'cryo', cold: 'cryo', ice: 'cryo', '寒冷': 'cryo',
      pulse: 'electric', electric: 'electric', '电磁': 'electric',
      natural: 'nature', nature: 'nature', '自然': 'nature' },
    ww: { glacio: 'glacio', '冷凝': 'glacio', fusion: 'fusion', '热熔': 'fusion', electro: 'electro', '导电': 'electro',
      aero: 'aero', '气动': 'aero', spectro: 'spectro', '衍射': 'spectro', havoc: 'havoc', '湮灭': 'havoc',
      physical: 'physical', '物理': 'physical',
      ice: 'glacio', fire: 'fusion', heat: 'fusion', thunder: 'electro', lightning: 'electro', wind: 'aero' }
  };
  function theme() { return document.documentElement.getAttribute('data-theme') || ''; }
  function normEl(v) {
    if (!v) return '';
    var k = String(v).replace(/^\s+|\s+$/g, ''), lk = k.toLowerCase(), t = ALIAS[theme()], g;
    if (t && (t[lk] || t[k])) return t[lk] || t[k];
    for (g in ALIAS) if (ALIAS.hasOwnProperty(g) && (ALIAS[g][lk] || ALIAS[g][k])) return ALIAS[g][lk] || ALIAS[g][k];
    return '';
  }
  /* 首个字素：跳过开头的括号/标点/空白；拉丁字母转大写 */
  var seg = null;
  try { if (window.Intl && Intl.Segmenter) seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' }); } catch (e) {}
  var SKIP = /^[\s\u00b7\u30fb\u2027·・.,，。:：;；'"“”‘’「」『』《》〈〉()（）\[\]【】{}<>\-–—_~!?！？#*]$/;
  function firstGlyph(name) {
    name = String(name || '');
    var parts = [], i, it, r, cc;
    if (seg) { it = seg.segment(name)[Symbol.iterator](); while (!(r = it.next()).done) { parts.push(r.value.segment); if (parts.length > 8) break; } }
    else {
      for (i = 0; i < name.length && parts.length <= 8; i++) {
        cc = name.charCodeAt(i);
        if (cc >= 0xd800 && cc <= 0xdbff && i + 1 < name.length) { parts.push(name.substr(i, 2)); i++; }
        else parts.push(name.charAt(i));
      }
    }
    for (i = 0; i < parts.length; i++) if (!SKIP.test(parts[i])) return parts[i].toUpperCase();
    return '?';
  }
  function badge(el, glyph) {
    var t = document.createElement('b');
    t.className = 'gava-t'; t.setAttribute('aria-hidden', 'true'); t.textContent = glyph;
    return t;
  }
  function fill(el) {
    var icon = el.getAttribute('data-icon') || '', name = el.getAttribute('data-name') || '',
      rawEl = el.getAttribute('data-el') || '', key = icon + '|' + name + '|' + rawEl + '|' + theme();
    if (el.getAttribute('data-gava') === key) return;          // 已处理且没变
    el.setAttribute('data-gava', key);
    var ne = normEl(rawEl);
    if (ne) el.setAttribute('data-gava-el', ne); else el.removeAttribute('data-gava-el');
    el.setAttribute('role', 'img');
    if (name) { el.setAttribute('aria-label', name); if (!el.getAttribute('title')) el.setAttribute('title', name); }
    while (el.firstChild) el.removeChild(el.firstChild);
    el.appendChild(badge(el, firstGlyph(name)));
    el.classList.remove('gava-img'); el.classList.remove('gava-loaded'); el.classList.remove('gava-err');
    if (!icon) return;
    var img = document.createElement('img');
    img.alt = name; img.setAttribute('loading', 'lazy'); img.setAttribute('decoding', 'async'); img.draggable = false;
    img.onload = function () { if (img.parentNode === el) el.classList.add('gava-loaded'); };
    img.onerror = function () {
      if (img.parentNode !== el) return;
      el.removeChild(img); el.classList.remove('gava-img'); el.classList.remove('gava-loaded'); el.classList.add('gava-err');
    };
    el.classList.add('gava-img');
    el.appendChild(img);
    img.src = icon;
  }
  function scan(root) {
    root = root || document;
    if (root.nodeType === 1 && root.matches && root.matches(SEL)) fill(root);
    if (!root.querySelectorAll) return;
    var list = root.querySelectorAll(SEL), i;
    for (i = 0; i < list.length; i++) fill(list[i]);
  }
  var pending = [], queued = false;
  function flush() {
    queued = false;
    var p = pending; pending = [];
    for (var i = 0; i < p.length; i++) if (p[i].isConnected !== false) { scan(p[i]); scanAll(p[i]); }
  }
  function push(n) { pending.push(n); if (!queued) { queued = true; (window.requestAnimationFrame || setTimeout)(flush); } }
  function start() {
    scan(document); scanAll(document);
    if (!window.MutationObserver) return;
    new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) {
        var m = ms[i], j, n;
        if (m.type === 'attributes') {
          if (m.target === document.documentElement) push(document);       // 切主题：重新归一属性
          else if (m.target.matches && (m.target.matches(SEL) || m.target.matches(SK))) push(m.target);
        } else for (j = 0; j < m.addedNodes.length; j++) { n = m.addedNodes[j]; if (n.nodeType === 1) push(n); }
      }
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['data-icon', 'data-name', 'data-el', 'data-kind', 'class', 'data-theme'] });
  }

  /* ================= 图标着色：分析一次图片，决定怎么上色 =================
     遮罩（mask）= 只取形状，颜色由 CSS 给（属性色 / 主题色），所以白色线稿、白色徽记都能染色。
     - 纯白 / 单色图（鸣潮技能图标、鸣潮物理图标）→ 直接拿原图当 alpha 遮罩
     - “彩色圆底 + 白色徽记”（鸣潮其余属性图标）→ 生成一张只保留白色部分的遮罩，避免染成实心圆
     - 纯彩色图（星铁属性图标）→ 用原图的形状当遮罩，再染属性色
     结果按 URL 缓存；图片加载失败返回 null，调用方退回自绘符号。 */
  var ICON = {};
  function analyze(url, cb) {
    var c = ICON[url];
    if (c && c.done) return cb(c.res);
    if (c) { c.q.push(cb); return; }
    c = ICON[url] = { done: false, q: [cb], res: null };
    var img = new Image();
    function finish(res) { c.done = true; c.res = res; var q = c.q; c.q = []; for (var i = 0; i < q.length; i++) q[i](res); }
    img.onload = function () {
      /* 遮罩写进 CSS 变量，var() 里的相对 url 会按样式表位置解析（assets/theme/），所以这里转成绝对地址 */
      var abs = url; try { abs = new URL(url, document.baseURI).href; } catch (e) {}
      var res = { url: url, mask: 'url("' + abs.replace(/"/g, '%22') + '")', mode: 'alpha' };
      try {
        var N = 64, cv = document.createElement('canvas'); cv.width = cv.height = N;
        var g = cv.getContext('2d'); g.drawImage(img, 0, 0, N, N);
        var d = g.getImageData(0, 0, N, N), px = d.data, op = 0, wh = 0, col = 0, i, r, gg, b, mx, mn;
        for (i = 0; i < px.length; i += 4) {
          if (px[i + 3] < 100) continue; op++;
          r = px[i]; gg = px[i + 1]; b = px[i + 2]; mx = Math.max(r, gg, b); mn = Math.min(r, gg, b);
          if (mx > 190 && (mx - mn) / (mx || 1) < 0.18) wh++; else if ((mx - mn) / (mx || 1) > 0.3) col++;
        }
        if (op && col / op > 0.25 && wh / op > 0.06) {               // 彩色底 + 白徽记：只留白色部分
          for (i = 0; i < px.length; i += 4) {
            mn = Math.min(px[i], px[i + 1], px[i + 2]);
            px[i + 3] = Math.round(px[i + 3] * Math.max(0, Math.min(1, (mn / 255 - 0.6) / 0.3)));
            px[i] = px[i + 1] = px[i + 2] = 255;
          }
          g.putImageData(d, 0, 0); res.mask = 'url("' + cv.toDataURL('image/png') + '")'; res.mode = 'knockout';
        }
      } catch (e) { /* 跨域等读不到像素：按原图形状遮罩 */ }
      finish(res);
    };
    img.onerror = function () { finish(null); };
    img.src = url;
  }

  /* ================= 技能图标 .gskill =================
     <span class="gskill sm|md" data-icon="assets/skills/<id>.webp" data-kind="basic|skill|ult|intro|outro|forte|passive|tune" data-el="spectro" data-name="流光夕影">
     有图：图片当遮罩，底色 = 属性色（没有属性时用主题色），不垫深色底板；没图 / 加载失败：按 data-kind 显示自绘几何符号。 */
  var SK = '.gskill';
  function fillSkill(el) {
    var icon = el.getAttribute('data-icon') || '', kind = el.getAttribute('data-kind') || '', rawEl = el.getAttribute('data-el') || '',
      name = el.getAttribute('data-name') || '', key = icon + '|' + kind + '|' + rawEl + '|' + theme();
    if (el.getAttribute('data-gskill') === key) return;
    el.setAttribute('data-gskill', key);
    var ne = normEl(rawEl);
    if (ne) el.setAttribute('data-gskill-el', ne); else el.removeAttribute('data-gskill-el');
    el.setAttribute('role', 'img'); if (name) { el.setAttribute('aria-label', name); if (!el.getAttribute('title')) el.setAttribute('title', name); }
    el.classList.remove('gskill-on'); el.style.removeProperty('--gskill-m');
    if (!icon) return;
    analyze(icon, function (res) {
      if (el.getAttribute('data-gskill') !== key) return;
      if (!res) { el.classList.add('gskill-err'); return; }
      el.style.setProperty('--gskill-m', res.mask); el.classList.add('gskill-on');
    });
  }

  /* ================= 属性图标 =================
     引擎在 window.__simAssets = { elementIcons: { <data-el 原值>: "assets/elements/<key>.webp" } } 里给出（可晚于本脚本，
     赋值后派发 document 事件 "sim:assets"）。有图标时：
     - 鸣潮 .ww-el（及所有 [data-el] 下的自绘符号）：把 --el-icon 换成官方图标遮罩，颜色仍是属性色
     - 星铁 span.dot（引擎的属性小圆点，引擎给了 data-el 的才算；图例里的类型 / 成员色点没有 data-el，不动）：换成属性色图标
     - 通用 <i class="gel" data-el="…">：主题脚本自用
     空表（终末地）或没有 __simAssets：保持原来的纯色点 / 自绘符号。 */
  var EL_URL = null, EL_RES = {};
  function elKeyOf(n) { return n.getAttribute('data-el') || ''; }
  function fillDot(n) {
    if (!EL_URL) return;
    var k = normEl(elKeyOf(n)), r = k && EL_RES[k];
    if (!r || n.getAttribute('data-gel') === k) return;
    n.setAttribute('data-gel', k); n.style.setProperty('--gel-m', r.mask); n.classList.add('gel-on');
  }
  function scanEl(root) {
    if (!EL_URL || !root.querySelectorAll) return;
    var sel = '.gel' + (theme() === 'hsr' ? ',span.dot[data-el]' : ''), l = root.querySelectorAll(sel), i;
    if (root.matches && root.matches(sel)) fillDot(root);
    for (i = 0; i < l.length; i++) fillDot(l[i]);
  }
  function loadElementIcons() {
    var A = window.__simAssets, M = A && A.elementIcons, ks, css = [], left;
    if (!M || typeof M !== 'object' || EL_URL) return !!EL_URL;
    ks = Object.keys(M).filter(function (k) { return typeof M[k] === 'string' && M[k]; });
    if (!ks.length) return true;                                   // 空表：保持纯色点
    EL_URL = M; left = ks.length;
    ks.forEach(function (raw) {
      analyze(M[raw], function (res) {
        var nk = normEl(raw);
        if (res) {
          if (nk) EL_RES[nk] = res;
          var sels = ['[data-el="' + raw + '"]'];
          if (nk && nk !== raw) sels.push('[data-el="' + nk + '"]');
          css.push(sels.map(function (s) { return 'html[data-gel-ready] ' + s; }).join(',') + '{--el-icon:' + res.mask + '}');
        }
        if (--left === 0) {
          var st = document.getElementById('gel-css') || document.createElement('style');
          st.id = 'gel-css'; st.textContent = css.join('\n'); (document.head || document.documentElement).appendChild(st);
          document.documentElement.setAttribute('data-gel-ready', '');
          scanEl(document);
        }
      });
    });
    return true;
  }
  (function waitAssets(n) { if (!loadElementIcons() && n < 120) setTimeout(function () { waitAssets(n + 1); }, 500); })(0);
  document.addEventListener('sim:assets', function () {          // 引擎设置 / 更新 __simAssets 后派发：重新套用
    EL_URL = null; EL_RES = {}; document.documentElement.removeAttribute('data-gel-ready');
    var l = document.querySelectorAll('[data-gel]'), i;
    for (i = 0; i < l.length; i++) { l[i].removeAttribute('data-gel'); l[i].classList.remove('gel-on'); l[i].style.removeProperty('--gel-m'); }
    loadElementIcons();
  });

  function scanAll(root) {
    root = root || document;
    if (root.nodeType === 1 && root.matches && root.matches(SK)) fillSkill(root);
    if (root.querySelectorAll) { var l = root.querySelectorAll(SK), i; for (i = 0; i < l.length; i++) fillSkill(l[i]); }
    scanEl(root);
  }
  window.__gava = { refresh: function (root) { scan(root || document); scanAll(root || document); }, normEl: normEl, firstGlyph: firstGlyph, analyze: analyze };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
