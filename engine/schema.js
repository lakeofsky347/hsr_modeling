// ============================================================================
// 参数表单描述：UI 与 CLI 都据此渲染 / 校验
// path 为 Config 的点号路径；default 与 defaultConfig() 保持一致
// ============================================================================
import { CHARACTERS } from './characters.js';
import { ELATION_BASE_VALUE, JOKE_K, JOKE_C, DEF_BASE, DEF_PER_LEVEL } from './formula.js';
import { SKILL_SLOTS, SKILL_BASE_CAPS, EIDOLON_INFO } from './skilltables.js';
import { EIDOLON_SKILL_BONUS, SLOT_CAPS, SLOT_LABELS } from './sim.js';
import { LIGHTCONES, SIGNATURE_LIGHTCONE } from './lightconedata.js';
import { RELICS, RECOMMENDED_RELICS } from './relicdata.js';

function f(path, label, type, extra) {
  return Object.assign({ path: path, label: label, type: type }, extra || {});
}
function n(path, label, dflt, min, max, step, help, unit) {
  return f(path, label, 'number', { default: dflt, min: min, max: max, step: step, help: help, unit: unit || '' });
}
function b(path, label, dflt, help) {
  return f(path, label, 'boolean', { default: dflt, help: help });
}
function s(path, label, options, dflt, help) {
  return f(path, label, 'select', { options: options, default: dflt, help: help });
}

export function paramSchema() {
  var groups = [];

  groups.push({
    id: 'global', label: '全局 / 战斗环境', description: '影响所有人的乘区与时间轴设置',
    fields: [
      n('duration.cycles', '模拟轮数', 3, 1, 12, 1, '总行动值 = 首轮 150 + (轮数-1) x 100（3 轮 = 350 行动值）'),
      n('enemy.level', '敌人等级', 80, 1, 95, 1, '影响防御乘区'),
      b('enemy.weakness', '敌人有我方属性弱点', true, '有弱点时抗性 0%，否则按基础抗性 20% 计算'),
      n('enemy.resBase', '基础抗性（无弱点时）', 0.2, -1, 1, 0.05, '通常为 20%', '%'),
      n('enemy.resShred', '额外减抗', 0, -1, 1, 0.05, '来自遗器/辅助等外部来源', '%'),
      n('enemy.vulnerability', '易伤（受到的伤害提高）', 0, -1, 2, 0.05, '同类加算', '%'),
      n('enemy.toughnessDR', '未击破韧性减伤', 0.1, 0, 0.5, 0.05, '通常 10%', '%'),
      b('enemy.broken', '已击破（无韧性减伤）', false, '击破后韧性减伤为 0'),
      n('enemy.targetCount', '敌人数量', 1, 1, 5, 1, '影响群攻技能的结算目标数'),
      n('team.skillPoints.start', '初始战技点', 3, 0, 5, 1, ''),
      n('team.skillPoints.max', '战技点上限', 5, 1, 5, 1, ''),
      n('team.jokePoints.start', '初始笑点', 0, 0, 500, 1, ''),
      b('options.alwaysCrit', '必定暴击（理想轴）', true, '关闭后按 暴击率 x 暴伤 计算期望伤害'),
      b('options.infiniteSkillPoints', '无限战技点（理论上限）', false, '开启后忽略战技点约束，用于查看完美轴的理论上限'),
      b('options.includeMaze', '计入秘技进场效果', true, '真珠 +20 好活当赏/2 充能、银狼 99 层好活当赏、阿哈 20 笑点等'),
      s('options.blindboxMode', '银狼【头号补给盲盒】结算方式', [
        { value: 'expected', label: '期望值（推荐）：按触发概率折算，概率会衰减' },
        { value: 'always', label: '理论上限：每次消耗战技点都触发' }
      ], 'expected', '游戏内每次成功触发后概率降为当前的 20%，因此期望触发次数远小于消耗次数'),
      b('options.includeTrueDamage', '计入真实伤害', true, '真珠/阿哈/银狼盲盒的真伤'),
      b('options.goodRewardOnElationSkill', '欢愉技同时吃笑点与好活当赏', true, '关闭后欢愉技只吃自身好活当赏'),
      n('options.elationBaseValue', '欢愉伤害基础值（80 级）', ELATION_BASE_VALUE, 0, 20000, 0.001, '官方数值 7535.107'),
      n('options.jokeCurveK', '笑点乘区系数 k', JOKE_K, 0, 20, 0.5, '乘区 = 1 + 笑点 x k / (笑点 + c)'),
      n('options.jokeCurveC', '笑点乘区常数 c', JOKE_C, 1, 1000, 1, ''),
      b('team.ahaMoment.useOwnerSpeed', '阿哈时刻使用阿哈自身速度作基础', true, '对应专属机制「阿哈时刻在」：基础速度 80 -> 阿哈速度'),
      n('team.ahaMoment.baseSpeed', '阿哈时刻基础速度', 80, 0, 200, 1, '未启用「阿哈时刻在」时生效'),
      n('team.ahaMoment.divisor1', '队伍最快速度除数', 5, 1, 50, 1, '阿哈速度 += 最快速度 / 除数'),
      n('team.ahaMoment.divisor2', '第二快速度除数', 10, 1, 50, 1, ''),
      n('team.ahaMoment.divisor3', '第三快速度除数', 20, 1, 50, 1, ''),
      n('team.ahaMoment.divisor4', '第四快速度除数', 40, 1, 50, 1, '')
    ]
  });

  var statFields = function (id) {
    return [
      b('characters.' + id + '.enabled', '启用该角色', true, ''),
      n('characters.' + id + '.level', '等级', 80, 1, 80, 1, ''),
      s('characters.' + id + '.eidolon', '星魂解锁等级', eidolonOptions(id), 0,
        '选择已解锁的星魂等级；3、5 魂提升技能等级，其余为机制质变'),
      n('characters.' + id + '.stats.atk', '攻击力', 0, 0, 20000, 1, '欢愉伤害不吃攻击力，但影响行迹「笑点签售会」等判定'),
      n('characters.' + id + '.stats.def', '防御力', 0, 0, 20000, 1, '真珠的伤害与治疗按防御力缩放'),
      n('characters.' + id + '.stats.hp', '生命值', 0, 0, 30000, 1, ''),
      n('characters.' + id + '.stats.spd', '速度', 0, 50, 300, 0.1, '决定出手频率与阿哈时刻速度'),
      n('characters.' + id + '.stats.critRate', '暴击率', 0, 0, 1, 0.01, '理想轴下仅影响期望模式', '%'),
      n('characters.' + id + '.stats.critDmg', '暴击伤害', 0, 0, 10, 0.01, '理想轴核心乘区之一', '%'),
      n('characters.' + id + '.stats.elationDegree', '欢愉度', 0, 0, 20, 0.01, '欢愉伤害的独立乘区', '%'),
      b('characters.' + id + '.rotation.useMaze', '使用秘技进场', true, ''),
      s('characters.' + id + '.rotation.mode', '循环策略', [
        { value: 'perfect', label: '完美轴（推荐）' },
        { value: 'conservative', label: '保守轴（省战技点）' }
      ], 'perfect', '完美轴：资源全开追求上限')
    ];
  };

  for (var i = 0; i < CHARACTERS.length; i++) {
    var c = CHARACTERS[i];
    var d = defaultStatFor(c);
    var fields = statFields(c.id);
    // 覆盖默认值
    for (var j = 0; j < fields.length; j++) {
      var p = fields[j].path;
      if (p.indexOf('.stats.') >= 0) fields[j].default = d[p.split('.stats.')[1]];
    }
    if (c.id === '1511') {
      fields.push(s('characters.1511.rotation.lordTarget', '「欢愉」令使目标', [
        { value: '1506', label: '银狼LV.999' },
        { value: '1501', label: '火花' },
        { value: '1503', label: '真珠' },
        { value: '1511', label: '星神★阿哈' }
      ], '1506', '令使提供 +25% 欢愉度，并让阿哈回合开始回愿力'));
    }
    if (c.id === '1501') {
      fields.push(n('characters.1501.rotation.maxTrapsPerTurn', '每次连线最多发动互动陷阱', 20, 0, 20, 1, '每次消耗 1 战技点'));
    }
    // 专属光锥：默认装备；叠影 1-5 可调
    var sigId = SIGNATURE_LIGHTCONE[c.id];
    var sig = LIGHTCONES[sigId];
    if (sig) {
      fields.push(b('characters.' + c.id + '.lightcone.enabled',
        '装备专属光锥（' + sig.name + '）', true,
        sig.rarity + '★ ' + sig.passive + '：' + (sig.desc || '').slice(0, 60) + '…'));
      fields.push(s('characters.' + c.id + '.lightcone.superimpose', '光锥叠影', [
        { value: 1, label: '叠影 1' }, { value: 2, label: '叠影 2' }, { value: 3, label: '叠影 3' },
        { value: 4, label: '叠影 4' }, { value: 5, label: '叠影 5' }
      ], 1, '叠影越高，光锥被动数值越高'));
    }
    // 遗器：外圈 4 件套 / 内圈 2 件套 / 副词条有效词条数
    var rec = RECOMMENDED_RELICS[c.id];
    if (rec) {
      var opts4 = (rec.set4 || []).map(function (sid2) {
        return { value: sid2, label: (RELICS[sid2] ? RELICS[sid2].name : sid2) + (sid2 === rec.set4[0] ? '（首选）' : '') };
      });
      var opts2 = (rec.set2 || []).map(function (sid2) {
        return { value: sid2, label: (RELICS[sid2] ? RELICS[sid2].name : sid2) + (sid2 === rec.set2[0] ? '（首选）' : '') };
      });
      fields.push(b('characters.' + c.id + '.relics.enabled', '装备遗器（主词条 + 副词条 + 套装）', true,
        '关闭后只按角色面板计算'));
      fields.push(s('characters.' + c.id + '.relics.set4', '外圈 4 件套', opts4, rec.set4[0], ''));
      fields.push(s('characters.' + c.id + '.relics.set2', '内圈 2 件套', opts2, rec.set2[0], ''));
      fields.push(n('characters.' + c.id + '.relics.substatRolls', '副词条有效词条数', 20, 0, 45, 1,
        '0 = 只算主词条；中等练度约 18–22 条，毕业约 28–32 条（按站点给出的副词条优先级加权分配）'));
    }
    // 技能基础等级（不含星魂加成）：默认 = 行迹节点上限，星魂 3/5 再叠加
    var slots = SKILL_SLOTS[c.id] || {};
    for (var slotName of ['basic', 'skill', 'ult', 'talent', 'elationSkill']) {
      if (!slots[slotName]) continue;
      var cap = SKILL_BASE_CAPS[slots[slotName][0]] || 10;
      fields.push(n('characters.' + c.id + '.skillLevels.' + slotName,
        SLOT_LABELS[slotName] + '基础等级（未含星魂加成）', cap, 1, cap, 1,
        '0 魂上限 ' + cap + '，满星魂后上限 ' + (SLOT_CAPS[slotName] || 15)));
    }
    groups.push({
      id: c.id, label: c.name + '（' + c.elementZh + ' / 欢愉）',
      description: c.role + '，基础速度 ' + c.base.spd,
      fields: fields
    });
  }
  return { version: '1.0.0', groups: groups };
}

// 星魂下拉选项：把每一级的效果摘要写进标签，便于直接挑选
function eidolonOptions(id) {
  var list = EIDOLON_INFO[id] || [];
  var bonus = EIDOLON_SKILL_BONUS[id] || {};
  var opts = [{ value: 0, label: '0 魂（未解锁）' }];
  var acc = {};
  for (var r = 1; r <= 6; r++) {
    var info = list[r - 1] || {};
    var skillPart = '';
    if (bonus[r]) {
      var parts = [];
      for (var slot in bonus[r]) {
        acc[slot] = (acc[slot] || 0) + bonus[r][slot];
        parts.push(SLOT_LABELS[slot] + '+' + bonus[r][slot]);
      }
      skillPart = '（' + parts.join('，') + '）';
    }
    opts.push({ value: r, label: r + ' 魂 · ' + (info.name || '') + skillPart });
  }
  return opts;
}

function defaultStatFor(c) {
  var t = c.traceBonus || {};
  return {
    atk: Math.round((c.base.atk + (t.atkFlat || 0)) * 100) / 100,
    def: Math.round(c.base.def * (1 + (t.defPct || 0)) * 100) / 100,
    hp: Math.round(c.base.hp * 100) / 100,
    spd: Math.round((c.base.spd + (t.spd || 0)) * 10) / 10,
    critRate: Math.round((c.base.critRate + (t.critRate || 0)) * 1000) / 1000,
    critDmg: Math.round((c.base.critDmg + (t.critDmg || 0)) * 1000) / 1000,
    elationDegree: Math.round((c.base.elationDegree + (t.elationDegree || 0)) * 1000) / 1000
  };
}
