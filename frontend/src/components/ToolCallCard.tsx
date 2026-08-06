import { useState, type ReactNode } from 'react'
import { CheckCircle2, Clock, Loader2, TerminalSquare, XCircle } from 'lucide-react'
import type { ToolCallRecord } from '../types'

const TOOL_ICONS: Record<string, ReactNode> = {
  read_file: <span className="text-sky-400">📖</span>,
  write_file: <span className="text-emerald-400">✏️</span>,
  list_dir: <span className="text-amber-400">📁</span>,
  glob: <span className="text-fuchsia-400">🔍</span>,
  grep: <span className="text-fuchsia-400">🔍</span>,
  bash: <span className="text-violet-400"><TerminalSquare size={14} /></span>,
}

function argsPreview(args: Record<string, unknown> | undefined) {
  if (!args) return ''
  const keys = Object.keys(args)
  if (keys.length === 0) return '{}'
  const first = keys[0]
  return `${first}: ${typeof args[first] === 'string' ? args[first] : JSON.stringify(args[first])}`
}

export default function ToolCallCard({ run }: { run: ToolCallRecord }) {
  const [open, setOpen] = useState(false)
  const running = run.running
  const waiting = run.waiting_approval
  const statusIcon = running ? (
    <Loader2 size={14} className="animate-spin text-blue-400" />
  ) : run.ok === false ? (
    <XCircle size={14} className="text-red-400" />
  ) : (
    <CheckCircle2 size={14} className="text-emerald-400" />
  )

  return (
    <div
      className={`rounded-lg border text-xs mb-2 overflow-hidden ${
        run.ok === false && !running ? 'border-red-500/40' : 'border-[#2a3140]'
      } bg-[#161b26]`}
    >
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5"
        onClick={() => setOpen(!open)}
      >
        {TOOL_ICONS[run.name] ?? <span className="text-gray-400">🛠</span>}
        <span className="font-mono font-semibold text-[#d6e2f0]">{run.name}</span>
        <span className="flex-1 truncate text-gray-400 font-mono text-[11px]">
          {argsPreview(run.arguments)}
        </span>
        {waiting && <span className="text-amber-400 flex items-center gap-1"><Clock size={12}/>等待批准</span>}
        {statusIcon}
        {run.duration !== undefined && !running && (
          <span className="text-gray-500">{run.duration}s</span>
        )}
        <span className="text-gray-500">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="px-3 pb-2 space-y-2 border-t border-[#2a3140]">
          <div>
            <div className="text-gray-500 mb-1">入参</div>
            <pre className="bg-[#0f1117] rounded p-2 overflow-x-auto text-[11px] text-sky-200">{JSON.stringify(run.arguments, null, 2)}</pre>
          </div>
          {run.output !== undefined && (
            <div>
              <div className="text-gray-500 mb-1">结果</div>
              <pre className={`bg-[#0f1117] rounded p-2 overflow-x-auto text-[11px] whitespace-pre-wrap ${run.ok === false ? 'text-red-300' : 'text-emerald-200'}`}>{run.output}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
