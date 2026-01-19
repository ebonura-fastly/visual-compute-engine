import { type NodeProps, useReactFlow } from '@xyflow/react'
import { useCallback, useState } from 'react'
import { NodeBase, NodeField, NodeSelect, NodeInput } from './NodeBase'

export type CacheNodeData = {
  mode: 'configure' | 'pass'
  ttl?: number
  ttlUnit?: 'seconds' | 'minutes' | 'hours' | 'days'
  staleWhileRevalidate?: number
  swrUnit?: 'seconds' | 'minutes' | 'hours'
  surrogateKeys?: string
}

const modeOptions = [
  { value: 'configure', label: 'Configure TTL' },
  { value: 'pass', label: 'Bypass Cache' },
]

const ttlUnitOptions = [
  { value: 'seconds', label: 'seconds' },
  { value: 'minutes', label: 'minutes' },
  { value: 'hours', label: 'hours' },
  { value: 'days', label: 'days' },
]

const swrUnitOptions = [
  { value: 'seconds', label: 'seconds' },
  { value: 'minutes', label: 'minutes' },
  { value: 'hours', label: 'hours' },
]

export function CacheNode({ id, data, selected }: NodeProps) {
  const nodeData = data as CacheNodeData
  const { setNodes } = useReactFlow()
  const [showAdvanced, setShowAdvanced] = useState(false)

  const updateData = useCallback((field: string, value: string | number) => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, [field]: value } }
          : node
      )
    )
  }, [id, setNodes])

  const mode = nodeData.mode || 'configure'
  const ttl = nodeData.ttl ?? 300
  const ttlUnit = nodeData.ttlUnit || 'seconds'
  const swr = nodeData.staleWhileRevalidate ?? 60
  const swrUnit = nodeData.swrUnit || 'seconds'
  const surrogateKeys = nodeData.surrogateKeys || ''

  // Dynamic title based on mode
  const getTitle = () => {
    if (mode === 'pass') return 'Cache: Bypass'
    const ttlDisplay = ttlUnit === 'seconds' ? `${ttl}s` :
                       ttlUnit === 'minutes' ? `${ttl}m` :
                       ttlUnit === 'hours' ? `${ttl}h` : `${ttl}d`
    return `Cache: ${ttlDisplay}`
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
      docUrl="https://docs.fastly.com/en/guides/controlling-caching"
    >
      <NodeField label="Mode">
        <NodeSelect
          value={mode}
          onChange={(v) => updateData('mode', v)}
          options={modeOptions}
        />
      </NodeField>

      {mode === 'configure' && (
        <>
          <NodeField label="TTL">
            <div style={{ display: 'flex', gap: 4 }}>
              <div style={{ width: 70 }}>
                <NodeInput
                  value={String(ttl)}
                  onChange={(v) => updateData('ttl', parseInt(v) || 0)}
                  placeholder="300"
                />
              </div>
              <NodeSelect
                value={ttlUnit}
                onChange={(v) => updateData('ttlUnit', v)}
                options={ttlUnitOptions}
              />
            </div>
          </NodeField>

          <NodeField label="Stale While Revalidate">
            <div style={{ display: 'flex', gap: 4 }}>
              <div style={{ width: 70 }}>
                <NodeInput
                  value={String(swr)}
                  onChange={(v) => updateData('staleWhileRevalidate', parseInt(v) || 0)}
                  placeholder="60"
                />
              </div>
              <NodeSelect
                value={swrUnit}
                onChange={(v) => updateData('swrUnit', v)}
                options={swrUnitOptions}
              />
            </div>
          </NodeField>

          {/* Advanced section toggle */}
          <div
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{
              fontSize: 11,
              color: '#888',
              cursor: 'pointer',
              marginTop: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span>{showAdvanced ? '▾' : '▸'}</span>
            <span>Advanced</span>
          </div>

          {showAdvanced && (
            <NodeField label="Surrogate Keys">
              <NodeInput
                value={surrogateKeys}
                onChange={(v) => updateData('surrogateKeys', v)}
                placeholder="key1 key2 key3"
              />
            </NodeField>
          )}
        </>
      )}

      {/* Helper text */}
      <div style={{
        fontSize: 10,
        color: '#888',
        marginTop: 8,
        lineHeight: 1.4,
      }}>
        {mode === 'pass' && 'Request will bypass cache and always fetch from origin'}
        {mode === 'configure' && 'Sets cache TTL and stale-while-revalidate duration'}
      </div>
    </NodeBase>
  )
}
