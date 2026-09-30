// tests/v2/bundle.test.mjs —— V2 打包器 / 单文件产物 / CLI 冒烟测试
// node --test tests/v2/bundle.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { bundle, injectHtml, buildCli } from '../../scripts/v2/build.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HAS_REAL = existsSync(join(ROOT, 'engine2', 'index.js')) && existsSync(join(ROOT, 'engine2', 'data.gen.js'));
const HAS_FIXTURE = existsSync(join(ROOT, 'tests', 'v2', 'fixtures', 'mini.mjs')) && existsSync(join(ROOT, 'engine2', 'core.js'));

// 在隔离 vm 上下文里模拟浏览器 window 执行 IIFE
function runInWindow(code) {
  const ctx = { console, setTimeout, clearTimeout, performance };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: 'hsr2.bundle.js' });
  return ctx;
}
function smoke(H) {
  assert.equal(typeof H.simulate, 'function');
  const chars = H.listCharacters();
  assert.ok(Array.isArray(chars) && chars.length > 0, 'listCharacters 非空');
  const cfg = H.defaultConfig();
  assert.ok(cfg.team.length >= 1 && cfg.team.length <= 4);
  const r = H.simulate(JSON.parse(JSON.stringify(cfg)));
  assert.ok(Number.isFinite(r.total) && r.total > 0, 'total 为有限正数: ' + r.total);
  assert.ok(Number.isFinite(r.perCycle) && r.perCycle > 0);
  assert.ok(Array.isArray(r.timeline) && r.timeline.length > 0);
  assert.ok(Array.isArray(r.byMember) && r.byMember.length === cfg.team.length);
  const share = r.byMember.reduce((a, b) => a + (b.share || 0), 0);
  assert.ok(Math.abs(share - 1) < 0.01, '占比之和≈1: ' + share);
  const st = H.computeStats(cfg.team[0]);
  assert.ok(st.atk > 0 && st.spd > 0);
  const kit = H.describeKit(cfg.team[0].charId, cfg.team[0]);
  assert.ok(Array.isArray(kit.skills));
  // 结果须可结构化克隆（UI 用 Web Worker 传回）
  structuredClone(r);
  return r;
}

test('打包器：import/export 各种写法 + 字符串/模板/正则中的伪语句', () => {
  const d = mkdtempSync(join(tmpdir(), 'hsr2b-'));
  mkdirSync(join(d, 'sub'));
  writeFileSync(join(d, 'index.js'), [
    "import { a as aa, b } from './sub/m.js';",
    "import * as ns from './sub/m.js';",
    "import def, { c } from './sub/d.js';",
    "import data from './x.json' with { type: 'json' };",
    "import {",
    "  multi1,",
    "  multi2 as m2",
    "} from './sub/multi.js';",
    "export { c as cc } from './sub/d.js';",
    "export * from './sub/star.js';",
    "export * as starNs from './sub/star.js';",
    "const s = \"export const fake = 1; import x from 'nope'\";",
    "const t = \x60",
    "import y from 'nope2'",
    "\x24{ { a: 1 }.a }\x60;",
    "const re = /import\\/x/g;",
    "export const X = aa + b, Y = { z: [1, 2] }, Z = 3",
    "export function f() { return ns.a + def() + data.k + multi1 + m2; }",
    "export let counter = 0; export function inc() { counter++; }",
    "export default class Foo {}",
  ].join('\n'));
  writeFileSync(join(d, 'sub', 'm.js'), 'export const a = 1;\nexport let b = 2;\n');
  writeFileSync(join(d, 'sub', 'd.js'), 'export default function () { return 10; }\nconst c = 5; export { c };\n');
  writeFileSync(join(d, 'sub', 'star.js'), "export const s1 = 's1'; export function s2() { return 2; }\n");
  writeFileSync(join(d, 'sub', 'multi.js'), 'export var multi1 = 1000, multi2 = 10000;\n');
  writeFileSync(join(d, 'x.json'), '{"k": 100}');
  const out = bundle(join(d, 'index.js'), 'T');
  const g = runInWindow(out.code).T;
  assert.deepEqual(Object.keys(g).sort(), ['X', 'Y', 'Z', 'cc', 'counter', 'default', 'f', 'inc', 's1', 's2', 'starNs'].sort());
  assert.equal(g.X, 3); assert.deepEqual([...g.Y.z], [1, 2]); assert.equal(g.Z, 3);
  assert.equal(g.f(), 11111);
  assert.equal(g.cc, 5); assert.equal(g.s1, 's1'); assert.equal(g.s2(), 2); assert.equal(g.starNs.s1, 's1');
  g.inc(); assert.equal(g.counter, 1, '导出为活绑定（getter）');
  assert.equal(typeof g.default, 'function');
  assert.equal(out.modules.length, 6);
});

test('打包器：拒绝非相对（第三方/内置）模块', () => {
  const d = mkdtempSync(join(tmpdir(), 'hsr2b-'));
  writeFileSync(join(d, 'index.js'), "import fs from 'node:fs';\nexport const a = 1;\n");
  assert.throws(() => bundle(join(d, 'index.js')), /非相对模块/);
});

test('injectHtml / buildCli：占位替换与 </script> 转义', () => {
  const html = injectHtml('<html><script>/*__HSR2_ENGINE__*/</script></html>', 'var s = "</script>"; var d = "$&";');
  assert.ok(!html.includes('"</script>"'));
  assert.ok(html.includes('"$&"'), '不能被 String.replace 特殊替换符破坏');
  assert.throws(() => injectHtml('<html></html>', 'x'), /占位/);
  const cli = buildCli("#!/usr/bin/env node\nimport * as HSR2 from '../engine2/index.js'; /*__HSR2_IMPORT__*/\nconsole.log(1);\n", '/*engine*/');
  assert.ok(cli.startsWith('#!/usr/bin/env node\n/*engine*/'));
  assert.ok(cli.includes('const HSR2 = globalThis.HSR2;'));
  assert.ok(!cli.includes('../engine2/index.js'));
});

test('engine2 核心 + fixture 数据：bundle 可在模拟 window 中执行，simulate 返回有限正数', { skip: !HAS_FIXTURE && '缺少 engine2/core.js 或 fixture' }, () => {
  const d = mkdtempSync(join(tmpdir(), 'hsr2fx-'));
  const P = (p) => JSON.stringify(join(ROOT, p));
  writeFileSync(join(d, 'entry.js'), [
    'import { DATA as FX } from ' + P('tests/v2/fixtures/mini.mjs') + ';',
    'import { OVERRIDES } from ' + P('engine2/overrides/index.js') + ';',
    'import { createEngine, ENGINE2_VERSION as V } from ' + P('engine2/core.js') + ';',
    'var E = createEngine(FX, OVERRIDES);',
    'export var ENGINE2_VERSION = V; export var DATA = E.DATA;',
    'export var listCharacters = E.listCharacters, listMonsters = E.listMonsters, defaultConfig = E.defaultConfig, computeStats = E.computeStats, describeKit = E.describeKit, simulate = E.simulate;',
  ].join('\n'));
  const out = bundle(join(d, 'entry.js'));
  const ctx = runInWindow(out.code);
  assert.ok(ctx.window.HSR2, 'window.HSR2 已挂载');
  smoke(ctx.HSR2);
});

test('真实引擎 engine2/index.js：打包 + 冒烟', { skip: !HAS_REAL && 'engine2/index.js 或 data.gen.js 尚未就绪' }, () => {
  const out = bundle('engine2/index.js');
  assert.deepEqual(out.warnings, []);
  const ctx = runInWindow(out.code);
  const H = ctx.HSR2;
  const r = smoke(H);
  assert.ok(H.listCharacters().length >= 50, '全角色库');
  assert.ok(H.listMonsters().length > 10, '敌人库');
  // 自定义 4 人队 + 必暴 + 多敌人
  const cfg = H.defaultConfig();
  const ids = H.listCharacters().slice(0, 4).map((c) => c.id);
  cfg.team = ids.map((id) => H.defaultMember(id));
  cfg.enemy.count = 3;
  cfg.options.critMode = 'always';
  const r2 = H.simulate(cfg);
  assert.ok(Number.isFinite(r2.total) && r2.total >= 0);
  assert.ok(r.total > 0);
});

test('构建产物：dist/hsr-sim-v2.html 与 dist/hsr-sim-v2.mjs', { skip: !HAS_REAL && 'engine2 尚未就绪' }, () => {
  execFileSync(process.execPath, [join(ROOT, 'scripts', 'v2', 'build.mjs')], { cwd: ROOT, stdio: 'pipe' });
  const html = readFileSync(join(ROOT, 'dist', 'hsr-sim-v2.html'), 'utf8');
  assert.ok(!html.includes('/*__HSR2_ENGINE__*/'), '占位已替换');
  assert.ok(html.includes('HSR2 引擎打包产物'));
  assert.ok(!/<script[^>]+src=/i.test(html), '无外部脚本依赖');
  assert.ok(!/<link[^>]+href=["']https?:/i.test(html), '无外部样式依赖');
  // 页面里的内联引擎脚本单独执行
  const m = html.match(/<script>\n(\/\* HSR2 引擎打包产物[\s\S]*?)\n<\/script>/);
  assert.ok(m, '找到内联引擎');
  smoke(runInWindow(m[1]).HSR2);
  // UI 脚本语法正确
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((x) => x[1]);
  scripts.forEach((s) => new vm.Script(s));
  // 单文件 CLI
  const cli = join(ROOT, 'dist', 'hsr-sim-v2.mjs');
  const json = JSON.parse(execFileSync(process.execPath, [cli, '--json', '--cycles', '2'], { cwd: tmpdir(), encoding: 'utf8', maxBuffer: 64 << 20 }));
  assert.ok(Number.isFinite(json.total) && json.total > 0);
  const list = execFileSync(process.execPath, [cli, '--list-characters'], { cwd: tmpdir(), encoding: 'utf8' });
  assert.ok(list.split('\n').filter(Boolean).length >= 50);
  const txt = execFileSync(process.execPath, [join(ROOT, 'bin', 'hsr-sim-v2.mjs'), '--set', 'options.critMode=always', '--timeline'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  assert.match(txt, /总伤害/);
  assert.match(txt, /时间轴/);
});
