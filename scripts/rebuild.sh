#!/bin/bash
# CC Genius - 一键重建 + 重启 production server
set -e

cd "$(dirname "$0")/.."
echo "🔨 Building..."
npx next build

echo "🔄 Restarting server on port 3088..."
lsof -i :3088 -t 2>/dev/null | xargs kill 2>/dev/null || true
sleep 1

nohup npx next start --port 3088 --hostname 0.0.0.0 > /tmp/cc-genius.log 2>&1 &
echo "✅ CC Genius running at:"
echo "   Mac:  http://localhost:3088"
echo "   iPad: http://100.123.101.117:3088"
echo "   Logs: /tmp/cc-genius.log"
