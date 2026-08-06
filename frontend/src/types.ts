export interface Session {
  id: string
  title: string
  model: string
  status: string
  created_at: string
  updated_at: string
}

export interface ToolCall {
  id: string
  name: string
  arguments: string
}

export interface Message {
  id: string
  session_id?: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  tool_calls?: ToolCall[] | null
  created_at: string
}

export interface ToolCallRecord {
  session_id?: string
  call_id: string
  name: string
  arguments?: Record<string, unknown>
  output?: string
  ok?: boolean
  duration?: number
  running?: boolean
  waiting_approval?: boolean
}

export interface ApprovalRequest {
  call_id: string
  tool: string
  arguments: Record<string, unknown>
  session_id: string
}

export interface Settings {
  workspace_root: string
  default_model: string
  has_anthropic_key: boolean
  has_openai_key: boolean
  has_deepseek_key: boolean
  anthropic_api_key?: boolean
  openai_api_key?: boolean
  deepseek_api_key?: boolean
  openai_compatible_base_url: string
  deepseek_base_url: string
  ollama_base_url: string
  auto_approve_bash: boolean
  max_steps: number
  max_tokens: number
  bash_timeout: number
}

export interface TreeNode {
  name: string
  path: string
  type: 'dir' | 'file'
  children?: TreeNode[]
}

export interface FileContent {
  path: string
  content: string
}

export interface Step {
  id: string
  type: 'user' | 'assistant' | 'tool'
  title: string
  detail: string
  tool?: string
  status?: 'running' | 'done' | 'error' | 'approved' | 'rejected'
}
