/* plans-drawer.js — 「方案」抽屉（本地保存 / 套用 / 删除 / 导入导出），第一次点「方案」时由 plans.js 按需加载。约定见 ../ww/COMPONENTS.md。 */
(function () {
  var P = window.__gplans, K = P && P._k; if (!K || window.__gplansDrawer) return;
  function canStore() { try { var k = '__gplans_probe'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch (e) { return false; } }
  function dt(ts) { var d = new Date(ts); if (isNaN(d)) return ''; var p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  var G = K.G, D = document, esc = G.esc, game = K.game, GAME_ZH = K.GAME_ZH, S = K.S, cur = K.cur, canApply = K.canApply, applyCfg = K.applyCfg;
  var dr = null, scrim = null, opener = null, confirmDel = null;
  function closeDrawer() {
    if (!dr) return; dr.remove(); scrim.remove(); dr = scrim = null; D.documentElement.classList.remove('gplans-open');
    if (opener && opener.isConnected) try { opener.focus({ preventScroll: true }); } catch (e) {}
  }
  function defaultName() {
    var d = G.last, ms = d && Array.isArray(d.members) ? d.members.map(function (m) { return m && m.name; }).filter(Boolean) : [];
    return (ms.length ? ms.slice(0, 4).join('/') : GAME_ZH[game] || '方案') + ' · ' + dt(Date.now()).slice(5);
  }
  function drawerHtml() {
    var store = canStore(), ss = S(), c = cur(), vNow = G.dataVersion();
    var list = ss && store ? ss.store.list(game) : [];
    var h = '<header class="gplans-h"><b>我的方案</b><small>' + esc(GAME_ZH[game] || '') + ' · 存在本机浏览器</small><button type="button" class="gplans-x" aria-label="关闭">×</button></header><div class="gplans-b">';
    if (!ss) h += '<div class="gplans-msg err">分享模块（share.js）没有加载，方案功能不可用。</div>';
    else if (!store) h += '<div class="gplans-msg err">浏览器禁止了本地存储（可能是隐私 / 无痕模式），方案无法保存；可以用「分享」链接保存配置。</div>';
    h += '<form class="gplans-save"><input name="nm" maxlength="60" placeholder="方案名称" value="' + esc(defaultName()) + '"' + (c && store && ss ? '' : ' disabled') + ' aria-label="方案名称">' +
      '<button type="submit"' + (c && store && ss ? '' : ' disabled') + '>保存当前</button></form>';
    if (!c) h += '<div class="gplans-msg">运行一次模拟后才能保存当前配置。</div>';
    h += '<ul class="gplans-list">' + (list.length ? list.map(function (p) {
      var old = vNow && p.dataVersion && p.dataVersion !== vNow;
      return '<li data-id="' + esc(p.id) + '"><div class="nm"><b title="' + esc(p.name) + '">' + esc(p.name) + '</b><small>' + esc(dt(p.savedAt)) + (p.dataVersion ? ' · 数据 ' + esc(p.dataVersion) : '') + (old ? ' <span class="gplans-old" title="保存时的数据版本与当前不同，套用时按当前版本计算">旧版本</span>' : '') + '</small></div>' +
        '<button type="button" data-do="apply"' + (canApply() ? '' : ' disabled title="页面引擎还没有提供 __simApply"') + '>套用</button>' +
        '<button type="button" data-do="del" class="' + (confirmDel === p.id ? 'confirm' : '') + '">' + (confirmDel === p.id ? '确认删除' : '删除') + '</button></li>';
    }).join('') : '<li class="empty">还没有保存的方案</li>') + '</ul></div>';
    h += '<footer class="gplans-f"><button type="button" data-do="export"' + (ss && list.length ? '' : ' disabled') + '>导出 JSON</button>' +
      '<label class="gplans-imp' + (ss && store ? '' : ' disabled') + '"><input type="file" accept=".json,application/json"' + (ss && store ? '' : ' disabled') + '>导入 JSON</label></footer>';
    return h;
  }
  function renderDrawer() {
    if (!dr) return;
    var focusId = D.activeElement && D.activeElement.closest && D.activeElement.closest('li[data-id]') ? D.activeElement.closest('li[data-id]').getAttribute('data-id') : null;
    dr.innerHTML = drawerHtml();
    dr.querySelector('.gplans-x').onclick = closeDrawer;
    var f = dr.querySelector('.gplans-save');
    f.onsubmit = function (ev) {
      ev.preventDefault(); var c = cur(); if (!c) return;
      var nm = f.nm.value.trim() || defaultName();
      try { S().store.save(game, nm, { dataVersion: c.dataVersion, engineVersion: c.engineVersion || null, config: c.config }); G.toast('已保存「' + nm + '」'); }
      catch (e) { G.toast('保存失败：' + (/存储/.test(e && e.message) ? '浏览器禁止本地存储（隐私模式或空间已满）' : (e && e.message || e)), 'err'); }
      renderDrawer();
    };
    Array.prototype.forEach.call(dr.querySelectorAll('li[data-id] button'), function (b) {
      b.onclick = function () {
        var id = b.closest('li').getAttribute('data-id'), p = S().store.list(game).filter(function (x) { return x.id === id; })[0]; if (!p) return;
        if (b.getAttribute('data-do') === 'apply') {
          var mc = window.__simMigrateConfig, m = null;   // v3.4.1：本地方案按保存时的引擎版本补缺省值（只补缺的键）
          try { m = typeof mc === 'function' ? mc(p.config, p.engineVersion || null) : null; } catch (e) { m = null; }
          if (K.migLines) K.migLines(m ? { ok: true, config: m.config, migratedKeys: m.filled, migrationNotices: m.notices || [], engineVersion: p.engineVersion || null } : null, '此方案');
          applyCfg(m ? m.config : p.config, 'plan:' + id).then(function () {
            var v = G.dataVersion(); G.toast('已套用「' + p.name + '」' + (v && p.dataVersion && v !== p.dataVersion ? '，已按当前版本 ' + v + ' 计算' : ''));
          }, function (e) { G.toast('套用失败：' + (e && e.message || e), 'err'); });
          closeDrawer();
        } else if (confirmDel !== id) { confirmDel = id; renderDrawer(); }
        else { confirmDel = null; if (!S().store.remove(game, id)) G.toast('删除失败：浏览器禁止本地存储', 'err'); else G.toast('已删除「' + p.name + '」'); renderDrawer(); }
      };
    });
    var ex = dr.querySelector('[data-do=export]');
    if (ex) ex.onclick = function () {
      var txt = S().store.exportJSON(game), a = D.createElement('a');
      a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' }));
      a.download = 'sim-' + game + '-plans-' + dt(Date.now()).slice(0, 10).replace(/-/g, '') + '.json';
      D.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
      G.toast('已导出 ' + S().store.list(game).length + ' 个方案');
    };
    var fi = dr.querySelector('.gplans-imp input');
    if (fi) fi.onchange = function () {
      var file = fi.files && fi.files[0]; if (!file) return;
      var rd = new FileReader();
      rd.onload = function () {
        var r = S().store.importJSON(game, String(rd.result || '')), msg = {
          'invalid-json': '文件不是合法的 JSON', 'invalid-format': '这不是方案文件（需要「导出 JSON」生成的文件）',
          'game-mismatch': '这是其他游戏的方案文件，请到对应页面导入', 'storage-unavailable': '浏览器禁止本地存储（隐私模式或空间已满），没有导入'
        }[r.error];
        if (r.error) G.toast('导入失败：' + (msg || r.error), 'err');
        else G.toast('导入 ' + r.added + ' 个方案' + (r.skipped ? '，跳过 ' + r.skipped + ' 个（已存在或无配置）' : ''), r.added ? '' : 'warn');
        renderDrawer();
      };
      rd.onerror = function () { G.toast('读取文件失败', 'err'); };
      rd.readAsText(file);
    };
    if (focusId) { var li = dr.querySelector('li[data-id="' + focusId + '"] button[data-do=del]'); if (li) li.focus(); }
  }
  function openDrawer(btn) {
    if (dr) { closeDrawer(); return; }
    opener = btn; confirmDel = null;
    scrim = D.createElement('div'); scrim.className = 'gplans-scrim'; scrim.onclick = closeDrawer;
    dr = D.createElement('aside'); dr.className = 'gplans'; dr.setAttribute('role', 'dialog'); dr.setAttribute('aria-modal', 'true'); dr.setAttribute('aria-label', '我的方案'); dr.tabIndex = -1;
    D.body.appendChild(scrim); D.body.appendChild(dr); D.documentElement.classList.add('gplans-open');
    renderDrawer();
    var first = dr.querySelector('input:not([disabled]),button:not([disabled])'); try { (first || dr).focus({ preventScroll: true }); } catch (e) {}
  }
  D.addEventListener('keydown', function (ev) {
    if (!dr) return;
    if (ev.key === 'Escape') { ev.stopPropagation(); closeDrawer(); return; }
    if (ev.key === 'Tab') {
      var f = dr.querySelectorAll('input:not([disabled]),button:not([disabled])'); if (!f.length) return;
      if (ev.shiftKey && D.activeElement === f[0]) { ev.preventDefault(); f[f.length - 1].focus(); }
      else if (!ev.shiftKey && D.activeElement === f[f.length - 1]) { ev.preventDefault(); f[0].focus(); }
    }
  }, true);
  G.on('result', function () { if (dr) renderDrawer(); });
  window.__gplansDrawer = { open: openDrawer, close: closeDrawer };
})();
