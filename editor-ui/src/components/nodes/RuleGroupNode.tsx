import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react'
import { useCallback, useState } from 'react'
import { Box, Flex, Text, Pill, Button, TextInput, Switch, ActionIcon } from '@fastly/beacon-mantine'
import { IconHelp, IconClose, IconAdd } from '@fastly/beacon-icons'
import { NodeSelect, NodeInput } from './NodeBase'

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
    <Box
      className="cc-node cc-rule-group"
      data-category="logic"
      data-selected={selected}
    >
      {/* Header */}
      <Flex
        className="cc-node-header cc-rule-group-header"
        data-collapsed={collapsed}
        onClick={() => setCollapsed(!collapsed)}
        justify="space-between"
        align="center"
      >
        <Flex className="cc-rule-group-header-left" align="center" gap="xs">
          <Text size="xs" className="cc-node-collapse-icon">{collapsed ? '▸' : '▾'}</Text>
          <TextInput
            value={name}
            onChange={(e) => updateData({ name: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="cc-rule-group-name-input nodrag nopan"
            placeholder="Rule name..."
            variant="unstyled"
            size="xs"
          />
        </Flex>
        <Flex className="cc-rule-group-header-right" align="center" gap="xs">
          <Box className="cc-rule-group-logic-select" onClick={(e) => e.stopPropagation()}>
            <NodeSelect
              value={logic}
              onChange={(v) => updateData({ logic: v as 'AND' | 'OR' })}
              options={[
                { value: 'AND', label: 'AND' },
                { value: 'OR', label: 'OR' },
              ]}
            />
          </Box>
          <a
            href="https://docs.fastly.com/en/guides/compute/"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="View documentation"
            className="cc-node-doc-link"
          >
            <IconHelp width={14} height={14} />
          </a>
        </Flex>
      </Flex>

      {/* Handles - positions must align with port labels */}
      <Handle
        type="target"
        position={Position.Left}
        id="trigger"
        className="cc-handle"
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
        className="cc-handle"
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
        className="cc-handle"
        data-port-type="bool"
        style={{
          width: HANDLE_SIZE,
          height: HANDLE_SIZE,
          top: collapsed ? HEADER_HEIGHT / 2 : HEADER_HEIGHT + PORT_ROW_HEIGHT + PORT_ROW_HEIGHT / 2 + 6,
        }}
      />

      {/* Port labels (always visible) */}
      {!collapsed && (
        <Flex className="cc-rule-group-ports" justify="space-between">
          <Box className="cc-rule-group-ports-left">
            <Text size="xs" className="cc-rule-group-port-label">Trigger</Text>
          </Box>
          <Box className="cc-rule-group-ports-right">
            <Text size="xs" className="cc-rule-group-port-label cc-rule-group-port-label--match">Match</Text>
            <Text size="xs" className="cc-rule-group-port-label">No Match</Text>
          </Box>
        </Flex>
      )}

      {/* Conditions */}
      {!collapsed && (
        <Box className="cc-rule-group-body">
          {/* Logic indicator */}
          <Text size="xs" className="cc-rule-group-logic-hint">
            {logic === 'AND' ? 'All conditions must match' : 'Any condition must match'}
          </Text>

          {/* Condition cards */}
          <Box className="cc-rule-group-conditions">
            {conditions.map((condition, idx) => (
              <Box
                key={condition.id}
                className="cc-rule-group-condition"
              >
                {/* Logic connector between conditions */}
                {idx > 0 && (
                  <Box className="cc-rule-group-logic-connector">
                    <Pill variant="default">{logic}</Pill>
                  </Box>
                )}

                {/* Remove button */}
                <ActionIcon
                  onClick={() => removeCondition(condition.id)}
                  className="cc-rule-group-condition-remove"
                  title="Remove condition"
                  variant="subtle"
                  size="xs"
                >
                  <IconClose width={12} height={12} />
                </ActionIcon>

                {/* Condition fields - row layout with labels */}
                <Flex className="cc-rule-group-condition-fields" gap="xs" align="flex-end">
                  <Box className="cc-rule-group-field cc-rule-group-field--field">
                    <Text size="xs" className="cc-rule-group-field-label">Field</Text>
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
                  </Box>

                  {condition.field === 'header' && (
                    <Box className="cc-rule-group-field cc-rule-group-field--header">
                      <Text size="xs" className="cc-rule-group-field-label">Header</Text>
                      <NodeInput
                        value={condition.headerName || ''}
                        onChange={(v) => {
                          updateData({
                            conditions: conditions.map((c) =>
                              c.id === condition.id
                                ? { ...c, headerName: v }
                                : c
                            ),
                          })
                        }}
                        placeholder="Name"
                      />
                    </Box>
                  )}

                  {booleanFields.has(condition.field) ? (
                    <Box className="cc-rule-group-field cc-rule-group-field--bool">
                      <Text size="xs" className="cc-rule-group-field-label">Value</Text>
                      <Flex align="center" gap="xs" className="nodrag nopan">
                        <Switch
                          checked={condition.value === 'true'}
                          onChange={(e) => {
                            updateData({
                              conditions: conditions.map((c) =>
                                c.id === condition.id
                                  ? { ...c, operator: 'equals', value: e.currentTarget.checked ? 'true' : 'false' }
                                  : c
                              ),
                            })
                          }}
                          size="xs"
                        />
                        <Text size="xs">{condition.value === 'true' ? 'Yes' : 'No'}</Text>
                      </Flex>
                    </Box>
                  ) : (
                    <>
                      <Box className="cc-rule-group-field cc-rule-group-field--operator">
                        <Text size="xs" className="cc-rule-group-field-label">Operator</Text>
                        <NodeSelect
                          value={condition.operator}
                          onChange={(v) => updateCondition(condition.id, 'operator', v)}
                          options={operatorOptions}
                        />
                      </Box>

                      <Box className="cc-rule-group-field cc-rule-group-field--value">
                        <Text size="xs" className="cc-rule-group-field-label">Value</Text>
                        <NodeInput
                          value={condition.value}
                          onChange={(v) => updateCondition(condition.id, 'value', v)}
                          placeholder="Enter value..."
                        />
                      </Box>
                    </>
                  )}
                </Flex>
              </Box>
            ))}
          </Box>

          {/* Add condition button */}
          <Button
            variant="outline"
            size="sm"
            onClick={addCondition}
            leftSection={<IconAdd width={14} height={14} />}
            className="cc-rule-group-add-btn nodrag nopan"
          >
            Add Condition
          </Button>
        </Box>
      )}
    </Box>
  )
}
