import * as monaco from 'monaco-editor'
import editorWorker from '../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker'

// Vite 标准 worker 配置：monaco 在后台线程跑语法高亮
self.MonacoEnvironment = {
  getWorker() {
    return new editorWorker()
  },
}

export default monaco
