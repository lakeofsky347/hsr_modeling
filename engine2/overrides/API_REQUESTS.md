# override API 需求（机制子智能体 → 引擎子智能体）

对照 OVERRIDE_API.md v2.1 后仍缺的能力（按优先级）。我按下列「期望签名」编写 override，并对缺失时做了降级（typeof 检查）。

1. **每段欢愉伤害自带笑点**：`api.deal({scaling:'elation', mult, joke: 37, ...})` —— hit.joke 存在时覆盖 shared.joke / options.teamJoke。
   原因：欢愉伤害按「好活当赏（每个角色各自的计入笑点）」结算，不是全队同一个值；欢愉技按 好活当赏+当前笑点。
   同时希望 hit 支持 `finalMultiplier`（银狼强化普攻每 60 隐藏分 +15%）与 `amplification`（单段增笑，银狼 E6）。
2. **自定义时间轴单位 / 定时器**：阿哈时刻是独立行动单位（速度 = 阿哈基础速度 + 队伍速度/5,/10,/20,/40），与角色、敌人一起排序。
   期望：`api.addTimer({ id:'ahaMoment', spd, nextAv? })`（存 state.shared.timers，纯 JSON），到点时对 owner 调用 `hooks.onTimer(api, {timer})`，之后自动 nextAv += 10000/spd；`api.advanceTimer(id, pct)`（阿哈 E6 行动提前 20%）。
   降级：若无此能力，我在 onAnyAction / onEnemyTurn 中检查 `api.av() >= shared.ahaNext` 补跑（时间精度略差）。
3. **onAnyTurnStart(api, {actor})**：任一队员回合开始（真珠「感知容差」队友回合开始 +5 好活当赏；阿哈令使持有者回合开始 +1 愿力）。降级：用 onAnyAction 近似。
4. **search.signature 包含 state.custom / state.shared**（否则仅自定义资源不同的状态被去重误删）。
5. `api.cast` 的 opts 支持 `hitsOverride` 或允许传修改后的技能对象（文档已写「可以是 api.skill(x) 的修改副本」——确认 hits 中可带 joke/finalMultiplier）。6. **真实伤害指定参照值**：`api.deal({scaling:'true', mult: 0.2, ref: 123456})` —— hit.ref 存在时用它代替 refDamage（阿哈欢愉技按「本次阿哈时刻伤害总和」×20% 造成真伤；银狼盲盒超超超大剑同理）。
7. hitDamage 里 elation 分支：`var joke = h.joke != null ? h.joke : (shared.joke ?? teamJoke)`；`amplification` 再加 `h.amplification`；`per *= h.finalMultiplier ?? 1`。
