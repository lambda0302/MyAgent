import { Bot, User } from 'lucide-react'
import type { Message } from '../types'
import Markdown from './Markdown'
import ToolCallCard from './ToolCallCard'

function parseToolMessage(content: string) {
  try {
    const j = JSON.parse(content)
    return { callId: j.tool_call_id, output: j.content }
  } catch {
    return null
  }
}

export function ToolMessageCard({ content }: { content: string }) {
  const parsed = parseToolMessage(content)
  if (!parsed) return null
  const ok = !String(parsed.output).startsWith('[') || String(parsed.output).includes('用户拒绝') || String(parsed.output).includes('任务已被用户中断')
  return (
    <div className="ml-10">
      <ToolCallCard run={{
        call_id: parsed.callId, name: 'tool', arguments: {}, output: parsed.output, ok, running: false,
      }} />
    </div>
  )
}

export default function MessageItem({ message }: { message: Message }) {
  if (message.role === 'tool') {
    return <ToolMessageCard content={message.content} />
  }
  const isUser = message.role === 'user'
  return (
    <div className={`flex gap-3 ${isUser ? '' : ''}`}>
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-1 ${
          isUser ? 'bg-blue-600' : 'bg-violet-600'
        }`}
      >
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>
      <div className={`flex-1 min-w-0 ${isUser ? '' : ''}`}>
        {message.role === 'system' ? (
          <div className="text-xs text-amber-400 bg-amber-400/5 border border-amber-400/20 rounded px-3 py-2">
            {message.content}
          </div>
        ) : (
          <Markdown content={message.content} />
        )}
        {message.tool_calls && message.tool_calls.length > 0 && (
          <div className="mt-2 text-[11px] text-gray-500 font-mono flex flex-wrap gap-1">
            {message.tool_calls.map((tc) => (
              <span key={tc.id} className="px-2 py-0.5 rounded bg-[#1f2433] border border-[#2a3140]">
                🔧 {tc.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
