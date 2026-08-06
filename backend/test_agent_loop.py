"""不依赖网络的 Agent 循环测试：mock stream_chat，验证工具调用/审批/持久化链路。

运行：cd backend && ./venv/Scripts/python.exe test_agent_loop.py
"""
import asyncio
import json
import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.agent import AgentRun  # noqa: E402
from app.config import DEFAULT_SETTINGS  # noqa: E402
from app.db import SessionLocal, init_db  # noqa: E402
from app.models import MessageModel, SessionModel  # noqa: E402
from app.tools import execute_tool, resolve_path, ToolError  # noqa: E402
import app.agent as agent_mod  # noqa: E402


class FakeSio:
    """记录所有 emit 的假 socket.io 服务器。"""

    def __init__(self):
        self.events = []

    async def emit(self, event, data, room=None):
        self.events.append((event, data))


# ---------- 1. 工具层测试 ----------
def test_tools():
    ws = DEFAULT_SETTINGS["workspace_root"]
    ctx = {"workspace": ws, "approved": True, "auto_approve_bash": True}

    async def run():
        # read_file
        out = await execute_tool("read_file", {"path": "calculator.py"}, ctx)
        assert "def add" in out, "read_file 失败"
        # write_file
        await execute_tool("write_file", {"path": "tmp_测试.txt", "content": "你好"}, ctx)
        assert os.path.exists(os.path.join(ws, "tmp_测试.txt"))
        os.remove(os.path.join(ws, "tmp_测试.txt"))
        # list_dir
        out = await execute_tool("list_dir", {"path": "."}, ctx)
        assert "calculator.py" in out
        # glob
        out = await execute_tool("glob", {"pattern": "**/*.py"}, ctx)
        assert "calculator.py" in out
        # grep
        out = await execute_tool("grep", {"pattern": "def add"}, ctx)
        assert "calculator.py:2" in out or "calculator.py:1" in out or "calculator.py" in out
        # bash
        out = await execute_tool("bash", {"command": "echo hello && pwd"}, ctx)
        assert "hello" in out
        # 越界保护
        try:
            resolve_path(ws, "../../Windows/system32/drivers/etc/hosts")
            raise AssertionError("越界路径未被拦截")
        except ToolError:
            pass
        # bash 默认需审批
        ctx2 = {"workspace": ws, "auto_approve_bash": False}
        from app.tools import NeedsApproval
        try:
            await execute_tool("bash", {"command": "ls"}, ctx2)
            raise AssertionError("bash 未触发审批")
        except NeedsApproval:
            pass
        print("✅ 工具层测试通过：read/write/list/glob/grep/bash/越界保护/审批")

    asyncio.run(run())


# ---------- 1.5 stream_chat 真实实现测试（mock acompletion） ----------
def test_stream_chat():
    """直接测 llm.stream_chat 的增量累积逻辑（回归：曾漏初始化/漏 await 导致真实调用失败）。"""
    import app.llm as llm_mod

    class FakeChunk:
        def __init__(self, content=None, tool_calls=None):
            self.choices = [type("C", (), {"delta": type("D", (), {
                "content": content,
                "tool_calls": tool_calls,
            })()})()]

    class FakeResponse:
        def __init__(self, chunks):
            self._chunks = chunks
        def __aiter__(self):
            self._it = iter(self._chunks)
            return self
        async def __anext__(self):
            try:
                return next(self._it)
            except StopIteration:
                raise StopAsyncIteration

    args_parts = [
        '{"pat',
        'h": "calc',
        'ulator.py"}',
    ]
    chunks = [
        FakeChunk(content="正在"),
        FakeChunk(content="读取…"),
        FakeChunk(content=None, tool_calls=[
            type("TC", (), {"index": 0, "id": "call_9",
                            "function": type("F", (), {"name": "read_file", "arguments": args_parts[0]})})()
        ]),
        FakeChunk(content=None, tool_calls=[
            type("TC", (), {"index": 0, "id": None,
                            "function": type("F", (), {"name": None, "arguments": args_parts[1]})})()
        ]),
        FakeChunk(content=None, tool_calls=[
            type("TC", (), {"index": 0, "id": None,
                            "function": type("F", (), {"name": None, "arguments": args_parts[2]})})()
        ]),
    ]

    orig = llm_mod.acompletion
    async def fake_acompletion(**kwargs):
        assert "tools" in kwargs, "tools 未传"
        return FakeResponse(chunks)
    llm_mod.acompletion = fake_acompletion

    async def run():
        deltas = []
        async def on_delta(s):
            deltas.append(s)
        text, calls = await llm_mod.stream_chat(
            [{"role": "user", "content": "hi"}], {"default_model": "anthropic/x"},
            on_delta=on_delta,
        )
        assert text == "正在读取…", text
        assert deltas == ["正在", "读取…"], deltas
        assert len(calls) == 1, calls
        c = calls[0]
        assert c["function"]["name"] == "read_file", c
        import json as _json
        assert _json.loads(c["function"]["arguments"]) == {"path": "calculator.py"}, c
        print("✅ stream_chat 增量累积测试通过：文本+工具调用参数分片拼接")

    asyncio.run(run())
    llm_mod.acompletion = orig


# ---------- 2. Agent 循环测试（mock LLM） ----------
def test_agent_loop():
    orig_stream = agent_mod.stream_chat
    calls = {"n": 0}
    events = []

    async def fake_stream(messages, settings, on_delta, tools=True):
        calls["n"] += 1
        if calls["n"] == 1:
            # 第一轮：只调用工具，无文本
            args = json.dumps({"path": "calculator.py"})
            await on_delta("")
            return ("", [{"id": "call_1", "type": "function",
                          "function": {"name": "read_file", "arguments": args}}])
        if calls["n"] == 2:
            # 第二轮：工具结果后给出文本回复
            for ch in "已读取 calculator.py。":
                await on_delta(ch)
            return ("已读取 calculator.py。", [])

    agent_mod.stream_chat = fake_stream

    async def run():
        init_db()
        db = SessionLocal()
        try:
            s = SessionModel(id="testsess", title="新会话", model="x", status="idle",
                             workspace_root=DEFAULT_SETTINGS["workspace_root"])
            db.add(s)
            db.commit()
        finally:
            db.close()

        fio = FakeSio()
        run_agent = AgentRun(fio, "test_sid", "testsess")
        await run_agent.run("读取 calculator.py", DEFAULT_SETTINGS["workspace_root"], DEFAULT_SETTINGS)

        ev_names = [e for e, _ in fio.events]
        assert "tool.start" in ev_names, "缺少 tool.start"
        assert "tool.result" in ev_names, "缺少 tool.result"
        assert ("agent.status", {"status": "done", "session_id": "testsess"}) in fio.events or \
               any(e == "agent.status" and d["status"] == "done" for e, d in fio.events), "未到 done"

        # 校验持久化
        db = SessionLocal()
        try:
            msgs = db.query(MessageModel).filter(MessageModel.session_id == "testsess").order_by(MessageModel.created_at).all()
            roles = [m.role for m in msgs]
            assert roles[0] == "user", roles
            assert "assistant" in roles and "tool" in roles, roles
            assistant_with_tc = [m for m in msgs if m.role == "assistant" and m.tool_calls]
            assert assistant_with_tc, "assistant 消息未持久化 tool_calls"
            final_assistant = [m for m in msgs if m.role == "assistant" and m.content == "已读取 calculator.py。"]
            assert final_assistant, "最终回复未持久化"
        finally:
            db.close()
        # 清理
        db = SessionLocal()
        try:
            s = db.get(SessionModel, "testsess")
            if s:
                db.delete(s)
                db.commit()
        finally:
            db.close()
        print(f"✅ Agent 循环测试通过：工具调用→结果→最终回复（共 {calls['n']} 轮，事件 {len(fio.events)} 条）")

    asyncio.run(run())
    agent_mod.stream_chat = orig_stream


if __name__ == "__main__":
    test_tools()
    test_stream_chat()
    test_agent_loop()
    print("\n🎉 全部离线测试通过")
