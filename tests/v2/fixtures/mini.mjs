// 手写的小型 kits fixture（遵守 docs/V2_DESIGN.md §2 契约），用于在 data.gen.js 缺席时开发/测试引擎核心
function lv(n, f) { var a = []; for (var i = 1; i <= n; i++) a.push(f(i)); return a; }

export const DATA = {
  version: 'fixture', generatedAt: 'test',
  characters: {
    '9001': {
      id: '9001', name: '测试输出', nameEn: 'DPS', rarity: 5, element: 'Quantum', path: 'Rogue', energyMax: 120,
      base: { hp: 1000, atk: 600, def: 500, spd: 100, critRate: 0.05, critDmg: 0.5, aggro: 75 },
      traceStats: { atkPct: 0.1 },
      skills: [
        { id: '900101', slot: 'basic', name: '普攻', typeName: '普攻', tag: 'SingleAttack', desc: '', rawDesc: '', maxLevel: 6, defaultLevel: 6,
          params: lv(9, function (i) { return [0.5 + 0.1 * i]; }), spCost: 0, spGain: 1, energyGain: 20, toughness: { main: 30, aoe: 0, adjacent: 0 },
          hits: [{ scaling: 'atk', param: 0, target: 'single', count: 1, countParam: null, element: 'Quantum', dmgType: 'basic', confidence: 'high', raw: '' }], effects: [] },
        { id: '900102', slot: 'skill', name: '战技', typeName: '战技', tag: 'SingleAttack', desc: '', rawDesc: '', maxLevel: 10, defaultLevel: 10,
          params: lv(15, function (i) { return [1.0 + 0.1 * i, 0.2]; }), spCost: 1, spGain: 0, energyGain: 30, toughness: { main: 60, aoe: 0, adjacent: 0 },
          hits: [{ scaling: 'atk', param: 0, target: 'single', count: 1, countParam: null, element: 'Quantum', dmgType: 'skill', confidence: 'high', raw: '' }],
          effects: [{ key: '9001:skill:900102:0', stat: 'atkPct', value: { param: 1 }, target: 'self', duration: 2, trigger: 'onCast', maxStacks: 1, condition: null, confidence: 'high', raw: '攻击力提高#2[i]%' }] },
        { id: '900103', slot: 'ult', name: '终结技', typeName: '终结技', tag: 'AoEAttack', desc: '', rawDesc: '', maxLevel: 10, defaultLevel: 10,
          params: lv(15, function (i) { return [3.0 + 0.1 * i]; }), spCost: 0, spGain: 0, energyGain: 5, toughness: { main: 0, aoe: 60, adjacent: 0 },
          hits: [{ scaling: 'atk', param: 0, target: 'aoe', count: 1, countParam: null, element: 'Quantum', dmgType: 'ult', confidence: 'high', raw: '' }], effects: [] },
        { id: '900104', slot: 'talent', name: '天赋', typeName: '天赋', tag: 'SingleAttack', desc: '', rawDesc: '', maxLevel: 10, defaultLevel: 10,
          params: lv(15, function (i) { return [0.4 + 0.01 * i]; }), spCost: 0, spGain: 0, energyGain: 10, toughness: { main: 0, aoe: 0, adjacent: 0 },
          hits: [{ scaling: 'atk', param: 0, target: 'single', count: 1, countParam: null, element: 'Quantum', dmgType: 'fua', confidence: 'high', raw: '' }], effects: [] }
      ],
      traces: [{ id: 't1', name: '锐利', desc: '暴击率提高10%', params: [0.1],
        effects: [{ key: '9001:trace:t1:0', stat: 'critRate', value: { param: 0 }, target: 'self', duration: null, trigger: 'passive', maxStacks: 1, condition: null, confidence: 'high', raw: '' }] }],
      eidolons: [
        { rank: 1, name: 'E1', desc: '暴伤+20%', params: [0.2], effects: [{ key: '9001:e1:0', stat: 'critDmg', value: { param: 0 }, target: 'self', duration: null, trigger: 'passive', maxStacks: 1, condition: null, confidence: 'high', raw: '' }] },
        { rank: 2, name: 'E2', desc: '', params: [], effects: [] },
        { rank: 3, name: 'E3', desc: '战技+2', params: [], effects: [], skillLevelUp: { skill: 2, basic: 1 } }
      ],
      memosprite: null, recommended: { lightcones: ['9901'], relic4: ['901'], relic2: ['902'], mainStats: { body: 'critRate', feet: 'spd', sphere: 'dmgBonus', rope: 'atkPct' }, subStats: ['critRate', 'critDmg'], teams: [] },
      notes: []
    },
    '9002': {
      id: '9002', name: '测试辅助', nameEn: 'Support', rarity: 5, element: 'Ice', path: 'Shaman', energyMax: 100,
      base: { hp: 1200, atk: 500, def: 450, spd: 120, critRate: 0.05, critDmg: 0.5, aggro: 100 },
      traceStats: {},
      skills: [
        { id: '900201', slot: 'basic', name: '普攻', typeName: '普攻', tag: 'SingleAttack', desc: '', rawDesc: '', maxLevel: 6, defaultLevel: 6,
          params: lv(9, function () { return [1.0]; }), spCost: 0, spGain: 1, energyGain: 20, toughness: { main: 30, aoe: 0, adjacent: 0 },
          hits: [{ scaling: 'atk', param: 0, target: 'single', count: 1, element: 'Ice', dmgType: 'basic' }], effects: [] },
        { id: '900202', slot: 'skill', name: '鼓舞', typeName: '战技', tag: 'Support', desc: '', rawDesc: '', maxLevel: 10, defaultLevel: 10,
          params: lv(15, function () { return [0.5, 0.5]; }), spCost: 1, spGain: 0, energyGain: 30, toughness: { main: 0, aoe: 0, adjacent: 0 },
          hits: [], effects: [
            { key: '9002:skill:900202:0', stat: 'dmgBonus', value: { param: 0 }, target: 'ally', duration: 1, trigger: 'onCast', maxStacks: 1, condition: null, confidence: 'high', raw: '' },
            { key: '9002:skill:900202:1', stat: 'actionAdvance', value: { param: 1 }, target: 'ally', duration: null, trigger: 'onCast', maxStacks: 1, condition: null, confidence: 'high', raw: '' }] },
        { id: '900203', slot: 'ult', name: '激励', typeName: '终结技', tag: 'Support', desc: '', rawDesc: '', maxLevel: 10, defaultLevel: 10,
          params: lv(15, function () { return [2, 0.3]; }), spCost: 0, spGain: 0, energyGain: 5, toughness: { main: 0, aoe: 0, adjacent: 0 },
          hits: [], effects: [
            { key: '9002:ult:900203:0', stat: 'spFlat', value: { param: 0 }, target: 'team', duration: null, trigger: 'onCast', maxStacks: 1, condition: null, confidence: 'high', raw: '' },
            { key: '9002:ult:900203:1', stat: 'atkPct', value: { param: 1 }, target: 'team', duration: 2, trigger: 'onCast', maxStacks: 1, condition: null, confidence: 'high', raw: '' }] },
        { id: '900204', slot: 'talent', name: '天赋', typeName: '天赋', tag: 'Support', desc: '', rawDesc: '', maxLevel: 10, defaultLevel: 10,
          params: lv(15, function () { return [0.1]; }), spCost: 0, spGain: 0, energyGain: 0, toughness: { main: 0, aoe: 0, adjacent: 0 }, hits: [],
          effects: [{ key: '9002:talent:0', stat: 'vuln', value: { param: 0 }, target: 'enemies', duration: null, trigger: 'passive', maxStacks: 1, condition: '敌人处于某状态', confidence: 'low', raw: '' }] }
      ],
      traces: [], eidolons: [], memosprite: null, recommended: {}, notes: []
    }
  },
  lightcones: {
    '9901': { id: '9901', name: '测试光锥', path: 'Rogue', rarity: 5, base: { hp: 1000, atk: 500, def: 400 }, passiveName: '', rawDesc: '',
      params: [[0.2], [0.25], [0.3], [0.35], [0.4]],
      effects: [{ key: 'lc:9901:0', stat: 'critDmg', value: { param: 0 }, target: 'self', duration: null, trigger: 'passive', maxStacks: 1, condition: null, confidence: 'high', raw: '' }] }
  },
  relicSets: {
    '901': { id: '901', name: '测试隧洞', kind: 'cavern',
      set2: { desc: '攻击+12%', params: [0.12], effects: [{ key: 'relic:901:2:0', stat: 'atkPct', value: { param: 0 }, target: 'self', duration: null, trigger: 'passive', maxStacks: 1, condition: null, confidence: 'high', raw: '' }] },
      set4: { desc: '施放战技后战技伤害+30%', params: [0.3], effects: [{ key: 'relic:901:4:0', stat: 'dmgBonus_skill', value: { param: 0 }, target: 'self', duration: 1, trigger: 'onSkill', maxStacks: 1, condition: null, confidence: 'high', raw: '' }] } },
    '902': { id: '902', name: '测试位面', kind: 'planar',
      set2: { desc: '暴击率+8%', params: [0.08], effects: [{ key: 'relic:902:2:0', stat: 'critRate', value: { param: 0 }, target: 'self', duration: null, trigger: 'passive', maxStacks: 1, condition: null, confidence: 'high', raw: '' }] }, set4: null }
  },
  monsters: {
    '8888': { id: '8888', templateId: '8888', name: '测试首领', rank: 'BigBoss', weak: ['Quantum'],
      res: { Physical: 0.2, Fire: 0.2, Ice: 0.2, Thunder: 0.2, Wind: 0.2, Quantum: 0, Imaginary: 0.2 }, toughness: 300, hpBase: 1e6, defBase: 1000, spd: 100, effectRes: 0.3 }
  }
};
