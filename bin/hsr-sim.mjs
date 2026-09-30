#!/usr/bin/env node
// ============================================================================
// 欢愉四人队伤害模拟器 · 命令行入口
// 用法：
//   node bin/hsr-sim.mjs                                  # 默认配置跑一遍
//   node bin/hsr-sim.mjs --cycles 5                        # 改轮数
//   node bin/hsr-sim.mjs --set characters.1506.stats.spd=160 --set options.infiniteSkillPoints=true
//   node bin/hsr-sim.mjs --config my.json --json > out.json
//   node bin/hsr-sim.mjs --timeline                         # 打印完整行动轴
//   node bin/hsr-sim.mjs --eidolon 6                        # 全员满星魂
// ============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import { simulate, defaultConfig, normalizeConfig, ENGINE_VERSION, characterInfo } from '../engine/sim.js';

var argv = process.argv.slice(2);
function argOf(name, dflt) {
  var i = argv.indexOf('--' + name);
  if (i < 0) return dflt;
  var v = argv[i + 1];
  return (v === undefined || v.indexOf('--') === 0) ? true : v;
}
function has(name) { return argv.indexOf('--' + name) >= 0; }
function setPath(obj, path, value) {
  var parts = path.split('.');
  var cur = obj;
  for (var i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] === undefined) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  var last = parts[parts.length - 1];
  if (value === 'true') value = true;
  else if (value === 'false') value = false;
  else if (value !== '' && !isNaN(Number(value))) value = Number(value);
  cur[last] = value;
}
function fmt(n) {
  return Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

var cfg = defaultConfig();
var cfgFile = argOf('config', null);
if (cfgFile && cfgFile !== true) {
  cfg = normalizeConfig(JSON.parse(readFileSync(String(cfgFile), 'utf8')));
}
var sets = [];
for (var i = 0; i < argv.length; i++) {
  if (argv[i] === '--set' && argv[i + 1]) sets.push(argv[i + 1]);
}
for (var s = 0; s < sets.length; s++) {
  var kv = sets[s].split('=');
  setPath(cfg, kv[0], kv.slice(1).join('='));
}
var cycles = argOf('cycles', null);
if (cycles !== null && cycles !== true) cfg.duration.cycles = Number(cycles);
// --eidolon 6            全员 6 魂
// --eidolon 1506=6,1501=2 逐角色指定星魂解锁等级
var eid = argOf('eidolon', null);
if (eid !== null && eid !== true) {
  var spec = String(eid);
  if (spec.indexOf('=') >= 0) {
    var pairs = spec.split(',');
    for (var pi = 0; pi < pairs.length; pi++) {
      var kvp = pairs[pi].split('=');
      var cid = kvp[0].replace(/^character.?/, '');
      if (cfg.characters[cid]) cfg.characters[cid].eidolon = Number(kvp[1]);
      else console.error('未知角色 ID: ' + cid);
    }
  } else {
    for (var id in cfg.characters) cfg.characters[id].eidolon = Number(eid);
  }
}
if (has('infinite-sp')) cfg.options.infiniteSkillPoints = true;

var t0 = Date.now();
var res = simulate(cfg);
var ms = Date.now() - t0;
res.elapsedMs = ms;

if (has('json')) {
  var json = JSON.stringify(res, null, 2) + '\n';
  var out = argOf('out', null);
  if (out && out !== true) {
    writeFileSync(String(out), json);
    console.error('已写入 ' + out + '（' + json.length + ' 字符）');
  } else {
    writeFileSync(1, json);   // 同步写，避免 process.exit 截断大 JSON
  }
  process.exit(0);
}

console.log('============================================================');
console.log(' 欢愉四人队 · 完美轴伤害模拟  (engine v' + ENGINE_VERSION + ')');
console.log('============================================================');
console.log('队伍      : ' + res.summary.byCharacter.map(function (c) { return c.name; }).join(' + '));
console.log('模拟时长  : ' + res.summary.durationAV + ' 行动值（' + res.summary.cycles + ' 轮，首轮 150）');
console.log('敌人      : ' + cfg.enemy.level + ' 级 / ' + (cfg.enemy.weakness ? '有弱点(抗性0%)' : '无弱点(抗性' + (cfg.enemy.resBase * 100) + '%)') +
            ' / 韧性减伤 ' + (cfg.enemy.broken ? '0%（已击破）' : (cfg.enemy.toughnessDR * 100) + '%') + ' / 目标数 ' + cfg.enemy.targetCount);
console.log('阿哈时刻  : 速度 ' + res.summary.ahaSpeed + '，触发 ' + res.summary.ahaMoments + ' 次');
var lcLine = [];
for (var li = 0; li < res.summary.byCharacter.length; li++) {
  var lcid = res.summary.byCharacter[li].id;
  var linfo = characterInfo(lcid, cfg);
  var cur = linfo.lightcone.current;
  if (cur === 'none') lcLine.push(linfo.name + '：无光锥');
  else {
    var opt = null;
    for (var oi = 0; oi < linfo.lightcone.options.length; oi++) if (linfo.lightcone.options[oi].id === cur) opt = linfo.lightcone.options[oi];
    lcLine.push(linfo.name + '：' + (opt ? opt.name : cur) + ' S' + linfo.lightcone.currentSuperimpose +
      (opt ? '（' + opt.passive + '）' : ''));
  }
}
console.log('专属光锥  : ' + lcLine.join(' ｜ '));
var relicLine = [];
var panelLine = [];
for (var pi2 = 0; pi2 < res.summary.byCharacter.length; pi2++) {
  var pid = res.summary.byCharacter[pi2].id;
  var pinfo = characterInfo(pid, cfg);
  var rl = pinfo.relics.current;
  relicLine.push(pinfo.name + '：' + (rl ? rl.set4Name + '(4) + ' + rl.set2Name + '(2) + ' + rl.substatRolls + ' 词条' : '未装备'));
  panelLine.push(pinfo.name + ' 攻' + pinfo.panelStats.atk + '/防' + pinfo.panelStats.def + '/速' + pinfo.panelStats.spd +
    '/暴击' + Math.round(pinfo.panelStats.critRate * 1000) / 10 + '%/暴伤' + Math.round(pinfo.panelStats.critDmg * 1000) / 10 + '%' +
    '/欢愉度' + Math.round(pinfo.panelStats.elationDegree * 1000) / 10 + '%');
}
console.log('遗器      : ' + relicLine.join(' ｜ '));
console.log('面板(含光锥+遗器): ' + panelLine.join(' ｜ '));
if (has('eidolons') || has('timeline')) {
  console.log('星魂/技能 :');
  for (var ci = 0; ci < res.summary.byCharacter.length; ci++) {
    var cid2 = res.summary.byCharacter[ci].id;
    var info = characterInfo(cid2, cfg);
    var lv = info.skillLevels.filter(function (x) { return x.slot !== 'innate' && x.slot !== 'maze'; })
      .map(function (x) { return x.label + x.level + (x.level > x.base ? '(' + x.base + '+' + (x.level - x.base) + ')' : ''); }).join(' ');
    console.log('            ' + pad(info.name, 14) + 'E' + info.eidolon + '  固有行迹 ' + info.innateLevel + ' 级  ' + lv);
  }
}
console.log('行动/命中 : ' + res.summary.actionCount + ' 次行动 / ' + res.summary.hitCount + ' 段伤害');
console.log('------------------------------------------------------------');
console.log('总伤害    : ' + fmt(res.summary.totalDamage));
console.log('每轮伤害  : ' + fmt(res.summary.damagePerCycle));
console.log('每 100 AV : ' + fmt(res.summary.dps));
console.log('------------------------------------------------------------');
console.log('角色占比');
for (var c2 = 0; c2 < res.summary.byCharacter.length; c2++) {
  var ch = res.summary.byCharacter[c2];
  var bar = '';
  var blocks = Math.round(ch.share * 40);
  for (var b = 0; b < blocks; b++) bar += '#';
  console.log('  ' + pad(ch.name, 12) + pad(fmt(ch.damage), 14) + pad((ch.share * 100).toFixed(1) + '%', 8) + bar);
}
console.log('伤害类型');
for (var t = 0; t < res.summary.byType.length; t++) {
  var ty = res.summary.byType[t];
  console.log('  ' + pad(ty.label, 12) + pad(fmt(ty.damage), 14) + (res.summary.totalDamage ? (ty.damage / res.summary.totalDamage * 100).toFixed(1) + '%' : ''));
}
if (res.warnings.length) {
  console.log('------------------------------------------------------------');
  console.log('提示');
  for (var w = 0; w < res.warnings.length; w++) console.log('  ! ' + res.warnings[w]);
}
console.log('------------------------------------------------------------');
console.log('行动轴（AV / 角色 / 行动 / 伤害）');
var lines = has('timeline') ? res.timeline : res.timeline.slice(0, 24);
for (var l = 0; l < lines.length; l++) {
  var e = lines[l];
  console.log('  ' + pad(String(e.av), 8) + pad(e.actor, 12) + pad(e.action, 26) + pad(fmt(e.damage), 12) + (e.note ? '  ' + e.note : ''));
}
if (!has('timeline') && res.timeline.length > lines.length) {
  console.log('  ... 其余 ' + (res.timeline.length - lines.length) + ' 条用 --timeline 查看');
}
console.log('------------------------------------------------------------');
console.log('建模假设（节选，完整见 result.assumptions）');
for (var a = 0; a < Math.min(4, res.assumptions.length); a++) console.log('  - ' + res.assumptions[a]);
console.log('');
console.log('耗时 ' + ms + ' ms；加 --json 可导出完整结果（含每段伤害的乘区来源）。');

function pad(s, n) {
  s = String(s);
  var w = 0;
  for (var i = 0; i < s.length; i++) w += s.charCodeAt(i) > 255 ? 2 : 1;
  while (w < n) { s += ' '; w += 1; }
  return s;
}
