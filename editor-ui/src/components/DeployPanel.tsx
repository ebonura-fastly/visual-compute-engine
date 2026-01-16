import { useState, useCallback } from 'react'
import type { Node, Edge } from '@xyflow/react'
import {
  validateGraph,
  generateCompressedConfigStoreContent,
  generateFastlyToml,
  type ServiceConfig
} from '../utils/ruleConverter'

type Props = {
  nodes: Node[]
  edges: Edge[]
}

const defaultConfig: ServiceConfig = {
  name: 'vce-service',
  backends: [
    { name: 'protected_origin', host: 'origin.example.com', useTls: true }
  ],
  defaultBackend: 'protected_origin',
  configStoreName: 'security_rules',
  logEndpoint: 'security_logs'
}

export function DeployPanel({ nodes, edges }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [config, setConfig] = useState<ServiceConfig>(defaultConfig)
  const [stats, setStats] = useState<{
    originalSize: number
    compressedSize: number
    compressionRatio: number
    fitsInConfigStore: boolean
  } | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [exportedData, setExportedData] = useState<string | null>(null)

  const handleValidate = useCallback(() => {
    const result = validateGraph(nodes, edges)
    setErrors(result.errors)
    return result.valid
  }, [nodes, edges])

  const handlePack = useCallback(async () => {
    if (!handleValidate()) return

    try {
      const { content, stats: packStats } = await generateCompressedConfigStoreContent(nodes, edges)
      setStats(packStats)
      setExportedData(JSON.stringify(content, null, 2))
    } catch (err) {
      setErrors([`Compression error: ${err instanceof Error ? err.message : 'Unknown error'}`])
    }
  }, [nodes, edges, handleValidate])

  const handleExportConfigStore = useCallback(() => {
    if (!exportedData) return

    const blob = new Blob([exportedData], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${config.configStoreName}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [exportedData, config.configStoreName])

  const handleExportFastlyToml = useCallback(() => {
    const toml = generateFastlyToml(config)
    const blob = new Blob([toml], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'fastly.toml'
    a.click()
    URL.revokeObjectURL(url)
  }, [config])

  const updateBackend = useCallback((index: number, field: string, value: string | boolean) => {
    setConfig(prev => ({
      ...prev,
      backends: prev.backends.map((b, i) =>
        i === index ? { ...b, [field]: value } : b
      )
    }))
  }, [])

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)} style={toggleStyle}>
        Deploy
      </button>
    )
  }

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span>Deploy to Fastly</span>
        <button onClick={() => setIsOpen(false)} style={closeStyle}>×</button>
      </div>

      <div style={bodyStyle}>
        {/* Service Config */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Service Configuration</div>
          <div style={fieldStyle}>
            <label>Service Name</label>
            <input
              type="text"
              value={config.name}
              onChange={(e) => setConfig(prev => ({ ...prev, name: e.target.value }))}
              style={inputStyle}
            />
          </div>
          <div style={fieldStyle}>
            <label>Config Store Name</label>
            <input
              type="text"
              value={config.configStoreName}
              onChange={(e) => setConfig(prev => ({ ...prev, configStoreName: e.target.value }))}
              style={inputStyle}
            />
          </div>
        </div>

        {/* Backend Config */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Backend (Protected Origin)</div>
          {config.backends.map((backend, idx) => (
            <div key={idx}>
              <div style={fieldStyle}>
                <label>Backend Name</label>
                <input
                  type="text"
                  value={backend.name}
                  onChange={(e) => updateBackend(idx, 'name', e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div style={fieldStyle}>
                <label>Host</label>
                <input
                  type="text"
                  value={backend.host}
                  onChange={(e) => updateBackend(idx, 'host', e.target.value)}
                  style={inputStyle}
                  placeholder="origin.example.com"
                />
              </div>
              <div style={fieldStyle}>
                <label>
                  <input
                    type="checkbox"
                    checked={backend.useTls ?? true}
                    onChange={(e) => updateBackend(idx, 'useTls', e.target.checked)}
                  />
                  {' '}Use TLS (HTTPS)
                </label>
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 15 }}>
          <button onClick={handlePack} style={primaryButtonStyle}>
            Pack Rules
          </button>
        </div>

        {/* Validation Errors */}
        {errors.length > 0 && (
          <div style={errorBoxStyle}>
            <div style={{ fontWeight: 'bold', marginBottom: 5 }}>Validation Errors:</div>
            {errors.map((err, i) => (
              <div key={i} style={{ fontSize: 11 }}>• {err}</div>
            ))}
          </div>
        )}

        {/* Compression Stats */}
        {stats && (
          <div style={statsBoxStyle}>
            <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Compression Stats</div>
            <div style={statRowStyle}>
              <span>Original:</span>
              <span>{stats.originalSize.toLocaleString()} bytes</span>
            </div>
            <div style={statRowStyle}>
              <span>Compressed:</span>
              <span>{stats.compressedSize.toLocaleString()} bytes</span>
            </div>
            <div style={statRowStyle}>
              <span>Ratio:</span>
              <span style={{ color: '#4caf50' }}>{stats.compressionRatio}% smaller</span>
            </div>
            <div style={statRowStyle}>
              <span>Config Store:</span>
              <span style={{ color: stats.fitsInConfigStore ? '#4caf50' : '#f44336' }}>
                {stats.fitsInConfigStore ? '✓ Fits (< 8KB)' : '✗ Too large!'}
              </span>
            </div>

            {stats.fitsInConfigStore && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={handleExportConfigStore} style={secondaryButtonStyle}>
                  Export Config Store JSON
                </button>
                <button onClick={handleExportFastlyToml} style={secondaryButtonStyle}>
                  Export fastly.toml
                </button>
              </div>
            )}
          </div>
        )}

        {/* Info */}
        <div style={infoStyle}>
          Rules are compressed using gzip and base64 encoded to maximize storage efficiency.
          Config Store limit: 8,000 characters per value.
        </div>
      </div>
    </div>
  )
}

const toggleStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 10,
  right: 10,
  padding: '8px 16px',
  background: '#2196f3',
  color: 'white',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  zIndex: 10,
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 10,
  right: 10,
  width: 380,
  maxHeight: 'calc(100vh - 80px)',
  overflow: 'auto',
  background: '#2a2a40',
  borderRadius: 8,
  boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
  color: 'white',
  zIndex: 10,
}

const headerStyle: React.CSSProperties = {
  padding: '10px 15px',
  borderBottom: '1px solid #444',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontWeight: 'bold',
}

const closeStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#888',
  fontSize: 20,
  cursor: 'pointer',
}

const bodyStyle: React.CSSProperties = {
  padding: 15,
}

const sectionStyle: React.CSSProperties = {
  marginBottom: 15,
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 'bold',
  color: '#888',
  marginBottom: 8,
  textTransform: 'uppercase',
}

const fieldStyle: React.CSSProperties = {
  marginBottom: 8,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  background: '#1a1a2e',
  border: '1px solid #444',
  borderRadius: 4,
  color: 'white',
  fontSize: 12,
  marginTop: 2,
}

const primaryButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px 16px',
  background: '#4caf50',
  color: 'white',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 13,
}

const secondaryButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: '6px 12px',
  background: '#333',
  color: 'white',
  border: '1px solid #555',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 11,
}

const errorBoxStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 10,
  background: 'rgba(244, 67, 54, 0.1)',
  border: '1px solid #f44336',
  borderRadius: 4,
  color: '#f44336',
  fontSize: 12,
}

const statsBoxStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  background: '#1a1a2e',
  borderRadius: 4,
  fontSize: 12,
}

const statRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  marginBottom: 4,
}

const infoStyle: React.CSSProperties = {
  marginTop: 15,
  padding: 10,
  background: 'rgba(33, 150, 243, 0.1)',
  borderRadius: 4,
  fontSize: 11,
  color: '#90caf9',
  lineHeight: 1.4,
}
