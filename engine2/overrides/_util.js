// engine2/overrides/_util.js —— override 共用小工具（纯函数，无状态）

// 按技能 id 找 kit 中的技能
export function skillById(kit, id) {
  return (kit.skills || []).find(function (s) { return String(s.id) === String(id); }) || null;
}
export function skillBySlot(kit, slot) {
  return (kit.skills || []).find(function (s) { return s.slot === slot; }) || null;
}

// 删除 kit 中满足 pred(effect, owner) 的效果（技能/行迹/星魂）
export function dropEffects(kit, pred) {
  (kit.skills || []).forEach(function (s) { s.effects = (s.effects || []).filter(function (e) { return !pred(e, s); }); });
  (kit.traces || []).forEach(function (t) { t.effects = (t.effects || []).filter(function (e) { return !pred(e, t); }); });
  (kit.eidolons || []).forEach(function (r) { r.effects = (r.effects || []).filter(function (e) { return !pred(e, r); }); });
  return kit;
}
// 清空某些技能的自动解析效果 / 伤害段
export function clearSkill(kit, ids, what) {
  ids.forEach(function (id) {
    var s = skillById(kit, id);
    if (!s) return;
    if (!what || what === 'hits' || what === 'all') s.hits = [];
    if (!what || what === 'effects' || what === 'all') s.effects = [];
  });
  return kit;
}
export function clearTraces(kit) { (kit.traces || []).forEach(function (t) { t.effects = []; }); return kit; }
export function clearEidolons(kit, ranks) {
  (kit.eidolons || []).forEach(function (r) { if (!ranks || ranks.indexOf(r.rank) >= 0) r.effects = []; });
  return kit;
}

// 技能在某成员下的等级（与 engine2/effects.js skillLevel 同规则：member.skillLevels + 星魂 3/5 加级，受 params 长度限制）
var LV_KEY = { basic: 'basic', enhancedBasic: 'basic', skill: 'skill', enhancedSkill: 'skill', ult: 'ult', talent: 'talent', elation: 'elation' };
export function levelOf(kit, member, skill, levelKey) {
  var key = levelKey || LV_KEY[skill.slot] || skill.slot;
  var lv = (member && member.skillLevels && member.skillLevels[key]) || skill.defaultLevel || skill.maxLevel || 1;
  var bonus = 0;
  (kit.eidolons || []).forEach(function (r) {
    if (r.rank <= ((member && member.eidolon) || 0) && r.skillLevelUp && r.skillLevelUp[key]) bonus += r.skillLevelUp[key];
  });
  var n = (skill.params && skill.params.length) || 1;
  return Math.max(1, Math.min(lv + bonus, n));
}
// 技能参数（按等级）
export function paramsOf(kit, member, id, levelKey) {
  var s = skillById(kit, id);
  if (!s || !s.params || !s.params.length) return [];
  var p = s.params[levelOf(kit, member, s, levelKey) - 1];
  return Array.isArray(p) ? p : s.params;
}
// 行迹 / 星魂参数
export function traceParams(kit, name) {
  var t = (kit.traces || []).find(function (x) { return x.name === name; });
  if (!t || !t.params) return [];
  return Array.isArray(t.params[0]) ? t.params[0] : t.params;
}
export function eidolonParams(kit, rank) {
  var r = (kit.eidolons || []).find(function (x) { return x.rank === rank; });
  if (!r || !r.params) return [];
  return Array.isArray(r.params[0]) ? r.params[0] : r.params;
}

export function note(kit, text) { (kit.notes = kit.notes || []).push('override：' + text); return kit; }
export function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }

// 组合多个 hooks 对象：同名 hook 依次调用；返回值取最后一个非 undefined
export function composeHooks() {
  var list = Array.prototype.slice.call(arguments).filter(Boolean);
  var out = {};
  list.forEach(function (h) {
    Object.keys(h).forEach(function (k) {
      var prev = out[k], fn = h[k];
      if (typeof fn !== 'function') return;
      out[k] = prev ? function (api) { var a = prev(api); var b = fn(api); return b === undefined ? a : b; } : fn;
    });
  });
  return out;
}
