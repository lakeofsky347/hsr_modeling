import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, defaultConfig, normalizeConfig } from '../engine/sim.js';
import { paramSchema } from '../engine/schema.js';

test('默认配置可以跑通模拟并给出正伤害', () => {
  const r = simulate(defaultConfig());
  assert.equal(r.ok, true);
  assert.ok(r.summary.totalDamage > 0, 'totalDamage=' + r.summary.totalDamage);
  assert.ok(r.timeline.length > 5, 'actions=' + r.timeline.length);
  assert.equal(r.summary.elationCount, 4);
});

test('四人都有伤害输出', () => {
  const r = simulate(defaultConfig());
  for (const c of r.summary.byCharacter) {
    assert.ok(c.damage > 0, c.name + ' 伤害为 0');
  }
});

test('快照打印（人工核对用）', () => {
  const r = simulate(defaultConfig());
  console.log('总伤害', r.summary.totalDamage, '| 每轮', r.summary.damagePerCycle,
              '| 每100AV', r.summary.dps, '| 阿哈时刻', r.summary.ahaMoments, '次 | 阿哈速度', r.summary.ahaSpeed);
  for (const c of r.summary.byCharacter) {
    console.log('  ', c.name, c.damage, (c.share * 100).toFixed(1) + '%', '命中', c.hits);
  }
  for (const t of r.summary.byType) console.log('  ', t.label, t.damage);
  console.log('  前 12 个行动:');
  for (const e of r.timeline.slice(0, 12)) {
    console.log('   AV', e.av, e.actor, e.action, e.damage, e.note || '');
  }
  assert.ok(true);
});

test('schema 中每个字段路径都能在默认配置里找到', () => {
  const cfg = defaultConfig();
  const sch = paramSchema();
  const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  for (const g of sch.groups) {
    for (const f of g.fields) {
      const v = get(cfg, f.path);
      assert.notEqual(v, undefined, '路径不存在: ' + f.path);
    }
  }
});

test('参数可调：提高暴伤应提升总伤害', () => {
  const a = normalizeConfig({});
  const b = normalizeConfig({});
  b.characters['1506'].stats.critDmg = 3.0;
  b.characters['1501'].stats.critDmg = 3.0;
  const ra = simulate(a), rb = simulate(b);
  assert.ok(rb.summary.totalDamage > ra.summary.totalDamage);
});

test('参数可调：关闭无限战技点时战技点受限会影响结果', () => {
  const base = normalizeConfig({ options: { infiniteSkillPoints: true } });
  const r = simulate(base);
  assert.ok(r.summary.totalDamage > 0);
});
