import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { BrowserRouter, Routes, Route, useParams, useNavigate } from 'react-router-dom'
import { Box, Stack, Title, Text, Flex, Pill } from '@fastly/beacon-mantine'

import { ConditionNode, ActionNode, RequestNode, RateLimitNode, TransformNode, BackendNode, LoggingNode, RuleGroupNode, HeaderNode, CacheNode } from './components/nodes'
import { DeletableEdge } from './components/edges'
import { Sidebar } from './components/Sidebar'
import { CCHeader } from './components/CCHeader'
import { toCanonicalGraph } from './types/graph'

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

  // Router hooks
  const { serviceId } = useParams<{ serviceId?: string }>()
  const navigate = useNavigate()
  const isLocalMode = window.location.pathname === '/local'

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

  // Compute canonical graph (strips React Flow runtime fields like measured, selected)
  // This is used for hashing and deployment - only includes stable node/edge data
  const canonicalGraph = useMemo(() => toCanonicalGraph(nodes, edges), [nodes, edges])

  // Ctrl/Cmd+A to select all nodes
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Ctrl+A (Windows/Linux) or Cmd+A (Mac)
      if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
        // Only handle if focus is on the React Flow canvas (not in input fields)
        const activeElement = document.activeElement
        const isInputFocused = activeElement instanceof HTMLInputElement ||
          activeElement instanceof HTMLTextAreaElement ||
          activeElement instanceof HTMLSelectElement ||
          activeElement?.getAttribute('contenteditable') === 'true'

        if (!isInputFocused) {
          event.preventDefault()
          setNodes((nds) => nds.map((node) => ({ ...node, selected: true })))
          setEdges((eds) => eds.map((edge) => ({ ...edge, selected: true })))
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <>
      <CCHeader />

      {/* Main Content */}
      <div className="cc-main">
        <Sidebar
          nodes={nodes}
          edges={edges}
          canonicalGraph={canonicalGraph}
          onAddTemplate={handleAddTemplate}
          onLoadRules={handleLoadRules}
          routeServiceId={serviceId}
          isLocalRoute={isLocalMode}
          onNavigate={navigate}
        />
        <div className="cc-canvas" ref={reactFlowWrapper}>
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
            nodeDragThreshold={0}
            selectionKeyCode={['Shift']}
            multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
            <Controls />
          </ReactFlow>

          {/* Empty Canvas State */}
          {nodes.length === 0 && (
            <Stack className="cc-empty-canvas" align="center" gap="lg">
              <Box className="cc-empty-canvas-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </Box>
              <Title order={2} className="cc-empty-canvas-title">Start Building Your Security Rules</Title>
              <Text className="cc-empty-canvas-text">
                Drag components from the sidebar onto the canvas,<br />
                or use a template to get started quickly.
              </Text>
              <Stack gap="md">
                {[
                  { num: 1, title: 'Add a Request Node', desc: 'Start with a Request node as your entry point. This captures incoming traffic.' },
                  { num: 2, title: 'Add Conditions', desc: 'Connect Condition nodes to inspect request fields like path, headers, or IP.' },
                  { num: 3, title: 'Define Actions', desc: 'Add Action nodes to block, allow, rate-limit, or route traffic to backends.' }
                ].map(step => (
                  <Flex key={step.num} gap="sm" align="flex-start">
                    <Pill variant="default">{step.num}</Pill>
                    <Flex direction="column" gap="xs">
                      <Text size="sm" weight="bold">{step.title}</Text>
                      <Text size="xs" className="cc-text-muted">{step.desc}</Text>
                    </Flex>
                  </Flex>
                ))}
              </Stack>
            </Stack>
          )}
        </div>
      </div>
    </>
  )
}

function AppRoutes() {
  return (
    <div className="cc-app">
      <ReactFlowProvider>
        <Flow />
      </ReactFlowProvider>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppRoutes />} />
        <Route path="/local" element={<AppRoutes />} />
        <Route path="/:serviceId" element={<AppRoutes />} />
      </Routes>
    </BrowserRouter>
  )
}
