import { Handle, Position, NodeResizer } from '@xyflow/react'
import { useState, type ReactNode } from 'react'
import { useTheme, fonts } from '../../styles/theme'

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
const HANDLE_SIZE = 12

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
  const { theme } = useTheme()

  const getNodeColors = () => {
    switch (category) {
      case 'input': return theme.nodeInput
      case 'condition': return theme.nodeCondition
      case 'logic': return theme.nodeLogic
      case 'action': return theme.nodeAction
      case 'routing': return theme.nodeRouting
      default: return theme.nodeCondition
    }
  }

  const getPortColor = (type: string) => {
    switch (type) {
      case 'bool': return theme.portBool
      case 'string': return theme.portString
      case 'number': return theme.portNumber
      case 'geometry': return theme.portGeometry
      default: return theme.portAny
    }
  }

  const colors = getNodeColors()
  const maxPorts = Math.max(inputs.length, outputs.length)

  // Calculate handle positions - must match the visual row positions exactly
  const getHandleTop = (idx: number) => {
    // Header + padding + (row index * row height) + half row height to center
    return HEADER_HEIGHT + PORT_SECTION_PADDING + idx * PORT_ROW_HEIGHT + PORT_ROW_HEIGHT / 2
  }

  return (
    <div style={{
      borderRadius: 8,
      border: `1px solid ${selected ? theme.primary : colors.border}`,
      fontFamily: fonts.sans,
      fontSize: 12,
      color: theme.textSecondary,
      boxShadow: selected
        ? `0 0 0 1px ${theme.primary}60, 0 4px 6px -1px rgba(0, 0, 0, 0.1)`
        : '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      width: resizable ? '100%' : width,
      minWidth: resizable ? minWidth : undefined,
      maxWidth: resizable ? maxWidth : undefined,
      height: resizable ? '100%' : undefined,
      background: colors.body,
    }}>
      {resizable && (
        <NodeResizer
          minWidth={minWidth}
          maxWidth={maxWidth}
          minHeight={100}
          isVisible={selected}
          lineStyle={{ borderColor: theme.primary, borderWidth: 1 }}
          handleStyle={{ backgroundColor: theme.primary, width: 8, height: 8, borderRadius: 2 }}
        />
      )}
      {/* Header */}
      <div
        style={{
          padding: '10px 14px',
          height: HEADER_HEIGHT,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none',
          borderBottom: `1px solid ${colors.border}`,
          background: colors.header,
        }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ marginRight: 8, fontSize: 10, color: colors.text }}>{collapsed ? '▸' : '▾'}</span>
          <span style={{ fontWeight: 600, fontSize: 13, letterSpacing: '0.2px', color: colors.text }}>{title}</span>
        </div>
        {docUrl && (
          <a
            href={docUrl}
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
        )}
      </div>

      {/* Handles - positioned absolutely relative to the node */}
      {inputs.map((port, idx) => (
        <Handle
          key={`in-${port.id}`}
          type="target"
          position={Position.Left}
          id={port.id}
          style={{
            width: HANDLE_SIZE,
            height: HANDLE_SIZE,
            border: `2px solid ${colors.border}`,
            borderRadius: '50%',
            background: getPortColor(port.type),
            top: collapsed ? HEADER_HEIGHT / 2 : getHandleTop(idx),
          }}
        />
      ))}

      {outputs.map((port, idx) => (
        <Handle
          key={`out-${port.id}`}
          type="source"
          position={Position.Right}
          id={port.id}
          style={{
            width: HANDLE_SIZE,
            height: HANDLE_SIZE,
            border: `2px solid ${colors.border}`,
            borderRadius: '50%',
            background: getPortColor(port.type),
            top: collapsed ? HEADER_HEIGHT / 2 : getHandleTop(idx),
          }}
        />
      ))}

      {/* Body (collapsible) */}
      {!collapsed && (
        <div style={{ padding: `${PORT_SECTION_PADDING}px 0` }}>
          {/* Port labels - rows must match handle positions */}
          {maxPorts > 0 && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '0 14px',
            }}>
              {/* Left ports labels */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {inputs.map((port) => (
                  <div key={port.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: 12,
                    color: theme.textMuted,
                    height: PORT_ROW_HEIGHT,
                  }}>
                    {port.label}
                  </div>
                ))}
              </div>
              {/* Right ports labels */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                {outputs.map((port) => (
                  <div key={port.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: 12,
                    color: theme.textMuted,
                    height: PORT_ROW_HEIGHT,
                  }}>
                    {port.label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Node content (form fields) */}
          {children && (
            <div style={{
              padding: '10px 14px',
              borderTop: `1px solid ${colors.border}`,
              marginTop: maxPorts > 0 ? 8 : 0,
            }}>
              {children}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Form field components for inline editing
export function NodeField({
  label,
  children
}: {
  label: string
  children: ReactNode
}) {
  const { theme } = useTheme()
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      marginBottom: 8,
      gap: 10,
    }}>
      <label style={{
        color: theme.textMuted,
        fontSize: 12,
        minWidth: 60,
        fontWeight: 500,
      }}>{label}</label>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
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
  const { theme } = useTheme()
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%',
        padding: '6px 10px',
        background: theme.bgTertiary,
        border: `1px solid ${theme.border}`,
        borderRadius: 6,
        color: theme.text,
        fontSize: 12,
        cursor: 'pointer',
        outline: 'none',
      }}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
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
  const { theme } = useTheme()
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%',
        padding: '6px 10px',
        background: theme.bgTertiary,
        border: `1px solid ${theme.border}`,
        borderRadius: 6,
        color: theme.text,
        fontSize: 12,
        boxSizing: 'border-box',
        outline: 'none',
      }}
    />
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
  const { theme } = useTheme()
  return (
    <label style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 12,
      color: theme.textMuted,
      cursor: 'pointer',
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: '#FF282D' }}
      />
      {label}
    </label>
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
  const { theme } = useTheme()

  return (
    <div style={{ marginTop: 8 }}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
          padding: '4px 0',
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: 9, color: theme.textMuted }}>{isOpen ? '▾' : '▸'}</span>
        <span style={{ fontSize: 11, fontWeight: 500, color: theme.textMuted }}>{title}</span>
      </div>
      {isOpen && (
        <div style={{
          paddingLeft: 4,
          paddingTop: 4,
          borderLeft: `2px solid ${theme.border}`,
          marginLeft: 4,
        }}>
          {children}
        </div>
      )}
    </div>
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
  const { theme } = useTheme()

  // Calculate rows based on content (newlines + wrapping estimate)
  const lineCount = (value || '').split('\n').length
  const estimatedWrapLines = Math.ceil((value || '').length / 25) // rough estimate for 25 chars per line
  const rows = Math.min(maxRows, Math.max(minRows, lineCount, estimatedWrapLines))

  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{
        width: '100%',
        padding: '6px 10px',
        background: theme.bgTertiary,
        border: `1px solid ${theme.border}`,
        borderRadius: 6,
        color: theme.text,
        fontSize: 12,
        boxSizing: 'border-box',
        outline: 'none',
        resize: 'vertical',
        fontFamily: 'inherit',
        lineHeight: 1.4,
      }}
    />
  )
}

// Re-export nodeColors for backward compatibility - this gets colors from static theme
// Components should use useTheme() instead for dynamic theming
export const nodeColors = {
  input: { header: '#FECACA', body: '#FEF2F2', border: '#F87171', text: '#991B1B' },
  condition: { header: '#BFDBFE', body: '#EFF6FF', border: '#60A5FA', text: '#1E40AF' },
  logic: { header: '#A7F3D0', body: '#ECFDF5', border: '#34D399', text: '#065F46' },
  action: { header: '#E9D5FF', body: '#FAF5FF', border: '#A78BFA', text: '#5B21B6' },
  routing: { header: '#A5F3FC', body: '#ECFEFF', border: '#22D3EE', text: '#0E7490' },
}

export const portColors = {
  bool: '#A78BFA',
  string: '#34D399',
  number: '#60A5FA',
  geometry: '#22D3EE',
  any: '#9CA3AF',
}
