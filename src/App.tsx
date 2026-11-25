import type { ReactNode, ElementType, ChangeEvent } from 'react'
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react'

import {
    Activity,
    Bot,
    Download,
    FileCode2,
    Boxes,
    CheckCircle2,
    ChevronRight,
    CircleDot,
    Clock3,
    Command,
    Cpu,
    GitBranch,
    LayoutDashboard,
    ListTodo,
    Network,
    RefreshCw,
    Search,
    Server,
    ShieldCheck,
    Terminal,
    UploadCloud,
    HardDrive,
    Wifi,
    WifiOff,
    X,
    Zap,
} from 'lucide-react'

import {
    Background,
    BackgroundVariant,
    Controls,
    Handle,
    MarkerType,
    MiniMap,
    Position,
    ReactFlow,
    type Edge,
    type Node,
    type NodeProps,
} from '@xyflow/react'

import '@xyflow/react/dist/style.css'
import './App.css'

import type { FileInfo } from './types'
import { api, FILE_BASE } from './api'

import type {
    Agent,
    ProcessInfo,
    ProcessNode,
    Result,
    Task,
    TaskType,
} from './types'



// --------------------------------------------------
// TYPES
// --------------------------------------------------

type View = 'overview' | 'topology' | 'console' | 'activity' | 'coff'

type GraphNodeData =
    | {
    kind: 'server'
    label: string
    subtitle: string
}
    | {
    kind: 'agent'
    agent: Agent
    active: boolean
}

type GraphNode = Node<GraphNodeData>

// --------------------------------------------------
// CONSTANTS
// --------------------------------------------------

const TASK_TYPES: {
    value: TaskType
    label: string
}[] = [
    { value: 'shell', label: 'Shell Command' },
    { value: 'process', label: 'Process Tree' },
    { value: 'payload', label: 'Payload' },
    { value: 'execute_assembly', label: 'Execute Assembly' },
    { value: 'file_download', label: 'Download File' },
    { value: 'file_upload', label: 'Upload File' },
    { value: 'sleep', label: 'Sleep' },
    { value: 'coff_loader', label: 'COFF Loader' },
]

const QUICK = [
    'whoami',
    'hostname',
    'ipconfig',
    'systeminfo',
    'dir',
    'tasklist',
]

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function timeAgo(iso: string): string {
    if (!iso) return '—'

    const timestamp = new Date(iso).getTime()

    if (!Number.isFinite(timestamp)) return '—'

    const seconds = Math.floor(
        (Date.now() - timestamp) / 1000,
    )

    if (seconds < 5) return 'now'
    if (seconds < 60) return `${seconds}s ago`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`

    return `${Math.floor(seconds / 86400)}d ago`
}

// The API exposes last_seen rather than an explicit online flag.
// This is a presentation-only status derived from the heartbeat time.
function isAgentActive(agent: Agent): boolean {
    const timestamp = new Date(agent.last_seen).getTime()

    return (
        Number.isFinite(timestamp) &&
        Date.now() - timestamp < 45000
    )
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
                    ppid: Number.isFinite(ppid) ? ppid : 0,
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

// --------------------------------------------------
// GRAPH NODES
// --------------------------------------------------

function ServerGraphNode({
                             data,
                         }: NodeProps<GraphNode>) {
    if (data.kind !== 'server') return null

    return (
        <div className="graph-server">
            <Handle
                type="source"
                position={Position.Right}
            />

            <div className="server-icon">
                <Server size={25} />
            </div>

            <div className="graph-node-title">
                {data.label}
            </div>

            <div className="graph-node-subtitle">
                {data.subtitle}
            </div>

            <div className="server-status">
                <span className="status-pulse" />
                BACKEND
            </div>
        </div>
    )
}

function AgentGraphNode({
                            data,
                            selected,
                        }: NodeProps<GraphNode>) {
    if (data.kind !== 'agent') return null

    const { agent, active } = data

    return (
        <div
            className={`graph-agent ${active ? 'graph-agent-active' : 'graph-agent-offline'} ${selected ? 'graph-agent-selected' : ''}`}
        >
            <Handle
                type="target"
                position={Position.Left}
            />

            <div className="graph-agent-top">
                <div className="graph-agent-icon">
                    <Bot size={23} />
                </div>

                <span className={`agent-indicator ${active ? 'active' : 'offline'}`} />
            </div>

            <div className="graph-agent-name">
                {agent.info.host || 'Unknown Host'}
            </div>

            <div className="graph-agent-user">
                {agent.info.user || 'Unknown User'}
            </div>

            <div className="graph-agent-divider" />

            <div className="graph-agent-meta">
                <span>{agent.info.os || 'Unknown OS'}</span>
                <span>{timeAgo(agent.last_seen)}</span>
            </div>

            <div className="graph-agent-id">
                {agent.id.slice(0, 16)}
            </div>
        </div>
    )
}

const nodeTypes = {
    server: ServerGraphNode,
    agent: AgentGraphNode,
}

// --------------------------------------------------
// TOPOLOGY
// --------------------------------------------------

function Topology({
                      agents,
                      selected,
                      onSelect,
                  }: {
    agents: Agent[]
    selected: string | null
    onSelect: (id: string) => void
}) {
    const { nodes, edges } = useMemo(() => {
        const centerX = 500
        const centerY = 330
        const radius = Math.max(
            300,
            Math.min(520, agents.length * 75),
        )

        const graphNodes: GraphNode[] = [
            {
                id: 'server',
                type: 'server',
                position: {
                    x: centerX,
                    y: centerY,
                },
                data: {
                    kind: 'server',
                    label: 'C2 SERVER',
                    subtitle: 'Command Infrastructure',
                },
            },
        ]

        const graphEdges: Edge[] = []

        agents.forEach((agent, index) => {
            const angle =
                (2 * Math.PI * index) /
                Math.max(agents.length, 1) -
                Math.PI / 2

            const x =
                centerX + Math.cos(angle) * radius

            const y =
                centerY + Math.sin(angle) * radius

            const active = isAgentActive(agent)

            graphNodes.push({
                id: agent.id,
                type: 'agent',
                position: { x, y },
                selected: selected === agent.id,
                data: {
                    kind: 'agent',
                    agent,
                    active,
                },
            })

            graphEdges.push({
                id: `server-${agent.id}`,
                source: 'server',
                target: agent.id,
                animated: active,
                type: 'smoothstep',
                style: {
                    stroke: active ? '#38bdf8' : '#344155',
                    strokeWidth: active ? 2 : 1,
                },
                markerEnd: {
                    type: MarkerType.ArrowClosed,
                    color: active ? '#38bdf8' : '#344155',
                },
            })
        })

        return {
            nodes: graphNodes,
            edges: graphEdges,
        }
    }, [agents, selected])

    return (
        <div className="topology-canvas">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodeClick={(_, node) => {
                    if (node.data.kind === 'agent') {
                        onSelect(node.data.agent.id)
                    }
                }}
                fitView
                fitViewOptions={{ padding: 0.25 }}
                minZoom={0.15}
                maxZoom={2}
                nodesDraggable
                nodesConnectable={false}
                elementsSelectable
            >
                <Background
                    variant={BackgroundVariant.Dots}
                    gap={22}
                    size={1}
                    color="#263449"
                />

                <Controls
                    showInteractive={false}
                />

                <MiniMap
                    nodeColor={(node) => {
                        if (node.id === 'server') {
                            return '#38bdf8'
                        }

                        const data = node.data as GraphNodeData

                        return data.kind === 'agent' && data.active
                            ? '#34d399'
                            : '#64748b'
                    }}
                    maskColor="rgba(5,10,20,0.75)"
                />
            </ReactFlow>
        </div>
    )
}

// --------------------------------------------------
// PROCESS TREE
// --------------------------------------------------

function ProcessTree({
                         nodes,
                     }: {
    nodes: ProcessNode[]
}) {
    const [expanded, setExpanded] =
        useState<Set<number>>(() => new Set())

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
    ): ReactNode {
        const hasChildren = node.children.length > 0
        const isExpanded = expanded.has(node.pid)

        return (
            <div
                key={`${node.pid}-${node.ppid}`}
                className="process-node"
            >
                <div
                    className="process-row"
                    style={{ paddingLeft: depth * 22 }}
                    onClick={() => {
                        if (hasChildren) {
                            toggle(node.pid)
                        }
                    }}
                >
                    <span className="process-arrow">
                        {hasChildren
                            ? isExpanded
                                ? '▼'
                                : '▶'
                            : '•'}
                    </span>

                    <Cpu size={14} className="process-icon" />

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
                        renderNode(child, depth + 1),
                    )}
            </div>
        )
    }

    return (
        <div className="process-tree">
            {nodes.map((node) => renderNode(node, 0))}
        </div>
    )
}

// --------------------------------------------------
// STAT CARD
// --------------------------------------------------

function StatCard({
                      title,
                      value,
                      subtitle,
                      icon: Icon,
                      color,
                  }: {
    title: string
    value: string | number
    subtitle: string
    icon: ElementType
    color: string
}) {
    return (
        <div className="stat-card">
            <div className="stat-card-top">
                <span>{title}</span>

                <div
                    className="stat-icon"
                    style={{
                        color,
                        background: `${color}16`,
                    }}
                >
                    <Icon size={19} />
                </div>
            </div>

            <div className="stat-value">
                {value}
            </div>

            <div className="stat-subtitle">
                {subtitle}
            </div>
        </div>
    )
}

// --------------------------------------------------
// MAIN APPLICATION
// --------------------------------------------------

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

    const [coffUrl, setCoffUrl] =
        useState('')

    const [coffArgs, setCoffArgs] =
        useState('')

    const [online, setOnline] =
        useState(false)

    const [sending, setSending] =
        useState(false)

    const [toast, setToast] =
        useState<string | null>(null)

    const [view, setView] =
        useState<View>('overview')



    const consoleRef =
        useRef<HTMLDivElement>(null)

    const [files, setFiles] = useState<FileInfo[]>([])
    const [uploading, setUploading] = useState(false)
    const [selectedCoffFile, setSelectedCoffFile] = useState('')
    const [fileSearch, setFileSearch] = useState('')
    const fileInputRef = useRef<HTMLInputElement>(null)

    // ----------------------------------------------
    // API POLLING - ORIGINAL BEHAVIOR
    // ----------------------------------------------

    const loadAgents = useCallback(
        async () => {
            try {
                setAgents(await api.agents())
                setOnline(true)
            } catch {
                setOnline(false)
            }
        },
        [],
    )

    const loadResults = useCallback(
        async (id: string | null) => {
            if (!id) return

            try {
                setResults(await api.results(id))
            } catch {
                // Preserve existing polling behavior.
            }
        },
        [],
    )

    useEffect(() => {
        loadAgents()

        const timer = setInterval(
            loadAgents,
            3000,
        )

        return () => clearInterval(timer)
    }, [loadAgents])

    useEffect(() => {
        loadResults(selected)

        const timer = setInterval(
            () => loadResults(selected),
            3000,
        )

        return () => clearInterval(timer)
    }, [selected, loadResults])

    useEffect(() => {
        if (
            selected &&
            !agents.some((agent) => agent.id === selected)
        ) {
            setSelected(null)
        }
    }, [agents, selected])

    useEffect(() => {
        const element = consoleRef.current

        if (!element) return

        const threshold = 80

        const nearBottom =
            element.scrollHeight -
            element.scrollTop -
            element.clientHeight <
            threshold

        if (nearBottom) {
            element.scrollTop = element.scrollHeight
        }
    }, [results])

    const loadFiles = useCallback(async () => {
        try {
            const data = await api.files()
            setFiles(data)
        } catch (error) {
            console.error('Failed to load files:', error)
        }
    }, [])

    useEffect(() => {
        void loadFiles()
    }, [loadFiles])

    // ----------------------------------------------
    // HELPERS
    // ----------------------------------------------

    function showToast(message: string) {
        setToast(message)

        setTimeout(() => setToast(null), 2500)
    }

    async function handleCoffUpload(
        event: ChangeEvent<HTMLInputElement>,
    ) {
        const file = event.target.files?.[0]
        if (!file) return

        try {
            setUploading(true)
            const uploaded = await api.uploadFile(file)
            await loadFiles()

            setSelectedCoffFile(uploaded.id)
            setCoffUrl(
                `${FILE_BASE}/files/${encodeURIComponent(uploaded.id)}`,
            )

            showToast(`Uploaded ${uploaded.name}`)
        } catch (error) {
            showToast(
                `Upload failed: ${
                    error instanceof Error ? error.message : 'Unknown error'
                }`,
            )
        } finally {
            setUploading(false)
            event.target.value = ''
        }
    }

    function useCoffFile(file: FileInfo) {
        setSelectedCoffFile(file.id)
        setCoffUrl(`${FILE_BASE}/files/${encodeURIComponent(file.id)}`)
        setTaskType('coff_loader')
        setView('console')
        showToast(`${file.name} selected for COFF task`)
    }

    function resetInputs() {
        setCommand('')
        setPayloadId('')
        setCoffUrl('')
        setCoffArgs('')
    }

    function selectAgent(id: string) {
        setSelected(id)
        setView('console')
    }

    // ----------------------------------------------
    // TASK BUILDER - ORIGINAL PAYLOAD STRUCTURES
    // ----------------------------------------------

    function buildTask(): Task | null {
        if (taskType === 'shell') {
            if (!command.trim()) return null

            return {
                type: 'shell',
                command: command.trim(),
            }
        }

        if (taskType === 'payload') {
            if (!payloadId.trim()) return null

            return {
                type: 'payload',
                payload_id: payloadId.trim(),
            }
        }

        if (taskType === 'execute_assembly') {
            if (!payloadId.trim()) return null

            return {
                type: 'execute_assembly',
                payload_id: payloadId.trim(),
            }
        }

        if (taskType === 'coff_loader') {
            if (!coffUrl.trim()) return null

            const extra = coffArgs.trim()
                ? coffArgs.trim().split(/\s+/)
                : []

            return {
                type: 'coff_loader',
                coff_args: [coffUrl.trim(), ...extra],
            }
        }

        if (
            taskType === 'file_download' ||
            taskType === 'file_upload'
        ) {
            if (!payloadId.trim()) return null

            return {
                type: taskType,
                payload_id: payloadId.trim(),
            }
        }

        return {
            type: taskType,
        }
    }

    async function sendTask() {
        if (!selected) return

        const task = buildTask()

        if (!task) {
            showToast(
                taskType === 'shell'
                    ? 'Enter a command'
                    : taskType === 'coff_loader'
                        ? 'Enter a COFF URL and arguments'
                        : 'Enter a payload ID',
            )

            return
        }

        setSending(true)

        try {
            await api.queue(selected, task)

            resetInputs()

            showToast(`${taskType} task queued`)
        } catch (error) {
            showToast(
                `Error: ${
                    error instanceof Error
                        ? error.message
                        : 'Unknown error'
                }`,
            )
        } finally {
            setSending(false)
        }
    }

    // ----------------------------------------------
    // DERIVED DATA
    // ----------------------------------------------

    const agent = agents.find(
        (item) => item.id === selected,
    )

    const activeAgents = agents.filter(
        isAgentActive,
    )

    const filteredFiles = files.filter((file) =>
        file.name.toLowerCase().includes(fileSearch.trim().toLowerCase()),
    )

    const totalFileBytes = files.reduce((total, file) => total + file.size, 0)

    const isShell = taskType === 'shell'

    const isPayload =
        taskType === 'payload' ||
        taskType === 'execute_assembly' ||
        taskType === 'file_download' ||
        taskType === 'file_upload'

    const pageTitle = {
        overview: 'Dashboard Overview',
        topology: 'Agent Topology',
        console: 'Agent Console',
        activity: 'Activity Monitor',
        coff: 'COFF Management',
    }[view]

    // ----------------------------------------------
    // NAVIGATION
    // ----------------------------------------------

    const navigation = [
        {
            id: 'overview' as View,
            label: 'Overview',
            icon: LayoutDashboard,
        },
        {
            id: 'topology' as View,
            label: 'Topology',
            icon: Network,
        },
        {
            id: 'console' as View,
            label: 'Console',
            icon: Terminal,
        },
        {
            id: 'activity' as View,
            label: 'Activity',
            icon: Activity,
        },
        {
            id: 'coff' as View,
            label: 'COFF Management',
            icon: FileCode2,
        },
    ]

    // ----------------------------------------------
    // RENDER
    // ----------------------------------------------

    return (
        <div className="app-shell">

            {/* SIDEBAR */}

            <aside className="sidebar">

                <div className="sidebar-brand">
                    <div className="brand-symbol">
                        <ShieldCheck size={25} />
                    </div>

                    <div>
                        <div className="brand-title">
                            C2 DASHBOARD
                        </div>

                        <div className="brand-subtitle">
                            COMMAND PLATFORM
                        </div>
                    </div>
                </div>

                <div className="sidebar-section-label">
                    WORKSPACE
                </div>

                <nav className="sidebar-nav">
                    {navigation.map((item) => {
                        const Icon = item.icon

                        return (
                            <button
                                key={item.id}
                                className={`nav-item ${view === item.id ? 'nav-active' : ''}`}
                                onClick={() => setView(item.id)}
                            >
                                <Icon size={18} />

                                <span>{item.label}</span>

                                {view === item.id && (
                                    <ChevronRight
                                        size={15}
                                        className="nav-chevron"
                                    />
                                )}
                            </button>
                        )
                    })}
                </nav>

                <div className="sidebar-section-label agents-label">
                    REGISTERED AGENTS
                    <span>{agents.length}</span>
                </div>

                <div className="sidebar-agent-list">
                    {agents.length === 0 ? (
                        <div className="sidebar-empty">
                            <Bot size={20} />
                            <span>No agents registered</span>
                        </div>
                    ) : (
                        agents.map((item) => {
                            const active = isAgentActive(item)

                            return (
                                <button
                                    key={item.id}
                                    className={`sidebar-agent ${selected === item.id ? 'sidebar-agent-selected' : ''}`}
                                    onClick={() => selectAgent(item.id)}
                                >
                                    <div className="sidebar-agent-icon">
                                        <MonitorIcon />
                                    </div>

                                    <div className="sidebar-agent-info">
                                        <div className="sidebar-agent-name">
                                            {item.info.host}
                                        </div>

                                        <div className="sidebar-agent-user">
                                            {item.info.user}
                                        </div>
                                    </div>

                                    <span
                                        className={`agent-indicator ${active ? 'active' : 'offline'}`}
                                    />
                                </button>
                            )
                        })
                    )}
                </div>

                <div className="sidebar-bottom">
                    <div className="sidebar-connection">
                        <span className={`connection-dot ${online ? 'connected' : ''}`} />

                        <div>
                            <div className="connection-title">
                                API CONNECTION
                            </div>

                            <div className="connection-value">
                                {online ? 'Connected' : 'Disconnected'}
                            </div>
                        </div>

                        {online ? (
                            <Wifi size={17} className="connection-icon" />
                        ) : (
                            <WifiOff size={17} className="connection-icon" />
                        )}
                    </div>

                    <div className="sidebar-version">
                        SENTINEL UI <span>v1.0.0</span>
                    </div>
                </div>
            </aside>

            {/* MAIN */}

            <main className="main-content">

                {/* TOP BAR */}

                <header className="topbar">
                    <div className="topbar-left">
                        <div className="breadcrumb">
                            WORKSPACE
                            <ChevronRight size={14} />
                            <span>{pageTitle}</span>
                        </div>

                        <h1>{pageTitle}</h1>
                    </div>

                    <div className="topbar-right">
                        <div className="system-status">
                            <span className={`connection-dot ${online ? 'connected' : ''}`} />
                            {online ? 'SYSTEM ONLINE' : 'SYSTEM OFFLINE'}
                        </div>

                        <button
                            className="icon-button"
                            title="Refresh agents"
                            onClick={loadAgents}
                        >
                            <RefreshCw size={17} />
                        </button>

                        <div className="topbar-avatar">
                            <ShieldCheck size={19} />
                        </div>
                    </div>
                </header>

                {/* PAGE CONTENT */}

                <div className="page-content">

                    {/* OVERVIEW */}

                    {view === 'overview' && (
                        <>
                            <div className="welcome-row">
                                <div>
                                    <div className="welcome-title">
                                        Infrastructure Overview
                                    </div>

                                    <div className="welcome-description">
                                        Monitor registered endpoints and infrastructure status.
                                    </div>
                                </div>

                                <div className="live-badge">
                                    <span className="status-pulse" />
                                    LIVE MONITORING
                                </div>
                            </div>

                            <div className="stats-grid">
                                <StatCard
                                    title="TOTAL AGENTS"
                                    value={agents.length}
                                    subtitle="Registered endpoints"
                                    icon={Bot}
                                    color="#38bdf8"
                                />

                                <StatCard
                                    title="ACTIVE AGENTS"
                                    value={activeAgents.length}
                                    subtitle="Seen within 45 seconds"
                                    icon={Wifi}
                                    color="#34d399"
                                />

                                <StatCard
                                    title="OFFLINE AGENTS"
                                    value={agents.length - activeAgents.length}
                                    subtitle="No recent heartbeat"
                                    icon={WifiOff}
                                    color="#fb7185"
                                />

                                <StatCard
                                    title="TASK RESULTS"
                                    value={results.length}
                                    subtitle="Selected agent results"
                                    icon={ListTodo}
                                    color="#a78bfa"
                                />
                            </div>

                            <div className="section-heading">
                                <div>
                                    <h2>Network Topology</h2>
                                    <p>Visual representation of registered agents</p>
                                </div>

                                <button
                                    className="text-button"
                                    onClick={() => setView('topology')}
                                >
                                    Expand Graph
                                    <ChevronRight size={15} />
                                </button>
                            </div>

                            <div className="overview-graph-card">
                                <div className="graph-card-header">
                                    <div className="graph-card-title">
                                        <Network size={17} />
                                        Infrastructure Map
                                    </div>

                                    <span className="graph-count">
                                        {agents.length} ENDPOINTS
                                    </span>
                                </div>

                                <Topology
                                    agents={agents}
                                    selected={selected}
                                    onSelect={selectAgent}
                                />
                            </div>

                            <div className="section-heading">
                                <div>
                                    <h2>Registered Endpoints</h2>
                                    <p>Recently seen agents</p>
                                </div>
                            </div>

                            <div className="agent-grid">
                                {agents.slice(0, 6).map((item) => {
                                    const active = isAgentActive(item)

                                    return (
                                        <button
                                            key={item.id}
                                            className="agent-card"
                                            onClick={() => selectAgent(item.id)}
                                        >
                                            <div className="agent-card-header">
                                                <div className="agent-card-icon">
                                                    <Bot size={22} />
                                                </div>

                                                <span className={`agent-status-tag ${active ? 'tag-active' : 'tag-offline'}`}>
                                                    {active ? 'ACTIVE' : 'OFFLINE'}
                                                </span>
                                            </div>

                                            <div className="agent-card-host">
                                                {item.info.host}
                                            </div>

                                            <div className="agent-card-user">
                                                {item.info.user}
                                            </div>

                                            <div className="agent-card-footer">
                                                <span>{item.info.os}</span>
                                                <span>{timeAgo(item.last_seen)}</span>
                                            </div>
                                        </button>
                                    )
                                })}

                                {agents.length === 0 && (
                                    <div className="empty-panel">
                                        <Bot size={28} />
                                        <p>No registered endpoints yet.</p>
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* TOPOLOGY */}

                    {view === 'topology' && (
                        <>
                            <div className="welcome-row">
                                <div>
                                    <div className="welcome-title">
                                        Agent Network Map
                                    </div>

                                    <div className="welcome-description">
                                        Select an endpoint to inspect its details.
                                    </div>
                                </div>

                                <div className="topology-legend">
                                    <span>
                                        <i className="legend-active" />
                                        Recent heartbeat
                                    </span>

                                    <span>
                                        <i className="legend-offline" />
                                        Stale heartbeat
                                    </span>
                                </div>
                            </div>

                            <div className="topology-layout">
                                <div className="topology-main-card">
                                    <div className="graph-card-header">
                                        <div className="graph-card-title">
                                            <Network size={17} />
                                            Agent Topology
                                        </div>

                                        <span className="graph-count">
                                            {agents.length} NODES
                                        </span>
                                    </div>

                                    <Topology
                                        agents={agents}
                                        selected={selected}
                                        onSelect={setSelected}
                                    />
                                </div>

                                <div className="agent-detail-card">
                                    <div className="detail-heading">
                                        <span>ENDPOINT DETAILS</span>
                                        <CircleDot size={17} />
                                    </div>

                                    {agent ? (
                                        <>
                                            <div className="detail-agent-icon">
                                                <Bot size={30} />
                                            </div>

                                            <h3>{agent.info.host}</h3>

                                            <span className={`agent-status-tag ${isAgentActive(agent) ? 'tag-active' : 'tag-offline'}`}>
                                                {isAgentActive(agent) ? 'ACTIVE' : 'OFFLINE'}
                                            </span>

                                            <div className="detail-divider" />

                                            <DetailRow label="Username" value={agent.info.user} />
                                            <DetailRow label="Operating System" value={agent.info.os} />
                                            <DetailRow label="Agent ID" value={agent.id} />
                                            <DetailRow label="Last Seen" value={timeAgo(agent.last_seen)} />

                                            <button
                                                className="primary-button detail-button"
                                                onClick={() => setView('console')}
                                            >
                                                <Terminal size={16} />
                                                Open Console
                                            </button>
                                        </>
                                    ) : (
                                        <div className="detail-empty">
                                            <Bot size={32} />
                                            <p>Select an agent from the graph.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}

                    {/* CONSOLE */}

                    {view === 'console' && (
                        <>
                            {!agent ? (
                                <div className="empty-workspace">
                                    <Terminal size={38} />
                                    <h2>No Agent Selected</h2>
                                    <p>Select an agent from the sidebar to open its console.</p>

                                    <button
                                        className="primary-button"
                                        onClick={() => setView('overview')}
                                    >
                                        View Agents
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="console-agent-header">
                                        <div className="console-agent-icon">
                                            <Bot size={25} />
                                        </div>

                                        <div className="console-agent-info">
                                            <h2>{agent.info.host}</h2>
                                            <span>
                                                {agent.info.user} · {agent.info.os}
                                            </span>
                                        </div>

                                        <span className={`agent-status-tag ${isAgentActive(agent) ? 'tag-active' : 'tag-offline'}`}>
                                            {isAgentActive(agent) ? 'ACTIVE' : 'OFFLINE'}
                                        </span>

                                        <div className="console-agent-id">
                                            {agent.id}
                                        </div>
                                    </div>

                                    <div className="console-panel">
                                        <div className="console-panel-header">
                                            <div>
                                                <Terminal size={17} />
                                                COMMAND CONSOLE
                                            </div>

                                            <span>
                                                {results.length} RESULTS
                                            </span>
                                        </div>

                                        <div
                                            className="console-output"
                                            ref={consoleRef}
                                        >
                                            {results.length === 0 && (
                                                <div className="console-empty-state">
                                                    <Command size={30} />
                                                    <p>No results yet.</p>
                                                    <span>Submit a task to view its output here.</span>
                                                </div>
                                            )}

                                            {results.map((result) => {
                                                const tree = parseProcessOutput(result.output)

                                                const isProcessResult =
                                                    taskType === 'process' ||
                                                    result.command === 'process tree'

                                                return (
                                                    <div
                                                        key={result.id}
                                                        className="console-entry"
                                                    >
                                                        <div className="console-command-line">
                                                            <span className="console-prompt">›</span>

                                                            <span>
                                                                {result.command || '(no command)'}
                                                            </span>

                                                            <span className="console-time">
                                                                {new Date(result.created_at).toLocaleTimeString()}
                                                            </span>
                                                        </div>

                                                        {isProcessResult && tree ? (
                                                            <ProcessTree nodes={tree} />
                                                        ) : result.output ? (
                                                            <pre className="console-result">
                                                                {result.output}
                                                            </pre>
                                                        ) : (
                                                            <div className="console-running">
                                                                <span className="status-pulse" />
                                                                Waiting for result...
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>

                                    {/* QUICK COMMANDS */}

                                    {isShell && (
                                        <div className="quick-commands">
                                            <span>QUICK COMMANDS</span>

                                            {QUICK.map((item) => (
                                                <button
                                                    key={item}
                                                    onClick={() => setCommand(item)}
                                                >
                                                    {item}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {/* TASK COMPOSER */}

                                    <div className="task-panel">
                                        <div className="task-panel-heading">
                                            <div>
                                                <Zap size={18} />
                                                TASK COMPOSER
                                            </div>

                                            <span>
                                                TARGET: {agent.info.host}
                                            </span>
                                        </div>

                                        <div className="task-type-selector">
                                            <label>Task Type</label>

                                            <select
                                                value={taskType}
                                                onChange={(event) => {
                                                    setTaskType(event.target.value as TaskType)
                                                    resetInputs()
                                                }}
                                            >
                                                {TASK_TYPES.map((item) => (
                                                    <option
                                                        key={item.value}
                                                        value={item.value}
                                                    >
                                                        {item.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {isShell && (
                                            <form
                                                className="task-composer"
                                                onSubmit={(event) => {
                                                    event.preventDefault()
                                                    sendTask()
                                                }}
                                            >
                                                <span className="composer-prefix">›</span>

                                                <input
                                                    value={command}
                                                    onChange={(event) => setCommand(event.target.value)}
                                                    placeholder="Enter command..."
                                                />

                                                <button
                                                    type="submit"
                                                    disabled={sending || !command.trim()}
                                                    className="primary-button"
                                                >
                                                    {sending ? 'Sending...' : 'Submit'}
                                                </button>
                                            </form>
                                        )}

                                        {isPayload && (
                                            <form
                                                className="task-composer"
                                                onSubmit={(event) => {
                                                    event.preventDefault()
                                                    sendTask()
                                                }}
                                            >
                                                <span className="composer-prefix">#</span>

                                                <input
                                                    value={payloadId}
                                                    onChange={(event) => setPayloadId(event.target.value)}
                                                    placeholder="Enter payload ID..."
                                                />

                                                <button
                                                    type="submit"
                                                    disabled={sending || !payloadId.trim()}
                                                    className="primary-button"
                                                >
                                                    {sending ? 'Sending...' : 'Submit'}
                                                </button>
                                            </form>
                                        )}

                                        {taskType === 'coff_loader' && (
                                            <form
                                                className="task-composer coff-composer"
                                                onSubmit={(event) => {
                                                    event.preventDefault()
                                                    sendTask()
                                                }}
                                            >

                                                <select
                                                    value={selectedCoffFile}
                                                    onChange={(event) => {
                                                        const id = event.target.value

                                                        setSelectedCoffFile(id)

                                                        const url = id
                                                            ? `${FILE_BASE}/files/${encodeURIComponent(id)}`
                                                            : ''

                                                        setCoffUrl(url)
                                                    }}
                                                >
                                                    <option value="">Select a COFF file...</option>

                                                    {files.map((file) => (
                                                        <option key={file.id} value={file.id}>
                                                            {file.name} ({(file.size / 1024).toFixed(1)} KB)
                                                        </option>
                                                    ))}
                                                </select>


                                                <input
                                                    value={coffArgs}
                                                    onChange={(event) => setCoffArgs(event.target.value)}
                                                    placeholder="Arguments..."
                                                />

                                                <button
                                                    type="submit"
                                                    disabled={sending || !coffUrl.trim()}
                                                    className="primary-button"
                                                >
                                                    {sending ? 'Sending...' : 'Submit'}
                                                </button>
                                            </form>
                                        )}

                                        {(taskType === 'process' || taskType === 'sleep') && (
                                            <div className="task-action-row">
                                                <div>
                                                    {taskType === 'process' ? (
                                                        <>
                                                            <GitBranch size={18} />
                                                            Process Tree
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Clock3 size={18} />
                                                            Sleep Task
                                                        </>
                                                    )}
                                                </div>

                                                <button
                                                    className="primary-button"
                                                    disabled={sending}
                                                    onClick={sendTask}
                                                >
                                                    {sending
                                                        ? 'Sending...'
                                                        : taskType === 'process'
                                                            ? 'Get Process Tree'
                                                            : 'Queue Sleep'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </>
                    )}

                    {/* ACTIVITY */}

                    {view === 'activity' && (
                        <>
                            <div className="welcome-row">
                                <div>
                                    <div className="welcome-title">
                                        Activity Monitor
                                    </div>

                                    <div className="welcome-description">
                                        Recent results for the selected agent.
                                    </div>
                                </div>

                                {agent && (
                                    <div className="live-badge">
                                        {agent.info.host}
                                    </div>
                                )}
                            </div>

                            {!selected ? (
                                <div className="empty-workspace">
                                    <Activity size={38} />
                                    <h2>Select an Agent</h2>
                                    <p>Select an agent to view its activity.</p>
                                </div>
                            ) : (
                                <div className="activity-card">
                                    <div className="activity-header">
                                        <div>
                                            <Activity size={18} />
                                            RECENT RESULTS
                                        </div>

                                        <span>{results.length} RECORDS</span>
                                    </div>

                                    {results.length === 0 ? (
                                        <div className="empty-panel">
                                            No activity records available.
                                        </div>
                                    ) : (
                                        <div className="activity-list">
                                            {results.map((result) => (
                                                <div
                                                    key={result.id}
                                                    className="activity-item"
                                                >
                                                    <div className="activity-item-icon">
                                                        <CheckCircle2 size={18} />
                                                    </div>

                                                    <div className="activity-item-content">
                                                        <strong>
                                                            {result.command || 'Task result'}
                                                        </strong>

                                                        <span>
                                                            Agent: {result.agent_id.slice(0, 16)}
                                                        </span>
                                                    </div>

                                                    <time>
                                                        {new Date(result.created_at).toLocaleString()}
                                                    </time>

                                                    <button
                                                        className="icon-button small"
                                                        onClick={() => setView('console')}
                                                        title="Open console"
                                                    >
                                                        <ChevronRight size={17} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {/* COFF MANAGEMENT */}

                    {view === 'coff' && (
                        <>
                            <div className="welcome-row">
                                <div>
                                    <div className="welcome-title">
                                        COFF Module Library
                                    </div>
                                    <div className="welcome-description">
                                        Upload, browse, and select object files for COFF tasks.
                                    </div>
                                </div>

                                <div className="coff-toolbar-actions">
                                    <button
                                        className="secondary-button"
                                        onClick={() => void loadFiles()}
                                        disabled={uploading}
                                    >
                                        <RefreshCw size={15} />
                                        Refresh
                                    </button>

                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".o,.obj,.bin"
                                        hidden
                                        onChange={handleCoffUpload}
                                    />

                                    <button
                                        className="primary-button"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={uploading}
                                    >
                                        <UploadCloud size={16} />
                                        {uploading ? 'Uploading...' : 'Upload COFF'}
                                    </button>
                                </div>
                            </div>

                            <div className="coff-stats-grid">
                                <div className="coff-stat-card">
                                    <div className="coff-stat-icon"><FileCode2 size={19} /></div>
                                    <div>
                                        <span>LIBRARY FILES</span>
                                        <strong>{files.length}</strong>
                                    </div>
                                </div>

                                <div className="coff-stat-card">
                                    <div className="coff-stat-icon"><HardDrive size={19} /></div>
                                    <div>
                                        <span>TOTAL STORAGE</span>
                                        <strong>
                                            {totalFileBytes >= 1024 * 1024
                                                ? `${(totalFileBytes / (1024 * 1024)).toFixed(2)} MB`
                                                : `${(totalFileBytes / 1024).toFixed(1)} KB`}
                                        </strong>
                                    </div>
                                </div>

                                <div className="coff-stat-card">
                                    <div className="coff-stat-icon"><Server size={19} /></div>
                                    <div>
                                        <span>API STATUS</span>
                                        <strong className={online ? 'coff-status-online' : 'coff-status-offline'}>
                                            {online ? 'Connected' : 'Check API'}
                                        </strong>
                                    </div>
                                </div>
                            </div>

                            <div className="coff-library-card">
                                <div className="coff-library-header">
                                    <div>
                                        <h2>Uploaded Modules</h2>
                                        <p>Files stored by the Go file service</p>
                                    </div>

                                    <label className="coff-search">
                                        <Search size={16} />
                                        <input
                                            value={fileSearch}
                                            onChange={(event) => setFileSearch(event.target.value)}
                                            placeholder="Search files..."
                                        />
                                    </label>
                                </div>

                                {filteredFiles.length === 0 ? (
                                    <div className="coff-empty-state">
                                        <FileCode2 size={36} />
                                        <h3>{files.length === 0 ? 'No COFF files yet' : 'No matching files'}</h3>
                                        <p>
                                            {files.length === 0
                                                ? 'Upload an object file to add it to your module library.'
                                                : 'Try another filename or clear your search.'}
                                        </p>
                                        {files.length === 0 && (
                                            <button
                                                className="primary-button"
                                                onClick={() => fileInputRef.current?.click()}
                                                disabled={uploading}
                                            >
                                                <UploadCloud size={16} />
                                                Upload your first file
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="coff-file-list">
                                        <div className="coff-file-list-heading">
                                            <span>FILE</span>
                                            <span>SIZE</span>
                                            <span>FILE ID</span>
                                            <span>ACTIONS</span>
                                        </div>

                                        {filteredFiles.map((file) => (
                                            <div className="coff-file-row" key={file.id}>
                                                <div className="coff-file-name">
                                                    <div className="coff-file-icon">
                                                        <FileCode2 size={19} />
                                                    </div>
                                                    <div>
                                                        <strong title={file.name}>{file.name}</strong>
                                                        <span>COFF / Object file</span>
                                                    </div>
                                                </div>

                                                <span className="coff-file-size">
                                  {file.size >= 1024 * 1024
                                      ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
                                      : `${(file.size / 1024).toFixed(1)} KB`}
                                </span>

                                                <code className="coff-file-id" title={file.id}>
                                                    {file.id}
                                                </code>

                                                <div className="coff-file-actions">
                                                    <a
                                                        className="icon-button"
                                                        href={`${FILE_BASE}/files/${encodeURIComponent(file.id)}`}
                                                        title={`Download ${file.name}`}
                                                        download={file.name}
                                                    >
                                                        <Download size={16} />
                                                    </a>

                                                    <button
                                                        className="primary-button coff-use-button"
                                                        onClick={() => useCoffFile(file)}
                                                    >
                                                        Use in task
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="coff-info-note">
                                <ShieldCheck size={17} />
                                <span>
                      Selecting <strong>Use in task</strong> opens the Agent Console,
                      selects this file for the COFF Loader, and prepares its download URL.
                      You still need to choose an agent before queueing the task.
                    </span>
                            </div>
                        </>
                    )}
                </div>

                <footer className="app-footer">
                    <span>
                        <ShieldCheck size={14} />
                        SENTINEL COMMAND PLATFORM
                    </span>

                    <span>
                        API POLLING: 3000MS
                    </span>
                </footer>
            </main>

            {/* TOAST */}

            {toast && (
                <div className="toast">
                    <CheckCircle2 size={18} />
                    {toast}

                    <button onClick={() => setToast(null)}>
                        <X size={15} />
                    </button>
                </div>
            )}
        </div>
    )
}

// --------------------------------------------------
// SMALL COMPONENTS
// --------------------------------------------------

function MonitorIcon() {
    return <Boxes size={19} />
}

function DetailRow({
                       label,
                       value,
                   }: {
    label: string
    value: string
}) {
    return (
        <div className="detail-row">
            <span>{label}</span>
            <strong title={value}>{value || '—'}</strong>
        </div>
    )
}

