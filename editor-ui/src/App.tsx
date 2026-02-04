import { useCallback, useRef, useState } from 'react'
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

import { ConditionNode, ActionNode, RequestNode, RateLimitNode, TransformNode, BackendNode, LoggingNode, RuleGroupNode, HeaderNode, CacheNode } from './components/nodes'
import { DeletableEdge } from './components/edges'
import { Sidebar } from './components/Sidebar'
import { useTheme } from './styles/theme'

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
  cache: CacheNode,
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
    case 'cache':
      return { mode: 'configure', ttl: 300, ttlUnit: 'seconds', staleWhileRevalidate: 60, swrUnit: 'seconds' }
    default:
      return {}
  }
}

function Flow() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const { screenToFlowPosition } = useReactFlow()
  const { isDark, toggle } = useTheme()

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
      <header className="vce-header">
        <span className="vce-header-title">Visual Compute Engine</span>
        <button
          onClick={toggle}
          className="btn"
          data-variant="secondary"
          title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
        >
          {isDark ? 'Light' : 'Dark'}
        </button>
      </header>

      {/* Main Content */}
      <div className="vce-main">
        <Sidebar
          nodes={nodes}
          edges={edges}
          onAddTemplate={handleAddTemplate}
          onLoadRules={handleLoadRules}
        />
        <div className="vce-canvas" ref={reactFlowWrapper}>
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
            }}
            fitView
            fitViewOptions={{ maxZoom: 0.8, padding: 0.2 }}
            deleteKeyCode={['Backspace', 'Delete']}
            selectionMode={SelectionMode.Partial}
            selectionOnDrag
            panOnDrag={[1, 2]}
            selectNodesOnDrag={false}
            selectionKeyCode={['Shift']}
            multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
            <Controls />
          </ReactFlow>

          {/* Empty Canvas State */}
          {nodes.length === 0 && (
            <div className="vce-empty-canvas">
              <div className="vce-empty-canvas-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </div>
              <h2 className="vce-empty-canvas-title">Start Building Your Security Rules</h2>
              <p className="vce-empty-canvas-text">
                Drag components from the sidebar onto the canvas,<br />
                or use a template to get started quickly.
              </p>
              <div className="vce-empty-canvas-hints">
                <div className="vce-empty-canvas-hint">
                  <span className="vce-empty-canvas-hint-icon">1</span>
                  <span>Add a <strong>Request</strong> node as your entry point</span>
                </div>
                <div className="vce-empty-canvas-hint">
                  <span className="vce-empty-canvas-hint-icon">2</span>
                  <span>Connect <strong>Conditions</strong> to check request fields</span>
                </div>
                <div className="vce-empty-canvas-hint">
                  <span className="vce-empty-canvas-hint-icon">3</span>
                  <span>Add <strong>Actions</strong> to block, allow, or route traffic</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default function App() {
  return (
    <div className="vce-app">
      <ReactFlowProvider>
        <Flow />
      </ReactFlowProvider>
    </div>
  )
}
