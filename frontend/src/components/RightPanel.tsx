import { Files, GitBranch, TerminalSquare } from 'lucide-react'
import { useStore } from '../store'
import FileTree from './FileTree'
import EditorPane from './EditorPane'
import StepFlow from './StepFlow'
import TerminalPanel from './TerminalPanel'

export default function RightPanel() {
  const { activeRightTab, setRightTab, selectedFile } = useStore()

  if (selectedFile) {
    return <EditorPane />
  }

  const tabs = [
    { key: 'files' as const, label: '文件', icon: <Files size={13} /> },
    { key: 'flow' as const, label: '流程', icon: <GitBranch size={13} /> },
    { key: 'terminal' as const, label: '终端', icon: <TerminalSquare size={13} /> },
  ]

  return (
    <div className="w-80 shrink-0 border-l border-[#232937] bg-[#131722] flex flex-col">
      <div className="flex border-b border-[#232937]">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs ${
              activeRightTab === t.key
                ? 'text-violet-300 border-b-2 border-violet-500'
                : 'text-gray-500 hover:text-gray-300'
            }`}
            onClick={() => setRightTab(t.key)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeRightTab === 'files' && <FileTree />}
        {activeRightTab === 'flow' && <StepFlow />}
        {activeRightTab === 'terminal' && <TerminalPanel />}
      </div>
    </div>
  )
}
