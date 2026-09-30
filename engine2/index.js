// engine2/index.js —— v2 通用引擎入口（§3 API）。数据来自 ./data.gen.js（由 scripts/v2/build_kits.mjs 生成）
import { DATA as GEN } from './data.gen.js';
import { OVERRIDES } from './overrides/index.js';
import { createEngine, ENGINE2_VERSION as V } from './core.js';

var E = createEngine(GEN, OVERRIDES);

export var ENGINE2_VERSION = V;
export var DATA = E.DATA;
export var listCharacters = E.listCharacters;
export var listLightcones = E.listLightcones;
export var listRelicSets = E.listRelicSets;
export var listMonsters = E.listMonsters;
export var resolveMonsterId = E.resolveMonsterId;
export var defaultMember = E.defaultMember;
export var defaultEnemy = E.defaultEnemy;
export var defaultConfig = E.defaultConfig;
export var computeStats = E.computeStats;
export var describeKit = E.describeKit;
export var simulate = E.simulate;
export var normalizeConfig = E.normalizeConfig;
export { createEngine, OVERRIDES };
