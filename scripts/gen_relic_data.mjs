#!/usr/bin/env node
// ============================================================================
// 从抓取数据生成遗器数据：engine/relicdata.js
//   RELICS[id]              = { name, nameEn, two:{desc,params}, four:{desc,params} }
//   RECOMMENDED_RELICS[cid] = { set4:[id...], set2:[id...], mainStats:[...], subStats:[...] }（站点推荐顺序）
// 数据源：data/nanoka/raw/support/relicset.json + data/nanoka/normalized/<id>_*.json
// 用法：node scripts/gen_relic_data.mjs
// ============================================================================
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUP = join(ROOT, 'data', 'nanoka', 'raw', 'support', 'relicset.json');
const NORM = join(ROOT, 'data', 'nanoka', 'normalized');
const IDS = ['1506', '1501', '1503', '1511'];

const strip = (t) => (t || '').replace(/<[^>]+>/g, '');

const raw = JSON.parse(readFileSync(SUP, 'utf8'));
const recs = {};
const need = new Set();
for (const id of IDS) {
  const f = readdirSync(NORM).find((x) => x.startsWith(id + '_'));
  const d = JSON.parse(readFileSync(join(NORM, f), 'utf8'));
  const b = d.build || {};
  recs[id] = {
    set4: (b.relic_set_ids || []).map(String),
    set2: (b.planar_set_ids || []).map(String),
    mainStats: (b.main_stats || []).map((m) => ({ slot: m.slot, prop: m.prop, propCode: m.prop_code })),
    subStats: b.sub_stats || []
  };
  recs[id].set4.concat(recs[id].set2).forEach((x) => need.add(x));
}

const relics = {};
for (const id of [...need].sort()) {
  const s = raw[id];
  if (!s) { console.log('  ! 缺少套装数据 ' + id); continue; }
  const two = (s.set || {})['2'] || {};
  const four = (s.set || {})['4'] || {};
  relics[id] = {
    name: s.zh, nameEn: s.en,
    two: two.zh ? { desc: strip(two.zh), params: two.ParamList || [] } : null,
    four: four.zh ? { desc: strip(four.zh), params: four.ParamList || [] } : null
  };
}

const js = '// 由 scripts/gen_relic_data.mjs 自动生成（数据源 hsr.nanoka.cc 4.7），请勿手改\n' +
  '// 2 件套 / 4 件套效果文本与参数（params 与 desc 中的 #1 #2 ... 一一对应）\n' +
  'export const RELICS = ' + JSON.stringify(relics, null, 1) + ';\n\n' +
  '// 站点给出的推荐顺序（首个为首选）；mainStats 为四个部位的主词条推荐\n' +
  'export const RECOMMENDED_RELICS = ' + JSON.stringify(recs, null, 1) + ';\n';
writeFileSync(join(ROOT, 'engine', 'relicdata.js'), js);

console.log('已生成 engine/relicdata.js：' + Object.keys(relics).length + ' 套遗器');
for (const id of IDS) {
  console.log('  ' + id + ' 外圈 ' + recs[id].set4.join(',') + ' | 内圈 ' + recs[id].set2.join(',') +
              ' | 主词条 ' + recs[id].mainStats.map((m) => m.slot + ':' + m.prop).join(' '));
}
