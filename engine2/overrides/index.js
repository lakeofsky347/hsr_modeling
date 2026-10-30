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


// ---- v3.4 HSR fixes (pipeline/shared/hsr_fixes_patch.py) ----
var __HSR_FIX = {serval_talent: 1, topaz_weak: 1, topaz_skill_fua: 1, topaz_basic_fua: 1, seele_kill_traces: 1, elation_skill_punchline: 1, silver_wolf_a4: 1, migrate_config: 1};
// 1103 希露瓦 天赋「燃情和弦」：施放攻击后，对触电（雷属性 DoT）状态的敌方目标造成 72% 攻击力附加伤害
var __serval = {
  patchKit: function (kit) {
    var t = (kit.skills || []).find(function (s) { return s.slot === 'talent'; });
    if (t) t.hits = (t.hits || []).map(function (h) { return Object.assign({}, h, { dmgType: 'additional' }); });
    (kit.notes = kit.notes || []).push('v3.4：天赋附加伤害在普攻/战技/终结技后对触电目标结算（dmgType=additional）');
    return kit;
  },
  hooks: {
    onAction: function (api) {
      if (api.phase !== 'after' || ['basic', 'skill', 'ult'].indexOf(api.skill.slot) < 0) return;
      var shocked = (api.enemy().dots || []).some(function (d) {
        var om = api.ctx.members[d.owner], rs = om && om.skills[d.skillSlot], h = rs && rs.hits[d.hitIdx];
        return d.remaining > 0 && h && (h.element || om.element) === 'Thunder';
      });
      if (!shocked) return;
      var th = api.hitsOf('talent')[0];
      if (!th || !(th.mult > 0)) return;
      api.deal({ scaling: th.scaling || 'atk', mult: th.mult, target: 'single', element: 'Thunder', dmgType: 'additional' }, '燃情和弦·附加伤害', api.entry);
    }
  }
};
// 1102 希儿（改版数据）：击杀触发的行迹（夜行：消灭敌方目标时增伤，可叠 3 层）在单体 BOSS 战中不触发 → 去掉（与原 override「击杀额外回合忽略」一致）
var __seeleV34 = {
  patchKit: function (kit, member) {
    kit = seele.patchKit(kit, member) || kit;
    var n = 0;
    (kit.traces || []).forEach(function (t) {
      var before = (t.effects || []).length;
      t.effects = (t.effects || []).filter(function (e) { return !/^消灭敌方目标时/.test(e.condition || e.raw || ''); });
      n += before - t.effects.length;
    });
    if (n) kit.notes.push('v3.4：击杀触发的行迹增伤（夜行）在单体 BOSS 战中忽略');
    return kit;
  },
  hooks: seele.hooks
};
// 1112 托帕&账账：金融动荡仅对火弱点敌人；战技/普攻（透支）同时视为追加攻击伤害
var __topaz = {
  patchKit: function (kit, member, enemy) {
    var notes = (kit.notes = kit.notes || []);
    if (__HSR_FIX.topaz_weak) {
      var tr = (kit.traces || []).find(function (t) { return t.id === '1112102'; });
      if (tr && enemy) {
        var weak = (enemy.weak || []).indexOf('Fire') >= 0;
        if (!weak) tr.effects = [];
        notes.push('v3.4：金融动荡 ' + (weak ? '生效（敌人火弱点）' : '不生效（敌人无火弱点）'));
      } else if (tr) notes.push('v3.4：金融动荡仅对火弱点敌人生效（面板视图未指定敌人，按生效显示）');
    }
    (kit.skills || []).forEach(function (s) {
      if ((s.slot === 'skill' && __HSR_FIX.topaz_skill_fua) || (s.slot === 'basic' && __HSR_FIX.topaz_basic_fua)) {
        s.hits = (s.hits || []).map(function (h) { return h.dmgType === 'dot' ? h : Object.assign({}, h, { alsoTypes: ['fua'] }); });
      }
    });
    if (__HSR_FIX.topaz_skill_fua) notes.push('v3.4：战技伤害同时视为追加攻击（吃追击增伤/易伤）');
    if (__HSR_FIX.topaz_basic_fua) notes.push('v3.4：普攻伤害同时视为追加攻击（行迹·透支）');
    return kit;
  },
  hooks: {}
};
export var OVERRIDES = {
  '1103': __serval,
  '1112': __topaz,
  '1102': __seeleV34,
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