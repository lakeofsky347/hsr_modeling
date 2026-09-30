// tests/v2/math.test.mjs —— 数学逻辑核对（v2.2）
// 每条断言都写明依据：公开公式（Fandom HSR Wiki：Damage / Damage RES / DEF / Toughness / Energy / Relic）或原始数据文本。
// 数值均为手算（不调用被测函数重算期望值），允许误差只来自四舍五入。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DATA as FX } from './fixtures/mini.mjs';
import { createEngine } from '../../engine2/core.js';
import { MAIN_STAT_VALUES, SUBSTAT_VALUES } from '../../engine2/stats.js';
import { resistanceRegion, defenseRegion, breakHit, superBreakHit, normalHit, critRegion } from '../../engine2/formula.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' got ' + a + ' expected ' + b);
const GEN = fileURLToPath(new URL('../../engine2/data.gen.js', import.meta.url));
const hasGen = existsSync(GEN);
const COCOLIA_DEF = 100 / ((95 + 20) + 100); // 防御区：(80+20)/((95+20)×(1-减防-无视)+(80+20)) = 100/215

// ---------------------------------------------------------------- 1. 面板常数
test('主词条：5★ +15 满级数值', () => {
  // 5★ 主词条 +15：攻击力 352.8、生命 705.6、暴击率 32.4%、暴伤 64.8%、攻/生% 43.2%、防% 54%、速度 25.032、
  // 击破 64.8%、元素伤害 38.88%、充能 19.44%、命中 43.2%、治疗 34.56%
  const want = { atk: 352.8, hp: 705.6, critRate: 0.324, critDmg: 0.648, atkPct: 0.432, hpPct: 0.432, defPct: 0.54,
    spd: 25.032, breakEffect: 0.648, dmgBonus: 0.3888, energyRegen: 0.1944, effectHitRate: 0.432, outgoingHeal: 0.3456 };
  for (const k in want) near(MAIN_STAT_VALUES[k], want[k], 1e-9, k);
});

test('副词条：1 个有效词条 = 中档（最大档 × 0.9 = 三档平均）', () => {
  // 5★ 副词条最大档（1.0 档）：暴击率 3.24%、暴伤 6.48%、攻/生/命中/抵抗 4.32%、防 5.4%、速度 2.6、击破 6.48%、小攻/小防 21.168、小生 42.337
  const hi = { critRate: 0.0324, critDmg: 0.0648, atkPct: 0.0432, hpPct: 0.0432, effectHitRate: 0.0432, effectRes: 0.0432,
    defPct: 0.054, spd: 2.6, breakEffect: 0.0648, atk: 21.168, def: 21.168, hp: 42.337 };
  for (const k in hi) if (k !== 'spd') near(SUBSTAT_VALUES[k], hi[k] * 0.9, 1e-3 * hi[k], k);
  near(SUBSTAT_VALUES.spd, 2.3, 1e-9, 'spd 中档 2.3（三档 2.0 / 2.3 / 2.6）');
});

// ---------------------------------------------------------------- 2. 伤害公式
test('抗性区：有效抗性限制在 [-100%, 90%] → 乘区 [0.1, 2]', () => {
  // Fandom「Damage RES」: "Damage RES ranges between -100% and 90%. Therefore, RES Multiplier ranges between 10% and 200%."
  near(resistanceRegion(0.2, 0), 0.8, 1e-12);
  near(resistanceRegion(0, 0.2), 1.2, 1e-12);
  near(resistanceRegion(2.0, 0), 0.1, 1e-12, '上限 90%');
  near(resistanceRegion(0.2, 5), 2.0, 1e-12, '下限 -100%');
});

test('防御区：(80+20)/((Lv+20)×(1-减防-无视)+100)', () => {
  near(defenseRegion(80, 95, 0, 0), COCOLIA_DEF, 1e-12);
  near(defenseRegion(80, 95, 0.2, 0.1), 100 / (115 * 0.7 + 100), 1e-12);
  near(defenseRegion(80, 95, 2, 0), 1, 1e-12, '减防总和上限 100%');
});

test('暴击期望 / 韧性区 0.9', () => {
  near(critRegion(0.6, 1.5, false), 1.9, 1e-12);
  near(critRegion(1, 1.5, false), 2.5, 1e-12, '暴击率 100%（sim.hitDamage 先把暴击率截断到 [0,1]）');
  const p = { scalingValue: 1000, multiplier: 1, dmgBonus: 0, critRate: 0, critDmg: 0, vulnerability: [0], res: 0, resShred: 0, attackerLevel: 80, targetLevel: 80 };
  near(normalHit(Object.assign({ toughnessDR: 0.1, broken: false }, p)).damage / normalHit(Object.assign({ toughnessDR: 0.1, broken: true }, p)).damage, 0.9, 1e-12);
});

test('击破 / 超击破公式', () => {
  // 击破：元素系数 × 3767.5533 × (0.5 + 韧性上限/40) × (1+击破特攻) × 易伤 × 抗性 × 防御 × 0.9(未击破)
  const b = breakHit({ element: 'Fire', maxToughness: 540, breakEffect: 1, vulnerability: [0.2], res: 0, resShred: 0, attackerLevel: 80, targetLevel: 95 }).damage;
  near(b, 2 * 3767.5533 * (0.5 + 180 / 40) * 2 * 1.2 * COCOLIA_DEF * 0.9, 1e-6);
  // 超击破：3767.5533 × 削韧/10 × 超击破倍率 × (1+击破特攻) × …（削韧用游戏显示单位，数据 90 = 30）
  const s = superBreakHit({ toughnessReduced: 90, superBreak: 0.35, breakEffect: 2, vulnerability: [0], res: 0, resShred: 0.25, attackerLevel: 80, targetLevel: 95 }).damage;
  near(s, 3767.5533 * 3 * 0.35 * 3 * 1.25 * COCOLIA_DEF, 1e-6);
});

// ---------------------------------------------------------------- 3. 时间轴 / 能量（fixture）
test('能量：回能效果受能量恢复效率影响（固定恢复除外）', () => {
  // Fandom「Energy」: Energy regenerated = base × (100% + Energy Regeneration Rate)，官方列出的「固定恢复」例外不受影响
  const fx = structuredClone(FX);
  const sk = fx.characters['9001'].skills.find((s) => s.slot === 'skill');
  sk.effects.push({ key: '9001:skill:e', stat: 'energyFlat', value: 10, target: 'self', duration: null, trigger: 'onCast', maxStacks: 1, condition: null, confidence: 'high', raw: '恢复10点能量' });
  const E = createEngine(fx, {});
  const run = (er) => {
    const cfg = { team: [{ charId: '9001', eidolon: 0, lightcone: null, relics: null, statOverrides: er ? { energyRegen: er } : {}, policy: { mode: 'skillFirst', ultMode: 'never' } }],
      enemy: { name: 'T', level: 80, count: 1, toughness: 300, weak: [], res: {}, spd: 100 }, battle: { cycles: 1, startSP: 3, maxSP: 5, startEnergyPct: 0.5 }, options: {} };
    return E.simulate(cfg).timeline.find((t) => t.action === 'E').energy;
  };
  near(run(0), 60 + 30 + 10, 1e-6, 'ER 0');
  near(run(0.2), 60 + (30 + 10) * 1.2, 0.1, 'ER 20%：战技 30 与效果 10 都 ×1.2');
});

// ---------------------------------------------------------------- 真实数据
if (hasGen) {
  const { DATA } = await import('../../engine2/data.gen.js');
  const { OVERRIDES } = await import('../../engine2/overrides/index.js');
  const { collectEffects } = await import('../../engine2/effects.js');
  const E = createEngine(DATA, OVERRIDES);
  const solo = (id, pol) => {
    const cfg = E.defaultConfig();
    cfg.team = [{ charId: id, eidolon: 0, lightcone: null, relics: null, policy: Object.assign({ mode: 'skillFirst', ultMode: 'asap' }, pol || {}) }];
    cfg.enemy = E.defaultEnemy('1005010'); // 可可利亚·虚妄之母：Lv95，弱 火/雷/量子，韧性 540（显示 180），量子/火/雷抗 0
    return E.simulate(cfg);
  };

  test('数据：80 级白值 = 1 级 + 成长 × 79（含突破）', () => {
    // 希儿 1102 攻击力 1 级 75.46，80 级 640.33（Fandom 角色页）；光锥 23001「于夜色中」80 级攻击 582.12
    near(DATA.characters['1102'].base.atk, 640.332, 0.01, '希儿 atk');
    near(DATA.characters['1102'].base.spd, 115, 1e-9, '希儿 spd');
    near(DATA.lightcones['23001'].base.atk, 582.12, 0.01, 'LC atk');
    assert.equal(DATA.lightcones['23001'].base.spd || 0, 0, '光锥无速度白值 → 速度% 只乘角色白值');
  });

  test('手算：希儿单人（无光锥/遗器）3 轮 — 面板 → 每一击 → 总伤', () => {
    const r = solo('1102');
    const s = r.finalStats[0];
    // 面板：atk = 640.332 × (1 + 行迹 28%) = 819.625；暴击 5% / 暴伤 50%+24% = 74%；速度 115
    near(s.atk, 640.332 * 1.28, 0.01, 'atk');
    near(s.critRate, 0.05, 1e-9); near(s.critDmg, 0.74, 1e-9); near(s.spd, 115, 1e-9);
    // 单位伤害 = atk × (1 + 天赋增伤 80%) × 暴击期望 (1+0.05×0.74) × 抗性 (1-(0-20% 量子穿透)) × 韧性 0.9 × 防御 100/215
    const unit = 819.625 * 1.8 * (1 + 0.05 * 0.74) * 1.2 * 0.9 * COCOLIA_DEF;
    near(unit, 768.514, 0.01, 'unit');
    const acts = r.timeline.filter((t) => t.charId === '1102');
    // 行动：AV 10000/115 = 86.96 战技（速度 +25% 2 回合）→ +10000/143.75 = 156.52 战技，能量 60+30+30 = 120 → 立即终结技
    //       → 226.09 战技（战技点 0）→ 295.65 普攻（再 +69.57 并行动提前 20% 仍 > 350，战斗结束）
    const want = [['E', 86.96, 2.2, 2, 90], ['E', 156.52, 2.2, 1, 120], ['Q', 156.52, 4.25, 1, 5], ['E', 226.09, 2.2, 0, 35], ['A', 295.65, 1.0, 1, 55]];
    assert.equal(acts.length, want.length);
    want.forEach(([code, av, mult, sp, en], k) => {
      assert.equal(acts[k].action, code, 'action ' + k);
      near(acts[k].av, av, 0.01, 'av ' + k);
      near(acts[k].damage, mult * unit, 0.1, 'dmg ' + k);
      assert.equal(acts[k].sp, sp, 'sp ' + k);
      near(acts[k].energy, en, 0.1, 'energy ' + k);
    });
    // 削韧 60+60+90(终结技)+60+30 = 300 < 540，未击破
    assert.equal(r.breaks || 0, 0);
    near(r.total, (2.2 * 3 + 4.25 + 1) * unit, 0.5, 'total');
  });

  test('手算：卡芙卡单人 — DoT 不暴击、引爆倍率', () => {
    // Fandom「Damage」：DoT 不能暴击。触电 = 290% atk（终结技 Lv10），引爆：终结技 100%、战技 75%
    const r = solo('1005');
    const atk = r.finalStats[0].atk;
    const dot = 2.9 * atk * 1 /* 无增伤 */ * 1 /* 雷抗 0 */ * 0.9 * COCOLIA_DEF; // 无暴击区
    const ticks = r.timeline.filter((t) => t.action === 'DoT');
    assert.ok(ticks.length >= 1);
    ticks.forEach((t) => near(t.damage, dot, 0.1, 'DoT tick'));
    const skill = r.timeline.find((t) => t.action === 'E');
    near(skill.hits[0].dmg, 1.6 * atk * (1 + 0.05 * 0.5) * 0.9 * COCOLIA_DEF, 0.1, '战技 160%（直伤有暴击期望）');
    const det = r.timeline.flatMap((t) => t.hits || []).filter((h) => /引爆/.test(h.note || ''));
    assert.ok(det.some((h) => Math.abs(h.dmg - dot) < 0.1), '终结技引爆 ×1');
    assert.ok(det.some((h) => Math.abs(h.dmg - 0.75 * dot) < 0.1), '战技引爆 ×0.75');
  });

  test('手算：流萤单人 — 击破伤害（韧性 180、火 ×2、完全燃烧击破易伤 20%、未击破 0.9）', () => {
    const r = solo('1310');
    const be = r.finalStats[0].breakEffect;
    near(be, 0.373, 1e-6, '行迹 37.3% 击破特攻（过载核心不再常驻 +0.8%）');
    const brk = r.timeline.flatMap((t) => t.hits || []).find((h) => h.note === '击破');
    assert.ok(brk, '应击破一次');
    near(brk.dmg, 2 * 3767.5533 * (0.5 + 180 / 40) * (1 + be) * 1.2 * COCOLIA_DEF * 0.9, 0.5);
    // 强化战技：倍率 200% + 0.2 × min(击破特攻, 360%)
    const ep = r.timeline.find((t) => t.action === 'E+');
    near(ep.hits[0].dmg, (2 + 0.2 * be) * r.finalStats[0].atk * 1.025 * 0.9 * COCOLIA_DEF, 0.1);
  });

  test('流萤队：强化战技计入削韧 / 超击破 / 队友“攻击后”触发', () => {
    const cfg = E.defaultConfig();
    cfg.team = ['1310', '1303', '1217', '1309'].map((id) => E.defaultMember(id));
    cfg.enemy = E.defaultEnemy('1005010');
    const r = E.simulate(cfg);
    assert.ok(/E\+/.test(r.rotation['1310']), '完全燃烧期间应使用强化战技');
    const hits = r.timeline.filter((t) => t.action === 'E+').flatMap((t) => t.hits);
    assert.ok(hits.some((h) => h.note === '超击破' && h.dmg > 0), '击破状态下强化战技触发超击破');
    assert.ok(r.byType.break > 0);
  });

  test('效果标记：固定恢复能量 / 施放者回合开始递减', () => {
    const find = (id, pred) => collectEffects(DATA, E.defaultMember(id), {}).list.filter(pred);
    // 流萤战技「固定恢复等同于自身60%能量上限的能量」
    assert.ok(find('1310', (e) => e.stat === 'energyPct').every((e) => e.fixedEnergy));
    // 停云终结技：官方列为不受充能影响（Fandom Energy 例外表）
    assert.ok(find('1202', (e) => e.stat === 'energyFlat' && /ult|终结技/.test(e.label || e.sourceKey || '')).every((e) => e.fixedEnergy));
    // 知更鸟战技「持续3回合，知更鸟每回合开始时持续回合数减1」
    const rb = find('1309', (e) => e.stat === 'dmgBonus' && /130902/.test(e.sourceKey || e.key || ''));
    assert.ok(rb.length && rb.every((e) => e.tickOnCaster), 'Robin skill tickOnCaster');
    assert.ok(find('1102', (e) => e.stat === 'spdPct').every((e) => !e.tickOnCaster), '希儿战技按持有者回合');
  });

  test('数据解析：限定类型的无视防御 / 自身易伤 / 最多计入 N 个', () => {
    const r4 = DATA.relicSets['119'].set4.effects.map((e) => e.stat);
    assert.deepEqual(r4, ['defIgnore_break', 'defIgnore_superBreak'], '铁骑：击破 10% / 超击破额外 15%');
    const lc = DATA.lightcones['23025'].effects.find((e) => e.stat === 'vuln_break');
    assert.ok(lc && lc.target === 'self', '梦应归于何处：受到装备者造成的击破伤害 +24%');
    assert.equal(DATA.relicSets['116'].set4.effects[0].maxStacks, 3, '系囚：最多计入 3 个 DoT');
    assert.ok(DATA.lightcones['23020'].effects.some((e) => e.stat === 'defIgnore_fua'), '纯粹思维的洗礼：追加攻击无视防御');
  });
}
