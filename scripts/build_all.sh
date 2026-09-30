#!/usr/bin/env bash
# 全流程：抓取 -> 生成引擎数据 -> 归一化 -> 报告 -> 测试 -> 打包 dist/
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== 1/8 抓取站点数据（角色详情 + 专属光锥） =="
bash scripts/fetch_nanoka.sh

echo "== 2/8 生成引擎数据（技能等级表） =="
node scripts/gen_skill_tables.mjs

echo "== 3/8 生成引擎数据（专属光锥 + 遗器） =="
node scripts/gen_lightcone_data.mjs
node scripts/gen_relic_data.mjs

echo "== 4/8 归一化角色数据 =="
python3 scripts/nanoka_extract.py

echo "== 5/8 合并机制解读到报告 =="
python3 scripts/assemble_reports.py

echo "== 6/8 测试（公式 / 数据一致性 / 星魂 / 光锥 / 遗器 / 模拟） =="
node --test tests/

echo "== 7/8 打包模拟器 =="
node scripts/build-ui.mjs

echo "== 8/8 生成中等练度预估报告 =="
node scripts/gen_report_html.mjs

echo
echo "完成，产物："
ls -1 dist reports