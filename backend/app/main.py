"""应用入口：FastAPI + Socket.IO（ASGI 包装）。

启动：uvicorn app.main:sio_app --port 8000
"""
import logging

# 必须在导入 litellm 之前应用离线补丁（解决 tiktoken 联网下载失败）
from . import tiktoken_fix  # noqa: F401

# 显式加载 backend/.env（环境变量优先，不覆盖已存在的真实环境变量）
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from socketio import ASGIApp

from .db import init_db
from .routes import router
from .ws import sio

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

app = FastAPI(title="MyAgent", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)


@app.on_event("startup")
def on_startup():
    init_db()


# Socket.IO ASGI 包装：socket.io 请求走 sio，其余走 FastAPI app
sio_app = ASGIApp(sio, other_asgi_app=app)
