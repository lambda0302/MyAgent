import { Plus, Settings, Trash2, FileDown, Wifi, WifiOff } from 'lucide-react'
import { useStore } from '../store'

export default function Sidebar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { sessions, currentSessionId, connected, selectSession, newSession, deleteSession, downloadExport } = useStore()

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
            onClick={() => selectSession(s.id)}
            className={`group rounded-lg px-3 py-2 cursor-pointer border ${
              currentSessionId === s.id
                ? 'bg-violet-600/15 border-violet-500/40'
                : 'border-transparent hover:bg-white/5'
            }`}
          >
            <div className="text-sm truncate">{s.title}</div>
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
