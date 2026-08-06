import { io, type Socket } from 'socket.io-client'
import { useStore } from './store'

export let socket: Socket | null = null

export function connectSocket(onConnected: () => void) {
  socket = io('/', {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
  })
  // store.ts 的 sendMessage/stopRun/approve 从这里拿 socket 实例
  ;(globalThis as any).__socket = socket

  socket.on('connect', () => {
    useStore.setState({ connected: true })
    const { currentSessionId } = useStore.getState()
    if (currentSessionId) socket?.emit('join', { session_id: currentSessionId })
    onConnected()
  })

  socket.on('disconnect', () => {
    useStore.setState({ connected: false })
  })

  const st = () => useStore.getState()

  socket.on('chat.delta', (data: { session_id: string; delta: string }) => {
    if (data.session_id === st().currentSessionId) st()._onDelta(data.delta)
  })
  socket.on('agent.status', (data: { session_id: string; status: string }) => {
    if (data.session_id === st().currentSessionId) st()._onStatus(data.status)
  })
  socket.on('tool.start', (data: { session_id: string; call_id: string; name: string; arguments: Record<string, unknown> }) => {
    st()._onToolStart({ ...data })
  })
  socket.on('tool.result', (data: { session_id: string; call_id: string; name: string; ok: boolean; output: string; duration: number }) => {
    st()._onToolResult({ ...data })
  })
  socket.on('approval.request', (data: { session_id: string; call_id: string; tool: string; arguments: Record<string, unknown> }) => {
    st()._onApproval({ ...data })
  })
  socket.on('chat.error', (data: { session_id: string; message: string }) => {
    if (data.session_id === st().currentSessionId) st()._onError(data.message)
  })
  socket.on('file.changed', (data: { session_id: string; path: string }) => {
    if (data.session_id === st().currentSessionId) st()._onFileChanged(data.path)
  })
  socket.on('message.saved', (data: { session_id: string; role: string; content: string }) => {
    if (data.session_id === st().currentSessionId && data.role === 'user') {
      const m = {
        id: `user-${Date.now()}`,
        role: 'user' as const,
        content: data.content,
        created_at: new Date().toISOString(),
      }
      useStore.setState({ messages: [...st().messages, m] })
    }
  })
}

export function joinSession(sessionId: string) {
  if (!socket?.connected) return
  socket.emit('leave', { session_id: '' })
  socket.emit('join', { session_id: sessionId })
}
