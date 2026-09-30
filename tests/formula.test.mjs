import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  elationHit, defenseRegion, jokeRegion, resistanceRegion,
  ELATION_BASE_VALUE
} from '../engine/formula.js';

test('防御区：攻方 80 级 / 受方 76 级 = 1000/1960', () => {
  const r = defenseRegion(80, 76, 0, 0);
  assert.ok(Math.abs(r - 1000 / 1960) < 1e-12, 'got ' + r);
});

test('笑点区：joke=2 -> 1 + 10/242', () => {
  assert.ok(Math.abs(jokeRegion(2) - (1 + 10 / 242)) < 1e-12);
  assert.equal(jokeRegion(0), 1);
  assert.ok(Math.abs(jokeRegion(1000) - (1 + 5000 / 1240)) < 1e-12);
  assert.ok(jokeRegion(1e9) > 5.999 && jokeRegion(1e9) < 6, '上限趋近 1+k = 6');
});

test('抗性区：20% 抗性 -> 0.8，弱点 0% 抗性 -> 1，负抗 -> >1', () => {
  assert.ok(Math.abs(resistanceRegion(0.2, 0) - 0.8) < 1e-12);
  assert.ok(Math.abs(resistanceRegion(0, 0) - 1) < 1e-12);
  assert.ok(resistanceRegion(0.2, 0.4) > 1);
});

test('回归：公开样例应约等于 3633.83', () => {
  const r = elationHit({
    multiplier: 0.2,
    baseValue: ELATION_BASE_VALUE,
    elationDegree: 1.2,
    joke: 2,
    critRate: 1,
    critDmg: 1.274,
    alwaysCrit: true,
    vulnerability: [0.1, 0.16],
    res: 0.2,
    resShred: 0,
    toughnessDR: 0.1,
    broken: false,
    attackerLevel: 80,
    targetLevel: 76
  });
  // 手算：1507.0214 x 2.2 x 1.0413223 x 2.274 x 1.26 x 0.8 x 0.9 x (1000/1960)
  assert.ok(Math.abs(r.damage - 3633.83) < 1.0, 'got ' + r.damage);
});

test('欢愉伤害不吃攻击力：改变攻击力不影响结果', () => {
  const base = {
    multiplier: 1, elationDegree: 0.5, joke: 20, critRate: 0.5, critDmg: 1,
    alwaysCrit: true, vulnerability: [], res: 0, resShred: 0, toughnessDR: 0.1,
    attackerLevel: 80, targetLevel: 80
  };
  const a = elationHit(Object.assign({}, base, { atk: 1000 })).damage;
  const b = elationHit(Object.assign({}, base, { atk: 99999 })).damage;
  assert.equal(a, b);
});

test('单调性：笑点 / 欢愉度 / 暴伤 越高伤害越高', () => {
  const mk = (o) => elationHit(Object.assign({
    multiplier: 1, elationDegree: 0, joke: 0, critRate: 0, critDmg: 0, alwaysCrit: true,
    vulnerability: [], res: 0, resShred: 0, toughnessDR: 0, attackerLevel: 80, targetLevel: 80
  }, o)).damage;
  assert.ok(mk({ joke: 50 }) > mk({ joke: 10 }));
  assert.ok(mk({ elationDegree: 1 }) > mk({ elationDegree: 0.5 }));
  assert.ok(mk({ critDmg: 2 }) > mk({ critDmg: 1 }));
});
