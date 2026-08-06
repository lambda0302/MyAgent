"""Agent 主循环：流式对话 + 工具调用循环 + 权限审批。"""
import asyncio
import json
import logging
import time
import uuid

from .db import SessionLocal

logger = logging.getLogger("myagent.agent")
from .llm import stream_chat
from .models import MessageModel, SessionModel
from .tools import NeedsApproval, ToolError, execute_tool, serialize_tool_call

MAX_APPROVAL_WAIT = 600  # 秒


def messages_to_litellm(db, session_id: str) -> list:
    """把 DB 消息转为 LiteLLM/OpenAI 格式，供多轮上下文使用。"""
    msgs = (
        db.query(MessageModel)
        .filter(MessageModel.session_id == session_id)
        .order_by(MessageModel.created_at)
        .all()
    )
    out = []
    for m in msgs:
        if m.role in ("user", "assistant", "system"):
            item = {"role": m.role, "content": m.content}
            if m.tool_calls:
                # DB 里存的是扁平格式 {id,name,arguments}，还原成 OpenAI 格式供 LiteLLM 转换
                item["tool_calls"] = [
                    {"id": tc.get("id") or f"call_{i}", "type": "function",
                     "function": {"name": tc.get("name", ""), "arguments": tc.get("arguments", "{}")}}
                    for i, tc in enumerate(m.tool_calls)
                ]
            out.append(item)
        elif m.role == "tool":
            try:
                payload = json.loads(m.content)
                out.append({
                    "role": "tool",
                    "tool_call_id": payload.get("tool_call_id", ""),
                    "content": payload.get("content", ""),
                })
            except json.JSONDecodeError:
                out.append({"role": "tool", "tool_call_id": "", "content": m.content})
    return out


class AgentRun:
    def __init__(self, sio, sid: str, session_id: str):
        self.sio = sio
        self.sid = sid
        self.session_id = session_id
        self._stop = False

    # ---------- 事件推送 ----------
    async def _emit(self, event: str, data: dict):
        data["session_id"] = self.session_id
        await self.sio.emit(event, data, room=self.session_id)

    async def _emit_delta(self, text: str):
        await self._emit("chat.delta", {"delta": text})

    async def _emit_status(self, status: str, detail: str = ""):
        await self._emit("agent.status", {"status": status, "detail": detail})
        db = SessionLocal()
        try:
            s = db.get(SessionModel, self.session_id)
            if s:
                s.status = status
                db.commit()
        finally:
            db.close()

    # ---------- 审批 ----------
    async def _request_approval(self, call_id: str, name: str, args: dict) -> bool:
        fut: asyncio.Future = asyncio.get_running_loop().create_future()
        approval_map[call_id] = fut
        await self._emit("approval.request", {"call_id": call_id, "tool": name, "arguments": args})
        try:
            approved = await asyncio.wait_for(fut, MAX_APPROVAL_WAIT)
            return bool(approved)
        except asyncio.TimeoutError:
            return False
        finally:
            approval_map.pop(call_id, None)

    # ---------- 主循环 ----------
    async def run(self, user_content: str, workspace: str, settings: dict):
        db = SessionLocal()
        try:
            s = db.get(SessionModel, self.session_id)
            if not s:
                return
            # 首条消息时生成标题
            if not s.title or s.title == "新会话":
                s.title = user_content.strip().replace("\n", " ")[:40] or "新会话"
            s.status = "running"
            db.commit()
        finally:
            db.close()

        AGENT_RUNS[self.session_id] = self

        # 保存用户消息
        db = SessionLocal()
        try:
            db.add(MessageModel(id=uuid.uuid4().hex, session_id=self.session_id,
                                role="user", content=user_content))
            db.commit()
        finally:
            db.close()
        await self._emit("message.saved", {"role": "user", "content": user_content})
        logger.info("会话 %s 开始运行：%s", self.session_id, user_content[:80])

        messages = messages_to_litellm(db, self.session_id)
        max_steps = int(settings.get("max_steps", 25))
        tool_ctx = {
            "workspace": workspace,
            "auto_approve_bash": bool(settings.get("auto_approve_bash")),
            "bash_timeout": int(settings.get("bash_timeout", 120)),
            "approved": False,
            "on_file_changed": lambda path: asyncio.create_task(
                self._emit("file.changed", {"path": path})
            ),
        }

        text = ""
        tool_calls = []
        try:
            for step in range(max_steps):
                if self._stop:
                    break
                # 流式获取模型输出
                try:
                    text, tool_calls = await stream_chat(
                        messages, settings, on_delta=self._emit_delta
                    )
                except Exception as e:  # LLM 调用失败
                    err = f"模型调用失败：{type(e).__name__}: {e}"
                    logger.error("会话 %s 第 %d 轮模型调用失败：%s", self.session_id, step, err, exc_info=True)
                    await self._emit("chat.error", {"message": err, "step": step})
                    await self._persist_assistant(text, [])
                    await self._emit_status("error", err)
                    return

                if not tool_calls:
                    await self._persist_assistant(text, [])
                    await self._emit_status("done")
                    return

                # 有工具调用：持久化 assistant 消息（含 tool_calls）
                await self._persist_assistant(text, [serialize_tool_call(t) for t in tool_calls])

                # 组装 assistant 消息回传给模型（必须带 tool_calls，否则 tool_result 找不到对应 tool_use）
                assistant_msg = {"role": "assistant", "content": text}
                if tool_calls:
                    assistant_msg["tool_calls"] = [
                        {"id": t.get("id", f"call_{i}"), "type": "function",
                         "function": {"name": t["function"]["name"], "arguments": t["function"]["arguments"]}}
                        for i, t in enumerate(tool_calls)
                    ]
                messages.append(assistant_msg)

                for tc in tool_calls:
                    if self._stop:
                        break
                    name = tc["function"]["name"]
                    try:
                        args = json.loads(tc["function"]["arguments"])
                    except json.JSONDecodeError:
                        args = {}
                    call_id = tc["id"]
                    started = time.time()
                    logger.info("会话 %s 调用工具 %s：%s", self.session_id, name, json.dumps(args, ensure_ascii=False)[:200])
                    await self._emit("tool.start", {
                        "call_id": call_id, "name": name, "arguments": args,
                    })

                    # 审批
                    approved = True
                    if name == "bash" and not tool_ctx["auto_approve_bash"]:
                        await self._emit_status("waiting_approval")
                        approved = await self._request_approval(call_id, name, args)
                        await self._emit_status("running")

                    if self._stop:
                        result_text = "[任务已被用户中断]"
                        ok = False
                    elif not approved:
                        result_text = "[用户拒绝了该命令的执行请求]"
                        ok = False
                    else:
                        try:
                            tool_ctx["approved"] = approved
                            result_text = await execute_tool(name, args, tool_ctx)
                            ok = True
                        except NeedsApproval as na:
                            result_text = f"[需要用户批准：{na.reason}]"
                            ok = False
                        except ToolError as te:
                            result_text = f"[工具错误] {te}"
                            logger.warning("会话 %s 工具 %s 失败：%s", self.session_id, name, te)
                            ok = False
                        except Exception as e:
                            result_text = f"[执行异常] {type(e).__name__}: {e}"
                            logger.exception("会话 %s 工具 %s 执行异常", self.session_id, name)
                            ok = False

                    duration = round(time.time() - started, 2)
                    await self._emit("tool.result", {
                        "call_id": call_id, "name": name, "ok": ok,
                        "output": result_text, "duration": duration,
                    })

                    # 持久化 tool 消息
                    db = SessionLocal()
                    try:
                        db.add(MessageModel(
                            id=uuid.uuid4().hex, session_id=self.session_id,
                            role="tool",
                            content=json.dumps({
                                "tool_call_id": call_id,
                                "content": result_text,
                            }, ensure_ascii=False),
                        ))
                        db.commit()
                    finally:
                        db.close()
                    messages.append({
                        "role": "tool", "tool_call_id": call_id, "content": result_text,
                    })

            if not self._stop:
                await self._emit_status("done")
            else:
                await self._persist_assistant("", [])
                await self._emit_status("done")
        finally:
            AGENT_RUNS.pop(self.session_id, None)
            db = SessionLocal()
            try:
                s = db.get(SessionModel, self.session_id)
                if s and s.status in ("running", "waiting_approval"):
                    s.status = "idle" if self._stop else "done"
                    db.commit()
            finally:
                db.close()

    async def _persist_assistant(self, text: str, tool_calls: list):
        db = SessionLocal()
        try:
            db.add(MessageModel(
                id=uuid.uuid4().hex, session_id=self.session_id,
                role="assistant", content=text,
                tool_calls=tool_calls if tool_calls else None,
            ))
            db.commit()
        finally:
            db.close()


# call_id -> Future，由 ws.py 的 approval.respond 事件填充
approval_map: dict[str, asyncio.Future] = {}
# session_id -> AgentRun，用于中断
AGENT_RUNS: dict[str, "AgentRun"] = {}
