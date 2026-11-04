# engine2 —— 通用队伍模拟引擎（v2）

纯 ESM、无依赖、浏览器/Node 通用。契约见 [docs/V2_DESIGN.md](../docs/V2_DESIGN.md)。
v1（engine/）保持不动；本目录的 formula.js 复制自 engine/formula.js 并追加击破/超击破公式。

## 模块

| 文件 | 内容 |
|---|---|
| index.js | §3 API 入口：以 data.gen.js + overrides 实例化 createEngine，逐个导出 |
| core.js | createEngine(DATA, OVERRIDES)：list*/default*/computeStats/describeKit/simulate/normalizeConfig（测试可注入 fixture） |
| formula.js | 伤害乘区（常规/欢愉/真实）+ breakHit / superBreakHit |
| stats.js | 局外面板 computeStatsWith、主/副词条数值、composeStats |
| effects.js | Effect → 数值实例（技能等级、星魂 3/5 加级、光锥叠影、行迹/星魂/遗器 params） |
| sim.js | 战斗状态机：buildContext（静态）/ initialState / advance / applyDecision / buildResult |
| search.js | beam search 自动排轴 + 基线（纯战技/纯普攻）比较；simulateWith |
| overrides/index.js | OVERRIDES：个别角色手写机制（示例：1102 希儿、1005 卡芙卡） |
| data.gen.js | 由 scripts/v2/build_kits.mjs 生成（非本模块手写） |

## 面板（computeStats）

1. 白值 = 角色 80 级 6 阶基础 + 光锥基础（hp/atk/def）；基础暴击 5%/暴伤 50%（kit 未给时）。
2. 加成袋 = traceStats + 遗器（头 705.6 生命、手 352.8 攻击、身/鞋/球/绳按 mainStats 取 5★+15 值；副词条 = 有效词条数 × 5★ 中档值：暴击 2.916%、暴伤 5.832%、攻/生/命中/抵抗 3.888%、防 4.86%、速度 2.3、击破 5.832%）
   + 「常驻效果」：trigger=passive、condition=null、target=self、duration=null、且为面板属性（hp/atk/def/spd±Pct、暴击、击破、充能、命中、抵抗、治疗、欢愉度、增伤）的效果，来源包括行迹额外能力、光锥被动（命途不符不生效）、2/4 件套、星魂。
   这类效果只折入面板，战斗中不再重复叠加。
3. 合成：hp/atk/def/spd = 白值 × (1+Σ%) + Σ固定值。
4. statOverrides 非 null 的键直接覆盖最终面板；战斗内 buff 以「覆盖值 + (含 buff 面板 − 局外面板)」叠加。
5. 遗器 set4 = 隧洞套（生效 2+4 件），set2 = 位面套（生效 2 件）。球 "dmgBonus" = 本元素增伤。

## 战斗模型（simulate）

- **时间轴**：每个单位 nextAv 初值 10000/spd；行动后 nextAv = 当前 AV + 10000/spd。速度变化时按比例重算剩余行动值。
  敌人也在轴上（DoT 结算、减益递减、击破恢复）。同 AV 时我方先于敌人、按队伍顺序。
  总时长 = firstCycleAV + (cycles−1)×avPerCycle；超出总时长的行动不执行；**结束前把已满的终结技放掉**。
- **战技点**：startSP/maxSP，行动时 sp = clamp(sp − spCost + spGain, 0, maxSP)；战技点不足时战技不可选。
- **能量**：初始 startEnergyPct × energyMax；每次行动/追加攻击获得 energyGain×(1+充能)，受击/击杀能量忽略；
  终结技需满能量，施放时清零再获得终结技自身 energyGain。ultMode=asap：任何时刻一满即插入；ultMode=auto：在每个决策点由搜索决定是否插入（可单个或全部）。
- **buff**：按 trigger 挂载——passive/battleStart/conditional 在开场挂载（常驻或按 duration）；技能自带效果只在施放该技能时挂载（先于该技能伤害生效，理想化）；
  其他来源 onSkill/onBasic/onUlt/onFua/onAttack 对应行动类型，onCast=任意行动。
  target：self / team / allies（除自身）/ ally（= 主 C：伤害估计最高者，若施放者本人即主 C 则取次高者；member.policy.buffTarget 可指定 charId 或下标）/ enemy(ies)（挂在敌人身上，对所有攻击者生效）。
  同 key 重复施加：叠层至 maxStacks 并刷新持续时间。
  **持续时间递减**：在持有者自身回合 **结束** 时 −1，施加所在的这一回合也计入（敌方减益在敌人回合结束时递减）。
  因此：回合内给自己挂的 1 回合增益只覆盖当次行动；回合外给队友挂的 1 回合增益覆盖该队友的下一次行动，并在那次行动结束时消退。
  若改成「回合开始时递减」，回合外刚挂上的 1 回合增益会在受益者动手前被减掉。
  例外：技能描述含「<施放者>每回合开始时持续回合数减1」的效果（effect.tickOnCaster）在**施放者回合开始**时递减（知更鸟/阮•梅/缇宝/同谐开拓者等）。
  即时类：actionAdvance（按比例提前；对自身回合内施放的在回合结束后结算；对敌人视为延后）、energyFlat（×(1+持有者充能)，描述含「固定恢复」或停云终结技/秘技的 fixedEnergy 除外）、energyPct（按上限比例，固定值）、spFlat。
- **条件效果**：默认理想满足；options.ignoreConditions=true 时丢弃所有 condition 非空的效果。
  trigger=conditional / passive 的效果在开场以**满层、常驻**挂载（忽略其 duration，理想化「条件一直满足」）。
- **战技点类效果**（spFlat）无论 target 是否为 team 都只加一次（全队共享）。
- buff 标签格式：「来源·名称 stat+数值」（如 `光锥·于夜色中 critDmg+12%×6`），原文保留在效果的 raw 字段。
- **伤害**：hit.mult = 技能等级 params[param]；count 为段数/弹射次数（或 countParam）。
  目标数：single/bounce/random = 1（弹射总段数由 count 表示）、aoe = enemy.count、adjacent = min(2, count−1)。
  增伤 = dmgBonus + dmgBonus_<元素> + dmgBonus_<dmgType>；易伤 = vuln + vuln_<dmgType> + extraVuln；
  减抗 = resShred + resPen + resPen_<元素> + extraResShred（有效抗性截断到 [-100%, 90%]）；减防 = defShred + extraDefShred，无视 = defIgnore + defIgnore_<dmgType>；暴击率/暴伤可带 _<dmgType> 后缀。
  critMode expected = 1+min(率,1)×伤；always = 1+伤；dmgType=dot 不暴击（除非 hit.fixedCrit / canCrit）。未击破韧性区 0.9。
  scaling：atk/hp/def → normalHit；elation → elationHit（笑点 = options.teamJoke，默认 10；增笑键 elationAmp）；
  break → 倍率 × 该角色元素击破伤害；true → 倍率 × 本次行动此前各段伤害之和。
- **韧性/击破**：单位沿用站点数据（普攻 30、精英 300 这一量级，即社区单位 ×3）。行动结束后若敌人弱点含角色元素，削韧 = (main+aoe)×(1+weaknessBreakEfficiency)。
  归零 → 击破伤害（元素系数 × 3767.5533 × (0.5+韧性上限/3/40) × (1+击破特攻) × 易伤×抗性×防御×0.9；aoe 削韧时 × 敌人数），敌人行动延后 25%；
  敌人下一个回合跳过并恢复满韧性。alwaysBroken 则全程击破区 = 1；allowBreak=false 不削韧。
  超击破：敌人处于击破且攻击者 superBreak>0 时，按削韧量结算（易伤含 vuln_break/vuln_superBreak，无视防御含 defIgnore_break/defIgnore_superBreak）。
  弱点击破效率上限 300%。「击破弱点时」触发的额外击破伤害（阮•梅天赋）在敌人进入击破后结算，韧性区 1.0。
- **追加攻击**：天赋（slot talent/other）中 dmgType=fua 的 hit，每个自身回合行动后触发 policy.fuaPerTurn 次（默认 1，0 = 关闭），获得天赋 energyGain。
- **DoT**：dmgType=dot 的 hit 施放时挂到敌人身上（同 key 刷新），持续 hit.duration||2 次敌人回合，在敌人回合开始按施放者**当前**面板结算。
- **忆灵**：memosprite 的第一个带伤害段的技能随主角色每个回合一起出手（使用主角色面板），计入 memo。
- **强化普攻/战技、欢愉技**：通用引擎不自动使用（机制因人而异），需 override 通过 hooks.actions 提供（动作可引用任意 slot，见 OVERRIDE_API.md §4）；会写入 warnings。
- **转化类 buff**（effect.scaleStat/flatAdd/cap）：挂载时按施放者当时战斗面板计算数值 = 面板[scaleStat] × value + flatAdd，封顶 cap（快照，不随施放者后续面板变化）；此类效果不折入局外面板。
- **appliesTo / element**：effect.appliesTo='fua' 等 → 键变为 `<stat>_<dmgType>`（critRate/critDmg/dmgBonus/vuln/defIgnore/resPen/amplification/defShred）；effect.element → `<stat>_<Element>`（resShred/resPen/dmgBonus/vuln）。
- **新 stat 键**：energyPct（按能量上限比例回能，即时）、amplification（欢愉伤害增幅区，含 amplification_elation / elationAmp）、dmgBonus_break / dmgBonus_superBreak（击破/超击破伤害 ×(1+值)）、resShred_<Element>、weaknessBreakEfficiency、spMax（战技点上限，被动，开场计入）。敌人身上的 critRate/critDmg（如砂金【惊惶】）对所有攻击者生效。
- **复合倍率**：hit.extra{stat,param[,capParam|cap]} → 倍率 = params[param] + params[extra.param] × min(面板[extra.stat], 上限)（如流萤 (0.2×min(击破特攻,360%)+200%)×攻击力）。
- **触发式伤害段**：hit.trigger='onAllyAttack' 施放后挂队伍光环（持续 = 技能 effects 最大 duration，默认 2；ally 目标技能→该队友，否则除自身外队友），holder 每次攻击（有伤害段的行动/追加攻击）触发 1 次；triggerActor='holder' 以攻击者面板结算并计入攻击者（停云【赐福】），否则计入施放者（知更鸟【协奏】）；fixedCrit 固定暴击。
  'onBreak'：任一队员击破时结算（阮•梅天赋）；'onBreakRecover'：敌人尝试从击破恢复时结算、并延长击破 (10%+20%×击破特攻) 行动值（阮•梅【残梅绽】，每次击破一次）。effect.trigger='onAllyAttack'：任一队员攻击后触发（知更鸟天赋回能）。
- **skill.specials**：dotDetonate → 施放后敌人身上全部 DoT 按 ratio 立即结算一次（计入各 DoT 施放者）；percentOfDamage（真实伤害类）→ 本次行动伤害 × ratio 的真实伤害；hpLostScaling 忽略。
- **专属终结技资源**（character.ultResource='custom'）：override 未提供 hooks.ultReady 时，按每 policy.customUltEvery（默认 3）个自身回合允许释放一次近似，写 warning。
- **战技点上限**：Result.maxSP 给出含队伍效果（如花火天赋 +2）的实际上限。
- 多敌人：所有敌人视为相同；只追踪主目标一条韧性条。

## 自动排轴（search.js）

决策点 = 每个角色回合：候选动作由 policy.mode 决定（auto：战技/普攻；skillFirst；basicOnly；override.actions 可替换），
与 ultMode=auto 角色的终结技插入组合做笛卡尔积。beam search：每步把前沿每个状态按全部选项展开，
去重后按「已造成伤害 + w×(战技点×spValue + Σ能量进度×终结技估计伤害×0.8)」排序（w = 剩余 AV / 每轮 AV，截断到 [0,1]：资源在最后一轮内线性贬值），保留 options.beamWidth（默认 24）个。
spValue = 队内（战技估计伤害 − 普攻估计伤害）最大值×0.9（下限为主 C 普攻 30%）。
若存在 ultMode=auto 的成员，再以「全部终结技 asap」额外跑一遍 beam（终结技决策只发生在角色回合，asap 能在任意时刻插入，二者互补）。
最后与「auto 成员全部纯战技优先」「全部纯普攻」两条基线取最大（保证不劣于基线）。Result.search 给出 strategy/expanded/ms/baseline_*。
所有成员非 auto 时直接按策略贪心模拟。

## overrides

**完整 API 与编写指南见 [OVERRIDE_API.md](./OVERRIDE_API.md)**（hooks：onBattleStart / onTurnStart / onAction / onAnyAction / onHit / onBreak / onEnemyTurn / actions / ultReady；
api：custom（= state.custom[charId]）、shared（团队共享资源，如 joke 笑点）、cast / deal / dealAs / detonateDots / addBuff(effect, target) / removeBuff / getBuff / setStacks /
gainEnergy / setEnergy / gainSP / advance / extraTurn / castUlt / ultReady / log）。

```js
OVERRIDES[charId] = {
  patchKit(kit, member) { ...; return kit },      // 构建上下文前修改 kit（深拷贝，安全）
  hooks: {
    actions(api) {                                // 决策点候选动作；动作可引用任意 slot
      if (api.custom.enhanced) return [{ code: 'A+', slot: 'enhancedBasic', spCost: 0, onUse(a) { a.custom.enhanced = 0; } }];
      return api.defaults;                        // [{code:'E',slot:'skill'},{code:'A',slot:'basic'}]
    },
    ultReady(api) { return (api.custom.pts || 0) >= 4; },
    onAction(api) { if (api.phase === 'after') api.addShared('joke', 1); }
  }
}
```
编写要点：
1. 状态只写 api.custom / api.shared / unit.custom（纯 JSON；beam search 会深拷贝，并把 custom/shared 纳入状态去重键）。
2. 自行实现了引爆/附加伤害等机制时，在 patchKit 中删掉对应 specials / hits，避免与通用逻辑重复。
3. hooks 为同步纯函数；在 onAction/onAnyAction 里调用 api.cast 会递归触发 hooks（引擎限制嵌套深度 3）。
4. 示例：1102 希儿（增幅状态常驻、忽略击杀额外回合）、1005 卡芙卡。

## 已知简化

- 不模拟敌人攻击/受击能量/治疗/护盾/击杀；敌人 HP 仅展示。
- 击破附带的 DoT（裂伤/灼烧等）与纠缠/禁锢额外延后未计。
- 施放效果先于该技能伤害生效（理想化）。
- 转化类 buff 为挂载时快照；onAllyAttack 光环按施放者/持有者回合递减（知更鸟【协奏】按 2 回合近似）。
- 停云【赐福】攻击力按上限（停云攻击力 25%）近似；砂金秘技取 36% 档（数据修正见 build_kits.mjs PATCHES）。
- 多敌人共享一条韧性；DoT 以挂载时的 hit.target 计目标数。
- 行迹默认全部点亮；技能等级默认行迹满级（普攻 6、其余 10）＋星魂加成（受 params 长度限制）。
