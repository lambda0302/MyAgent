import { create } from 'zustand'
import { api } from './api'
import type {
  ApprovalRequest, Message, Session, Settings, ToolCallRecord, TreeNode,
} from './types'

interface AppState {
  // 会话
  sessions: Session[]
  currentSessionId: string | null
  messages: Message[]
  // 实时状态
  connected: boolean
  streamingText: string
  agentStatus: string
  toolRuns: ToolCallRecord[]
  pendingApproval: ApprovalRequest | null
  // 工作区
  settings: Settings | null
  tree: TreeNode[]
  workspaceRoot: string
  changedFiles: string[]
  // 面板
  activeRightTab: 'files' | 'flow' | 'terminal'
  selectedFile: string | null

  // actions
  init: () => Promise<void>
  refreshSessions: () => Promise<void>
  selectSession: (id: string) => Promise<void>
  newSession: () => Promise<void>
  deleteSession: (id: string) => Promise<void>
  renameSession: (id: string, title: string) => Promise<void>
  sendMessage: (content: string) => void
  stopRun: () => void
  approve: (callId: string, approved: boolean) => void
  refreshTree: () => Promise<void>
  refreshSettings: () => Promise<void>
  saveSettings: (data: Partial<Settings>) => Promise<void>
  setRightTab: (tab: AppState['activeRightTab']) => void
  openFile: (path: string) => void
  closeFile: () => void
  markChanged: (path: string) => void
  clearChanged: () => void
  downloadExport: () => Promise<void>

  // socket 内部
  _onDelta: (s: string) => void
  _onStatus: (status: string) => void
  _onToolStart: (r: ToolCallRecord) => void
  _onToolResult: (r: ToolCallRecord) => void
  _onApproval: (a: ApprovalRequest) => void
  _onError: (msg: string) => void
  _onFileChanged: (path: string) => void
  _onRunFinished: () => void
}

export const useStore = create<AppState>((set, get) => ({
  sessions: [],
  currentSessionId: null,
  messages: [],
  connected: false,
  streamingText: '',
  agentStatus: 'idle',
  toolRuns: [],
  pendingApproval: null,
  settings: null,
  tree: [],
  workspaceRoot: '',
  changedFiles: [],
  activeRightTab: 'files',
  selectedFile: null,

  init: async () => {
    await get().refreshSettings()
    await get().refreshSessions()
    const { currentSessionId } = get()
    if (!currentSessionId && get().sessions.length > 0) {
      await get().selectSession(get().sessions[0].id)
    }
  },

  refreshSessions: async () => {
    const sessions = await api.listSessions()
    set({ sessions })
  },

  selectSession: async (id: string) => {
    if (get().currentSessionId === id) return
    set({ currentSessionId: id, messages: [], streamingText: '', toolRuns: [], agentStatus: 'idle', pendingApproval: null })
    const msgs = await api.messages(id)
    set({ messages: msgs })
    // 刷新工作区为该会话使用的目录
    await get().refreshSettings()
  },

  newSession: async () => {
    const s = await api.createSession(get().settings?.default_model ?? '')
    await get().refreshSessions()
    await get().selectSession(s.id)
  },

  deleteSession: async (id: string) => {
    await api.deleteSession(id)
    await get().refreshSessions()
    if (get().currentSessionId === id) {
      const first = get().sessions[0]
      if (first) await get().selectSession(first.id)
      else set({ currentSessionId: null, messages: [], streamingText: '', toolRuns: [] })
    }
  },

  renameSession: async (id: string, title: string) => {
    const updated = await api.renameSession(id, title)
    set({ sessions: get().sessions.map((x) => (x.id === id ? updated : x)) })
  },

  sendMessage: (content: string) => {
    const { currentSessionId, agentStatus } = get()
    if (!currentSessionId || !content.trim() || agentStatus === 'running' || agentStatus === 'waiting_approval') return
    const sock = (globalThis as any).__socket
    if (!sock?.connected) return
    set({ streamingText: '', toolRuns: [], agentStatus: 'running' })
    sock.emit('chat.message', { session_id: currentSessionId, content: content.trim() })
  },

  stopRun: () => {
    const sock = (globalThis as any).__socket
    if (sock?.connected && get().currentSessionId) {
      sock.emit('session.stop', { session_id: get().currentSessionId })
    }
  },

  approve: (callId: string, approved: boolean) => {
    const sock = (globalThis as any).__socket
    if (sock?.connected) {
      sock.emit('approval.respond', { session_id: get().currentSessionId, call_id: callId, approved })
    }
    set({ pendingApproval: null })
  },

  refreshTree: async () => {
    const { workspaceRoot } = get()
    const data = await api.fileTree(workspaceRoot)
    set({ tree: data.tree, workspaceRoot: data.root })
  },

  refreshSettings: async () => {
    const s = await api.getSettings()
    const changed = s.workspace_root !== get().workspaceRoot
    set({ settings: s, workspaceRoot: s.workspace_root })
    if (changed) await get().refreshTree()
  },

  saveSettings: async (data: Partial<Settings>) => {
    const s = await api.saveSettings(data)
    set({ settings: s, workspaceRoot: s.workspace_root })
    await get().refreshTree()
  },

  setRightTab: (tab) => set({ activeRightTab: tab }),

  openFile: (path) => set({ selectedFile: path }),
  closeFile: () => set({ selectedFile: null }),
  markChanged: (path) => {
    if (!get().changedFiles.includes(path)) {
      set({ changedFiles: [...get().changedFiles, path] })
    }
  },
  clearChanged: () => set({ changedFiles: [] }),

  downloadExport: async () => {
    const { currentSessionId } = get()
    if (!currentSessionId) return
    const data = await api.exportSession(currentSessionId)
    const blob = new Blob([data.markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${data.title || '会话'}.md`
    a.click()
    URL.revokeObjectURL(url)
  },

  _onDelta: (s) => {
    set({ streamingText: get().streamingText + s })
  },
  _onStatus: (status) => {
    if (status === 'done' || status === 'error' || status === 'stopping') {
      set({ agentStatus: status === 'done' ? 'idle' : status === 'error' ? 'idle' : 'stopping' })
      get()._onRunFinished()
    } else {
      set({ agentStatus: status })
    }
  },
  _onToolStart: (r) => {
    const { currentSessionId } = get()
    if (r.session_id && r.session_id !== currentSessionId) return
    set({ toolRuns: [...get().toolRuns, { ...r, running: true }] })
  },
  _onToolResult: (r) => {
    const { currentSessionId } = get()
    if (r.session_id && r.session_id !== currentSessionId) return
    set({
      toolRuns: get().toolRuns.map((t) =>
        t.call_id === r.call_id ? { ...t, ...r, running: false, waiting_approval: false } : t,
      ),
    })
  },
  _onApproval: (a) => {
    set({ pendingApproval: a })
  },
  _onError: (msg) => {
    const m: Message = {
      id: `err-${Date.now()}`,
      role: 'system',
      content: `⚠️ ${msg}`,
      created_at: new Date().toISOString(),
    }
    set({ messages: [...get().messages, m], streamingText: '', agentStatus: 'idle' })
  },
  _onFileChanged: (path) => {
    get().markChanged(path)
  },
  _onRunFinished: async () => {
    const { currentSessionId } = get()
    if (!currentSessionId) return
    const msgs = await api.messages(currentSessionId)
    set({ messages: msgs, streamingText: '', toolRuns: [], pendingApproval: null })
    await get().refreshSessions()
    await get().refreshTree()
  },
}))
