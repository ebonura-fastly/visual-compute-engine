import { type NodeProps, useReactFlow } from '@xyflow/react'
import { useCallback } from 'react'
import { NodeBase, NodeField, NodeSelect, NodeTextarea, NodeCheckbox, NodeInput } from './NodeBase'

// Fields that return boolean values - show checkbox instead of text input
const booleanFields = new Set([
  'ddosDetected',
  'isBot',
  'isMobile',
  'isTablet',
  'isDesktop',
  'isSmartTV',
  'isGameConsole',
  'isHostingProvider',
])

export type ConditionNodeData = {
  field: string
  operator: string
  value: string
  headerName?: string  // For custom header field
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
  { value: 'country', label: 'Country Code (2-letter)' },
  { value: 'countryCode3', label: 'Country Code (3-letter)' },
  { value: 'continent', label: 'Continent' },
  { value: 'city', label: 'City' },
  { value: 'region', label: 'Region (ISO 3166-2)' },
  { value: 'postalCode', label: 'Postal Code' },
  { value: 'latitude', label: 'Latitude' },
  { value: 'longitude', label: 'Longitude' },
  { value: 'metroCode', label: 'Metro Code (DMA)' },
  { value: 'utcOffset', label: 'UTC Offset' },
  { value: 'connSpeed', label: 'Connection Speed' },
  { value: 'connType', label: 'Connection Type' },

  // Proxy/VPN Detection
  { value: 'proxyType', label: 'Proxy Type' },
  { value: 'proxyDescription', label: 'Proxy Description' },
  { value: 'isHostingProvider', label: 'Is Hosting Provider' },

  // Device Detection - Device Type
  { value: 'isBot', label: 'Is Bot' },
  { value: 'botName', label: 'Bot Name' },
  { value: 'isMobile', label: 'Is Mobile' },
  { value: 'isTablet', label: 'Is Tablet' },
  { value: 'isDesktop', label: 'Is Desktop' },
  { value: 'isSmartTV', label: 'Is Smart TV' },
  { value: 'isGameConsole', label: 'Is Game Console' },

  // Device Detection - Device Info
  { value: 'deviceName', label: 'Device Name' },
  { value: 'deviceBrand', label: 'Device Brand' },
  { value: 'deviceModel', label: 'Device Model' },

  // Device Detection - Browser & OS
  { value: 'browserName', label: 'Browser Name' },
  { value: 'browserVersion', label: 'Browser Version' },
  { value: 'osName', label: 'OS Name' },
  { value: 'osVersion', label: 'OS Version' },

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
  { value: 'ddosDetected', label: 'DDoS Detected' },

  // Custom header
  { value: 'header', label: 'Custom Header' },
]

const operatorOptions = [
  // String operators
  { value: 'equals', label: 'equals' },
  { value: 'notEquals', label: 'not equals' },
  { value: 'contains', label: 'contains' },
  { value: 'notContains', label: 'not contains' },
  { value: 'startsWith', label: 'starts with' },
  { value: 'endsWith', label: 'ends with' },
  { value: 'matches', label: 'matches (regex)' },

  // List operators
  { value: 'in', label: 'in list' },
  { value: 'notIn', label: 'not in list' },

  // Numeric operators
  { value: 'greaterThan', label: 'greater than' },
  { value: 'lessThan', label: 'less than' },
  { value: 'greaterOrEqual', label: 'greater or equal' },
  { value: 'lessOrEqual', label: 'less or equal' },

  // IP operators
  { value: 'inCidr', label: 'in CIDR' },

  // Existence operators
  { value: 'exists', label: 'exists' },
  { value: 'notExists', label: 'not exists' },
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

  const currentField = nodeData.field || 'path'
  const isBooleanField = booleanFields.has(currentField)
  const isCustomHeader = currentField === 'header'

  // For boolean fields, handle the checkbox toggle
  const handleBooleanToggle = useCallback((checked: boolean) => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, operator: 'equals', value: checked ? 'true' : 'false' } }
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
          value={currentField}
          onChange={(v) => {
            // When switching to/from boolean field, reset operator and value
            if (booleanFields.has(v)) {
              setNodes((nodes) =>
                nodes.map((node) =>
                  node.id === id
                    ? { ...node, data: { ...node.data, field: v, operator: 'equals', value: 'true' } }
                    : node
                )
              )
            } else {
              updateData('field', v)
            }
          }}
          options={fieldOptions}
        />
      </NodeField>

      {isCustomHeader && (
        <NodeField label="Header Name">
          <NodeInput
            value={nodeData.headerName || ''}
            onChange={(v) => updateData('headerName', v)}
            placeholder="X-Custom-Header"
          />
        </NodeField>
      )}

      {isBooleanField ? (
        <NodeField label="Match when">
          <NodeCheckbox
            checked={nodeData.value === 'true'}
            onChange={handleBooleanToggle}
            label={nodeData.value === 'true' ? 'Yes (true)' : 'No (false)'}
          />
        </NodeField>
      ) : (
        <>
          <NodeField label="Operator">
            <NodeSelect
              value={nodeData.operator || 'equals'}
              onChange={(v) => updateData('operator', v)}
              options={operatorOptions}
            />
          </NodeField>

          <NodeField label="Value">
            <NodeTextarea
              value={nodeData.value || ''}
              onChange={(v) => updateData('value', v)}
              placeholder="Enter value..."
              minRows={1}
              maxRows={4}
            />
          </NodeField>
        </>
      )}
    </NodeBase>
  )
}
