import { useState } from 'react'
import { ChevronRight, ChevronDown, FileCode2, Folder, FolderOpen, Sparkles } from 'lucide-react'
import type { TreeNode } from '../types'
import { useStore } from '../store'

function FileNode({ node, depth, changedFiles, onOpen }: {
  node: TreeNode
  depth: number
  changedFiles: string[]
  onOpen: (path: string) => void
}) {
  const [open, setOpen] = useState(depth < 2)
  const isDir = node.type === 'dir'
  const changed = changedFiles.includes(node.path)

  const handleClick = () => {
    if (isDir) setOpen(!open)
    else onOpen(node.path)
  }

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 py-0.5 pr-2 rounded cursor-pointer text-[13px] hover:bg-white/5 ${
          changed ? 'text-emerald-300' : 'text-gray-300'
        }`}
        style={{ paddingLeft: depth * 12 + 4 }}
        onClick={handleClick}
      >
        {isDir ? (
          <>
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {open ? <FolderOpen size={13} className="text-amber-400" /> : <Folder size={13} className="text-amber-400" />}
          </>
        ) : (
          <>
            <span className="w-3" />
            <FileCode2 size={13} className="text-sky-400" />
          </>
        )}
        <span className="truncate">{node.name}</span>
        {changed && <Sparkles size={10} className="ml-auto text-emerald-400 shrink-0" />}
      </div>
      {isDir && open && node.children?.map((c) => (
        <FileNode key={c.path} node={c} depth={depth + 1} changedFiles={changedFiles} onOpen={onOpen} />
      ))}
    </div>
  )
}

export default function FileTree() {
  const { tree, changedFiles, openFile, workspaceRoot, refreshTree, clearChanged, settings } = useStore()

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-[#232937] flex items-center justify-between">
        <div className="text-xs text-gray-500 truncate" title={workspaceRoot}>
          📂 {workspaceRoot}
        </div>
        <div className="flex gap-1 shrink-0">
          {changedFiles.length > 0 && (
            <button className="text-[11px] text-emerald-400 hover:underline" onClick={clearChanged}>
              清除标记 ({changedFiles.length})
            </button>
          )}
          <button className="text-[11px] text-gray-500 hover:text-gray-300" onClick={() => refreshTree()}>
            刷新
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-1">
        {tree.length === 0 && (
          <div className="text-center text-gray-600 text-xs mt-8 px-4">
            工作区为空。请在设置中配置工作区路径（当前：{settings?.workspace_root}）。
          </div>
        )}
        {tree.map((n) => (
          <FileNode key={n.path} node={n} depth={0} changedFiles={changedFiles} onOpen={openFile} />
        ))}
      </div>
    </div>
  )
}
