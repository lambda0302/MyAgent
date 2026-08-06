"""离线补丁：litellm 导入时会调用 tiktoken.get_encoding('cl100k_base')，
若本地无该编码文件则尝试联网下载，网络受限时会导致整个后端无法导入。

此模块必须在导入 litellm 之前加载，把 cl100k_base 的解析回退到 o200k_base
（litellm 内置了 o200k_base 的 BPE 文件，可完全离线使用）。
仅影响 token 计数的近似值，不影响模型调用本身。
"""


def apply():
    try:
        import tiktoken
    except ImportError:
        return
    orig_get = tiktoken.get_encoding
    orig_for_model = tiktoken.encoding_for_model

    def safe_get(name):
        try:
            return orig_get(name)
        except Exception:
            if name == "cl100k_base":
                return orig_get("o200k_base")
            raise

    def safe_for_model(model):
        try:
            return orig_for_model(model)
        except Exception:
            return safe_get("cl100k_base")

    tiktoken.get_encoding = safe_get
    tiktoken.encoding_for_model = safe_for_model


apply()
