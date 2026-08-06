"""REST 端点：会话、工作区、设置、导出。"""
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .config import load_settings, save_settings
from .db import get_db
from .models import MessageModel, SessionModel

router = APIRouter()


# ---------- 会话 ----------
@router.get("/api/health")
def health():
    return {"status": "ok"}


@router.get("/api/sessions")
def list_sessions(db: Session = Depends(get_db)):
    rows = db.query(SessionModel).order_by(SessionModel.updated_at.desc()).all()
    return [
        {
            "id": s.id, "title": s.title, "model": s.model,
            "status": s.status, "created_at": s.created_at.isoformat(),
            "updated_at": s.updated_at.isoformat(),
        }
        for s in rows
    ]


class SessionCreate(BaseModel):
    model: str = ""


@router.post("/api/sessions")
def create_session(body: SessionCreate, db: Session = Depends(get_db)):
    settings = load_settings(db)
    s = SessionModel(
        id=uuid.uuid4().hex,
        title="新会话",
        model=body.model or settings.get("default_model", ""),
        status="idle",
        workspace_root=settings.get("workspace_root", ""),
    )
    db.add(s)
    db.commit()
    return {
        "id": s.id, "title": s.title, "model": s.model,
        "status": s.status, "created_at": s.created_at.isoformat(),
        "updated_at": s.updated_at.isoformat(),
    }


@router.get("/api/sessions/{session_id}/messages")
def session_messages(session_id: str, db: Session = Depends(get_db)):
    msgs = (
        db.query(MessageModel)
        .filter(MessageModel.session_id == session_id)
        .order_by(MessageModel.created_at)
        .all()
    )
    return [
        {
            "id": m.id, "role": m.role, "content": m.content,
            "tool_calls": m.tool_calls, "created_at": m.created_at.isoformat(),
        }
        for m in msgs
    ]


@router.delete("/api/sessions/{session_id}")
def delete_session(session_id: str, db: Session = Depends(get_db)):
    s = db.get(SessionModel, session_id)
    if not s:
        raise HTTPException(404, "会话不存在")
    db.delete(s)
    db.commit()
    return {"ok": True}


@router.get("/api/sessions/{session_id}/export")
def export_session(session_id: str, db: Session = Depends(get_db)):
    s = db.get(SessionModel, session_id)
    if not s:
        raise HTTPException(404, "会话不存在")
    msgs = (
        db.query(MessageModel)
        .filter(MessageModel.session_id == session_id)
        .order_by(MessageModel.created_at)
        .all()
    )
    lines = [f"# 会话：{s.title}", f"- 模型：{s.model}", f"- 时间：{s.created_at.isoformat()}", ""]
    role_names = {"user": "用户", "assistant": "Agent", "tool": "工具", "system": "系统"}
    for m in msgs:
        if m.role == "tool":
            continue
        lines.append(f"## {role_names.get(m.role, m.role)}")
        lines.append("")
        if m.tool_calls:
            for tc in m.tool_calls or []:
                lines.append(f"> 🔧 {tc.get('name', '')}({tc.get('arguments', '')})")
            lines.append("")
        lines.append(m.content or "（无文本内容）")
        lines.append("")
    return {"title": s.title, "markdown": "\n".join(lines)}


# ---------- 工作区 ----------
@router.get("/api/workspace/tree")
def workspace_tree(root: str = "", db: Session = Depends(get_db)):
    settings = load_settings(db)
    base = os.path.abspath(root or settings.get("workspace_root", ""))
    if not os.path.isdir(base):
        raise HTTPException(404, f"工作区不存在：{base}")
    ignore = {".git", "node_modules", ".venv", "venv", "__pycache__", ".idea", ".vscode", "dist", "target", ".cache"}

    def walk(path, depth):
        if depth > 5:
            return []
        out = []
        try:
            entries = sorted(os.listdir(path), key=lambda x: (os.path.isdir(os.path.join(path, x)) is not True, x.lower()))
        except OSError:
            return out
        for name in entries:
            if name in ignore:
                continue
            full = os.path.join(path, name)
            rel = os.path.relpath(full, base).replace("\\", "/")
            if os.path.isdir(full):
                children = walk(full, depth + 1)
                out.append({"name": name, "path": rel, "type": "dir", "children": children})
            else:
                out.append({"name": name, "path": rel, "type": "file"})
        return out

    return {"root": base, "tree": walk(base, 0)}


@router.get("/api/workspace/file")
def workspace_file(path: str, root: str = "", db: Session = Depends(get_db)):
    settings = load_settings(db)
    base = os.path.abspath(root or settings.get("workspace_root", ""))
    p = os.path.abspath(os.path.join(base, path))
    if p != base and not p.startswith(base + os.sep):
        raise HTTPException(403, "路径超出工作区")
    if not os.path.isfile(p):
        raise HTTPException(404, "文件不存在")
    try:
        with open(p, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except OSError as e:
        raise HTTPException(500, str(e))
    return {"path": path, "content": content}


class FileSave(BaseModel):
    path: str
    content: str
    root: str = ""


@router.post("/api/workspace/file")
def save_workspace_file(body: FileSave, db: Session = Depends(get_db)):
    settings = load_settings(db)
    base = os.path.abspath(body.root or settings.get("workspace_root", ""))
    p = os.path.abspath(os.path.join(base, body.path))
    if p != base and not p.startswith(base + os.sep):
        raise HTTPException(403, "路径超出工作区")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        f.write(body.content)
    return {"ok": True}


# ---------- 设置 ----------
class SettingsBody(BaseModel):
    workspace_root: str | None = None
    default_model: str | None = None
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    openai_compatible_base_url: str | None = None
    deepseek_api_key: str | None = None
    deepseek_base_url: str | None = None
    ollama_base_url: str | None = None
    auto_approve_bash: bool | None = None
    max_steps: int | None = None
    max_tokens: int | None = None
    bash_timeout: int | None = None


@router.get("/api/settings")
def get_settings(db: Session = Depends(get_db)):
    settings = load_settings(db)
    # 不返回完整 key，只返回是否已配置
    masked = dict(settings)
    for k in ("anthropic_api_key", "openai_api_key", "deepseek_api_key"):
        masked[k] = bool(settings.get(k))
    masked["has_anthropic_key"] = bool(settings.get("anthropic_api_key"))
    masked["has_openai_key"] = bool(settings.get("openai_api_key"))
    masked["has_deepseek_key"] = bool(settings.get("deepseek_api_key"))
    return masked


@router.put("/api/settings")
def update_settings(body: SettingsBody, db: Session = Depends(get_db)):
    data = body.model_dump(exclude_none=True)
    cur = save_settings(db, data)
    masked = dict(cur)
    for k in ("anthropic_api_key", "openai_api_key", "deepseek_api_key"):
        masked[k] = bool(cur.get(k))
    return masked
