"""Agent 可用的工具集：read_file / write_file / list_dir / glob / grep / bash。"""
import asyncio
import fnmatch
import os
import re
import time


class ToolError(Exception):
    pass


class NeedsApproval(Exception):
    """工具执行前需要用户批准。"""

    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


def resolve_path(workspace: str, rel: str) -> str:
    """把工具传入的相对/绝对路径解析为工作区内绝对路径，越界报错。"""
    base = os.path.abspath(workspace)
    p = os.path.abspath(os.path.join(base, rel or "."))
    if p != base and not p.startswith(base + os.sep):
        raise ToolError(f"路径超出工作区，已拒绝：{rel}")
    return p


def _safe_read(path: str, max_chars: int = 20000) -> str:
    if not os.path.exists(path):
        raise ToolError(f"文件不存在：{path}")
    if os.path.isdir(path):
        raise ToolError(f"目标是目录，请用 list_dir 查看：{path}")
    size = os.path.getsize(path)
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except OSError as e:
        raise ToolError(f"读取失败：{e}")
    if len(content) > max_chars:
        content = content[:max_chars] + f"\n...（文件共 {size} 字节，已截断到前 {max_chars} 字符）"
    return content


async def tool_read_file(args: dict, ctx) -> str:
    path = resolve_path(ctx["workspace"], str(args.get("path", "")))
    return _safe_read(path, int(args.get("max_chars", 20000)))


async def tool_write_file(args: dict, ctx) -> str:
    path = resolve_path(ctx["workspace"], str(args.get("path", "")))
    content = str(args.get("content", ""))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    cb = ctx.get("on_file_changed")
    if cb:
        cb(path)
    return f"已写入 {len(content)} 字符到 {os.path.relpath(path, ctx['workspace'])}"


async def tool_list_dir(args: dict, ctx) -> str:
    path = resolve_path(ctx["workspace"], str(args.get("path", ".")))
    if not os.path.isdir(path):
        raise ToolError(f"目录不存在：{path}")
    try:
        entries = sorted(os.listdir(path))
    except OSError as e:
        raise ToolError(f"读取目录失败：{e}")
    lines = [f"目录：{os.path.relpath(path, ctx['workspace']) or '.'}"]
    for name in entries:
        full = os.path.join(path, name)
        suffix = "/" if os.path.isdir(full) else ""
        lines.append(f"  {name}{suffix}")
    return "\n".join(lines)


def _glob_match(rel: str, pattern: str) -> bool:
    """支持 **/ 开头的模式匹配根目录文件（如 '**/*.py' 应匹配 'a.py'）。"""
    if fnmatch.fnmatch(rel, pattern):
        return True
    if pattern.startswith("**/"):
        return fnmatch.fnmatch(rel, pattern[3:])
    return False


async def tool_glob(args: dict, ctx) -> str:
    pattern = str(args.get("pattern", ""))
    base = ctx["workspace"]
    matches = []
    for root, dirs, files in os.walk(base):
        # 跳过隐藏与常见噪音目录
        dirs[:] = [d for d in dirs if not d.startswith(".") and d not in ("node_modules", ".venv", "venv", "__pycache__", "target", "dist")]
        for name in files:
            rel = os.path.relpath(os.path.join(root, name), base)
            if _glob_match(rel, pattern):
                matches.append(rel)
    matches.sort()
    return "\n".join(matches[:200]) or f"未匹配到任何文件：{pattern}"


async def tool_grep(args: dict, ctx) -> str:
    pattern = str(args.get("pattern", ""))
    glob_filter = str(args.get("glob", "*"))
    base = ctx["workspace"]
    try:
        rx = re.compile(pattern)
    except re.error as e:
        raise ToolError(f"正则无效：{e}")
    hits = []
    for root, dirs, files in os.walk(base):
        dirs[:] = [d for d in dirs if not d.startswith(".") and d not in ("node_modules", ".venv", "venv", "__pycache__", "target", "dist")]
        for name in files:
            if not fnmatch.fnmatch(name, glob_filter):
                continue
            fp = os.path.join(root, name)
            if os.path.getsize(fp) > 2 * 1024 * 1024:
                continue
            try:
                with open(fp, "r", encoding="utf-8", errors="replace") as f:
                    for i, line in enumerate(f, 1):
                        if rx.search(line):
                            rel = os.path.relpath(fp, base)
                            hits.append(f"{rel}:{i}: {line.rstrip()[:200]}")
                            if len(hits) >= 100:
                                break
            except OSError:
                continue
            if len(hits) >= 100:
                break
    return "\n".join(hits) if hits else f"未匹配到任何内容：{pattern}"


async def tool_bash(args: dict, ctx) -> str:
    command = str(args.get("command", "")).strip()
    if not command:
        raise ToolError("命令为空")
    if not ctx.get("approved") and not ctx.get("auto_approve_bash"):
        raise NeedsApproval(f"执行命令：{command[:200]}")
    timeout = int(ctx.get("bash_timeout", 120))
    proc = await asyncio.create_subprocess_exec(
        "bash", "-c", command,
        cwd=ctx["workspace"],
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    try:
        out, _ = await asyncio.wait_for(proc.communicate(), timeout)
    except asyncio.TimeoutError:
        try:
            proc.kill()
        except ProcessLookupError:
            pass
        return f"[命令执行超过 {timeout}s，已终止]"
    text = out.decode("utf-8", errors="replace")
    if len(text) > 20000:
        text = text[:20000] + f"\n...（输出过长，已截断）"
    prefix = f"$ {command}\n" if text else f"$ {command}\n（无输出）"
    return prefix + text


TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "读取工作区内一个文本文件的内容。返回文件文本，大文件自动截断。",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "相对工作区的文件路径"},
                    "max_chars": {"type": "integer", "description": "最多读取的字符数，默认 20000"},
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "写文件到工作区（覆盖已有内容）。目录不存在会自动创建。",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "相对工作区的文件路径"},
                    "content": {"type": "string", "description": "要写入的完整内容"},
                },
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_dir",
            "description": "列出工作区内某个目录的内容（一层）。",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "相对工作区的目录路径，默认当前目录"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "glob",
            "description": "按 glob 模式（如 '**/*.py'）查找工作区内的文件路径。",
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "description": "glob 模式，例如 **/*.py"},
                },
                "required": ["pattern"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "grep",
            "description": "在工作区文件中搜索正则表达式，返回 文件名:行号:内容。",
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "description": "正则表达式"},
                    "glob": {"type": "string", "description": "文件名过滤，默认 *"},
                },
                "required": ["pattern"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "bash",
            "description": "在工作区目录下执行 bash 命令，返回标准输出与错误输出。高危操作需要用户批准。",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "要执行的 bash 命令"},
                },
                "required": ["command"],
            },
        },
    },
]

TOOL_HANDLERS = {
    "read_file": tool_read_file,
    "write_file": tool_write_file,
    "list_dir": tool_list_dir,
    "glob": tool_glob,
    "grep": tool_grep,
    "bash": tool_bash,
}


async def execute_tool(name: str, args: dict, ctx: dict) -> str:
    handler = TOOL_HANDLERS.get(name)
    if not handler:
        raise ToolError(f"未知工具：{name}")
    return await handler(args, ctx)


def serialize_tool_call(tc: dict) -> dict:
    """把 OpenAI 格式 tool_call 序列化为可持久化/展示的 dict。"""
    func = tc.get("function", {})
    return {
        "id": tc.get("id", ""),
        "name": func.get("name", ""),
        "arguments": func.get("arguments", ""),
    }
