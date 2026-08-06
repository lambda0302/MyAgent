@echo off
title MyAgent 启动器
cd /d "%~dp0"

echo ============================================
echo   MyAgent 一键启动
echo   - 后端  http://localhost:8000
echo   - 前端  http://localhost:5173  (浏览器打开这个)
echo ============================================
echo.

echo [1/2] 正在启动后端 (Python FastAPI) ...
start "MyAgent-Backend" cmd /k "pushd %~dp0backend && venv\Scripts\python.exe run.py"

echo [2/2] 正在启动前端 (Vite dev server) ...
start "MyAgent-Frontend" cmd /k "pushd %~dp0frontend && npm run dev"

echo.
echo 已启动。两个新窗口会分别运行后端和前端。
echo 稍等 2~3 秒后，浏览器打开  http://localhost:5173
echo 停止方法：两个新窗口里分别按 Ctrl+C，或运行 stop.bat
pause
