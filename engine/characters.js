// ============================================================================
// 四角色机制数据（手工整理，全部数值来自 hsr.nanoka.cc 4.6.51 的角色详情数据）
// 每个条目注释中的 ID 为站点技能 ID，tests/consistency.test.mjs 会回查归一化数据核对。
// 只收录与「伤害模拟」相关的机制；纯生存类效果（抵御值、治疗量）仅保留影响资源的部分。
// ============================================================================

export const ELATION_COUNT_TIERS = [1, 2, 3, 4];

export const CHARACTERS = [
  // --------------------------------------------------------------------------
  // 1506 银狼LV.999（欢愉 / 虚数）—— 变身流主C
  // --------------------------------------------------------------------------
  {
    id: '1506',
    name: '银狼LV.999',
    nameEn: 'Silver Wolf LV.999',
    element: 'Imaginary',
    elementZh: '虚数',
    role: '主C',
    base: { atk: 388.1, def: 654.9, hp: 1047.8, spd: 110, critRate: 0.05, critDmg: 0.5, elationDegree: 0.10 },
    traceBonus: { critRate: 0.187, spd: 9, elationDegree: 0.10 },   // 行迹属性节点合计
    energy: { max: 60, perBasic: 20, perSkill: 30, perUlt: 5, perHit: 10 },
    kit: {
      // 150601 普攻 拳头硬了！
      basic: { id: '150601', name: '拳头硬了！', multiplier: 1.4, scaling: 'atk', kind: 'normal', spAdd: 1, energy: 20 },
      // 150602 战技 Shoot属性大爆发：200% 攻击力虚数伤害 + 5 笑点
      skill: { id: '150602', name: 'Shoot属性大爆发', multiplier: 2.0, scaling: 'atk', kind: 'normal',
               spCost: 1, jokeAdd: 5, energy: 30 },
      // 150603 终结技 无敌玩家，启动！：进入无敌玩家（结界）+ 行动提前 100%
      ult: { id: '150603', name: '无敌玩家，启动！', spCost: 0, energy: 5, hiddenRequire: 60,
             enterStance: 'invincible', advance: 1.0,
             blindbox: { multiplier: 1.125, kind: 'elation', trueRatio: 0.2, spBack: 3, jokeAdd: 2,
                         procChanceInit: 1.0, procChanceDecay: 0.2, segmentPause: 1 } },
      // 150604 天赋 有我在，把把都是顺风局
      talent: { hiddenThreshold: 60, hiddenOverflow: 240, hiddenOverflowUpgraded: 999,
                critRatePerPoint: 0.005, critDmgPerPoint: 0.01,
                elationAppendPerSpend: 0.5,          // 持好活当赏时普攻/战技追加 50% 欢愉伤害
                invincibleBasics: 3, exitClearsHidden: true },
      // 150608 强化普攻 奖励关：「狼尊时刻」
      enhancedBasic: { id: '150608', name: '奖励关：「狼尊时刻」', kind: 'elation',
                       total: 3.36, segments: 100, blindboxTriggers: 3, finisher: 1.4,
                       spAdd: 0, energy: 20, bonusPer60Hidden: 0.15, bonusMaxStacks: 2 },
      // 150620 / 150621 欢愉技
      elationSkills: [
        { id: '150620', name: '殿堂级操作回放', kind: 'buff', hiddenAdd: 15, multiplier: 0 },
        { id: '150621', name: '崩坏级伤害演示', kind: 'elation', hits: 6, multiplier: 1.125, resetBlindbox: true }
      ],
      // 150607 秘技：召唤怪怪怪味豆，每波次触发 1 次盲盒，固定计入 99 点好活当赏
      maze: { id: '150607', name: '朋友，这才是T0级秘技', blindboxPerWave: 1, fixedGoodReward: 99 },
      // 150629 固有行迹 欢愉万相★全息幻象
      innate: { id: '150629', name: '欢愉万相★全息幻象', overflowTo: 999, critDmg: 0.4, hiddenRefundRatio: 0.4 }
    },
    traces: {
      // 假结局速通攻略：速度 >= 160 时欢愉度 +50%，每超 1 点再 +2%，最多计 100 点
      a2: { name: '假结局速通攻略', spdThreshold: 160, elationBase: 0.50, elationPerPoint: 0.02, maxPoints: 100 },
      // 真结局解锁条件：欢愉技计入笑点 >= 20 额外 +20 隐藏分，>= 40 再 +20
      a4: { name: '真结局解锁条件', jokeTiers: [20, 40], hiddenPerTier: 20 },
      // 隐藏关卡全成就：进入无敌玩家 +20 隐藏分
      a6: { name: '隐藏关卡全成就', hiddenOnEnter: 20 }
    },
    eidolons: {
      1: { name: '以太编辑：星魂+1', domainVulnerability: 0.20, keepHiddenOnExit: 0.20 },
      2: { name: '是机制，不是BUG', extraTurnPerHidden: 120, restoreEnhancedBasic: 1 },
      3: { name: '只有15级？谁填的', skillLv: 2, basicLv: 1, elationLv: 1 },
      4: { name: '我来，我见，我..秒了', jokeMultiplierOnElationSkill: 5 },
      5: { name: '平A即是大招', ultLv: 2, talentLv: 2, elationLv: 1 },
      6: { name: '我独自满级！', amplificationOnEnhancedBasic: 0.50, implantAllWeakness: true }
    }
  },

  // --------------------------------------------------------------------------
  // 1501 火花（欢愉 / 火）—— 强化普攻 + 终结技主C
  // --------------------------------------------------------------------------
  {
    id: '1501',
    name: '火花',
    nameEn: 'Sparxie',
    element: 'Fire',
    elementZh: '火',
    role: '主C',
    base: { atk: 640.3, def: 460.8, hp: 1047.8, spd: 107, critRate: 0.05, critDmg: 0.5, elationDegree: 0.0 },
    traceBonus: { critRate: 0.12, critDmg: 0.133, elationDegree: 0.28 },
    energy: { max: 160, perBasic: 20, perSkill: 30, perUlt: 5, perHit: 10 },
    kit: {
      // 150101 普攻 哑火了吗：140% 攻击力火伤
      basic: { id: '150101', name: '哑火了吗', multiplier: 1.4, scaling: 'atk', kind: 'normal', spAdd: 1, energy: 20 },
      // 150108 强化普攻 百花齐放，胜者独享！：单体 140% + 相邻 70%（扩散）
      enhancedBasic: { id: '150108', name: '百花齐放，胜者独享！', kind: 'normal', scaling: 'atk',
                       multiplier: 1.4, adjacentMultiplier: 0.7, spAdd: 1, energy: 20 },
      // 150102 战技 尖叫！火花花连线中：开启连线，最多发动 20 次互动陷阱
      skill: { id: '150102', name: '尖叫！火花花连线中', spCost: 1, energy: 30, maxTraps: 20, kind: 'buff',
               trapsPerCast: 1 },
      // 150109 互动陷阱：强化普攻单体 +25% / 相邻 +12.5%，随机礼物（红红火火 +2 笑点 +2 战技点 / 恍恍惚惚 +1 笑点）
      trap: { id: '150109', name: '互动陷阱', spCost: 1, multiplierBonus: 0.25, adjacentBonus: 0.125,
              gift: [ { name: '红红火火', joke: 2, sp: 2, weight: 0.5 }, { name: '恍恍惚惚', joke: 1, sp: 0, weight: 0.5 } ] },
      // 150103 终结技 万我狂欢，镜头不要停：2 笑点；全体 (0.6 x 欢愉度 + 60%) 攻击力火伤
      ult: { id: '150103', name: '万我狂欢，镜头不要停', jokeAdd: 2, kind: 'normal', scaling: 'atk',
             multiplier: 0.6, elationDegreeCoef: 0.6, energy: 5 },
      // 150104 天赋 幕后花手：持好活当赏时，强化普攻 50%/25% 欢愉伤害、每次陷阱追加 25%、终结技 60% 欢愉伤害
      talent: { id: '150104', name: '幕后花手', requireGoodReward: true,
                enhancedBasicElation: 0.50, enhancedBasicAdjacentElation: 0.25,
                perTrapElation: 0.25, ultElation: 0.60 },
      // 150120 欢愉技 信号溢出：好戏返场！：全体 62.5% + 20 次 x 31.25%，+2 爆点
      elationSkills: [ { id: '150120', name: '信号溢出：好戏返场！', kind: 'elation', multiplier: 0.625,
                         extraHits: 20, extraMultiplier: 0.3125, sparkAdd: 2, energy: 5 } ],
      // 150107 秘技 流量变现：进战回 2 战技点，对全体 50% 攻击力火伤
      maze: { id: '150107', name: '流量变现', spGain: 2, multiplier: 0.5, kind: 'normal', scaling: 'atk' },
      // 150129 固有行迹 欢愉万相★兔子戏法
      innate: { id: '150129', name: '欢愉万相★兔子戏法', critDmg: 1.20, defIgnore: 0.20, sparkPer10: 1, sparkMax: 10 }
    },
    traces: {
      // 甜蜜！笑点签售会：攻击力 > 2000 后每超 100 点，欢愉度 +5%，最多 +80%
      p6: { name: '甜蜜！笑点签售会', atkThreshold: 2000, elationPer100: 0.05, elationMax: 0.80 },
      // 炫目！人设万花筒：队内欢愉人数 1/2/3+ -> 终结技额外 +2/4/8 笑点与 1/1/4 爆点
      p7: { name: '炫目！人设万花筒', jokeByCount: { 1: 2, 2: 4, 3: 8, 4: 8 }, sparkByCount: { 1: 1, 2: 1, 3: 4, 4: 4 } },
      // 沸腾！真伪调色盘：每 1 笑点使全队暴伤 +8%，最多 +80%
      p8: { name: '沸腾！真伪调色盘', critDmgPerJoke: 0.08, critDmgMax: 0.80 }
    },
    eidolons: {
      1: { name: '#全网热搜：她是谁？', jokeOnAhaMoment: 5, resPenPerJoke: 0.015, resPenMax: 0.15 },
      2: { name: '#观众的眼睛是雪亮的', extraTurnOnAhaMoment: true, sparkOnAhaMoment: 2,
           critDmgPerSpark: 0.10, critDmgMaxStacks: 4 },
      3: { name: '#请点击：心跳超链接', skillLv: 2, basicLv: 1, elationLv: 1 },
      4: { name: '#硬控！顶级表情管理', jokeOnUlt: 5, elationDegreeOnUlt: 0.36, elationTurns: 3 },
      5: { name: '#世界破烂，小花缝补', ultLv: 2, talentLv: 2, elationLv: 1 },
      6: { name: '#锵锵，即将绝版的我', resPen: 0.20, extraHitPerJoke: 1, extraHitMax: 40 }
    }
  },

  // --------------------------------------------------------------------------
  // 1503 真珠（欢愉 / 冰）—— 防御力驱动的治疗 / 挡伤副坦
  // --------------------------------------------------------------------------
  {
    id: '1503',
    name: '真珠',
    nameEn: 'Pearl',
    element: 'Ice',
    elementZh: '冰',
    role: '生存/辅助',
    base: { atk: 465.7, def: 727.7, hp: 1203.0, spd: 99, critRate: 0.05, critDmg: 0.5, elationDegree: 0.0 },
    traceBonus: { spd: 9, defPct: 0.225, statusRes: 0.10, elationDegree: 0.10 },
    energy: { max: 180, perBasic: 20, perSkill: 30, perUlt: 5, perHit: 10 },
    kit: {
      // 150301 普攻 行笔，临摹断水：126% 防御力冰伤
      basic: { id: '150301', name: '行笔，临摹断水', multiplier: 1.26, scaling: 'def', kind: 'normal',
               spAdd: 1, energy: 20 },
      // 150308 / 150310 强化普攻：140% 防御力全体冰伤 + 治疗 11.2% 防御 + 224
      enhancedBasic: { id: '150310', name: '行笔，绘制末浪', multiplier: 1.4, scaling: 'def', kind: 'normal',
                       healPct: 0.112, healFlat: 224, spAdd: 1, energy: 20, aoe: true,
                       elationAppend: { id: '150308', multiplier: 0.20 } },
      // 150302 战技 补缀生命的柔光：+15 好活当赏，治疗 15% 防御 + 300
      skill: { id: '150302', name: '补缀生命的柔光', goodReward: 15, healPct: 0.15, healFlat: 300,
               spCost: 1, energy: 30 },
      // 150303 终结技 鉴映灵魂的底色：+20 好活当赏，深度学习 3 充能，指定美学底本
      ult: { id: '150303', name: '鉴映灵魂的底色', goodReward: 20, charges: 3, spCost: 0, energy: 5,
             advanceByCount: { 1: 0.10, 2: 0.15, 3: 0.30, 4: 0.30 }, extraTurnAtCount: 4,
             extraTurnGoodReward: 30, extraTurnJoke: 60, extraTurnElation: 0.75 },
      // 150304 天赋 吞纳沙砾，重塑生机：1 点好活当赏 = 200 抵御值，抵挡 60% 伤害，上限 50
      talent: { id: '150304', name: '吞纳沙砾，重塑生机', goodRewardCap: 50, goodRewardCapUpgraded: 75,
                wardPerPoint: 200, blockRatio: 0.60, lowHpThreshold: 0.50, lowHpDR: 0.375,
                infiniteDuration: true, teamDefence: true },
      // 150320 欢愉技 渲染理性，解构欢愉：按欢愉人数 12.5/18.75/25/50%
      elationSkills: [ { id: '150320', name: '渲染理性，解构欢愉', kind: 'elation', multiplierByCount: [0.125, 0.1875, 0.25, 0.50],
                         energy: 5 } ],
      // 150307 秘技 凝润珠光，复刻真迹：+20 好活当赏、2 充能
      maze: { id: '150307', name: '凝润珠光，复刻真迹', goodReward: 20, charges: 2 },
      // 150329 固有行迹 欢愉万相★跃然纸上
      innate: { id: '150329', name: '欢愉万相★跃然纸上', capTo: 75, extraTurnKeepRatio: 0.20, extraTurnKeepJoke: 0.20 }
    },
    traces: {
      // 洞察万物：防御力 >= 2400 时欢愉度 +32%，每超 100 再 +3%（最多计 3600），并获得欢愉度 20% 的治疗量加成
      t1: { name: '洞察万物', defThreshold: 2400, elationBase: 0.32, elationPer100: 0.03, maxPoints: 3600 },
      // 感知容差：持好活当赏时全队效果抵抗 +50%；我方每回合 +5 好活当赏（上限 50，真珠回合开始重置）
      t2: { name: '感知容差', goodRewardPerAllyTurn: 5, goodRewardPerRound: 50, statusRes: 0.50 },
      // 艺术壁垒：美学底本施放终结技时，为其固定回复 90 点能量（不叠加）
      t3: { name: '艺术壁垒', energyRefund: 90 }
    },
    eidolons: {
      1: { name: '珍珠，藏在海的留白处', elationDegreeByCount: { '2': 0.10, '3': 0.20, '4': 0.60 }, cheatDeath: true },
      2: { name: '截取，顷刻破晓的光斑', amplification: 0.15, extraTurnDouble: true, advanceOthersOnUlt: true },
      3: { name: '速写，惊涛悬停的刹那', ultLv: 2, basicLv: 1, elationLv: 1 },
      4: { name: '解译，唇角模糊的笑意', elationSkillMultiplierBonus: 1.0 },
      5: { name: '透视，笔端星夜的肌理', skillLv: 2, talentLv: 2, elationLv: 1 },
      6: { name: '用一副躯壳，演算生命', resPen: 0.20, enhancedBasicElation: 2.40 }
    }
  },

  // --------------------------------------------------------------------------
  // 1511 星神★阿哈（欢愉 / 量子）—— 体系辅助
  // --------------------------------------------------------------------------
  {
    id: '1511',
    name: '星神★阿哈',
    nameEn: 'Aeon ★ Aha',
    element: 'Quantum',
    elementZh: '量子',
    role: '辅助',
    base: { atk: 679.1, def: 509.4, hp: 1047.8, spd: 94, critRate: 0.05, critDmg: 0.5, elationDegree: 0.0 },
    traceBonus: { spd: 5, critRate: 0.12, critDmg: 0.373 },
    energy: { max: 8, perBasic: 1, perSkill: 1, perUlt: 0, perHit: 0, fervorMode: true },
    kit: {
      // 151101 普攻 点星，开幕！：70% 量子欢愉伤害
      basic: { id: '151101', name: '点星，开幕！', multiplier: 0.7, kind: 'elation', spAdd: 1, fervor: 1 },
      // 151102 战技 此乃令使，阿哈认证™：令使 +25% 欢愉度，追加全体 62.5% 欢愉伤害
      skill: { id: '151102', name: '此乃令使，阿哈认证™', multiplier: 0.625, kind: 'elation', spCost: 1,
               lordElationDegree: 0.25, lordFervor: 1, fervor: 1 },
      // 151103 终结技 啊哈！宇宙笑点大爆炸：240% 全体 + 5 x 72%
      ult: { id: '151103', name: '啊哈！宇宙笑点大爆炸', multiplier: 2.4, extraHits: 5, extraMultiplier: 0.72,
             kind: 'elation', fervorCost: 8, stanceTurns: 3, stanceDefIgnore: 0.30, defIgnoreE2: 0.60,
             advance: 0.20 },
      // 151104 天赋 与祂共演，奇迹新篇
      talent: { id: '151104', name: '与祂共演，奇迹新篇', fervorMax: 8, jokeThreshold: 40,
                teamCritDmg: 0.50, critDmgTurns: 3 },
      // 151120 欢愉技 满月，是神在的时间：75% 全体 + 本次阿哈时刻总伤害 20% 真伤
      elationSkills: [ { id: '151120', name: '满月，是神在的时间', kind: 'elation', multiplier: 0.75,
                         trueRatio: 0.20, trueRatioE4: 0.25, fervor: 1 } ],
      // 151107 秘技 ABRACADABRA！：进战使阿哈获得固定计入 20 点笑点的额外回合
      maze: { id: '151107', name: 'ABRACADABRA！', extraTurnJoke: 20, fervor: 0 },
      // 151129 固有行迹 欢愉万相★无中生有
      innate: { id: '151129', name: '欢愉万相★无中生有', defIgnore: 0.30, critRate: 0.20, sparkRefundRatio: 0.10 },
      // 151131 阿哈正传（专属行迹技能）：欢愉负债 = 伤害值 25%，上限目标生命上限 10%
      debt: { id: '151131', name: '阿哈正传', ratio: 0.25, capMaxHpRatio: 0.10, e6AlwaysOn: 0.20 }
    },
    traces: {
      // 愚弄众神的玩笑：战技追加攻击额外对令使目标造成 20% 欢愉伤害并回 1 战技点
      t1: { name: '愚弄众神的玩笑', lordExtraElation: 0.20, spRefund: 1 },
      // 戏中人的异想国：受治疗/护盾时 +1 愿力，每轮 1 次，开大重置
      t2: { name: '戏中人的异想国', fervorOnHeal: 1, oncePerUlt: true },
      // 盒中蕴藏的世界：速度 >= 125 -> 欢愉度 +20%；>= 150 -> +50%
      t3: { name: '盒中蕴藏的世界', tiers: [ { spd: 125, elationDegree: 0.20 }, { spd: 150, elationDegree: 0.50 } ] }
    },
    // unique：阿哈时刻在（阿哈时刻基础速度 80 -> 星神★阿哈的基础速度）
    unique: { name: '阿哈时刻在', useOwnerSpeed: true, baseSpeed: 80 },
    eidolons: {
      1: { name: '谁在太初噤声时笑场', fervorOnStart: 5, amplification: 0.15 },
      2: { name: '在祂的眼睛和你之间', defIgnore: 0.60 },
      3: { name: '牌叠起，令悲喜轮回', ultLv: 2, basicLv: 1, elationLv: 1 },
      4: { name: '黑箱一个玩笑的命运', trueRatio: 0.25, countAlliesGoodReward: true },
      5: { name: '台前幕后，是我非我', skillLv: 2, talentLv: 2, elationLv: 1 },
      6: { name: '因为神说：你就是欢愉', debtAlwaysOn: 0.20, firstUltJoke: 100, firstUltAdvance: 1 }
    }
  }
];

export function getCharacter(id) {
  for (var i = 0; i < CHARACTERS.length; i++) {
    if (CHARACTERS[i].id === String(id)) return CHARACTERS[i];
  }
  return null;
}

