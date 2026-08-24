import type {
  Agent,
  Result,
  Task,
} from './types'

const BASE: string =
  import.meta.env.VITE_API_BASE ||
  'http://localhost:8080'

interface RequestOptions {
  method?: 'GET' | 'POST'
  body?: unknown
}

async function request<T>(
  path: string,
  {
    method = 'GET',
    body,
  }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {}

  if (body !== undefined) {
    headers['Content-Type'] =
      'application/json'
  }

  const res = await fetch(
    `${BASE}${path}`,
    {
      method,
      headers,
      body:
        body !== undefined
          ? JSON.stringify(body)
          : undefined,
    },
  )

  if (!res.ok) {
    const data =
      (await res
        .json()
        .catch(() => ({}))) as {
        error?: string
      }

    throw new Error(
      data.error ||
        `HTTP ${res.status}`,
    )
  }

  return res.json() as Promise<T>
}

export const api = {
  agents: async () =>
    (await request<Agent[] | null>(
      '/agents',
    )) ?? [],

  results: async (id: string) =>
    (await request<Result[] | null>(
      `/results?id=${encodeURIComponent(id)}`,
    )) ?? [],

  queue: (
    id: string,
    task: Task,
  ) =>
    request<unknown>(
      `/queue?id=${encodeURIComponent(id)}`,
      {
        method: 'POST',
        body: task,
      },
    ),
}