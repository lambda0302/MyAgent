import { useEffect, useRef } from 'react'
import { Terminal as TerminalIcon, Trash2 } from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { useStore } from '../store'

export default function TerminalPanel() {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const toolRuns = useStore((s) => s.toolRuns)

  // 初始化 xterm
  useEffect(() => {
    if (!containerRef.current) return
    const term = new Terminal({ convertEol: true, fontSize: 12, theme: { background: '#0f1117' } })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    fit.fit()
    termRef.current = term
    term.writeln('\x1b[36mMyAgent 终端 — bash 工具输出回放\x1b[0m')
    const ro = new ResizeObserver(() => fit.fit())
    ro.observe(containerRef.current)
    return () => { ro.disconnect(); term.dispose(); termRef.current = null }
  }, [])

  // bash 工具调用/结果追加为终端行
  useEffect(() => {
    const last = toolRuns[toolRuns.length - 1]
    const term = termRef.current
    if (!last || last.name !== 'bash' || !term) return
    const args = (last.arguments ?? {}) as { command?: string }
    if (args.command) term.writeln(`\x1b[35m$ ${args.command}\x1b[0m`)
    if (last.output) {
      const color = last.ok === false ? '\x1b[31m' : '\x1b[37m'
      term.writeln(color + last.output.replace(/\n/g, '\r\n') + '\x1b[0m')
    }
    term.scrollToBottom()
  }, [toolRuns])

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-1.5 border-b border-[#232937] flex items-center justify-between text-xs">
        <span className="text-gray-500 flex items-center gap-1.5"><TerminalIcon size={12} /> 终端</span>
        <button
          className="text-gray-500 hover:text-gray-300 flex items-center gap-1"
          onClick={() => termRef.current?.clear()}
        >
          <Trash2 size={12} /> 清空
        </button>
      </div>
      <div ref={containerRef} className="flex-1 min-h-0 px-1" />
    </div>
  )
}
