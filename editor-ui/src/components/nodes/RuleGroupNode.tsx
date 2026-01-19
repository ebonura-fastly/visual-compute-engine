import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react'
import { useCallback, useState } from 'react'
import { useTheme, fonts } from '../../styles/theme'

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
]

const HANDLE_SIZE = 12

export function RuleGroupNode({ id, data, selected }: NodeProps) {
  const nodeData = data as RuleGroupNodeData
  const { setNodes } = useReactFlow()
  const { theme } = useTheme()
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

  const colors = theme.nodeLogic

  return (
    <div
      style={{
        borderRadius: 10,
        border: `2px solid ${selected ? theme.primary : colors.border}`,
        fontFamily: fonts.sans,
        fontSize: 12,
        color: theme.textSecondary,
        boxShadow: selected
          ? `0 0 0 2px ${theme.primary}40, 0 4px 12px -2px rgba(0, 0, 0, 0.15)`
          : '0 4px 12px -2px rgba(0, 0, 0, 0.15)',
        background: colors.body,
        minWidth: 280,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none',
          borderBottom: `1px solid ${colors.border}`,
          background: colors.header,
          borderRadius: collapsed ? '8px' : '8px 8px 0 0',
        }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: colors.text }}>{collapsed ? '▸' : '▾'}</span>
          <input
            type="text"
            value={name}
            onChange={(e) => updateData({ name: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'transparent',
              border: 'none',
              fontWeight: 600,
              fontSize: 13,
              color: colors.text,
              outline: 'none',
              width: 140,
            }}
            placeholder="Rule name..."
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            value={logic}
            onChange={(e) => updateData({ logic: e.target.value as 'AND' | 'OR' })}
            onClick={(e) => e.stopPropagation()}
            style={{
              padding: '4px 8px',
              background: theme.bgTertiary,
              border: `1px solid ${colors.border}`,
              borderRadius: 4,
              color: theme.text,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <option value="AND">AND</option>
            <option value="OR">OR</option>
          </select>
          <a
            href="https://docs.fastly.com/en/guides/compute/"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="View documentation"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: colors.text + '20',
              color: colors.text,
              fontSize: 11,
              fontWeight: 600,
              textDecoration: 'none',
              opacity: 0.7,
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
          >
            ?
          </a>
        </div>
      </div>

      {/* Handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="trigger"
        style={{
          width: HANDLE_SIZE,
          height: HANDLE_SIZE,
          border: `2px solid ${colors.border}`,
          borderRadius: '50%',
          background: theme.portBool,
          top: 24,
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="match"
        style={{
          width: HANDLE_SIZE,
          height: HANDLE_SIZE,
          border: `2px solid ${colors.border}`,
          borderRadius: '50%',
          background: theme.portBool,
          top: collapsed ? 24 : 24,
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="noMatch"
        style={{
          width: HANDLE_SIZE,
          height: HANDLE_SIZE,
          border: `2px solid ${colors.border}`,
          borderRadius: '50%',
          background: theme.portBool,
          top: collapsed ? 24 : 52,
        }}
      />

      {/* Port labels (always visible) */}
      {!collapsed && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '6px 14px',
          borderBottom: `1px solid ${colors.border}`,
        }}>
          <span style={{ fontSize: 11, color: theme.textMuted }}>Trigger</span>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <span style={{ fontSize: 11, color: theme.portBool }}>Match</span>
            <span style={{ fontSize: 11, color: theme.textMuted }}>No Match</span>
          </div>
        </div>
      )}

      {/* Conditions */}
      {!collapsed && (
        <div style={{ padding: 10 }}>
          {/* Logic indicator */}
          <div style={{
            textAlign: 'center',
            fontSize: 10,
            color: theme.textMuted,
            marginBottom: 8,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            {logic === 'AND' ? 'All conditions must match' : 'Any condition must match'}
          </div>

          {/* Condition cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {conditions.map((condition, idx) => (
              <div
                key={condition.id}
                style={{
                  background: theme.bgTertiary,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 6,
                  padding: 8,
                  position: 'relative',
                }}
              >
                {/* Logic connector between conditions */}
                {idx > 0 && (
                  <div style={{
                    position: 'absolute',
                    top: -14,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    fontSize: 9,
                    fontWeight: 600,
                    color: colors.text,
                    background: colors.body,
                    padding: '0 4px',
                  }}>
                    {logic}
                  </div>
                )}

                {/* Remove button */}
                <button
                  onClick={() => removeCondition(condition.id)}
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 16,
                    height: 16,
                    border: 'none',
                    background: 'transparent',
                    color: theme.textMuted,
                    cursor: 'pointer',
                    fontSize: 12,
                    lineHeight: 1,
                    padding: 0,
                    borderRadius: 4,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#ef4444'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = theme.textMuted
                  }}
                >
                  ×
                </button>

                {/* Condition fields */}
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    value={condition.field}
                    onChange={(e) => {
                      const newField = e.target.value
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
                    style={{
                      padding: '4px 6px',
                      background: theme.bg,
                      border: `1px solid ${theme.border}`,
                      borderRadius: 4,
                      color: theme.text,
                      fontSize: 11,
                      flex: '0 0 auto',
                    }}
                  >
                    {fieldOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>

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
                      style={{
                        padding: '4px 6px',
                        background: theme.bg,
                        border: `1px solid ${theme.border}`,
                        borderRadius: 4,
                        color: theme.text,
                        fontSize: 11,
                        flex: '0 0 auto',
                        width: 80,
                      }}
                    />
                  )}

                  {booleanFields.has(condition.field) ? (
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 11,
                      color: theme.textMuted,
                      cursor: 'pointer',
                      flex: 1,
                    }}>
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
                        style={{ accentColor: '#FF282D' }}
                      />
                      {condition.value === 'true' ? 'Yes' : 'No'}
                    </label>
                  ) : (
                    <>
                      <select
                        value={condition.operator}
                        onChange={(e) => updateCondition(condition.id, 'operator', e.target.value)}
                        style={{
                          padding: '4px 6px',
                          background: theme.bg,
                          border: `1px solid ${theme.border}`,
                          borderRadius: 4,
                          color: theme.text,
                          fontSize: 11,
                          flex: '0 0 auto',
                        }}
                      >
                        {operatorOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>

                      <input
                        type="text"
                        value={condition.value}
                        onChange={(e) => updateCondition(condition.id, 'value', e.target.value)}
                        placeholder="value"
                        style={{
                          padding: '4px 6px',
                          background: theme.bg,
                          border: `1px solid ${theme.border}`,
                          borderRadius: 4,
                          color: theme.text,
                          fontSize: 11,
                          flex: 1,
                          minWidth: 80,
                        }}
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
            style={{
              width: '100%',
              marginTop: 8,
              padding: '6px 12px',
              background: 'transparent',
              border: `1px dashed ${theme.border}`,
              borderRadius: 6,
              color: theme.textMuted,
              cursor: 'pointer',
              fontSize: 11,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = colors.border
              e.currentTarget.style.color = colors.text
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = theme.border
              e.currentTarget.style.color = theme.textMuted
            }}
          >
            + Add Condition
          </button>
        </div>
      )}
    </div>
  )
}
