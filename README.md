# hsr_modeling — 星穹铁道伤害建模与模拟器

## v3.5 发布站（2026-10-13，计算口径 hsr-calc-3.4.1）

可部署的静态站在 **[dist/skylake/hsr/](dist/skylake/hsr/index.html)**（对应发布包 `sim-hsr-20261013.zip` 里的 `hsr/`）。数据版本是 4.7（nanoka `static.nanoka.cc/hsr/4.7`，对照 DimbreathBot `fe44559`）。希儿仍用改版表，欢愉技默认不再叠【好活当赏】。说明见 [site/README-hsr.md](site/README-hsr.md)。

本地打开（`file://` 不能拉 `data/hsr.json`）：

    npm run build:skylake
    python3 -m http.server -d dist/skylake/hsr 8765
    # 浏览器打开 http://127.0.0.1:8765/

主题、头像和从发布包收回的页面胶水在 `site/`（`assets/`、`recovered/`）。`ui2/app.html` 仍是页面底稿；v3.2 之后的桥、分块加载和分享链接是构建时套上去的，因为原来的 `pipeline/` 不在这个仓库里。下面的 V2 单文件页面和 V1 欢愉四人模拟器保持原样，引擎与数据已对齐到这一版。

## ★ V2：通用队伍模拟器（全角色库 · 自定义队伍/敌人 · 自动排轴）

基于 [hsr.nanoka.cc](https://hsr.nanoka.cc)（CDN 数据 4.6.51）**全量数据**：99 名角色、172 件光锥、64 套遗器、2779 个敌人。
用户自选 1–4 名角色与配装、自选或自定义敌人，引擎用 beam search 自动排轴，结算理想化伤害（期望暴击 / 必定暴击）。

| 交付物 | 用法 |
|---|---|
| **[dist/hsr-sim-v2.html](dist/hsr-sim-v2.html)** | 双击用浏览器打开（离线、零依赖）。左侧编辑队伍、敌人和战斗设置，右侧实时显示总伤害、每轮伤害、角色占比、伤害类型、自动排轴序列和完整时间轴 |
| **[dist/hsr-sim-v2.mjs](dist/hsr-sim-v2.mjs)** | 单文件命令行：`node dist/hsr-sim-v2.mjs --team 1005,1307,1303,1217 --enemy 1005010 --cycles 5 --timeline` |

- 用法、建模假设和局限见 **[docs/SIMULATOR_V2.md](docs/SIMULATOR_V2.md)**；设计契约见 [docs/V2_DESIGN.md](docs/V2_DESIGN.md)；引擎说明见 [engine2/README.md](engine2/README.md)；手写机制见 [engine2/overrides/README.md](engine2/overrides/README.md)
- 复现：`bash scripts/v2/fetch_all.sh`（抓取）→ `node scripts/v2/build_kits.mjs`（解析）→ `node scripts/v2/build.mjs`（打包）→ `node --test tests/v2/`（58 项测试）

以下为 V1（欢愉四人专用模拟器）说明，保持不变。

---

# V1 — 欢愉四人队数据 + 完美轴伤害模拟

从 [hsr.nanoka.cc](https://hsr.nanoka.cc)（数据版本 4.6.51）抓取四个角色的完整数据，并在此基础上实现**可手动调参、按完美轴模拟、输出理想伤害**的可执行模拟器。

## 一、可执行文件（模拟器）

| 交付物 | 用法 |
|---|---|
| **[dist/hsr-team-sim.html](dist/hsr-team-sim.html)** | **双击用浏览器打开**。左侧拖滑块/填数值调参（全局 + 四个角色），右侧实时给出总伤害、DPS、角色占比、伤害类型拆分、行动时间轴与资源曲线。零依赖、可离线。 |
| **[dist/hsr-sim.mjs](dist/hsr-sim.mjs)** | 单文件命令行模拟器：`node dist/hsr-sim.mjs --cycles 5 --set characters.1506.stats.spd=160` |
| **[run-sim.command](run-sim.command)** | macOS 双击运行命令行版 |
| **[config.example.json](config.example.json)** | 命令行用的配置示例：`node dist/hsr-sim.mjs --config config.example.json` |

默认配置：3 轮（350 行动值）/ 80 级有弱点 BOSS / **全员 2 星魂 + 专属光锥（叠影 1）+ 站点推荐遗器（主词条 + 28 条有效副词条）** / 技能等级取行迹上限。结果：**总伤害 30,824,150，每轮 10,274,717**。

**专属光锥、遗器、星魂、技能等级均已建模**：光锥与遗器共用一套面板结算（先加固定值再乘百分比），遗器含主词条 + 副词条（按有效词条数与站点优先级折算）+ 2/4 件套机制；星魂 0–6 可调，3/5 魂按数据表逐级缩放技能倍率；固有行迹在阿哈 2 魂时升为 2 级。

**[reports/中等练度输出预估.html](reports/中等练度输出预估.html)**：调研三个已登场角色的社区配装共识、据此推断尚未登场的星神★阿哈，给出理想状态下的输出预估。

| 场景（3 轮，全员 2 魂） | 总伤害 | 相对裸装 |
|---|---|---|
| 裸装（无光锥 / 无遗器） | 2,566,177 | ×1.00 |
| 仅专属光锥 S1 | 7,758,313 | ×3.02 |
| + 遗器主词条 | 18,757,974 | ×7.31 |
| 中等偏下（20 词条） | 28,221,424 | ×11.00 |
| **★ 中等练度（28 词条，见报告）** | **30,824,150** | ×12.01 |
| 高等练度（32 词条 + S5） | 56,852,184 | ×22.15 |
| 满星魂 E6 | 113,976,432 | ×44.41 |

**星魂与技能等级同样完整建模**：每个角色都有 0–6 魂选择器 + 星魂列表（名称、原文效果、解锁状态）与技能等级表（基础等级 → 星魂加成后等级 / 上限）。

| 参考配置（3 轮） | 总伤害 | 每轮 |
|---|---|---|
| 不带光锥 | 1,300,913 | 433,638 |
| **专属光锥 S1（默认）** | **3,735,580** | 1,245,193 |
| 专属光锥 S5 | 6,423,288 | 2,141,096 |
| 专属光锥 + 星魂 E3 | 8,100,444 | 2,700,148 |
| 专属光锥 + 星魂 E6 | 30,458,009 | 10,152,670 |

完整使用说明与建模细节见 **[docs/SIMULATOR.md](docs/SIMULATOR.md)**。

## 二、角色数据与机制报告

| 角色 | ID | 命途 / 属性 | 报告 |
|---|---|---|---|
| 银狼LV.999（Silver Wolf LV.999） | 1506 | 欢愉 / 虚数 | [reports/1506_silver_wolf_lv999.md](reports/1506_silver_wolf_lv999.md) |
| 火花（Sparxie） | 1501 | 欢愉 / 火 | [reports/1501_sparxie.md](reports/1501_sparxie.md) |
| 真珠（Pearl） | 1503 | 欢愉 / 冰 | [reports/1503_pearl.md](reports/1503_pearl.md) |
| 星神★阿哈（Aeon ★ Aha） | 1511 | 欢愉 / 量子 | [reports/1511_aeon_aha.md](reports/1511_aeon_aha.md) |

先读 **[reports/00_总览.md](reports/00_总览.md)**：四角色对比、欢愉体系共同机制（笑点 / 欢愉伤害 / 好活当赏 / 阿哈时刻 / 命途升格）、资源系统对比、满级倍率速查。

数据说明（端点、字段、占位符规则）见 [data/nanoka/README.md](data/nanoka/README.md)。

## 三、目录

    dist/        可执行产物（V1/V2 单文件，以及 dist/skylake/hsr 发布站）
    site/        v3.5 发布站的主题资源、分块清单，以及从构建包收回的页面胶水
    engine/      模拟器内核（伤害乘区、角色数据、时间轴、参数 schema）
    ui/          交互界面源码
    bin/         命令行入口
    tests/       76 项自动化测试（公式回归 + 数据一致性 + 模拟冒烟）
    docs/        引擎 API 契约、模拟器说明
    data/nanoka/ 站点抓取数据（原始 + 归一化）
    reports/     角色数据表 + 机制解读
    scripts/     抓取 / 归一化 / 打包脚本

## 四、复现与校验

    bash scripts/build_all.sh     # 抓数据 + 归一化 + 报告 + 测试 + 打包 dist/
    npm test                      # 仅测试

其中 `tests/consistency.test.mjs` 会把引擎里写死的每个倍率回查到抓取数据，`tests/formula.test.mjs` 用公开实测样例（3633.83）回归欢愉伤害公式。

## 许可证

- 代码：[MIT](LICENSE)，Copyright (c) 2026 lakeofsky347
- 游戏数据、角色图片等游戏素材的版权归米哈游（miHoYo / HoYoverse）所有，不在 MIT 许可范围内。本仓库收录它们仅用于非商业的同人研究，权利方提出要求即删除
- 模拟结果基于社区数据整理，仅供娱乐参考，不代表游戏内实际数值
