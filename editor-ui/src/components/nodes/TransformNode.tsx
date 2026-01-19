import { type NodeProps, useReactFlow } from '@xyflow/react'
import { useCallback } from 'react'
import { NodeBase, NodeField, NodeSelect, NodeInput } from './NodeBase'

export type TransformNodeData = {
  operation: 'lowercase' | 'uppercase' | 'urlDecode' | 'base64Decode' | 'htmlDecode' | 'removeWhitespace' | 'extract'
  field: string
  pattern?: string
  outputVar?: string
}

const operationOptions = [
  { value: 'lowercase', label: 'Lowercase' },
  { value: 'uppercase', label: 'Uppercase' },
  { value: 'urlDecode', label: 'URL Decode' },
  { value: 'base64Decode', label: 'Base64 Decode' },
  { value: 'htmlDecode', label: 'HTML Decode' },
  { value: 'removeWhitespace', label: 'Remove Whitespace' },
  { value: 'extract', label: 'Regex Extract' },
]

const fieldOptions = [
  { value: 'path', label: 'Path' },
  { value: 'query', label: 'Query String' },
  { value: 'body', label: 'Request Body' },
  { value: 'userAgent', label: 'User Agent' },
  { value: 'header', label: 'Header' },
  { value: 'cookie', label: 'Cookie' },
]

export function TransformNode({ id, data, selected }: NodeProps) {
  const nodeData = data as TransformNodeData
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

  const operation = nodeData.operation || 'lowercase'
  const field = nodeData.field || 'path'

  // Dynamic title
  const titles: Record<string, string> = {
    lowercase: 'Lowercase',
    uppercase: 'Uppercase',
    urlDecode: 'URL Decode',
    base64Decode: 'Base64 Dec',
    htmlDecode: 'HTML Decode',
    removeWhitespace: 'Trim',
    extract: 'Extract',
  }

  return (
    <NodeBase
      title={titles[operation] || 'Transform'}
      category="routing"
      selected={selected}
      inputs={[
        { id: 'trigger', label: 'Trigger', type: 'bool' },
        { id: 'value_in', label: 'Value', type: 'string' },
      ]}
      outputs={[
        { id: 'value_out', label: 'Result', type: 'string' },
      ]}
      width={190}
      docUrl="https://docs.fastly.com/en/guides/compute/"
    >
      <NodeField label="Transform">
        <NodeSelect
          value={operation}
          onChange={(v) => updateData('operation', v)}
          options={operationOptions}
        />
      </NodeField>

      <NodeField label="Field">
        <NodeSelect
          value={field}
          onChange={(v) => updateData('field', v)}
          options={fieldOptions}
        />
      </NodeField>

      {operation === 'extract' && (
        <NodeField label="Pattern">
          <NodeInput
            value={nodeData.pattern || ''}
            onChange={(v) => updateData('pattern', v)}
            placeholder="([a-z]+)"
          />
        </NodeField>
      )}
    </NodeBase>
  )
}
