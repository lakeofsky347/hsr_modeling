// 1307 黑天鹅 —— 奥迹（叠层 DoT）/ 揭露
// 简化假设（65% 基础概率一律视为命中；单目标层数，相邻目标只按 ≥3 层额外伤害结算）：
//  * 奥迹层数 custom.arc：开场 +1（杯底端倪）+ 秘技期望 ≈ 1（按 +1）；普攻 +1 并对敌方每种其他 DoT +1；战技 +1（主目标）并对每种其他 DoT +1（脏中躁动）。
//    敌人回合开始：奥迹伤害 = p0 + p2×层数 攻击力（风属性持续伤害），≥3 层相邻 p4，≥7 层无视 20% 防御；随后重置为 1 层（揭露期间 1 次不重置）；
//    再按敌方身上每种其他 DoT +1（天赋）。E6：队友每次攻击 +1（再 50% 额外 +1 → 按 +1.5）。
//  * 终结技【揭露】2 回合：数据易伤 25%；揭露期间奥迹视为风化/裂伤/灼烧/触电（叠层时额外 +4 种 DoT 计数）。
//  * 行迹烛影朕兆：增伤 = min(72%, 60% × 效果命中)，开场计算一次（替代数据常驻 60%）。
import { skillById, paramsOf, note } from './_util.js';

function P(api) { return api.member.ch._ovp; }
function otherDots(api) {
  var kinds = {};
  (api.enemy().dots || []).forEach(function (d) { if (d.owner !== api.index) kinds[d.key || d.owner + ':' + d.hitIdx] = 1; });
  var n = Object.keys(kinds).length;
  return Math.min(4, n) + (api.custom.reveal > 0 ? 4 : 0);
}
function add(api, n) { api.custom.arc = Math.min(50, (api.custom.arc || 0) + n); }

export var override = {
  name: '黑天鹅',
  patchKit: function (kit, member) {
    kit._ovp = { e: (member && member.eidolon) || 0, tal: paramsOf(kit, member, '130704') };
    var t = skillById(kit, '130704');
    if (t) t.hits = [];
    (kit.traces || []).forEach(function (tr) { if (tr.name === '烛影朕兆') tr.effects = []; });
    // 【揭露】原文「敌方目标自身回合内受到的伤害提高25%」：只对敌人回合内结算的伤害（DoT）生效；
    // 数据解析为通用易伤会让队友在自己回合的直伤也吃到 25%，这里改为 vuln_dot（Kafka 在其回合的引爆也会吃到，属轻微高估）。
    var ul = skillById(kit, '130703');
    if (ul) ul.effects = (ul.effects || []).map(function (e) { return e.stat === 'vuln' ? Object.assign({}, e, { stat: 'vuln_dot' }) : e; });
    note(kit, '黑天鹅 奥迹叠层手写机制');
    return kit;
  },
  hooks: {
    onBattleStart: function (api) {
      var c = api.custom;
      c.arc = 2; c.reveal = 0; c.noReset = false;
      var ehr = api.stats().effectHitRate || 0;
      api.addBuff({ key: 'bs:t3', stat: 'dmgBonus', value: Math.min(0.72, 0.6 * ehr), duration: null, label: '烛影朕兆' });
    },
    onAction: function (api) {
      var s = api.skill;
      if (!s || api.phase !== 'after') return;
      if (s.slot === 'basic') add(api, 1 + otherDots(api));
      else if (s.slot === 'skill') add(api, 1 + otherDots(api));
      else if (s.slot === 'ult') { api.custom.reveal = 2; api.custom.noReset = true; }
    },
    onAnyAction: function (api) {
      if (api.actor !== api.index && api.isAttack && P(api).e >= 6) add(api, 1.5);
    },
    onEnemyTurn: function (api) {
      var c = api.custom, p = P(api);
      var n = Math.floor(c.arc || 0);
      if (n > 0) {
        if (n >= (p.tal[5] || 7)) api.addBuff({ key: 'bs:di', stat: 'defIgnore', value: p.tal[6] || 0.2, duration: 1 });
        api.deal({ scaling: 'atk', mult: (p.tal[0] || 2.4) + (p.tal[2] || 0.12) * n, target: 'single', dmgType: 'dot', _instant: true, instant: true }, '奥迹 ×' + n);
        if (n >= (p.tal[3] || 3) && api.ctx.enemyCount > 1) api.deal({ scaling: 'atk', mult: p.tal[4] || 1.8, target: 'adjacent', dmgType: 'dot', _instant: true, instant: true }, '奥迹·相邻');
        api.removeBuff('bs:di');
        if (c.noReset) c.noReset = false; else c.arc = 1;
      }
      add(api, otherDots(api));
      if (c.reveal > 0) c.reveal -= 1;
    }
  }
};
