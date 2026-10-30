
// ---- v3.2 engine events & API (injected by pipeline/build_pages.py; contract: frontend/ww/COMPONENTS.md) ----
function __hsrDetail(r, cfg, ms) {
  var by = {};
  (r.timeline || []).forEach(function (t) {
    if (!t.charId || !t.damage) return;
    var k = t.charId + '|' + (t.action || '') + '|' + (t.skillName || '');
    if (!by[k]) by[k] = { member: t.charId, name: t.actor || charName(t.charId), action: t.action || null, skillName: t.skillName || null, count: 0, damage: 0, zones: null };
    by[k].count += 1; by[k].damage += t.damage;
  });
  return __SIM.clone({
    // v3.3: hsr has no rotation to arrange (actions follow the engine's action policy) → searched false, rotationSource null
    searched: false, rotationSource: null,
    dataVersion: (window.__SIM_DATA__ || {}).version || null, config: cfg,
    summary: { total: r.total, totalAV: r.totalAV, cycles: (S.battle && S.battle.cycles) || null, enemyCount: (S.enemy && S.enemy.count) || 1, ms: ms, byType: r.byType || {} },
    members: (r.byMember || []).map(function (m) { return { id: m.charId, name: m.name, damage: m.damage, share: m.share, actions: m.actions || {} }; }),
    timeline: (r.timeline || []).map(function (t, i) { return { index: i, av: t.av, member: t.charId || null, actor: t.actor || null, action: t.action || null, skillName: t.skillName || null, damage: t.damage || 0 }; }),
    // v3.4: per-hit rows with zones[] {key,name,value,display,mech,confidence}; (base×multiplier+flat)×Π others == value (per target)
    breakdown: { bySkill: Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.damage - a.damage; }), zones: null,
      rows: __hsrRows(r) }
  });
}
function __hsrRows(r) {
  var rows = [];
  (r.timeline || []).forEach(function (t, i) {
    (t.hits || []).forEach(function (h, k) {
      if (!h || !(h.dmg > 0)) return;
      rows.push({ index: rows.length, action: i, member: t.charId || null, name: t.actor || null, skillName: t.skillName || null, hit: (t.skillName || t.action || '命中') + (h.note ? ' · ' + h.note : ''), type: h.note || null,
        targets: h.targets || 1, count: 1, value: h.value != null ? h.value : null, damage: h.dmgRaw != null ? h.dmgRaw : h.dmg, zones: h.zones || null });
    });
  });
  return rows;
}
function __hsrFindMissing(cfg) {
  var D = window.__SIM_DATA__ || DATA, out = [];
  function miss(kind, id, tab) { if (id != null && id !== '' && !(tab && Object.prototype.hasOwnProperty.call(tab, String(id)))) out.push(kind + ':' + id); }
  ((cfg && (cfg.team || cfg.slots)) || []).forEach(function (m) {
    if (!m) return;
    miss('character', m.charId, D.characters);
    if (m.lightcone) miss('lightcone', m.lightcone.id, D.lightcones);
    if (m.relics) { miss('relicSet', m.relics.set4, D.relicSets); miss('relicSet', m.relics.set2, D.relicSets); }
  });
  if (cfg && cfg.enemy) miss('monster', cfg.enemy.monsterId, D.monsters);
  return out.filter(function (x, i) { return out.indexOf(x) === i; });
}
window.__simFindMissingIds = __hsrFindMissing;
// v3.4.1 share-link migration (engine export migrateConfig, hsr_fixes_patch migrate_config; the bridge applies it to decoded links)
window.__simMigrateConfig = function (config, linkEngineVersion) { return E.migrateConfig(config, linkEngineVersion); };
window.__simApply = function (config, opts) {
  opts = opts || {};
  var q = __SIM.request(opts.runId);
  try {
    if (opts.lockRotation) throw new Error('lockRotation 仅鸣潮页面支持（星铁按行动策略自动排轴）');
    // v3.3 opts.search: hsr has no automatic search (action policy) — accepted and ignored, the result still has searched:false
    if (!config || typeof config !== 'object' || !Array.isArray(config.team) || !config.team.length) throw new Error('config.team 必须是非空数组');
    var miss = __hsrFindMissing(config);
    if (miss.length) throw new Error('数据中不存在：' + miss.join(', '));
    loadConfig(__SIM.clone(config)); S.sel = 0; saveState(); renderLeft();
  } catch (e) { __SIM.abort(q.runId, e && e.message || e); return q.promise; }
  runNow();
  return q.promise;
};
