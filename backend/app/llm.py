"""LiteLLM 封装：流式补全 + 工具调用增量累积。"""
import asyncio
import json

import litellm
from litellm import acompletion

from .tools import TOOL_SCHEMAS

litellm.suppress_debug_info = True

# 模型调用整体超时（含建连/流式），避免网络异常时无限挂起
LLM_TIMEOUT = 180


def _provider_api_kwargs(settings: dict) -> dict:
    """根据模型前缀注入对应 provider 的 key/base_url。"""
    kw = {}
    model = settings.get("default_model", "")
    if model.startswith("anthropic") and settings.get("anthropic_api_key"):
        kw["api_key"] = settings["anthropic_api_key"]
    elif model.startswith("openai") and settings.get("openai_api_key"):
        kw["api_key"] = settings["openai_api_key"]
        if settings.get("openai_compatible_base_url"):
            kw["api_base"] = settings["openai_compatible_base_url"]
    elif model.startswith("deepseek") and settings.get("deepseek_api_key"):
        # deepseek_api_key 未配置时退化为环境变量 DEEPSEEK_API_KEY（LiteLLM 会自动读取）
        kw["api_key"] = settings["deepseek_api_key"]
        if settings.get("deepseek_base_url"):
            kw["api_base"] = settings["deepseek_base_url"]
    elif model.startswith("ollama") and settings.get("ollama_base_url"):
        kw["api_base"] = settings["ollama_base_url"]
    return kw


def _tools_for_anthropic() -> list:
    """把 OpenAI 格式工具转为 Anthropic 原生格式。

    注意：不带 type 字段 —— 部分 Anthropic 兼容端点会拒绝
    LiteLLM 默认生成的 type="custom"（报 unknown variant 'custom'）。
    官方 API 也接受省略 type 的写法，因此两端通用。
    """
    out = []
    for t in TOOL_SCHEMAS:
        fn = t["function"]
        out.append({
            "name": fn["name"],
            "description": fn.get("description", ""),
            "input_schema": fn.get("parameters", {"type": "object", "properties": {}}),
        })
    return out


async def stream_chat(messages: list, settings: dict, on_delta, tools: bool = True):
    """流式调用 LLM。

    返回 (完整文本, tool_calls)。tool_calls 为 OpenAI 格式列表或 []。
    on_delta(text) 用于把文本增量推给前端。
    """
    model = settings.get("default_model", "anthropic/claude-sonnet-5")
    kwargs = {
        "model": model,
        "messages": messages,
        "stream": True,
        "max_tokens": int(settings.get("max_tokens", 8192)),
    }
    kwargs.update(_provider_api_kwargs(settings))
    if tools:
        # anthropic 端点用原生格式（避开 type="custom" 兼容问题），其余用 OpenAI 格式
        if model.startswith("anthropic"):
            kwargs["tools"] = _tools_for_anthropic()
        else:
            kwargs["tools"] = TOOL_SCHEMAS
        kwargs["tool_choice"] = "auto"

    text_parts: list[str] = []
    tool_calls: dict[int, dict] = {}

    async def _consume():
        response = await acompletion(**kwargs)
        async for part in response:
            if not part.choices:
                continue
            delta = part.choices[0].delta
            if not delta:
                continue
            if delta.content:
                text_parts.append(delta.content)
                await on_delta(delta.content)
            if delta.tool_calls:
                for tc in delta.tool_calls:
                    idx = tc.index if tc.index is not None else 0
                    cur = tool_calls.setdefault(idx, {"id": "", "name": "", "arguments": ""})
                    if getattr(tc, "id", None):
                        cur["id"] = tc.id
                    if tc.function:
                        if tc.function.name:
                            cur["name"] += tc.function.name
                        if tc.function.arguments:
                            cur["arguments"] += tc.function.arguments

    await asyncio.wait_for(_consume(), timeout=LLM_TIMEOUT)

    final_calls = []
    for idx in sorted(tool_calls.keys()):
        c = tool_calls[idx]
        if c["name"]:
            try:
                json.loads(c["arguments"])  # 校验参数可解析
            except json.JSONDecodeError:
                continue
            final_calls.append(
                {"id": c["id"] or f"call_{idx}", "type": "function",
                 "function": {"name": c["name"], "arguments": c["arguments"]}}
            )
    return "".join(text_parts), final_calls
