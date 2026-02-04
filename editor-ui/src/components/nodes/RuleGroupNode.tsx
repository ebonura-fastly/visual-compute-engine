import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react'
import { useCallback, useState } from 'react'
import { NodeSelect } from './NodeBase'

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

// Condition definition (embedded in the group)
type ConditionDef = {
  id: string
  field: string
  operator: string
  value: string
  headerName?: string  // For custom header field
}

export type RuleGroupNodeData = {
  name: string
  logic: 'AND' | 'OR'
  conditions: ConditionDef[]
  collapsed?: boolean
}

const fieldOptions = [
  // Request basics
  { value: 'path', label: 'Path' },
  { value: 'query', label: 'Query String' },
  { value: 'method', label: 'Method' },
  { value: 'host', label: 'Host' },
  { value: 'scheme', label: 'Scheme' },

  // Client & Connection
  { value: 'clientIp', label: 'Client IP' },
  { value: 'asn', label: 'ASN' },
  { value: 'datacenter', label: 'Datacenter' },

  // Geolocation
  { value: 'country', label: 'Country' },
  { value: 'city', label: 'City' },
  { value: 'continent', label: 'Continent' },

  // Detection (Boolean)
  { value: 'ddosDetected', label: 'DDoS Detected' },
  { value: 'isBot', label: 'Is Bot' },
  { value: 'isMobile', label: 'Is Mobile' },
  { value: 'isTablet', label: 'Is Tablet' },
  { value: 'isDesktop', label: 'Is Desktop' },
  { value: 'isHostingProvider', label: 'Is Hosting Provider' },

  // Request Headers
  { value: 'userAgent', label: 'User-Agent' },
  { value: 'referer', label: 'Referer' },
  { value: 'accept', label: 'Accept' },
  { value: 'acceptLanguage', label: 'Accept-Language' },
  { value: 'contentType', label: 'Content-Type' },
  { value: 'xForwardedFor', label: 'X-Forwarded-For' },
  { value: 'xForwardedProto', label: 'X-Forwarded-Proto' },

  // TLS/Security
  { value: 'tlsVersion', label: 'TLS Version' },
  { value: 'ja3', label: 'JA3' },
  { value: 'ja4', label: 'JA4' },

  // Custom Header
  { value: 'header', label: 'Custom Header' },
]

const operatorOptions = [
  { value: 'equals', label: '=' },
  { value: 'notEquals', label: '!=' },
  { value: 'contains', label: 'contains' },
  { value: 'notContains', label: '!contains' },
  { value: 'startsWith', label: 'starts' },
  { value: 'endsWith', label: 'ends' },
  { value: 'matches', label: 'regex' },
  { value: 'in', label: 'in' },
  { value: 'notIn', label: '!in' },
  { value: 'inCidr', label: 'in CIDR' },
  { value: 'notInCidr', label: 'not in CIDR' },
]

const HANDLE_SIZE = 12
const HEADER_HEIGHT = 44  // Header with padding + content
const PORT_ROW_HEIGHT = 22  // Height of each port label row

export function RuleGroupNode({ id, data, selected }: NodeProps) {
  const nodeData = data as RuleGroupNodeData
  const { setNodes } = useReactFlow()
  const [collapsed, setCollapsed] = useState(nodeData.collapsed ?? false)

  const conditions = nodeData.conditions || []
  const logic = nodeData.logic || 'AND'
  const name = nodeData.name || 'Rule Group'

  const updateData = useCallback((updates: Partial<RuleGroupNodeData>) => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, ...updates } }
          : node
      )
    )
  }, [id, setNodes])

  const addCondition = useCallback(() => {
    const newCondition: ConditionDef = {
      id: `cond-${Date.now()}`,
      field: 'path',
      operator: 'equals',
      value: '',
    }
    updateData({ conditions: [...conditions, newCondition] })
  }, [conditions, updateData])

  const updateCondition = useCallback((condId: string, field: string, value: string) => {
    updateData({
      conditions: conditions.map((c) =>
        c.id === condId ? { ...c, [field]: value } : c
      ),
    })
  }, [conditions, updateData])

  const removeCondition = useCallback((condId: string) => {
    updateData({ conditions: conditions.filter((c) => c.id !== condId) })
  }, [conditions, updateData])

  return (
    <div
      className="vce-node vce-rule-group"
      data-category="logic"
      data-selected={selected}
    >
      {/* Header */}
      <div
        className="vce-node-header vce-rule-group-header"
        data-collapsed={collapsed}
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="vce-rule-group-header-left">
          <span className="vce-node-collapse-icon">{collapsed ? '▸' : '▾'}</span>
          <input
            type="text"
            value={name}
            onChange={(e) => updateData({ name: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            className="vce-rule-group-name-input"
            placeholder="Rule name..."
          />
        </div>
        <div className="vce-rule-group-header-right">
          <div className="vce-rule-group-logic-select" onClick={(e) => e.stopPropagation()}>
            <NodeSelect
              value={logic}
              onChange={(v) => updateData({ logic: v as 'AND' | 'OR' })}
              options={[
                { value: 'AND', label: 'AND' },
                { value: 'OR', label: 'OR' },
              ]}
            />
          </div>
          <a
            href="https://docs.fastly.com/en/guides/compute/"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="View documentation"
            className="vce-node-doc-link"
          >
            ?
          </a>
        </div>
      </div>

      {/* Handles - positions must align with port labels */}
      <Handle
        type="target"
        position={Position.Left}
        id="trigger"
        className="vce-handle"
        data-port-type="bool"
        style={{
          width: HANDLE_SIZE,
          height: HANDLE_SIZE,
          top: collapsed ? HEADER_HEIGHT / 2 : HEADER_HEIGHT + PORT_ROW_HEIGHT / 2 + 6,
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="match"
        className="vce-handle"
        data-port-type="bool"
        style={{
          width: HANDLE_SIZE,
          height: HANDLE_SIZE,
          top: collapsed ? HEADER_HEIGHT / 2 : HEADER_HEIGHT + PORT_ROW_HEIGHT / 2 + 6,
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="noMatch"
        className="vce-handle"
        data-port-type="bool"
        style={{
          width: HANDLE_SIZE,
          height: HANDLE_SIZE,
          top: collapsed ? HEADER_HEIGHT / 2 : HEADER_HEIGHT + PORT_ROW_HEIGHT + PORT_ROW_HEIGHT / 2 + 6,
        }}
      />

      {/* Port labels (always visible) */}
      {!collapsed && (
        <div className="vce-rule-group-ports">
          <div className="vce-rule-group-ports-left">
            <span className="vce-rule-group-port-label">Trigger</span>
          </div>
          <div className="vce-rule-group-ports-right">
            <span className="vce-rule-group-port-label vce-rule-group-port-label--match">Match</span>
            <span className="vce-rule-group-port-label">No Match</span>
          </div>
        </div>
      )}

      {/* Conditions */}
      {!collapsed && (
        <div className="vce-rule-group-body">
          {/* Logic indicator */}
          <div className="vce-rule-group-logic-hint">
            {logic === 'AND' ? 'All conditions must match' : 'Any condition must match'}
          </div>

          {/* Condition cards */}
          <div className="vce-rule-group-conditions">
            {conditions.map((condition, idx) => (
              <div
                key={condition.id}
                className="vce-rule-group-condition"
              >
                {/* Logic connector between conditions */}
                {idx > 0 && (
                  <div className="vce-rule-group-logic-connector">
                    {logic}
                  </div>
                )}

                {/* Remove button */}
                <button
                  onClick={() => removeCondition(condition.id)}
                  className="vce-rule-group-condition-remove"
                >
                  ×
                </button>

                {/* Condition fields */}
                <div className="vce-rule-group-condition-fields">
                  <NodeSelect
                    value={condition.field}
                    onChange={(newField) => {
                      // When switching to boolean field, set default values
                      if (booleanFields.has(newField)) {
                        updateData({
                          conditions: conditions.map((c) =>
                            c.id === condition.id
                              ? { ...c, field: newField, operator: 'equals', value: 'true' }
                              : c
                          ),
                        })
                      } else {
                        updateCondition(condition.id, 'field', newField)
                      }
                    }}
                    options={fieldOptions}
                  />

                  {condition.field === 'header' && (
                    <input
                      type="text"
                      value={condition.headerName || ''}
                      onChange={(e) => {
                        updateData({
                          conditions: conditions.map((c) =>
                            c.id === condition.id
                              ? { ...c, headerName: e.target.value }
                              : c
                          ),
                        })
                      }}
                      placeholder="Header name"
                      className="vce-node-input vce-rule-group-header-input"
                    />
                  )}

                  {booleanFields.has(condition.field) ? (
                    <label className="vce-node-checkbox">
                      <input
                        type="checkbox"
                        checked={condition.value === 'true'}
                        onChange={(e) => {
                          updateData({
                            conditions: conditions.map((c) =>
                              c.id === condition.id
                                ? { ...c, operator: 'equals', value: e.target.checked ? 'true' : 'false' }
                                : c
                            ),
                          })
                        }}
                      />
                      <span>{condition.value === 'true' ? 'Yes' : 'No'}</span>
                    </label>
                  ) : (
                    <>
                      <NodeSelect
                        value={condition.operator}
                        onChange={(v) => updateCondition(condition.id, 'operator', v)}
                        options={operatorOptions}
                      />

                      <input
                        type="text"
                        value={condition.value}
                        onChange={(e) => updateCondition(condition.id, 'value', e.target.value)}
                        placeholder="value"
                        className="vce-node-input vce-rule-group-value-input"
                      />
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Add condition button */}
          <button
            onClick={addCondition}
            className="btn w-full vce-rule-group-add-btn"
            data-variant="dashed"
          >
            + Add Condition
          </button>
        </div>
      )}
    </div>
  )
}
