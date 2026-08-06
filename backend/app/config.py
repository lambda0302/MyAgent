"""应用配置：默认值 + DB 持久化的设置。"""
import json
import os

DEFAULT_SETTINGS = {
    "workspace_root": os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "workspace")),
    "default_model": "anthropic/claude-sonnet-5",
    "anthropic_api_key": "",
    "openai_api_key": "",
    "openai_compatible_base_url": "",
    "deepseek_api_key": "",
    "deepseek_base_url": "",
    "ollama_base_url": "http://localhost:11434",
    "auto_approve_bash": False,
    "max_steps": 25,
    "max_tokens": 8192,
    "bash_timeout": 120,
}

MODEL_PROVIDERS = ["anthropic", "openai", "openai_compatible", "ollama"]


def load_settings(db) -> dict:
    """从 DB settings 表加载 'app' 键，合并默认值。"""
    from .models import SettingModel

    row = db.get(SettingModel, "app")
    data = dict(DEFAULT_SETTINGS)
    if row:
        try:
            stored = json.loads(row.value)
            if isinstance(stored, dict):
                data.update({k: v for k, v in stored.items() if k in DEFAULT_SETTINGS})
        except (json.JSONDecodeError, TypeError):
            pass
    # 环境变量优先（如 MYAGENT_WORKSPACE / ANTHROPIC_API_KEY）
    if os.environ.get("MYAGENT_WORKSPACE"):
        data["workspace_root"] = os.path.abspath(os.environ["MYAGENT_WORKSPACE"])
    for env, key in [("ANTHROPIC_API_KEY", "anthropic_api_key"), ("OPENAI_API_KEY", "openai_api_key"), ("DEEPSEEK_API_KEY", "deepseek_api_key")]:
        if os.environ.get(env):
            data[key] = os.environ[env]
    return data


def save_settings(db, data: dict):
    """保存设置（仅允许白名单键）。"""
    from .models import SettingModel

    cur = load_settings(db)
    for k, v in data.items():
        if k in DEFAULT_SETTINGS:
            cur[k] = v
    row = db.get(SettingModel, "app")
    if not row:
        row = SettingModel(key="app", value="{}")
        db.add(row)
    row.value = json.dumps(cur, ensure_ascii=False)
    db.commit()
    return cur
