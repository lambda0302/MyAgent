import { useEffect, useRef, useState } from 'react'
import { Save, X } from 'lucide-react'
import { useStore } from '../store'
import { api } from '../api'
import monaco from '../monaco'

function langFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', json: 'json', html: 'html', css: 'css', md: 'markdown',
    yml: 'yaml', yaml: 'yaml', sh: 'shell', bash: 'shell', sql: 'sql',
    java: 'java', go: 'go', rs: 'rust', c: 'c', cpp: 'cpp', toml: 'ini',
  }
  return map[ext] ?? 'plaintext'
}

export default function EditorPane() {
  const { selectedFile, workspaceRoot, closeFile } = useStore()
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)

  useEffect(() => {
    if (!selectedFile) return
    let cancelled = false
    api.readFile(selectedFile, workspaceRoot).then((d) => {
      if (cancelled) return
      setContent(d.content)
      setDirty(false)
    }).catch((e) => {
      if (!cancelled) { setContent(`// 读取失败：${e.message}`); setDirty(false) }
    })
    return () => { cancelled = true }
  }, [selectedFile, workspaceRoot])

  useEffect(() => {
    if (!containerRef.current || !selectedFile) return
    const editor = monaco.editor.create(containerRef.current, {
      value: content,
      language: langFromPath(selectedFile),
      theme: 'vs-dark',
      fontSize: 13,
      minimap: { enabled: false },
      automaticLayout: true,
      scrollBeyondLastLine: false,
    })
    editor.onDidChangeModelContent(() => {
      setContent(editor.getValue())
      setDirty(true)
    })
    editorRef.current = editor
    return () => {
      editor.dispose()
      editorRef.current = null
    }
  }, [selectedFile])

  if (!selectedFile) return null

  const save = async () => {
    setSaving(true)
    try {
      await api.saveFile(selectedFile, content, workspaceRoot)
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-1.5 border-b border-[#232937] flex items-center gap-2 text-xs">
        <span className="font-mono text-sky-300 truncate flex-1">{selectedFile}</span>
        <button
          className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-600/70 hover:bg-emerald-600 disabled:opacity-40"
          disabled={!dirty || saving}
          onClick={save}
        >
          <Save size={11} /> {saving ? '保存中…' : dirty ? '保存' : '已保存'}
        </button>
        <button className="p-1 rounded hover:bg-white/10" onClick={closeFile}>
          <X size={13} />
        </button>
      </div>
      <div ref={containerRef} className="flex-1 min-h-0" />
    </div>
  )
}
