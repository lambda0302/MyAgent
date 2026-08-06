import { useState } from 'react'
import { X } from 'lucide-react'
import { useStore } from '../store'

const MODELS = [
  { label: 'Anthropic Claude（Sonnet 5）', value: 'anthropic/claude-sonnet-5' },
  { label: 'Anthropic Claude（Opus 5）', value: 'anthropic/claude-opus-5' },
  { label: 'Anthropic Claude（Haiku 4.5）', value: 'anthropic/claude-haiku-4-5' },
  { label: 'OpenAI GPT-4o', value: 'openai/gpt-4o' },
  { label: 'OpenAI GPT-4o-mini', value: 'openai/gpt-4o-mini' },
  { label: 'DeepSeek Chat', value: 'deepseek/deepseek-chat' },
  { label: 'DeepSeek Reasoner（R1）', value: 'deepseek/deepseek-reasoner' },
  { label: 'Ollama 本地', value: 'ollama/qwen3:8b' },
]

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { settings, saveSettings } = useStore()
  const [form, setForm] = useState({
    default_model: settings?.default_model ?? '',
    workspace_root: settings?.workspace_root ?? '',
    anthropic_api_key: '',
    openai_api_key: '',
    deepseek_api_key: '',
    openai_compatible_base_url: settings?.openai_compatible_base_url ?? '',
    deepseek_base_url: settings?.deepseek_base_url ?? '',
    ollama_base_url: settings?.ollama_base_url ?? '',
    auto_approve_bash: settings?.auto_approve_bash ?? false,
    max_steps: settings?.max_steps ?? 25,
  })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    setSaving(true)
    setMsg('')
    try {
      const data: Record<string, unknown> = {
        default_model: form.default_model,
        workspace_root: form.workspace_root,
        openai_compatible_base_url: form.openai_compatible_base_url,
        deepseek_base_url: form.deepseek_base_url,
        ollama_base_url: form.ollama_base_url,
        auto_approve_bash: form.auto_approve_bash,
        max_steps: form.max_steps,
      }
      if (form.anthropic_api_key) data.anthropic_api_key = form.anthropic_api_key
      if (form.openai_api_key) data.openai_api_key = form.openai_api_key
      if (form.deepseek_api_key) data.deepseek_api_key = form.deepseek_api_key
      await saveSettings(data as any)
      setMsg('✅ 已保存')
    } catch (e: any) {
      setMsg(`❌ ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full bg-[#0f1117] border border-[#2a3140] rounded px-2.5 py-1.5 text-sm outline-none focus:border-violet-500/60'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="w-[520px] max-h-[85vh] overflow-y-auto bg-[#161b26] border border-[#2a3140] rounded-xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="font-bold text-sm">设置</div>
          <button className="p-1 rounded hover:bg-white/10" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 block mb-1">默认模型</label>
            <select className={inputCls} value={form.default_model} onChange={(e) => set('default_model', e.target.value)}>
              {MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              <option value={form.default_model} disabled={MODELS.some((m) => m.value === form.default_model)}>
                {form.default_model}（自定义）
              </option>
            </select>
            <div className="text-[11px] text-gray-600 mt-1">也支持任意 LiteLLM 模型标识，如 deepseek/deepseek-chat</div>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">工作区目录（Agent 可操作的范围）</label>
            <input className={inputCls} value={form.workspace_root} onChange={(e) => set('workspace_root', e.target.value)} placeholder="F:\MyAgent\workspace" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">
                Anthropic API Key {settings?.has_anthropic_key ? '✅' : ''}
              </label>
              <input className={inputCls} type="password" placeholder={settings?.has_anthropic_key ? '已配置，留空不改' : 'sk-ant-...'}
                value={form.anthropic_api_key} onChange={(e) => set('anthropic_api_key', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">
                OpenAI API Key {settings?.has_openai_key ? '✅' : ''}
              </label>
              <input className={inputCls} type="password" placeholder={settings?.has_openai_key ? '已配置，留空不改' : 'sk-...'}
                value={form.openai_api_key} onChange={(e) => set('openai_api_key', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">
              DeepSeek API Key {settings?.has_deepseek_key ? '✅' : ''}
            </label>
            <input className={inputCls} type="password" placeholder={settings?.has_deepseek_key ? '已配置，留空不改' : 'sk-...'}
              value={form.deepseek_api_key} onChange={(e) => set('deepseek_api_key', e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">OpenAI 兼容端点（可选，配合 openai/* 模型）</label>
            <input className={inputCls} value={form.openai_compatible_base_url}
              onChange={(e) => set('openai_compatible_base_url', e.target.value)}
              placeholder="如 http://localhost:8000/v1" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">DeepSeek 端点（可选，默认 https://api.deepseek.com）</label>
            <input className={inputCls} value={form.deepseek_base_url}
              onChange={(e) => set('deepseek_base_url', e.target.value)}
              placeholder="https://api.deepseek.com" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Ollama 地址</label>
            <input className={inputCls} value={form.ollama_base_url}
              onChange={(e) => set('ollama_base_url', e.target.value)} />
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.auto_approve_bash}
              onChange={(e) => set('auto_approve_bash', e.target.checked)} />
            自动允许 bash 命令（不询问）
          </label>

          <div>
            <label className="text-xs text-gray-400 block mb-1">最大工具调用步数</label>
            <input className={inputCls} type="number" value={form.max_steps}
              onChange={(e) => set('max_steps', Number(e.target.value))} />
          </div>

          {msg && <div className="text-sm">{msg}</div>}

          <div className="flex justify-end gap-2">
            <button className="px-4 py-2 rounded text-sm bg-[#232937] hover:bg-[#2c3140]" onClick={onClose}>取消</button>
            <button className="px-4 py-2 rounded text-sm bg-violet-600 hover:bg-violet-500 disabled:opacity-50"
              disabled={saving} onClick={save}>
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
