import { useCallback, useRef, useState, useMemo } from 'react'
import {
  ReactFlow,
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type NodeTypes,
  type EdgeTypes,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
  SelectionMode,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { ConditionNode, ActionNode, RequestNode, RateLimitNode, TransformNode, BackendNode, LoggingNode, RuleGroupNode, HeaderNode } from './components/nodes'
import { DeletableEdge } from './components/edges'
import { Sidebar } from './components/Sidebar'
import { ThemeContext, lightTheme, darkTheme, useTheme, type ThemeMode, fonts } from './styles/theme'

const nodeTypes: NodeTypes = {
  request: RequestNode,
  condition: ConditionNode,
  rateLimit: RateLimitNode,
  transform: TransformNode,
  backend: BackendNode,
  logging: LoggingNode,
  action: ActionNode,
  ruleGroup: RuleGroupNode,
  header: HeaderNode,
}

const edgeTypes: EdgeTypes = {
  deletable: DeletableEdge,
}

function getDefaultData(type: string) {
  switch (type) {
    case 'condition':
      return { field: 'path', operator: 'equals', value: '/' }
    case 'rateLimit':
      return { limit: 100, windowUnit: 'minute', keyBy: 'ip' }
    case 'transform':
      return { operation: 'lowercase', field: 'path' }
    case 'backend':
      return { name: 'origin', host: 'origin.example.com', port: 443, useTLS: true }
    case 'logging':
      return { endpoint: 'bigquery', format: 'json', sampleRate: 100, includeHeaders: true, includeBody: false }
    case 'action':
      return { action: 'block', statusCode: 403 }
    case 'ruleGroup':
      return {
        name: 'Rule Group',
        logic: 'AND',
        conditions: [
          { id: 'cond-1', field: 'path', operator: 'equals', value: '/' }
        ]
      }
    case 'header':
      return { operation: 'set', name: 'X-Custom-Header', value: '' }
    default:
      return {}
  }
}

function Flow() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const { screenToFlowPosition } = useReactFlow()
  const { theme, mode, toggleTheme } = useTheme()

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  )

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  )

  const onConnect: OnConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    []
  )

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const type = event.dataTransfer.getData('application/reactflow')
      if (!type) return

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      const newNode: Node = {
        id: `${Date.now()}`,
        type,
        position,
        data: getDefaultData(type),
      }

      setNodes((nds) => [...nds, newNode])
    },
    [screenToFlowPosition]
  )

  const handleAddTemplate = useCallback((templateNodes: Node[], templateEdges: Edge[]) => {
    setNodes((nds) => [...nds, ...templateNodes])
    setEdges((eds) => [...eds, ...templateEdges])
  }, [])

  const handleLoadRules = useCallback((newNodes: Node[], newEdges: Edge[]) => {
    setNodes(newNodes)
    setEdges(newEdges)
  }, [])

  return (
    <>
      {/* Header */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 24px',
        background: theme.bg,
        borderBottom: `1px solid ${theme.border}`,
        fontFamily: fonts.sans,
      }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: theme.text }}>
          Visual Compute Engine
        </span>
        <button
          onClick={toggleTheme}
          style={{
            padding: '8px 12px',
            background: theme.bgTertiary,
            color: theme.textSecondary,
            border: `1px solid ${theme.border}`,
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 14,
            fontFamily: fonts.sans,
          }}
          title={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
        >
          {mode === 'dark' ? 'Light' : 'Dark'}
        </button>
      </header>

      {/* Main Content */}
      <div style={{ display: 'flex', flex: 1, background: theme.canvasBg }}>
        <Sidebar
          nodes={nodes}
          edges={edges}
          onAddTemplate={handleAddTemplate}
          onLoadRules={handleLoadRules}
        />
        <div style={{ flex: 1, position: 'relative' }} ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDragOver={onDragOver}
            onDrop={onDrop}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={{
              type: 'deletable',
              style: { stroke: theme.textMuted, strokeWidth: 2 },
            }}
            fitView
            fitViewOptions={{ maxZoom: 0.8, padding: 0.2 }}
            style={{ background: theme.canvasBg }}
            deleteKeyCode={['Backspace', 'Delete']}
            selectionMode={SelectionMode.Partial}
            selectionOnDrag
            panOnDrag={[1, 2]}
            selectNodesOnDrag={false}
            selectionKeyCode={['Shift']}
            multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color={theme.canvasDots} />
            <Controls style={{ background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 8 }} />
          </ReactFlow>
        </div>
      </div>
    </>
  )
}

export default function App() {
  const [mode, setMode] = useState<ThemeMode>('dark')
  const theme = mode === 'dark' ? darkTheme : lightTheme

  const toggleTheme = useCallback(() => {
    setMode((m) => (m === 'dark' ? 'light' : 'dark'))
  }, [])

  const themeContextValue = useMemo(() => ({
    mode,
    theme,
    toggleTheme,
  }), [mode, theme, toggleTheme])

  return (
    <ThemeContext.Provider value={themeContextValue}>
      <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: theme.canvasBg }}>
        <ReactFlowProvider>
          <Flow />
        </ReactFlowProvider>
      </div>
    </ThemeContext.Provider>
  )
}
