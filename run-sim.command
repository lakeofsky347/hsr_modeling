#!/bin/bash
# 双击即可运行的命令行模拟器（macOS .command 文件）
cd "$(dirname "$0")" || exit 1
NODE="$(command -v node || true)"
if [ -z "$NODE" ]; then
  for p in /opt/homebrew/bin/node /usr/local/bin/node "$HOME/.nvm/versions/node"/*/bin/node; do
    [ -x "$p" ] && NODE="$p" && break
  done
fi
if [ -z "$NODE" ]; then
  echo "未找到 node，请先安装 Node.js 18+（https://nodejs.org）"
  read -n 1 -s -r -p "按任意键关闭..."
  exit 1
fi
echo "使用 node: $NODE"
"$NODE" dist/hsr-sim.mjs "$@"
echo
read -n 1 -s -r -p "按任意键关闭..."
