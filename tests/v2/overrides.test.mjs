// tests/v2/overrides.test.mjs —— engine2/overrides 手写机制回归
// 每个 override 角色：放入合理队伍 → 强化形态/专属动作出现在 rotation（或时间轴）→ 伤害 > 0 → 与「无 override」相比差异合理。
//
// 欢愉四人 vs v1（engine/sim.js）对照（同配置：E0、无光锥、无遗器、敌人 80 级、弱点抗性 0、必暴；v2 用 beamWidth 8）：
//   写本测试时实测（v2.1.2 引擎）：         v1           v2       v2/v1
//     总伤                              1,300,913    ~2,820,000   ~2.2
//     1506 银狼LV.999                     281,377    ~1,350,000   ~4.8   ← v2 首次阿哈时刻后即达 60 隐藏分，多放 1 次终结技
//     1501 火花                           699,994      ~905,000   ~1.3
//     1503 真珠                            29,117       ~42,000   ~1.45
//     1511 星神★阿哈                      290,425      ~520,000   ~1.8   ← 行迹「盒中蕴藏的世界」按 4.6.51 数据（+120%/150%）
//   偏差来源：v1 开场全员 AV 0 行动 / v2 按 10000/速度；v1 技能用最高等级倍率、v2 用默认等级（10 级）参数；v2 为 beam search 选轴。
//   断言：总伤 v2/v1 ∈ [1/3, 3]（同一量级）。详见 engine2/overrides/README.md。
import test from 'node:test';
import assert from 'node:assert/strict';
import { DATA } from '../../engine2/data.gen.js';
import { OVERRIDES } from '../../engine2/overrides/index.js';
import { createEngine } from '../../engine2/core.js';

var E = createEngine(DATA, OVERRIDES);
var RAW = createEngine(DATA, {});

function cfgFor(eng, team, patch) {
  var c = eng.defaultConfig();
  c.team = team.map(function (id) { return Object.assign(eng.defaultMember(id), patch || {}); });
  c.options.beamWidth = 6;
  return c;
}
function run(eng, team, patch) { return eng.simulate(cfgFor(eng, team, patch)); }
function member(r, id) { return r.byMember.find(function (m) { return m.charId === id; }); }
function hasEntry(r, re, id) { return r.timeline.some(function (e) { return (!id || e.charId === id) && (re.test(e.skillName || '') || re.test(e.note || '') || re.test(e.action || '')); }); }

var CASES = [
  { id: '1506', team: ['1506', '1501', '1503', '1511'], code: /A\+/, dmg: true },
  { id: '1501', team: ['1506', '1501', '1503', '1511'], code: /A\+/, dmg: true },
  { id: '1503', team: ['1506', '1501', '1503', '1511'], code: /A\+/, dmg: true },
  { id: '1511', team: ['1506', '1501', '1503', '1511'], code: /Q/, dmg: true, entry: /阿哈时刻/, anyActor: true },
  { id: '1310', team: ['1310', '1303', '1309', '1306'], code: /E\+/, dmg: true },
  { id: '1213', team: ['1213', '1306', '1309', '1303'], code: /A\+/, dmg: true },
  { id: '1212', team: ['1212', '1306', '1303', '1309'], code: /E\+/, dmg: true },
  { id: '1308', team: ['1308', '1307', '1306', '1309'], code: /Q/, dmg: true, entry: /残梦尽染/ },
  { id: '1205', team: ['1205', '1306', '1309', '1303'], code: /A\+/, dmg: true, entry: /倏忽恩赐/ },
  { id: '1307', team: ['1307', '1005', '1308', '1306'], code: /E/, dmg: true, entry: /奥迹 ×/ },
  { id: '1306', team: ['1213', '1306', '1309', '1303'], code: /E/, dmg: false },
  { id: '1309', team: ['1310', '1303', '1309', '1306'], code: /Q/, dmg: true, entry: /协奏·附加伤害/ },
  { id: '1303', team: ['1310', '1303', '1309', '1306'], code: /Q/, dmg: false, entry: /分型的螺旋|残梅绽/ }
];

CASES.forEach(function (cs) {
  test('override ' + cs.id + '：专属动作出现、伤害为正、与无 override 差异合理', function () {
    assert.ok(OVERRIDES[cs.id], '已注册');
    var r = run(E, cs.team);
    var raw = run(RAW, cs.team);
    assert.ok(r.total > 0 && isFinite(r.total));
    assert.match(r.rotation[cs.id] || '', cs.code, 'rotation 含 ' + cs.code);
    if (cs.dmg) assert.ok(member(r, cs.id).damage > 0, cs.id + ' 伤害 > 0');
    if (cs.entry) assert.ok(hasEntry(r, cs.entry, cs.anyActor ? null : cs.id), '时间轴含 ' + cs.entry);
    var ratio = r.total / raw.total;
    var joy = cs.team.indexOf('1506') >= 0;
    // 欢愉队：通用引擎不会进入结界/连线/阿哈时刻，override 应显著更高；其他队：同一量级（0.2×~20×）
    if (joy) assert.ok(ratio > 3, '欢愉队 override/raw = ' + ratio.toFixed(2));
    else assert.ok(ratio > 0.2 && ratio < 20, cs.id + ' override/raw = ' + ratio.toFixed(2));
    assert.ok(!r.warnings.some(function (w) { return /hook .*出错|override.*error/i.test(w); }), '无 hook 异常告警');
  });
});

test('全部 override 队伍在 E6 / 期望暴击 / 3 敌人下可运行', function () {
  CASES.forEach(function (cs) {
    var c = cfgFor(E, cs.team, { eidolon: 6 });
    c.enemy.count = 3;
    var r = E.simulate(c);
    assert.ok(r.total > 0 && isFinite(r.total), cs.id + ' E6 total');
  });
});

test('欢愉：阿哈时刻按计时单位触发、好活当赏/笑点生效', function () {
  var r = run(E, ['1506', '1501', '1503', '1511']);
  var moments = r.timeline.filter(function (e) { return e.action === 'AHA'; });
  assert.ok(moments.length >= 3, '阿哈时刻次数 ' + moments.length);
  assert.ok(moments.some(function (e) { return e.damage > 0; }));
  assert.ok(r.byType.elation > r.total * 0.8, '欢愉伤害为主');
  assert.ok(hasEntry(r, /头号补给盲盒/, '1506'), '盲盒触发');
  assert.ok(hasEntry(r, /互动陷阱 ×/, '1501'), '互动陷阱');
});

test('欢愉四人 vs v1：同配置同一量级', async function () {
  var v1 = await import('../../engine/sim.js');
  var c1 = v1.defaultConfig();
  Object.keys(c1.characters).forEach(function (k) { var x = c1.characters[k]; x.eidolon = 0; x.lightcone.enabled = false; x.relics.enabled = false; });
  var r1 = v1.simulate(c1);
  var c = cfgFor(E, ['1506', '1501', '1503', '1511'], { eidolon: 0, lightcone: null, relics: null });
  c.enemy.level = 80;
  Object.keys(c.enemy.res).forEach(function (k) { c.enemy.res[k] = 0; });
  c.enemy.weak = ['Imaginary', 'Fire', 'Ice', 'Quantum'];
  c.options.critMode = 'always';
  c.options.beamWidth = 8;
  var r2 = E.simulate(c);
  var ratio = r2.total / r1.summary.totalDamage;
  assert.ok(ratio > 1 / 3 && ratio < 3, 'v2/v1 = ' + ratio.toFixed(2));
});