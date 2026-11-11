# nanoka.cc HSR 数据说明（版本 4.7）

本目录保存从 [hsr.nanoka.cc](https://hsr.nanoka.cc) 抓取的《崩坏：星穹铁道》数据，重点覆盖四个「欢愉」命途角色：
银狼LV.999（1506）、火花（1501）、真珠（1503）、星神★阿哈（1511）。

## 一、站点结构与数据源

站点是 SvelteKit 单页应用，页面本身不含数据，服务端渲染时把数据以
data-url 属性内联进 HTML，真实数据托管在静态 CDN：

| 端点 | 说明 |
|---|---|
| https://hsr.nanoka.cc/ | 首页（内联 character / lightcone / relicset / monster / item 全量数据） |
| https://hsr.nanoka.cc/character | 角色列表路由（另有 /lightcone、/relic、/item、/monster） |
| https://hsr.nanoka.cc/character/{id} | 角色详情页（内联该角色详情 JSON 的 data-url） |
| https://static.nanoka.cc/hsr/4.6.51/character.json | 角色基础信息（含 zh / en / ja / ko 名称、命途、属性、实装时间） |
| https://static.nanoka.cc/hsr/4.6.51/lightcone.json | 光锥（id、名称、稀有度、命途、满级攻击力） |
| https://static.nanoka.cc/hsr/4.6.51/relicset.json | 遗器套装（2 / 4 件套效果，带参数） |
| https://static.nanoka.cc/hsr/4.6.51/monster.json | 敌人（id、弱点、抗性、分级） |
| https://static.nanoka.cc/hsr/4.6.51/{zh,en,ko,ja}/item.json | 道具（本地化，用于材料名称反查） |
| https://static.nanoka.cc/hsr/4.6.51/{lang}/character/{id}.json | **角色详情**（技能、星魂、行迹、属性、推荐配置），lang ∈ zh / en / ko / ja |

CDN 版本号（4.6.51）写死在各页面 HTML 的 data-url 中，游戏更新后会变化；
scripts/fetch_nanoka.sh 顶部的 BASE 变量可按需替换。

## 二、目录结构

| 路径 | 内容 |
|---|---|
| raw/index.html | 首页快照（含 5 段内联全量数据） |
| raw/pages/character_{id}.html | 4 个角色详情页快照 |
| raw/detail/{id}_{zh,en}.json | 4 个角色的中英文详情数据（本项目的核心数据源） |
| raw/support/*.json | 共享数据集（character / lightcone / relicset / monster / zh_item） |
| normalized/{id}_{slug}.json | 归一化数据（占位符已代入、名称已反查，供程序直接消费） |
| index.json | 四角色索引（名称、命途、属性、星级、实装日期、技能数） |

## 三、角色详情 JSON 字段

| 字段 | 含义 |
|---|---|
| name / desc | 角色名 / 简介 |
| rarity | CombatPowerAvatarRarityType5 → 5 星 |
| base_type / damage_type | 命途 / 战斗属性（Elation = 欢愉） |
| sp_need | 站点原字段。银狼LV.999 = 60（开大所需隐藏分门槛），星神★阿哈 = 8（愿力上限），火花 = 160，真珠 = 180（后两者为能量上限） |
| stats | 突破阶段 0–6；每阶段含 attack_base / attack_add / hp_base / hp_add / defence_base / defence_add / speed_base / critical_chance / critical_damage / base_aggro / cost（突破材料）。**阶段满级属性 = base + add × (等级上限 − 1)** |
| skills | 技能字典。type_name（普攻 / 战技 / 终结技 / 天赋 / 秘技 / 欢愉技 / 固有行迹）、type、tag、show_stance_list（削韧）、bp_need / bp_add（战技点）、level（1..N 级 param_list）、elation_priority_value（欢愉技优先级）、extra（名词解释） |
| ranks | 星魂 1–6（名称、描述、param_list） |
| skill_trees | 行迹节点。point_type：1 = 属性加成，2 = 技能升级，3 = 额外能力，4 = 欢愉技，6 = 专属行迹 |
| unique | 角色专属机制（如银狼LV.999 的「999 安全卫士」、阿哈的「阿哈时刻在」） |
| enhanced / memosprite | 强化形态 / 忆灵（四人均为空） |
| relics / lightcones / teams | 官方推荐遗器、光锥 id、配队 |

### 削韧字段 show_stance_list

数组顺序经已知角色（姬子、卡芙卡、希露瓦、杰帕德等）反推为
**[主目标, 全体, 相邻]**：群攻技能取中间值（如姬子终结技 = [0, 60, 0]），
扩散技能取首尾（如姬子战技 = [60, 0, 30]）。

### 描述文本占位符规则

desc / point_desc 等字段中的 #N[fmt] 占位符，按同等级 param_list 的第 N 个值代入：

| 写法 | 含义 | 示例 |
|---|---|---|
| #1[i]% | 参数 × 100，取整后加 % | 1.4 → 140% |
| #1[f1]% / #1[f2]% | 参数 × 100，保留 1 / 2 位小数 | 0.005 → 0.50% |
| #1[i] | 参数原值取整（不计百分比） | 5 → 5 |
| #1[f1] | 参数原值保留 1 位小数（多为系数） | 0.6 → 0.6（如「0.6 × 欢愉度」） |

标记（unbreak / u / i / color / RUBY）在归一化时已清除。

## 四、数据校验

1. 属性公式校验：银狼（1006）Lv.80 = 攻 640.3 / 生 1047.8 / 防 460.8，三月七（1001）Lv.80 = 攻 511.6 / 生 1058.4 / 防 573.3，与公开资料一致。
2. 占位符校验：四角色全部 desc 占位符均能在对应等级 param_list 中取到值，无缺失。
3. 机制文本校验：scripts/verify_digest_numbers.py 将报告中的每个数字回查原始 JSON，未命中项均为派生值（如 112.5% 由 1.125 换算、+18.7% 为行迹属性节点求和）或队友 id。

## 五、已知缺口

- 真珠、星神★阿哈的 character.json 中无 release 时间（未标注实装日期）。
- 星神★阿哈的 teams 为空，站点未给推荐配队。
- 银狼LV.999 的盲盒变体技能（150610 / 150612 / 150618）desc 为 null、param_list 为空，仅有简述。
- 火花的【阿哈时刻】触发周期、笑点上限在数据中未定义。

## 六、复现

    bash scripts/fetch_nanoka.sh        # 抓取 raw/
    python3 scripts/nanoka_extract.py   # 生成 normalized/ 与 reports/ 数据表
    python3 scripts/assemble_reports.py # 合入机制解读
    # 或一步：bash scripts/build_all.sh
