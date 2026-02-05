import { type NodeProps, useReactFlow } from '@xyflow/react'
import { useCallback, useState } from 'react'
import { Box, Flex, Text } from '@fastly/beacon-mantine'
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
            <Flex gap="xs">
              <Box w={70}>
                <NodeInput
                  value={String(ttl)}
                  onChange={(v) => updateData('ttl', parseInt(v) || 0)}
                  placeholder="300"
                />
              </Box>
              <NodeSelect
                value={ttlUnit}
                onChange={(v) => updateData('ttlUnit', v)}
                options={ttlUnitOptions}
              />
            </Flex>
          </NodeField>

          <NodeField label="Stale While Revalidate">
            <Flex gap="xs">
              <Box w={70}>
                <NodeInput
                  value={String(swr)}
                  onChange={(v) => updateData('staleWhileRevalidate', parseInt(v) || 0)}
                  placeholder="60"
                />
              </Box>
              <NodeSelect
                value={swrUnit}
                onChange={(v) => updateData('swrUnit', v)}
                options={swrUnitOptions}
              />
            </Flex>
          </NodeField>

          {/* Advanced section toggle */}
          <Flex
            onClick={() => setShowAdvanced(!showAdvanced)}
            align="center"
            gap="xs"
            style={{ marginTop: '8px', cursor: 'pointer' }}
            className="cc-node-toggle"
          >
            <Text size="xs">{showAdvanced ? '▾' : '▸'}</Text>
            <Text size="xs">Advanced</Text>
          </Flex>

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
      <Text size="xs" className="cc-node-helper-text" style={{ marginTop: '8px' }}>
        {mode === 'pass' && 'Request will bypass cache and always fetch from origin'}
        {mode === 'configure' && 'Sets cache TTL and stale-while-revalidate duration'}
      </Text>
    </NodeBase>
  )
}
