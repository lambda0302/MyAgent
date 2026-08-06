@echo off
title MyAgent 停止器
echo 正在停止 MyAgent（查找占用 8000 / 5173 端口的进程）...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000 " ^| findstr LISTENING') do (
    echo   结束后端进程 PID %%a
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173 " ^| findstr LISTENING') do (
    echo   结束前端进程 PID %%a
    taskkill /F /PID %%a >nul 2>&1
)

echo 完成。端口已释放。
pause
