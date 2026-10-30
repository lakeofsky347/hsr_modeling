#!/usr/bin/env node
// ============================================================================
// V2 打包脚本（零依赖简易 ESM 打包器）
//   从 engine2/index.js 出发解析相对 import（可跨目录，如 ../engine/formula.js），
//   每个模块包成独立函数作用域（模块注册表 + 导出对象，懒加载 require，天然拓扑序），
//   产物：
//     dist/hsr-sim-v2.bundle.js  浏览器/Node 通用 IIFE（window.HSR2 / globalThis.HSR2）
//     dist/hsr-sim-v2.html       ui2/app.html 注入引擎（file:// 双击可用，离线零依赖）
//     dist/hsr-sim-v2.mjs        单文件 CLI（bin/hsr-sim-v2.mjs + 引擎）
// 用法：
//   node scripts/v2/build.mjs                              # 用真实引擎 engine2/index.js
//   node scripts/v2/build.mjs --entry ui2/mock-engine.js   # 仅开发：用假引擎打包 UI（产物带 .mock）
//   node scripts/v2/build.mjs --no-html | --no-cli
// 支持语法：import d / {a as b} / * as ns / d, {..} / 'side-effect'；import JSON（with/assert）；
//   export function|async function|function*|class|const|let|var（含多声明、简单解构）；
//   export default <expr|function|class>；export {a as b}；export {a as b} from；
//   export * from；export * as ns from。
// 限制：不支持动态 import()、顶层 await；import.meta 替换为 {url:""}；
//   循环依赖可运行，但 import 绑定为"导入时刻快照"（函数声明因提升不受影响）。
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MARK = '<script>/*__HSR2_ENGINE__*/</script>';
const CLI_MARK_RE = /^.*\/\*__HSR2_IMPORT__\*\/.*$/m;
const BT = '\x60';

// ---------------------------------------------------------------------------
// 词法扫描：标记每个位置是否处于"顶层代码"（非字符串/注释/模板/正则，花括号深度 0）
// ---------------------------------------------------------------------------
const REGEX_PREV = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);
const REGEX_KW = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
const isIdent = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_' || c === '$' || c > '\x7f';

export function topLevelMask(src) {
  const n = src.length;
  const mask = new Uint8Array(n); // 1 = 顶层代码
  let i = 0, depth = 0;
  let lastSig = ''; // 上一个有效 token 的末字符（区分正则/除号）
  let lastWord = '';
  const tmplStack = []; // 每层模板插值内部的花括号深度
  while (i < n) {
    const c = src[i];
    if (depth === 0) mask[i] = 1;
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '"' || c === "'") {
      i++;
      while (i < n && src[i] !== c) { if (src[i] === '\\') i++; else if (src[i] === '\n') break; i++; }
      i++; lastSig = 'a'; lastWord = ''; continue;
    }
    if (c === BT) { i = scanTemplate(i + 1); lastSig = 'a'; lastWord = ''; continue; }
    if (c === '/') {
      const isRegex = lastSig === '' || REGEX_PREV.has(lastSig) || REGEX_KW.has(lastWord);
      if (isRegex) {
        i++; let inClass = false;
        while (i < n) {
          const d = src[i];
          if (d === '\\') { i += 2; continue; }
          if (d === '\n') break;
          if (inClass) { if (d === ']') inClass = false; }
          else if (d === '[') inClass = true;
          else if (d === '/') break;
          i++;
        }
        i++; while (i < n && /[a-z]/i.test(src[i])) i++;
        lastSig = 'a'; lastWord = ''; continue;
      }
    }
    if (c === '{') { depth++; if (tmplStack.length) tmplStack[tmplStack.length - 1]++; }
    else if (c === '}') {
      if (tmplStack.length && tmplStack[tmplStack.length - 1] === 0) {
        tmplStack.pop(); depth--;
        i = scanTemplate(i + 1); lastSig = 'a'; lastWord = ''; continue;
      }
      if (tmplStack.length) tmplStack[tmplStack.length - 1]--;
      depth--; if (depth < 0) depth = 0;
    }
    if (isIdent(c)) {
      let j = i; while (j < n && isIdent(src[j])) { if (depth === 0) mask[j] = 1; j++; }
      lastWord = src.slice(i, j); lastSig = 'a'; i = j; continue;
    }
    if (c !== ' ' && c !== '\n' && c !== '\t' && c !== '\r') { lastSig = c; lastWord = ''; }
    i++;
  }
  return mask;

  function scanTemplate(k) {
    while (k < n) {
      const d = src[k];
      if (d === '\\') { k += 2; continue; }
      if (d === BT) return k + 1;
      if (d === '$' && src[k + 1] === '{') { tmplStack.push(0); depth++; return k + 2; }
      k++;
    }
    return n;
  }
}

// ---------------------------------------------------------------------------
// 解析工具
// ---------------------------------------------------------------------------
function parseSpecList(s) {
  // "a, b as c, default as d" → [{imported, local}]
  return s.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '').split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
    const m = x.match(/^([A-Za-z0-9_$]+|"[^"]*"|'[^']*')(?:\s+as\s+([A-Za-z0-9_$]+|"[^"]*"|'[^']*'))?$/);
    if (!m) throw new Error('无法解析导入/导出说明符: ' + x);
    const unq = (v) => v.replace(/^["']|["']$/g, '');
    return { imported: unq(m[1]), local: unq(m[2] || m[1]) };
  });
}

// 从 const/let/var 声明中提取绑定名（支持多声明与简单解构）
export function declNames(src, start) {
  const names = [];
  let i = start, depth = 0;
  const n = src.length;
  let expectName = true;
  while (i < n) {
    const c = src[i];
    if (expectName) {
      while (i < n && /\s/.test(src[i])) i++;
      if (src[i] === '{' || src[i] === '[') {
        const open = src[i], close = open === '{' ? '}' : ']';
        let d = 0, j = i;
        for (; j < n; j++) { if (src[j] === open) d++; else if (src[j] === close) { d--; if (d === 0) break; } }
        src.slice(i + 1, j).split(',').forEach((part) => {
          let p = part.trim().replace(/^\.\.\./, '');
          if (!p) return;
          p = p.split('=')[0].trim();
          if (p.includes(':')) p = p.split(':')[1].trim();
          if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(p)) names.push(p);
        });
        i = j + 1; expectName = false; continue;
      }
      const m = src.slice(i, i + 200).match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
      if (!m) break;
      names.push(m[0]); i += m[0].length; expectName = false; continue;
    }
    if (c === '"' || c === "'" || c === BT) {
      const q = c; i++;
      while (i < n && src[i] !== q) { if (src[i] === '\\') i++; i++; }
      i++; continue;
    }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { depth--; if (depth < 0) break; }
    else if (depth === 0 && c === ',') { expectName = true; i++; continue; }
    else if (depth === 0 && c === ';') break;
    else if (depth === 0 && c === '\n') {
      const rest = src.slice(i + 1, i + 80);
      if (/^\s*(export|import|const|let|var|function|class|async\s+function|if|for|while|return)\b/.test(rest) || /^\s*(\/\/|\/\*|$)/.test(rest)) break;
    }
    i++;
  }
  return names;
}

// ---------------------------------------------------------------------------
// 模块转换
// ---------------------------------------------------------------------------
class Bundler {
  constructor(fileOverrides) { this.mods = new Map(); this.order = []; this.warnings = []; this.fileOverrides = fileOverrides || {}; }

  add(absPath) {
    if (this.mods.has(absPath)) return this.mods.get(absPath).idx;
    if (!existsSync(absPath)) throw new Error('找不到模块: ' + relative(ROOT, absPath));
    const idx = this.order.length;
    const rec = { idx, path: absPath, code: null };
    this.mods.set(absPath, rec); this.order.push(rec);
    const rel = relative(ROOT, absPath);
    const src = Object.prototype.hasOwnProperty.call(this.fileOverrides, rel) ? this.fileOverrides[rel] : readFileSync(absPath, 'utf8');
    rec.code = absPath.endsWith('.json') ? '__exports.default = ' + src.trim() + ';' : this.transform(src, absPath);
    return idx;
  }

  dep(spec, fromPath) {
    if (!spec.startsWith('.') && !spec.startsWith('/')) {
      throw new Error(relative(ROOT, fromPath) + ' 引用了非相对模块 "' + spec + '"：引擎必须零依赖、浏览器可用');
    }
    let p = resolve(dirname(fromPath), spec);
    const isFile = (q) => existsSync(q) && statSync(q).isFile();
    if (!isFile(p)) {
      if (isFile(p + '.js')) p += '.js';
      else if (isFile(join(p, 'index.js'))) p = join(p, 'index.js');
    }
    return this.add(p);
  }

  transform(src, file) {
    const mask = topLevelMask(src);
    const rel = relative(ROOT, file);
    const exportsList = []; // [name, expr]
    const starFrom = [];
    const prelude = [];
    const edits = [];
    let depVar = 0;
    const depOf = (spec) => { const v = '__d' + (depVar++); prelude.push('var ' + v + ' = __require(' + this.dep(spec, file) + ');'); return v; };
    const ATTR = '(?:\\s*(?:with|assert)\\s*\\{[^}]*\\})?[ \\t]*;?';

    const STMT = /\b(import|export)\b/g;
    let m;
    while ((m = STMT.exec(src))) {
      const kwStart = m.index;
      if (!mask[kwStart]) continue;
      const prev = src.slice(Math.max(0, kwStart - 1), kwStart);
      if (prev === '.' ) continue; // obj.import
      const kw = m[1];
      const rest = src.slice(kwStart, kwStart + 20000);
      let mm;
      if (kw === 'import') {
        if (/^import\s*\./.test(rest)) {
          this.warnings.push(rel + ': 使用了 import.meta（已替换为 {url:""}）');
          const mt = rest.match(/^import\s*\.\s*meta/);
          if (mt) edits.push({ start: kwStart, end: kwStart + mt[0].length, text: '({url:""})' });
          continue;
        }
        if (/^import\s*\(/.test(rest)) { this.warnings.push(rel + ': 使用了动态 import()（打包后不可用）'); continue; }
        if ((mm = rest.match(new RegExp('^import\\s*([\'"])([^\'"]+)\\1' + ATTR)))) {
          prelude.push('__require(' + this.dep(mm[2], file) + ');');
        } else if ((mm = rest.match(new RegExp('^import\\s+([\\s\\S]*?)\\s*from\\s*([\'"])([^\'"]+)\\2' + ATTR)))) {
          const clause = mm[1].trim();
          const v = depOf(mm[3]);
          const re = /^([A-Za-z_$][A-Za-z0-9_$]*)?\s*,?\s*(?:\{([\s\S]*)\}|\*\s*as\s+([A-Za-z_$][A-Za-z0-9_$]*))?$/;
          const cm = clause.match(re);
          if (!cm) throw new Error(rel + ': 无法解析 import 子句: ' + clause);
          if (cm[1]) prelude.push('var ' + cm[1] + ' = ' + v + '.default;');
          if (cm[2] !== undefined) parseSpecList(cm[2]).forEach((s) => prelude.push('var ' + s.local + ' = ' + v + '[' + JSON.stringify(s.imported) + '];'));
          if (cm[3]) prelude.push('var ' + cm[3] + ' = ' + v + ';');
        } else {
          continue; // 可能是标识符/属性名中的 import（极少见），忽略
        }
        edits.push({ start: kwStart, end: kwStart + mm[0].length, text: '' });
        continue;
      }
      // export
      if ((mm = rest.match(/^export\s*\*\s*as\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*from\s*(['"])([^'"]+)\2[ \t]*;?/))) {
        const v = depOf(mm[3]); exportsList.push([mm[1], v]);
      } else if ((mm = rest.match(/^export\s*\*\s*from\s*(['"])([^'"]+)\1[ \t]*;?/))) {
        starFrom.push(depOf(mm[2]));
      } else if ((mm = rest.match(/^export\s*\{([^}]*)\}\s*from\s*(['"])([^'"]+)\2[ \t]*;?/))) {
        const v = depOf(mm[3]);
        parseSpecList(mm[1]).forEach((s) => exportsList.push([s.local, v + '[' + JSON.stringify(s.imported) + ']']));
      } else if ((mm = rest.match(/^export\s*\{([^}]*)\}[ \t]*;?/))) {
        parseSpecList(mm[1]).forEach((s) => exportsList.push([s.local, s.imported]));
      } else if ((mm = rest.match(/^export\s+default\s+(async\s+function\b\s*\*?|function\b\s*\*?|class\b)\s*([A-Za-z_$][A-Za-z0-9_$]*)?/))) {
        const pre = rest.match(/^export\s+default\s+/)[0];
        if (mm[2]) { edits.push({ start: kwStart, end: kwStart + pre.length, text: '' }); exportsList.push(['default', mm[2]]); }
        else { edits.push({ start: kwStart, end: kwStart + mm[0].length, text: mm[1].trim() + ' __default' }); exportsList.push(['default', '__default']); }
        continue;
      } else if ((mm = rest.match(/^export\s+default\s+/))) {
        edits.push({ start: kwStart, end: kwStart + mm[0].length, text: 'var __default = ' });
        exportsList.push(['default', '__default']);
        continue;
      } else if ((mm = rest.match(/^export\s+((?:async\s+)?function\s*\*?|class)\s*([A-Za-z_$][A-Za-z0-9_$]*)/))) {
        exportsList.push([mm[2], mm[2]]);
        edits.push({ start: kwStart, end: kwStart + rest.match(/^export\s+/)[0].length, text: '' });
        continue;
      } else if ((mm = rest.match(/^export\s+(const|let|var)\s+/))) {
        declNames(src, kwStart + mm[0].length).forEach((nm) => exportsList.push([nm, nm]));
        edits.push({ start: kwStart, end: kwStart + rest.match(/^export\s+/)[0].length, text: '' });
        continue;
      } else {
        throw new Error(rel + ': 无法解析 export 语句: ' + rest.slice(0, 120));
      }
      edits.push({ start: kwStart, end: kwStart + mm[0].length, text: '' });
    }
    // 倒序应用编辑；被删语句保留换行数，便于报错行号定位
    edits.sort((a, b) => b.start - a.start);
    let out = src;
    for (const e of edits) {
      const nl = (out.slice(e.start, e.end).match(/\n/g) || []).length;
      out = out.slice(0, e.start) + e.text + '\n'.repeat(nl) + out.slice(e.end);
    }
    const seen = new Set();
    const getters = exportsList.filter(([k]) => (seen.has(k) ? false : (seen.add(k), true)))
      .map(([k, expr]) => JSON.stringify(k) + ': function () { return ' + expr + '; }');
    const head = [];
    if (getters.length) head.push('__def(__exports, {' + getters.join(', ') + '});');
    head.push(...prelude);
    starFrom.forEach((v) => head.push('__star(__exports, ' + v + ');'));
    return head.join('\n') + '\n' + out.replace(/^#!.*/, '');
  }

  emit(entryIdx, globalName) {
    const p = [];
    p.push('/* HSR2 引擎打包产物 —— 由 scripts/v2/build.mjs 自动生成，请勿手改 */');
    p.push('(function (__global) {');
    p.push('"use strict";');
    p.push('var __cache = {};');
    p.push('function __def(o, g) { for (var k in g) Object.defineProperty(o, k, { enumerable: true, configurable: true, get: g[k] }); }');
    p.push('function __star(o, src) { Object.keys(src).forEach(function (k) { if (k !== "default" && !Object.prototype.hasOwnProperty.call(o, k)) Object.defineProperty(o, k, { enumerable: true, get: function () { return src[k]; } }); }); }');
    p.push('function __require(i) { if (__cache[i]) return __cache[i].exports; var m = __cache[i] = { exports: {} }; __modules[i](m.exports, __require); return m.exports; }');
    p.push('var __modules = [');
    this.order.forEach((r, i) => {
      p.push('/* ===== [' + i + '] ' + relative(ROOT, r.path) + ' ===== */');
      p.push('function (__exports, __require) {\n' + r.code + '\n}' + (i < this.order.length - 1 ? ',' : ''));
    });
    p.push('];');
    p.push('var __api = __require(' + entryIdx + ');');
    p.push('__global.' + globalName + ' = __api;');
    p.push('if (typeof window !== "undefined" && window !== __global) window.' + globalName + ' = __api;');
    p.push('})(typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : this));');
    return p.join('\n') + '\n';
  }
}

export function bundle(entry, globalName = 'HSR2', fileOverrides = null) {
  const b = new Bundler(fileOverrides);
  const idx = b.add(resolve(ROOT, entry));
  return { code: b.emit(idx, globalName), modules: b.order.map((r) => relative(ROOT, r.path)), warnings: b.warnings };
}

export function injectHtml(uiHtml, code) {
  if (!uiHtml.includes(MARK)) throw new Error('ui2/app.html 缺少占位 ' + MARK);
  const safe = code.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
  return uiHtml.replace(MARK, () => '<script>\n' + safe + '\n</script>');
}

export function buildCli(cliSrc, code) {
  if (!CLI_MARK_RE.test(cliSrc)) throw new Error('bin/hsr-sim-v2.mjs 缺少 /*__HSR2_IMPORT__*/ 标记行');
  const body = cliSrc.replace(/^#!.*\n/, '').replace(CLI_MARK_RE, 'const HSR2 = globalThis.HSR2;');
  return '#!/usr/bin/env node\n' + code + '\n' + body;
}

// ---------------------------------------------------------------------------
// 命令行
// ---------------------------------------------------------------------------
function main() {
  const argv = process.argv.slice(2);
  const opt = (name, d) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : d; };
  const entry = opt('entry', 'engine2/index.js');
  const isMock = /mock/.test(entry);
  const t0 = Date.now();
  const res = bundle(entry);
  res.warnings.forEach((w) => console.warn('警告: ' + w));
  mkdirSync(join(ROOT, 'dist'), { recursive: true });
  const outJs = isMock ? 'dist/hsr-sim-v2.mock.bundle.js' : 'dist/hsr-sim-v2.bundle.js';
  writeFileSync(join(ROOT, outJs), res.code);
  console.log('模块 ' + res.modules.length + ' 个：' + res.modules.join(', '));
  console.log('已生成 ' + outJs + '（' + (res.code.length / 1024).toFixed(0) + ' KB）');
  if (!argv.includes('--no-html')) {
    const html = injectHtml(readFileSync(join(ROOT, 'ui2', 'app.html'), 'utf8'), res.code);
    const outHtml = isMock ? 'dist/hsr-sim-v2.mock.html' : 'dist/hsr-sim-v2.html';
    writeFileSync(join(ROOT, outHtml), html);
    console.log('已生成 ' + outHtml + '（' + (html.length / 1024).toFixed(0) + ' KB）');
  }
  if (!argv.includes('--no-cli') && !isMock) {
    const single = buildCli(readFileSync(join(ROOT, 'bin', 'hsr-sim-v2.mjs'), 'utf8'), res.code);
    writeFileSync(join(ROOT, 'dist', 'hsr-sim-v2.mjs'), single, { mode: 0o755 });
    console.log('已生成 dist/hsr-sim-v2.mjs（' + (single.length / 1024).toFixed(0) + ' KB）');
  }
  console.log('耗时 ' + (Date.now() - t0) + ' ms');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (e) { console.error('打包失败: ' + e.message); process.exit(1); }
}
