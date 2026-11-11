#!/usr/bin/env bash
# Reproducible fetch of nanoka.cc HSR data for the four target characters.
# Usage: bash scripts/fetch_nanoka.sh
set -euo pipefail

SITE="${SITE:-https://hsr.nanoka.cc}"
BASE="${BASE:-https://static.nanoka.cc/hsr/4.7}"   # CDN base discovered from the site's data-url attributes
OUT="${OUT:-data/nanoka/raw}"
LANGS="zh en"

mkdir -p "$OUT/support" "$OUT/detail" "$OUT/pages" "$OUT/lightcone"

echo "== site shell =="
curl -sSf "$SITE/" -o "$OUT/index.html"
for id in 1506 1501 1503 1511; do
  curl -sSf "$SITE/character/$id" -o "$OUT/pages/character_$id.html"
done
curl -sSf "$SITE/character" -o "$OUT/pages/character_list.html"

echo "== shared datasets =="
for f in character lightcone relicset monster; do
  curl -sSf "$BASE/$f.json" -o "$OUT/support/$f.json"
done
curl -sSf "$BASE/zh/item.json" -o "$OUT/support/zh_item.json"

echo "== per-character details =="
for id in 1506 1501 1503 1511; do
  for L in $LANGS; do
    curl -sSf "$BASE/$L/character/$id.json" -o "$OUT/detail/${id}_${L}.json"
  done
done

echo "== signature lightcones =="
# 23057 欢迎来到银河城（银狼LV.999）/ 23053 花花世界迷人眼（火花）
# 23055 献给明日的色彩（真珠）  / 23065 当第一声「阿哈」响起（星神★阿哈）
for id in 23057 23053 23055 23065; do
  for L in $LANGS; do
    curl -sSf "$BASE/$L/lightcone/$id.json" -o "$OUT/lightcone/${id}_${L}.json"
  done
done

echo "done -> $OUT"
