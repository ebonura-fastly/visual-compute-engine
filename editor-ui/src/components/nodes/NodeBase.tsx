import { Handle, Position, NodeResizer } from '@xyflow/react'
import { useState, type ReactNode } from 'react'
import { Select, type SelectOptionType } from '@fastly/beacon'

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
  const maxPorts = Math.max(inputs.length, outputs.length)

  // Calculate handle positions - must match the visual row positions exactly
  const getHandleTop = (idx: number) => {
    return HEADER_HEIGHT + PORT_SECTION_PADDING + idx * PORT_ROW_HEIGHT + PORT_ROW_HEIGHT / 2
  }

  const nodeStyle: React.CSSProperties = resizable
    ? { width: '100%', minWidth, maxWidth, height: '100%' }
    : { width }

  return (
    <div
      className="vce-node"
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
          lineClassName="vce-node-resizer-line"
          handleClassName="vce-node-resizer-handle"
        />
      )}

      {/* Header */}
      <div className="vce-node-header" onClick={() => setCollapsed(!collapsed)}>
        <div className="vce-node-header-content">
          <span className="vce-node-collapse-icon">{collapsed ? '▸' : '▾'}</span>
          <span className="vce-node-title">{title}</span>
        </div>
        {docUrl && (
          <a
            href={docUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="View documentation"
            className="vce-node-doc-link"
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
          className="vce-handle"
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
          className="vce-handle"
          data-port-type={port.type}
          style={{ top: collapsed ? HEADER_HEIGHT / 2 : getHandleTop(idx) }}
        />
      ))}

      {/* Body (collapsible) */}
      {!collapsed && (
        <div className="vce-node-body">
          {/* Port labels - rows must match handle positions */}
          {maxPorts > 0 && (
            <div className="vce-port-rows">
              {/* Left ports labels */}
              <div className="vce-port-column vce-port-column--left">
                {inputs.map((port) => (
                  <div key={port.id} className="vce-port-label">
                    {port.label}
                  </div>
                ))}
              </div>
              {/* Right ports labels */}
              <div className="vce-port-column vce-port-column--right">
                {outputs.map((port) => (
                  <div key={port.id} className="vce-port-label">
                    {port.label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Node content (form fields) */}
          {children && (
            <div className={`vce-node-content ${maxPorts > 0 ? 'vce-node-content--with-ports' : ''}`}>
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
  return (
    <div className="vce-node-field">
      <label className="vce-node-field-label">{label}</label>
      <div className="vce-node-field-input">{children}</div>
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
  const selectedOption = options.find(opt => opt.value === value) || null

  // Wrapper with nodrag class + event stopping prevents React Flow from intercepting
  return (
    <div
      className="nodrag nopan"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Select
        value={selectedOption}
        onChange={(option) => {
          if (option) {
            onChange((option as SelectOptionType).value)
          }
        }}
        options={options}
        menuPortalTarget={document.body}
        menuPosition="fixed"
        menuShouldBlockScroll={true}
        blurInputOnSelect={true}
        classNamePrefix="vce-select"
        className="vce-node-select-beacon"
        styles={{
          control: (base) => ({
            ...base,
            minHeight: '28px',
            fontSize: '12px',
          }),
          valueContainer: (base) => ({
            ...base,
            padding: '0 6px',
          }),
          input: (base) => ({
            ...base,
            margin: 0,
            padding: 0,
          }),
          indicatorsContainer: (base) => ({
            ...base,
            height: '28px',
          }),
          menu: (base) => ({
            ...base,
            zIndex: 9999,
            width: 'max-content',
            minWidth: '100%',
            maxWidth: '300px',
          }),
          menuList: (base) => ({
            ...base,
            maxHeight: '200px',
          }),
          option: (base) => ({
            ...base,
            fontSize: '12px',
            padding: '6px 10px',
          }),
        }}
      />
    </div>
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
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="vce-node-input"
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
  return (
    <label className="vce-node-checkbox">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
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

  return (
    <div className="vce-node-section">
      <div className="vce-node-section-header" onClick={() => setIsOpen(!isOpen)}>
        <span className="vce-node-section-icon">{isOpen ? '▾' : '▸'}</span>
        <span className="vce-node-section-title">{title}</span>
      </div>
      {isOpen && (
        <div className="vce-node-section-content">
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
  // Calculate rows based on content
  const lineCount = (value || '').split('\n').length
  const estimatedWrapLines = Math.ceil((value || '').length / 25)
  const rows = Math.min(maxRows, Math.max(minRows, lineCount, estimatedWrapLines))

  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="vce-node-textarea"
    />
  )
}
