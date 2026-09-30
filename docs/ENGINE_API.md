# 引擎 API 契约（v1，冻结）

浏览器 UI 与 Node CLI 共用同一份引擎。UI 通过全局对象 `window.HSR_ENGINE` 访问（由构建脚本 `scripts/build-ui.mjs` 把引擎源码内联进单文件 HTML）。

## 1. 全局对象

```js
window.HSR_ENGINE = {
  ENGINE_VERSION: "1.0.0",
  paramSchema(): Schema,        // 参数表单描述（UI 据此渲染输入控件）
  defaultConfig(): Config,      // 默认配置（可直接改）
  simulate(config: Config): Result
}
```

## 2. Schema（驱动 UI 表单）

```js
{
  version: "1.0.0",
  groups: [
    {
      id: "global",                 // 唯一 id
      label: "全局 / 战斗环境",
      description: "可选说明",
      fields: [
        {
          path: "enemy.level",      // 指向 Config 的点号路径，UI 用它读写配置
          label: "敌人等级",
          type: "number",           // "number" | "boolean" | "select" | "text"
          min: 1, max: 95, step: 1,
          default: 80,
          help: "影响防御乘区",
          unit: ""                  // 可选，仅用于显示，如 "%"、"点"
        },
        { path: "options.alwaysCrit", label: "必定暴击", type: "boolean", default: true },
        { path: "team.skillPoints.start", label: "初始战技点", type: "number", min: 0, max: 5, step: 1, default: 3 },
        { path: "characters.1506.rotation.mode", label: "循环策略", type: "select",
          options: [ { value: "perfect", label: "完美轴（推荐）" }, { value: "conservative", label: "保守轴" } ],
          default: "perfect" }
      ]
    },
    { id: "1506", label: "银狼LV.999", fields: [ /* 同上结构 */ ] }
  ]
}
```

字段值类型：number / boolean / string（select、text）。UI 必须支持：数字输入（含 min/max/step）、开关、下拉、文本。

## 3. Config（可手动调整的全部参数）

```js
{
  meta: { version: "hsr-4.6.51", label: "银狼LV.999 + 火花 + 真珠 + 星神★阿哈" },
  duration: { cycles: 3, avPerCycle: 100, firstCycleAV: 150 },   // 总行动值 = firstCycleAV + (cycles-1)*avPerCycle
  enemy: {
    level: 80, defenseBase: 200, defensePerLevel: 10,
    resBase: 0.2,        // 无弱点 20% 抗性
    weakness: true,      // 有弱点 → 抗性 0
    resShred: 0,         // 额外减抗
    vulnerability: 0,    // 易伤（受到的伤害提高）
    toughnessDR: 0.1,    // 未击破韧性减伤
    broken: false,       // 是否已击破
    targetCount: 1       // 敌人数（影响均分类技能）
  },
  team: {
    skillPoints: { start: 3, max: 5 },
    jokePoints: { start: 0 },
    ahaMoment: { baseSpeed: 80, speedFromAllies: true }
  },
  options: {
    alwaysCrit: true,          // 理想轴：欢愉伤害按暴击结算
    infiniteSkillPoints: false,// 忽略战技点约束
    includeTrueDamage: true,
    elationBaseValue: 7535.107,// 80 级欢愉伤害基础值
    jokeCurveK: 5, jokeCurveC: 240  // 笑点乘区 = 1 + (笑点*k)/(笑点+c)
  },
  characters: {
    "1506": {
      enabled: true, name: "银狼LV.999", level: 80, eidolon: 0,
      stats: { atk: 388.1, def: 654.9, hp: 1047.8, spd: 110, critRate: 0.05, critDmg: 0.5, elationDegree: 0.10 },
      skillLevels: { basic: 10, skill: 15, ult: 15, talent: 15, elationSkill: 15 },
      rotation: { mode: "perfect", useMaze: true, basicAttackFallback: true }
    },
    "1501": { ... }, "1503": { ... }, "1511": { ... }
  }
}
```

## 4. Result

```js
{
  ok: true,
  engineVersion: "1.0.0",
  summary: {
    totalDamage: 0, dps: 0, durationAV: 450, cycles: 3, hitCount: 0,
    byCharacter: [ { id: "1506", name: "银狼LV.999", damage: 0, share: 0 } ],
    byType: [ { type: "elation", label: "欢愉伤害", damage: 0 },
              { type: "normal",  label: "常规伤害", damage: 0 },
              { type: "true",    label: "真实伤害", damage: 0 } ]
  },
  timeline: [
    { seq: 1, av: 0, actorId: "1503", actor: "真珠", action: "秘技",
      description: "凝润珠光，复刻真迹：+20 好活当赏 / 2 充能",
      damage: 0,
      hits: [ { skillId: "150320", skillName: "渲染理性，解构欢愉", kind: "elation",
                multiplier: 0.5, joke: 20, elationDegree: 0.6, crit: true, damage: 0 } ],
      note: "" }
  ],
  resources: { series: [ { av: 0, joke: 0, hiddenScore: 0, fervor: 0, sp: 3 } ], final: { ... } },
  warnings: ["..."], assumptions: ["..."]
}
```

## 5. 约定

- 所有伤害为正数；`share` 为 0–1 小数。
- `timeline` 按 av 升序；同一 av 内按参演编号/固定优先级排序。
- 数字保留 2 位小数由 UI 负责格式化。
- 引擎不访问 DOM，不使用 Node 专有 API（保证可在浏览器内联运行）。
- 配置里出现的每个 `characters.<id>.stats.*` 字段都必须出现在 Schema 中，UI 只渲染 Schema 声明的字段。

---

# 追加 API（v1.1.0）：星魂与技能等级

## 新增全局对象成员

```js
window.HSR_ENGINE = {
  ENGINE_VERSION: "1.1.0",
  // ...原有成员...
  EIDOLON_SKILL_BONUS,   // { 角色ID: { 星魂等级: { 槽位: 加成 } } }，取自 E3/E5 原文
  SLOT_CAPS,             // { basic:10, skill:15, ult:15, talent:15, elationSkill:15, innate:2, maze:1 }
  SLOT_LABELS,           // { basic:'普攻', skill:'战技', ... }
  defaultSkillLevels(id),          // 某角色各槽位的默认基础等级（= 行迹节点上限）
  eidolonInfo(id, unlocked),       // 星魂一览
  skillLevelInfo(unit, innateLv),  // 技能等级一览（需要 unit 形状见下）
  characterInfo(id, cfg)           // UI 最常用：一次拿到星魂 + 技能等级
}
```

## characterInfo(id, cfg) 返回

```js
{
  id: "1503", name: "真珠", nameEn: "Pearl", element: "Ice", elementZh: "冰", role: "生存/辅助",
  eidolon: 3,                       // 当前配置的星魂等级
  innateLevel: 1,                   // 固有行迹等级（阿哈 2 魂 -> 2）
  eidolons: [
    { rank: 1, name: "珍珠，藏在海的留白处",
      desc: "队伍中「欢愉」命途角色数量等于2/3/4或以上时……",   // 站点原文
      type: "mechanic",             // "mechanic" | "skillLevel"
      skillEffect: null,            // 技能等级型星魂才有，如 "终结技 等级 +2，普攻 等级 +1，欢愉技 等级 +1"
      unlocked: true }              // rank <= 当前星魂等级
  ],
  skillLevels: [
    { slot: "ult", label: "终结技", level: 12, base: 10, cap: 15,
      skillIds: ["150303"], name: "鉴映灵魂的底色" }
  ]
}
```

## 新增/变更的 Config 字段

| 路径 | 类型 | 说明 |
|---|---|---|
| `characters.<id>.eidolon` | select 0–6 | **星魂解锁等级**；3/5 魂提升技能等级，其余为机制质变（schema 已给出每一级的选项标签） |
| `characters.<id>.skillLevels.<slot>` | number | 技能**基础**等级（不含星魂加成），默认 = 行迹节点上限：普攻 6、战技/终结技/天赋/欢愉技 10；星魂 3/5 的加成在此之上叠加，上限 普攻 10、其余 15 |
| `options.innateLevel` | number | undefined | 固有行迹等级；留空 = 自动（星神★阿哈 2 魂时为 2 级，否则 1 级） |

伤害实现说明：引擎按「实际等级 → 数据表参数」缩放 kit 中的数值（基准为数据表最高等级），因此调低技能等级或未解锁 3/5 魂会真实降低倍率。

---

# 追加 API（v1.2.0）：专属光锥

## 新增全局成员

```js
window.HSR_ENGINE = {
  ENGINE_VERSION: "1.2.0",
  LIGHTCONES,            // { 光锥ID: { name, passive, rarity, path, desc, levels:[[S1参数..S5]], stats:{hp,atk,def} } }
  SIGNATURE_LIGHTCONE,   // { 角色ID: 专属光锥ID }  -> 1506:23057 / 1501:23053 / 1503:23055 / 1511:23065
  resolveLightcone(avatarId, charCfg),   // -> { id, name, passive, desc, superimpose, params, stats } | null
  lightconeInfo(avatarId, cfg),          // 见下
  applyLightconeStats(unitLike, lc)      // 把光锥属性并入 stats 并返回加成明细
}
```

## characterInfo(id, cfg) 追加字段

```js
{
  // ...v1.1.0 字段...
  lightcone: {
    current: "23057",            // 当前装备的光锥 id；"none" 表示不装备
    currentSuperimpose: 1,
    options: [ {
      id: "23057", name: "欢迎来到银河城", passive: "稳赢",
      desc: "使装备者的速度提高18%，造成的欢愉伤害无视目标20%的防御力……",  // 站点原文
      rarity: 5, stats: { hp: 1164.2, atk: 476.3, def: 529.2 },   // 满级 80 级
      signature: true, equipped: true, superimpose: 1, params: [0.18, 0.2, 20, 3]
    }, { id: "none", name: "不带光锥", ... } ]
  },
  lightconeBonus: { hp, atk, def, defPct, critDmg, spdFlat, spdPct, totalSpd },  // 光锥带来的加成
  baseStats:  { atk, def, hp, spd, critRate, critDmg, elationDegree },  // 角色面板（含行迹，不含光锥）
  panelStats: { ...同结构 }                                            // 最终面板（已并入光锥）
}
```

## 新增/变更的 Config 字段

| 路径 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `characters.<id>.lightcone.enabled` | boolean | **true** | 是否装备专属光锥 |
| `characters.<id>.lightcone.id` | string | 专属光锥 ID | 目前仅支持专属光锥与其 id；填 "none" 等同不装备 |
| `characters.<id>.lightcone.superimpose` | select 1–5 | **1** | 光锥叠影等级，影响被动参数 |

注意：`characters.<id>.stats.*` 是**不含光锥**的角色面板，光锥属性在引擎内叠加（见 panelStats）。
