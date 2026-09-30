// 星魂机制测试：
//  1) E3/E5 的技能等级加成直接解析站点原文并与引擎表比对（防止手抄出错）
//  2) 技能等级随星魂提升且不越界
//  3) 星魂等级越高伤害越高（单调不减），且每个角色的 6 魂都能提升自身伤害
//  4) 固有行迹等级：星神★阿哈 2 魂 -> 2 级
//  5) 技能等级表与抓取数据一致
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { EIDOLON_INFO, SKILL_TABLES, SKILL_BASE_CAPS, SKILL_SLOTS } from '../engine/skilltables.js';
import {
  simulate, defaultConfig, normalizeConfig, characterInfo,
  EIDOLON_SKILL_BONUS, SLOT_CAPS, defaultSkillLevels, effectiveSkillLevel
} from '../engine/sim.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NORM = join(ROOT, 'data', 'nanoka', 'normalized');
const IDS = ['1506', '1501', '1503', '1511'];
const CN_SLOT = { '普攻': 'basic', '战技': 'skill', '终结技': 'ult', '天赋': 'talent', '欢愉技': 'elationSkill' };

function normOf(id) {
  const f = readdirSync(NORM).find((x) => x.startsWith(id + '_'));
  return JSON.parse(readFileSync(join(NORM, f), 'utf8'));
}

test('E3/E5 技能等级加成与站点原文逐条一致', () => {
  for (const id of IDS) {
    const norm = normOf(id);
    for (const rank of [3, 5]) {
      const text = norm.eidolons[rank - 1].desc;
      const parsed = {};
      for (const cn of Object.keys(CN_SLOT)) {
        const m = text.match(new RegExp(cn + '等级\\+(\\d+)'));
        if (m) parsed[CN_SLOT[cn]] = Number(m[1]);
      }
      const engine = (EIDOLON_SKILL_BONUS[id] || {})[rank] || {};
      assert.deepEqual(Object.keys(parsed).sort(), Object.keys(engine).sort(),
        id + ' E' + rank + ' 槽位不一致：原文 ' + JSON.stringify(parsed) + ' vs 引擎 ' + JSON.stringify(engine));
      for (const slot of Object.keys(parsed)) {
        assert.equal(engine[slot], parsed[slot], id + ' E' + rank + ' ' + slot + ' 加值不一致');
      }
    }
  }
});

test('技能等级：0 魂取行迹上限，3/5 魂提升且不越界', () => {
  for (const id of IDS) {
    const cfg = defaultConfig();
    const cc = cfg.characters[id];
    const unit = { id, cfg: cc, eidolon: 0 };
    for (const slot of Object.keys(defaultSkillLevels(id))) {
      assert.equal(effectiveSkillLevel(unit, slot, 1), cc.skillLevels[slot],
        id + ' ' + slot + ' 0 魂应等于基础等级');
    }
    unit.eidolon = 6;
    for (const slot of Object.keys(defaultSkillLevels(id))) {
      const lv = effectiveSkillLevel(unit, slot, 1);
      assert.ok(lv >= cc.skillLevels[slot], id + ' ' + slot + ' 6 魂不应低于 0 魂');
      assert.ok(lv <= (SLOT_CAPS[slot] || 15), id + ' ' + slot + ' 超出上限');
    }
    // 至少一个技能被 3/5 魂提升
    const boosted = Object.keys(defaultSkillLevels(id)).filter((slot) =>
      effectiveSkillLevel(unit, slot, 1) > cc.skillLevels[slot]);
    assert.ok(boosted.length >= 3, id + ' 满魂应有多个技能被提升，实际 ' + boosted.length);
  }
});

test('技能等级表面板：真珠 3 魂提升终结技/普攻/欢愉技，火花 3 魂提升战技', () => {
  const cases = [
    ['1503', 3, { ult: 12, basic: 7, elationSkill: 11, skill: 10 }],   // 真珠 E3：终结技/普攻/欢愉技
    ['1501', 3, { skill: 12, basic: 7, elationSkill: 11, ult: 10 }],   // 火花 E3：战技/普攻/欢愉技
    ['1506', 3, { skill: 12, basic: 7, elationSkill: 11, ult: 10 }],
    ['1511', 3, { ult: 12, basic: 7, elationSkill: 11, skill: 10 }],   // 阿哈 E3：终结技/普攻/欢愉技
    ['1503', 6, { ult: 12, skill: 12, talent: 12, basic: 7, elationSkill: 12 }]  // 满魂：E3+E5 叠加
  ];
  for (const [id, eid, expect] of cases) {
    const cfg = defaultConfig();
    cfg.characters[id].eidolon = eid;
    const info = characterInfo(id, cfg);
    for (const slot of Object.keys(expect)) {
      const row = info.skillLevels.find((x) => x.slot === slot);
      assert.equal(row.level, expect[slot], id + ' E' + eid + ' ' + slot);
    }
  }
});

test('星魂列表与解锁状态', () => {
  const cfg = defaultConfig();
  cfg.characters['1503'].eidolon = 3;
  const info = characterInfo('1503', cfg);
  assert.equal(info.eidolons.length, 6);
  for (const e of info.eidolons) {
    assert.equal(e.unlocked, e.rank <= 3, 'E' + e.rank + ' 解锁状态');
    assert.ok(e.name && e.name.length > 0, 'E' + e.rank + ' 名称缺失');
    assert.ok(e.desc && e.desc.length > 0, 'E' + e.rank + ' 效果原文缺失');
  }
  assert.equal(info.eidolons[2].type, 'skillLevel');
  assert.ok(info.eidolons[2].skillEffect.includes('终结技'));
  assert.equal(info.eidolons[5].type, 'mechanic');
});

test('星魂等级越高团队总伤害单调不减（E0 -> E6）', () => {
  const base = defaultConfig();
  let prev = -1;
  for (let e = 0; e <= 6; e++) {
    const cfg = JSON.parse(JSON.stringify(base));
    for (const id of IDS) cfg.characters[id].eidolon = e;
    const dmg = simulate(cfg).summary.totalDamage;
    assert.ok(dmg >= prev - 1e-6, 'E' + e + ' 伤害 ' + dmg + ' 低于 E' + (e - 1) + ' 的 ' + prev);
    prev = dmg;
  }
  assert.ok(prev > 0);
});

test('每个角色开满 6 魂都能提升自身伤害', () => {
  const base = defaultConfig();
  for (const id of IDS) {
    const c0 = JSON.parse(JSON.stringify(base));
    const c6 = JSON.parse(JSON.stringify(base));
    c6.characters[id].eidolon = 6;
    const d0 = simulate(c0).summary.byCharacter.find((c) => c.id === id).damage;
    const d6 = simulate(c6).summary.byCharacter.find((c) => c.id === id).damage;
    assert.ok(d6 > d0 * 1.05, id + ' 6 魂提升不足：' + Math.round(d0) + ' -> ' + Math.round(d6));
  }
});

test('固有行迹等级：阿哈 2 魂使其提升为 2 级', () => {
  // 显式从 0 魂起步（默认配置现在按中等练度取 2 魂）
  const base = JSON.parse(JSON.stringify(defaultConfig()));
  for (const id in base.characters) base.characters[id].eidolon = 0;
  assert.equal(characterInfo('1506', base).innateLevel, 1);
  const c2 = JSON.parse(JSON.stringify(base));
  c2.characters['1511'].eidolon = 2;
  assert.equal(characterInfo('1506', c2).innateLevel, 2);
  // 2 级固有行迹（银狼：溢出上限 999 / 暴伤 +40%）应带来伤害提升
  const d1 = simulate(base).summary.totalDamage;
  const d2 = simulate(c2).summary.totalDamage;
  assert.ok(d2 > d1, '2 级固有行迹应提升伤害');
});

test('技能等级表与抓取数据一致（抽查）', () => {
  const check = (sid, idx, level, expect) => {
    const v = SKILL_TABLES[sid].levels[level - 1][idx];
    assert.ok(Math.abs(v - expect) < 1e-9, sid + ' 等级 ' + level + ' 参数#' + (idx + 1) + ' 应为 ' + expect + '，实际 ' + v);
  };
  check('150602', 0, 10, 1.6);     // 银狼战技：0 魂 10 级
  check('150602', 0, 12, 1.76);    // 3 魂后 12 级
  check('150602', 0, 15, 2.0);     // 数据表上限
  check('150601', 0, 6, 1.0);      // 普攻 0 魂 6 级
  check('150601', 0, 7, 1.1);      // 普攻 3 魂后 7 级
  check('150303', 1, 12, 0.66);    // 真珠终结技 3 魂后 12 级
  check('151103', 1, 10, 2.0);     // 阿哈终结技 0 魂 10 级
  check('151103', 1, 12, 2.16);    // 阿哈 3 魂后 12 级
});

test('行迹节点提供的基础上限已正确拉平到 skillId', () => {
  assert.equal(SKILL_BASE_CAPS[SKILL_SLOTS['1506'].basic[0]], 6);
  assert.equal(SKILL_BASE_CAPS[SKILL_SLOTS['1506'].skill[0]], 10);
  assert.equal(SKILL_BASE_CAPS[SKILL_SLOTS['1503'].ult[0]], 10);
  assert.equal(SKILL_BASE_CAPS[SKILL_SLOTS['1511'].talent[0]], 10);
});
