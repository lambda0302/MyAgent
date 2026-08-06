import { useEffect, useRef, useState } from 'react'
import { Send, Square } from 'lucide-react'
import { useStore } from '../store'
import MessageItem from './MessageItem'
import ToolCallCard from './ToolCallCard'

export default function ChatPanel() {
  const {
    messages, streamingText, toolRuns, agentStatus, currentSessionId,
    sendMessage, stopRun, pendingApproval, approve,
  } = useStore()
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const busy = agentStatus === 'running' || agentStatus === 'waiting_approval'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText, toolRuns])

  if (!currentSessionId) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        新建一个会话开始使用
      </div>
    )
  }

  const submit = () => {
    if (!input.trim() || busy) return
    sendMessage(input)
    setInput('')
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && !streamingText && (
          <div className="text-center text-gray-500 mt-16 space-y-2">
            <div className="text-2xl">🤖</div>
            <div>向编码 Agent 下达任务</div>
            <div className="text-xs text-gray-600">例如：查看 workspace 里的示例项目，然后帮我修复其中的 bug</div>
          </div>
        )}
        {messages.map((m) => (
          <MessageItem key={m.id} message={m} />
        ))}
        {streamingText && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-1 bg-violet-600">
              <span className="text-xs">🤖</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="md-body thinking-cursor">{streamingText}</div>
            </div>
          </div>
        )}
        {toolRuns.length > 0 && !streamingText && (
          <div className="ml-10 space-y-1">
            {toolRuns.map((r) => <ToolCallCard key={r.call_id} run={r} />)}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {pendingApproval && (
        <div className="mx-4 mb-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <div className="text-sm text-amber-300 mb-2 flex items-center gap-2">
            <span className="font-mono">{pendingApproval.tool}</span> 请求执行：
          </div>
          <pre className="bg-black/40 rounded p-2 text-xs overflow-x-auto whitespace-pre-wrap text-amber-100">
            {JSON.stringify(pendingApproval.arguments, null, 2)}
          </pre>
          <div className="mt-2 flex gap-2">
            <button
              className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-sm"
              onClick={() => approve(pendingApproval.call_id, true)}
            >
              允许
            </button>
            <button
              className="px-3 py-1.5 rounded bg-red-600/70 hover:bg-red-600 text-sm"
              onClick={() => approve(pendingApproval.call_id, false)}
            >
              拒绝
            </button>
          </div>
        </div>
      )}

      <div className="p-3 border-t border-[#232937]">
        <div className="flex items-end gap-2">
          <textarea
            className="flex-1 bg-[#161b26] border border-[#2a3140] rounded-lg px-3 py-2 text-sm resize-none outline-none focus:border-violet-500/60 placeholder:text-gray-600"
            rows={2}
            placeholder={busy ? 'Agent 运行中…' : '输入任务，Enter 发送，Shift+Enter 换行'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
          />
          {busy ? (
            <button
              className="w-9 h-9 rounded-lg bg-red-600/70 hover:bg-red-600 flex items-center justify-center"
              title="停止"
              onClick={stopRun}
            >
              <Square size={14} fill="white" />
            </button>
          ) : (
            <button
              className="w-9 h-9 rounded-lg bg-violet-600 hover:bg-violet-500 flex items-center justify-center disabled:opacity-40"
              disabled={!input.trim()}
              onClick={submit}
            >
              <Send size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
