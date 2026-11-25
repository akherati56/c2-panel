
import type { Agent, Result, Task, FileInfo } from './types'

const BASE: string =
    import.meta.env.VITE_API_BASE || 'http://localhost:8080'

export const FILE_BASE: string =
    import.meta.env.VITE_FILE_BASE || BASE

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
    // List uploaded files
    files: async (): Promise<FileInfo[]> =>
        (await request<FileInfo[] | null>('/files')) ?? [],

    // Upload a file
    uploadFile: async (file: File): Promise<FileInfo> => {
        const formData = new FormData()
        formData.append('file', file)

        const res = await fetch(`${BASE}/files/upload`, {
            method: 'POST',
            body: formData,
        })

        if (!res.ok) {
            const data = (await res.json().catch(() => ({}))) as {
                error?: string
            }

            throw new Error(data.error || `HTTP ${res.status}`)
        }

        return res.json() as Promise<FileInfo>
    },

    // Get registered agents
    agents: async (): Promise<Agent[]> =>
        (await request<Agent[] | null>('/agents')) ?? [],

    // Get results for a specific agent
    results: async (id: string): Promise<Result[]> =>
        (await request<Result[] | null>(
            `/results?id=${encodeURIComponent(id)}`,
        )) ?? [],

    // Queue a task for an agent
    queue: (id: string, task: Task): Promise<unknown> =>
        request<unknown>(`/queue?id=${encodeURIComponent(id)}`, {
            method: 'POST',
            body: task,
        }),
}
