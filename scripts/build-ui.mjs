#!/usr/bin/env node
// ============================================================================
// 打包脚本：把 engine/*.js 打成单文件产物
//   dist/engine.bundle.js   浏览器/Node 通用 IIFE（挂到 window.HSR_ENGINE）
//   dist/hsr-team-sim.html  交互界面（双击即可用，file:// 可运行）
//   dist/hsr-sim.mjs        单文件命令行模拟器（仅依赖 node，无需 engine/ 目录）
// 用法：node scripts/build-ui.mjs
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE = join(ROOT, 'engine');
// 注意：skilltables.js / lightconedata.js / relicdata.js 由 scripts/gen_*.mjs 生成；
// 顺序需保证被依赖者在前（sim.js 依赖 formula / skilltables / lightcone* / relic* / characters）
const ORDER = ['formula.js', 'skilltables.js', 'lightconedata.js', 'lightcones.js',
               'relicdata.js', 'relics.js', 'characters.js', 'sim.js', 'schema.js'];
const MARK = '<script>/*__HSR_ENGINE__*/</script>';
const EXPORTS = ['ENGINE_VERSION', 'paramSchema', 'defaultConfig', 'simulate', 'normalizeConfig',
                 'CHARACTERS', 'getCharacter', 'ASSUMPTIONS',
                 // v1.1.0：星魂与技能等级
                 'characterInfo', 'eidolonInfo', 'skillLevelInfo', 'defaultSkillLevels',
                 'baseSkillLevel', 'effectiveSkillLevel', 'innateLevelOf',
                 'EIDOLON_SKILL_BONUS', 'SLOT_CAPS', 'SLOT_LABELS',
                 // v1.2.0：专属光锥
                 'LIGHTCONES', 'SIGNATURE_LIGHTCONE', 'resolveLightcone', 'lightconeInfo', 'applyLightconeStats',
                 // v1.3.0：遗器
                 'RELICS', 'RECOMMENDED_RELICS', 'RELIC_EFFECTS', 'resolveRelics', 'relicPanelBonus',
                 'relicInfo', 'MAIN_STAT_VALUES', 'SUBSTAT_VALUES'];

function stripModule(src) {
  return src
    .replace(/^import\b[^;]*;/gm, '')
    // 同时处理 "export { ... } from '...';" 与裸的 "export { ... };"（重导出）
    .replace(/^export\s*\{[^}]*\}\s*(from[^;]*)?;/gm, '')
    .replace(/^export\s+(function|const|var|let|class)\s+/gm, '$1 ');
}

function makeBundle(forModule) {
  let body = '';
  for (const f of ORDER) {
    body += '\n/* ===== ' + f + ' ===== */\n' + stripModule(readFileSync(join(ENGINE, f), 'utf8')) + '\n';
  }
  return '/* 由 scripts/build-ui.mjs 自动生成，请勿手改；改 engine/*.js 后重新构建 */\n' +
    '(function () {\n"use strict";\n' + body + '\n' +
    'var API = { ' + EXPORTS.map((e) => e + ': ' + e).join(', ') + ' };\n' +
    (forModule ? '' : 'if (typeof window !== "undefined") window.HSR_ENGINE = API;\n') +
    'if (typeof globalThis !== "undefined") globalThis.HSR_ENGINE = API;\n' +
    '})();\n';
}

mkdirSync(join(ROOT, 'dist'), { recursive: true });

// 1) 通用 bundle
const bundle = makeBundle(false);
writeFileSync(join(ROOT, 'dist', 'engine.bundle.js'), bundle);

// 2) 交互界面
const uiPath = join(ROOT, 'ui', 'app.html');
if (!existsSync(uiPath)) {
  console.log('跳过 HTML：ui/app.html 不存在');
} else {
  const ui = readFileSync(uiPath, 'utf8');
  if (ui.indexOf(MARK) < 0) {
    console.error('ui/app.html 缺少占位行 ' + MARK);
    process.exit(1);
  }
  const html = ui.replace(MARK, '<script>\n' + bundle + '\n</script>');
  writeFileSync(join(ROOT, 'dist', 'hsr-team-sim.html'), html);
  console.log('已生成 dist/hsr-team-sim.html（' + html.length + ' 字符）');
}

// 3) 单文件 CLI
const cliPath = join(ROOT, 'bin', 'hsr-sim.mjs');
if (existsSync(cliPath)) {
  let cli = readFileSync(cliPath, 'utf8');
  cli = cli.replace(/^import\s*\{([^}]*)\}\s*from\s*'\.\.\/engine\/sim\.js';\s*$/m,
    function (m, names) { return 'const {' + names + '} = globalThis.HSR_ENGINE;'; });
  const single = makeBundle(true).replace(/^#!.*\n/, '') + '\n' + cli.replace(/^#!.*\n/, '');
  writeFileSync(join(ROOT, 'dist', 'hsr-sim.mjs'), '#!/usr/bin/env node\n' + single);
  console.log('已生成 dist/hsr-sim.mjs（' + single.length + ' 字符）');
}

console.log('已生成 dist/engine.bundle.js（' + bundle.length + ' 字符）');
