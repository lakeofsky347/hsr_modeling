# engine2 override API（给编写 engine2/overrides/ 的人）

> 状态：v2.1.2（由引擎负责人维护；API 变更会同步本文件）。v2.1.1：specials 字段名为 kind；新增 onBreak hook、_skipTurn、api.ultReady、hit.trigger 说明。
> v2.1.2：新增计时单位 api.addTimer/advanceTimer/setTimerSpd/removeTimer/getTimer + hooks.onTimer；api.features；api.skillOf(slot)；hit.joke / hit.ref / hit.finalMultiplier / hit.amplification。实现：engine2/sim.js（`hookApi` / `actionCandidates` / `applyDecision`）。

## 1. 注册

```js
// engine2/overrides/index.js
export var OVERRIDES = {
  '1102': {
    patchKit(kit, member) { /* 深拷贝后的 kit，可任意修改后 return */ return kit; },
    hooks: { onBattleStart, onTurnStart, onAction, onAnyAction, onHit, onEnemyTurn, actions, ultReady }
  }
};
```

- `patchKit` 在构建上下文前调用（simulate / computeStats / describeKit 都用 patch 后的 kit）。适合：修正 hit/effect、把条件 buff 改成常驻、增删 hits。
- 所有 hook 都是**纯同步函数**，参数只有一个 `api` 对象（见 `3）。

## 2. hooks

| hook | 调用时机 | 额外字段 | 返回值 |
|---|---|---|---|
| `onBattleStart(api)` | 开场，全部被动/开场效果挂载后 | — | — |
| `onTurnStart(api)` | 本角色回合开始（决策之前）。设 `api.unit.custom._skipTurn = true` 可跳过本回合（如“无法行动”状态） | — | — |
| `onAction(api)` | 本角色**每次施放技能**（普攻/战技/终结技/强化/欢愉技/忆灵/追加攻击）前后各一次 | `skill`（解析后技能）、`code`、`entry`（时间轴条目，可写 `entry.note`）、`phase: 'before'/'after'` | — |
| `onAnyAction(api)` | **任一**队员施放技能后，对每个定义了此 hook 的角色都调用（含施放者本人） | `actor`（施放者下标）、`skill`、`code`、`entry`、`isAttack`（该技能有伤害段） | — |
| `onHit(api)` | 本角色每段伤害结算时（含 DoT） | `hit`、`result: {per,total,targets}`、`dot?: true` | 数字 → 替换该段伤害 |
| `onEnemyTurn(api)` | 敌人回合（DoT 结算后） | — | — |
| `onTimer(api)` | 由本角色 `api.addTimer` 创建的计时单位到点（同 AV：我方 → 计时器 → 敌人） | `timer: {id, spd, name, nextAv, turns, data}` | — |
| `onBreak(api)` | 任一队员击破敌人弱点后，对每个定义了此 hook 的角色调用 | `breaker`（击破者下标）、`entry` | — |
| `actions(api)` | 本角色的决策点，生成候选动作 | `defaults: [{code,slot}]`（通用规则的默认候选）、`mode`（policy.mode） | 动作数组（替换默认候选）；undefined/空数组 = 用默认 |
| `ultReady(api)` | 判断本角色终结技是否可放 | `energyReady`（按能量判断的结果） | true/false 覆盖；undefined = 默认 |

## 3. api 对象

所有 hook 共用；`i` = 本角色在队伍中的下标（`api.index`）。

### 只读 / 上下文
- `api.state`：动态状态（纯 JSON，可深拷贝）。`api.ctx`：静态上下文（不要修改）。
- `api.index`、`api.member`（ctx.members[i]：`charId name element energyMax skills{slot→resolved} panel policy eidolon`）、`api.unit`（state.units[i]：`energy nextAv turns buffs spdCur counts custom`）。
- `api.stats(j?)`：战斗内属性（含 buff），默认本角色；返回 `{hp,atk,def,spd,critRate,critDmg,breakEffect,energyRegen,elation,..., bag}`。
- **注意**：在 onAction / onAnyAction 中 `api.skill` 被覆盖为当前施放的技能对象；任何时候都可用 `api.skillOf(slot)` 取本角色技能。
- `api.features`：引擎能力标记 `{hitJoke, hitRef, hitFinalMultiplier, hitAmplification, timers, onAnyAction, actions, specials, triggers}`（均为 true）。
- `api.skill(slot)`：本角色解析后的技能 `{id,slot,name,params,spCost,spGain,energyGain,toughness,hits,specials}`；`params` 已按等级（含星魂加级）取好。
- `api.eidolon`：星魂数（0..6）。`api.sp()`：当前战技点。`api.av()`：当前行动值时刻。
- `api.enemy()`：`state.enemy`（`toughness broken debuffs dots nextAv`）。`api.teamSize`。`api.findMember(charId)` → 下标或 -1。

### 自定义状态（必须是纯 JSON，beam search 会深拷贝）
- `api.custom` = `state.custom[charId]`（自动创建）——**角色私有计数器放这里**（层数、充能、形态标记…）。
- `api.shared` = `state.shared`（全队共享）。约定键：`joke`（笑点；若设置，欢愉伤害用它代替 options.teamJoke），其他键随意。
- `api.addShared(key, v)` → 新值（缺省 0 起加）。
- `api.unit.custom` 旧写法仍可用。

### 行动 / 伤害
- `api.cast(slotOrSkill, opts?)` → entry：完整流程施放本角色任意 slot 的技能（扣/回战技点、施放效果、onAction、伤害段、DoT 挂载、specials、削韧/击破、能量）。
  `opts`：`{ code, noHits, noSP, noEnergy, spCost }`。`slotOrSkill` 可为 slot 名（'enhancedBasic'…）或技能对象（可以是 `api.skill(x)` 的修改副本）。
- `api.deal(hit, note?, entry?)` → 伤害值：造成一段伤害。hit：`{scaling:'atk'|'hp'|'def'|'elation'|'break'|'true', mult, count, target:'single'|'aoe'|'adjacent'|'bounce', element, dmgType, extra?:{stat, mult}}`；
  缺省 scaling=atk、target=single、element=本角色、dmgType=skill。传 `entry` 则并入该时间轴条目，否则自动新建一条（action='custom'）。
  hit 额外可选：`joke`（欢愉伤害按此笑点计算，覆盖 shared.joke / teamJoke）、`ref`（scaling='true' 时的参照伤害值，缺省为本次行动此前伤害）、`finalMultiplier`（最终乘区）、`amplification`（欢愉增幅额外加值）、`additional:true`（附加伤害）、`fixedCrit:{rate,dmg}`。
- `api.dealAs(j, hit, note?, entry?)`：以队友 j 的面板结算并计入 j。
- `api.detonateDots(ratio, filter?)` → 伤害：立即结算敌人身上全部 DoT 的 ratio 倍（filter(dot) 可筛选，dot = `{owner, key, skillSlot, hitIdx}`），计入各 DoT 施放者。

### buff / 减益
- `api.addBuff(effect, target?)`：effect = `{key, stat, value, duration?(回合; null=常驻), maxStacks?, label?}`；value 为最终数值（0.2 = 20%）。
  target：`'self'`(默认) | `'team'` | `'allies'` | `'ally'` | `'enemy'` | 队员下标（数字）。同 key 叠层 + 刷新持续。
- `api.addDebuff(effect)` = addBuff(effect, 'enemy')。
- `api.removeBuff(key, target?)`；`api.getBuff(key, target?)` → `{stacks, remaining, value}` 或 null；`api.setStacks(key, n, target?)`。

### 资源 / 时间轴
- `api.gainEnergy(v, j?, {regen?:bool})`：加能量（默认本角色、不乘充能；regen:true 乘充能）。`api.setEnergy(v, j?)`。
- `api.gainSP(v)`：战技点（可为负，夹在 0..maxSP）。
- `api.advance(pct, j?)`：行动提前 pct（0.5 = 50%），默认本角色；回合内对自己在回合结束后结算。`j='enemy'` = 敌人行动延后。
- `api.extraTurn(j?)`：当前回合结束后立即让 j（默认本角色）再行动一次。
- `api.castUlt(j?)`：若可放则立即施放 j 的终结技（插队）。`api.ultReady(j?)`：是否可放。
- `api.addTimer({id, spd, name?, av?, data?})`：添加独立计时单位（首次到点 = av 或 当前 AV + 10000/spd，之后每 10000/spd）；同 id 替换。`api.advanceTimer(id, pct)` 行动提前；`api.setTimerSpd(id, spd)`；`api.removeTimer(id)`；`api.getTimer(id)`。到点时调用**添加者**的 `hooks.onTimer`。
- `api.log(entry)`：写一条时间轴（`{action, skillName, damage, note}`）。

## 4. actions：自定义候选动作（强化形态 / 欢愉技 / 专属资源）

`actions(api)` 返回动作数组；搜索器在这些候选中做 beam search。每个动作：

```js
{ code: 'A+', slot: 'enhancedBasic',  // 引用本角色任意 slot（basic/skill/ult/enhancedBasic/enhancedSkill/elation/memo/talent/other）
  spCost: 0,                           // 可选：覆盖战技点消耗（校验与扣除都用它）
  onUse(api, entry) { ... },           // 可选：施放完成后回调（改 api.custom、挂 buff、再 deal…）
  followUps: true }                    // 可选：之后是否触发通用追加攻击/忆灵（默认 true）
// 或完全自定义：
{ code: 'X', run(api) { ... } }        // 自己调用 api.cast / api.deal；回合结束由引擎处理
```

- `code` 写入 rotation（'A+' 'E+' 'X'…）与 `unit.counts`。
- 战技点不足（spCost > sp）的动作被引擎丢弃；全部丢弃时回退为普攻。
- 默认候选在 `api.defaults`（通常 `[{code:'E',slot:'skill'},{code:'A',slot:'basic'}]`），可 `return api.defaults.concat([...])`。
- 与 `api.extraTurn()` 组合实现"强化后额外回合"。

## 5. 专属终结技资源（character.ultResource = 'custom'）

- 无 override（或 override 未定义 ultReady）时：每 `policy.customUltEvery`（默认 3）个自身回合允许放一次终结技，写 warning。
- override 推荐：`api.custom` 维护计数器，`ultReady(api)` 返回 `api.custom.pts >= N`，在 `onAction`（`skill.slot==='ult' && phase==='after'`）中扣除。

## 6. 引擎已消费的数据字段（patchKit 可直接改）

- effect：`scaleStat/flatAdd/cap`（数值 = 施放者 scaleStat 面板 × value + flatAdd，封顶 cap）、`appliesTo`（只作用于某 dmgType）、`element`（resShred/dmgBonus 指定元素）。
- stat 键：`energyPct`（按能量上限比例回能，即时）、`amplification`（增幅区）、`dmgBonus_break / dmgBonus_superBreak`、`resShred_<Element>`、`weaknessBreakEfficiency`。
- hit：`extra{stat,param}`（复合倍率：mult×主属性 + params[extra.param]×extra.stat 面板）、`additional`（附加伤害）、`trigger:'onAllyAttack'`（队友每次攻击触发一次）。
- skill.specials：`[{kind:'dotDetonate', param, ratio}]`（施放后引爆敌人身上**全部** DoT，比例 ratio = params[param]，计入各 DoT 施放者）、`kind:'percentOfDamage'`（raw 含“真实伤害”时按本次行动伤害 × ratio 结算真实伤害）、`kind:'hpLostScaling'`（忽略）。
  **若 override 自行实现引爆等机制，请在 patchKit 中清空对应 skill.specials，否则会重复计算。**
- hit.trigger：`onAllyAttack`（施放后在队伍挂光环：持续 = 该技能 effects 的最大 duration，默认 2；holder 为技能 ally 目标或除自身外队友；holder 每次攻击触发一次；`triggerActor:'holder'` 时以攻击者面板结算并计入攻击者，否则计入施放者；`fixedCrit:{rate,dmg}` 固定暴击）、`onBreak`（任一队员击破时由该角色结算）、`onBreakRecover`（敌人尝试从击破恢复时结算并延长击破，阮•梅【残梅绽】）。这些段不会在施放时直接结算。
- effect.trigger `onAllyAttack`：任一队员攻击后触发（如知更鸟天赋回能）。stat `spMax`：战技点上限（被动，开场计入 ctx.battle.maxSP）。

## 7. 示例

```js
// 强化普攻：战技后进入"强化"2 次，强化期间只能用强化普攻
hooks: {
  actions(api) {
    if (api.custom.enhanced > 0)
      return [{ code: 'A+', slot: 'enhancedBasic', spCost: 0, onUse(a) { a.custom.enhanced -= 1; } }];
    return api.defaults.map(d => d.slot === 'skill' ? Object.assign({}, d, { onUse(a) { a.custom.enhanced = 2; } }) : d);
  }
}
// 专属资源终结技
hooks: {
  onAnyAction(api) { if (api.isAttack) api.custom.pts = Math.min(8, (api.custom.pts || 0) + 1); },
  ultReady(api) { return (api.custom.pts || 0) >= 4; },
  onAction(api) { if (api.phase === 'after' && api.skill.slot === 'ult') api.custom.pts -= 4; }
}
// 笑点
hooks: { onAction(api) { if (api.phase === 'after') api.addShared('joke', 1); } }
```
