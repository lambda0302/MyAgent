@echo off
title MyAgent 首次部署（clone 之后只需跑一次）
cd /d "%~dp0"

echo ============================================
echo   MyAgent 首次部署
echo   自动完成：Python 虚拟环境 + 依赖 + 配置模板
echo ============================================
echo.

echo [1/4] 创建 Python 虚拟环境 backend\venv ...
if not exist backend\venv (
    python -m venv backend\venv || goto :fail
) else (
    echo   已存在，跳过
)

echo [2/4] 安装后端依赖（首次较慢）...
backend\venv\Scripts\python.exe -m pip install --upgrade pip
backend\venv\Scripts\pip install -r backend\requirements.txt || goto :fail

echo [3/4] 安装前端依赖 ...
cd frontend
call npm install || goto :fail
cd ..

echo [4/4] 生成 backend\.env（从示例复制）...
if not exist backend\.env (
    copy backend\.env.example backend\.env
) else (
    echo   已存在，跳过
)

echo.
echo ============================================
echo   部署完成！下一步：
echo     1. 编辑 backend\.env 填入 API Key
echo     2. 双击 start.bat 启动
echo     3. 浏览器打开 http://localhost:5173
echo ============================================
pause
exit /b 0

:fail
echo.
echo [错误] 部署失败，请查看上方报错信息。
pause
exit /b 1
