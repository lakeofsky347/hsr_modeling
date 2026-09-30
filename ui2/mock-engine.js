// ============================================================================
// ui2/mock-engine.js —— 仅用于界面开发的假引擎（按 docs/V2_DESIGN.md §3 契约返回假数据）
// 最终产物 dist/hsr-sim-v2.html 使用真实 engine2/index.js；
// 需要时：node scripts/v2/build.mjs --entry ui2/mock-engine.js → dist/hsr-sim-v2.mock.html
// ============================================================================
export const ENGINE2_VERSION = '0.0.0-mock';

const EL = ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'];
const CH = [
  ['1102', '希儿', 'Quantum', 'Rogue', 5], ['1306', '花火', 'Quantum', 'Shaman', 5],
  ['1303', '阮·梅', 'Ice', 'Shaman', 5], ['1217', '藿藿', 'Wind', 'Priest', 5],
  ['1005', '卡芙卡', 'Thunder', 'Warlock', 5], ['1205', '刃', 'Wind', 'Warrior', 5],
  ['1004', '瓦尔特', 'Imaginary', 'Warlock', 5], ['1006', '银狼', 'Quantum', 'Warlock', 5],
  ['1001', '三月七', 'Ice', 'Knight', 4], ['1107', '克拉拉', 'Physical', 'Warrior', 5],
  ['1112', '托帕&账账', 'Fire', 'Rogue', 5], ['1308', '黄泉', 'Thunder', 'Warlock', 5],
  ['1402', '阿格莱雅', 'Thunder', 'Memory', 5], ['1506', '银狼LV.999', 'Quantum', 'Elation', 5],
];
const LC = [
  ['23001', '于夜色中', 'Rogue', 5], ['21001', '晚安与睡颜', 'Warlock', 4], ['23021', '游戏尘寰', 'Shaman', 5],
  ['23019', '惊魂夜', 'Shaman', 5], ['23017', '惊魂夜2', 'Priest', 5], ['21003', '论剑', 'Rogue', 4],
  ['23014', '重返幽冥', 'Warrior', 5], ['23016', '致长夜的救赎', 'Warlock', 5], ['24001', '星海巡航', 'Rogue', 4],
  ['23040', '纪念光锥', 'Memory', 5], ['23045', '欢愉光锥', 'Elation', 5], ['23005', '制胜的瞬间', 'Knight', 5],
];
const RS = [
  ['108', '繁星璀璨的天才', 'cavern'], ['104', '密林卧雪的猎人', 'cavern'], ['105', '街头出身的拳王', 'cavern'],
  ['114', '将盗贼踩在脚下的盗贼', 'cavern'], ['120', '死于稀薄血液的圣人', 'cavern'],
  ['305', '筑城者的贝洛伯格', 'planar'], ['306', '星体差分机', 'planar'], ['307', '停转的萨尔索图', 'planar'],
  ['310', '繁星竞技场', 'planar'], ['311', '盗贼公国塔利亚', 'planar'],
];
const MO = [
  ['8003010', '可可利亚（第一阶段）', 'BigBoss', ['Fire', 'Physical', 'Imaginary']],
  ['2023020', '末日兽', 'Elite', ['Quantum', 'Ice']],
  ['1012010', '自动机兵「战象」', 'Elite', ['Wind', 'Thunder']],
  ['3001010', '虚卒·掠夺者', 'Minion', ['Physical', 'Fire']],
  ['8021010', '星核猎手·卡芙卡', 'BigBoss', ['Quantum', 'Wind']],
];

function chr(id) { const c = CH.find((x) => x[0] === id) || CH[0]; return { id: c[0], name: c[1], element: c[2], path: c[3], rarity: c[4] }; }

function kitOf(id) {
  const c = chr(id);
  const mk = (slot, sid, name, typeName, tag, desc, hits, effects, extra) => Object.assign({ id: id + sid, slot, name, typeName, tag, desc, rawDesc: desc, maxLevel: slot === 'basic' ? 6 : 10, defaultLevel: slot === 'basic' ? 6 : 10, params: [[1, 0.25]], spCost: slot === 'skill' ? 1 : 0, spGain: slot === 'basic' ? 1 : 0, energyGain: slot === 'ult' ? 5 : 20, toughness: { main: 30, aoe: 0, adjacent: 0 }, hits, effects }, extra || {});
  const hit = (dmgType, target, scaling) => ({ scaling: scaling || 'atk', param: 0, target, count: 1, countParam: null, element: c.element, dmgType, confidence: 'high', raw: '造成等同于' + c.name + '#1[i]%攻击力的' + c.element + '属性伤害' });
  const eff = (k, stat, value, target, duration, trigger, cond) => ({ key: id + ':' + k, stat, value, target, duration, trigger, maxStacks: 1, condition: cond || null, confidence: cond ? 'low' : 'high', raw: stat + ' +' + value });
  return {
    skills: [
      mk('basic', '01', c.name + '·普攻', '普攻', 'SingleAttack', '对指定敌方单体造成等同于' + c.name + '100%攻击力的伤害。', [hit('basic', 'single')], []),
      mk('skill', '02', c.name + '·战技', '战技', 'SingleAttack', '对指定敌方单体造成等同于220%攻击力的伤害，自身速度提高25%，持续2回合。', [hit('skill', 'single')], [eff('skill:0', 'spdPct', 0.25, 'self', 2, 'onSkill')]),
      mk('ult', '03', c.name + '·终结技', '终结技', 'AoEAttack', '对敌方全体造成等同于425%攻击力的伤害。', [hit('ult', 'aoe')], []),
      mk('talent', '04', c.name + '·天赋', '天赋', 'Enhance', '施放终结技后，伤害提高80%，持续1回合。', [], [eff('talent:0', 'dmgBonus', 0.8, 'self', 1, 'onUlt', '处于增幅状态时')]),
      mk('technique', '07', c.name + '·秘技', '秘技', 'Enhance', '进入战斗后恢复能量。', [], [eff('tech:0', 'energyFlat', 20, 'self', null, 'battleStart')]),
    ],
    traces: [
      { id: id + 'a1', name: '夜行', desc: '攻击时暴击率提高15%。', params: [0.15], effects: [eff('trace:0', 'critRate', 0.15, 'self', null, 'passive')] },
      { id: id + 'a2', name: '割裂', desc: '量子抗性穿透提高20%。', params: [0.2], effects: [eff('trace:1', 'resPen_' + c.element, 0.2, 'self', null, 'conditional', '处于增幅状态时')] },
      { id: id + 'a3', name: '涟漪', desc: '施放普攻后行动提前20%。', params: [0.2], effects: [eff('trace:2', 'actionAdvance', 0.2, 'self', null, 'onBasic')] },
    ],
    eidolons: [1, 2, 3, 4, 5, 6].map((r) => ({ rank: r, name: '星魂' + r, desc: r === 3 ? '战技等级+2，普攻等级+1。' : r === 5 ? '终结技等级+2，天赋等级+2。' : '第' + r + '星魂效果：伤害提高' + r * 5 + '%。', params: [r * 0.05], effects: r === 3 || r === 5 ? [] : [eff('e' + r, 'dmgBonus', r * 0.05, 'self', null, 'passive')], skillLevelUp: r === 3 ? { skill: 2, basic: 1 } : r === 5 ? { ult: 2, talent: 2 } : null })),
    notes: id === '1506' ? ['mock：欢愉技未解析'] : [],
  };
}

export const DATA = { version: 'mock', generatedAt: new Date(0).toISOString(), characters: {}, lightcones: {}, relicSets: {}, monsters: {} };
CH.forEach((c) => { DATA.characters[c[0]] = Object.assign(chr(c[0]), kitOf(c[0])); });

export function listCharacters() { return CH.map((c) => ({ id: c[0], name: c[1], element: c[2], path: c[3], rarity: c[4], support: c[0] === '1102' || c[0] === '1306' ? 'manual' : 'auto' })); }
export function listLightcones(path) { return LC.filter((l) => !path || l[2] === path).map((l) => ({ id: l[0], name: l[1], path: l[2], rarity: l[3] })); }
export function listRelicSets() { return RS.map((r) => ({ id: r[0], name: r[1], kind: r[2] })); }
export function listMonsters() { return MO.map((m) => ({ id: m[0], name: m[1], rank: m[2], weak: m[3] })); }

export function defaultMember(charId) {
  const c = chr(charId);
  const lc = LC.find((l) => l[2] === c.path);
  return {
    charId: c.id, level: 80, eidolon: 0,
    skillLevels: { basic: 6, skill: 10, ult: 10, talent: 10 },
    lightcone: lc ? { id: lc[0], superimposition: 1 } : null,
    relics: { set4: '108', set2: '305', mainStats: { body: 'critRate', feet: 'spd', sphere: 'dmgBonus', rope: 'atkPct' }, subStats: { critRate: 6, critDmg: 8, atkPct: 4, spd: 4 } },
    statOverrides: {}, extraBuffs: [], disabledEffects: [],
    policy: { mode: 'auto', ultMode: 'asap', fuaPerTurn: null },
  };
}
export function defaultEnemy(monsterId) {
  const m = MO.find((x) => x[0] === monsterId);
  const res = {}; EL.forEach((e) => { res[e] = m && m[3].includes(e) ? 0 : 0.2; });
  return { monsterId: m ? m[0] : null, name: m ? m[1] : '自定义敌人', level: 95, count: 1, hp: 1e6, toughness: 160, weak: m ? m[3].slice() : ['Quantum'], res, spd: 132, extraDefShred: 0, extraVuln: 0, extraResShred: 0, alwaysBroken: false, allowBreak: true };
}
export function defaultConfig() {
  return { team: ['1102', '1306', '1303', '1217'].map(defaultMember), enemy: defaultEnemy('8003010'),
    battle: { cycles: 3, firstCycleAV: 150, avPerCycle: 100, startSP: 3, maxSP: 5, startEnergyPct: 0.5 },
    options: { critMode: 'expected', beamWidth: 24, ignoreConditions: false } };
}
export function computeStats(member) {
  const c = chr(member.charId);
  const s = member.relics && member.relics.subStats || {};
  const st = { charId: c.id, hp: 1100 + 700, atk: 640 + 560 + 352 + (s.atkPct || 0) * 19, def: 460, spd: 115 + 25 + (s.spd || 0) * 2.3, critRate: 0.05 + 0.324 + (s.critRate || 0) * 0.029, critDmg: 0.5 + 0.24 + (s.critDmg || 0) * 0.058, breakEffect: 0, energyRegen: 1, effectHitRate: 0, effectRes: 0, elation: 0, outgoingHeal: 0, dmgBonus: { all: 0.1 } };
  EL.forEach((e) => { st.dmgBonus[e] = e === c.element ? 0.388 : 0; });
  const o = member.statOverrides || {};
  Object.keys(o).forEach((k) => { if (o[k] !== null && o[k] !== undefined && o[k] !== '') st[k] = o[k]; });
  return st;
}
export function describeKit(charId) { const d = DATA.characters[charId] || DATA.characters['1102']; return { skills: d.skills.map((s) => ({ slot: s.slot, name: s.name, typeName: s.typeName, desc: s.desc, hits: s.hits, effects: s.effects })), traces: d.traces, eidolons: d.eidolons, notes: d.notes }; }

export function simulate(config) {
  const team = (config.team || []).filter(Boolean);
  const cycles = config.battle.cycles;
  const totalAV = config.battle.firstCycleAV + (cycles - 1) * config.battle.avPerCycle;
  const timeline = []; const byMember = []; const byType = { basic: 0, skill: 0, ult: 0, fua: 0, dot: 0, break: 0, elation: 0, true: 0, memo: 0 };
  const rotation = {}; const finalStats = [];
  let sp = config.battle.startSP;
  team.forEach((m, idx) => {
    const st = computeStats(m); finalStats.push(st);
    const c = chr(m.charId);
    const cr = config.options.critMode === 'always' ? 1 + st.critDmg : 1 + Math.min(1, st.critRate) * st.critDmg;
    const actions = { basic: 0, skill: 0, ult: 0, fua: 0 }; let dmgSum = 0; const seq = [];
    const n = Math.floor(totalAV / (10000 / st.spd));
    let energy = 60;
    for (let k = 0; k < n; k++) {
      const av = (k + 1) * (10000 / st.spd) + idx * 0.01;
      const useSkill = sp > 0 && (m.policy.mode !== 'basicOnly') && idx !== 3;
      const act = useSkill ? 'skill' : 'basic';
      sp += useSkill ? -1 : 1; sp = Math.min(sp, 5);
      energy += useSkill ? 30 : 20;
      const d = idx >= 1 ? 0 : st.atk * (useSkill ? 2.2 : 1) * 1.6 * cr * 0.45 * (1 + 0.1 * m.eidolon);
      actions[act]++; byType[act] += d; dmgSum += d; seq.push(useSkill ? 'E' : 'A');
      timeline.push({ av, actor: c.name, charId: c.id, action: act, skillName: c.name + (useSkill ? '·战技' : '·普攻'), damage: d, sp, energy: Math.min(energy, 120), hits: d ? [{ target: 0, dmg: d * 0.7, note: '主目标' }, { target: 0, dmg: d * 0.3, note: '第2段' }] : [], buffs: useSkill ? ['速度+25%'] : [] });
      if (energy >= 120) {
        energy = 5;
        const du = idx >= 1 ? 0 : st.atk * 4.25 * 1.6 * cr * 0.45 * (config.enemy.count || 1);
        actions.ult++; byType.ult += du; dmgSum += du; seq.push('Q');
        timeline.push({ av: av + 0.001, actor: c.name, charId: c.id, action: 'ult', skillName: c.name + '·终结技', damage: du, sp, energy, hits: du ? [{ target: 0, dmg: du, note: '全体' }] : [], buffs: [] });
      }
    }
    rotation[c.id] = seq.join(' ');
    byMember.push({ charId: c.id, name: c.name, damage: dmgSum, share: 0, actions });
  });
  timeline.sort((a, b) => a.av - b.av);
  const total = byMember.reduce((a, b) => a + b.damage, 0);
  byMember.forEach((b) => { b.share = total ? b.damage / total : 0; });
  const warnings = ['mock 引擎：结果为假数据'];
  if (config.enemy.count > 3) warnings.push('mock：敌人数量较多');
  return { total, perCycle: total / cycles, totalAV, byMember, byType, timeline, rotation, finalStats, warnings };
}
