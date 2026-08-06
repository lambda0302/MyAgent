import { useMemo } from 'react'
import {
  Background, Controls, ReactFlow, type Edge, type Node,
} from '@xyflow/react'
import { useStore } from '../store'
import type { Message, Step, ToolCallRecord } from '../types'

function messageToSteps(messages: Message[]): Step[] {
  const steps: Step[] = []
  for (const m of messages) {
    if (m.role === 'user') {
      steps.push({ id: `u-${m.id}`, type: 'user', title: '用户', detail: m.content.slice(0, 60) })
    } else if (m.role === 'assistant') {
      if (m.tool_calls?.length) {
        for (const tc of m.tool_calls) {
          steps.push({ id: `tc-${tc.id}`, type: 'tool', title: tc.name, detail: tc.arguments.slice(0, 60), tool: tc.name })
        }
      } else if (m.content.trim()) {
        steps.push({ id: `a-${m.id}`, type: 'assistant', title: '回复', detail: m.content.slice(0, 60) })
      }
    } else if (m.role === 'tool') {
      steps.push({ id: `t-${m.id}`, type: 'tool', title: '结果', detail: m.content.slice(0, 60) })
    }
  }
  return steps
}

function liveToSteps(runs: ToolCallRecord[]): Step[] {
  return runs.map((r) => ({
    id: `live-${r.call_id}`, type: 'tool', title: r.name,
    detail: JSON.stringify(r.arguments).slice(0, 60), tool: r.name,
    status: r.running ? 'running' : r.ok === false ? 'error' : 'done',
  }))
}

const NODE_STYLE: Record<Step['type'], React.CSSProperties> = {
  user: { background: '#1e3a8a', color: '#fff', border: '1px solid #3b82f6' },
  assistant: { background: '#4c1d95', color: '#fff', border: '1px solid #8b5cf6' },
  tool: { background: '#0f172a', color: '#a5b4fc', border: '1px solid #334155' },
}

export default function StepFlow() {
  const { messages, toolRuns } = useStore()

  const { nodes, edges } = useMemo(() => {
    const steps = [...messageToSteps(messages), ...liveToSteps(toolRuns)]
    const ns: Node[] = steps.map((s, i) => ({
      id: s.id,
      position: { x: 0, y: i * 70 },
      data: { label: '' },
      style: { ...NODE_STYLE[s.type], borderRadius: 8, padding: '8px 12px', fontSize: 11, width: 220 },
    }))
    const es: Edge[] = steps.slice(1).map((s, i) => ({
      id: `e-${i}`,
      source: steps[i].id,
      target: s.id,
      type: 'smoothstep',
      animated: s.status === 'running',
      style: { stroke: s.status === 'running' ? '#8b5cf6' : '#334155' },
    }))
    return { nodes: ns, edges: es }
  }, [messages, toolRuns])

  return (
    <div className="h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
      >
        <Background gap={16} size={1} color="#232937" />
        <Controls />
      </ReactFlow>
    </div>
  )
}
