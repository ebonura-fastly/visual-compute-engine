import { type NodeProps, useReactFlow } from '@xyflow/react'
import { useCallback } from 'react'
import { NodeBase, NodeField, NodeSelect, NodeInput } from './NodeBase'

export type RateLimitNodeData = {
  limit: number
  window: number
  windowUnit: 'second' | 'minute' | 'hour'
  keyBy: 'ip' | 'fingerprint' | 'header' | 'path'
  headerName?: string
}

const windowUnitOptions = [
  { value: 'second', label: 'per second' },
  { value: 'minute', label: 'per minute' },
  { value: 'hour', label: 'per hour' },
]

const keyByOptions = [
  { value: 'ip', label: 'Client IP' },
  { value: 'fingerprint', label: 'JA3 Fingerprint' },
  { value: 'header', label: 'Header Value' },
  { value: 'path', label: 'Request Path' },
]

export function RateLimitNode({ id, data, selected }: NodeProps) {
  const nodeData = data as RateLimitNodeData
  const { setNodes } = useReactFlow()

  const updateData = useCallback((field: string, value: string | number) => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, [field]: value } }
          : node
      )
    )
  }, [id, setNodes])

  const limit = nodeData.limit || 100
  const windowUnit = nodeData.windowUnit || 'minute'
  const keyBy = nodeData.keyBy || 'ip'

  return (
    <NodeBase
      title="Rate Limit"
      category="condition"
      selected={selected}
      inputs={[{ id: 'trigger', label: 'Trigger', type: 'bool' }]}
      outputs={[
        { id: 'exceeded', label: 'Exceeded', type: 'bool' },
        { id: 'ok', label: 'OK', type: 'bool' },
      ]}
      width={200}
      docUrl="https://docs.fastly.com/products/edge-rate-limiting"
    >
      <NodeField label="Limit">
        <NodeInput
          value={limit}
          onChange={(v) => updateData('limit', parseInt(v) || 0)}
          type="number"
          placeholder="100"
        />
      </NodeField>

      <NodeField label="Window">
        <NodeSelect
          value={windowUnit}
          onChange={(v) => updateData('windowUnit', v)}
          options={windowUnitOptions}
        />
      </NodeField>

      <NodeField label="Key By">
        <NodeSelect
          value={keyBy}
          onChange={(v) => updateData('keyBy', v)}
          options={keyByOptions}
        />
      </NodeField>

      {keyBy === 'header' && (
        <NodeField label="Header">
          <NodeInput
            value={nodeData.headerName || ''}
            onChange={(v) => updateData('headerName', v)}
            placeholder="X-API-Key"
          />
        </NodeField>
      )}
    </NodeBase>
  )
}
