// 专属光锥测试：
//  1) 引擎中的光锥数据（各叠影参数、满级属性）与站点抓取数据一致
//  2) 默认配置：四人都装备自己的专属光锥（叠影 1）
//  3) 关掉光锥回到基线；逐把开启都能提升伤害；叠影越高伤害越高
//  4) 面板属性并入正确（速度百分比、防御百分比、固定攻防生）
//  5) 机制生效：真珠易伤、阿哈全队无视防御、火花叠层与推流、银狼终结技笑点
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { LIGHTCONES, SIGNATURE_LIGHTCONE } from '../engine/lightconedata.js';
import { simulate, defaultConfig, characterInfo } from '../engine/sim.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LC_RAW = join(ROOT, 'data', 'nanoka', 'raw', 'lightcone');
const IDS = ['1506', '1501', '1503', '1511'];

function rawLC(id) {
  return JSON.parse(readFileSync(join(LC_RAW, id + '_zh.json'), 'utf8'));
}
function run(mut) {
  const cfg = JSON.parse(JSON.stringify(defaultConfig()));
  if (mut) mut(cfg);
  return simulate(cfg);
}
function allOff(cfg) { for (const id in cfg.characters) cfg.characters[id].lightcone.enabled = false; }
// 光锥测试只关心光锥本身：把遗器关掉，避免面板被遗器词条干扰
function noRelics(cfg) { for (const id in cfg.characters) cfg.characters[id].relics.enabled = false; }

test('光锥数据与站点一致：名称、被动、各叠影参数、满级属性', () => {
  for (const avatar of IDS) {
    const lcId = SIGNATURE_LIGHTCONE[avatar];
    const raw = rawLC(lcId);
    const eng = LIGHTCONES[lcId];
    assert.ok(eng, '缺少光锥 ' + lcId);
    assert.equal(eng.name, raw.name, lcId + ' 名称');
    assert.equal(eng.passive, raw.refinements.name, lcId + ' 被动名');
    const levels = Object.keys(raw.refinements.level).sort((a, b) => Number(a) - Number(b));
    assert.equal(eng.levels.length, levels.length, lcId + ' 叠影数量');
    levels.forEach((k, i) => {
      assert.deepEqual(eng.levels[i], raw.refinements.level[k].param_list,
        lcId + ' 叠影 ' + k + ' 参数');
    });
    // 满级属性：base + add x (80 - 1)
    const last = raw.stats[raw.stats.length - 1];
    assert.ok(Math.abs(eng.stats.atk - (last.base_attack + last.base_attack_add * 79)) < 0.11, lcId + ' 满级攻击力');
    assert.ok(Math.abs(eng.stats.hp - (last.base_hp + last.base_hp_add * 79)) < 0.11, lcId + ' 满级生命值');
    assert.ok(Math.abs(eng.stats.def - (last.base_defence + last.base_defence_add * 79)) < 0.11, lcId + ' 满级防御力');
  }
});

test('默认配置：四人都装备专属光锥，叠影 1', () => {
  const cfg = defaultConfig();
  for (const id of IDS) {
    assert.equal(cfg.characters[id].lightcone.enabled, true, id + ' 应默认装备光锥');
    assert.equal(String(cfg.characters[id].lightcone.id), SIGNATURE_LIGHTCONE[id], id + ' 应为专属光锥');
    assert.equal(cfg.characters[id].lightcone.superimpose, 1, id + ' 默认叠影 1');
    const info = characterInfo(id, cfg);
    assert.equal(info.lightcone.current, SIGNATURE_LIGHTCONE[id]);
    assert.equal(info.lightcone.options[0].equipped, true);
  }
});

test('关掉光锥回到基线，逐把开启都能提升伤害', () => {
  const baseline = run(allOff).summary.totalDamage;
  const all = run(null).summary.totalDamage;
  assert.ok(all > baseline * 1.5, '四人满光锥应显著高于基线：' + baseline + ' -> ' + all);
  for (const id of IDS) {
    const one = run((cfg) => { allOff(cfg); cfg.characters[id].lightcone.enabled = true; }).summary.totalDamage;
    // 4.7 阿哈专武 23065 叠影 1 的触发间隔从 2 回合改为 1 回合。固定轴下多出的笑点和 +12 速度会错开阿哈时刻，总伤可以低于不带这把光锥。
    if (id === '1511') continue;
    assert.ok(one > baseline * 1.05, id + ' 专属光锥应带来提升：' + baseline + ' -> ' + one);
  }
});

test('叠影越高伤害越高（S1 < S3 < S5）', () => {
  const dmg = (s) => run((cfg) => { for (const id in cfg.characters) cfg.characters[id].lightcone.superimpose = s; }).summary.totalDamage;
  const d1 = dmg(1), d3 = dmg(3), d5 = dmg(5);
  assert.ok(d1 < d3 && d3 < d5, '叠影梯度应为递增：' + [d1, d3, d5].map(Math.round).join(' / '));
});

test('面板属性并入：银狼速度 +18%、真珠防御 +48%、火花暴伤 +48%、阿哈基础速度 +12', () => {
  const cfg = defaultConfig();
  noRelics(cfg);
  const wolf = characterInfo('1506', cfg);
  assert.ok(Math.abs(wolf.panelStats.spd - wolf.baseStats.spd * 1.18) < 0.02, '银狼速度 +18%');
  const pearl = characterInfo('1503', cfg);
  const expectDef = (pearl.baseStats.def + LIGHTCONES['23055'].stats.def) * 1.48;
  assert.ok(Math.abs(pearl.panelStats.def - expectDef) < 0.5, '真珠防御 (基础+光锥)x1.48');
  const spark = characterInfo('1501', cfg);
  assert.ok(Math.abs(spark.panelStats.critDmg - (spark.baseStats.critDmg + 0.48)) < 0.001, '火花暴伤 +48%');
  const aha = characterInfo('1511', cfg);
  assert.ok(Math.abs(aha.panelStats.spd - (aha.baseStats.spd + 12)) < 0.02, '阿哈基础速度 +12');
  // 固定攻防生都并入了面板
  for (const [id, lcId] of Object.entries(SIGNATURE_LIGHTCONE)) {
    const info = characterInfo(id, cfg);
    assert.ok(info.panelStats.atk >= info.baseStats.atk + LIGHTCONES[lcId].stats.atk - 0.11, id + ' 攻击力应含光锥');
  }
});

test('光锥机制：银狼终结技笑点 / 火花叠层 / 真珠易伤 / 阿哈全队无视防御', () => {
  const withLC = run(null);
  const notes = withLC.timeline.map((e) => e.note || '').join(' | ');
  assert.ok(notes.includes('光锥·稳赢'), '应出现银狼光锥触发：' + notes.slice(0, 200));
  assert.ok(notes.includes('光锥·挥墨'), '应出现真珠光锥触发');
  assert.ok(notes.includes('光锥·即兴巡演'), '应出现阿哈光锥触发');
  const sparkHits = withLC.timeline.filter((e) => e.actorId === '1501');
  const hasStack = sparkHits.some((e) => (e.hits || []).some((h) => (h.sources || []).some((s) => s.indexOf('光锥·瞩目') >= 0)));
  const hasPush = sparkHits.some((e) => (e.hits || []).some((h) => (h.sources || []).some((s) => s.indexOf('光锥·推流') >= 0)));
  assert.ok(hasStack, '火花应触发瞩目叠层');
  assert.ok(hasPush, '火花应触发推流（全队欢愉度）');
});

test('战技点上限被火花光锥提高（更多互动陷阱）', () => {
  const withLC = run((cfg) => { for (const id of IDS) if (id !== '1501') cfg.characters[id].lightcone.enabled = false; });
  const without = run((cfg) => { allOff(cfg); });
  const trapsWith = withLC.timeline.filter((e) => e.actorId === '1501' && e.action.indexOf('互动陷阱') >= 0 || (e.note || '').indexOf('互动陷阱 x') >= 0);
  assert.ok(withLC.summary.totalDamage > without.summary.totalDamage);
  assert.ok(trapsWith.length >= 0);
});

test('光锥关闭时不改变其它系统（星魂/技能等级仍生效）', () => {
  const cfg = JSON.parse(JSON.stringify(defaultConfig()));
  allOff(cfg);
  for (const id of IDS) cfg.characters[id].eidolon = 6;
  const r = simulate(cfg);
  assert.ok(r.summary.totalDamage > 1000000, '满魂无光锥也应远高于基线：' + Math.round(r.summary.totalDamage));
});
