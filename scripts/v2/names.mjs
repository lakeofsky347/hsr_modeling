// 名称与展示文本修正：在 build_kits 生成 DATA 之后原地修改（只改 name / nameEn / desc / simpleDesc / notes 等展示字段，不改数值与 key）
//
// 规则：
//  1. 角色名：{NICKNAME}（开拓者）→「开拓者（命途·穹/星）」（奇数 id = 穹，偶数 id = 星）；
//     同名角色（如两位三月七）追加命途以区分；去掉 <unbreak> 等残留标签与 RUBY 注音。
//  2. 所有 name / nameEn / desc / simpleDesc / rawDesc / raw / condition / typeName / passiveName 去掉残留标签（{RUBY_B#..}、<unbreak> 等）、
//     {NICKNAME} → 开拓者、{F#女}{M#男} 性别分支 → 「女/男」，字面量 \n → 换行。
//  3. simpleDesc（简述）按默认等级代入 #N[i] 占位符（desc 已由 build_kits 代入）。
//  4. 解析备注 notes 中的英文内部字段改为中文说明。

export const PATH_ZH = { Warrior: '毁灭', Rogue: '巡猎', Mage: '智识', Shaman: '同谐', Warlock: '虚无', Knight: '存护', Priest: '丰饶', Memory: '记忆', Elation: '欢愉' };
export const PATH_EN = { Warrior: 'Destruction', Rogue: 'The Hunt', Mage: 'Erudition', Shaman: 'Harmony', Warlock: 'Nihility', Knight: 'Preservation', Priest: 'Abundance', Memory: 'Remembrance', Elation: 'Elation' };

// 模板残留：去标签、代换昵称/性别分支
export function cleanText(s) {
  if (s == null || typeof s !== 'string') return s;
  return s
    .replace(/\\n/g, '\n')
    .replace(/\{RUBY_B#[^}]*\}/g, '').replace(/\{RUBY_E#\}/g, '')
    .replace(/\{NICKNAME\}/g, '开拓者')
    .replace(/\{F#([^}]*)\}\{M#([^}]*)\}/g, '$1/$2').replace(/\{M#([^}]*)\}\{F#([^}]*)\}/g, '$2/$1')
    .replace(/\{[FM]#([^}]*)\}/g, '$1')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '');
}
export function cleanTextEn(s) {
  if (s == null || typeof s !== 'string') return s;
  return cleanText(s.replace(/\{NICKNAME\}/g, 'Trailblazer'));
}

// 与 build_kits.fillDesc 同规则：#N[i] 取整，#N[fK] 保留 K 位小数，带 % 的乘 100
function fmtNum(v, fmt, pct) {
  const x = pct ? v * 100 : v;
  const m = /^f(\d)$/.exec(fmt);
  if (m) return x.toFixed(+m[1]);
  return String(Math.round(x * 1e6) / 1e6 % 1 === 0 ? Math.round(x) : Math.floor(x + 1e-6));
}
export function fillPlaceholders(raw, params) {
  if (!raw) return raw;
  return String(raw).replace(/#(\d+)\[(\w+)\](%?)/g, (m0, n, fmt, pct) => {
    const v = params ? params[+n - 1] : undefined;
    if (typeof v !== 'number' || Number.isNaN(v)) return m0;
    return fmtNum(v, fmt, !!pct) + (pct ? '%' : '');
  });
}

const TEXT_KEYS = new Set(['name', 'nameEn', 'desc', 'simpleDesc', 'rawDesc', 'raw', 'condition', 'typeName', 'passiveName']);
function deepClean(o) {
  if (Array.isArray(o)) { o.forEach(deepClean); return; }
  if (!o || typeof o !== 'object') return;
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (typeof v === 'string') { if (TEXT_KEYS.has(k)) o[k] = k === 'nameEn' ? cleanTextEn(v) : cleanText(v); }
    else if (v && typeof v === 'object') deepClean(v);
  }
}

function defaultParams(s) {
  const p = (s.params && s.params[(s.defaultLevel || 1) - 1]) || (s.params && s.params[s.params.length - 1]) || [];
  return Array.isArray(p) ? p : s.params;
}
// siblings：同一角色的全部技能（变体技能常沿用主技能的简述，参数需取同名主技能）
function fixSkillSimple(s, siblings) {
  if (!s || !s.simpleDesc || !/#\d+\[/.test(s.simpleDesc)) return;
  let t = fillPlaceholders(s.simpleDesc, defaultParams(s));
  for (const o of siblings || []) {
    if (!/#\d+\[/.test(t)) break;
    if (o !== s && o.name === s.name) t = fillPlaceholders(t, defaultParams(o));
  }
  s.simpleDesc = t;
}

const NOTE_FIXES = [
  [/^存在 enhanced（强化\/改版）形态数据，未解析$/, '存在强化/改版形态数据，未解析'],
  [/^存在 unique 专属机制数据，未解析$/, '存在专属机制数据，未解析'],
  [/^所有技能 sp_base 为 0：energyMax\(sp_need=([^)]*)\) 可能不是能量上限（专属资源）$/, (m, n) => '所有技能施放均不回复能量：终结技可能使用专属资源（' + (n === 'null' ? '数据未给出上限' : '数据上限 ' + n + ' 可能不是能量') + '）'],
  [/^技能 (\d+)「(.*)」desc 为空$/, '技能 $1「$2」描述为空（仅有参数，无法解析伤害）'],
  [/^缺少 (basic|skill|ult|talent) 技能$/, (m, k) => '缺少' + ({ basic: '普攻', skill: '战技', ult: '终结技', talent: '天赋' })[k] + '数据'],
  [/^未知属性类型 (\S+)（原样保留）$/, '未识别的属性类型 $1（原样保留）'],
];
export function fixNote(n) {
  if (typeof n !== 'string') return n;
  let s = cleanText(n);
  for (const [re, rep] of NOTE_FIXES) if (re.test(s)) { s = s.replace(re, rep); break; }
  return s;
}

export function applyNameFixes(DATA) {
  if (!DATA) return DATA;
  const chars = DATA.characters || {};
  // 1. 通用清理（标签 / 昵称 / 性别分支 / 字面量 \n）
  for (const group of ['characters', 'lightcones', 'relicSets', 'monsters']) deepClean(Object.values(DATA[group] || {}));
  // 2. 开拓者：按命途 + 性别区分
  for (const c of Object.values(chars)) {
    if (/^80\d\d$/.test(String(c.id)) && /^(开拓者|\{NICKNAME\})$/.test(c.name)) {
      const male = Number(c.id) % 2 === 1;
      c.name = '开拓者（' + (PATH_ZH[c.path] || c.path) + '·' + (male ? '穹' : '星') + '）';
      c.nameEn = 'Trailblazer (' + (PATH_EN[c.path] || c.path) + ' · ' + (male ? 'Caelus' : 'Stelle') + ')';
    }
  }
  // 3. 其余同名角色（两位三月七）：追加命途
  const byName = {};
  for (const c of Object.values(chars)) (byName[c.name] = byName[c.name] || []).push(c);
  for (const list of Object.values(byName)) {
    if (list.length < 2) continue;
    for (const c of list) {
      c.name = c.name + '（' + (PATH_ZH[c.path] || c.path) + '）';
      if (c.nameEn) c.nameEn = c.nameEn + ' (' + (PATH_EN[c.path] || c.path) + ')';
    }
  }
  // 4. 引用其他技能描述的模板 #{series_ref_skill_desc:...,技能id,等级}（如星神★阿哈 E2）→ 代入被引用技能在该等级的描述
  for (const c of Object.values(chars)) {
    const all = (c.skills || []).concat(c.memosprite ? c.memosprite.skills || [] : []);
    const sub = (t) => typeof t === 'string' ? t.replace(/#\{series_ref_skill_desc:[^,}]*,(\d+),(\d+)\}/g, (m0, sid, lv) => {
      const sk = all.find((x) => String(x.id) === sid);
      if (!sk) return '';
      const p = (sk.params || [])[Math.min(+lv, (sk.params || []).length) - 1];
      return fillPlaceholders(sk.rawDesc || sk.desc || '', Array.isArray(p) ? p : sk.params);
    }).replace(/\n+$/, '') : t;
    for (const o of all.concat(c.traces || [], c.eidolons || [])) { o.desc = sub(o.desc); o.rawDesc = sub(o.rawDesc); }
  }
  // 5. 简述占位符、解析备注
  for (const c of Object.values(chars)) {
    const all = (c.skills || []).concat(c.memosprite ? c.memosprite.skills || [] : []);
    all.forEach((s) => fixSkillSimple(s, all));
    if (Array.isArray(c.notes)) c.notes = c.notes.map(fixNote);
  }
  return DATA;
}
