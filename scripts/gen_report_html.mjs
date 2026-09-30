#!/usr/bin/env node
// ============================================================================
// 生成《中等练度输出预估》HTML 报告（单文件，零依赖，双击可看）
//   输入：presets/medium.json（中等练度配置）+ docs/build-research.md（配装调研结论）
//   输出：reports/中等练度输出预估.html
// 用法：node scripts/gen_report_html.mjs
// ============================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { simulate, defaultConfig, normalizeConfig, characterInfo, ENGINE_VERSION } from '../engine/sim.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PRESET = join(ROOT, 'presets', 'medium.json');
const RESEARCH = join(ROOT, 'docs', 'build-research.md');
const OUT = join(ROOT, 'reports', '中等练度输出预估.html');

const fmt = (n) => Math.round(n).toLocaleString('en-US');
// 把 #1[i]% / #2[f1]% / #3[i] 等占位符按参数表代入
function resolveDesc(desc, params) {
  if (!desc || !params) return desc || '';
  return desc.replace(/#(\d+)\[([a-z0-9]+)\](%?)/g, (m, n, kind, pct) => {
    const v = params[Number(n) - 1];
    if (typeof v !== 'number') return m;
    let out;
    if (pct) out = String(Math.round(v * 1000) / 10);
    else if (kind === 'f1' || kind === 'f2') out = String(Math.round(v * 100) / 100);
    else out = String(Number.isInteger(v) ? v : Math.round(v * 100) / 100);
    return out + pct;
  });
}
const pct = (v, d) => (v * 100).toFixed(d === undefined ? 1 : d) + '%';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// 场景：从裸装到中等练度
function scenarios(baseCfg) {
  const make = (fn) => {
    const c = JSON.parse(JSON.stringify(baseCfg));
    fn(c);
    return c;
  };
  return [
    { key: 'bare', title: '裸装（无光锥 / 无遗器）', note: '只有角色本体 + 行迹（同为 2 魂）',
      cfg: make((c) => { for (const id in c.characters) { c.characters[id].lightcone.enabled = false; c.characters[id].relics.enabled = false; } }) },
    { key: 'lc', title: '仅专属光锥（叠影 1）', note: '专属 5★ 光锥，无遗器',
      cfg: make((c) => { for (const id in c.characters) c.characters[id].relics.enabled = false; }) },
    { key: 'main', title: '光锥 + 遗器主词条', note: '不算副词条（0 有效词条）',
      cfg: make((c) => { for (const id in c.characters) c.characters[id].relics.substatRolls = 0; }) },
    { key: 'rolls20', title: '中等偏下（20 有效词条）', note: '同一套装配，副词条只到 20 条',
      cfg: make((c) => { for (const id in c.characters) c.characters[id].relics.substatRolls = 20; }) },
    { key: 'medium', title: '★ 中等练度（本报告结论）', note: '2 魂 + 专属光锥 S1 + 推荐套装 + 主词条 + 28 条有效副词条',
      cfg: baseCfg },
    { key: 'high', title: '高等练度（毕业向）', note: '32 有效词条 + 光锥叠影 5',
      cfg: make((c) => { for (const id in c.characters) { c.characters[id].relics.substatRolls = 32; c.characters[id].lightcone.superimpose = 5; } }) },
    { key: 'e6', title: '满星魂（参考上限）', note: '全员 6 魂 + 中等练度',
      cfg: make((c) => { for (const id in c.characters) c.characters[id].eidolon = 6; }) }
  ].map((s) => {
    const r = simulate(s.cfg);
    return Object.assign({}, s, { result: r });
  });
}

function mdToHtml(md) {
  const lines = md.split('\n');
  let html = '', inList = false;
  const inline = (t) => esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\[(.+?)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  for (const line of lines) {
    const t = line.trim();
    if (!t) { if (inList) { html += '</ul>'; inList = false; } continue; }
    if (/^#{1,4}\s/.test(t)) {
      if (inList) { html += '</ul>'; inList = false; }
      const lv = t.match(/^#+/)[0].length;
      html += '<h' + (lv + 2) + '>' + inline(t.replace(/^#+\s*/, '')) + '</h' + (lv + 2) + '>';
    } else if (/^[-*]\s/.test(t)) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += '<li>' + inline(t.replace(/^[-*]\s*/, '')) + '</li>';
    } else if (/^\|/.test(t)) {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<div class="mdrow">' + inline(t.replace(/^\||\|$/g, '').split('|').join(' · ')) + '</div>';
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<p>' + inline(t) + '</p>';
    }
  }
  if (inList) html += '</ul>';
  return html;
}

const baseCfg = normalizeConfig(JSON.parse(readFileSync(PRESET, 'utf8')));
const runs = scenarios(baseCfg);
const medium = runs.find((r) => r.key === 'medium').result;
const bare = runs.find((r) => r.key === 'bare').result;

const chars = ['1506', '1501', '1503', '1511'].map((id) => {
  const info = characterInfo(id, baseCfg);
  const cc = baseCfg.characters[id];
  const rl = info.relics.current;
  const lcOpt = info.lightcone.options.find((o) => o.id === info.lightcone.current) || {};
  return { info, cc, rl, lc: lcOpt,
           dmg: medium.summary.byCharacter.find((c) => c.id === id) };
});

const research = existsSync(RESEARCH) ? readFileSync(RESEARCH, 'utf8') : '_（未找到 docs/build-research.md）_';

const timelineRows = medium.timeline.map((e) => '<tr><td class="num">' + e.av + '</td><td>' + esc(e.actor) +
  '</td><td>' + esc(e.action) + '</td><td class="num">' + fmt(e.damage) + '</td><td class="note">' + esc(e.note || '') + '</td></tr>').join('\n');

const scenRows = runs.map((s) => {
  const d = s.result.summary;
  const delta = bare.summary.totalDamage ? (d.totalDamage / bare.summary.totalDamage) : 1;
  return '<tr class="' + (s.key === 'medium' ? 'hl' : '') + '"><td>' + esc(s.title) + '</td><td class="num">' + fmt(d.totalDamage) +
    '</td><td class="num">' + fmt(d.damagePerCycle) + '</td><td class="num">×' + delta.toFixed(2) +
    '</td><td class="muted">' + esc(s.note) + '</td></tr>';
}).join('\n');

const charCards = chars.map((c) => {
  const i = c.info;
  return '<div class="card">' +
    '<h3>' + esc(i.name) + ' <span class="tag">' + esc(i.elementZh) + ' / 欢愉</span>' +
    ' <span class="tag">' + i.eidolon + ' 魂</span>' +
    ' <span class="tag">' + esc(c.lc.name || '无光锥') + ' S' + (c.lc.superimpose || 0) + '</span></h3>' +
    '<div class="grid">' +
      '<div><div class="k">攻击力</div><div class="v">' + fmt(i.panelStats.atk) + '</div></div>' +
      '<div><div class="k">生命值</div><div class="v">' + fmt(i.panelStats.hp) + '</div></div>' +
      '<div><div class="k">防御力</div><div class="v">' + fmt(i.panelStats.def) + '</div></div>' +
      '<div><div class="k">速度</div><div class="v">' + i.panelStats.spd + '</div></div>' +
      '<div><div class="k">暴击率</div><div class="v">' + pct(i.panelStats.critRate) + '</div></div>' +
      '<div><div class="k">暴击伤害</div><div class="v">' + pct(i.panelStats.critDmg) + '</div></div>' +
      '<div><div class="k">欢愉度</div><div class="v">' + pct(i.panelStats.elationDegree) + '</div></div>' +
      '<div><div class="k">技能等级</div><div class="v">' + i.skillLevels.filter((s) => s.slot !== 'innate' && s.slot !== 'maze')
        .map((s) => s.label + s.level).join(' / ') + '</div></div>' +
    '</div>' +
    '<div class="sub"><b>遗器</b>：' + (c.rl ? esc(c.rl.set4Name) + '（4 件套）+ ' + esc(c.rl.set2Name) + '（2 件套）· 副词条 ' + c.rl.substatRolls + ' 有效词条' : '未装备') + '</div>' +
    '<div class="sub"><b>主词条</b>：' + (c.rl ? c.rl.mainStats.map((m) => m.slot + ' ' + m.prop).join(' · ') : '-') + '</div>' +
    '<div class="sub"><b>光锥被动</b>：' + esc(c.lc.passive || '-') + '（S' + (c.lc.superimpose || 0) + '）—— ' +
      esc(resolveDesc(c.lc.desc, c.lc.params).slice(0, 140)) + ((c.lc.desc || '').length > 140 ? '…' : '') + '</div>' +
    '<div class="sub"><b>本场输出</b>：' + fmt(c.dmg.damage) + '（占比 ' + pct(c.dmg.share) + '）</div>' +
  '</div>';
}).join('\n');

const typeRows = medium.summary.byType.map((t) => '<tr><td>' + esc(t.label) + '</td><td class="num">' + fmt(t.damage) +
  '</td><td class="num">' + pct(medium.summary.totalDamage ? t.damage / medium.summary.totalDamage : 0) + '</td></tr>').join('\n');

const barRows = medium.summary.byCharacter.map((c) => '<div class="barrow"><span class="bl">' + esc(c.name) +
  '</span><span class="bar" style="width:' + (c.share * 100).toFixed(1) + '%"></span><span class="bv">' + fmt(c.damage) +
  '（' + pct(c.share) + '）</span></div>').join('\n');

const html = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">' +
'<meta name="viewport" content="width=device-width,initial-scale=1">' +
'<title>欢愉四人队 · 中等练度输出预估</title><style>' +
'*{box-sizing:border-box}body{margin:0;background:#0b1220;color:#dbe3ef;font:14px/1.7 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif}' +
'.wrap{max-width:1180px;margin:0 auto;padding:28px 22px 60px}' +
'h1{font-size:26px;margin:0 0 6px}h2{font-size:19px;margin:34px 0 12px;padding-left:10px;border-left:3px solid #2fe0c8}' +
'h3{font-size:15px;margin:0 0 10px}.muted{color:#7f8fa8}.sub{color:#9fb0c9;font-size:12.5px;margin-top:6px}' +
'.meta{color:#7f8fa8;font-size:12.5px;margin-bottom:18px}' +
'kbd{background:#16213a;border:1px solid #26375a;border-radius:4px;padding:1px 5px;font-size:12px}' +
'.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:18px 0}' +
'.kpi{background:linear-gradient(180deg,#131e33,#0f1829);border:1px solid #22304c;border-radius:12px;padding:14px}' +
'.kpi .k{color:#7f8fa8;font-size:12px}.kpi .v{font-size:22px;font-weight:700;color:#2fe0c8;margin-top:4px}' +
'.kpi.v2 .v{color:#9b8cff}.kpi.v3 .v{color:#ffd479}.kpi.v4 .v{color:#ff8fa3}' +
'.card{background:#101a2c;border:1px solid #22304c;border-radius:12px;padding:16px;margin:12px 0}' +
'.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:10px;margin:8px 0 10px}' +
'.grid .k{color:#7f8fa8;font-size:11.5px}.grid .v{font-size:15px;font-weight:600}' +
'.tag{display:inline-block;background:#16213a;border:1px solid #26375a;border-radius:999px;padding:1px 9px;font-size:11.5px;color:#9fb0c9;font-weight:400}' +
'table{width:100%;border-collapse:collapse;margin:10px 0;font-size:13px}' +
'th,td{border-bottom:1px solid #1d2942;padding:7px 9px;text-align:left}th{color:#7f8fa8;font-weight:600;background:#0f1829}' +
'td.num{text-align:right;font-variant-numeric:tabular-nums}td.note{color:#8ea0bb;font-size:12px}' +
'tr.hl{background:#11283a}tr.hl td{color:#7ff0dd;font-weight:600}' +
'.barrow{display:flex;align-items:center;gap:10px;margin:6px 0}.bl{width:104px;color:#9fb0c9;font-size:12.5px}' +
'.bar{height:12px;border-radius:6px;background:linear-gradient(90deg,#2fe0c8,#4f8cff);min-width:2px}' +
'.bv{color:#dbe3ef;font-size:12.5px}' +
'.note-box{background:#11283a;border:1px solid #1d4a5a;border-radius:10px;padding:12px 14px;margin:12px 0;color:#a9d8e6;font-size:13px}' +
'.warn-box{background:#2a2312;border:1px solid #4a3c12;border-radius:10px;padding:12px 14px;margin:12px 0;color:#ffdf9a;font-size:13px}' +
'a{color:#63b3ff}.mdrow{color:#9fb0c9;font-size:12.5px;padding:2px 0}' +
'@media(max-width:720px){.grid{grid-template-columns:repeat(2,1fr)}.bl{width:76px}}' +
'</style></head><body><div class="wrap">' +
'<h1>欢愉四人队 · 中等练度输出预估</h1>' +
'<div class="meta">队伍：银狼LV.999 + 火花 + 真珠 + 星神★阿哈 ｜ 数据版本 hsr.nanoka.cc 4.6.51 ｜ 引擎 v' + ENGINE_VERSION +
' ｜ 模拟 3 轮（350 行动值）/ 80 级有弱点 BOSS ｜ 生成于 ' + new Date().toISOString().slice(0, 10) + '</div>' +

'<div class="kpis">' +
'<div class="kpi"><div class="k">中等练度总伤害（3 轮）</div><div class="v">' + fmt(medium.summary.totalDamage) + '</div></div>' +
'<div class="kpi v2"><div class="k">每轮伤害</div><div class="v">' + fmt(medium.summary.damagePerCycle) + '</div></div>' +
'<div class="kpi v3"><div class="k">每 100 行动值</div><div class="v">' + fmt(medium.summary.dps) + '</div></div>' +
'<div class="kpi v4"><div class="k">相对裸装</div><div class="v">×' + (medium.summary.totalDamage / bare.summary.totalDamage).toFixed(2) + '</div></div>' +
'</div>' +

'<div class="note-box">口径：<b>全员 2 星魂 + 专属光锥叠影 1 + 站点推荐遗器套装 + 主词条齐全 + 28 条有效副词条</b>；' +
'技能等级取行迹上限（战技/终结技/天赋/欢愉技 10 级、普攻 6 级），欢愉技按 10 级；敌人为 80 级单目标、有弱点（抗性 0%）、未击破（韧性减伤 10%）。' +
'盲盒按游戏内概率衰减的期望值结算，互动陷阱礼物按 50/50 期望结算。</div>' +

'<h2>一、结论速览</h2>' +
'<div class="card"><h3>角色输出占比</h3>' + barRows + '</div>' +
'<table><thead><tr><th>伤害类型</th><th class="num">伤害</th><th class="num">占比</th></tr></thead><tbody>' + typeRows + '</tbody></table>' +

'<h2>二、中等练度配置（逐角色）</h2>' + charCards +

'<h2>三、星神★阿哈的中等练度推断</h2>' +
'<div class="card"><div class="sub">阿哈站点数据未标实装日期、也没有推荐配队，属尚未登场角色。其"中等练度"按同队同口径类推：' +
'<b>2 魂 + 专属光锥「当第一声『阿哈』响起」叠影 1 + 站点推荐套装（戏梦点星的伶人 4 件 + 神的瞬息欢愉 2 件）+ 主词条齐全 + 28 条有效副词条</b>；' +
'面板速度之所以偏高，是因为他的脚部主词条推荐速度、且专属光锥提供基础速度 +12。' +
'待实装后请以实际词条与配队替换本预设（界面上可直接调）。</div></div>' +

'<h2>四、场景对比（同一队伍，逐层加码）</h2>' +
'<table><thead><tr><th>场景</th><th class="num">总伤害</th><th class="num">每轮</th><th class="num">相对裸装</th><th>说明</th></tr></thead><tbody>' + scenRows + '</tbody></table>' +

'<h2>五、行动轴（中等练度，前 24 条）</h2>' +
'<table><thead><tr><th class="num">AV</th><th>角色</th><th>行动</th><th class="num">伤害</th><th>说明</th></tr></thead><tbody>' + timelineRows + '</tbody></table>' +

'<h2>六、配装调研与口径来源</h2>' + mdToHtml(research) +

'<h2>七、建模口径与已知限制</h2>' +
'<div class="warn-box">' + medium.assumptions.map((a) => '· ' + esc(a)).join('<br>') + '</div>' +

'</div></body></html>';

writeFileSync(OUT, html);
console.log('已生成 ' + OUT + '（' + html.length + ' 字符）');
console.log('中等练度总伤害 ' + fmt(medium.summary.totalDamage) + '，裸装 ' + fmt(bare.summary.totalDamage));
