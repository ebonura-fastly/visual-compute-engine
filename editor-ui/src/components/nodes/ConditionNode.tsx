import { type NodeProps, useReactFlow } from '@xyflow/react'
import { useCallback } from 'react'
import { NodeBase, NodeField, NodeSelect, NodeInput } from './NodeBase'

export type ConditionNodeData = {
  field: string
  operator: string
  value: string
}

const fieldOptions = [
  // Request basics
  { value: 'path', label: 'Path' },
  { value: 'query', label: 'Query String' },
  { value: 'method', label: 'Method' },
  { value: 'host', label: 'Host' },
  { value: 'scheme', label: 'Scheme (http/https)' },

  // Client & Connection
  { value: 'clientIp', label: 'Client IP' },
  { value: 'asn', label: 'ASN' },
  { value: 'datacenter', label: 'Datacenter (POP)' },

  // Geolocation
  { value: 'country', label: 'Country Code' },
  { value: 'city', label: 'City' },
  { value: 'continent', label: 'Continent' },

  // Request Headers
  { value: 'userAgent', label: 'User-Agent' },
  { value: 'referer', label: 'Referer' },
  { value: 'accept', label: 'Accept' },
  { value: 'acceptLanguage', label: 'Accept-Language' },
  { value: 'acceptEncoding', label: 'Accept-Encoding' },
  { value: 'contentType', label: 'Content-Type' },
  { value: 'cacheControl', label: 'Cache-Control' },
  { value: 'xForwardedFor', label: 'X-Forwarded-For' },
  { value: 'xForwardedProto', label: 'X-Forwarded-Proto' },
  { value: 'xRequestedWith', label: 'X-Requested-With' },

  // TLS/Security
  { value: 'tlsVersion', label: 'TLS Version' },
  { value: 'tlsCipher', label: 'TLS Cipher' },
  { value: 'ja3', label: 'JA3 Fingerprint' },
  { value: 'ja4', label: 'JA4 Fingerprint' },
  { value: 'h2Fingerprint', label: 'HTTP/2 Fingerprint' },
  { value: 'ohFingerprint', label: 'OH Fingerprint' },

  // Custom header (fallback)
  { value: 'header', label: 'Custom Header...' },
]

const operatorOptions = [
  { value: 'equals', label: 'equals' },
  { value: 'notEquals', label: 'not equals' },
  { value: 'contains', label: 'contains' },
  { value: 'notContains', label: 'not contains' },
  { value: 'startsWith', label: 'starts with' },
  { value: 'endsWith', label: 'ends with' },
  { value: 'matches', label: 'matches (regex)' },
  { value: 'in', label: 'in list' },
  { value: 'notIn', label: 'not in list' },
  { value: 'inCidr', label: 'in CIDR' },
]

export function ConditionNode({ id, data, selected }: NodeProps) {
  const nodeData = data as ConditionNodeData
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

  return (
    <NodeBase
      title="Condition"
      category="condition"
      selected={selected}
      inputs={[{ id: 'trigger', label: 'Trigger', type: 'bool' }]}
      outputs={[
        { id: 'true', label: 'True', type: 'bool' },
        { id: 'false', label: 'False', type: 'bool' },
      ]}
      width={220}
    >
      <NodeField label="Field">
        <NodeSelect
          value={nodeData.field || 'path'}
          onChange={(v) => updateData('field', v)}
          options={fieldOptions}
        />
      </NodeField>

      <NodeField label="Operator">
        <NodeSelect
          value={nodeData.operator || 'equals'}
          onChange={(v) => updateData('operator', v)}
          options={operatorOptions}
        />
      </NodeField>

      <NodeField label="Value">
        <NodeInput
          value={nodeData.value || ''}
          onChange={(v) => updateData('value', v)}
          placeholder="Enter value..."
        />
      </NodeField>
    </NodeBase>
  )
}
