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
      <button onClick={() => setIsOpen(true)} className="vce-panel-toggle vce-panel-toggle--deploy">
        Deploy
      </button>
    )
  }

  return (
    <div className="vce-panel vce-panel--deploy">
      <div className="vce-panel-header">
        <span>Deploy to Fastly</span>
        <button onClick={() => setIsOpen(false)} className="vce-panel-close">×</button>
      </div>

      <div className="vce-panel-body">
        {/* Service Config */}
        <div className="vce-panel-section">
          <div className="vce-panel-section-title">Service Configuration</div>
          <div className="form-group vce-mb-2">
            <label className="form-label">Service Name</label>
            <input
              type="text"
              value={config.name}
              onChange={(e) => setConfig(prev => ({ ...prev, name: e.target.value }))}
              className="form-input"
              data-size="sm"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Config Store Name</label>
            <input
              type="text"
              value={config.configStoreName}
              onChange={(e) => setConfig(prev => ({ ...prev, configStoreName: e.target.value }))}
              className="form-input"
              data-size="sm"
            />
          </div>
        </div>

        {/* Backend Config */}
        <div className="vce-panel-section">
          <div className="vce-panel-section-title">Backend (Protected Origin)</div>
          {config.backends.map((backend, idx) => (
            <div key={idx}>
              <div className="form-group vce-mb-2">
                <label className="form-label">Backend Name</label>
                <input
                  type="text"
                  value={backend.name}
                  onChange={(e) => updateBackend(idx, 'name', e.target.value)}
                  className="form-input"
                  data-size="sm"
                />
              </div>
              <div className="form-group vce-mb-2">
                <label className="form-label">Host</label>
                <input
                  type="text"
                  value={backend.host}
                  onChange={(e) => updateBackend(idx, 'host', e.target.value)}
                  className="form-input"
                  data-size="sm"
                  placeholder="origin.example.com"
                />
              </div>
              <label className="form-checkbox">
                <input
                  type="checkbox"
                  checked={backend.useTls ?? true}
                  onChange={(e) => updateBackend(idx, 'useTls', e.target.checked)}
                />
                <span className="form-checkbox-label">Use TLS (HTTPS)</span>
              </label>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="vce-panel-actions">
          <button onClick={handlePack} className="btn flex-1" data-variant="primary">
            Pack Rules
          </button>
        </div>

        {/* Validation Errors */}
        {errors.length > 0 && (
          <div className="alert vce-mt-3" data-variant="error">
            <div className="vce-panel-error-title">Validation Errors:</div>
            {errors.map((err, i) => (
              <div key={i} className="vce-panel-error-item">• {err}</div>
            ))}
          </div>
        )}

        {/* Compression Stats */}
        {stats && (
          <div className="vce-panel-stats vce-mt-3">
            <div className="vce-panel-stats-title">Compression Stats</div>
            <div className="vce-panel-stat-row">
              <span>Original:</span>
              <span>{stats.originalSize.toLocaleString()} bytes</span>
            </div>
            <div className="vce-panel-stat-row">
              <span>Compressed:</span>
              <span>{stats.compressedSize.toLocaleString()} bytes</span>
            </div>
            <div className="vce-panel-stat-row">
              <span>Ratio:</span>
              <span className="vce-text-success">{stats.compressionRatio}% smaller</span>
            </div>
            <div className="vce-panel-stat-row">
              <span>Config Store:</span>
              <span className={stats.fitsInConfigStore ? 'vce-text-success' : 'vce-text-error'}>
                {stats.fitsInConfigStore ? 'Fits (< 8KB)' : 'Too large!'}
              </span>
            </div>

            {stats.fitsInConfigStore && (
              <div className="vce-panel-actions vce-mt-3">
                <button onClick={handleExportConfigStore} className="btn flex-1" data-variant="secondary">
                  Export Config Store JSON
                </button>
                <button onClick={handleExportFastlyToml} className="btn flex-1" data-variant="secondary">
                  Export fastly.toml
                </button>
              </div>
            )}
          </div>
        )}

        {/* Info */}
        <div className="alert vce-mt-3" data-variant="info">
          Rules are compressed using gzip and base64 encoded to maximize storage efficiency.
          Config Store limit: 8,000 characters per value.
        </div>
      </div>
    </div>
  )
}
