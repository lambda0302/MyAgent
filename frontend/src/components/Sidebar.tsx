import { useRef, useState } from 'react'
import { Plus, Settings, Trash2, FileDown, Wifi, WifiOff, Pencil } from 'lucide-react'
import { useStore } from '../store'
import type { Session } from '../types'

export default function Sidebar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { sessions, currentSessionId, connected, selectSession, newSession, deleteSession, downloadExport, renameSession } = useStore()
  // 内联重命名状态：editingId 是正在编辑的会话；draft 是输入框草稿
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  // 用 ref 防止 Enter 提交后 blur 二次触发
  const editingRef = useRef<string | null>(null)

  const startEdit = (s: Session) => {
    editingRef.current = s.id
    setDraft(s.title)
    setEditingId(s.id)
  }

  const commitEdit = () => {
    const id = editingRef.current
    if (!id) return
    editingRef.current = null
    const t = draft.trim()
    if (t) renameSession(id, t)
    setEditingId(null)
  }

  const cancelEdit = () => {
    editingRef.current = null
    setEditingId(null)
  }

  return (
    <div className="w-60 shrink-0 border-r border-[#232937] bg-[#131722] flex flex-col">
      <div className="p-3 flex items-center justify-between">
        <div className="font-bold text-sm flex items-center gap-2">
          <span className="text-lg">🤖</span> MyAgent
        </div>
        {connected ? (
          <Wifi size={14} className="text-emerald-500" />
        ) : (
          <WifiOff size={14} className="text-red-500" />
        )}
      </div>

      <div className="px-3 pb-2">
        <button
          className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-sm py-2"
          onClick={() => newSession()}
        >
          <Plus size={15} /> 新建会话
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 space-y-1">
        {sessions.map((s) => (
          <div
            key={s.id}
            onClick={() => { if (editingId !== s.id) selectSession(s.id) }}
            className={`group relative rounded-lg px-3 py-2 cursor-pointer border ${
              currentSessionId === s.id
                ? 'bg-violet-600/15 border-violet-500/40'
                : 'border-transparent hover:bg-white/5'
            }`}
          >
            {editingId === s.id ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit()
                  else if (e.key === 'Escape') cancelEdit()
                }}
                onBlur={commitEdit}
                className="w-full bg-[#0f1117] border border-violet-500/60 rounded px-1.5 py-0.5 text-sm outline-none"
              />
            ) : (
              <div className="text-sm truncate" onDoubleClick={() => startEdit(s)}>{s.title}</div>
            )}
            <div className="text-[11px] text-gray-500 flex items-center gap-1.5">
              <span className="truncate">{s.model}</span>
              <span className={`shrink-0 ${
                s.status === 'running' ? 'text-blue-400' : s.status === 'error' ? 'text-red-400' : 'text-gray-600'
              }`}>
                ●
              </span>
            </div>
            <div className="hidden group-hover:flex absolute -mt-5 right-2 gap-1">
              <button
                className="p-1 rounded bg-[#232937] hover:bg-[#2c3140]"
                title="重命名"
                onClick={(e) => { e.stopPropagation(); startEdit(s) }}
              >
                <Pencil size={12} />
              </button>
              <button
                className="p-1 rounded bg-[#232937] hover:bg-[#2c3140]"
                title="导出 Markdown"
                onClick={(e) => { e.stopPropagation(); downloadExport() }}
              >
                <FileDown size={12} />
              </button>
              <button
                className="p-1 rounded bg-[#232937] hover:bg-red-600/40"
                title="删除会话"
                onClick={(e) => { e.stopPropagation(); deleteSession(s.id) }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="p-2 border-t border-[#232937]">
        <button
          className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/5"
          onClick={onOpenSettings}
        >
          <Settings size={15} /> 设置
        </button>
      </div>
    </div>
  )
}
