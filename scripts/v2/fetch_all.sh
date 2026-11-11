#!/usr/bin/env bash
# V2 数据抓取：全部角色 / 光锥 / 敌人 zh 详情 → data/v2/raw/
# 用法：bash scripts/v2/fetch_all.sh   （可设 BASE / OUT / JOBS 覆盖）
set -uo pipefail
BASE="${BASE:-https://static.nanoka.cc/hsr/4.7}"
OUT="${OUT:-data/v2/raw}"
JOBS="${JOBS:-8}"
FORCE="${FORCE:-0}"
mkdir -p "$OUT/support" "$OUT/character" "$OUT/lightcone" "$OUT/monster"
LOG="$OUT/fetch.log"; : > "$LOG"
export BASE OUT LOG FORCE

fetch() { # $1=url $2=dest ; 重试 4 次；404 记录并跳过
  local url="$1" dest="$2" code i
  if [ "$FORCE" != "1" ] && [ -s "$dest" ]; then return 0; fi
  for i in 1 2 3 4; do
    code=$(curl -sS -L --max-time 60 -o "$dest.tmp" -w '%{http_code}' "$url" 2>/dev/null) || code="000"
    if [ "$code" = "200" ]; then mv "$dest.tmp" "$dest"; return 0; fi
    rm -f "$dest.tmp"
    if [ "$code" = "404" ]; then echo "404 $url" >> "$LOG"; return 0; fi
    sleep $((i*2))
  done
  echo "FAIL($code) $url" >> "$LOG"; return 0
}
export -f fetch

echo "== support =="
for f in character lightcone relicset monster; do
  FORCE=1 fetch "$BASE/$f.json" "$OUT/support/$f.json"
done

extract_ids() { # $1=file $2=mode
  node -e '
    const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const m=process.argv[2];
    const out=[];
    if(m==="monster"){for(const [k,v] of Object.entries(d)){const c=(v&&v.child)||[];const first=c.length?(typeof c[0]==="object"?(c[0].id??c[0]):c[0]):k;out.push(String(first));}}
    else out.push(...Object.keys(d));
    console.log([...new Set(out)].join("\n"));' "$1" "$2"
}

run() { # $1=kind $2=idsfile
  local kind="$1"
  sed '/^$/d' "$2" | xargs -P "$JOBS" -I{} bash -c 'fetch "$BASE/zh/'"$kind"'/{}.json" "$OUT/'"$kind"'/{}.json"'
}

for kind in character lightcone monster; do
  echo "== $kind =="
  extract_ids "$OUT/support/$kind.json" "$kind" > "$OUT/$kind.ids"
  echo "  ids: $(wc -l < "$OUT/$kind.ids")"
  run "$kind" "$OUT/$kind.ids"
  echo "  files: $(ls "$OUT/$kind" | wc -l)"
done
echo "== log =="; cat "$LOG"
echo "done -> $OUT"
