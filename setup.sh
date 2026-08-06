#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "============================================"
echo "  MyAgent 首次部署"
echo "  自动完成：Python venv + 依赖 + 配置模板"
echo "============================================"
echo

echo "[1/4] 创建 Python 虚拟环境 backend/venv"
python3 -m venv backend/venv

echo "[2/4] 安装后端依赖（首次较慢）"
backend/venv/bin/pip install -r backend/requirements.txt

echo "[3/4] 安装前端依赖"
(cd frontend && npm install)

echo "[4/4] 生成 backend/.env（从示例复制）"
[ -f backend/.env ] || cp backend/.env.example backend/.env

echo
echo "============================================"
echo "  部署完成！下一步："
echo "    1. 编辑 backend/.env 填入 API Key"
echo "    2. 启动后端：backend/venv/bin/python backend/run.py"
echo "    3. 启动前端：(cd frontend && npm run dev)"
echo "    4. 浏览器打开 http://localhost:5173"
echo "============================================"
