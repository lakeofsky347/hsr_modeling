#!/usr/bin/env node
// ============================================================================
// HSR V2 通用队伍模拟器 · 命令行
//   node bin/hsr-sim-v2.mjs                                   # 默认队伍 + 默认敌人
//   node bin/hsr-sim-v2.mjs --team 1102,1306,1303,1217 --enemy 1005010 --cycles 5
//   node bin/hsr-sim-v2.mjs --config my.json --json > out.json
//   node bin/hsr-sim-v2.mjs --set team.0.eidolon=6 --set options.critMode=always --set enemy.weak='["Fire"]'
//   node bin/hsr-sim-v2.mjs --timeline                        # 打印完整时间轴
//   node bin/hsr-sim-v2.mjs --timeline --detail               # 时间轴附分段伤害与生效 Buff（内部属性键已译为中文）
//   node bin/hsr-sim-v2.mjs --list-characters [关键词]  |  --list-monsters [关键词]
//   node bin/hsr-sim-v2.mjs --print-config                    # 输出最终配置 JSON（可改后 --config）
// 单文件版：node dist/hsr-sim-v2.mjs（由 scripts/v2/build.mjs 生成，内含引擎）
// ============================================================================
import { readFileSync } from 'node:fs';
import * as HSR2 from '../engine2/index.js'; /*__HSR2_IMPORT__*/

const argv = process.argv.slice(2);
const has = (n) => argv.includes('--' + n);
function argOf(n, d) {
  const i = argv.indexOf('--' + n);
  if (i < 0) return d;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}
function argsOf(n) { const out = []; argv.forEach((a, i) => { if (a === '--' + n && argv[i + 1] !== undefined) out.push(argv[i + 1]); }); return out; }

// __HSR2_ZH_BEGIN__ 界面中文翻译表（与 ui2/app.html 同一份，修改时两处同步；tests/v2/names.test.mjs 抽取本段校验覆盖 DATA 与引擎中出现的全部键）
var ELEMENTS = ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'];
var EL_ZH = { Physical: '物理', Fire: '火', Ice: '冰', Thunder: '雷', Wind: '风', Quantum: '量子', Imaginary: '虚数' };
var PATHS = ['Warrior', 'Rogue', 'Mage', 'Shaman', 'Warlock', 'Knight', 'Priest', 'Memory', 'Elation'];
// 站点 base_type 码 → 命途：Warrior 毁灭 / Rogue 巡猎 / Mage 智识 / Shaman 同谐 / Warlock 虚无 / Knight 存护 / Priest 丰饶 / Memory 记忆 / Elation 欢愉
var PATH_ZH = { Warrior: '毁灭', Rogue: '巡猎', Mage: '智识', Shaman: '同谐', Warlock: '虚无', Knight: '存护', Priest: '丰饶', Memory: '记忆', Elation: '欢愉',
  Destruction: '毁灭', Hunt: '巡猎', Erudition: '智识', Harmony: '同谐', Nihility: '虚无', Preservation: '存护', Abundance: '丰饶', Remembrance: '记忆' };
var RANKS = ['BigBoss', 'LittleBoss', 'Elite', 'MinionLv2', 'Minion'];
var RANK_ZH = { BigBoss: '首领', LittleBoss: '小首领', Elite: '精英', MinionLv2: '普通', Minion: '普通（弱）', Boss: '首领' };
var TYPE_ZH = { enemy: '敌人回合', basic: '普攻', skill: '战技', ult: '终结技', fua: '追加攻击', dot: '持续伤害', 'break': '击破', superBreak: '超击破', elation: '欢愉', 'true': '真实伤害', memo: '忆灵',
  enhancedBasic: '强化普攻', enhancedBasic2: '强化普攻·二', enhancedBasic3: '强化普攻·三', enhancedSkill: '强化战技', talent: '天赋', technique: '秘技', other: '其他',
  additional: '附加伤害', custom: '附加伤害', trigger: '触发伤害', wait: '等待', AHA: '阿哈时刻' };
var ACT_CODE = { A: 'basic', E: 'skill', Q: 'ult', F: 'fua', 'A+': 'enhancedBasic', 'A++': 'enhancedBasic2', 'A+++': 'enhancedBasic3', 'E+': 'enhancedSkill', X: 'elation', M: 'memo', D: 'dot', DoT: 'dot', B: 'break' };
function actType(a) { return ACT_CODE[a] || a; }
var SLOT_ZH = { basic: '普攻', skill: '战技', ult: '终结技', talent: '天赋', technique: '秘技', elation: '欢愉技', enhancedBasic: '强化普攻', enhancedSkill: '强化战技', memo: '忆灵技', other: '其他' };
var TARGET_ZH = { self: '自身', team: '全队', ally: '单体队友', allies: '其他队友', enemy: '敌方单体', enemies: '敌方全体' };
var TRIGGER_ZH = { passive: '常驻', onCast: '施放时', battleStart: '战斗开始', onUlt: '终结技后', onSkill: '战技后', onBasic: '普攻后', onFua: '追加攻击后', onAttack: '攻击后', onAllyAttack: '队友攻击后', conditional: '条件' };
var HIT_TARGET_ZH = { single: '单体', aoe: '全体', adjacent: '相邻', bounce: '弹射', random: '随机', enemy: '敌方' };
var SCALING_ZH = { atk: '攻击力', hp: '生命值', def: '防御力', elation: '欢愉度', 'break': '击破伤害', 'true': '真实伤害' };
var STRATEGY_ZH = { beam: '束搜索', 'beam(ult asap)': '束搜索（终结技即放）', fixed: '固定策略', 'baseline:skillFirst': '基线·优先战技', 'baseline:basicOnly': '基线·只用普攻' };
var STAT_ZH = {
  hp: '生命值', hpPct: '生命值%', atk: '攻击力', atkPct: '攻击力%', def: '防御力', defPct: '防御力%', spd: '速度', spdPct: '速度%',
  critRate: '暴击率', critDmg: '暴击伤害', breakEffect: '击破特攻', energyRegen: '能量恢复效率', effectHitRate: '效果命中', effectRes: '效果抵抗',
  outgoingHeal: '治疗量加成', dmgBonus: '增伤（全）', defShred: '减防', defIgnore: '无视防御', resPen: '抗性穿透', resShred: '减抗', vuln: '易伤',
  elation: '欢愉度', superBreak: '超击破', weaknessBreakEfficiency: '弱点击破效率', amplification: '伤害增幅', elationAmp: '增笑',
  actionAdvance: '行动提前', energyFlat: '回复能量', energyPct: '回复能量（按上限）', spFlat: '回复战技点', spMax: '战技点上限', elementDmg: '本属性增伤', aggro: '嘲讽值'
};
// 组合键 <基础键>_<元素|伤害类型>：前缀 + 词
var DMG_PREFIX_ZH = { basic: '普攻', skill: '战技', ult: '终结技', fua: '追加攻击', dot: '持续伤害', 'break': '击破伤害', superBreak: '超击破伤害', elation: '欢愉伤害', memo: '忆灵', 'true': '真实伤害', additional: '附加伤害' };
var STAT_COMBO_WORD = { dmgBonus: '增伤', vuln: '易伤', critRate: '暴击率', critDmg: '暴击伤害', defIgnore: '无视防御', defShred: '减防', resPen: '抗性穿透', resShred: '抗性降低', amplification: '伤害增幅' };
var FLAT_KEYS = { hp: 1, atk: 1, def: 1, spd: 1, energyFlat: 1, spFlat: 1, spMax: 1, aggro: 1 };
function isPctKey(k) { return !FLAT_KEYS[k]; }
function statZh(k) {
  if (k == null) return '';
  if (Object.prototype.hasOwnProperty.call(STAT_ZH, k)) return STAT_ZH[k];
  var m = /^([a-zA-Z]+)_([A-Za-z]+)$/.exec(k);
  if (m && STAT_COMBO_WORD[m[1]]) {
    if (EL_ZH[m[2]]) return EL_ZH[m[2]] + '属性' + STAT_COMBO_WORD[m[1]];
    var pre = DMG_PREFIX_ZH[m[2]] || TYPE_ZH[m[2]], w = STAT_COMBO_WORD[m[1]];
    if (pre) { if (/伤害$/.test(pre)) w = w === '增伤' ? '提高' : w.replace(/^伤害/, ''); return pre + w; }
  }
  return k;
}
// 引擎生成的文本（buff 标签「来源·名称 stat+数值」、面板来源、分段备注、警告）中的内部键 → 中文
function zhText(s) {
  if (s == null) return '';
  return String(s)
    .replace(/\bspMax([+-])(\d+(?:\.\d+)?)%/g, function (m0, sg, v) { return '战技点上限' + sg + (+(Number(v) / 100).toFixed(2)); })
    .replace(/\b(break|true)×/g, function (m0, w) { return SCALING_ZH[w] + '×'; })
    .replace(/\bDoT\b/g, '持续伤害')
    .replace(/\b([a-zA-Z]+(?:_[A-Za-z]+)?)=([a-zA-Z]+)×(\d+(?:\.\d+)?)%\+(\d*\.?\d+)(?![\d%])/g, function (m0, k, sk, v, fa) { return k + '=' + sk + '×' + v + '%+' + (isPctKey(k) ? (+(Number(fa) * 100).toFixed(2)) + '%' : fa); })
    .replace(/\b(atkPct|hpPct|defPct|spdPct)(?=[+\-=])/g, function (m0, k) { return STAT_ZH[k].replace('%', ''); })
    .replace(/需 override/g, '需手写机制').replace(/手写机制 override/g, '手写机制')
    .replace(/\b[a-z][A-Za-z]*(?:_[A-Za-z]+)?\b/g, function (w) { var t = statZh(w); return t === w && HIT_TARGET_ZH[w] ? HIT_TARGET_ZH[w] : t; });
}
// 时间轴分段：目标（single/aoe×5 …）与备注（atk×2.2 …）
function zhHitTarget(t) {
  if (t === undefined || t === null) return '';
  if (typeof t === 'number') return '#' + (t + 1);
  return String(t).replace(/^[a-z]+/, function (w) { return HIT_TARGET_ZH[w] || w; });
}
function zhHitNote(n) {
  return zhText(n).replace(/(攻击力|生命值|防御力|欢愉度|击破伤害)×(\d+(?:\.\d+)?)(?![\d.]*%)/g, function (m0, w, v) { return w + '×' + (+(Number(v) * 100).toFixed(2)) + '%'; })
    .replace(/\+(\d*\.?\d+)×([\u4e00-\u9fa5]+)/g, function (m0, v, w) { return '+' + (+(Number(v) * 100).toFixed(2)) + '%×' + w; });
}
// __HSR2_ZH_END__
function actZh(a) { const t = TYPE_ZH[actType(a)]; if (t) return t; if (/^A\+/.test(a)) return '强化普攻'; if (/^E\+/.test(a)) return '强化战技'; return zhText(a); }
const fmt = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 0 }) : String(n));
const wlen = (t) => [...String(t)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e7f ? 2 : 1), 0);
const padW = (t, w) => String(t) + ' '.repeat(Math.max(0, w - wlen(t)));
const pct = (x) => (Number(x) * 100).toFixed(1) + '%';
const HELP_TEXT = "  node bin/hsr-sim-v2.mjs                                   # 默认队伍 + 默认敌人\n  node bin/hsr-sim-v2.mjs --team 1102,1306,1303,1217 --enemy 1005010 --cycles 5\n  node bin/hsr-sim-v2.mjs --config my.json --json > out.json\n  node bin/hsr-sim-v2.mjs --set team.0.eidolon=6 --set options.critMode=always --set enemy.weak='[\"Fire\"]'\n  node bin/hsr-sim-v2.mjs --timeline                        # 打印完整时间轴\n  node bin/hsr-sim-v2.mjs --timeline --detail               # 时间轴附分段伤害与生效 Buff\n  node bin/hsr-sim-v2.mjs --list-characters [关键词]  |  --list-monsters [关键词]\n  node bin/hsr-sim-v2.mjs --print-config                    # 输出最终配置 JSON（可改后 --config）\n单文件版：node dist/hsr-sim-v2.mjs（由 scripts/v2/build.mjs 生成，内含引擎）";
const help = () => { console.log(HELP_TEXT); };

function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function merge(base, over) {
  if (!isObj(base) || !isObj(over)) return over === undefined ? base : over;
  const out = Object.assign({}, base);
  Object.keys(over).forEach((k) => { out[k] = merge(base[k], over[k]); });
  return out;
}
function parseValue(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null') return null;
  if (v !== '' && !isNaN(Number(v))) return Number(v);
  if (/^[\[{"]/.test(v)) { try { return JSON.parse(v); } catch (e) { /* 原样 */ } }
  return v;
}
function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (cur[k] === undefined || cur[k] === null) cur[k] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
}
// 补全不完整配置（手写 JSON 常只写部分字段）
function completeConfig(raw) {
  const d = HSR2.defaultConfig();
  const cfg = merge(d, raw || {});
  if (raw && Array.isArray(raw.team)) {
    cfg.team = raw.team.filter((m) => m && m.charId).map((m) => merge(HSR2.defaultMember(String(m.charId)), m));
  }
  if (raw && raw.enemy) cfg.enemy = merge(HSR2.defaultEnemy(raw.enemy.monsterId || undefined), raw.enemy);
  return cfg;
}

function main() {
  if (has('help') || has('h')) { help(); return; }
  if (has('list-characters')) {
    const kw = argOf('list-characters', true);
    HSR2.listCharacters().filter((c) => kw === true || (c.id + c.name + c.element + c.path + (PATH_ZH[c.path] || '') + (EL_ZH[c.element] || '')).toLowerCase().includes(String(kw).toLowerCase()))
      .forEach((c) => console.log([c.id, c.rarity + '★', padW(EL_ZH[c.element] || c.element, 4), padW(PATH_ZH[c.path] || c.path, 4), c.support === 'manual' ? '手写' : '自动', c.name].join('\t')));
    return;
  }
  if (has('list-monsters')) {
    const kw = argOf('list-monsters', true);
    const list = HSR2.listMonsters().filter((m) => kw === true || (m.id + m.name + (RANK_ZH[m.rank] || '')).toLowerCase().includes(String(kw).toLowerCase()));
    list.forEach((m) => console.log([m.id, padW(RANK_ZH[m.rank] || m.rank, 10), '韧性 ' + String(m.toughness).padStart(4), padW('弱点 ' + ((m.weak || []).map((e) => EL_ZH[e] || e).join('/') || '无'), 22), m.name].join('\t')));
    console.error('共 ' + list.length + ' 个');
    return;
  }

  let cfg;
  const file = argOf('config', null);
  if (file && file !== true) cfg = completeConfig(JSON.parse(readFileSync(String(file), 'utf8')));
  else cfg = HSR2.defaultConfig();
  const team = argOf('team', null);
  if (team && team !== true) cfg.team = String(team).split(',').map((s) => s.trim()).filter(Boolean).slice(0, 4).map((id) => HSR2.defaultMember(id));
  const enemy = argOf('enemy', null);
  if (enemy && enemy !== true) cfg.enemy = HSR2.defaultEnemy(String(enemy));
  const cycles = argOf('cycles', null);
  if (cycles !== null && cycles !== true) cfg.battle.cycles = Number(cycles);
  argsOf('set').forEach((kv) => {
    const i = kv.indexOf('=');
    if (i < 0) throw new Error('--set 需要 path=value 形式: ' + kv);
    setPath(cfg, kv.slice(0, i), parseValue(kv.slice(i + 1)));
  });
  if (has('print-config')) { console.log(JSON.stringify(cfg, null, 2)); return; }

  const t0 = Date.now();
  const r = HSR2.simulate(cfg);
  const ms = Date.now() - t0;
  if (has('json')) { console.log(JSON.stringify(has('with-config') ? { config: cfg, result: r } : r, null, 2)); return; }

  const e = cfg.enemy;
  console.log('HSR V2 模拟器 · 引擎 ' + HSR2.ENGINE2_VERSION + ' · 数据 ' + ((HSR2.DATA && HSR2.DATA.version) || '?') + ' · 耗时 ' + ms + ' ms');
  const em = e.monsterId && HSR2.DATA && HSR2.DATA.monsters[e.monsterId];
  console.log('敌人：' + (e.name || '自定义') + (em ? '（' + e.monsterId + ' · ' + (RANK_ZH[em.rank] || em.rank) + '）' : '') + ' ×' + e.count + '  Lv' + e.level + '  弱点 ' + (e.weak || []).map((x) => EL_ZH[x] || x).join('/') + '  韧性 ' + e.toughness);
  console.log('战斗：' + cfg.battle.cycles + ' 轮（总 AV ' + fmt(r.totalAV) + '）  暴击 ' + (cfg.options.critMode === 'always' ? '必暴' : '期望'));
  console.log('');
  console.log('总伤害  ' + fmt(r.total) + '    每轮  ' + fmt(r.perCycle));
  console.log('');
  (r.byMember || []).forEach((m) => {
    const bar = '█'.repeat(Math.round((m.share || 0) * 30));
    const acts = Object.keys(m.actions || {}).filter((k) => m.actions[k]).map((k) => (TYPE_ZH[k] || k) + '×' + m.actions[k]).join(' ');
    console.log('  ' + padW(m.name, 14) + fmt(m.damage).padStart(14) + '  ' + pct(m.share || 0).padStart(6) + ' ' + bar + '  ' + acts);
  });
  console.log('');
  const bt = r.byType || {};
  console.log('伤害类型：' + Object.keys(bt).filter((k) => bt[k]).map((k) => (TYPE_ZH[k] || k) + ' ' + fmt(bt[k])).join(' · '));
  if (r.rotation) {
    console.log('');
    console.log('自动排轴：');
    const ids = cfg.team.map((t) => String(t.charId)).filter((id) => r.rotation[id] !== undefined).concat(Object.keys(r.rotation).filter((id) => !cfg.team.some((t) => String(t.charId) === id)));
    ids.forEach((id) => {
      const m = (r.byMember || []).find((x) => String(x.charId) === String(id));
      console.log('  ' + padW(m ? m.name : id, 14) + r.rotation[id]);
    });
  }
  if (has('timeline')) {
    console.log('');
    console.log('时间轴：');
    console.log('      AV  ' + padW('角色', 14) + padW('动作', 30) + '        伤害  战技点  能量');
    (r.timeline || []).forEach((t) => {
      console.log(Number(t.av).toFixed(1).padStart(8) + '  ' + padW(t.actor, 14) + padW(t.action === 'enemy' ? zhText(t.skillName || '敌人回合') : actZh(t.action) + ' ' + (t.skillName && t.skillName !== actZh(t.action) ? zhText(t.skillName) : ''), 30) + fmt(t.damage || 0).padStart(12) + '  ' + String(t.sp === undefined ? '' : t.sp).padStart(6) + '  ' + (t.energy === undefined ? '' : Number(t.energy).toFixed(0)));
      if (has('detail')) {
        (t.hits || []).forEach((hh) => console.log('            ↳ ' + zhHitTarget(hh.target) + (hh.note ? ' · ' + zhHitNote(hh.note) : '') + '  ' + fmt(hh.dmg || 0)));
        if ((t.buffs || []).length) console.log('            Buff：' + t.buffs.map((b) => zhText(typeof b === 'string' ? b : (b.label || b.name || statZh(b.stat)))).join('、'));
      }
    });
  }
  if (r.warnings && r.warnings.length) {
    console.log('');
    console.log('警告：');
    r.warnings.forEach((w) => console.log('  - ' + (typeof w === 'string' ? zhText(w) : JSON.stringify(w))));
  }
}

try { main(); } catch (err) { console.error('错误: ' + (err && err.stack || err)); process.exit(1); }
