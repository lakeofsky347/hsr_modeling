#!/usr/bin/env node
// ============================================================================
// 从抓取数据生成专属光锥数据：engine/lightconedata.js
//   LIGHTCONES[id] = { name, passive, rarity, path, desc, levels: [[S1 参数], ...], stats: {hp,atk,def} }
//   SIGNATURE_LIGHTCONE[avatarId] = lightconeId
// 数据源：
//   data/nanoka/raw/lightcone/<id>_zh.json   （被动效果与各叠影参数、基础属性）
//   data/nanoka/raw/support/lightcone.json   （满级攻击力，用于校验）
// 用法：node scripts/gen_lightcone_data.mjs
// ============================================================================
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'data', 'nanoka', 'raw', 'lightcone');
const SUP = join(ROOT, 'data', 'nanoka', 'raw', 'support', 'lightcone.json');

const SIGNATURE = { '1506': '23057', '1501': '23053', '1503': '23055', '1511': '23065' };
const MAX_LEVEL = 80;

function level80(stats) {
  // stats[] 按突破阶段排列，最后一项为 6 突破；满级值 = base + add x (等级 - 1)
  const last = stats[stats.length - 1];
  const lv = MAX_LEVEL - 1;
  return {
    hp: Math.round((last.base_hp + last.base_hp_add * lv) * 10) / 10,
    atk: Math.round((last.base_attack + last.base_attack_add * lv) * 10) / 10,
    def: Math.round((last.base_defence + last.base_defence_add * lv) * 10) / 10
  };
}

function strip(t) {
  if (!t) return t;
  return t.replace(/<unbreak>/g, '').replace(/<\/unbreak>/g, '')
          .replace(/<[^>]+>/g, '');
}

const sup = existsSync(SUP) ? JSON.parse(readFileSync(SUP, 'utf8')) : {};
const out = {};
const warnings = [];

for (const id of Object.values(SIGNATURE)) {
  const f = join(DIR, id + '_zh.json');
  if (!existsSync(f)) { warnings.push('缺少光锥数据 ' + id); continue; }
  const d = JSON.parse(readFileSync(f, 'utf8'));
  const ref = d.refinements || {};
  const levels = [];
  for (const k of Object.keys(ref.level || {}).sort((a, b) => Number(a) - Number(b))) {
    levels.push(ref.level[k].param_list);
  }
  const st = level80(d.stats || []);
  const known = sup[id] ? sup[id].atk : null;
  if (known && Math.abs(known - st.atk) > 1.5) {
    warnings.push(id + ' 满级攻击力与 lightcone.json 不一致：计算 ' + st.atk + ' / 站点 ' + known);
  }
  out[id] = {
    name: d.name, passive: ref.name || '', rarity: d.rarity === 'CombatPowerLightconeRarity5' ? 5 : 4,
    path: d.base_type, desc: strip(ref.desc), levels: levels, stats: st,
    atkCheck: known
  };
}

const js = '// 由 scripts/gen_lightcone_data.mjs 自动生成（数据源 hsr.nanoka.cc 4.7 的专属光锥数据），请勿手改\n' +
  '// levels[叠影-1] = 该叠影下的参数数组（与 desc 里的 #1 #2 ... 一一对应）\n' +
  'export const LIGHTCONES = ' + JSON.stringify(out, null, 1) + ';\n\n' +
  '// 角色 -> 专属光锥 ID\n' +
  'export const SIGNATURE_LIGHTCONE = ' + JSON.stringify(SIGNATURE, null, 1) + ';\n\n' +
  '// 光锥满级等级（用于属性计算校验）\n' +
  'export const LIGHTCONE_MAX_LEVEL = ' + MAX_LEVEL + ';\n';
writeFileSync(join(ROOT, 'engine', 'lightconedata.js'), js);

console.log('已生成 engine/lightconedata.js：' + Object.keys(out).length + ' 把专属光锥');
for (const id of Object.keys(out)) {
  const lc = out[id];
  console.log('  ' + id + ' ' + lc.name + '（' + lc.passive + '，' + lc.rarity + '★）' +
              ' 满级 攻' + lc.stats.atk + '/生' + lc.stats.hp + '/防' + lc.stats.def +
              ' 叠影数 ' + lc.levels.length);
}
for (const w of warnings) console.log('  ! ' + w);
if (warnings.length) process.exitCode = 1;
