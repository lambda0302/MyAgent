import { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import ChatPanel from './components/ChatPanel'
import RightPanel from './components/RightPanel'
import SettingsModal from './components/SettingsModal'
import { useStore } from './store'
import { connectSocket, joinSession } from './socket'

export default function App() {
  const [ready, setReady] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const currentSessionId = useStore((s) => s.currentSessionId)

  useEffect(() => {
    let done = false
    async function boot() {
      try {
        await useStore.getState().init()
      } catch (e) {
        console.error('初始化失败', e)
      }
      if (done) return
      connectSocket(() => {
        const id = useStore.getState().currentSessionId
        if (id) joinSession(id)
      })
      setReady(true)
    }
    boot()
    return () => { done = true }
  }, [])

  // 切换会话时加入对应 socket 房间
  useEffect(() => {
    if (currentSessionId) joinSession(currentSessionId)
  }, [currentSessionId])

  if (!ready) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        正在启动…
      </div>
    )
  }

  return (
    <div className="h-full flex">
      <Sidebar onOpenSettings={() => setShowSettings(true)} />
      <ChatPanel />
      <RightPanel />
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}
