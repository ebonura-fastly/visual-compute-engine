import { Handle, Position, NodeResizer } from '@xyflow/react'
import { useState, type ReactNode } from 'react'
import { Box, Flex, Text, Select, Switch, TextInput, Textarea } from '@fastly/beacon-mantine'
import { IconHelp } from '@fastly/beacon-icons'

type PortDef = {
  id: string
  label: string
  type: 'bool' | 'string' | 'number' | 'geometry' | 'any'
}

type NodeBaseProps = {
  title: string
  category: 'input' | 'condition' | 'logic' | 'action' | 'routing'
  selected?: boolean
  collapsed?: boolean
  inputs?: PortDef[]
  outputs?: PortDef[]
  children?: ReactNode
  width?: number
  minWidth?: number
  maxWidth?: number
  resizable?: boolean
  docUrl?: string
}

// Layout constants
const HEADER_HEIGHT = 38
const PORT_ROW_HEIGHT = 28
const PORT_SECTION_PADDING = 8

export function NodeBase({
  title,
  category,
  selected = false,
  collapsed: initialCollapsed = false,
  inputs = [],
  outputs = [],
  children,
  width = 220,
  minWidth = 180,
  maxWidth = 400,
  resizable = false,
  docUrl,
}: NodeBaseProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  const maxPorts = Math.max(inputs.length, outputs.length)

  // Calculate handle positions - must match the visual row positions exactly
  const getHandleTop = (idx: number) => {
    return HEADER_HEIGHT + PORT_SECTION_PADDING + idx * PORT_ROW_HEIGHT + PORT_ROW_HEIGHT / 2
  }

  const nodeStyle: React.CSSProperties = resizable
    ? { width: '100%', minWidth, maxWidth, height: '100%' }
    : { width }

  return (
    <Box
      className="cc-node"
      data-category={category}
      data-selected={selected}
      style={nodeStyle}
    >
      {resizable && (
        <NodeResizer
          minWidth={minWidth}
          maxWidth={maxWidth}
          minHeight={100}
          isVisible={selected}
          lineClassName="cc-node-resizer-line"
          handleClassName="cc-node-resizer-handle"
        />
      )}

      {/* Header */}
      <Flex
        className="cc-node-header"
        onClick={() => setCollapsed(!collapsed)}
        align="center"
        justify="space-between"
      >
        <Flex align="center" gap="xs">
          <Text size="xs" className="cc-node-collapse-icon">{collapsed ? '▸' : '▾'}</Text>
          <Text size="sm" weight="bold" className="cc-node-title">{title}</Text>
        </Flex>
        {docUrl && (
          <a
            href={docUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="View documentation"
            className="cc-node-doc-link"
          >
            <IconHelp width={14} height={14} />
          </a>
        )}
      </Flex>

      {/* Handles - positioned absolutely relative to the node */}
      {inputs.map((port, idx) => (
        <Handle
          key={`in-${port.id}`}
          type="target"
          position={Position.Left}
          id={port.id}
          className="cc-handle"
          data-port-type={port.type}
          style={{ top: collapsed ? HEADER_HEIGHT / 2 : getHandleTop(idx) }}
        />
      ))}

      {outputs.map((port, idx) => (
        <Handle
          key={`out-${port.id}`}
          type="source"
          position={Position.Right}
          id={port.id}
          className="cc-handle"
          data-port-type={port.type}
          style={{ top: collapsed ? HEADER_HEIGHT / 2 : getHandleTop(idx) }}
        />
      ))}

      {/* Body (collapsible) */}
      {!collapsed && (
        <Box className="cc-node-body">
          {/* Port labels - rows must match handle positions */}
          {maxPorts > 0 && (
            <Flex className="cc-port-rows" justify="space-between">
              {/* Left ports labels */}
              <Box className="cc-port-column cc-port-column--left">
                {inputs.map((port) => (
                  <Text key={port.id} size="xs" className="cc-port-label">
                    {port.label}
                  </Text>
                ))}
              </Box>
              {/* Right ports labels */}
              <Box className="cc-port-column cc-port-column--right">
                {outputs.map((port) => (
                  <Text key={port.id} size="xs" className="cc-port-label">
                    {port.label}
                  </Text>
                ))}
              </Box>
            </Flex>
          )}

          {/* Node content (form fields) */}
          {children && (
            <Box className={`cc-node-content ${maxPorts > 0 ? 'cc-node-content--with-ports' : ''}`}>
              {children}
            </Box>
          )}
        </Box>
      )}
    </Box>
  )
}

// Form field components for inline editing
export function NodeField({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <Box className="cc-node-field" mb="xs">
      <Text component="label" size="xs" className="cc-node-field-label">
        {label}
      </Text>
      <Box className="cc-node-field-input">{children}</Box>
      {hint && (
        <Text size="xs" className="cc-node-field-hint">
          {hint}
        </Text>
      )}
    </Box>
  )
}

export function NodeSelect({
  value,
  onChange,
  options
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  // Wrapper with nodrag class + event stopping prevents React Flow from intercepting
  return (
    <Box
      className="nodrag nopan cc-node-select-wrapper"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Select
        value={value}
        onChange={(val) => val && onChange(val)}
        data={options}
        size="xs"
        searchable={false}
        className="cc-node-select-beacon"
        comboboxProps={{
          withinPortal: true,
          zIndex: 9999,
        }}
      />
    </Box>
  )
}

export function NodeInput({
  value,
  onChange,
  placeholder,
  type = 'text'
}: {
  value: string | number
  onChange: (value: string) => void
  placeholder?: string
  type?: 'text' | 'number'
}) {
  return (
    <Box
      className="nodrag nopan cc-node-input-wrapper"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <TextInput
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        size="xs"
        className="cc-node-input-beacon"
      />
    </Box>
  )
}

export function NodeCheckbox({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <Flex
      align="center"
      gap="xs"
      className="nodrag nopan cc-node-checkbox"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Switch
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
        size="sm"
      />
      <Text size="xs">{label}</Text>
    </Flex>
  )
}

export function NodeSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <Box className="cc-node-section">
      <Flex
        className="cc-node-section-header"
        onClick={() => setIsOpen(!isOpen)}
        align="center"
        gap="xs"
      >
        <Text size="xs" className="cc-node-section-icon">{isOpen ? '▾' : '▸'}</Text>
        <Text size="xs" weight="bold" className="cc-node-section-title">{title}</Text>
      </Flex>
      {isOpen && (
        <Box className="cc-node-section-content" pl="sm">
          {children}
        </Box>
      )}
    </Box>
  )
}

export function NodeTextarea({
  value,
  onChange,
  placeholder,
  minRows = 1,
  maxRows = 5,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minRows?: number
  maxRows?: number
}) {
  return (
    <Box
      className="nodrag nopan"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        minRows={minRows}
        maxRows={maxRows}
        autosize
        size="xs"
        className="cc-node-textarea"
      />
    </Box>
  )
}
