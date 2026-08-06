#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "============================================"
echo "  MyAgent 一键启动"
echo "  - 后端 http://localhost:8000"
echo "  - 前端 http://localhost:5173（浏览器打开这个）"
echo "============================================"

echo "[1/2] 启动后端 (FastAPI) ..."
(cd backend && exec venv/bin/python run.py) &
BACK_PID=$!

echo "[2/2] 启动前端 (Vite) ..."
(cd frontend && npm run dev)

echo "前端已退出，正在停止后端..."
kill $BACK_PID 2>/dev/null || true
