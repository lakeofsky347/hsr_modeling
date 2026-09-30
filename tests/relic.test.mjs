// 遗器测试：
//  1) 引擎内遗器数据（2/4 件套原文与参数）与站点抓取一致；推荐顺序来自站点
//  2) 默认启用遗器；关闭后回到无遗器基线
//  3) 主词条 / 副词条 / 套装属性并入面板，且随有效词条数单调变化
//  4) 套装机制在时间轴中可见（129 无视防御叠层、324 暴伤、133/121 对我方施法、325 欢愉度档位）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RELICS, RECOMMENDED_RELICS } from '../engine/relicdata.js';
import { simulate, defaultConfig, characterInfo } from '../engine/sim.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RS = JSON.parse(readFileSync(join(ROOT, 'data', 'nanoka', 'raw', 'support', 'relicset.json'), 'utf8'));
const IDS = ['1506', '1501', '1503', '1511'];
const strip = (t) => (t || '').replace(/<[^>]+>/g, '');

function run(mut) {
  const cfg = JSON.parse(JSON.stringify(defaultConfig()));
  if (mut) mut(cfg);
  return simulate(cfg);
}
function noRelics(cfg) { for (const id in cfg.characters) cfg.characters[id].relics.enabled = false; }
function noLightcones(cfg) { for (const id in cfg.characters) cfg.characters[id].lightcone.enabled = false; }

test('遗器数据与站点一致：2/4 件套文案与参数', () => {
  for (const sid of Object.keys(RELICS)) {
    const src = RS[sid];
    assert.ok(src, '站点缺少套装 ' + sid);
    const eng = RELICS[sid];
    assert.equal(eng.name, src.zh, sid + ' 名称');
    for (const k of ['2', '4']) {
      const s = (src.set || {})[k];
      if (!s) { assert.equal(eng[k === '2' ? 'two' : 'four'], null, sid + ' ' + k + ' 件套'); continue; }
      const e = eng[k === '2' ? 'two' : 'four'];
      assert.equal(e.desc, strip(s.zh), sid + ' ' + k + ' 件套文案');
      assert.deepEqual(e.params, s.ParamList || [], sid + ' ' + k + ' 件套参数');
    }
  }
});

test('推荐顺序来自站点（首选 = 列表第一个）', () => {
  for (const id of IDS) {
    const info = characterInfo(id, defaultConfig());
    const rec = RECOMMENDED_RELICS[id];
    assert.equal(info.relics.current.set4, rec.set4[0], id + ' 外圈首选');
    assert.equal(info.relics.current.set2, rec.set2[0], id + ' 内圈首选');
    assert.equal(info.relics.options4.length, rec.set4.length, id + ' 外圈候选数');
  }
});

test('默认启用遗器；关掉后回到无遗器基线', () => {
  const cfg = defaultConfig();
  for (const id of IDS) assert.equal(cfg.characters[id].relics.enabled, true, id + ' 应默认启用遗器');
  const withR = run(null).summary.totalDamage;
  const without = run(noRelics).summary.totalDamage;
  assert.ok(withR > without * 1.3, '遗器应显著提升伤害：' + Math.round(without) + ' -> ' + Math.round(withR));
});

test('主词条 + 副词条并入面板，且随有效词条数单调提升', () => {
  const cfg = defaultConfig();
  const info = characterInfo('1506', cfg);
  const base = info.baseStats;
  assert.ok(info.panelStats.spd > base.spd, '速度应包含脚部主词条与副词条');
  assert.ok(info.panelStats.critRate > base.critRate, '暴击率应包含躯干主词条');
  assert.ok(info.panelStats.def > base.def, '防御力应包含位面球/连结绳主词条');
  const dmg = (rolls) => run((c) => { for (const id in c.characters) c.characters[id].relics.substatRolls = rolls; }).summary.totalDamage;
  const d0 = dmg(0), d12 = dmg(12), d24 = dmg(24);
  assert.ok(d0 < d12 && d12 < d24, '副词条越多伤害越高：' + [d0, d12, d24].map(Math.round).join(' / '));
});

test('套装机制在时间轴中可见', () => {
  const r = run(null);
  const notes = r.timeline.map((e) => e.note || '').join(' | ');
  const sources = r.timeline.flatMap((e) => e.hits || []).flatMap((h) => h.sources || []).join(' | ');
  const all = notes + ' | ' + sources;
  assert.ok(all.includes('遗器·闪耀功勋的魔法少女'), '应出现魔法少女 4 件套无视防御');
  assert.ok(all.includes('遗器·零号关卡朋克洛德'), '应出现朋克洛德欢愉度/暴伤');
  // 面板类加成（主词条/副词条/2 件套属性）记录在 characterInfo().relicBonus.sources
  const panelSrc = characterInfo('1506', defaultConfig()).relicBonus.sources.join(' | ');
  assert.ok(panelSrc.includes('主词条'), '面板应记录主词条来源：' + panelSrc.slice(0, 120));
  assert.ok(panelSrc.includes('副词条'), '面板应记录副词条来源');
  assert.ok(panelSrc.includes('主词条·脚部 速度'), '银狼脚部主词条应为速度');
});

test('切换套装会改变结果（4 件套与 2 件套都可选）', () => {
  const a = run((cfg) => { for (const id in cfg.characters) cfg.characters[id].relics.set4 = RECOMMENDED_RELICS[id].set4[0]; });
  const b = run((cfg) => { for (const id in cfg.characters) { const l = RECOMMENDED_RELICS[id].set4; if (l[1]) cfg.characters[id].relics.set4 = l[1]; } });
  assert.notEqual(Math.round(a.summary.totalDamage), Math.round(b.summary.totalDamage));
});
