#!/usr/bin/env node
// scripts/v2/build_kits.mjs —— 解析 data/v2/raw → data/v2/kits.json 与 engine2/data.gen.js（契约见 docs/V2_DESIGN.md §2）
// 用法：node scripts/v2/build_kits.mjs   （无依赖）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyNameFixes } from './names.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RAW = path.join(ROOT, 'data/v2/raw');
const VERSION = '4.6.51';

const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const listJSON = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();

// ---------------------------------------------------------------------------
// 常量与映射
export const ELEM_ZH = { 物理: 'Physical', 火: 'Fire', 冰: 'Ice', 雷: 'Thunder', 风: 'Wind', 量子: 'Quantum', 虚数: 'Imaginary' };
export const ELEMENTS = ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'];

export const PROP_MAP = {
  AttackAddedRatio: 'atkPct', HPAddedRatio: 'hpPct', DefenceAddedRatio: 'defPct', CriticalChanceBase: 'critRate',
  CriticalDamageBase: 'critDmg', SpeedDelta: 'spd', BreakDamageAddedRatioBase: 'breakEffect', StatusProbabilityBase: 'effectHitRate',
  StatusResistanceBase: 'effectRes', SPRatioBase: 'energyRegen', HealRatioBase: 'outgoingHeal',
  AttackDelta: 'atk', HPDelta: 'hp', DefenceDelta: 'def', ElationDamageAddedRatioBase: 'elation',
  SpeedAddedRatio: 'spdPct',
};
for (const e of ELEMENTS) PROP_MAP[e + 'AddedRatio'] = 'dmgBonus_' + e;
function mapProp(pt, notes) {
  if (PROP_MAP[pt]) return PROP_MAP[pt];
  if (notes) notes.push('未知属性类型 ' + pt + '（原样保留）');
  return pt;
}
const RELIC_SLOT = { BODY: 'body', FOOT: 'feet', NECK: 'sphere', OBJECT: 'rope', HEAD: 'head', HAND: 'hands' };

// ---------------------------------------------------------------------------
// 文本工具
export function stripTags(s) {
  if (s == null) return '';
  return String(s)
    .replace(/\\n/g, '\n')
    .replace(/\{RUBY_B#[^}]*\}/g, '').replace(/\{RUBY_E#\}/g, '')
    .replace(/<[^>]*>/g, '');
}
function fmtNum(v, fmt, pct) {
  if (v == null || Number.isNaN(v)) return '?';
  const x = pct ? v * 100 : v;
  const m = /^f(\d)$/.exec(fmt);
  if (m) return x.toFixed(+m[1]);
  return String(Math.round(x * 1e6) / 1e6 % 1 === 0 ? Math.round(x) : Math.floor(x + 1e-6));
}
export function fillDesc(raw, params) {
  if (!raw) return '';
  return raw.replace(/#(\d+)\[(\w+)\](%?)/g, (_, n, fmt, pct) => {
    const v = params ? params[+n - 1] : undefined;
    return fmtNum(v, fmt, !!pct) + (pct ? '%' : '');
  });
}
const PH = '#(\\d+)\\[(\\w+)\\]';
function sentences(text) {
  return text.split(/[。\n；]/).map((s) => s.trim()).filter(Boolean);
}
const COND_RE = /若|当|如果|时|处于|低于|高于|大于|小于/;

function valueOf(ph, isPct, constStr) {
  if (ph != null) return { param: +ph - 1 };
  const v = parseFloat(constStr);
  return isPct ? +(v / 100).toFixed(6) : v;
}
function resolveVal(v, params) {
  if (v && typeof v === 'object' && v.param != null) return params ? params[v.param] : undefined;
  return v;
}

// ---------------------------------------------------------------------------
// Hits 解析
const HIT_RE = new RegExp(
  '(攻击力|生命上限|防御力)?(?:（' + PH + '\\*(欢愉度|击破特攻|暴击伤害|攻击力)\\+)?' + PH + '%）?' +
  '(攻击力|生命上限|防御力|欢愉度|本场战斗中累计已损失生命值)?的?' +
  '(?:(物理|火|冰|雷|风|量子|虚数|对应|相应)属性)?的?(欢愉|持续|附加|真实|超击破|击破|终结技|追加攻击)?伤害', 'g');
const DOT_WORDS = /触电|灼烧|风化|裂伤|持续伤害/;

function slotDmgType(slot) {
  return ({ basic: 'basic', enhancedBasic: 'basic', skill: 'skill', enhancedSkill: 'skill', ult: 'ult', talent: 'fua',
    memo: 'memo', elation: 'elation', technique: 'skill', other: 'skill' })[slot] || 'skill';
}

// 非标准伤害段（引爆等），不进入 hits
export function parseSpecials(rawDesc) {
  const out = [];
  if (!rawDesc) return out;
  for (const m of rawDesc.matchAll(/(?:立即)?产生相当于原伤害#(\d+)\[\w+\]%的伤害/g)) out.push({ kind: 'dotDetonate', param: +m[1] - 1, raw: m[0] });
  for (const m of rawDesc.matchAll(/等同于(?:本次)?总?伤害值?#(\d+)\[\w+\]%的(?:真实伤害|【欢愉负债】)/g)) out.push({ kind: 'percentOfDamage', param: +m[1] - 1, raw: m[0] });
  return out;
}

export function parseHits(rawDesc, ctx) {
  const hits = [];
  if (!rawDesc) return hits;
  const sents = sentences(rawDesc);
  let durationParam = null, durationConst = null;
  const dm = /持续#(\d+)\[i\]回合/.exec(rawDesc);
  if (dm) durationParam = +dm[1] - 1; else { const d2 = /持续(\d+)回合/.exec(rawDesc); if (d2) durationConst = +d2[1]; }
  for (let si = 0; si < sents.length; si++) {
    const s = sents[si];
    HIT_RE.lastIndex = 0;
    let m, last = 0;
    while ((m = HIT_RE.exec(s))) {
      const pre = s.slice(last, m.index);
      const full = s.slice(0, m.index);
      const whole = m[0], exP = m[2], exStat = m[4], pN = m[5], stat = m[7] || m[1], elemZh = m[8], kind = m[9];
      last = m.index + whole.length;
      const verbIdx = Math.max(full.lastIndexOf('造成'), full.lastIndexOf('受到'), full.lastIndexOf('附加'));
      if (verbIdx < 0 || m.index - verbIdx > 40) continue;
      const between = s.slice(verbIdx, m.index);
      if (/提高|降低|增加|减少/.test(between) && !/等同于/.test(between)) continue;
      if (/基础概率|固定概率/.test(s.slice(m.index, m.index + whole.length + 6))) continue;
      if (!stat && !kind && !elemZh && !exP) continue; // “抵挡#2%的伤害”“原伤害#N%的伤害”等非倍率段
      if (/抵挡|抵御|减免|分摊/.test(between)) continue;
      const low = [];
      let scaling = stat === '生命上限' ? 'hp' : stat === '防御力' ? 'def' : stat === '欢愉度' ? 'elation' : 'atk';
      // 组合倍率：#a%攻击力+#b%生命上限+…（拆成多段同目标 hit）
      const combos = [...between.matchAll(/#(\d+)\[\w+\]%(攻击力|生命上限|防御力)\+/g)];
      let dmgType = slotDmgType(ctx.slot);
      const ctxText = s.slice(Math.max(0, verbIdx - 30), m.index);
      if (kind === '欢愉') { scaling = 'elation'; dmgType = 'elation'; }
      else if (kind === '真实') { scaling = 'true'; dmgType = 'true'; low.push('真实伤害'); }
      else if (kind === '击破' || kind === '超击破') { scaling = 'break'; dmgType = 'break'; low.push('击破类'); }
      else if (kind === '持续' || (DOT_WORDS.test(ctxText) && /回合开始时|受到/.test(ctxText))) { dmgType = 'dot'; }
      else if (/追加攻击/.test(s) || kind === '追加攻击') dmgType = 'fua';
      else if (ctx.slot === 'talent') { dmgType = /追加攻击/.test(rawDesc) ? 'fua' : 'skill'; if (dmgType !== 'fua') low.push('天赋伤害类型未知'); }
      if (!stat && kind !== '欢愉' && !exP && scaling === 'atk') low.push('基准默认攻击力');
      let target = 'single';
      const tctx = pre.length > 3 ? pre : ctxText;
      const blast = /(单体|目标)(及|和|与|以及)其?相邻目标/.test(tctx);
      if (blast) target = 'single';
      else if (/相邻目标/.test(tctx)) target = 'adjacent';
      else if (/敌方全体|所有敌方|全体敌方/.test(tctx)) target = 'aoe';
      else if (/弹射/.test(tctx)) target = 'bounce';
      else if (/随机/.test(tctx)) target = 'random';
      else if (/敌方单体|敌方目标|该目标|其|目标/.test(tctx)) target = 'single';
      else if (/敌方全体/.test(s)) { target = 'aoe'; low.push('目标推断'); }
      else low.push('目标推断');
      let count = 1, countParam = null;
      const cSrc = tctx + (si > 0 && /每次|每段/.test(tctx) ? sents[si - 1] : '');
      let cm = /#(\d+)\[i\](?:次|段)/.exec(cSrc);
      if (cm) countParam = +cm[1] - 1;
      else if ((cm = /(?:共|额外|造成|弹射|发动)(\d+)(?:次|段)/.exec(cSrc))) count = +cm[1];
      if ((target === 'random' || target === 'bounce') && countParam == null && count === 1 && !/1次/.test(cSrc)) low.push('次数未解析');
      const hit = {
        scaling, param: +pN - 1, target, count, countParam,
        element: ELEM_ZH[elemZh] || ctx.element,
        dmgType, confidence: 'high',
        raw: s.slice(Math.max(0, verbIdx), last),
      };
      if (elemZh === '对应' || elemZh === '相应') low.push('属性=对应属性');
      if (kind === '附加') hit.additional = true;
      if (exP) { hit.extra = { stat: ({ 欢愉度: 'elation', 击破特攻: 'breakEffect', 暴击伤害: 'critDmg', 攻击力: 'atk' })[exStat], param: +exP - 1 }; low.push('复合倍率'); }
      if (dmgType === 'dot') {
        if (durationParam != null) { hit.durationParam = durationParam; hit.duration = ctx.params ? ctx.params[durationParam] : null; }
        else if (durationConst != null) hit.duration = durationConst;
        else { hit.duration = 2; low.push('DoT 持续回合默认 2'); }
        const dk = /触电/.test(s) ? 'shock' : /灼烧/.test(s) ? 'burn' : /风化/.test(s) ? 'windShear' : /裂伤/.test(s) ? 'bleed' : null;
        if (dk) hit.dotKind = dk;
      }
      if (ctx.slot !== 'talent' && /每次(施放)?攻击后|攻击后，.{0,8}额外造成|每当.{0,12}攻击/.test(s)) {
        low.push('由我方攻击触发的附带伤害'); hit.trigger = 'onAllyAttack';
        // 伤害结算者：句中施放者名字出现在“攻击后”与“造成”之间 → 施放者本人；否则为触发攻击的队友（“其自身”指队友）
        const aIdx = s.search(/攻击后/);
        const seg = aIdx >= 0 ? s.slice(aIdx, verbIdx) : '';
        hit.triggerActor = ctx.charName && seg.includes(ctx.charName) ? 'owner' : (/其自身|其攻击力/.test(s.slice(verbIdx, last)) ? 'holder' : 'owner');
      }
      if (scaling === 'break' && /击破[^，。]{0,6}弱点时/.test(s) && ctx.slot === 'talent') hit.trigger = 'onBreak';
      else if (scaling === 'break' && /尝试从弱点击破状态恢复时/.test(rawDesc)) hit.trigger = 'onBreakRecover';
      const fc = /暴击率固定为(?:#(\d+)\[\w+\]|(\d+))%[，,]?(?:暴击伤害固定为(?:#(\d+)\[\w+\]|(\d+))%)?/.exec(sents.slice(si, si + 2).join('。'));
      const fcv = (ph, c) => (ph ? (ctx.params ? ctx.params[+ph - 1] : null) : c != null ? +c / 100 : null);
      if (fc && hit.trigger === 'onAllyAttack') hit.fixedCrit = { rate: fcv(fc[1], fc[2]), dmg: fcv(fc[3], fc[4]) };
      hit.rawResolved = fillDesc(hit.raw, ctx.params);
      if (low.length) { hit.confidence = 'low'; hit.lowReason = low.join('；'); }
      if (combos.length) {
        hit.confidence = 'low'; hit.lowReason = (hit.lowReason ? hit.lowReason + '；' : '') + '组合倍率拆段';
        for (const c of combos) hits.push(Object.assign({}, hit, { scaling: c[2] === '生命上限' ? 'hp' : c[2] === '防御力' ? 'def' : 'atk', param: +c[1] - 1 }));
      }
      if (stat === '本场战斗中累计已损失生命值') { if (ctx.specials) ctx.specials.push({ kind: 'hpLostScaling', param: +pN - 1, target, raw: hit.raw }); continue; }
      if (blast) {
        hits.push(hit);
        hits.push(Object.assign({}, hit, { target: 'adjacent', raw: hit.raw + '（相邻同倍率）' }));
        continue;
      }
      hits.push(hit);
    }
  }
  // DoT 目标：“使受到攻击的敌方目标陷入…”且同技能有全体伤害段 → DoT 作用于全体
  if (hits.some((h) => h.target === 'aoe' && h.dmgType !== 'dot') && /受到攻击的敌方目标陷入|使敌方全体[^。]{0,12}陷入/.test(rawDesc)) {
    for (const h of hits) if (h.dmgType === 'dot' && h.target === 'single') h.target = 'aoe';
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Effects 解析
const STAT_WORDS = [
  ['暴击率', 'critRate', 'critRate'], ['暴击伤害', 'critDmg', 'critDmg'],
  ['攻击力', 'atkPct', 'atk'], ['生命上限', 'hpPct', 'hp'], ['防御力', 'defPct', 'def'],
  ['速度', 'spdPct', 'spd'], ['击破特攻', 'breakEffect', 'breakEffect'], ['效果命中', 'effectHitRate', 'effectHitRate'],
  ['效果抵抗', 'effectRes', 'effectRes'], ['能量恢复效率', 'energyRegen', 'energyRegen'], ['治疗量', 'outgoingHeal', 'outgoingHeal'],
  ['欢愉度', 'elation', 'elation'], ['弱点击破效率', 'weaknessBreakEfficiency', 'weaknessBreakEfficiency'],
];
const DMG_KIND = [['普攻', 'basic'], ['战技', 'skill'], ['终结技', 'ult'], ['追加攻击', 'fua'], ['持续伤害', 'dot'], ['忆灵技', 'memo'], ['欢愉技', 'elation'], ['超击破伤害', 'superBreak'], ['击破伤害', 'break']];

const TGT_PATS = [
  ['allies', /除[^，。]{0,12}?(以外|之外|外)的?(我方|队友|其他|其余|所有)[^，。]{0,4}|其他队友|其余队友|其他我方[^，。]{0,4}|(使|为|令|给)队友|队友的|其他角色|其他我方角色|其余角色/g],
  ['team', /我方全体(目标)?|全体我方|我方所有(目标)?|全队|我方目标|所有队友|我方角色/g],
  ['ally', /指定我方单体|我方单体|目标队友|该队友|指定队友|当前生命值百分比最低的我方|该目标|技能目标/g],
  ['self', /SELF|自身|装备者|自己/g],
  ['enemy', /敌方(目标|单体|全体)?|敌人/g],
];
function scanTargets(pre, charName) {
  let t = pre;
  if (charName) t = t.split(charName).join('SELF');
  const found = [];
  for (const [kind, re] of TGT_PATS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(t))) {
      let k = kind;
      if (/被$/.test(t.slice(0, m.index))) continue; // “被我方目标消耗生命值”：非受益者
      if (k !== 'enemy' && k !== 'self' && /对$/.test(t.slice(0, m.index))) k = 'enemy'; // “对该目标造成的伤害”
      found.push({ kind: k, start: m.index, end: m.index + m[0].length });
    }
  }
  // 被更长匹配覆盖的短匹配（如“除自身以外的队友”中的“自身”）剔除
  return { text: t, found: found.filter((a) => !found.some((b) => b !== a && b.start <= a.start && b.end >= a.end && (b.end - b.start) > (a.end - a.start))) };
}
function detectTarget(pre, enemySide, charName) {
  if (enemySide) {
    const loc = pre.slice(-30);
    return /敌方全体|所有敌方|全体敌方/.test(loc) ? 'enemies' : 'enemy';
  }
  const { found } = scanTargets(pre, charName);
  let best = null;
  for (const f of found) if (f.kind !== 'enemy' && (!best || f.end > best.end)) best = f;
  return best ? best.kind : 'self';
}
// 最近的主体是否为敌方（“使敌方目标攻击力提高”类）
function ownerIsEnemy(pre, charName) {
  const { text, found } = scanTargets(pre, charName);
  let best = null;
  for (const f of found) if (!best || f.end > best.end) best = f;
  if (!best || best.kind !== 'enemy') return false;
  if (/对[^，。]{0,14}$/.test(text.slice(0, best.start))) return false; // “对敌方目标造成的伤害提高”
  const gap = text.slice(best.end);
  return gap.length <= 8 && !/时|后|，|造成|攻击/.test(gap);
}
function hasTargetWord(pre, charName) {
  return scanTargets(pre, charName).found.some((f) => f.kind !== 'enemy');
}
function detectTrigger(sent, defTrig) {
  if (/战斗开始时|进入战斗(后|时)/.test(sent)) return 'battleStart';
  if (defTrig === 'onCast') return 'onCast';
  if (/(我方目标|队友)[^，。]{0,6}攻击敌方目标后/.test(sent)) return 'onAllyAttack';
  if (/施放终结技(后|时)/.test(sent)) return 'onUlt';
  if (/施放战技(后|时)/.test(sent)) return 'onSkill';
  if (/施放普攻(后|时)/.test(sent)) return 'onBasic';
  if (/追加攻击(后|时)/.test(sent)) return 'onFua';
  if (/攻击(后|时)/.test(sent)) return 'onAttack';
  return defTrig;
}
function stripTriggerPhrase(s) {
  return s.replace(/(施放|使用)?(终结技|战技|普攻|追加攻击|攻击|忆灵技|欢愉技)(后|时)/g, '').replace(/战斗开始时|进入战斗(后|时)/g, '');
}
const NUM = '(?:' + PH + '(%?)|(\\d+(?:\\.\\d+)?)(%?))';
// NUM 捕获组：[ph, fmt, pct1, const, pct2]
function numVal(m, i) {
  const ph = m[i], pct = m[i + 2] === '%' || m[i + 4] === '%';
  return { value: valueOf(ph, pct, m[i + 3]), pct };
}
const STAT_ZH = { 攻击力: ['atkPct', 'atk'], 生命上限: ['hpPct', 'hp'], 防御力: ['defPct', 'def'], 速度: ['spdPct', 'spd'], 暴击率: ['critRate', 'critRate'], 暴击伤害: ['critDmg', 'critDmg'], 击破特攻: ['breakEffect', 'breakEffect'], 效果命中: ['effectHitRate', 'effectHitRate'], 效果抵抗: ['effectRes', 'effectRes'], 欢愉度: ['elation', 'elation'] };
const SCALE_SRC = { 攻击力: 'atk', 生命上限: 'hp', 防御力: 'def', 速度: 'spd', 暴击率: 'critRate', 暴击伤害: 'critDmg', 击破特攻: 'breakEffect', 效果命中: 'effectHitRate', 欢愉度: 'elation' };

export function parseEffects(rawDesc, ctx) {
  const out = [];
  if (!rawDesc) return out;
  const cn = ctx.charName || null;
  const sents = sentences(rawDesc);
  const push = (e) => { e.key = ctx.keyPrefix + ':' + out.length; out.push(e); };
  const statAlt = STAT_WORDS.map((w) => w[0]).join('|');
  const convAlt = Object.keys(STAT_ZH).join('|');
  for (const s of sents) {
    let m;
    const summon = /^【[^】]+】|使【[^】]+】/.test(s) && !/【[^】]+】(状态|效果)/.test(s);
    const used = [];
    const overlaps = (a, b) => used.some(([x, y]) => a < y && b > x);
    // 逐条效果的上下文：条件/触发看前文，持续/层数看后文（截止到下一个带条件的分句）
    const ctxAt = (idx, len) => {
      const pre = s.slice(0, idx);
      const preC = stripTriggerPhrase(pre.replace(/同时|时间|时长/g, ''));
      const condText = COND_RE.test(preC) ? s : null;
      const trigger = detectTrigger(pre, ctx.defTrigger);
      let tail = s.slice(idx + len);
      const cut = tail.search(/，[^，]*?(当|若|如果|每当|施放|受到攻击|进入战斗)/);
      if (cut >= 0) tail = tail.slice(0, cut);
      const own = s.slice(idx, idx + len) + tail;
      let duration = null, dmm;
      if ((dmm = new RegExp('持续' + PH + '回合').exec(own))) duration = resolveVal({ param: +dmm[1] - 1 }, ctx.params) ?? null;
      else if ((dmm = /持续(\d+)回合/.exec(own))) duration = +dmm[1];
      else {
        // 前文最近的“持续N回合”，且其后到本效果之间没有其它数值效果
        const pm = [...pre.matchAll(new RegExp('持续(?:' + PH + '|(\\d+))回合', 'g'))].pop();
        if (pm && !/#\d+\[\w+\]/.test(pre.slice(pm.index + pm[0].length))) duration = pm[1] ? (resolveVal({ param: +pm[1] - 1 }, ctx.params) ?? null) : +pm[3];
      }
      let maxStacks = 1, smm;
      const ownHasStack = new RegExp('叠加' + PH + '层|叠加(\\d+)层').test(own);
      const stackSrc = ownHasStack ? own : s;
      if ((smm = new RegExp('(?:最多|可|至多)(?:可以)?叠加' + PH + '层').exec(stackSrc))) maxStacks = resolveVal({ param: +smm[1] - 1 }, ctx.params) ?? 1;
      else if ((smm = /(?:最多|可|至多)(?:可以)?叠加(\d+)层/.exec(stackSrc))) maxStacks = +smm[1];
      // 「每承受1个…，最多计入N个」（如幽锁深牢的系囚：每个 DoT 无视 6% 防御，最多 3 个）
      if (maxStacks === 1 && /每(承受|拥有|有)1个/.test(pre) && (smm = new RegExp('最多计入(?:(\\d+)|' + PH + ')个').exec(s))) {
        maxStacks = smm[1] ? +smm[1] : (resolveVal({ param: +smm[2] - 1 }, ctx.params) ?? 1);
      }
      const perStack = /每(?!个波次|回合|次施放|个回合)(超过|有|持有|层|点|1点|提高|消耗|损失|拥有|击破|名|个|累计|1个|1名|1层)/.test(pre.slice(-40));
      // 层数短语不在本效果后文时（整句回退），仅当本效果是「每…」按层效果，或本效果与层数短语之间没有其它数值效果时才采用
      if (maxStacks > 1 && smm) {
        const base = ownHasStack ? idx : 0;
        const sp = base + smm.index, after = idx + len;
        const between = sp >= after ? s.slice(after, sp) : null;
        if (!perStack && !(between != null && !/#\d+\[\w+\]/.test(between))) maxStacks = 1;
      }
      return { condText, trigger, duration, maxStacks, perStack };
    };
    const add = (stat, value, target, raw, low, extra, span, at) => {
      if (span) { if (overlaps(span[0], span[1])) return; used.push(span); }
      const c = ctxAt(at != null ? at : (span ? span[0] : (m && m[0] === raw ? m.index : Math.max(0, s.indexOf(raw)))), raw.length);
      const e = { key: '', stat, value, target, duration: c.duration,
        trigger: c.condText && c.trigger === 'passive' ? 'conditional' : c.trigger,
        maxStacks: c.maxStacks, condition: c.condText, confidence: (low || c.perStack || summon) ? 'low' : 'high', raw };
      if (c.perStack) e.lowReason = '按层/按点数缩放';
      else if (summon) e.lowReason = '主体可能为召唤物/状态';
      if (extra) Object.assign(e, extra);
      push(e);
    };
    // 0) 转化类：X提高，提高数值等同于<谁>的Y#N%(+#M)
    const convRe = new RegExp('(' + convAlt + ')(?:提高|增加)，提高数值等同于([^，。#]{0,14}?)(?:(' + convAlt + ')的)?' + PH + '%(' + convAlt + ')?(?:\\+' + PH + '(%?)点?)?', 'g');
    while ((m = convRe.exec(s))) {
      const src = m[3] || m[6];
      const statKey = ['atk', 'hp', 'def', 'spd'].includes(SCALE_SRC[src]) ? STAT_ZH[m[1]][1] : STAT_ZH[m[1]][0];
      const extra = { scaleStat: SCALE_SRC[src] || null, scaleSource: /SELF|自身|装备者/.test(cn ? m[2].split(cn).join('SELF') : m[2]) || m[2] === '' ? 'self' : 'self' };
      if (m[7]) extra.flatAdd = { param: +m[7] - 1 };
      add(statKey, { param: +m[4] - 1 }, detectTarget(s.slice(0, m.index), false, cn), m[0], true, extra, [m.index, m.index + m[0].length]);
    }
    // 0a) 倒装转化：提高装备者等同于当前效果命中#N%的攻击力，最多提高#M%
    const conv2Re = new RegExp('(?:提高|增加)([^，。#]{0,8}?)等同于(?:当前|自身)?([^，。#]{0,8}?)(' + convAlt + ')?' + PH + '%的(' + convAlt + ')', 'g');
    while ((m = conv2Re.exec(s))) {
      const srcStat = m[3] || Object.keys(SCALE_SRC).find((k) => (m[2] || '').endsWith(k));
      if (!srcStat || !STAT_ZH[m[6]]) continue;
      const statKey = ['atk', 'hp', 'def', 'spd'].includes(SCALE_SRC[srcStat]) ? STAT_ZH[m[6]][1] : STAT_ZH[m[6]][0];
      const extra = { scaleStat: SCALE_SRC[srcStat] };
      const capM = new RegExp('最多(?:使)?[^，。]{0,10}?(?:提高|增加)' + PH + '%').exec(s.slice(m.index + m[0].length));
      if (capM) extra.cap = { param: +capM[1] - 1 };
      add(statKey, { param: +m[4] - 1 }, detectTarget(s.slice(0, m.index) + m[1], false, cn), m[0], true, extra, [m.index, m.index + m[0].length]);
    }
    // 0a2) 同时提高等同于X#N%暴击伤害+#M%的暴击伤害
    const conv3Re = new RegExp('(?:提高|增加)等同于([^，。#]{0,10}?)' + PH + '%(' + convAlt + ')\\+' + PH + '%的(' + convAlt + ')', 'g');
    while ((m = conv3Re.exec(s))) {
      if (!STAT_ZH[m[7]] || !SCALE_SRC[m[4]]) continue;
      const statKey = ['atk', 'hp', 'def', 'spd'].includes(SCALE_SRC[m[4]]) ? STAT_ZH[m[7]][1] : STAT_ZH[m[7]][0];
      add(statKey, { param: +m[2] - 1 }, detectTarget(s.slice(0, m.index), false, cn), m[0], true, { scaleStat: SCALE_SRC[m[4]], flatAdd: { param: +m[5] - 1 } }, [m.index, m.index + m[0].length]);
    }
    // 0b) 增伤转化：造成的伤害提高，提高数值等同于X的#N%，最多…提高#M%
    const convDmgRe = new RegExp('造成的伤害(?:提高|增加)，提高数值等同于([^，。#]{0,14}?)(?:(' + convAlt + ')的)?' + PH + '%(' + convAlt + ')?', 'g');
    while ((m = convDmgRe.exec(s))) {
      const extra = { scaleStat: SCALE_SRC[m[2] || m[5]] || null };
      const capM = new RegExp('最多(?:使)?[^，。]{0,10}?(?:提高|增加)' + PH + '%').exec(s.slice(m.index + m[0].length));
      if (capM) extra.cap = { param: +capM[1] - 1 };
      add('dmgBonus', { param: +m[3] - 1 }, detectTarget(s.slice(0, m.index), false, cn), m[0], true, extra, [m.index, m.index + m[0].length]);
    }
    // 1a) 多技能增伤：普攻和战技造成的伤害提高
    const multiRe = new RegExp('((?:普攻|战技|终结技|追加攻击)(?:[和、与及](?:普攻|战技|终结技|追加攻击))+)(?:造成的)?伤害(?:提高|增加)' + NUM, 'g');
    while ((m = multiRe.exec(s))) {
      const nv = numVal(m, 2);
      const tgt = detectTarget(s.slice(0, m.index), false, cn);
      const span = [m.index, m.index + m[0].length];
      for (const k of m[1].split(/[和、与及]/)) {
        const kk = DMG_KIND.find((x) => x[0] === k);
        if (kk) add('dmgBonus_' + kk[1], nv.value, tgt, m[0], false);
      }
      used.push(span);
    }
    // 1) 属性提高
    const upRe = new RegExp('(' + statAlt + ')(?:和(' + statAlt + '))?(?:分别)?(额外)?(?:提高|增加|提升)' + NUM, 'g');
    while ((m = upRe.exec(s))) {
      const pre = s.slice(0, m.index);
      if (overlaps(m.index, m.index + m[0].length)) continue;
      const w = STAT_WORDS.find((x) => x[0] === m[1]);
      const nv = numVal(m, 4);
      const stat = nv.pct ? w[1] : w[2];
      if (ownerIsEnemy(pre, cn)) continue;
      if (/受到的?$|抵抗$|抵抗[^，]{0,4}的?$/.test(pre)) continue;
      if (/(最多|至多|最高)(可)?(使)?[^，。]{0,8}$/.test(pre)) continue; // 上限描述
      let low = !!m[3]; const extra = m[3] ? { lowReason: '额外提高（通常附条件）' } : {};
      const localPre = pre.slice(-14);
      const kindM = DMG_KIND.find((k) => localPre.endsWith(k[0] + '的') || localPre.endsWith(k[0]));
      if (kindM && (stat === 'critDmg' || stat === 'critRate')) { extra.appliesTo = kindM[1]; low = true; }
      const tgt = detectTarget(pre, false, cn);
      add(stat, nv.value, tgt, m[0], low, extra);
      if (m[2]) { const w2 = STAT_WORDS.find((x) => x[0] === m[2]); add(nv.pct ? w2[1] : w2[2], nv.value, tgt, m[0], true); }
    }
    // 1b) 倒装：提高#N%的速度
    const revRe = new RegExp('(?:提高|增加)' + NUM + '的(' + statAlt + ')', 'g');
    while ((m = revRe.exec(s))) {
      const pre = s.slice(0, m.index);
      if (ownerIsEnemy(pre, cn)) continue;
      const w = STAT_WORDS.find((x) => x[0] === m[6]);
      const nv = numVal(m, 1);
      add(nv.pct ? w[1] : w[2], nv.value, detectTarget(pre, false, cn), m[0], false);
    }
    // 2) 增伤
    const dmgRe = new RegExp('(?:(物理|火|冰|雷|风|量子|虚数)属性伤害|(普攻|战技|终结技|追加攻击|持续伤害|忆灵技|欢愉技|超击破伤害|击破伤害)(?:造成的)?(?:伤害)?|造成的(?:(普攻|战技|终结技|追加攻击|持续|击破|超击破)?伤害)|伤害)(额外)?(?:提高|增加|提升)' + NUM, 'g');
    while ((m = dmgRe.exec(s))) {
      const pre = s.slice(0, m.index);
      if (overlaps(m.index, m.index + m[0].length)) continue;
      if (/受到的?[^，]{0,10}$/.test(pre)) continue;
      if (/暴击$|倍率$|真实$|欢愉$/.test(pre)) continue;
      if (/(最多|至多|最高)(可)?(使)?[^，。]{0,8}$/.test(pre)) continue;
      if (ownerIsEnemy(pre, cn)) continue;
      const nv = numVal(m, 5);
      if (!nv.pct) continue;
      let stat = 'dmgBonus', low = !!m[4];
      if (m[1]) stat = 'dmgBonus_' + ELEM_ZH[m[1]];
      const k = m[2] || m[3];
      if (k === '击破' || k === '超击破') { stat = k === '击破' ? 'dmgBonus_break' : 'dmgBonus_superBreak'; low = true; }
      else if (k) { const kk = DMG_KIND.find((x) => x[0] === k || x[0] === k + '伤害'); stat = 'dmgBonus_' + (kk ? kk[1] : 'dot'); if (kk && (kk[1] === 'break' || kk[1] === 'superBreak')) low = true; }
      if (!m[1] && !k && !/造成的伤害/.test(m[0]) && !hasTargetWord(pre.slice(-12), cn)) low = true;
      add(stat, nv.value, detectTarget(pre, false, cn), m[0], low);
    }
    // 2b) 增笑（欢愉伤害乘区）
    const ampRe = new RegExp('增笑' + NUM, 'g');
    while ((m = ampRe.exec(s))) add('amplification', numVal(m, 1).value, detectTarget(s.slice(0, m.index), false, cn), m[0], false, { appliesTo: 'elation' });
    // 3) 易伤
    const vulnRe = new RegExp('受到的(?:(物理|火|冰|雷|风|量子|虚数)属性|(持续|击破|追加攻击|终结技|超击破))?伤害(?:提高|增加)' + NUM, 'g');
    while ((m = vulnRe.exec(s))) {
      const pre = s.slice(0, m.index);
      if (/我方|自身|装备者|SELF/.test(pre.slice(-10)) && !/敌方/.test(pre)) continue;
      const nv = numVal(m, 3);
      let stat = 'vuln';
      if (m[1]) stat = 'vuln_' + ELEM_ZH[m[1]];
      if (m[2]) stat = 'vuln_' + ({ 持续: 'dot', 击破: 'break', 追加攻击: 'fua', 终结技: 'ult', 超击破: 'superBreak' })[m[2]];
      add(stat, nv.value, detectTarget(pre, true, cn), m[0], !/敌方|目标|敌人/.test(pre));
    }
    // 3b) 仅对自身伤害生效的易伤：「目标受到装备者/<角色>造成的X伤害提高N%」→ 记在自身（战斗中与敌方减益同样参与易伤区，但不惠及队友）
    const whoAlt = ['装备者', 'SELF'].concat(cn ? [cn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')] : []).join('|');
    const vulnSelfRe = new RegExp('受到(?:' + whoAlt + ')造成的(?:(物理|火|冰|雷|风|量子|虚数)属性|(持续|击破|追加攻击|终结技|超击破))?伤害(?:提高|增加)' + NUM, 'g');
    while ((m = vulnSelfRe.exec(s))) {
      const nv = numVal(m, 3);
      let stat = 'vuln';
      if (m[1]) stat = 'vuln_' + ELEM_ZH[m[1]];
      if (m[2]) stat = 'vuln_' + ({ 持续: 'dot', 击破: 'break', 追加攻击: 'fua', 终结技: 'ult', 超击破: 'superBreak' })[m[2]];
      add(stat, nv.value, 'self', m[0], false, null, [m.index, m.index + m[0].length]);
    }
    // 4) 减防
    const defRe = new RegExp('防御力(?:降低|减少)' + NUM, 'g');
    while ((m = defRe.exec(s))) {
      const pre = s.slice(0, m.index);
      if (/我方|自身/.test(pre.slice(-8))) continue;
      add('defShred', numVal(m, 1).value, detectTarget(pre, true, cn), m[0], !/敌方|目标|敌人/.test(pre));
    }
    // 5) 无视防御
    const ignRe = new RegExp('无视(?:敌方)?(?:目标|其)?' + NUM + '的?防御', 'g');
    while ((m = ignRe.exec(s))) {
      // 限定伤害类型的无视防御：「击破伤害无视…」「超击破伤害额外无视…」「追加攻击无视…」→ defIgnore_<type>
      const pre = s.slice(0, m.index);
      const kind = /超击破伤害(?:额外)?$/.test(pre) ? 'superBreak' : /击破伤害(?:额外)?$/.test(pre) ? 'break'
        : /持续伤害(?:额外)?$/.test(pre) ? 'dot' : /追加攻击(?:造成的伤害)?(?:额外)?$/.test(pre) ? 'fua'
        : /终结技(?:造成的伤害)?(?:额外)?$/.test(pre) ? 'ult' : null;
      add(kind ? 'defIgnore_' + kind : 'defIgnore', numVal(m, 1).value, detectTarget(pre, false, cn), m[0], false);
    }
    // 6) 减抗
    const resRe = new RegExp('(全属性|(物理|火|冰|雷|风|量子|虚数)属性)?抗性(?:分别)?(?:降低|减少)' + NUM, 'g');
    while ((m = resRe.exec(s))) {
      const pre = s.slice(0, m.index);
      if (/我方|自身/.test(pre.slice(-8))) continue;
      const multi = /分别/.test(m[0]);
      add(m[2] && !multi ? 'resShred_' + ELEM_ZH[m[2]] : 'resShred', numVal(m, 3).value, detectTarget(pre, true, cn), m[0], !m[1] || multi);
    }
    // 7) 抗性穿透
    const penRe = new RegExp('(?:(物理|火|冰|雷|风|量子|虚数)属性|全属性)?抗性穿透(?:提高|增加)' + NUM, 'g');
    while ((m = penRe.exec(s))) add(m[1] ? 'resPen_' + ELEM_ZH[m[1]] : 'resPen', numVal(m, 2).value, detectTarget(s.slice(0, m.index), false, cn), m[0], false);
    // 8) 能量
    const enRe = new RegExp('(?:回复|恢复|获得)(?:' + PH + '|(\\d+))点能量', 'g');
    while ((m = enRe.exec(s))) add('energyFlat', valueOf(m[1], false, m[3]), detectTarget(s.slice(0, m.index), false, cn), m[0], false);
    const enPRe = new RegExp('(?:回复|恢复)(?:等同于)?[^，。#]{0,6}?' + PH + '%能量上限的能量', 'g');
    while ((m = enPRe.exec(s))) add('energyPct', { param: +m[1] - 1 }, detectTarget(s.slice(0, m.index), false, cn), m[0], false);
    // 9) 行动提前
    const aaRe = new RegExp('行动提前' + NUM, 'g');
    while ((m = aaRe.exec(s))) add('actionAdvance', numVal(m, 1).value, detectTarget(s.slice(0, m.index), false, cn), m[0], false);
    // 10) 战技点
    const spRe = new RegExp('(?:回复|恢复|获得)(?:' + PH + '|(\\d+))个战技点', 'g');
    while ((m = spRe.exec(s))) add('spFlat', valueOf(m[1], false, m[3]), 'team', m[0], false);
    // 11) 立即行动（使X立即行动）= 行动提前 100%
    const nowRe = /使([^，。]{0,24}?)立即行动/g;
    while ((m = nowRe.exec(s))) {
      if (/无法触发/.test(s)) continue;
      add('actionAdvance', 1, detectTarget(s.slice(0, m.index) + '使' + m[1], false, cn), m[0], false);
    }
    // 12) 战技点上限
    const spmRe = new RegExp('战技点上限(?:额外)?(?:增加|提高)(?:' + PH + '|(\\d+))点', 'g');
    while ((m = spmRe.exec(s))) add('spMax', valueOf(m[1], false, m[3]), 'team', m[0], false, { trigger: 'passive', condition: null });
  }
  // 后处理
  const holdDur = (name) => {
    const re = new RegExp('【' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '】(?:状态)?[，,]?持续(?:' + PH + '|(\\d+))回合');
    const dm = re.exec(rawDesc);
    if (!dm) return null;
    return dm[1] ? (resolveVal({ param: +dm[1] - 1 }, ctx.params) ?? null) : +dm[3];
  };
  const durs = [...new Set([...rawDesc.matchAll(new RegExp('持续(?:' + PH + '|(\\d+))回合', 'g'))].map((x) => x[1] ? 'p' + x[1] : 'c' + x[3]))];
  for (const e of out) {
    if (INSTANT_KEYS[e.stat]) { e.duration = null; }
    else if (e.duration == null) {
      // 效果所在句提到【状态】，该状态在别处写明“持续N回合”
      const sent = sents.find((x) => x.includes(e.raw)) || '';
      for (const mm of sent.matchAll(/【([^】]+)】/g)) { const d = holdDur(mm[1]); if (d != null) { e.duration = d; e.durationFrom = '【' + mm[1] + '】'; break; } }
      // 主动技能施放的增益：全文只有一个“持续N回合”时采用之
      if (e.duration == null && CAST_SLOTS[ctx.slot] && e.trigger === 'onCast' && durs.length === 1) {
        const x = durs[0];
        e.duration = x[0] === 'p' ? (resolveVal({ param: +x.slice(1) - 1 }, ctx.params) ?? null) : +x.slice(1);
        if (e.duration != null) e.durationFrom = 'skill';
      }
    }
    // 击中【X】状态下的敌方目标时…提高 → 挂在敌人身上（对所有攻击者生效）
    const sent2 = sents.find((x) => x.includes(e.raw)) || '';
    if (/击中【[^】]+】状态下的敌方目标时/.test(sent2) && (e.target === 'team' || e.target === 'allies')) e.target = 'enemy';
    e.rawResolved = fillDesc(e.raw, ctx.params);
  }
  return out;
}
const INSTANT_KEYS = { energyFlat: 1, energyPct: 1, actionAdvance: 1, spFlat: 1 };
const CAST_SLOTS = { basic: 1, skill: 1, ult: 1, enhancedBasic: 1, enhancedSkill: 1, elation: 1, memo: 1 };

const LVKEY = { 普攻: 'basic', 战技: 'skill', 终结技: 'ult', 天赋: 'talent', 忆灵技: 'memo', 忆灵天赋: 'memoTalent', 欢愉技: 'elation' };
export function parseSkillLevelUp(desc) {
  const out = {};
  if (!desc) return null;
  for (const m of desc.matchAll(/(忆灵天赋|忆灵技|普攻|战技|终结技|天赋|欢愉技)等级\+(\d+)/g)) out[LVKEY[m[1]]] = +m[2];
  return Object.keys(out).length ? out : null;
}

// ---------------------------------------------------------------------------
// 角色
const SLOT_BY_TYPE = { Normal: 'basic', BPSkill: 'skill', Ultra: 'ult', Maze: 'technique', ElationDamage: 'elation', Servant: 'memo', Assist: 'other' };
const SECONDARY = { basic: 'enhancedBasic', skill: 'enhancedSkill' };
const DEF_TRIGGER = { basic: 'onCast', skill: 'onCast', ult: 'onCast', enhancedBasic: 'onCast', enhancedSkill: 'onCast', elation: 'onCast', memo: 'onCast', technique: 'battleStart', talent: 'passive', other: 'passive' };

function levelsOf(s) {
  const lv = s.level || {};
  return Object.keys(lv).map(Number).sort((a, b) => a - b).map((k) => (lv[k] && lv[k].param_list) || []);
}
function baseStats(st) {
  const L = 79;
  return {
    hp: +(st.hp_base + st.hp_add * L).toFixed(4), atk: +(st.attack_base + st.attack_add * L).toFixed(4),
    def: +(st.defence_base + st.defence_add * L).toFixed(4),
    spd: st.speed_base, critRate: st.critical_chance, critDmg: st.critical_damage, aggro: st.base_aggro,
  };
}

function buildSkill(charId, id, s, slot, levelCap, element, notes, ctxName) {
  const params = levelsOf(s);
  const maxLevel = levelCap || (params.length >= 10 ? (slot === 'basic' || slot === 'enhancedBasic' ? 6 : 10) : params.length || 1);
  const defaultLevel = Math.min(maxLevel, params.length || 1);
  const dp = params[defaultLevel - 1] || [];
  const rawDesc = stripTags(s.desc);
  const st = s.show_stance_list || [0, 0, 0];
  const spc = parseSpecials(rawDesc);
  const skill = {
    id: String(id), slot, name: stripTags(s.name), typeName: s.type_name || '', tag: s.tag || null,
    desc: fillDesc(rawDesc, dp), rawDesc, simpleDesc: stripTags(s.simple_desc) || null,
    maxLevel, defaultLevel, params,
    spCost: s.bp_need > 0 ? s.bp_need : 0, spGain: s.bp_add > 0 ? s.bp_add : 0,
    energyGain: s.sp_base || 0,
    toughness: { main: st[0] || 0, aoe: st[1] || 0, adjacent: st[2] || 0 },
    hits: parseHits(rawDesc, { slot, element, params: dp, specials: spc, charName: ctxName }),
    effects: parseEffects(rawDesc, { keyPrefix: charId + ':skill:' + id, defTrigger: DEF_TRIGGER[slot] || 'passive', params: dp, charName: ctxName, slot }),
    specials: spc,
  };
  if (s.desc == null) notes.push('技能 ' + id + '「' + s.name + '」desc 为空');
  if (s.elation_priority_value != null) skill.elationPriority = s.elation_priority_value;
  return skill;
}

function assignSlots(skillsObj, typeKeyFn) {
  const entries = Object.entries(skillsObj).sort((a, b) => +a[0] - +b[0]);
  const seen = {};
  const res = [];
  for (const [id, s] of entries) {
    const slot0 = typeKeyFn(s);
    if (!slot0) continue;
    if (!seen[slot0]) { seen[slot0] = 1; res.push([id, s, slot0]); }
    else res.push([id, s, SECONDARY[slot0] || 'other']);
  }
  return res;
}
function charTypeSlot(s) {
  if (s.type === 'MazeNormal') return null;
  if (s.type == null) return s.type_name === '天赋' ? 'talent' : 'other';
  return SLOT_BY_TYPE[s.type] || 'other';
}
function memoTypeSlot(s) { return s.type === 'Servant' ? 'memo' : 'memoTalent'; }

function skillsHaveEnergy(skills) { return skills.some((x) => x.energyGain > 0); }

function buildCharacter(id, c, sup) {
  const notes = [];
  const element = c.damage_type;
  const cname = stripTags(c.name).replace(/^「|」$/g, '');
  const capBySkill = {};
  const traces = [];
  const traceStats = {};
  for (const p of Object.values(c.skill_trees || {})) {
    for (const [lvKey, n] of Object.entries(p)) {
      if ((n.point_type === 2 || n.point_type === 4) && n.level_up_skill_id) {
        for (const sid of n.level_up_skill_id) capBySkill[sid] = Math.max(capBySkill[sid] || 0, n.max_level || 1);
      }
      if (n.point_type === 1) {
        for (const a of n.status_add_list || []) {
          const k = mapProp(a.property_type, notes);
          traceStats[k] = +(((traceStats[k] || 0) + a.value).toFixed(6));
        }
      }
      if ((n.point_type === 3 || n.point_type === 5 || n.point_type === 6) && lvKey === '1') {
        const rawDesc = stripTags(n.point_desc);
        const params = n.param_list || [];
        traces.push({
          id: String(n.point_id), name: stripTags(n.point_name), pointType: n.point_type, anchor: n.anchor,
          desc: fillDesc(rawDesc, params), rawDesc, params,
          effects: parseEffects(rawDesc, { keyPrefix: id + ':trace:' + n.point_id, defTrigger: 'passive', params, charName: cname }),
          hits: parseHits(rawDesc, { slot: 'talent', element, params }),
        });
      }
    }
  }
  const skills = [];
  for (const [sid, s, slot] of assignSlots(c.skills || {}, charTypeSlot)) {
    let cap = capBySkill[sid];
    if (!cap) {
      const prim = skills.find((x) => SECONDARY[x.slot] === slot || x.slot === slot);
      if (prim && levelsOf(s).length > 1) cap = prim.maxLevel;
    }
    skills.push(buildSkill(id, sid, s, slot, cap, element, notes, cname));
  }
  if (!skills.some((x) => x.energyGain > 0)) notes.push('所有技能 sp_base 为 0：energyMax(sp_need=' + c.sp_need + ') 可能不是能量上限（专属资源）');
  for (const need of ['basic', 'skill', 'ult', 'talent']) if (!skills.find((x) => x.slot === need)) notes.push('缺少 ' + need + ' 技能');
  const eidolons = [];
  for (const [rk, r] of Object.entries(c.ranks || {}).sort((a, b) => +a[0] - +b[0])) {
    const rawDesc = stripTags(r.desc);
    const params = r.param_list || [];
    eidolons.push({ rank: +rk, id: String(r.id), name: stripTags(r.name), desc: fillDesc(rawDesc, params), rawDesc, params,
      effects: parseEffects(rawDesc, { keyPrefix: id + ':e' + rk, defTrigger: 'passive', params, charName: cname }),
      hits: parseHits(rawDesc, { slot: 'talent', element, params }),
      skillLevelUp: parseSkillLevelUp(rawDesc) });
  }
  let memosprite = null;
  if (c.memosprite && c.memosprite.skills && Object.keys(c.memosprite.skills).length) {
    const ms = c.memosprite;
    const mskills = [];
    for (const [sid, s, slot] of assignSlots(ms.skills, memoTypeSlot)) {
      const sk = buildSkill(id, sid, s, slot === 'memoTalent' ? 'other' : slot, capBySkill[sid], element, notes, cname);
      if (slot === 'memoTalent') sk.levelKey = 'memoTalent';
      mskills.push(sk);
    }
    const refSkill = ms.hp_skill && c.skills[ms.hp_skill];
    const refCap = capBySkill[ms.hp_skill] || 10;
    const refP = refSkill ? (levelsOf(refSkill)[refCap - 1] || []) : [];
    const rv = (v) => {
      if (v == null) return null;
      if (typeof v === 'string' && v.startsWith('#')) return refP[+v.slice(1) - 1] ?? null;
      return +v;
    };
    memosprite = {
      name: ms.name, hpBase: rv(ms.hp_base), hpInherit: rv(ms.hp_inherit), spdBase: rv(ms.speed_base), spdInherit: rv(ms.speed_inherit),
      aggro: ms.aggro, statRefSkill: ms.hp_skill ? String(ms.hp_skill) : null,
      rawStats: { hp_base: ms.hp_base, hp_inherit: ms.hp_inherit, speed_base: ms.speed_base, speed_inherit: ms.speed_inherit },
      skills: mskills,
    };
  }
  if (c.enhanced && Object.keys(c.enhanced).length) notes.push('存在 enhanced（强化/改版）形态数据，未解析');
  if (c.unique && Object.keys(c.unique).length) notes.push('存在 unique 专属机制数据，未解析');
  const rel = c.relics || {};
  const mainStats = {};
  for (const p of rel.property_list || []) mainStats[RELIC_SLOT[p.relic_type] || p.relic_type] = mapProp(p.property_type, notes);
  const teams = [];
  for (const t of c.teams || []) teams.push([id, ...(t.member_list || []).map(String)]);
  const recommended = {
    lightcones: (c.lightcones || []).map(String),
    relic4: (rel.set4_id_list || []).map(String), relic2: (rel.set2_id_list || []).map(String),
    mainStats, mainStatOptions: {
      body: (rel.property_list3 || []).map((x) => mapProp(x)), feet: (rel.property_list4 || []).map((x) => mapProp(x)),
      sphere: (rel.property_list5 || []).map((x) => mapProp(x)), rope: (rel.property_list6 || []).map((x) => mapProp(x)) },
    subStats: (rel.sub_affix_property_list || []).map((x) => mapProp(x, notes)), teams,
  };
  return {
    id, name: stripTags(c.name), nameEn: (sup && sup.en) || null, rarity: +(/(\d)$/.exec(c.rarity || '') || [0, 0])[1], element, path: c.base_type,
    energyMax: c.sp_need, ultResource: skillsHaveEnergy(skills) ? 'energy' : 'custom', base: baseStats(c.stats['6']), traceStats, skills, traces, eidolons, memosprite, recommended,
    notes: [...new Set(notes)],
  };
}

// ---------------------------------------------------------------------------
// 光锥 / 遗器 / 敌人
function buildLightcone(id, l, sup) {
  const st = l.stats[l.stats.length - 1];
  const L = (st.max_level || 80) - 1;
  const rf = l.refinements || {};
  const params = [1, 2, 3, 4, 5].map((k) => (rf.level && rf.level[k] && rf.level[k].param_list) || []);
  const rawDesc = stripTags(rf.desc);
  return {
    id, name: stripTags(l.name), nameEn: (sup && sup.en) || null, path: l.base_type, rarity: +(/(\d)$/.exec(l.rarity || '') || [0, 0])[1],
    base: { hp: +(st.base_hp + st.base_hp_add * L).toFixed(4), atk: +(st.base_attack + st.base_attack_add * L).toFixed(4), def: +(st.base_defence + st.base_defence_add * L).toFixed(4) },
    passiveName: rf.name || null, desc: fillDesc(rawDesc, params[0]), rawDesc, params,
    effects: parseEffects(rawDesc, { keyPrefix: 'lc:' + id, defTrigger: 'passive', params: params[0] }),
  };
}
function buildRelicSet(id, r) {
  const part = (k) => {
    const p = r.set && r.set[k];
    if (!p) return null;
    const rawDesc = stripTags(p.zh);
    const params = p.ParamList || [];
    return { desc: fillDesc(rawDesc, params), rawDesc, params, effects: parseEffects(rawDesc, { keyPrefix: 'relic:' + id + ':set' + k, defTrigger: 'passive', params }) };
  };
  return { id, name: stripTags(r.zh), nameEn: r.en || null, kind: +id >= 300 ? 'planar' : 'cavern', set2: part('2'), set4: part('4') };
}
function buildMonsters(m, out, stat) {
  for (const ch of m.child || []) {
    const weak = (ch.stance_weak_list || []).slice();
    const res = {};
    const list = ch.damage_type_resistance || [];
    for (const e of ELEMENTS) res[e] = list.length ? 0 : (weak.includes(e) ? 0 : 0.2);
    for (const x of list) res[x.damage_type] = x.value;
    if (!list.length) stat.noResList++;
    const spd = m.speed_base * (ch.speed_modify_ratio ?? 1) + (ch.speed_modify_value || 0);
    out[String(ch.id)] = {
      id: String(ch.id), templateId: String(m.id), name: m.name, rank: m.rank, weak, res,
      toughness: +(m.stance_base * (ch.stance_modify_ratio ?? 1) + (ch.stance_modify_value || 0)).toFixed(4),
      hpBase: +(m.hp_base * (ch.hp_modify_ratio ?? 1)).toFixed(4),
      defBase: +(m.defence_base * (ch.defence_modify_ratio ?? 1)).toFixed(4),
      atkBase: +(m.attack_base * (ch.attack_modify_ratio ?? 1)).toFixed(4),
      spd: +spd.toFixed(4), effectRes: m.status_resistance_base ?? 0,
    };
  }
}

// ---------------------------------------------------------------------------
// 手工修正（通用规则无法可靠表达的少数机制；每条都会写入角色 notes）
const skillOf = (c, slot) => c.skills.find((s) => s.slot === slot);
export const PATCHES = {
  // 知更鸟：【协奏】无“持续N回合”（倒计时 90 速）→ 终结技增益与附加伤害按 2 回合近似
  1309: (c) => { const u = skillOf(c, 'ult'); if (!u) return; for (const e of u.effects) if (e.duration == null && !INSTANT_KEYS[e.stat]) { e.duration = 2; e.durationFrom = 'patch'; }
    return '知更鸟【协奏】持续按 2 回合近似（实际为 90 速倒计时）'; },
  // 停云：【赐福】攻击力提高 50%，最高不超过停云攻击力 25% → 近似为停云攻击力 × 25% 的固定攻击力（上限通常生效）
  1202: (c) => { const s = skillOf(c, 'skill'); if (!s) return; const e = s.effects.find((x) => x.stat === 'atkPct'); if (!e) return;
    Object.assign(e, { stat: 'atk', value: { param: 3 }, scaleStat: 'atk', confidence: 'low', lowReason: '按上限：停云攻击力×25%' });
    return '停云【赐福】攻击力按上限（停云攻击力 25%）近似'; },
  // 砂金：秘技三选一 → 取“大概率”的 36%，全队，持续 3 回合
  1304: (c) => { const t = skillOf(c, 'technique'); if (!t || t.effects.length < 2) return;
    t.effects = [Object.assign({}, t.effects[1], { target: 'team', duration: 3, key: t.effects[1].key })];
    return '砂金秘技取防御力提高 36%（大概率档）'; },
  // 藿藿：终结技攻击力/回能作用于除自身以外的队友
  1217: (c) => { const u = skillOf(c, 'ult'); if (!u) return; for (const e of u.effects) if (e.stat === 'atkPct' || e.stat === 'energyPct') e.target = 'allies'; },
  // 阮•梅：【弦外音】（战技）持续 3 回合
  1303: (c) => { const s = skillOf(c, 'skill'); if (!s) return; for (const e of s.effects) if (e.stat === 'dmgBonus' || e.stat === 'weaknessBreakEfficiency') e.duration = s.params[s.defaultLevel - 1][2] || 3; },
  // 卡芙卡：终结技只有“触电”一条 DoT（引爆比例在 specials 中）
  1005: (c) => { const u = skillOf(c, 'ult'); if (!u) return; const dots = u.hits.filter((h) => h.dmgType === 'dot');
    if (dots.length > 1) { const p = u.params[u.defaultLevel - 1]; const keep = dots.reduce((a, h) => (p[h.param] > p[a.param] ? h : a)); u.hits = u.hits.filter((h) => h.dmgType !== 'dot' || h === keep); } },
};
function applyPatches(DATA) {
  for (const [id, fn] of Object.entries(PATCHES)) {
    const c = DATA.characters[id];
    if (!c) continue;
    const note = fn(c);
    if (note) c.notes.push('数据修正：' + note);
  }
}

// ---------------------------------------------------------------------------
export function buildAll() {
  const sup = {
    character: readJSON(path.join(RAW, 'support/character.json')),
    lightcone: readJSON(path.join(RAW, 'support/lightcone.json')),
    relicset: readJSON(path.join(RAW, 'support/relicset.json')),
  };
  const DATA = { version: VERSION, generatedAt: new Date().toISOString(), characters: {}, lightcones: {}, relicSets: {}, monsters: {} };
  for (const f of listJSON(path.join(RAW, 'character'))) {
    const id = f.replace('.json', '');
    DATA.characters[id] = buildCharacter(id, readJSON(path.join(RAW, 'character', f)), sup.character[id]);
  }
  for (const f of listJSON(path.join(RAW, 'lightcone'))) {
    const id = f.replace('.json', '');
    DATA.lightcones[id] = buildLightcone(id, readJSON(path.join(RAW, 'lightcone', f)), sup.lightcone[id]);
  }
  for (const [id, r] of Object.entries(sup.relicset)) DATA.relicSets[id] = buildRelicSet(id, r);
  applyPatches(DATA);
  const mstat = { noResList: 0 };
  for (const f of listJSON(path.join(RAW, 'monster'))) buildMonsters(readJSON(path.join(RAW, 'monster', f)), DATA.monsters, mstat);
  return { DATA, mstat };
}

// ---------------------------------------------------------------------------
// 报告
function buildReport(DATA, mstat) {
  const L = [];
  L.push('# V2 数据解析报告（build_kits.mjs 自动生成）', '');
  L.push('版本 ' + DATA.version + '，生成于 ' + DATA.generatedAt, '');
  const chars = Object.values(DATA.characters);
  let tH = 0, tHL = 0, tE = 0, tEL = 0;
  const rows = [], unparsed = [];
  for (const c of chars) {
    const allSkills = [...c.skills, ...((c.memosprite && c.memosprite.skills) || [])];
    const effs = [...allSkills.flatMap((s) => s.effects), ...c.traces.flatMap((t) => t.effects), ...c.eidolons.flatMap((e) => e.effects)];
    const hits = allSkills.flatMap((s) => s.hits);
    const hl = hits.filter((h) => h.confidence === 'low').length, el = effs.filter((e) => e.confidence === 'low').length;
    tH += hits.length; tHL += hl; tE += effs.length; tEL += el;
    rows.push('| ' + [c.id, c.name, c.element, c.path, hits.length, hl, effs.length, el, c.notes.length].join(' | ') + ' |');
    for (const s of allSkills) {
      if (!s.hits.length && s.slot !== 'technique' && (/(造成|受到)[^，。]{0,25}#\d+\[\w+\]%[^，。提降]{0,16}伤害/.test(s.rawDesc) || /Attack|Blast|Bounce/.test(s.tag || ''))) {
        unparsed.push('- ' + c.id + ' ' + c.name + ' [' + s.slot + '] ' + s.id + '「' + s.name + '」：' + s.rawDesc.replace(/\n/g, ' ').slice(0, 90));
      }
    }
  }
  const lcs = Object.values(DATA.lightcones), rss = Object.values(DATA.relicSets);
  const lcE = lcs.flatMap((l) => l.effects), rsE = rss.flatMap((r) => [...(r.set2 ? r.set2.effects : []), ...(r.set4 ? r.set4.effects : [])]);
  const lowN = (a) => a.filter((e) => e.confidence === 'low').length;
  L.push('## 汇总', '');
  L.push('- 角色 ' + chars.length + '，光锥 ' + lcs.length + '，遗器套装 ' + rss.length + '，敌人（child）' + Object.keys(DATA.monsters).length + '（其中 ' + mstat.noResList + ' 个无抗性列表 → 弱点 0 / 其余 0.2）');
  L.push('- 角色 hits ' + tH + '（low ' + tHL + '），角色 effects ' + tE + '（low ' + tEL + '）');
  L.push('- 光锥 effects ' + lcE.length + '（low ' + lowN(lcE) + '，无任何 effect 的光锥 ' + lcs.filter((l) => !l.effects.length).length + '）');
  L.push('- 遗器 effects ' + rsE.length + '（low ' + lowN(rsE) + '，2 件套无 effect 的套装 ' + rss.filter((r) => !(r.set2 && r.set2.effects.length)).length + '）');
  L.push('', '## 每角色', '', '| id | 名称 | 属性 | 命途 | hits | hits low | effects | effects low | notes |', '|---|---|---|---|---|---|---|---|---|', ...rows);
  L.push('', '## 未解析出 hits 的伤害类技能（描述含“造成/受到…伤害”但无 hit，多为无倍率的描述性文本）', '', ...(unparsed.length ? unparsed : ['（无）']));
  const noteRows = chars.filter((c) => c.notes.length).map((c) => '- ' + c.id + ' ' + c.name + '：' + c.notes.join('；'));
  L.push('', '## 角色告警 notes', '', ...(noteRows.length ? noteRows : ['（无）']));
  L.push('', '## 解析规则与约定', '',
    '- 基础属性：stats["6"] base + add×79（80 级）；光锥取最后一个突破阶段 base + add×(max_level−1)。',
    '- 技能槽：Normal→basic、BPSkill→skill、Ultra→ult、type=null 且 type_name=天赋→talent、Maze→technique、ElationDamage→elation、Servant→memo（忆灵技）、忆灵天赋/固有行迹/助战技→other；MazeNormal（大世界攻击）丢弃。同类型多个技能按 id 排序，首个为主槽，其余普攻→enhancedBasic、战技→enhancedSkill、其它→other。',
    '- defaultLevel = maxLevel = 行迹 point_type 2/4 中 level_up_skill_id 指向该技能的 max_level；强化技能沿用同类主技能；不含星魂 +2。',
    '- 韧性：show_stance_list = [主目标, 全体, 相邻]（站点单位，普攻 30）；敌人 toughness = stance_base × stance_modify_ratio。',
    '- 敌人抗性：damage_type_resistance 只列非零项，缺项 = 0；抗性列表整体为空时按弱点 0、其余 0.2 补齐。',
    '- Hit：中文 desc 正则，“造成/受到 … #N%(攻击力|生命上限|防御力) 的 X 属性(欢愉|持续|附加|真实|击破)伤害”。复合倍率“（#a*欢愉度+#b%）攻击力”记 param=b、extra={stat,param:a}，confidence=low。DoT 带 duration/durationParam/dotKind。附加伤害带 additional:true。',
    '- Effect：分句正则；value {param:i} 引用所属对象 params（技能为当前等级行、光锥为叠影行、行迹/星魂/遗器为扁平数组）；句中含条件词时 condition=原句；“每…”按层缩放的效果标 low。',
    '- Effect 条件/触发取效果前文，duration/maxStacks 取效果后文（截止到下一个带条件分句），无则回看前文最近的“持续N回合”。',
    '- 转化类（“提高数值等同于X的#N%”）：value=比例，scaleStat=来源属性，flatAdd/cap 为附加固定值/上限；来源为攻击/生命/防御/速度时 stat 为固定值键（atk/hp/def/spd），否则为百分比键（atkPct…）。一律 low。',
    '- 契约外新增 stat 键：energyPct（按能量上限比例回能）、amplification（增笑，appliesTo=elation）、dmgBonus_break / dmgBonus_superBreak（low）、resShred_<Element>、weaknessBreakEfficiency。',
    '- 技能 specials：dotDetonate（引爆 DoT，param=原伤害比例）、percentOfDamage（按本次伤害比例的真实伤害/欢愉负债）、hpLostScaling（按已损失生命值），未进入 hits。',
    '- 角色 ultResource：所有技能 sp_base=0 时为 custom（energyMax 是专属资源而非能量），否则 energy。',
    '- 已知未解析：enhanced/unique 字段；“伤害倍率提高”“最多提高”“基础概率提高”“护盾量提高”“受到的伤害降低”等非输出乘区描述；desc 为空的子技能（如黄泉 130814–17、银狼LV.999 150610/12/18）。',
    '');
  return L.join('\n');
}

// ---------------------------------------------------------------------------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const t0 = Date.now();
  const { DATA, mstat } = buildAll();
  applyNameFixes(DATA);   // 名称/文本修正（scripts/v2/names.mjs）
  const json = JSON.stringify(DATA);
  fs.mkdirSync(path.join(ROOT, 'data/v2'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'data/v2/kits.json'), json);
  fs.writeFileSync(path.join(ROOT, 'engine2/data.gen.js'),
    '// 由 scripts/v2/build_kits.mjs 自动生成，请勿手改。数据来源 hsr.nanoka.cc ' + VERSION + '\nexport const DATA = ' + json + ';\n');
  fs.writeFileSync(path.join(ROOT, 'data/v2/PARSE_REPORT.md'), buildReport(DATA, mstat));
  console.log('characters=' + Object.keys(DATA.characters).length + ' lightcones=' + Object.keys(DATA.lightcones).length +
    ' relicSets=' + Object.keys(DATA.relicSets).length + ' monsters=' + Object.keys(DATA.monsters).length +
    ' size=' + (json.length / 1e6).toFixed(2) + 'MB (' + (Date.now() - t0) + 'ms)');
}
