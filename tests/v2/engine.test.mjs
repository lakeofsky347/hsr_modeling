import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DATA as FX } from './fixtures/mini.mjs';
import { createEngine } from '../../engine2/core.js';
import { elationHit, ELATION_BASE_VALUE, breakHit, defenseRegion } from '../../engine2/formula.js';
import * as V1 from '../../engine/formula.js';

const E = createEngine(FX, {});
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' got ' + a + ' expected ' + b);

function soloConfig(policy, extra) {
  const m = { charId: '9001', eidolon: 0, lightcone: null, relics: null, policy: Object.assign({ mode: 'basicOnly', ultMode: 'asap' }, policy || {}) };
  return Object.assign({
    team: [m],
    enemy: { name: 'T', level: 80, count: 1, toughness: 300, weak: [], res: { Quantum: 0 }, spd: 100, allowBreak: true },
    battle: { cycles: 3, firstCycleAV: 150, avPerCycle: 100, startSP: 3, maxSP: 5, startEnergyPct: 0.5 },
    options: { critMode: 'expected', beamWidth: 8 }
  }, extra || {});
}

test('公式回归：欢愉样例 ≈ 3633.83，且与 v1 一致', () => {
  const p = { multiplier: 0.2, baseValue: ELATION_BASE_VALUE, elationDegree: 1.2, joke: 2, critRate: 1, critDmg: 1.274, alwaysCrit: true,
    vulnerability: [0.1, 0.16], res: 0.2, resShred: 0, toughnessDR: 0.1, broken: false, attackerLevel: 80, targetLevel: 76 };
  near(elationHit(p).damage, 3633.83, 1.0);
  near(elationHit(p).damage, V1.elationHit(p).damage, 1e-9);
});

test('击破公式：量子、韧性 300(数据单位)=100 → 0.5×3767.5533×3×防御×0.9', () => {
  const d = breakHit({ element: 'Quantum', maxToughness: 300, breakEffect: 0, vulnerability: [0], res: 0, resShred: 0, attackerLevel: 80, targetLevel: 80 }).damage;
  near(d, 0.5 * 3767.5533 * (0.5 + 100 / 40) * defenseRegion(80, 80, 0, 0) * 0.9, 1e-6);
});

test('面板：角色+光锥白值 → 行迹/主副词条/套装/被动', () => {
  const m = E.defaultMember('9001');
  const s = E.computeStats(m);
  near(s.atk, 1100 * (1 + 0.1 + 0.432 + 0.12) + 352.8, 0.01, 'atk');
  // 副词条按 5★ 中档：暴击率 2.916%、暴伤 5.832%
  near(s.critRate, 0.05 + 0.324 + 0.1 + 0.08 + 8 * 0.02916, 1e-4, 'critRate');
  near(s.critDmg, 0.5 + 0.2 + 7 * 0.05832, 1e-4, 'critDmg');
  near(s.spd, 100 + 25.032, 1e-6, 'spd');
  near(s.hp, 2000 + 705.6, 0.01, 'hp');
  near(s.dmgBonus.Quantum, 0.3888, 1e-6);
  // 叠影 5 → 光锥暴伤 0.4
  const s5 = E.computeStats(Object.assign({}, m, { lightcone: { id: '9901', superimposition: 5 } }));
  near(s5.critDmg - s.critDmg, 0.2, 1e-6, 'S5');
  // statOverrides 直接覆盖
  const so = E.computeStats(Object.assign({}, m, { statOverrides: { atk: 3000, critRate: null } }));
  assert.equal(so.atk, 3000);
  near(so.critRate, s.critRate, 1e-9);
});

test('星魂：E1 常驻暴伤；E3 战技 +2 / 普攻 +1 级', () => {
  const k0 = E.describeKit('9001', { charId: '9001', eidolon: 0 });
  const k3 = E.describeKit('9001', { charId: '9001', eidolon: 3 });
  const sk = (k, slot) => k.skills.find((s) => s.slot === slot);
  assert.equal(sk(k0, 'skill').level, 10);
  assert.equal(sk(k3, 'skill').level, 12);
  assert.equal(sk(k3, 'basic').level, 7);
  near(sk(k3, 'skill').hits[0].multiplier, 2.2, 1e-9);
  const s0 = E.computeStats({ charId: '9001', eidolon: 0, lightcone: null, relics: null });
  const s1 = E.computeStats({ charId: '9001', eidolon: 1, lightcone: null, relics: null });
  near(s1.critDmg - s0.critDmg, 0.2, 1e-9);
});

test('单人轴手算：3 回合普攻 + 3 次追击 + 1 次终结技', () => {
  const r = E.simulate(soloConfig());
  // atk=600×1.1=660，暴击区=1+0.15×0.5，韧性区 0.9，防御区 0.5，抗性 0
  const unit = 660 * (1 + 0.15 * 0.5) * 0.9 * 0.5;
  const expect = (3 * 1.1 + 3 * 0.5 + 4.0) * unit;
  near(r.total, expect, 0.5, 'total');
  assert.equal(r.rotation['9001'], 'A F A F Q A F');
  near(r.byType.ult, 4.0 * unit, 0.2);
  near(r.byType.fua, 1.5 * unit, 0.2);
  assert.equal(r.totalAV, 350);
});

test('必定暴击模式', () => {
  const r = E.simulate(soloConfig({}, { options: { critMode: 'always', beamWidth: 4 } }));
  const unit = 660 * 1.5 * 0.9 * 0.5;
  near(r.total, 8.8 * unit, 0.5);
});

test('击破：弱点命中削韧，击破后结算击破伤害并在敌人回合恢复', () => {
  const cfg = soloConfig({ mode: 'skillFirst' }, {});
  cfg.enemy.weak = ['Quantum'];
  cfg.enemy.toughness = 120; // 两次战技
  cfg.battle.startSP = 5;
  const r = E.simulate(cfg);
  assert.ok(r.breaks >= 1, 'breaks');
  assert.ok(r.byType.break > 0);
  assert.ok(r.timeline.some((t) => /恢复/.test(t.skillName)), '恢复');
});

test('战技点从不为负且不超过上限', () => {
  const cfg = E.defaultConfig();
  cfg.team.forEach((m) => { m.policy = { mode: 'skillFirst', ultMode: 'asap' }; });
  cfg.battle.startSP = 1;
  cfg.battle.cycles = 6;
  const r = E.simulate(cfg);
  for (const t of r.timeline) { assert.ok(t.sp >= 0 && t.sp <= 5, 'sp=' + t.sp); }
  const r2 = E.simulate(E.defaultConfig());
  for (const t of r2.timeline) assert.ok(t.sp >= 0 && t.sp <= 5);
});

test('辅助 buff 作用于主 C，DoT/易伤等敌方减益生效', () => {
  const cfg = E.defaultConfig();
  const r = E.simulate(cfg);
  assert.equal(r.mainC, '9001');
  assert.ok(r.timeline.some((t) => t.charId === '9001' && t.buffs.some((b) => /鼓舞/.test(b))), 'ally buff');
  // ignoreConditions=true 丢弃条件效果（易伤 10%）→ 伤害下降
  const cfg2 = E.defaultConfig(); cfg2.options.ignoreConditions = true;
  assert.ok(E.simulate(cfg2).total < r.total);
});

test('beam 结果 ≥ 纯普攻 / 纯战技策略', () => {
  const cfg = E.defaultConfig();
  cfg.team.forEach((m) => { m.policy = { mode: 'auto', ultMode: 'auto' }; });
  const r = E.simulate(cfg);
  const run = (mode) => { const c = E.defaultConfig(); c.team.forEach((m) => { m.policy = { mode, ultMode: 'asap' }; }); return E.simulate(c).total; };
  assert.ok(r.total >= run('basicOnly') - 1e-6);
  assert.ok(r.total >= run('skillFirst') - 1e-6);
});

test('override 接口：patchKit 与 hooks 被调用', () => {
  const calls = { start: 0, turn: 0, action: 0, hit: 0, enemy: 0 };
  const OV = { '9001': {
    patchKit(kit) { kit.traceStats = Object.assign({}, kit.traceStats, { atkPct: 1.1 }); return kit; },
    hooks: {
      onBattleStart() { calls.start++; }, onTurnStart() { calls.turn++; }, onAction() { calls.action++; },
      onHit(api) { calls.hit++; return api.result.total * 2; }, onEnemyTurn() { calls.enemy++; }
    } } };
  const E2 = createEngine(FX, OV);
  const base = E.simulate(soloConfig()).total;
  const r = E2.simulate(soloConfig());
  assert.ok(calls.start === 1 && calls.turn === 3 && calls.action > 0 && calls.hit > 0 && calls.enemy > 0, JSON.stringify(calls));
  assert.ok(r.total > base * 2 * 1.5, 'patched atk and doubled hits');
  assert.equal(E2.listCharacters().find((c) => c.id === '9001').support, 'manual');
});

test('DoT：挂在敌人身上，敌人回合结算 duration 次', () => {
  const OV = { '9001': { patchKit(kit) {
    const sk = kit.skills.find((s) => s.slot === 'basic');
    sk.hits = [{ scaling: 'atk', param: 0, target: 'single', count: 1, element: 'Quantum', dmgType: 'dot', duration: 2 }];
    kit.skills = kit.skills.filter((s) => s.slot !== 'talent');
    return kit; } } };
  const E2 = createEngine(FX, OV);
  const cfg = soloConfig();
  cfg.enemy.spd = 100;
  const r = E2.simulate(cfg);
  const ticks = r.timeline.filter((t) => t.action === 'DoT');
  // 我方与敌人同速：回合 100/200/300 各挂 DoT，敌人回合 100/200/300 各结算一次（同 AV 我方先动）
  assert.equal(ticks.length, 3);
  // DoT 不暴击：没有暴击区
  const unit = 660 * 0.9 * 0.5;
  near(r.byType.dot, 3 * 1.1 * unit, 0.5);
});

test('性能（fixture，4 人 × 3 轮，ult auto）< 2 秒', () => {
  const cfg = E.defaultConfig();
  cfg.team = [E.defaultMember('9001'), E.defaultMember('9002'), E.defaultMember('9001'), E.defaultMember('9002')];
  cfg.team.forEach((m) => { m.policy = { mode: 'auto', ultMode: 'auto' }; });
  const t0 = Date.now();
  const r = E.simulate(cfg);
  assert.ok(Date.now() - t0 < 2000, 'ms=' + (Date.now() - t0));
  assert.ok(r.total > 0);
});

// ---------------- 真实数据（engine2/data.gen.js 存在时） ----------------
const GEN = fileURLToPath(new URL('../../engine2/data.gen.js', import.meta.url));
const hasGen = existsSync(GEN);

test('真实数据：defaultConfig 可运行、结果结构完整、< 2 秒', { skip: !hasGen && 'engine2/data.gen.js 尚未生成' }, async () => {
  const API = await import('../../engine2/index.js');
  assert.equal(API.ENGINE2_VERSION, '2.0.0');
  assert.ok(API.listCharacters().length > 50);
  assert.ok(API.listMonsters().length > 0);
  const cfg = API.defaultConfig();
  assert.equal(cfg.team.length, 4);
  const t0 = Date.now();
  const r = API.simulate(cfg);
  const ms = Date.now() - t0;
  assert.ok(ms < 2000, 'ms=' + ms);
  assert.ok(r.total > 0, 'total');
  assert.equal(r.byMember.length, 4);
  for (const k of ['basic', 'skill', 'ult', 'fua', 'dot', 'break', 'elation', 'true', 'memo']) assert.ok(k in r.byType, k);
  // 花火天赋：战技点上限 +2（spMax）
  assert.equal(r.maxSP, cfg.battle.maxSP + 2);
  for (const t of r.timeline) assert.ok(t.sp >= 0 && t.sp <= r.maxSP);
  assert.ok(r.total >= r.search.baseline_basicOnly - 1e-6 && r.total >= r.search.baseline_skillFirst - 1e-6);
  // ult auto 模式同样 < 2 秒
  cfg.team.forEach((m) => { m.policy.ultMode = 'auto'; });
  const t1 = Date.now();
  API.simulate(cfg);
  assert.ok(Date.now() - t1 < 2000, 'auto ms=' + (Date.now() - t1));
});

test('真实数据：全部角色单人均可模拟（不抛错）', { skip: !hasGen && 'engine2/data.gen.js 尚未生成' }, async () => {
  const API = await import('../../engine2/index.js');
  const bad = [];
  for (const c of API.listCharacters()) {
    try {
      const cfg = API.defaultConfig();
      cfg.team = [API.defaultMember(c.id)];
      cfg.options.beamWidth = 4;
      const r = API.simulate(cfg);
      if (!(r.total >= 0)) bad.push(c.id + ':NaN');
      API.computeStats(cfg.team[0]);
      API.describeKit(c.id);
    } catch (e) { bad.push(c.id + ':' + e.message); }
  }
  assert.deepEqual(bad, []);
});


// ---------------------------------------------------------------------------
// v2.1：override API / 新数据字段
const clone = (o) => JSON.parse(JSON.stringify(o));
const skillOf = (kit, slot) => kit.skills.find((s) => s.slot === slot);

test('override actions：强化普攻（战技后 2 次 A+），onUse 修改 api.custom', () => {
  const OV = {
    '9001': {
      patchKit(kit) {
        const b = skillOf(kit, 'basic');
        kit.skills.push(Object.assign(clone(b), { id: '900109', slot: 'enhancedBasic', name: '强化普攻', spGain: 0,
          params: b.params.map(() => [2.0]) }));
        return kit;
      },
      hooks: {
        actions(api) {
          if ((api.custom.enh || 0) > 0) return [{ code: 'A+', slot: 'enhancedBasic', spCost: 0, onUse(a) { a.custom.enh -= 1; } }];
          return [{ code: 'E', slot: 'skill', onUse(a) { a.custom.enh = 2; } }];
        }
      }
    }
  };
  const E2 = createEngine(FX, OV);
  const r = E2.simulate(soloConfig({ mode: 'auto', ultMode: 'asap' }));
  const rot = r.rotation['9001'].split(' ').filter((c) => c !== 'F' && c !== 'Q');
  assert.deepEqual(rot.slice(0, 3), ['E', 'A+', 'A+']);
  assert.ok(r.byMember[0].actions.enhancedBasic >= 2);
  assert.ok(r.byType.basic > 0);
});

test('override api：cast/deal/addBuff/gainSP/extraTurn/shared/ultReady', () => {
  let seen = null;
  const OV = {
    '9001': {
      hooks: {
        onBattleStart(api) {
          api.addBuff({ key: 'x:atk', stat: 'atkPct', value: 0.5, duration: null }, 'team');
          api.addShared('joke', 3);
          api.gainSP(-10);
        },
        onTurnStart(api) { if (api.unit.turns === 1) api.extraTurn(); },
        onAction(api) { if (api.phase === 'after' && api.skill.slot === 'basic' && api.unit.turns === 1) api.deal({ mult: 1, note: 'x' }, '自定义一击'); },
        ultReady(api) { return false; },
        onEnemyTurn(api) { seen = { sp: api.sp(), joke: api.shared.joke, buff: api.getBuff('x:atk', 1) }; }
      }
    }
  };
  const E2 = createEngine(FX, OV);
  const cfg = soloConfig();
  cfg.team.push({ charId: '9002', eidolon: 0, lightcone: null, relics: null, policy: { mode: 'basicOnly', ultMode: 'asap' } });
  const r = E2.simulate(cfg);
  assert.ok(seen && seen.joke === 3 && seen.buff && seen.buff.value === 0.5);
  assert.ok(!/Q/.test(r.rotation['9001']), 'ultReady=false');
  assert.ok(r.timeline.some((t) => t.skillName === '自定义一击' && t.damage > 0));
  // 额外回合：第一回合后立即再次行动（同一 AV）
  const acts = r.timeline.filter((t) => t.charId === '9001' && t.action === 'A');
  assert.equal(acts[0].av, acts[1].av);
});

test('数据字段：scaleStat/flatAdd 转化 buff、hit.extra 复合倍率、appliesTo', () => {
  const base = E.simulate(soloConfig());
  const OV = {
    '9001': {
      patchKit(kit) {
        const b = skillOf(kit, 'basic');
        b.params = b.params.map((p) => [p[0], 0.5]);
        b.hits[0].extra = { stat: 'critDmg', param: 1 };
        return kit;
      }
    }
  };
  const r = createEngine(FX, OV).simulate(soloConfig());
  // 普攻 1.1 + 0.5 × 暴伤 0.5 = 1.35
  near(r.byType.basic / base.byType.basic, 1.35 / 1.1, 1e-3);
  // 转化：辅助战技 → 目标攻击力 + 辅助攻击力 × 50% + 100（封顶 200）
  const OV2 = {
    '9002': {
      patchKit(kit) {
        const s = skillOf(kit, 'skill');
        s.effects[0] = { key: '9002:conv', stat: 'atk', value: 0.5, scaleStat: 'atk', flatAdd: 100, cap: 200, target: 'ally', duration: 1, trigger: 'onCast', maxStacks: 1 };
        return kit;
      }
    }
  };
  const cfg = soloConfig({ mode: 'basicOnly' });
  cfg.team.push({ charId: '9002', eidolon: 0, lightcone: null, relics: null, policy: { mode: 'skillFirst', ultMode: 'asap' } });
  const r2 = createEngine(FX, OV2).simulate(cfg);
  const lab = r2.timeline.flatMap((t) => t.buffs || []).find((b) => /atk=atk×50%/.test(b));
  assert.ok(lab && /→ 200/.test(lab), 'cap 生效 ' + lab);
  // appliesTo：暴伤只作用于追加攻击
  const OV3 = { '9001': { patchKit(kit) { kit.traces[0].effects[0] = { key: 't:x', stat: 'critDmg', value: 1, appliesTo: 'fua', target: 'self', duration: null, trigger: 'passive', maxStacks: 1 }; return kit; } } };
  const r3 = createEngine(FX, OV3).simulate(soloConfig({}, { options: { critMode: 'always', beamWidth: 8 } }));
  const r0 = E.simulate(soloConfig({}, { options: { critMode: 'always', beamWidth: 8 } }));
  near(r3.byType.basic, r0.byType.basic * (1 + 0.5) / (1 + 0.5), 1e-6);
  assert.ok(r3.byType.fua > r0.byType.fua * 1.5);
});

test('hit.trigger=onAllyAttack：辅助终结技后队友每次攻击触发附加伤害；specials.dotDetonate', () => {
  const OV = {
    '9002': {
      patchKit(kit) {
        const q = skillOf(kit, 'ult');
        q.params = q.params.map((p) => [p[0], p[1], 0.5]);
        q.hits = [{ scaling: 'atk', param: 2, target: 'single', count: 1, element: 'Ice', dmgType: 'ult', additional: true, trigger: 'onAllyAttack', triggerActor: 'owner' }];
        return kit;
      }
    },
    '9001': {
      patchKit(kit) {
        const b = skillOf(kit, 'basic');
        b.hits.push({ scaling: 'atk', param: 0, target: 'single', count: 1, element: 'Quantum', dmgType: 'dot', duration: 3 });
        const s = skillOf(kit, 'skill');
        s.specials = [{ kind: 'dotDetonate', param: 1 }];
        return kit;
      },
      hooks: { actions(api) { return [api.unit.turns % 2 ? { code: 'A', slot: 'basic' } : { code: 'E', slot: 'skill' }]; } }
    }
  };
  const cfg = soloConfig({ mode: 'auto' });
  cfg.team.push({ charId: '9002', eidolon: 0, lightcone: null, relics: null, policy: { mode: 'basicOnly', ultMode: 'asap' } });
  cfg.battle.startEnergyPct = 1;
  const r = createEngine(FX, OV).simulate(cfg);
  const add = r.timeline.flatMap((t) => t.hits).filter((h) => /附加/.test(h.note));
  assert.ok(add.length >= 1, '附加伤害触发');
  // 辅助终结技条目本身不结算附加伤害
  const q = r.timeline.find((t) => t.charId === '9002' && t.action === 'Q');
  assert.equal(q.damage, 0);
  assert.ok(/A .*E/.test(r.rotation['9001']), r.rotation['9001']);
  assert.ok(r.timeline.some((t) => t.action === 'E' && t.hits.some((h) => /引爆/.test(h.note))), '引爆');
});

test('ultResource=custom：无 override 时每 N 回合一次终结技', () => {
  const OV = { '9001': { patchKit(kit) { kit.ultResource = 'custom'; return kit; } } };
  const cfg = soloConfig({ customUltEvery: 2 });
  cfg.battle.startEnergyPct = 0;
  const r = createEngine(FX, OV).simulate(cfg);
  const q = (r.rotation['9001'].match(/Q/g) || []).length;
  assert.ok(q >= 1);
  assert.ok(r.warnings.some((w) => /专属资源/.test(w)));
});

test('override api：addTimer / onTimer / advanceTimer / hit.joke', () => {
  const fired = [];
  const OV = { '9001': { hooks: {
    onBattleStart(api) { api.addTimer({ id: 'm', spd: 100, name: '时刻' }); },
    onTimer(api) { fired.push(Math.round(api.av())); api.deal({ scaling: 'elation', mult: 1, joke: 0, dmgType: 'elation' }, '时刻伤害'); if (fired.length === 1) api.advanceTimer('m', 0.5); }
  } } };
  const r = createEngine(FX, OV).simulate(soloConfig());
  assert.deepEqual(fired, [100, 150, 250, 350]);
  assert.ok(r.byType.elation > 0);
});
