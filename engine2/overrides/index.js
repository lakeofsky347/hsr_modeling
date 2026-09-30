// engine2/overrides/index.js —— 个别角色的手写机制（覆盖/补充自动解析）
// 结构：OVERRIDES = { [charId]: { patchKit(kit, member) → kit, hooks: { onBattleStart, onTurnStart, onAction, onHit, onEnemyTurn, actions } } }
// 所有 hook 接收 api 对象：{ state, ctx, index, member, unit, stats(), deal(hit, note, entry), addBuff(effect), gainEnergy(v), gainSP(v), log(entry) }
//   onAction 额外参数 { skill, code, entry, phase: 'before'|'after' }
//   onHit    额外参数 { hit, result: { per, total, targets }, dot? } —— 返回数字则替换该段伤害
//   actions  额外参数 { defaults: [{ code, slot }], mode } —— 返回动作数组替换默认候选；动作可为 { code, slot } 或 { code, run(api) }
// 状态存放：只能写入 api.unit.custom / api.state.custom（纯 JSON，beam search 会深拷贝）。
//
// 每角色一个文件：engine2/overrides/<id>_<name>.js（导出 override）；欢愉共用机制见 _elation.js，说明见 README.md。
import { override as silverwolf999 } from './1506_silverwolf999.js';
import { override as sparxie } from './1501_sparxie.js';
import { override as pearl } from './1503_pearl.js';
import { override as aha } from './1511_aha.js';
import { override as firefly } from './1310_firefly.js';
import { override as imbibitor } from './1213_imbibitor.js';
import { override as jingliu } from './1212_jingliu.js';
import { override as acheron } from './1308_acheron.js';
import { override as blade } from './1205_blade.js';
import { override as blackswan } from './1307_blackswan.js';
import { override as sparkle } from './1306_sparkle.js';
import { override as robin } from './1309_robin.js';
import { override as ruanmei } from './1303_ruanmei.js';

// 1102 希儿：
//  - 天赋“击杀获得额外回合”在单体 BOSS 战中不触发（忽略）；
//  - 增幅状态（天赋伤害提高）：理想化为常驻（终结技立即进入增幅，BOSS 战中也可通过开场/终结技维持）。
//    实现：把天赋中 dmgBonus 类效果改为 passive 常驻（若数据未解析出，则按天赋 params[0] 补一条）。
var seele = {
  patchKit: function (kit) {
    var talent = (kit.skills || []).find(function (s) { return s.slot === 'talent'; });
    if (!talent) return kit;
    talent.effects = (talent.effects || []).map(function (e) {
      if (/^dmgBonus/.test(e.stat)) return Object.assign({}, e, { trigger: 'passive', duration: null, target: 'self', condition: null });
      return e;
    });
    if (!talent.effects.some(function (e) { return /^dmgBonus/.test(e.stat); })) {
      talent.effects.push({ key: kit.id + ':override:resurgence', stat: 'dmgBonus', value: { param: 0 }, target: 'self', duration: null,
        trigger: 'passive', maxStacks: 1, condition: null, confidence: 'high', raw: '增幅状态：伤害提高（override：常驻）' });
    }
    // 追加攻击段落不应存在于希儿天赋中
    talent.hits = (talent.hits || []).filter(function (h) { return h.dmgType !== 'fua'; });
    (kit.notes = kit.notes || []).push('override：增幅状态视为常驻；击杀额外回合在单体 BOSS 战中忽略');
    return kit;
  },
  hooks: {}
};

// 1005 卡芙卡：战技/终结技/追加攻击使目标身上的 DoT 立即产生相当于原伤害一定比例的伤害（引爆）。
// 数据（4.6.51）：战技 params=[主目标倍率, 引爆比例 0.75, 相邻倍率]；终结技 params=[全体倍率, 引爆比例 1, 触电回合 2, 触电倍率 2.9, 基础概率 1]。
// patchKit：终结技只保留「触电」这一条 DoT 段（自动解析会把引爆比例误识别为另一条 DoT），持续回合取 params[2]。
var kafka = {
  patchKit: function (kit) {
    var ult = (kit.skills || []).find(function (s) { return s.slot === 'ult'; });
    if (ult && ult.hits) {
      var p = ult.params[(ult.defaultLevel || 10) - 1] || [];
      var dots = ult.hits.filter(function (h) { return h.dmgType === 'dot'; });
      if (dots.length > 1) {
        var keep = dots.reduce(function (a, h) { return (p[h.param] || 0) > (p[a.param] || 0) ? h : a; });
        ult.hits = ult.hits.filter(function (h) { return h.dmgType !== 'dot' || h === keep; });
      }
      ult.hits.forEach(function (h) { if (h.dmgType === 'dot' && !h.duration) h.duration = Number(p[2]) || 2; });
    }
    (kit.notes = kit.notes || []).push('override：终结技 DoT 去重；引爆由通用 specials.dotDetonate 结算');
    return kit;
  },
  // 引爆由引擎通用的 skill.specials.dotDetonate 结算（v2.1.2 起），此处不再手动引爆，避免重复计算。
  hooks: {}
};

export var OVERRIDES = {
  '1102': seele,
  '1005': kafka,
  // 欢愉四人（v1 完美轴移植）
  '1506': silverwolf999,
  '1501': sparxie,
  '1503': pearl,
  '1511': aha,
  // 强化形态 / 特殊资源
  '1310': firefly,
  '1213': imbibitor,
  '1212': jingliu,
  '1308': acheron,
  '1205': blade,
  '1307': blackswan,
  '1306': sparkle,
  '1309': robin,
  '1303': ruanmei
};