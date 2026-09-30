# V2：通用队伍模拟器 —— 设计契约（所有子任务必须遵守）

目标：基于 hsr.nanoka.cc（CDN https://static.nanoka.cc/hsr/4.6.51）全量数据，构建**通用**模拟器：
用户自选 1–4 名角色（全角色库）+ 光锥 + 遗器 + 面板，自选/自定义敌人，引擎**自动排轴**（搜索最优行动序列）
并结算理想化伤害（期望暴击或必定暴击），输出总伤害、每角色占比、时间轴。

v1（engine/、ui/、dist/hsr-team-sim.html 等）是四名欢愉角色的专用模拟器，**保持不动**（可读、可 import 复用，不要修改）；v2 全部放在新目录：

| 路径 | 内容 | 负责 |
|---|---|---|
| scripts/v2/fetch_all.sh | 抓取全部角色/光锥/遗器/敌人详情到 data/v2/raw/ | 数据 |
| scripts/v2/build_kits.mjs | 解析 raw → data/v2/kits.json 与 engine2/data.gen.js | 数据 |
| engine2/（除 data.gen.js） | 通用引擎（ESM，纯 JS，无依赖，浏览器/Node 通用） | 引擎 |
| engine2/overrides/ | 个别角色手写机制（覆盖自动解析） | 引擎/机制 |
| ui2/app.html | 界面源码 | 界面 |
| scripts/v2/build.mjs | 打包 → dist/hsr-sim-v2.html（单文件，离线可用）与 dist/hsr-sim-v2.mjs（CLI） | 界面 |
| tests/v2/*.test.mjs | node --test | 各自 |

## 1. 原始数据端点（已验证 curl 可访问；web_fetch 不行）

B=https://static.nanoka.cc/hsr/4.6.51
- $B/character.json（99 名角色基础信息，key=id）、$B/lightcone.json、$B/relicset.json、$B/monster.json（664 个敌人模板，含 child id 列表）
- $B/zh/character/{id}.json：详情。关键字段：
  - sp_need = 终结技能量上限；技能 sp_base = 施放该技能获得的能量；bp_need（1=消耗 1 战技点，-1=不消耗）、bp_add（1=回复 1 点）
  - skills[id]: type(Normal/BPSkill/Ultra/None(天赋)/Maze/MazeNormal/…)、type_name（普攻/战技/终结技/天赋/秘技/欢愉技/强化普攻…）、tag(SingleAttack/AoEAttack/Blast/Bounce/Enhance/Support/Restore/Defence…)、show_stance_list=[主目标, 全体, 相邻] 削韧、level[n].param_list、desc 占位符 #N[i]%（规则见 data/nanoka/README.md）
  - skill_trees.pointXX["1"]：point_type 1=属性加成（status_add_list: property_type/value），2=技能升级（max_level），3=额外能力（point_name/point_desc/param_list）
  - ranks["1".."6"]：星魂 name/desc/param_list
  - stats["0".."6"]：满级属性 = base + add × (等级上限 − 1)，第 6 阶等级上限 80
  - memosprite、enhanced：忆灵/强化形态（可能为空）
- $B/zh/lightcone/{id}.json：光锥详情（属性、叠影 1–5 被动 params）
- $B/zh/monster/{childId}.json：敌人详情：hp_base / defence_base / speed_base / stance_base（韧性）/ child[].damage_type_resistance / stance_weak_list / hp_modify_ratio / stance_modify_ratio / rank
- 已有样例：data/nanoka/raw/（四个欢愉角色的详情等）

## 2. kits 数据契约（engine2/data.gen.js 导出 export const DATA = {...}，内容同 data/v2/kits.json）

    DATA = {
      version: "4.6.51", generatedAt,
      characters: { [id]: Character },
      lightcones: { [id]: Lightcone },
      relicSets:  { [id]: RelicSet },
      monsters:   { [id]: Monster }
    }

    Character = {
      id: "1102", name: "希儿", nameEn: "Seele", rarity: 5,
      element: "Quantum",               // Physical|Fire|Ice|Thunder|Wind|Quantum|Imaginary
      path: "Hunt",                     // 原始 base_type 码（Warrior/Rogue/Mage/Shaman/Warlock/Knight/Priest/Memory/Elation）
      energyMax: 120,
      base: { hp, atk, def, spd, critRate, critDmg, aggro },   // 80 级 6 阶突破
      traceStats: { atkPct: 0.28, critDmg: 0.24, ... },       // point_type=1 全部求和，键见 §4
      skills: [Skill],
      traces: [{ id, name, desc, params, effects: [Effect] }], // point_type=3
      eidolons: [{ rank: 1..6, name, desc, params, effects: [Effect], skillLevelUp: { skill: 2, talent: 2 } }],  // 3/5 魂从文本解析
      memosprite: null | { name, base..., skills: [Skill] },
      recommended: { lightcones: [id], relic4: [id], relic2: [id], mainStats: {body, feet, sphere, rope}, subStats: [...], teams: [[id...]] },
      notes: [文本]                      // 解析告警
    }

    Skill = {
      id: "110202", slot: "basic"|"skill"|"ult"|"talent"|"technique"|"elation"|"enhancedBasic"|"enhancedSkill"|"memo"|"other",
      name, typeName, tag, desc,        // desc 已代入默认等级参数、去标签
      rawDesc,                          // 保留占位符（去标签）
      maxLevel: 10, defaultLevel: 10,   // 行迹满级（普攻 6、战技/终结技/天赋 10），不含星魂 +2
      params: [[...lv1], [...lv2], ...],// 各等级 param_list（数组下标 = 等级-1）
      spCost: 1 | 0,  spGain: 1 | 0,    // 战技点
      energyGain: 30,                   // sp_base（null→0）
      toughness: { main: 60, aoe: 0, adjacent: 0 },
      hits: [Hit],                      // 伤害段（自动解析）
      effects: [Effect]                 // 施放附带的增益/减益（自动解析）
    }

    Hit = {
      scaling: "atk"|"hp"|"def"|"elation"|"break"|"true",
      param: 0,                         // 倍率 = params[level-1][param]
      target: "single"|"aoe"|"adjacent"|"bounce"|"random",
      count: 1, countParam: null,       // 弹射/多段次数：常数或引用 param 下标
      element: "Quantum",
      dmgType: "basic"|"skill"|"ult"|"fua"|"dot"|"elation"|"memo"|"break"|"true",
      confidence: "high"|"low",
      raw: "对指定敌方单体造成等同于希儿#1[i]%攻击力的量子属性伤害"
    }

    Effect = {
      key: "1102:skill:110202:0",       // 全局唯一，UI 用来开关
      stat: "atkPct",                   // §4 键
      value: 0.25 | { param: 1 },       // 常数或引用所属对象（技能/行迹/星魂/光锥/遗器）的 params
      target: "self"|"team"|"ally"(单体队友,默认选主C)|"allies"(除自身)|"enemy"|"enemies",
      duration: 2 | null,               // 回合数；null = 常驻
      trigger: "passive"|"onCast"|"battleStart"|"onUlt"|"onSkill"|"onBasic"|"onFua"|"onAttack"|"conditional",
      maxStacks: 1,
      condition: null | "文本",          // 条件原文（理想化默认满足，UI 可关）
      confidence: "high"|"low",
      raw: "攻击力提高#1[i]%"
    }

    Lightcone = { id, name, path, rarity, base: { hp, atk, def }, passiveName, rawDesc, params: [[s1...],...,[s5...]], effects: [Effect] }
    RelicSet  = { id, name, kind: "cavern"|"planar", set2: { desc, params, effects }, set4: null|{ desc, params, effects } }
    Monster   = { id(childId), templateId, name, rank, weak: ["Fire"], res: { 7 元素齐全，缺省 0.2 },
                  toughness, hpBase, defBase, spd, effectRes }

## 3. 引擎 API（engine2/index.js）

    export const ENGINE2_VERSION = "2.0.0";
    export const DATA                                        // 透传
    export function listCharacters(): [{ id, name, element, path, rarity, support: "manual"|"auto" }]
    export function listLightcones(path?): [{ id, name, path, rarity }]
    export function listRelicSets(): [{ id, name, kind }]
    export function listMonsters(): [{ id, name, rank, weak }]
    export function defaultMember(charId): Member            // 带推荐光锥/遗器/主词条
    export function defaultEnemy(monsterId?): Enemy
    export function defaultConfig(): Config                  // 一个可直接运行的默认队伍
    export function computeStats(member): FinalStats         // 面板（UI 展示用，不含战斗内 buff）
    export function describeKit(charId, member?): { skills:[{slot,name,desc,hits,effects}], traces, eidolons, notes }
    export function simulate(config): Result

    Member = {
      charId: "1102", level: 80, eidolon: 0,
      skillLevels: { basic: 6, skill: 10, ult: 10, talent: 10 },   // 不含星魂加成，引擎自动加
      lightcone: { id: "23001", superimposition: 1 } | null,
      relics: { set4: "108", set2: "305", mainStats: { body: "critRate", feet: "spd", sphere: "dmgBonus", rope: "atkPct" },
                subStats: { critRate: 6, critDmg: 8, atkPct: 4, spd: 4 } },    // 有效词条数
      statOverrides: { atk: null, critRate: null, ... },           // 非 null → 直接覆盖最终面板（用户自定义面板）
      extraBuffs: [Effect],                                         // 用户自定义额外增益
      disabledEffects: ["<effect.key>"],                            // 关掉自动解析出的某条效果
      policy: { mode: "auto"|"skillFirst"|"basicOnly", ultMode: "asap"|"auto", fuaPerTurn: null }
    }
    Enemy = { monsterId: null|"1005010", name, level: 95, count: 1 (1..5),
              hp: 1e6, toughness: 160, weak: ["Quantum"], res: {Physical:0.2,...}, spd: 132,
              extraDefShred: 0, extraVuln: 0, extraResShred: 0, alwaysBroken: false, allowBreak: true }
    Config = { team: [Member ×1..4], enemy: Enemy,
               battle: { cycles: 3, firstCycleAV: 150, avPerCycle: 100, startSP: 3, maxSP: 5, startEnergyPct: 0.5 },
               options: { critMode: "expected"|"always", beamWidth: 24, ignoreConditions: false } }
    Result = {
      total, perCycle, totalAV,
      byMember: [{ charId, name, damage, share, actions: {basic, skill, ult, fua, ...} }],
      byType: { basic, skill, ult, fua, dot, break, elation, true, memo },
      timeline: [{ av, actor, charId, action, skillName, damage, sp, energy, hits: [{ target, dmg, note }], buffs: [...] }],
      rotation: { [charId]: "E E Q A ..." },     // 自动排轴结果（A=普攻 E=战技 Q=终结技 F=追加 …）
      finalStats: [FinalStats], warnings: [..]
    }
    FinalStats = { charId, hp, atk, def, spd, critRate, critDmg, breakEffect, energyRegen, effectHitRate, effectRes, elation, dmgBonus: {all, <Element>...}, ... }

## 4. 统一属性键

hp hpPct atk atkPct def defPct spd spdPct critRate critDmg breakEffect energyRegen effectHitRate effectRes
outgoingHeal dmgBonus dmgBonus_<Element> dmgBonus_basic dmgBonus_skill dmgBonus_ult dmgBonus_fua dmgBonus_dot
defShred（敌人防御降低）defIgnore（无视防御）resPen resPen_<Element>（穿透）resShred（敌人抗性降低）vuln（敌人受到伤害提高）vuln_<dmgType>
elation（欢愉度）superBreak weaknessBreakEfficiency
即时类：actionAdvance（行动提前比例）energyFlat（回复能量）spFlat（回复战技点）

站点 property_type 映射：AttackAddedRatio→atkPct, HPAddedRatio→hpPct, DefenceAddedRatio→defPct, CriticalChanceBase→critRate,
CriticalDamageBase→critDmg, SpeedDelta→spd, BreakDamageAddedRatioBase→breakEffect, StatusProbabilityBase→effectHitRate,
StatusResistanceBase→effectRes, <Element>AddedRatio→dmgBonus_<Element>(注意 Thunder/Fire 等码), SPRatioBase→energyRegen, HealRatioBase→outgoingHeal,
AttackDelta→atk, HPDelta→hp, DefenceDelta→def；未知类型原样保留并写入 notes。

## 5. 伤害公式（沿用 engine/formula.js，已回归）

常规 = 倍率×面板 × (1+增伤) × 暴击区 × (1+易伤) × 抗性区 × 韧性区(未击破 0.9) × 防御区
防御区 = (200+10×Lv攻)/((200+10×Lv攻)+(200+10×Lv敌)×(1−减防−无视))；抗性区 = 1 − (抗性 − 减抗 − 穿透)
击破 = 元素系数(物/火 2，风 1.5，雷/冰 1，量/虚 0.5) × 3767.5533(80 级) × (0.5 + 韧性上限/40) × (1+击破特攻) × 易伤 × 抗性 × 防御 × 0.9
欢愉：engine/formula.js elationHit；暴击区 expected=1+min(率,1)×伤，always=1+伤
