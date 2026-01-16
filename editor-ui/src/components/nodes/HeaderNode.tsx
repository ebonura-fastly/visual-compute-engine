import { type NodeProps, useReactFlow } from '@xyflow/react'
import { useCallback } from 'react'
import { NodeBase, NodeField, NodeSelect, NodeInput } from './NodeBase'

export type HeaderNodeData = {
  operation: 'set' | 'append' | 'remove'
  name: string
  value?: string
}

const operationOptions = [
  { value: 'set', label: 'Set (replace)' },
  { value: 'append', label: 'Append (add)' },
  { value: 'remove', label: 'Remove' },
]

// Common header name suggestions
const commonHeaders = [
  'X-Custom-Header',
  'X-Request-ID',
  'X-Forwarded-For',
  'X-Real-IP',
  'Cache-Control',
  'X-Frame-Options',
  'X-Content-Type-Options',
  'Strict-Transport-Security',
  'Content-Security-Policy',
  'X-XSS-Protection',
]

export function HeaderNode({ id, data, selected }: NodeProps) {
  const nodeData = data as HeaderNodeData
  const { setNodes } = useReactFlow()

  const updateData = useCallback((field: string, value: string) => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, [field]: value } }
          : node
      )
    )
  }, [id, setNodes])

  const operation = nodeData.operation || 'set'
  const name = nodeData.name || ''

  // Dynamic title based on operation
  const getTitle = () => {
    const headerName = name || 'Header'
    const shortName = headerName.length > 15 ? headerName.slice(0, 15) + '...' : headerName
    switch (operation) {
      case 'set': return `Set: ${shortName}`
      case 'append': return `Add: ${shortName}`
      case 'remove': return `Remove: ${shortName}`
      default: return 'Header'
    }
  }

  return (
    <NodeBase
      title={getTitle()}
      category="routing"
      selected={selected}
      inputs={[
        { id: 'trigger', label: 'Trigger', type: 'bool' },
      ]}
      outputs={[
        { id: 'next', label: 'Next', type: 'bool' },
      ]}
      width={220}
    >
      <NodeField label="Operation">
        <NodeSelect
          value={operation}
          onChange={(v) => updateData('operation', v)}
          options={operationOptions}
        />
      </NodeField>

      <NodeField label="Header">
        <NodeInput
          value={name}
          onChange={(v) => updateData('name', v)}
          placeholder="X-Custom-Header"
        />
      </NodeField>

      {/* Show value field only for set/append operations */}
      {operation !== 'remove' && (
        <NodeField label="Value">
          <NodeInput
            value={nodeData.value || ''}
            onChange={(v) => updateData('value', v)}
            placeholder="header value"
          />
        </NodeField>
      )}

      {/* Helper text */}
      <div style={{
        fontSize: 10,
        color: '#888',
        marginTop: 8,
        lineHeight: 1.4,
      }}>
        {operation === 'set' && 'Replaces any existing header with this value'}
        {operation === 'append' && 'Adds value to header (allows multiple values)'}
        {operation === 'remove' && 'Removes all values for this header'}
      </div>
    </NodeBase>
  )
}
