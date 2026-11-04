// 排轴机制回归：每条都对应一个可以手算的行动值 / 回合规则。
// 持续回合：持有者回合结束时 −1，施加的那一回合也算（队友在回合外挂上的 buff 则从受益者下一次行动算起）。
// 行动值：提前比例 × 10000/当前速度；敌人「行动延后」同式加到剩余行动值上。数值来自技能描述或 fixture，不另估。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../../engine2/core.js';
import { DATA as FX } from './fixtures/mini.mjs';
import { collectEffects } from '../../engine2/effects.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' got ' + a + ' expected ' + b);

function run(data, ov, cfg) {
  return createEngine(data, ov || {}).simulate(cfg);
}
function acts(r, id) {
  return r.timeline.filter((t) => t.charId === id && t.action !== 'enemy' && t.action !== 'DoT');
}

test('自身 2 回合增益：施放回合计入，只覆盖 2 次行动', () => {
  const OV = { '9001': { hooks: { actions(api) {
    return api.unit.turns === 1 ? [{ code: 'E', slot: 'skill' }] : [{ code: 'A', slot: 'basic' }];
  } } } };
  const r = run(FX, OV, {
    team: [{ charId: '9001', eidolon: 0, lightcone: null, relics: null, policy: { mode: 'auto', ultMode: 'asap', fuaPerTurn: 0 } }],
    enemy: { name: 'T', level: 80, count: 1, toughness: 99999, weak: [], res: { Quantum: 0 }, spd: 1, allowBreak: false },
    battle: { cycles: 1, firstCycleAV: 500, avPerCycle: 100, startSP: 5, maxSP: 5, startEnergyPct: 0 },
    options: { critMode: 'always', beamWidth: 2, ignoreConditions: true }
  });
  const rows = acts(r, '9001').filter((t) => t.action === 'E' || t.action === 'A');
  const on = rows.filter((t) => (t.buffs || []).some((b) => /atkPct/.test(b)));
  assert.equal(on.length, 2, 'duration 2 应覆盖战技当次 + 下一次，实际 ' + on.map((t) => t.av + (t.buffs || []).join(' ')).join(' | '));
  assert.equal(rows[2] && (rows[2].buffs || []).some((b) => /atkPct/.test(b)), false);
});

test('回合外挂上的 1 回合增益只覆盖受益者的下一次行动', () => {
  const r = run(FX, {
    '9001': { hooks: { actions() { return [{ code: 'A', slot: 'basic' }]; } } },
    '9002': { hooks: { actions(api) { return api.unit.turns === 1 ? [{ code: 'E', slot: 'skill' }] : [{ code: 'A', slot: 'basic' }]; } } }
  }, {
    team: [
      { charId: '9001', eidolon: 0, lightcone: null, relics: null, statOverrides: { spd: 100 }, policy: { mode: 'basicOnly', ultMode: 'asap', fuaPerTurn: 0 } },
      { charId: '9002', eidolon: 0, lightcone: null, relics: null, statOverrides: { spd: 105 }, policy: { mode: 'auto', ultMode: 'asap', fuaPerTurn: 0 } }
    ],
    enemy: { name: 'T', level: 80, count: 1, toughness: 99999, weak: [], res: { Quantum: 0, Ice: 0 }, spd: 1, allowBreak: false },
    battle: { cycles: 1, firstCycleAV: 350, avPerCycle: 100, startSP: 5, maxSP: 5, startEnergyPct: 0 },
    options: { critMode: 'always', beamWidth: 2, ignoreConditions: true }
  });
  const dps = acts(r, '9001').filter((t) => t.action === 'A');
  const buffed = dps.filter((t) => (t.buffs || []).some((b) => /dmgBonus/.test(b)));
  assert.equal(buffed.length, 1, '1 回合增益只能覆盖一次普攻');
  const idx = dps.indexOf(buffed[0]);
  assert.equal((dps[idx + 1].buffs || []).some((b) => /dmgBonus/.test(b)), false);
});

test('行动中补满的终结技仍吃得到本回合的 1 回合增益', () => {
  const r = run(FX, {
    '9001': { hooks: {
      onBattleStart(api) { api.setEnergy(api.member.energyMax - 20); },
      actions() { return [{ code: 'A', slot: 'basic' }]; }
    } },
    '9002': { hooks: { actions(api) { return api.unit.turns === 1 ? [{ code: 'E', slot: 'skill' }] : [{ code: 'A', slot: 'basic' }]; } } }
  }, {
    team: [
      { charId: '9002', eidolon: 0, lightcone: null, relics: null, statOverrides: { spd: 120 }, policy: { mode: 'auto', ultMode: 'asap', fuaPerTurn: 0 } },
      { charId: '9001', eidolon: 0, lightcone: null, relics: null, statOverrides: { spd: 100 }, policy: { mode: 'basicOnly', ultMode: 'asap', fuaPerTurn: 0 } }
    ],
    enemy: { name: 'T', level: 80, count: 1, toughness: 99999, weak: [], res: { Quantum: 0, Ice: 0 }, spd: 1, allowBreak: false },
    battle: { cycles: 1, firstCycleAV: 250, avPerCycle: 100, startSP: 5, maxSP: 5, startEnergyPct: 0 },
    options: { critMode: 'always', beamWidth: 2, ignoreConditions: true }
  });
  const basic = acts(r, '9001').find((t) => t.action === 'A' && (t.buffs || []).some((b) => /dmgBonus/.test(b)));
  const ult = acts(r, '9001').find((t) => t.action === 'Q');
  assert.ok(basic && ult, '应有吃到增益的普攻和终结技');
  assert.equal(ult.av, basic.av);
  assert.ok((ult.buffs || []).some((b) => /dmgBonus/.test(b)), '终结技 buff：' + (ult.buffs || []).join(','));
  assert.ok(ult.damage > basic.damage, '终结技倍率更高，且不能因为增益已消退而变低');
});

test('50% 行动提前：从剩余行动值减去 0.5 × 10000/速度', () => {
  const r = run(FX, {
    '9002': { hooks: { onAction(api) {
      if (api.phase === 'after' && api.unit.turns === 1 && api.skill.slot === 'basic') api.advance(0.5, 0);
    } } }
  }, {
    team: [
      { charId: '9001', eidolon: 0, lightcone: null, relics: null, statOverrides: { spd: 100 }, policy: { mode: 'basicOnly', ultMode: 'asap', fuaPerTurn: 0 } },
      { charId: '9002', eidolon: 0, lightcone: null, relics: null, statOverrides: { spd: 100 }, policy: { mode: 'basicOnly', ultMode: 'asap', fuaPerTurn: 0 } }
    ],
    enemy: { name: 'T', level: 80, count: 1, toughness: 99999, weak: [], res: { Quantum: 0, Ice: 0 }, spd: 1, allowBreak: false },
    battle: { cycles: 1, firstCycleAV: 400, avPerCycle: 100, startSP: 5, maxSP: 5, startEnergyPct: 0 },
    options: { critMode: 'always', beamWidth: 1 }
  });
  const a = acts(r, '9001').filter((t) => t.action === 'A').map((t) => t.av);
  // 同速 100：两人第一次都在 100。辅助普攻后把输出从 200 拉到 150。
  near(a[0], 100, 0.02);
  near(a[1], 150, 0.02);
  near(a[2], 250, 0.02);
});

const real = await import('../../engine2/index.js').then((m) => m).catch(() => null);

test('布洛妮娅对自身战技不立即行动', { skip: !real && 'no data' }, () => {
  const m = real.defaultMember('1101');
  m.lightcone = null;
  m.relics = { set4: null, set2: null, mainStats: {}, subStats: {} };
  m.statOverrides = { spd: 100 };
  m.policy = { mode: 'skillFirst', ultMode: 'asap', fuaPerTurn: 0 };
  const r = real.simulate({
    team: [m],
    enemy: { name: 'T', level: 80, count: 1, toughness: 99999, weak: [], res: { Wind: 0, Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Quantum: 0, Imaginary: 0 }, spd: 1, allowBreak: false },
    battle: { cycles: 1, firstCycleAV: 250, avPerCycle: 100, startSP: 3, maxSP: 5, startEnergyPct: 0 },
    options: { critMode: 'expected', beamWidth: 2, ignoreConditions: true }
  });
  const skills = r.timeline.filter((t) => t.action === 'E');
  assert.ok(skills.length >= 2);
  near(skills[1].av - skills[0].av, 100, 1, '两次战技应相隔一整条行动值，而不是叠在同一 AV');
});

test('花火对自身战技不行动提前', { skip: !real && 'no data' }, () => {
  const eff = collectEffects(real.DATA, { charId: '1306', eidolon: 0, lightcone: null, relics: null }, {}).list.find((e) => e.stat === 'actionAdvance' && /130602/.test(e.skillId || e.key || ''));
  assert.equal(eff.noSelfAdvance, true);
  const br = collectEffects(real.DATA, { charId: '1101', eidolon: 0, lightcone: null, relics: null }, {}).list.find((e) => e.stat === 'actionAdvance' && /110102/.test(e.key || ''));
  assert.equal(br.noSelfAdvance, true);
  const sun = collectEffects(real.DATA, { charId: '1313', eidolon: 0, lightcone: null, relics: null }, {}).list.find((e) => e.stat === 'actionAdvance');
  assert.equal(sun.noAdvanceOnPath, 'Shaman');
});

test('波提欧终结技行动延后 40%；瓦尔特禁锢延后 40% 并减速 10% 持续 1 回合', { skip: !real && 'no data' }, () => {
  const booth = collectEffects(real.DATA, { charId: '1315', eidolon: 0, lightcone: null, relics: null }, {}).list.filter((e) => /ctrl/.test(e.key));
  const bDelay = booth.find((e) => e.stat === 'actionAdvance');
  assert.ok(bDelay && bDelay.value === 0.4 && bDelay.target === 'enemy', JSON.stringify(booth));
  const welt = collectEffects(real.DATA, { charId: '1004', eidolon: 0, lightcone: null, relics: null }, {}).list.filter((e) => /ctrl/.test(e.key));
  const wDelay = welt.find((e) => e.stat === 'actionAdvance');
  const wSlow = welt.find((e) => e.stat === 'spdPct');
  assert.equal(wDelay && wDelay.value, 0.4);
  assert.ok(wSlow && Math.abs(wSlow.value + 0.1) < 1e-9 && wSlow.duration === 1, JSON.stringify(wSlow));
  // 丹恒战技是暴击才减速，不应被当成必中
  const dan = collectEffects(real.DATA, { charId: '1002', eidolon: 0, lightcone: null, relics: null }, {}).list.filter((e) => /ctrl/.test(e.key) && e.stat === 'spdPct');
  assert.equal(dan.length, 0);
});

test('击破后额外延后：忘归人 15%，同谐开拓者 30%', { skip: !real && 'no data' }, () => {
  const ids = real.listCharacters().map((c) => c.id);
  const found = [];
  for (const id of ids) {
    const list = collectEffects(real.DATA, { charId: id, eidolon: 0, lightcone: null, relics: null }, {}).list;
    list.forEach((e) => { if (e.trigger === 'onBreak' && e.stat === 'actionAdvance') found.push(id + ':' + e.value); });
  }
  assert.ok(found.some((s) => s.endsWith(':0.15')), found.join(','));
  assert.ok(found.some((s) => s.endsWith(':0.3')), found.join(','));
});

test('哀歌覆国的诗人 4 件：速度降低 8% 计入面板', { skip: !real && 'no data' }, () => {
  const bare = real.defaultMember('1102');
  bare.lightcone = null;
  bare.relics = { set4: null, set2: null, mainStats: {}, subStats: {} };
  bare.statOverrides = {};
  const withSet = Object.assign({}, bare, { relics: { set4: '124', set2: null, mainStats: {}, subStats: {} } });
  const a = real.computeStats(bare).spd;
  const b = real.computeStats(withSet).spd;
  near(a - b, bare ? real.DATA.characters['1102'].base.spd * 0.08 : 0, 0.02, 'spd drop');
});

test('知更鸟终结技插在自己回合内时，协奏倒计时仍是 10000/90', { skip: !real && 'no data' }, () => {
  const rb = real.defaultMember('1309');
  rb.lightcone = null;
  rb.relics = { set4: null, set2: null, mainStats: {}, subStats: {} };
  rb.statOverrides = { spd: 100 };
  rb.policy = { mode: 'basicOnly', ultMode: 'asap', fuaPerTurn: 0 };
  const dps = real.defaultMember('1102');
  dps.lightcone = null;
  dps.relics = { set4: null, set2: null, mainStats: {}, subStats: {} };
  dps.statOverrides = { spd: 80 };
  dps.policy = { mode: 'basicOnly', ultMode: 'asap', fuaPerTurn: 0 };
  const r = real.simulate({
    team: [rb, dps],
    enemy: { name: 'T', level: 80, count: 1, toughness: 99999, weak: [], res: { Physical: 0, Quantum: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Imaginary: 0 }, spd: 1, allowBreak: false },
    battle: { cycles: 2, firstCycleAV: 150, avPerCycle: 100, startSP: 5, maxSP: 5, startEnergyPct: 0.92 },
    options: { critMode: 'expected', beamWidth: 4, ignoreConditions: true }
  });
  const q = r.timeline.find((t) => t.charId === '1309' && t.action === 'Q');
  const next = r.timeline.find((t) => t.charId === '1309' && t.action === 'A' && t.av > q.av);
  assert.ok(q && next, '知更鸟应在开场能量已满时于自己的回合插入终结技，并在倒计时后回来');
  near(next.av - q.av, 10000 / 90, 0.2, '协奏速度 90');
});
