export type TaskType =
  | 'shell'
  | 'payload'
  | 'execute_assembly'
  | 'file_upload'
  | 'file_download'
  | 'sleep'
  | 'process_tree'

export interface AgentInfo {
  user: string
  host: string
  os: string
}

export interface Agent {
  id: string
  info: AgentInfo
  last_seen: string
}

export interface Result {
  id: number
  agent_id: string
  command: string
  output: string
  created_at: string
}

export interface Task {
  type: TaskType
  command?: string
  payload_id?: string
}

export interface ProcessInfo {
  processId: number
  parentProcessId: number
  name: string
}

export interface ProcessNode extends ProcessInfo {
  children: ProcessNode[]
}