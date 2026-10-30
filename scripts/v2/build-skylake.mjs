#!/usr/bin/env node
// ============================================================================
// 星铁 v3.5（dist3-skylake）页面打包。
// 引擎来自 engine2/（scripts/v2/build.mjs），数据外置为 data/hsr.json（内容同 data/v2/kits.json）。
// 页面以 ui2/app.html 为底，套上从 v3.5 发布包收回的流水线片段（site/recovered/）：
//   sim bridge、分块加载器、低置信/头像/预设注入、__simApply。
// 这些片段在发布侧属于仓库外的 pipeline/（build_pages.py、sim_bridge.js、sim_chunks.js），
// 本仓库没有那套多游戏流水线，所以按发布包里的原文收录，构建时再拼回去。
// 产物：dist/skylake/hsr/（与 sim-hsr-20261013.zip 里的 hsr/ 对应）+ README-hsr.md
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from './build.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SITE = join(ROOT, 'site');
const OUT = join(ROOT, 'dist', 'skylake');
const HSR = join(OUT, 'hsr');

const DATA_STUB = `// 由 scripts/v2/build_kits.mjs 自动生成，请勿手改。数据来源 hsr.nanoka.cc 4.6.51
export const DATA = (typeof globalThis !== 'undefined' ? globalThis : self).__SIM_DATA__;
`;

const ENGINE_VERSION = 'hsr-calc-3.4.1';

function sha12(buf) {
  return createHash('sha256').update(buf).digest('hex').slice(0, 12);
}

function once(src, old, neu, label) {
  const i = src.indexOf(old);
  if (i < 0) throw new Error('页面替换找不到：' + label);
  if (src.indexOf(old, i + old.length) >= 0) throw new Error('页面替换不唯一：' + label);
  return src.slice(0, i) + neu + src.slice(i + old.length);
}

function transformApp(src) {
  const prelude = readFileSync(join(SITE, 'recovered', 'app-prelude.js'), 'utf8');
  const footer = readFileSync(join(SITE, 'recovered', 'app-footer.js'), 'utf8');
  src = once(src, 'var E = window.HSR2;\n', 'var E = window.HSR2;\n' + prelude, 'prelude');
  const pairs = [
    ["function elDot(e) { return h('span', { class: 'dot', style: 'background:' + elColor(e), title: EL_ZH[e] || e }); }",
      "function elDot(e) { return h('span', { class: 'dot', 'data-el': e || null, style: 'background:' + elColor(e), title: EL_ZH[e] || e }); }"],
    ["    add(body, h('div', { class: 'ks' }, h('div', { class: 't' }, h('span', { class: 'tag acc' }, s.typeName || SLOT_ZH[s.slot] || s.slot), s.name, h('span', { class: 'mini dim' }, '#' + s.id)),\n      h('div', { class: 'd' }, s.desc || (s.simpleDesc ? '（简述）' + s.simpleDesc : ''))));",
      "    add(body, h('div', Object.assign({ class: 'ks' }, __lowAttrs(__lowList(s))), h('div', { class: 't' }, h('span', { class: 'tag acc' }, s.typeName || SLOT_ZH[s.slot] || s.slot), s.name, h('span', { class: 'mini dim' }, '#' + s.id)),\n      h('div', { class: 'd' }, s.desc || (s.simpleDesc ? '（简述）' + s.simpleDesc : ''))));"],
    ["    var code = src + '\\n;self.onmessage",
      "    var code = 'self.__SIM_DATA__ = ' + (window.__SIM_DATA_TEXT__ || 'null') + ';\\n' + src + '\\n;self.onmessage"],
    ["  if (!cfg.team.length) { applyResult(null, 0, '队伍为空：请至少选择一名角色'); return; }",
      "  if (!cfg.team.length) { __simCur = { rid: __SIM.begin(), cfg: __SIM.clone(cfg) }; applyResult(null, 0, '队伍为空：请至少选择一名角色'); return; }"],
    ["  S.running = true; S.dirty = false; runStart = Date.now(); renderStatus();\n  reqId++;",
      "  S.running = true; S.dirty = false; runStart = Date.now(); renderStatus();\n  __simCur = { rid: __SIM.begin(), cfg: __SIM.clone(cfg) };\n  reqId++;"],
    ["  S.running = false; S.error = '已取消'; renderStatus();\n}",
      "  S.running = false; S.error = '已取消'; renderStatus();\n  if (__simCur) { var __c0 = __simCur; __simCur = null; __SIM.fail(__c0.rid, '已取消'); }\n}"],
    ["  renderStatus(); renderResults();\n}",
      "  renderStatus(); renderResults();\n  if (__simCur) { var __c = __simCur; __simCur = null; if (err) __SIM.fail(__c.rid, err); else { try { __SIM.done(__c.rid, __hsrDetail(r, __c.cfg, ms)); } catch (e) { __SIM.fail(__c.rid, '结果导出失败：' + (e && e.message || e)); } } }\n}"],
    ["        r.ava ? h('div', { class: 'ava', style: 'background:' + r.color }, r.ava) : null,",
      "        r.gava ? __gava(r.gava, 'md') : r.ava ? h('div', { class: 'ava', style: 'background:' + r.color }, r.ava) : null,"],
    ["ava: c.name.slice(0, 1), color: elColor(c.element), title: c.id + ' ' + c.name }; },",
      "ava: c.name.slice(0, 1), gava: c.id, color: elColor(c.element), title: c.id + ' ' + c.name }; },"],
    ["      h('div', { class: 'ava', style: 'background:' + elColor(c.element) }, (c.name || '?').slice(0, 1)),",
      "      h('div', { style: 'margin-bottom:5px;line-height:0' }, __gava(m.charId, 'md', c.name)),"],
    ["      elDot(c.element), h('b', null, c.name), h('span', { class: 'muted mini' }, (EL_ZH[c.element] || c.element) + ' · ' + (PATH_ZH[c.path] || c.path) + ' · ' + m.charId),",
      "      __gava(m.charId, 'sm', c.name), h('b', null, c.name), h('span', { class: 'muted mini' }, (EL_ZH[c.element] || c.element) + ' · ' + (PATH_ZH[c.path] || c.path) + ' · ' + m.charId),"],
    ["    var row = h('label', { class: 'eff' + (off || x.locked ? ' off' : ''), title: '效果键：' + e.key },",
      "    var row = h('label', { class: 'eff' + (off || x.locked ? ' off' : ''), 'data-confidence': e.confidence === 'low' ? 'low' : null, title: (e.confidence === 'low' ? __lowReason(e) + '\\n' : '') + '效果键：' + e.key },"],
    ["        e.confidence === 'low' ? h('span', { class: 'tag low' }, '低置信') : null,",
      "        e.confidence === 'low' ? h('span', { class: 'tag low', title: __lowReason(e) }, '低置信') : null,"],
    ["      h('div', { class: 'nm' }, elDot((CHAR_BY[x.charId] || {}).element), x.name),",
      "      h('div', { class: 'nm' }, __gava(x.charId, 'sm', x.name), x.name),"],
    ["      return h('div', { class: 'rot' }, h('div', null, elDot((CHAR_BY[id] || {}).element), charName(id)),",
      "      return h('div', { class: 'rot' }, h('div', null, __gava(id, 'sm', charName(id)), charName(id)),"],
    ["}, CHAR_BY[id] ? elDot(CHAR_BY[id].element) : null, CHAR_BY[id] ? charName(id) : (t0 && t0.actor) || id); }));",
      "}, CHAR_BY[id] ? __gava(id, 'sm') : null, CHAR_BY[id] ? charName(id) : (t0 && t0.actor) || id); }));"],
    ["        h('td', null, elDot((CHAR_BY[t.charId] || {}).element), t.actor || charName(t.charId)),",
      "        h('td', null, t.charId ? __gava(t.charId, 'sm', t.actor || charName(t.charId)) : elDot((CHAR_BY[t.charId] || {}).element), t.actor || charName(t.charId)),"],
    ["        h('td', { class: 'num dmg', style: t.damage ? 'background-image:linear-gradient(90deg,transparent,' + hexA(memberColor(t.charId), .22) + ');background-size:' + Math.max(4, 100 * t.damage / maxHit).toFixed(1) + '% 70%' : null }, t.damage ? h('b', null, fmt(t.damage)) : h('span', { class: 'dim' }, '—')),",
      "        h('td', { class: 'num dmg', 'data-act-index': String(x.i), tabindex: '0', style: t.damage ? 'background-image:linear-gradient(90deg,transparent,' + hexA(memberColor(t.charId), .22) + ');background-size:' + Math.max(4, 100 * t.damage / maxHit).toFixed(1) + '% 70%' : null }, t.damage ? h('b', null, fmt(t.damage)) : h('span', { class: 'dim' }, '—')),"],
    ["      h('summary', null, elDot((CHAR_BY[m.charId] || {}).element), charName(m.charId), h('span', { class: 'muted mini' }, 'E' + m.eidolon)));",
      "      h('summary', null, __gava(m.charId, 'sm', charName(m.charId)), charName(m.charId), h('span', { class: 'muted mini' }, 'E' + m.eidolon)));"],
    ["      (kit.skills || []).forEach(function (s) {\n        add(body, h('div', { class: 'ks' }, h('div', { class: 't' }, h('span', { class: 'tag acc' }, s.typeName || SLOT_ZH[s.slot] || s.slot), s.name, dupName[s.name] > 1 ? h('span', { class: 'mini dim' }, '#' + s.id) : null, s.level ? h('span', { class: 'mini muted' }, 'Lv.' + s.level) : null,\n          (s.hits || []).length ? h('span', { class: 'tag' }, s.hits.length + ' 段伤害') : null,\n          (s.hits || []).some(function (x) { return x.confidence === 'low'; }) ? h('span', { class: 'tag low' }, '低置信') : null),\n          h('div', { class: 'd' }, skillDescAt(m.charId, s)),\n          (s.hits || []).length ? h('div', { class: 'mini dim', style: 'margin-top:3px' }, s.hits.map(function (x) { return (TYPE_ZH[x.dmgType] || x.dmgType) + '·' + (SCALING_ZH[x.scaling] || x.scaling || '') + (typeof x.multiplier === 'number' ? ' ' + pct(x.multiplier, 1).replace('.0%', '%') : '') + '·' + (HIT_TARGET_ZH[x.target] || x.target || '') + (x.count > 1 ? '×' + x.count + '次' : ''); }).join(' ｜ ')) : null));\n      });",
      "      (kit.skills || []).forEach(function (s) {\n        var __rs = __findBy((__charRaw(m.charId) || {}).skills, 'id', s.id), __lr = __lowList(__rs ? { hits: __rs.hits } : null);\n        add(body, h('div', { class: 'ks' }, h('div', { class: 't' }, h('span', { class: 'tag acc' }, s.typeName || SLOT_ZH[s.slot] || s.slot), s.name, dupName[s.name] > 1 ? h('span', { class: 'mini dim' }, '#' + s.id) : null, s.level ? h('span', { class: 'mini muted' }, 'Lv.' + s.level) : null,\n          (s.hits || []).length ? h('span', { class: 'tag' }, s.hits.length + ' 段伤害') : null,\n          __lr.length ? h('span', { class: 'tag low', title: __lr.join('\\n') }, '低置信') : null),\n          h('div', { class: 'd' }, skillDescAt(m.charId, s)),\n          (s.hits || []).length ? __hitLine({ class: 'mini dim', style: 'margin-top:3px' }, s.hits, __rs, function (x) { return (TYPE_ZH[x.dmgType] || x.dmgType) + '·' + (SCALING_ZH[x.scaling] || x.scaling || '') + (typeof x.multiplier === 'number' ? ' ' + pct(x.multiplier, 1).replace('.0%', '%') : '') + '·' + (HIT_TARGET_ZH[x.target] || x.target || '') + (x.count > 1 ? '×' + x.count + '次' : ''); }) : null));\n      });"],
    ["        kit.traces.forEach(function (t) { add(body, h('div', { class: 'ks' }, h('div', { class: 't' }, t.name), h('div', { class: 'd' }, t.desc || ''))); });",
      "        kit.traces.forEach(function (t) { add(body, h('div', Object.assign({ class: 'ks' }, __lowAttrs(__lowList(__findBy((__charRaw(m.charId) || {}).traces, 'id', t.id)))), h('div', { class: 't' }, t.name), h('div', { class: 'd' }, t.desc || ''))); });"],
    ["        kit.eidolons.forEach(function (e) { add(body, h('div', { class: 'ks' + (e.rank > m.eidolon ? ' locked' : '') }, h('div', { class: 't' }, h('span', { class: 'tag' + (e.rank <= m.eidolon ? ' gold' : '') }, 'E' + e.rank), e.name), h('div', { class: 'd' }, e.desc || ''))); });",
      "        kit.eidolons.forEach(function (e) { add(body, h('div', Object.assign({ class: 'ks' + (e.rank > m.eidolon ? ' locked' : '') }, __lowAttrs(__lowList(__findBy((__charRaw(m.charId) || {}).eidolons, 'rank', e.rank)))), h('div', { class: 't' }, h('span', { class: 'tag' + (e.rank <= m.eidolon ? ' gold' : '') }, 'E' + e.rank), e.name), h('div', { class: 'd' }, e.desc || ''))); });"],
    ['setTimeout(function () { runNow(); }, 60);\n',
      'setTimeout(function () { __SIM.shareBoot((window.__SIM_DATA__ || {}).version || null, runNow); }, 60);\n' + footer],
  ];
  pairs.forEach((p, i) => { src = once(src, p[0], p[1], String(i)); });
  return src;
}

function themeLinks(hashOf) {
  const q = (rel) => rel + '?v=' + hashOf(rel);
  const themeV = {
    'breakdown.js': hashOf('assets/theme/breakdown.js'),
    'compare.js': hashOf('assets/theme/compare.js'),
    'plans-drawer.js': hashOf('assets/theme/plans-drawer.js'),
  };
  return [
    '<link rel="preload" as="fetch" crossorigin="anonymous" href="' + q('data/hsr.json') + '">',
    '<link rel="preload" as="fetch" crossorigin="anonymous" href="' + q('data/chunks.json') + '">',
    '<link rel="stylesheet" href="' + q('assets/theme/common.css') + '">',
    '<link rel="stylesheet" href="' + q('assets/theme/hsr.css') + '">',
    '<link rel="stylesheet" href="' + q('assets/theme/interact.css') + '">',
    '<link rel="icon" type="image/svg+xml" href="' + q('assets/theme/favicon-hsr.svg') + '">',
    '<script>window.__SIM_NAV={"hsr":"../hsr_modeling/","endfield":"../endfiled_modeling/","ww":"../wuwa_modeling/","home":null};</script>',
    '<script src="' + q('assets/theme/gamenav.js') + '"></script>',
    '<script>window.__themeV=' + JSON.stringify(themeV) + ';</script>',
    '<script src="' + q('assets/theme/gui.js') + '"></script>',
    '<script src="' + q('assets/theme/share.js') + '"></script>',
    '<script src="' + q('assets/theme/plans.js') + '"></script>',
    '<script defer src="' + q('assets/theme/avatar.js') + '"></script>',
    '<script defer src="' + q('assets/theme/presets.js') + '"></script>',
    '<script defer src="' + q('assets/theme/resultbar.js') + '"></script>',
    '',
  ].join('\n');
}

function main() {
  const hsrJson = readFileSync(join(ROOT, 'data', 'v2', 'kits.json'));
  const chunksJson = readFileSync(join(SITE, 'data', 'chunks.json'));
  const manifest = JSON.parse(chunksJson.toString('utf8'));
  const dataHash = sha12(hsrJson);
  const chunk = (manifest.chunks || []).find((c) => c.id === 'index');
  if (!chunk || chunk.v !== dataHash || chunk.size !== hsrJson.length) {
    throw new Error('site/data/chunks.json 与 data/v2/kits.json 不一致（v ' + (chunk && chunk.v) + ' / ' + dataHash + '，size ' + (chunk && chunk.size) + ' / ' + hsrJson.length + '）');
  }

  rmSync(HSR, { recursive: true, force: true });
  mkdirSync(join(HSR, 'data'), { recursive: true });
  mkdirSync(join(HSR, 'assets'), { recursive: true });
  cpSync(join(SITE, 'assets'), join(HSR, 'assets'), { recursive: true });
  writeFileSync(join(HSR, 'data', 'hsr.json'), hsrJson);
  writeFileSync(join(HSR, 'data', 'chunks.json'), chunksJson);
  writeFileSync(join(OUT, 'README-hsr.md'), readFileSync(join(SITE, 'README-hsr.md')));

  const hashOf = (rel) => sha12(readFileSync(join(HSR, rel)));
  if (hashOf('data/chunks.json') !== sha12(chunksJson)) throw new Error('chunks.json 拷贝后哈希变化');

  const eng = bundle('engine2/index.js', 'HSR2', { 'engine2/data.gen.js': DATA_STUB });
  eng.warnings.forEach((w) => console.warn('警告: ' + w));
  const engine = eng.code.endsWith('\n') ? eng.code : eng.code + '\n';
  const bridge = readFileSync(join(SITE, 'recovered', 'sim-bridge.js'), 'utf8');
  const chunks = readFileSync(join(SITE, 'recovered', 'sim-chunks.js'), 'utf8');
  const app = transformApp((() => {
    const ui = readFileSync(join(ROOT, 'ui2', 'app.html'), 'utf8');
    const mark = '<script>/*__HSR2_ENGINE__*/</script>\n<script>\n';
    const at = ui.indexOf(mark);
    if (at < 0) throw new Error('ui2/app.html 缺少引擎占位');
    const end = ui.indexOf('</script>\n</body>', at);
    if (end < 0) throw new Error('ui2/app.html 结构不符');
    return ui.slice(at + mark.length, end);
  })());

  const ui = readFileSync(join(ROOT, 'ui2', 'app.html'), 'utf8');
  const cut = ui.indexOf('<script>/*__HSR2_ENGINE__*/</script>');
  let page = ui.slice(0, cut);
  page = once(page, '<html lang="zh-CN">', '<html lang="zh-CN" data-theme="hsr">', 'html');
  page = once(page, '<head>\n',
    '<head>\n<script data-sim="engine-version">window.__SIM_ENGINE_VERSION__="' + ENGINE_VERSION + '";window.__simAssets=window.__simAssets||{game:"hsr",engineVersion:"' + ENGINE_VERSION + '"};</script>\n\n',
    'head');
  page = once(page, '</head>\n', themeLinks(hashOf) + '</head>\n', 'links');
  page += '<script type="text/x-sim-deferred" data-sim="engine">\n' + engine + '\n</script>\n';
  page += '<script data-sim="bridge">' + bridge + '</script><script type="text/x-sim-deferred" data-sim="app">\n' + app + '</script>\n';
  page += '<script>\n' + chunks + '</script>\n\n';
  page += '<script src="assets/theme/bg-webgl.js?v=' + hashOf('assets/theme/bg-webgl.js') + '"></script>\n';
  page += '</body>\n</html>\n';
  writeFileSync(join(HSR, 'index.html'), page);
  console.log('已生成 dist/skylake/hsr/index.html（' + (page.length / 1024).toFixed(0) + ' KB），引擎模块 ' + eng.modules.length + ' 个');
}

try { main(); } catch (e) { console.error('打包失败: ' + (e && e.stack || e)); process.exit(1); }
