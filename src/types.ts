
export type TaskType =
    | 'shell'
    | 'payload'
    | 'execute_assembly'
    | 'file_upload'
    | 'file_download'
    | 'sleep'
    | 'process'
    | 'coff_loader'

export interface AgentInfo {
  user: string
  host: string
  os: string
  ip?: string
}

export interface Agent {
  id: string
  info: AgentInfo
  last_seen: string
  ip?: string
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
  /** coff_loader only — [url_or_id, arg1, arg2, ...] */
  coff_args?: string[]
}

export interface ProcessInfo {
  pid: number
  ppid: number
  name: string
}

export interface ProcessNode extends ProcessInfo {
  children: ProcessNode[]
}
