// 打包产物测试：防止「engine 新增模块但打包器 ORDER 漏加」这类问题再次发生
// （历史上出现过 skilltables / lightconedata / relics 三次遗漏，都会让 HTML 直接报 ReferenceError）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function buildAndLoad() {
  execFileSync(process.execPath, [join(ROOT, 'scripts', 'build-ui.mjs')], { cwd: ROOT, stdio: 'pipe' });
  const bundlePath = join(ROOT, 'dist', 'engine.bundle.js');
  assert.ok(existsSync(bundlePath), '未生成 dist/engine.bundle.js');
  const src = readFileSync(bundlePath, 'utf8');
  // 在受控上下文里执行，拿到挂在 globalThis 上的 API
  const sandbox = { window: {}, globalThis: null };
  sandbox.globalThis = sandbox;
  const fn = new Function('window', 'globalThis', src + '\n;return (typeof globalThis !== "undefined" && globalThis.HSR_ENGINE) || window.HSR_ENGINE;');
  return fn(sandbox.window, sandbox);
}

test('bundle 可以加载且暴露全部 API', () => {
  const E = buildAndLoad();
  assert.ok(E, 'bundle 未导出 HSR_ENGINE');
  const need = ['ENGINE_VERSION', 'paramSchema', 'defaultConfig', 'simulate', 'normalizeConfig',
                'characterInfo', 'eidolonInfo', 'lightconeInfo', 'relicInfo',
                'LIGHTCONES', 'SIGNATURE_LIGHTCONE', 'RELICS', 'RECOMMENDED_RELICS', 'RELIC_EFFECTS'];
  for (const k of need) assert.notEqual(E[k], undefined, 'bundle 缺少 ' + k);
});

test('bundle 内可以完整跑一次模拟（含光锥 + 遗器 + 星魂）', () => {
  const E = buildAndLoad();
  const r = E.simulate(E.defaultConfig());
  assert.equal(r.ok, true);
  assert.ok(r.summary.totalDamage > 0, '总伤害应为正');
  assert.equal(r.summary.byCharacter.length, 4);
  // 每个角色都要有伤害，且面板含光锥+遗器
  for (const c of r.summary.byCharacter) assert.ok(c.damage > 0, c.name + ' 伤害为 0');
  const info = E.characterInfo('1506', E.defaultConfig());
  assert.ok(info.relics && info.relics.current, 'bundle 内 relicInfo 不可用');
  assert.ok(info.lightcone && info.lightcone.current, 'bundle 内 lightconeInfo 不可用');
  assert.ok(info.panelStats.spd > info.baseStats.spd, '面板应含装备加成');
});

test('bundle 不残留 import / export / 裸引用', () => {
  const src = readFileSync(join(ROOT, 'dist', 'engine.bundle.js'), 'utf8');
  assert.ok(!/^\s*import\s/m.test(src), 'bundle 中残留 import');
  assert.ok(!/^\s*export\s/m.test(src), 'bundle 中残留 export');
});

test('单文件 CLI 可运行（不依赖 engine/ 目录）', () => {
  const out = execFileSync(process.execPath, [join(ROOT, 'dist', 'hsr-sim.mjs'), '--cycles', '1'], {
    cwd: '/tmp', stdio: 'pipe', encoding: 'utf8'
  });
  assert.ok(out.includes('总伤害'), 'CLI 未输出总伤害');
  assert.ok(!out.includes('is not defined'), 'CLI 报未定义错误');
});
