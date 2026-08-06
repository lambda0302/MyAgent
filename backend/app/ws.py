"""Socket.IO 服务器与事件处理。"""
import asyncio
import logging

import socketio

from .agent import AgentRun, approval_map
from .config import load_settings
from .db import SessionLocal
from .models import SessionModel

logger = logging.getLogger("myagent.ws")

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    max_http_buffer_size=20 * 1024 * 1024,
)

# session_id -> asyncio.Task，用于中断
session_tasks: dict[str, asyncio.Task] = {}
# socket sid -> session_id
sid_session: dict[str, str] = {}


@sio.event
async def connect(sid, environ, auth):
    logger.info("客户端连接: %s", sid)


@sio.event
async def disconnect(sid):
    sid_session.pop(sid, None)
    logger.info("客户端断开: %s", sid)


@sio.on("join")
async def on_join(sid, data):
    session_id = data.get("session_id") if isinstance(data, dict) else data
    if session_id:
        await sio.enter_room(sid, session_id)
        sid_session[sid] = session_id
        await sio.emit("session.joined", {"session_id": session_id}, to=sid)


@sio.on("leave")
async def on_leave(sid, data):
    session_id = data.get("session_id") if isinstance(data, dict) else data
    if session_id:
        await sio.leave_room(sid, session_id)
        sid_session.pop(sid, None)


@sio.on("chat.message")
async def on_chat_message(sid, data):
    session_id = data.get("session_id") or sid_session.get(sid)
    content = (data.get("content") or "").strip()
    if not session_id or not content:
        return
    # 若该会话正在运行，拒绝重复消息
    existing = session_tasks.get(session_id)
    if existing and not existing.done():
        await sio.emit("chat.error", {
            "session_id": session_id,
            "message": "该会话正在运行中，请先停止或等待完成。",
        }, to=sid)
        return
    run = AgentRun(sio, sid, session_id)
    task = asyncio.create_task(_run_wrapper(run, content))
    session_tasks[session_id] = task
    logger.info("收到消息：会话 %s（来自 %s），内容：%s", session_id, sid, content[:80])


async def _run_wrapper(run: AgentRun, content: str):
    db = SessionLocal()
    settings = load_settings(db)
    try:
        s = db.get(SessionModel, run.session_id)
        workspace = s.workspace_root if s and s.workspace_root else settings.get("workspace_root", "")
    finally:
        db.close()
    try:
        await run.run(content, workspace, settings)
    except Exception as e:
        logger.exception("会话 %s 运行异常", run.session_id)
        try:
            await sio.emit("chat.error", {"session_id": run.session_id, "message": f"内部异常：{type(e).__name__}: {e}"}, to=run.session_id)
        except Exception:
            pass
    finally:
        session_tasks.pop(run.session_id, None)
        logger.info("会话 %s 运行结束", run.session_id)


@sio.on("session.stop")
async def on_stop(sid, data):
    session_id = data.get("session_id") or sid_session.get(sid)
    if not session_id:
        return
    task = session_tasks.get(session_id)
    if task and not task.done():
        # AgentRun 通过共享 dict 标记停止
        from .agent import AGENT_RUNS
        r = AGENT_RUNS.get(session_id)
        if r:
            r._stop = True
        # 审批等待立即放行（拒绝）
        for call_id, fut in list(approval_map.items()):
            if not fut.done():
                fut.set_result(False)
        await sio.emit("agent.status", {"session_id": session_id, "status": "stopping"}, to=session_id)


@sio.on("approval.respond")
async def on_approval(sid, data):
    call_id = data.get("call_id")
    approved = bool(data.get("approved"))
    fut = approval_map.get(call_id)
    if fut and not fut.done():
        fut.set_result(approved)
        await sio.emit("approval.resolved", {
            "session_id": data.get("session_id") or sid_session.get(sid),
            "call_id": call_id, "approved": approved,
        }, to=sid_session.get(sid) or sid)
