// ============================================================================
// 专属光锥：数据解析 + 属性/机制应用
// 数据源：engine/lightconedata.js（由 scripts/gen_lightcone_data.mjs 从站点数据生成）
//   levels[叠影-1] = 该叠影下的参数数组，与 desc 中的 #1 #2 ... 一一对应
// 四把专属光锥（均为「欢愉」命途 5★）：
//   23057 欢迎来到银河城（银狼LV.999）· 稳赢
//   23053 花花世界迷人眼（火花）      · 瞩目
//   23055 献给明日的色彩（真珠）      · 挥墨
//   23065 当第一声「阿哈」响起（阿哈）· 即兴巡演
// ============================================================================
import { LIGHTCONES, SIGNATURE_LIGHTCONE } from './lightconedata.js';

export { LIGHTCONES, SIGNATURE_LIGHTCONE };

// 解析某角色应装备的光锥（cfg.characters[id].lightcone = { id, superimpose }）
export function resolveLightcone(avatarId, charCfg) {
  var conf = (charCfg && charCfg.lightcone) || {};
  var id = conf.id === undefined || conf.id === null ? SIGNATURE_LIGHTCONE[avatarId] : String(conf.id);
  if (!id || id === 'none' || conf.enabled === false) return null;
  var data = LIGHTCONES[id];
  if (!data) return null;
  var sp = Math.max(1, Math.min(5, Number(conf.superimpose) || 1));
  return {
    id: id,
    name: data.name,
    passive: data.passive,
    desc: data.desc,
    rarity: data.rarity,
    path: data.path,
    superimpose: sp,
    params: data.levels[sp - 1] || data.levels[0] || [],
    stats: data.stats
  };
}

// 参数取值（越界返回 0）
export function lcParam(lc, index) {
  if (!lc || !lc.params) return 0;
  var v = lc.params[index];
  return typeof v === 'number' ? v : 0;
}

// 光锥基础属性并入面板：先加固定值，再乘百分比加成（与游戏内算法一致）
// 返回加成明细，便于 UI/CLI 展示
export function applyLightconeStats(unit, lc) {
  if (!lc) return null;
  var p = lc.params;
  var bonus = { hp: lc.stats.hp, atk: lc.stats.atk, def: lc.stats.def,
                defPct: 0, critDmg: 0, spdFlat: 0, spdPct: 0, critRate: 0, elationDegree: 0 };
  if (lc.id === '23055') bonus.defPct = p[0];          // 挥墨：防御力提高 48%（S1）
  if (lc.id === '23053') bonus.critDmg = p[0];        // 瞩目：暴击伤害提高 48%（S1）
  if (lc.id === '23057') bonus.spdPct = p[0];         // 稳赢：速度提高 18%（S1）
  if (lc.id === '23065') bonus.spdFlat = p[0];        // 即兴巡演：基础速度提高 12 点（S1）
  unit.stats.hp += bonus.hp;
  unit.stats.atk += bonus.atk;
  unit.stats.def += bonus.def;
  if (bonus.defPct) unit.stats.def = unit.stats.def * (1 + bonus.defPct);
  if (bonus.critDmg) unit.stats.critDmg += bonus.critDmg;
  if (bonus.spdFlat) unit.stats.spd += bonus.spdFlat;
  if (bonus.spdPct) unit.stats.spd = unit.stats.spd * (1 + bonus.spdPct);
  unit.stats.spd = Math.round(unit.stats.spd * 100) / 100;
  unit.stats.atk = Math.round(unit.stats.atk * 10) / 10;
  unit.stats.def = Math.round(unit.stats.def * 10) / 10;
  unit.stats.hp = Math.round(unit.stats.hp * 10) / 10;
  bonus.totalSpd = unit.stats.spd;
  return bonus;
}

// 光锥一览（UI 用）：当前是否装备、叠影、效果原文、满级属性
export function lightconeInfo(avatarId, cfg) {
  var charCfg = cfg && cfg.characters ? cfg.characters[avatarId] : null;
  var cur = resolveLightcone(avatarId, charCfg);
  var sigId = SIGNATURE_LIGHTCONE[avatarId];
  var data = LIGHTCONES[sigId];
  var out = [];
  if (data) {
    out.push({ id: sigId, name: data.name, passive: data.passive, desc: data.desc,
               rarity: data.rarity, stats: data.stats, signature: true,
               equipped: !!cur && cur.id === sigId, superimpose: cur && cur.id === sigId ? cur.superimpose : 0,
               params: cur && cur.id === sigId ? cur.params : null });
  }
  out.push({ id: 'none', name: '不带光锥', passive: '', desc: '仅使用角色面板属性（可手动填写替代光锥的数值）',
             rarity: 0, stats: { hp: 0, atk: 0, def: 0 }, signature: false,
             equipped: !cur, superimpose: 0, params: null });
  return { current: cur ? cur.id : 'none', currentSuperimpose: cur ? cur.superimpose : 0, options: out };
}
