#!/usr/bin/env node
// ============================================================================
// 从抓取数据生成技能等级表：engine/skilltables.js
//   SKILL_TABLES[skillId]  = { name, type, slot, levels: [[参数...] x 等级] }
//   SKILL_SLOTS[avatarId]  = { basic: [skillId...], skill: [...], ... }  ← 由行迹节点判定
//   SKILL_BASE_CAPS[skillId] = 该技能在 0 魂时可达到的基础等级上限
// 数据源：data/nanoka/normalized/*.json（hsr.nanoka.cc 4.7）
// 用法：node scripts/gen_skill_tables.mjs
// ============================================================================
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NORM = join(ROOT, 'data', 'nanoka', 'normalized');
const IDS = ['1506', '1501', '1503', '1511'];

// 行迹锚点 -> 槽位（Point22 为欢愉技，Point23 为专属行迹技能）
const SLOT_BY_ANCHOR = { Point01: 'basic', Point02: 'skill', Point03: 'ult', Point04: 'talent',
                         Point05: 'maze', Point22: 'elationSkill', Point23: 'special' };

const tables = {};
const slots = {};
const caps = {};          // 拉平：skillId -> 基础等级上限
const capsByChar = {};    // 分组：角色 -> { skillId: 上限 }（便于核对）
const eidolons = {};

for (const id of IDS) {
  const file = readdirSync(NORM).find((f) => f.startsWith(id + '_'));
  const d = JSON.parse(readFileSync(join(NORM, file), 'utf8'));
  slots[id] = {};
  capsByChar[id] = {};
  // 1) 槽位与基础等级上限来自行迹节点（caps 拉平成 skillId -> 上限，便于直接查表）
  for (const n of d.traces.skill_level_nodes) {
    const slot = SLOT_BY_ANCHOR[n.anchor] || n.anchor;
    if (!slots[id][slot]) slots[id][slot] = [];
    for (const sid of (n.level_up_skill_id || [])) {
      slots[id][slot].push(String(sid));
      caps[String(sid)] = n.max_level;
      capsByChar[id][String(sid)] = n.max_level;
    }
  }
  // 2) 欢愉技节点（point_type 4，不在 skill_level_nodes 里）与专属行迹技能（point_type 6）
  for (const n of (d.traces.elation_skill || [])) {
    slots[id].elationSkill = [];
    for (const sid of (n.level_up_skill_id || [])) {
      slots[id].elationSkill.push(String(sid));
      caps[String(sid)] = n.max_level;
      capsByChar[id][String(sid)] = n.max_level;
    }
  }
  for (const n of (d.traces.other || [])) {
    if (n.point_type !== 6) continue;
    slots[id].special = [];
    for (const sid of (n.level_up_skill_id || [])) {
      slots[id].special.push(String(sid));
      caps[String(sid)] = n.max_level;
      capsByChar[id][String(sid)] = n.max_level;
    }
  }
  // 3) 固有行迹（不在升级节点里，固定 1-2 级）
  for (const s of d.skills) {
    if (s.type_name === '固有行迹') {
      slots[id].innate = [String(s.id)];
      caps[String(s.id)] = s.levels[s.levels.length - 1].level;
      capsByChar[id][String(s.id)] = caps[String(s.id)];
    }
  }
  // 4) 星魂文案
  eidolons[id] = d.eidolons.map((e) => ({ rank: e.rank, name: e.name, desc: e.desc }));
  // 5) 等级表
  const slotOf = {};
  for (const slot of Object.keys(slots[id])) for (const sid of slots[id][slot]) slotOf[sid] = slot;
  for (const s of d.skills) {
    const sid = String(s.id);
    if (!s.levels || !s.levels.length) continue;
    tables[sid] = { name: s.name, type: s.type_name || '衍生', slot: slotOf[sid] || null,
                    levels: s.levels.map((l) => l.params) };
  }
}

const js = '// 由 scripts/gen_skill_tables.mjs 自动生成（数据源 hsr.nanoka.cc 4.7），请勿手改\n' +
  '// levels[等级-1] = 该等级的参数数组（与技能描述里的 #1 #2 ... 一一对应）\n' +
  'export const SKILL_TABLES = ' + JSON.stringify(tables) + ';\n\n' +
  '// 角色各槽位对应的技能 ID（同一槽位共享等级）\n' +
  'export const SKILL_SLOTS = ' + JSON.stringify(slots, null, 1) + ';\n\n' +
  '// 0 魂时各技能的基础等级上限（星魂加成在此之上叠加）\n' +
  'export const SKILL_BASE_CAPS = ' + JSON.stringify(caps, null, 1) + ';\n\n' +
  '// 同上，按角色分组（便于核对）\n' +
  'export const SKILL_BASE_CAPS_BY_CHAR = ' + JSON.stringify(capsByChar, null, 1) + ';\n\n' +
  '// 星魂文案（名称与效果原文）\n' +
  'export const EIDOLON_INFO = ' + JSON.stringify(eidolons, null, 1) + ';\n';
writeFileSync(join(ROOT, 'engine', 'skilltables.js'), js);

console.log('已生成 engine/skilltables.js：' + Object.keys(tables).length + ' 个技能');
for (const id of IDS) {
  console.log('  ' + id);
  for (const slot of Object.keys(slots[id])) {
    const sids = slots[id][slot];
    console.log('    ' + slot + ' -> ' + sids.join(',') + '  基础上限 ' + caps[sids[0]] +
                '  等级表长度 ' + (tables[sids[0]] ? tables[sids[0]].levels.length : '-'));
  }
}
