import type { FileContent, Message, Session, Settings, TreeNode } from './types'

const BASE = ''

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const j = await res.json()
      detail = j.detail || JSON.stringify(j)
    } catch { /* ignore */ }
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}

export const api = {
  health: () => req<{ status: string }>('/api/health'),

  listSessions: () => req<Session[]>('/api/sessions'),
  createSession: (model = '') =>
    req<Session>('/api/sessions', { method: 'POST', body: JSON.stringify({ model }) }),
  deleteSession: (id: string) =>
    req<{ ok: boolean }>(`/api/sessions/${id}`, { method: 'DELETE' }),
  messages: (id: string) => req<Message[]>(`/api/sessions/${id}/messages`),
  exportSession: (id: string) =>
    req<{ title: string; markdown: string }>(`/api/sessions/${id}/export`),

  fileTree: (root = '') => req<{ root: string; tree: TreeNode[] }>(`/api/workspace/tree?root=${encodeURIComponent(root)}`),
  readFile: (path: string, root = '') =>
    req<FileContent>(`/api/workspace/file?path=${encodeURIComponent(path)}&root=${encodeURIComponent(root)}`),
  saveFile: (path: string, content: string, root = '') =>
    req<{ ok: boolean }>('/api/workspace/file', {
      method: 'POST',
      body: JSON.stringify({ path, content, root }),
    }),

  getSettings: () => req<Settings>('/api/settings'),
  saveSettings: (data: Partial<Settings>) =>
    req<Settings>('/api/settings', { method: 'PUT', body: JSON.stringify(data) }),
}
