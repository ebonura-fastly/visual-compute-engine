import { type NodeProps, useReactFlow } from '@xyflow/react'
import { useCallback } from 'react'
import { Text } from '@fastly/beacon-mantine'
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
      docUrl="https://docs.fastly.com/en/guides/adding-or-modifying-headers-on-http-requests-and-responses"
    >
      <NodeField label="Operation">
        <NodeSelect
          value={operation}
          onChange={(v) => updateData('operation', v)}
          options={operationOptions}
        />
      </NodeField>

      <NodeField label="Header" hint="e.g., X-Custom-Header">
        <NodeInput
          value={name}
          onChange={(v) => updateData('name', v)}
          placeholder="X-Custom-Header"
        />
      </NodeField>

      {/* Show value field only for set/append operations */}
      {operation !== 'remove' && (
        <NodeField label="Value" hint="Static value or variable">
          <NodeInput
            value={nodeData.value || ''}
            onChange={(v) => updateData('value', v)}
            placeholder="header value"
          />
        </NodeField>
      )}

      {/* Helper text */}
      <Text size="xs" className="cc-node-helper-text" style={{ marginTop: '8px' }}>
        {operation === 'set' && 'Replaces any existing header with this value'}
        {operation === 'append' && 'Adds value to header (allows multiple values)'}
        {operation === 'remove' && 'Removes all values for this header'}
      </Text>
    </NodeBase>
  )
}
