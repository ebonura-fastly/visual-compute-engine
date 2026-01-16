import { useState, useCallback } from 'react'
import type { Node, Edge } from '@xyflow/react'
import { useTheme, fonts } from '../styles/theme'
import { allTemplates, templatesByCategory, instantiateTemplate, type RuleTemplate } from '../templates'

type SidebarProps = {
  nodes: Node[]
  edges: Edge[]
  onAddTemplate: (nodes: Node[], edges: Edge[]) => void
  onLoadRules?: (nodes: Node[], edges: Edge[]) => void
}

type Tab = 'components' | 'templates' | 'fastly'

// Node types with categories
const nodeTypes = [
  {
    type: 'request',
    label: 'Request',
    category: 'input' as const,
    description: 'Entry point',
  },
  {
    type: 'condition',
    label: 'Condition',
    category: 'condition' as const,
    description: 'Check request fields',
  },
  {
    type: 'ruleGroup',
    label: 'Rule Group',
    category: 'condition' as const,
    description: 'Multiple conditions with AND/OR',
  },
  {
    type: 'rateLimit',
    label: 'Rate Limit',
    category: 'condition' as const,
    description: 'Throttle requests',
  },
  {
    type: 'transform',
    label: 'Transform',
    category: 'routing' as const,
    description: 'Modify values',
  },
  {
    type: 'backend',
    label: 'Backend',
    category: 'routing' as const,
    description: 'Route to origin',
  },
  {
    type: 'logging',
    label: 'Logging',
    category: 'action' as const,
    description: 'Stream logs to endpoint',
  },
  {
    type: 'action',
    label: 'Action',
    category: 'action' as const,
    description: 'Block, Allow, Challenge',
  },
]

const categoryLabels: Record<string, string> = {
  security: 'Security',
  'rate-limiting': 'Rate Limiting',
  geo: 'Geo Blocking',
  bot: 'Bot Protection',
  'access-control': 'Access Control',
}

export function Sidebar({ nodes, edges, onAddTemplate, onLoadRules }: SidebarProps) {
  const { theme } = useTheme()
  const [activeTab, setActiveTab] = useState<Tab>('fastly')

  // Templates state
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Fastly connection state - lifted up to persist across tab switches
  const stored = loadStoredSettings()
  const [fastlyState, setFastlyState] = useState({
    apiToken: stored.apiToken,
    isConnected: false,
    services: [] as FastlyService[],
    configStores: [] as ConfigStore[],
    selectedService: stored.selectedService,
    selectedConfigStore: stored.selectedConfigStore,
  })

  // Local development mode state - lifted up to persist across tab switches
  const [localModeState, setLocalModeState] = useState({
    localMode: false,
    localServerAvailable: false,
    localComputeRunning: false,
    localEngineVersion: null as { engine: string; version: string; format: string } | null,
    hasLoadedRules: false, // Track if we've already loaded rules to avoid reloading on tab switch
  })

  // Get colors for each category from theme
  const getCategoryColors = (category: string) => {
    switch (category) {
      case 'input': return theme.nodeInput
      case 'condition': return theme.nodeCondition
      case 'logic': return theme.nodeLogic
      case 'action': return theme.nodeAction
      case 'routing': return theme.nodeRouting
      default: return theme.nodeCondition
    }
  }

  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType)
    event.dataTransfer.effectAllowed = 'move'
  }

  const handleAddTemplate = (template: RuleTemplate) => {
    const { nodes: templateNodes, edges: templateEdges } = instantiateTemplate(template, 100, 100)
    onAddTemplate(templateNodes, templateEdges)
  }

  const filteredTemplates = searchQuery
    ? allTemplates.filter(t =>
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : selectedCategory
      ? templatesByCategory[selectedCategory as keyof typeof templatesByCategory]
      : allTemplates

  const tabs: { id: Tab; label: string }[] = [
    { id: 'fastly', label: 'Services' },
    { id: 'components', label: 'Components' },
    { id: 'templates', label: 'Templates' },
  ]

  return (
    <div style={{
      width: 260,
      background: theme.bg,
      borderRight: `1px solid ${theme.border}`,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: fonts.sans,
    }}>
      {/* Tab Bar */}
      <div style={{
        display: 'flex',
        borderBottom: `1px solid ${theme.border}`,
      }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              padding: '12px 8px',
              background: activeTab === tab.id ? theme.bg : theme.bgSecondary,
              border: 'none',
              borderBottom: activeTab === tab.id ? `2px solid ${theme.primary}` : '2px solid transparent',
              color: activeTab === tab.id ? theme.text : theme.textMuted,
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'components' && (
          <ComponentsTab
            theme={theme}
            nodeTypes={nodeTypes}
            getCategoryColors={getCategoryColors}
            onDragStart={onDragStart}
          />
        )}
        {activeTab === 'templates' && (
          <TemplatesTab
            theme={theme}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            filteredTemplates={filteredTemplates}
            onAddTemplate={handleAddTemplate}
          />
        )}
        {activeTab === 'fastly' && (
          <FastlyTab
            theme={theme}
            nodes={nodes}
            edges={edges}
            onLoadRules={onLoadRules}
            fastlyState={fastlyState}
            setFastlyState={setFastlyState}
            localModeState={localModeState}
            setLocalModeState={setLocalModeState}
          />
        )}
      </div>
    </div>
  )
}

type NodeTypeDef = {
  type: string
  label: string
  category: 'input' | 'condition' | 'logic' | 'action' | 'routing'
  description: string
}

// Components Tab
function ComponentsTab({
  theme,
  nodeTypes,
  getCategoryColors,
  onDragStart,
}: {
  theme: any
  nodeTypes: NodeTypeDef[]
  getCategoryColors: (category: string) => any
  onDragStart: (event: React.DragEvent, nodeType: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 12 }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        flex: 1,
        overflowY: 'auto',
      }}>
        {nodeTypes.map(({ type, label, category, description }) => {
          const colors = getCategoryColors(category)
          return (
            <div
              key={type}
              draggable
              onDragStart={(e) => onDragStart(e, type)}
              style={{
                borderRadius: 6,
                border: `2px solid ${colors.border}`,
                overflow: 'hidden',
                cursor: 'grab',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}
            >
              <div style={{
                padding: '6px 10px',
                fontSize: 12,
                fontWeight: 600,
                background: colors.header,
                color: colors.text,
              }}>
                {label}
              </div>
              <div style={{
                padding: '6px 10px',
                background: colors.body,
              }}>
                <div style={{
                  fontSize: 10,
                  color: theme.textMuted,
                }}>{description}</div>
              </div>
            </div>
          )
        })}
      </div>
      <div style={{
        paddingTop: 12,
        fontSize: 10,
        color: theme.textMuted,
        textAlign: 'center',
      }}>
        Drag components onto the canvas
      </div>
    </div>
  )
}

// Templates Tab
function TemplatesTab({
  theme,
  searchQuery,
  setSearchQuery,
  selectedCategory,
  setSelectedCategory,
  filteredTemplates,
  onAddTemplate,
}: {
  theme: any
  searchQuery: string
  setSearchQuery: (q: string) => void
  selectedCategory: string | null
  setSelectedCategory: (c: string | null) => void
  filteredTemplates: RuleTemplate[]
  onAddTemplate: (template: RuleTemplate) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Search */}
      <input
        type="text"
        placeholder="Search templates..."
        value={searchQuery}
        onChange={(e) => {
          setSearchQuery(e.target.value)
          setSelectedCategory(null)
        }}
        style={{
          margin: '12px 12px 8px',
          padding: '8px 12px',
          background: theme.bgSecondary,
          border: `1px solid ${theme.border}`,
          borderRadius: 6,
          color: theme.text,
          fontSize: 12,
          outline: 'none',
        }}
      />

      {/* Category Tabs */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        padding: '0 12px 12px',
      }}>
        <button
          onClick={() => { setSelectedCategory(null); setSearchQuery('') }}
          style={{
            padding: '4px 8px',
            background: selectedCategory === null && !searchQuery ? theme.primary : theme.bgTertiary,
            border: 'none',
            borderRadius: 4,
            color: selectedCategory === null && !searchQuery ? '#FFFFFF' : theme.textMuted,
            fontSize: 10,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            fontWeight: 500,
          }}
        >
          All
        </button>
        {Object.entries(categoryLabels).map(([key, label]) => (
          <button
            key={key}
            onClick={() => { setSelectedCategory(key); setSearchQuery('') }}
            style={{
              padding: '4px 8px',
              background: selectedCategory === key ? theme.primary : theme.bgTertiary,
              border: 'none',
              borderRadius: 4,
              color: selectedCategory === key ? '#FFFFFF' : theme.textMuted,
              fontSize: 10,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontWeight: 500,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Templates List */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '0 12px 12px',
      }}>
        {filteredTemplates.map((template) => (
          <div
            key={template.id}
            style={{
              padding: 10,
              background: theme.bgSecondary,
              borderRadius: 6,
              marginBottom: 8,
              cursor: 'pointer',
              border: `1px solid ${theme.border}`,
              transition: 'border-color 0.15s',
            }}
            onClick={() => onAddTemplate(template)}
          >
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: theme.text, fontSize: 12, fontWeight: 600 }}>{template.name}</span>
            </div>
            <p style={{
              color: theme.textMuted,
              fontSize: 10,
              margin: '0 0 6px 0',
              lineHeight: 1.4,
            }}>{template.description}</p>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 4,
            }}>
              {template.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  style={{
                    padding: '2px 6px',
                    background: theme.bgTertiary,
                    borderRadius: 3,
                    color: theme.textMuted,
                    fontSize: 9,
                    fontWeight: 500,
                  }}
                >{tag}</span>
              ))}
            </div>
          </div>
        ))}
        {filteredTemplates.length === 0 && (
          <div style={{ textAlign: 'center', color: theme.textMuted, padding: 20, fontSize: 12 }}>
            No templates found
          </div>
        )}
      </div>
    </div>
  )
}

// Fastly Tab - extracted from FastlyPanel
import { compressRules, decompressRules, convertComputeRulesToGraph, validateGraph, type PackedRules } from '../utils/ruleConverter'
import { buildVcePackage } from '../lib/fastlyPackage'

type FastlyService = {
  id: string
  name: string
  type: string
  version: number
  isVceEnabled?: boolean
  linkedConfigStore?: string
}

type EngineVersion = {
  engine: string
  version: string
  format: string
} | null

type ConfigStore = {
  id: string
  name: string
  hasVceManifest?: boolean
}

type VceManifest = {
  version: string
  engine: string
  deployedAt: string
  serviceId: string
}

const VCE_MANIFEST_KEY = 'vce_manifest'
const VCE_ENGINE_VERSION = '1.1.3'
const FASTLY_API_BASE = 'https://api.fastly.com'
const STORAGE_KEY = 'vce-fastly'

function loadStoredSettings(): { apiToken: string; selectedService: string; selectedConfigStore: string } {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return JSON.parse(stored)
  } catch (e) {
    console.error('Failed to load stored settings:', e)
  }
  return { apiToken: '', selectedService: '', selectedConfigStore: '' }
}

function saveSettings(settings: { apiToken: string; selectedService: string; selectedConfigStore: string }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (e) {
    console.error('Failed to save settings:', e)
  }
}

function generateDomainName(serviceName: string): string {
  const sanitized = serviceName
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return `${sanitized}.edgecompute.app`
}

type FastlyState = {
  apiToken: string
  isConnected: boolean
  services: FastlyService[]
  configStores: ConfigStore[]
  selectedService: string
  selectedConfigStore: string
}

type LocalModeState = {
  localMode: boolean
  localServerAvailable: boolean
  localComputeRunning: boolean
  localEngineVersion: { engine: string; version: string; format: string } | null
  hasLoadedRules: boolean
}

function FastlyTab({
  theme,
  nodes,
  edges,
  onLoadRules,
  fastlyState,
  setFastlyState,
  localModeState,
  setLocalModeState,
}: {
  theme: any
  nodes: Node[]
  edges: Edge[]
  onLoadRules?: (nodes: Node[], edges: Edge[]) => void
  fastlyState: FastlyState
  setFastlyState: React.Dispatch<React.SetStateAction<FastlyState>>
  localModeState: LocalModeState
  setLocalModeState: React.Dispatch<React.SetStateAction<LocalModeState>>
}) {
  const { apiToken, isConnected, services, configStores, selectedService, selectedConfigStore } = fastlyState
  const { localMode, localServerAvailable, localComputeRunning, localEngineVersion, hasLoadedRules } = localModeState

  // Helper to update local mode state
  const updateLocalModeState = (updates: Partial<LocalModeState>) => {
    setLocalModeState(prev => ({ ...prev, ...updates }))
  }

  // Local UI state (doesn't need to persist)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createForm, setCreateForm] = useState({ serviceName: '' })
  const [createProgress, setCreateProgress] = useState<string | null>(null)
  const [engineVersion, setEngineVersion] = useState<EngineVersion>(null)
  const [engineVersionLoading, setEngineVersionLoading] = useState(false)
  const [engineUpdateProgress, setEngineUpdateProgress] = useState<string | null>(null)

  const LOCAL_API_URL = 'http://localhost:3001/local-api'

  // Check for local development environment on mount
  const checkLocalEnvironment = useCallback(async () => {
    // If already in local mode and rules loaded, just refresh status without reloading rules
    const shouldLoadRules = !hasLoadedRules

    // Check if local API server is running
    try {
      const healthResponse = await fetch(`${LOCAL_API_URL}/health`, { method: 'GET' })
      if (healthResponse.ok) {
        updateLocalModeState({ localServerAvailable: true })

        // Check if local Compute server is running (via proxy to avoid CORS)
        try {
          const computeResponse = await fetch(`${LOCAL_API_URL}/compute-status`, { method: 'GET' })
          if (computeResponse.ok) {
            const data = await computeResponse.json()
            if (data.running) {
              updateLocalModeState({
                localComputeRunning: true,
                localEngineVersion: { engine: data.engine, version: data.version, format: data.format },
              })
            } else {
              updateLocalModeState({ localComputeRunning: false, localEngineVersion: null })
            }
          }
        } catch {
          updateLocalModeState({ localComputeRunning: false, localEngineVersion: null })
        }

        // Load rules from local file - only on first check, not when switching tabs back
        if (shouldLoadRules && onLoadRules) {
          try {
            const rulesResponse = await fetch(`${LOCAL_API_URL}/rules`)
            if (rulesResponse.ok) {
              const rulesData = await rulesResponse.json()
              if (rulesData.rules_packed) {
                const decompressed = await decompressRules(rulesData.rules_packed)
                const graphData = JSON.parse(decompressed)
                if (graphData.nodes && graphData.edges) {
                  onLoadRules(graphData.nodes, graphData.edges)
                  setStatus(`Local mode: Loaded ${graphData.nodes.length} nodes`)
                  updateLocalModeState({ hasLoadedRules: true })
                }
              }
            }
          } catch (err) {
            console.log('[Local] Failed to load local rules:', err)
          }
        }

        // Auto-enable local mode if local server is available
        updateLocalModeState({ localMode: true })
        setStatus('Local development mode active')
        return true
      }
    } catch {
      // Local server not running - that's fine
    }
    return false
  }, [onLoadRules, hasLoadedRules, updateLocalModeState])

  // Deploy rules to local file system
  const handleDeployLocal = async () => {
    const validation = validateGraph(nodes, edges)
    if (!validation.valid) {
      setError(`Validation failed:\n• ${validation.errors.join('\n• ')}`)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const graphPayload = { nodes, edges }
      const compressed = await compressRules(JSON.stringify(graphPayload))
      const fileContent = { rules_packed: compressed }

      const response = await fetch(`${LOCAL_API_URL}/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fileContent),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to save rules')
      }

      const result = await response.json()
      setStatus(result.message || 'Rules saved locally')

      // Re-check compute status via proxy
      try {
        const computeResponse = await fetch(`${LOCAL_API_URL}/compute-status`)
        if (computeResponse.ok) {
          const data = await computeResponse.json()
          if (data.running) {
            updateLocalModeState({
              localComputeRunning: true,
              localEngineVersion: { engine: data.engine, version: data.version, format: data.format },
            })
          }
        }
      } catch {
        // Compute server not running
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deploy locally')
    } finally {
      setLoading(false)
    }
  }

  // Refresh local environment status (uses local API proxy to avoid CORS)
  const handleRefreshLocal = async () => {
    setLoading(true)
    try {
      // Use the local API proxy to check Compute server (avoids CORS issues)
      const response = await fetch(`${LOCAL_API_URL}/compute-status`)
      if (response.ok) {
        const data = await response.json()
        if (data.running) {
          updateLocalModeState({
            localComputeRunning: true,
            localEngineVersion: { engine: data.engine, version: data.version, format: data.format },
          })
          setStatus('Local Compute server running')
        } else {
          updateLocalModeState({ localComputeRunning: false, localEngineVersion: null })
          setStatus('Local Compute server not running')
        }
      } else {
        updateLocalModeState({ localComputeRunning: false, localEngineVersion: null })
        setStatus('Local API server error')
      }
    } catch {
      updateLocalModeState({ localComputeRunning: false, localEngineVersion: null })
      setStatus('Local API server not available')
    } finally {
      setLoading(false)
    }
  }

  // Helper to update fastly state
  const updateFastlyState = (updates: Partial<FastlyState>) => {
    setFastlyState(prev => ({ ...prev, ...updates }))
  }

  const fastlyFetch = useCallback(async (endpoint: string, options: RequestInit = {}) => {
    const response = await fetch(`${FASTLY_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Fastly-Key': apiToken,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Fastly API error: ${response.status} - ${text}`)
    }
    return response.json()
  }, [apiToken])

  const fetchEngineVersion = useCallback(async (serviceName: string) => {
    setEngineVersionLoading(true)
    setEngineVersion(null)

    try {
      const domain = generateDomainName(serviceName)
      const response = await fetch(`https://${domain}/_version`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      })

      if (response.ok) {
        const data = await response.json()
        if (data.engine && data.version) {
          setEngineVersion(data)
        }
      }
    } catch (err) {
      console.log('[Version] Failed to fetch engine version:', err)
      // Not an error - service might not be deployed yet or unreachable
    } finally {
      setEngineVersionLoading(false)
    }
  }, [])

  const handleUpdateEngine = async () => {
    const service = services.find(s => s.id === selectedService)
    if (!service) {
      setError('No service selected')
      return
    }

    setLoading(true)
    setError(null)
    setEngineUpdateProgress('Fetching current service version...')
    console.log('[Engine Update] Starting update for service:', service.name, service.id)

    try {
      // Get the active version number
      console.log('[Engine Update] Fetching service details...')
      const serviceData = await fastlyFetch(`/service/${service.id}/details`)
      const activeVersion = serviceData.active_version?.number
      console.log('[Engine Update] Active version:', activeVersion)
      if (!activeVersion) {
        throw new Error('No active version found for service')
      }

      setEngineUpdateProgress('Cloning service version...')
      // Clone the active version to create a new one
      console.log('[Engine Update] Cloning version', activeVersion)
      const clonedVersion = await fastlyFetch(`/service/${service.id}/version/${activeVersion}/clone`, {
        method: 'PUT',
      })
      const newVersionNumber = clonedVersion.number
      console.log('[Engine Update] Created new version:', newVersionNumber)

      setEngineUpdateProgress('Building VCE Engine package...')
      // Build the new package
      console.log('[Engine Update] Building package...')
      const packageB64 = await buildVcePackage(service.name)
      console.log('[Engine Update] Package built, size:', packageB64.length, 'bytes (base64)')
      const packageBlob = await fetch(`data:application/gzip;base64,${packageB64}`).then(r => r.blob())
      console.log('[Engine Update] Package blob size:', packageBlob.size, 'bytes')

      setEngineUpdateProgress('Uploading package...')
      // Upload the package
      console.log('[Engine Update] Uploading package to version', newVersionNumber)
      const formData = new FormData()
      formData.append('package', packageBlob, 'package.tar.gz')

      const uploadResponse = await fetch(`${FASTLY_API_BASE}/service/${service.id}/version/${newVersionNumber}/package`, {
        method: 'PUT',
        headers: { 'Fastly-Key': apiToken },
        body: formData,
      })

      if (!uploadResponse.ok) {
        const text = await uploadResponse.text()
        console.error('[Engine Update] Package upload failed:', uploadResponse.status, text)
        throw new Error(`Package upload failed: ${uploadResponse.status} - ${text}`)
      }
      const uploadResult = await uploadResponse.json()
      console.log('[Engine Update] Package uploaded successfully:', uploadResult)

      setEngineUpdateProgress('Activating new version...')
      // Activate the new version
      console.log('[Engine Update] Activating version', newVersionNumber)
      const activateResult = await fastlyFetch(`/service/${service.id}/version/${newVersionNumber}/activate`, { method: 'PUT' })
      console.log('[Engine Update] Version activated:', activateResult)

      setStatus(`VCE Engine updated to v${VCE_ENGINE_VERSION}`)
      setEngineUpdateProgress('Waiting for edge propagation...')
      console.log('[Engine Update] Update complete! Waiting for edge propagation...')

      // Refetch the engine version after a short delay to let the edge propagate
      setTimeout(async () => {
        console.log('[Engine Update] Re-checking engine version...')
        setEngineUpdateProgress('Verifying deployment...')
        await fetchEngineVersion(service.name)
        setEngineUpdateProgress(null)
        setLoading(false)
      }, 3000)

    } catch (err) {
      console.error('[Engine Update] Error:', err)
      setError(err instanceof Error ? err.message : 'Engine update failed')
      setEngineUpdateProgress(null)
      setLoading(false)
    }
  }

  const handleConnect = async () => {
    if (!apiToken) {
      setError('Please enter an API token')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const servicesData = await fastlyFetch('/service')
      const computeServices: FastlyService[] = servicesData
        .filter((s: any) => s.type === 'wasm')
        .map((s: any) => ({
          id: s.id,
          name: s.name,
          type: s.type,
          version: s.versions?.[s.versions.length - 1]?.number || 1,
        }))

      const storesData = await fastlyFetch('/resources/stores/config')
      const storesArray = Array.isArray(storesData) ? storesData : (storesData.data || [])
      const stores: ConfigStore[] = storesArray.map((s: any) => ({
        id: s.id,
        name: s.name || s.attributes?.name || s.id,
      }))

      const storesWithManifest: ConfigStore[] = []
      for (const store of stores) {
        try {
          // First, list items in the store to check if vce_manifest exists (avoids 404 errors)
          const itemsResponse = await fetch(`${FASTLY_API_BASE}/resources/stores/config/${store.id}/items?limit=100`, {
            headers: { 'Fastly-Key': apiToken, 'Accept': 'application/json' },
          })

          if (!itemsResponse.ok) {
            storesWithManifest.push(store)
            continue
          }

          const itemsData = await itemsResponse.json()
          const items = itemsData?.data || itemsData || []
          const hasManifestItem = items.some((item: any) => item.key === VCE_MANIFEST_KEY || item.item_key === VCE_MANIFEST_KEY)

          if (!hasManifestItem) {
            storesWithManifest.push(store)
            continue
          }

          // Only fetch the manifest if we know it exists
          const response = await fetch(`${FASTLY_API_BASE}/resources/stores/config/${store.id}/item/${VCE_MANIFEST_KEY}`, {
            headers: { 'Fastly-Key': apiToken, 'Accept': 'application/json' },
          })

          if (response.ok) {
            const manifestData = await response.json()
            if (manifestData?.value || manifestData?.item_value) {
              const manifest: VceManifest = JSON.parse(manifestData.value || manifestData.item_value)
              storesWithManifest.push({ ...store, hasVceManifest: true })
              const serviceIdx = computeServices.findIndex(s => s.id === manifest.serviceId)
              if (serviceIdx !== -1) {
                computeServices[serviceIdx].isVceEnabled = true
                computeServices[serviceIdx].linkedConfigStore = store.id
              }
            } else {
              storesWithManifest.push(store)
            }
          } else {
            storesWithManifest.push(store)
          }
        } catch {
          storesWithManifest.push(store)
        }
      }

      // Sort: VCE-enabled first, then by name
      computeServices.sort((a, b) => {
        if (a.isVceEnabled && !b.isVceEnabled) return -1
        if (!a.isVceEnabled && b.isVceEnabled) return 1
        return a.name.localeCompare(b.name)
      })

      // Also detect services by name pattern (vce-*) even without manifest
      // This helps show newly created services before they're fully configured
      for (const service of computeServices) {
        if (!service.isVceEnabled && service.name.toLowerCase().startsWith('vce-')) {
          service.isVceEnabled = true // Mark as VCE service by naming convention
        }
      }

      // Check if we have a previously selected service or auto-select the first VCE service
      const vceServices = computeServices.filter(s => s.isVceEnabled)
      let serviceToSelect = selectedService
      let storeToSelect = selectedConfigStore

      // If previously selected service exists and is VCE-enabled, use it
      const previousService = computeServices.find(s => s.id === selectedService && s.isVceEnabled)
      if (previousService) {
        storeToSelect = previousService.linkedConfigStore || ''
      } else if (vceServices.length > 0) {
        // Auto-select the first VCE service
        serviceToSelect = vceServices[0].id
        storeToSelect = vceServices[0].linkedConfigStore || ''
      }

      updateFastlyState({
        services: computeServices,
        configStores: storesWithManifest,
        isConnected: true,
        selectedService: serviceToSelect,
        selectedConfigStore: storeToSelect,
      })
      setStatus('Connected to Fastly')
      saveSettings({ apiToken, selectedService: serviceToSelect, selectedConfigStore: storeToSelect })

      // Load rules for the selected service
      if (storeToSelect && onLoadRules) {
        const serviceName = computeServices.find(s => s.id === serviceToSelect)?.name || ''
        await loadRulesFromStore(storeToSelect, serviceName)
        // Fetch engine version from deployed service
        if (serviceName) {
          fetchEngineVersion(serviceName)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
      updateFastlyState({ isConnected: false })
    } finally {
      setLoading(false)
    }
  }

  const loadRulesFromStore = async (storeId: string, serviceName: string) => {
    if (!onLoadRules) return

    try {
      const url = `${FASTLY_API_BASE}/resources/stores/config/${storeId}/item/rules_packed`
      console.log('[Load] Fetching from:', url)
      const response = await fetch(url, {
        headers: { 'Fastly-Key': apiToken, 'Accept': 'application/json' },
      })
      console.log('[Load] Response status:', response.status)

      if (response.ok) {
        const rulesData = await response.json()
        const compressedRules = rulesData?.value || rulesData?.item_value
        if (compressedRules) {
          const decompressed = await decompressRules(compressedRules)
          const graphData = JSON.parse(decompressed)

          if (graphData.nodes && graphData.edges) {
            console.log('[Load] Using new graph format - nodes:', graphData.nodes.length, 'edges:', graphData.edges.length)
            onLoadRules(graphData.nodes, graphData.edges)
            setStatus(`Loaded ${graphData.nodes.length} nodes from ${serviceName}`)
          } else if (graphData.r && graphData.d) {
            console.log('[Load] Using old packed rules format')
            const { nodes: loadedNodes, edges: loadedEdges } = convertComputeRulesToGraph(graphData as PackedRules)
            if (loadedNodes.length > 0) {
              onLoadRules(loadedNodes, loadedEdges)
              setStatus(`Loaded ${loadedNodes.length} nodes from ${serviceName}`)
            } else {
              onLoadRules([], [])
              setStatus(`Selected ${serviceName} (no rules deployed yet)`)
            }
          } else {
            onLoadRules([], [])
            setStatus(`Selected ${serviceName} (no rules deployed yet)`)
          }
        } else {
          onLoadRules([], [])
          setStatus(`Selected ${serviceName} (no rules deployed yet)`)
        }
      } else {
        onLoadRules([], [])
        setStatus(`Selected ${serviceName} (no rules deployed yet)`)
      }
    } catch (err) {
      console.error('[Load] Error:', err)
      onLoadRules([], [])
      setStatus(`Selected ${serviceName}`)
    }
  }

  const handleDisconnect = () => {
    updateFastlyState({
      apiToken: '',
      isConnected: false,
      services: [],
      configStores: [],
      selectedService: '',
      selectedConfigStore: '',
    })
    setStatus(null)
    saveSettings({ apiToken: '', selectedService: '', selectedConfigStore: '' })
  }

  const handleServiceChange = async (serviceId: string) => {
    console.log('[Load] Service changed to:', serviceId)
    const service = services.find(s => s.id === serviceId)
    const linkedStore = service?.linkedConfigStore || ''
    console.log('[Load] Linked store:', linkedStore)
    updateFastlyState({
      selectedService: serviceId,
      selectedConfigStore: linkedStore,
    })
    saveSettings({ apiToken, selectedService: serviceId, selectedConfigStore: linkedStore })

    // Fetch engine version from deployed service
    if (service?.name) {
      fetchEngineVersion(service.name)
    }

    if (linkedStore) {
      setLoading(true)
      setStatus('Loading rules from Config Store...')
      await loadRulesFromStore(linkedStore, service?.name || '')
      setLoading(false)
    } else if (service && !service.isVceEnabled) {
      // Non-VCE service selected - clear canvas and show setup prompt
      if (onLoadRules) {
        onLoadRules([], [])
      }
      setStatus(`Selected ${service.name} - Click "Enable VCE" to configure`)
    } else if (service) {
      // VCE service without linked store (detected by name pattern)
      if (onLoadRules) {
        onLoadRules([], [])
      }
      setStatus(`Selected ${service.name} - Deploy rules to configure`)
    }
  }

  // Refresh the selected service (re-check engine version)
  const handleRefreshService = async () => {
    const service = services.find(s => s.id === selectedService)
    if (!service) return

    setEngineVersionLoading(true)
    setStatus('Checking service status...')

    // Re-fetch engine version
    await fetchEngineVersion(service.name)

    // Also reload rules if there's a linked config store
    if (service.linkedConfigStore) {
      await loadRulesFromStore(service.linkedConfigStore, service.name)
    }

    setStatus(`Refreshed ${service.name}`)
  }

  // Enable VCE on an existing Compute service
  const handleEnableVce = async () => {
    const service = services.find(s => s.id === selectedService)
    if (!service) {
      setError('No service selected')
      return
    }

    setLoading(true)
    setError(null)
    setCreateProgress('Creating Config Store...')

    try {
      // Get the latest version number
      const serviceData = await fastlyFetch(`/service/${service.id}/details`)
      const latestVersion = serviceData.versions?.[serviceData.versions.length - 1]?.number || 1

      // Check if we need to clone (if version is active/locked)
      let versionToUse = latestVersion
      const versionData = await fastlyFetch(`/service/${service.id}/version/${latestVersion}`)
      if (versionData.active || versionData.locked) {
        setCreateProgress('Cloning service version...')
        const clonedVersion = await fastlyFetch(`/service/${service.id}/version/${latestVersion}/clone`, {
          method: 'PUT',
        })
        versionToUse = clonedVersion.number
      }

      // Create Config Store
      const configStoreName = `${service.name}-rules`
      const configStoreData = await fastlyFetch('/resources/stores/config', {
        method: 'POST',
        body: JSON.stringify({ name: configStoreName }),
      })
      const configStoreId = configStoreData.id
      setCreateProgress('Linking Config Store to service...')

      // Link Config Store to service
      await fastlyFetch(`/service/${service.id}/version/${versionToUse}/resource`, {
        method: 'POST',
        body: JSON.stringify({ resource_id: configStoreId, name: 'security_rules' }),
      })
      setCreateProgress('Building and uploading VCE Engine...')

      // Build and upload the WASM package
      const packageB64 = await buildVcePackage(service.name)
      const packageBlob = await fetch(`data:application/gzip;base64,${packageB64}`).then(r => r.blob())
      const formData = new FormData()
      formData.append('package', packageBlob, 'package.tar.gz')

      const uploadResponse = await fetch(`${FASTLY_API_BASE}/service/${service.id}/version/${versionToUse}/package`, {
        method: 'PUT',
        headers: { 'Fastly-Key': apiToken },
        body: formData,
      })

      if (!uploadResponse.ok) {
        const text = await uploadResponse.text()
        throw new Error(`Package upload failed: ${uploadResponse.status} - ${text}`)
      }
      setCreateProgress('Activating service version...')

      // Activate the new version
      await fastlyFetch(`/service/${service.id}/version/${versionToUse}/activate`, { method: 'PUT' })
      setCreateProgress('Deploying VCE manifest...')

      // Create manifest in Config Store
      const manifest: VceManifest = {
        version: VCE_ENGINE_VERSION,
        engine: 'visual-compute-engine',
        deployedAt: new Date().toISOString(),
        serviceId: service.id,
      }
      const manifestFormData = new URLSearchParams()
      manifestFormData.append('item_value', JSON.stringify(manifest))

      await fetch(`${FASTLY_API_BASE}/resources/stores/config/${configStoreId}/item/${VCE_MANIFEST_KEY}`, {
        method: 'PUT',
        headers: { 'Fastly-Key': apiToken, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: manifestFormData.toString(),
      })

      // Update local state
      const newConfigStore: ConfigStore = {
        id: configStoreId,
        name: configStoreName,
        hasVceManifest: true,
      }

      updateFastlyState({
        services: services.map(s =>
          s.id === service.id ? { ...s, isVceEnabled: true, linkedConfigStore: configStoreId } : s
        ),
        configStores: [newConfigStore, ...configStores],
        selectedConfigStore: configStoreId,
      })
      saveSettings({ apiToken, selectedService: service.id, selectedConfigStore: configStoreId })
      setStatus(`VCE enabled on "${service.name}"!`)

      // Fetch engine version after a delay
      setTimeout(() => fetchEngineVersion(service.name), 3000)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enable VCE')
    } finally {
      setLoading(false)
      setCreateProgress(null)
    }
  }

  const handleCreateService = async () => {
    if (!createForm.serviceName) {
      setError('Please enter a service name')
      return
    }

    setLoading(true)
    setError(null)
    setCreateProgress('Creating Fastly service...')

    try {
      const serviceData = await fastlyFetch('/service', {
        method: 'POST',
        body: JSON.stringify({ name: createForm.serviceName, type: 'wasm' }),
      })
      const serviceId = serviceData.id
      const serviceVersion = serviceData.versions?.[0]?.number || 1
      setCreateProgress('Creating Config Store...')

      const configStoreName = `${createForm.serviceName}-rules`
      const configStoreData = await fastlyFetch('/resources/stores/config', {
        method: 'POST',
        body: JSON.stringify({ name: configStoreName }),
      })
      const configStoreId = configStoreData.id
      setCreateProgress('Linking Config Store to service...')

      await fastlyFetch(`/service/${serviceId}/version/${serviceVersion}/resource`, {
        method: 'POST',
        body: JSON.stringify({ resource_id: configStoreId, name: 'security_rules' }),
      })
      setCreateProgress('Adding domain...')

      const domain = generateDomainName(createForm.serviceName)
      await fastlyFetch(`/service/${serviceId}/version/${serviceVersion}/domain`, {
        method: 'POST',
        body: JSON.stringify({ name: domain }),
      })
      setCreateProgress('Building and uploading WASM package...')

      const packageB64 = await buildVcePackage(createForm.serviceName)
      const packageBlob = await fetch(`data:application/gzip;base64,${packageB64}`).then(r => r.blob())
      const formData = new FormData()
      formData.append('package', packageBlob, 'package.tar.gz')

      await fetch(`${FASTLY_API_BASE}/service/${serviceId}/version/${serviceVersion}/package`, {
        method: 'PUT',
        headers: { 'Fastly-Key': apiToken },
        body: formData,
      }).then(async (res) => {
        if (!res.ok) {
          const text = await res.text()
          throw new Error(`Package upload failed: ${res.status} - ${text}`)
        }
        return res.json()
      })
      setCreateProgress('Activating service version...')

      await fastlyFetch(`/service/${serviceId}/version/${serviceVersion}/activate`, { method: 'PUT' })
      setCreateProgress('Deploying VCE manifest...')

      const manifest: VceManifest = {
        version: VCE_ENGINE_VERSION,
        engine: 'visual-compute-engine',
        deployedAt: new Date().toISOString(),
        serviceId: serviceId,
      }
      const manifestFormData = new URLSearchParams()
      manifestFormData.append('item_value', JSON.stringify(manifest))

      await fetch(`${FASTLY_API_BASE}/resources/stores/config/${configStoreId}/item/${VCE_MANIFEST_KEY}`, {
        method: 'PUT',
        headers: { 'Fastly-Key': apiToken, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: manifestFormData.toString(),
      }).then(async (res) => {
        if (!res.ok) {
          const text = await res.text()
          throw new Error(`Manifest creation failed: ${res.status} - ${text}`)
        }
        return res.json()
      })

      const newService: FastlyService = {
        id: serviceId,
        name: createForm.serviceName,
        type: 'wasm',
        version: serviceVersion,
        isVceEnabled: true,
        linkedConfigStore: configStoreId,
      }
      const newConfigStore: ConfigStore = {
        id: configStoreId,
        name: configStoreName,
        hasVceManifest: true,
      }

      updateFastlyState({
        services: [newService, ...services],
        configStores: [newConfigStore, ...configStores],
        selectedService: serviceId,
        selectedConfigStore: configStoreId,
      })
      saveSettings({ apiToken, selectedService: serviceId, selectedConfigStore: configStoreId })
      setShowCreateForm(false)
      setCreateForm({ serviceName: '' })
      setStatus(`VCE service "${createForm.serviceName}" created successfully!`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Service creation failed')
    } finally {
      setLoading(false)
      setCreateProgress(null)
    }
  }

  const handleDeployRules = async () => {
    if (!selectedConfigStore) {
      setError('Please select a Config Store')
      return
    }
    if (!selectedService) {
      setError('Please select a Compute service')
      return
    }

    const validation = validateGraph(nodes, edges)
    if (!validation.valid) {
      setError(`Validation failed:\n• ${validation.errors.join('\n• ')}`)
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Store the full graph - nodes and edges as-is
      const graphPayload = { nodes, edges }
      console.log('[Deploy] Nodes count:', nodes.length)
      console.log('[Deploy] Edges count:', edges.length)
      console.log('[Deploy] Graph payload:', JSON.stringify(graphPayload, null, 2))
      const compressed = await compressRules(JSON.stringify(graphPayload))
      console.log('[Deploy] Compressed length:', compressed.length)

      const manifest: VceManifest = {
        version: VCE_ENGINE_VERSION,
        engine: 'visual-compute-engine',
        deployedAt: new Date().toISOString(),
        serviceId: selectedService,
      }

      const rulesFormData = new URLSearchParams()
      rulesFormData.append('item_value', compressed)
      const manifestFormData = new URLSearchParams()
      manifestFormData.append('item_value', JSON.stringify(manifest))

      // Sequential requests to avoid 409 Conflict
      const rulesResponse = await fetch(`${FASTLY_API_BASE}/resources/stores/config/${selectedConfigStore}/item/rules_packed`, {
        method: 'PUT',
        headers: { 'Fastly-Key': apiToken, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: rulesFormData.toString(),
      })
      if (!rulesResponse.ok) {
        const errorText = await rulesResponse.text()
        throw new Error(`Failed to save rules: ${rulesResponse.status} - ${errorText}`)
      }

      const manifestResponse = await fetch(`${FASTLY_API_BASE}/resources/stores/config/${selectedConfigStore}/item/${VCE_MANIFEST_KEY}`, {
        method: 'PUT',
        headers: { 'Fastly-Key': apiToken, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: manifestFormData.toString(),
      })
      if (!manifestResponse.ok) {
        const errorText = await manifestResponse.text()
        throw new Error(`Failed to save manifest: ${manifestResponse.status} - ${errorText}`)
      }

      updateFastlyState({
        services: services.map(s =>
          s.id === selectedService ? { ...s, isVceEnabled: true, linkedConfigStore: selectedConfigStore } : s
        ),
        configStores: configStores.map(s =>
          s.id === selectedConfigStore ? { ...s, hasVceManifest: true } : s
        ),
      })

      console.log('[Deploy] Rules response:', await rulesResponse.clone().json())
      console.log('[Deploy] Manifest response:', await manifestResponse.clone().json())

      const storeName = configStores.find(s => s.id === selectedConfigStore)?.name
      const serviceName = services.find(s => s.id === selectedService)?.name
      console.log('[Deploy] Success! Deployed to', storeName, 'for', serviceName)
      setStatus(`Rules deployed to ${storeName} for ${serviceName}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deployment failed')
    } finally {
      setLoading(false)
    }
  }

  // If local mode is active, show local mode UI (no API token needed)
  if (localMode && localServerAvailable) {
    return (
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto' }}>
        {/* Local Mode Banner */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 10px',
          background: '#2d1b4e',
          border: '1px solid #7c3aed',
          borderRadius: 6,
          color: '#a78bfa',
          fontSize: 11,
          fontWeight: 500,
          marginBottom: 12,
        }}>
          <span>Local Dev Mode</span>
          <button
            onClick={() => {
              setLocalMode(false)
              setLocalServerAvailable(false)
            }}
            style={{
              background: 'none',
              border: 'none',
              color: theme.textMuted,
              fontSize: 10,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Switch to Fastly
          </button>
        </div>

        {/* Local Compute Status */}
        <label style={{
          display: 'block',
          color: theme.textSecondary,
          fontSize: 10,
          fontWeight: 500,
          marginBottom: 4,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}>Local Compute Server</label>
        <div style={{
          padding: '10px',
          background: theme.bgTertiary,
          border: `1px solid ${theme.border}`,
          borderRadius: 6,
          marginBottom: 12,
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
          }}>
            <a
              href="http://127.0.0.1:7676/"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '4px 6px',
                background: theme.bg,
                borderRadius: 4,
                color: theme.primary,
                fontSize: 10,
                fontFamily: 'monospace',
                textDecoration: 'none',
                cursor: 'pointer',
              }}
              title="Open in browser"
            >
              127.0.0.1:7676 ↗
            </a>
            <button
              onClick={handleRefreshLocal}
              disabled={loading}
              title="Refresh local status"
              style={{
                padding: '2px 6px',
                background: 'transparent',
                border: `1px solid ${theme.border}`,
                borderRadius: 4,
                color: theme.textMuted,
                fontSize: 9,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.5 : 1,
              }}
            >
              {loading ? '...' : '↻ Refresh'}
            </button>
          </div>

          {/* Status */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: localComputeRunning ? 8 : 0,
          }}>
            <span style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: localComputeRunning ? theme.success : theme.error,
            }} />
            <span style={{ color: theme.text, fontSize: 11 }}>
              {localComputeRunning ? 'Running' : 'Not Running'}
            </span>
          </div>

          {/* Engine Version */}
          {localComputeRunning && localEngineVersion && (
            <div style={{
              padding: '4px 6px',
              background: theme.bg,
              borderRadius: 4,
              fontSize: 10,
              marginBottom: 8,
            }}>
              <span style={{ color: theme.textMuted }}>Engine: </span>
              <span style={{ color: theme.text }}>{localEngineVersion.engine} v{localEngineVersion.version}</span>
            </div>
          )}

          {/* Open in Browser button when running */}
          {localComputeRunning && (
            <a
              href="http://127.0.0.1:7676/"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block',
                width: '100%',
                padding: '6px 10px',
                background: theme.bg,
                color: theme.primary,
                border: `1px solid ${theme.border}`,
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 10,
                fontWeight: 500,
                textAlign: 'center',
                textDecoration: 'none',
                boxSizing: 'border-box',
              }}
            >
              Open in Browser ↗
            </a>
          )}

          {!localComputeRunning && (
            <p style={{
              color: theme.textMuted,
              fontSize: 9,
              margin: '8px 0 0 0',
              lineHeight: 1.4,
            }}>
              Run <code style={{ background: theme.bg, padding: '1px 4px', borderRadius: 2 }}>make serve</code> to start the local Compute server
            </p>
          )}
        </div>

        {/* Deploy to Local Button */}
        <button
          onClick={handleDeployLocal}
          disabled={loading}
          style={{
            width: '100%',
            padding: '10px 14px',
            background: loading ? theme.bgTertiary : '#7c3aed',
            color: loading ? theme.textMuted : '#FFFFFF',
            border: `1px solid ${loading ? theme.border : '#7c3aed'}`,
            borderRadius: 6,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: 12,
            fontWeight: 500,
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? 'Saving...' : 'Save Rules Locally'}
        </button>

        <p style={{
          color: theme.textMuted,
          fontSize: 10,
          margin: '6px 0 0 0',
          lineHeight: 1.4,
        }}>
          {nodes.length} nodes, {edges.length} edges
        </p>

        {localComputeRunning && (
          <p style={{
            color: theme.textMuted,
            fontSize: 9,
            margin: '4px 0 0 0',
            lineHeight: 1.4,
            fontStyle: 'italic',
          }}>
            Restart the Compute server to reload rules
          </p>
        )}

        {/* Status/Error Messages */}
        {error && (
          <div style={{
            marginTop: 10,
            padding: '8px 10px',
            background: theme.errorBg,
            border: `1px solid ${theme.errorBorder}`,
            borderRadius: 6,
            color: theme.error,
            fontSize: 10,
            whiteSpace: 'pre-wrap',
          }}>
            {error}
          </div>
        )}
        {status && !error && (
          <div style={{
            marginTop: 10,
            padding: '8px 10px',
            background: theme.successBg,
            border: `1px solid ${theme.successBorder}`,
            borderRadius: 6,
            color: theme.success,
            fontSize: 10,
          }}>
            ✓ {status}
          </div>
        )}

        {/* Test URLs */}
        {localComputeRunning && (
          <div style={{ marginTop: 12 }}>
            <label style={{
              display: 'block',
              color: theme.textSecondary,
              fontSize: 10,
              fontWeight: 500,
              marginBottom: 4,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>Test URLs</label>
            <div style={{
              padding: '8px',
              background: theme.bgTertiary,
              border: `1px solid ${theme.border}`,
              borderRadius: 6,
              fontSize: 9,
              color: theme.textMuted,
              fontFamily: 'monospace',
            }}>
              <div style={{ marginBottom: 4 }}>
                <a href="http://127.0.0.1:7676/_version" target="_blank" rel="noopener noreferrer" style={{ color: theme.primary }}>
                  /_version
                </a>
                <span> - Engine info</span>
              </div>
              <div style={{ marginBottom: 4 }}>
                <a href="http://127.0.0.1:7676/" target="_blank" rel="noopener noreferrer" style={{ color: theme.primary }}>
                  /
                </a>
                <span> - Test request</span>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Show connection UI if not connected to Fastly
  if (!isConnected) {
    return (
      <div style={{ padding: 12 }}>
        {/* Local Dev Mode button - prominent at top */}
        <button
          onClick={checkLocalEnvironment}
          style={{
            width: '100%',
            padding: '10px 14px',
            background: '#7c3aed',
            color: '#FFFFFF',
            border: '1px solid #7c3aed',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 500,
            marginBottom: 16,
          }}
        >
          Use Local Dev Mode
        </button>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 16,
        }}>
          <div style={{ flex: 1, height: 1, background: theme.border }} />
          <span style={{ color: theme.textMuted, fontSize: 10 }}>OR</span>
          <div style={{ flex: 1, height: 1, background: theme.border }} />
        </div>

        <p style={{
          color: theme.textMuted,
          fontSize: 11,
          margin: '0 0 12px 0',
          lineHeight: 1.5,
        }}>
          Connect to Fastly to deploy rules to the edge.
        </p>

        <label style={{
          display: 'block',
          color: theme.textSecondary,
          fontSize: 10,
          fontWeight: 500,
          marginBottom: 4,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}>API Token</label>
        <input
          type="password"
          value={apiToken}
          onChange={(e) => updateFastlyState({ apiToken: e.target.value })}
          placeholder="Enter your Fastly API token"
          style={{
            width: '100%',
            padding: '8px 10px',
            background: theme.bgTertiary,
            border: `1px solid ${theme.border}`,
            borderRadius: 6,
            color: theme.text,
            fontSize: 12,
            boxSizing: 'border-box',
            outline: 'none',
          }}
        />
        <p style={{
          color: theme.textMuted,
          fontSize: 10,
          margin: '6px 0 0 0',
          lineHeight: 1.5,
        }}>
          Create a token at{' '}
          <a href="https://manage.fastly.com/account/personal/tokens" target="_blank" rel="noreferrer" style={{ color: theme.primary }}>
            manage.fastly.com
          </a>
        </p>

        <button
          onClick={handleConnect}
          disabled={loading || !apiToken}
          style={{
            width: '100%',
            padding: '10px 14px',
            background: theme.bgTertiary,
            color: theme.textSecondary,
            border: `1px solid ${theme.border}`,
            borderRadius: 6,
            cursor: loading || !apiToken ? 'not-allowed' : 'pointer',
            fontSize: 12,
            fontWeight: 500,
            marginTop: 12,
            opacity: loading || !apiToken ? 0.5 : 1,
          }}
        >
          {loading ? 'Connecting...' : 'Connect to Fastly'}
        </button>

        {error && (
          <div style={{
            marginTop: 12,
            padding: '8px 10px',
            background: theme.errorBg,
            border: `1px solid ${theme.errorBorder}`,
            borderRadius: 6,
            color: theme.error,
            fontSize: 11,
          }}>
            {error}
          </div>
        )}
      </div>
    )
  }

  // Connected to Fastly - show full UI
  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto' }}>
      {/* Check for local mode button */}
      {!localMode && (
        <button
          onClick={checkLocalEnvironment}
          style={{
            width: '100%',
            padding: '8px 10px',
            background: '#2d1b4e',
            color: '#a78bfa',
            border: '1px solid #7c3aed',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 500,
            marginBottom: 12,
          }}
        >
          Switch to Local Dev Mode
        </button>
      )}

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 10px',
        background: theme.successBg,
        border: `1px solid ${theme.successBorder}`,
        borderRadius: 6,
        color: theme.success,
        fontSize: 11,
        fontWeight: 500,
        marginBottom: 12,
      }}>
        ✓ Connected
        <button
          onClick={handleDisconnect}
          style={{
            background: 'none',
            border: 'none',
            color: theme.textMuted,
            fontSize: 10,
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          Disconnect
        </button>
      </div>

      {/* Create New Service Form */}
      {showCreateForm ? (
        <div style={{
          padding: '10px',
          background: theme.bgTertiary,
          border: `1px solid ${theme.border}`,
          borderRadius: 6,
          marginBottom: 12,
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
          }}>
            <span style={{ color: theme.text, fontSize: 12, fontWeight: 500 }}>New VCE Service</span>
            <button
              onClick={() => setShowCreateForm(false)}
              style={{
                background: 'none',
                border: 'none',
                color: theme.textMuted,
                fontSize: 14,
                cursor: 'pointer',
                padding: '0 4px',
              }}
            >×</button>
          </div>

          <label style={{
            display: 'block',
            color: theme.textSecondary,
            fontSize: 9,
            fontWeight: 500,
            marginBottom: 4,
            textTransform: 'uppercase',
          }}>Service Name</label>
          <input
            type="text"
            value={createForm.serviceName}
            onChange={(e) => setCreateForm(prev => ({ ...prev, serviceName: e.target.value }))}
            placeholder="my-vce-service"
            style={{
              width: '100%',
              padding: '6px 8px',
              background: theme.bg,
              border: `1px solid ${theme.border}`,
              borderRadius: 4,
              color: theme.text,
              fontSize: 11,
              boxSizing: 'border-box',
              marginBottom: 8,
            }}
          />

          {createProgress && (
            <div style={{
              padding: '6px 8px',
              background: theme.bg,
              border: `1px solid ${theme.border}`,
              borderRadius: 4,
              color: theme.textSecondary,
              fontSize: 10,
              marginBottom: 8,
            }}>
              ⏳ {createProgress}
            </div>
          )}

          <p style={{
            color: theme.textMuted,
            fontSize: 9,
            margin: '0 0 8px 0',
            lineHeight: 1.4,
            fontStyle: 'italic',
          }}>
            Service creation takes 1-2 minutes. Use the refresh button to check status.
          </p>

          <button
            onClick={handleCreateService}
            disabled={loading || !createForm.serviceName}
            style={{
              width: '100%',
              padding: '8px 10px',
              background: loading ? theme.bgTertiary : theme.primary,
              color: loading ? theme.textMuted : '#FFFFFF',
              border: `1px solid ${loading ? theme.border : theme.primary}`,
              borderRadius: 4,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: 11,
              fontWeight: 500,
              opacity: loading || !createForm.serviceName ? 0.6 : 1,
            }}
          >
            {loading ? 'Creating...' : 'Create Service'}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowCreateForm(true)}
          style={{
            width: '100%',
            padding: '8px 10px',
            background: 'transparent',
            color: theme.primary,
            border: `1px dashed ${theme.primary}`,
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 500,
            marginBottom: 12,
          }}
        >
          + Create New VCE Service
        </button>
      )}

      {/* Service Selection */}
      <label style={{
        display: 'block',
        color: theme.textSecondary,
        fontSize: 10,
        fontWeight: 500,
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
      }}>VCE Service</label>

      {services.length === 0 ? (
        <div style={{
          padding: '10px',
          background: theme.bgTertiary,
          border: `1px solid ${theme.border}`,
          borderRadius: 6,
          color: theme.textMuted,
          fontSize: 11,
          lineHeight: 1.5,
        }}>
          No Compute services found. Create one above.
        </div>
      ) : (
        <select
          value={selectedService}
          onChange={(e) => handleServiceChange(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 10px',
            background: theme.bgTertiary,
            border: `1px solid ${theme.border}`,
            borderRadius: 6,
            color: theme.text,
            fontSize: 12,
            boxSizing: 'border-box',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          <option value="">Select a Compute service...</option>
          {services.filter(s => s.isVceEnabled).length > 0 && (
            <optgroup label="VCE Services">
              {services.filter(s => s.isVceEnabled).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </optgroup>
          )}
          {services.filter(s => !s.isVceEnabled).length > 0 && (
            <optgroup label="Other Compute Services">
              {services.filter(s => !s.isVceEnabled).map((s) => (
                <option key={s.id} value={s.id}>{s.name} (not configured)</option>
              ))}
            </optgroup>
          )}
        </select>
      )}

      {/* Service Info */}
      {selectedService && (() => {
        const service = services.find(s => s.id === selectedService)
        if (!service) return null
        const serviceUrl = `https://${generateDomainName(service.name)}`
        return (
          <div style={{
            marginTop: 10,
            padding: '10px',
            background: theme.bgTertiary,
            border: `1px solid ${theme.border}`,
            borderRadius: 6,
          }}>
            {/* Service header with refresh button */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}>
              <label style={{
                color: theme.textMuted,
                fontSize: 9,
                fontWeight: 500,
                textTransform: 'uppercase',
              }}>Service ID</label>
              <button
                onClick={handleRefreshService}
                disabled={engineVersionLoading}
                title="Refresh service status"
                style={{
                  padding: '2px 6px',
                  background: 'transparent',
                  border: `1px solid ${theme.border}`,
                  borderRadius: 4,
                  color: theme.textMuted,
                  fontSize: 9,
                  cursor: engineVersionLoading ? 'not-allowed' : 'pointer',
                  opacity: engineVersionLoading ? 0.5 : 1,
                }}
              >
                {engineVersionLoading ? '...' : '↻ Refresh'}
              </button>
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                <code style={{
                  flex: 1,
                  padding: '4px 6px',
                  background: theme.bg,
                  borderRadius: 4,
                  color: theme.text,
                  fontSize: 10,
                  fontFamily: 'monospace',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>{service.id}</code>
                <button
                  onClick={() => navigator.clipboard.writeText(service.id)}
                  title="Copy Service ID"
                  style={{
                    padding: '4px 6px',
                    background: theme.bg,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 4,
                    color: theme.textMuted,
                    fontSize: 10,
                    cursor: 'pointer',
                  }}
                >Copy</button>
              </div>
            </div>
            <div>
              <label style={{
                display: 'block',
                color: theme.textMuted,
                fontSize: 9,
                fontWeight: 500,
                marginBottom: 2,
                textTransform: 'uppercase',
              }}>Test URL</label>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                <a
                  href={serviceUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    flex: 1,
                    padding: '4px 6px',
                    background: theme.bg,
                    borderRadius: 4,
                    color: theme.primary,
                    fontSize: 10,
                    fontFamily: 'monospace',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    textDecoration: 'none',
                  }}
                >{serviceUrl}</a>
                <button
                  onClick={() => navigator.clipboard.writeText(serviceUrl)}
                  title="Copy URL"
                  style={{
                    padding: '4px 6px',
                    background: theme.bg,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 4,
                    color: theme.textMuted,
                    fontSize: 10,
                    cursor: 'pointer',
                  }}
                >Copy</button>
              </div>
            </div>
            {/* Engine Version */}
            <div style={{ marginTop: 8 }}>
              <label style={{
                display: 'block',
                color: theme.textMuted,
                fontSize: 9,
                fontWeight: 500,
                marginBottom: 2,
                textTransform: 'uppercase',
              }}>Engine Version</label>
              {engineUpdateProgress ? (
                <div style={{
                  padding: '4px 6px',
                  background: theme.bg,
                  borderRadius: 4,
                  color: theme.textMuted,
                  fontSize: 10,
                }}>
                  {engineUpdateProgress}
                </div>
              ) : engineVersionLoading ? (
                <div style={{
                  padding: '4px 6px',
                  background: theme.bg,
                  borderRadius: 4,
                  color: theme.textMuted,
                  fontSize: 10,
                }}>
                  Checking...
                </div>
              ) : engineVersion ? (
                <>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}>
                    <div style={{
                      flex: 1,
                      padding: '4px 6px',
                      background: theme.bg,
                      borderRadius: 4,
                    }}>
                      <span style={{
                        color: theme.text,
                        fontSize: 10,
                        fontFamily: 'monospace',
                      }}>
                        {engineVersion.engine} v{engineVersion.version}
                      </span>
                      {engineVersion.engine !== 'VCE Engine' ? (
                        <span style={{
                          marginLeft: 6,
                          padding: '1px 4px',
                          background: theme.errorBg,
                          border: `1px solid ${theme.errorBorder}`,
                          borderRadius: 3,
                          color: theme.error,
                          fontSize: 8,
                          fontWeight: 500,
                        }}>UNKNOWN ENGINE</span>
                      ) : engineVersion.version === VCE_ENGINE_VERSION ? (
                        <span style={{
                          marginLeft: 6,
                          padding: '1px 4px',
                          background: theme.successBg,
                          border: `1px solid ${theme.successBorder}`,
                          borderRadius: 3,
                          color: theme.success,
                          fontSize: 8,
                          fontWeight: 500,
                        }}>UP TO DATE</span>
                      ) : (
                        <span style={{
                          marginLeft: 6,
                          padding: '1px 4px',
                          background: '#FEF3C7',
                          border: '1px solid #F59E0B',
                          borderRadius: 3,
                          color: '#B45309',
                          fontSize: 8,
                          fontWeight: 500,
                        }}>UPDATE AVAILABLE</span>
                      )}
                    </div>
                  </div>
                  {/* Update button - show if version mismatch or unknown engine */}
                  {(engineVersion.engine !== 'VCE Engine' || engineVersion.version !== VCE_ENGINE_VERSION) && (
                    <>
                      <p style={{
                        color: theme.textMuted,
                        fontSize: 9,
                        margin: '6px 0 4px 0',
                        fontStyle: 'italic',
                      }}>
                        Updates take ~1 minute to propagate.
                      </p>
                      <button
                        onClick={handleUpdateEngine}
                        disabled={loading}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          background: loading ? theme.bgTertiary : theme.primary,
                          color: loading ? theme.textMuted : '#FFFFFF',
                          border: `1px solid ${loading ? theme.border : theme.primary}`,
                          borderRadius: 4,
                          cursor: loading ? 'not-allowed' : 'pointer',
                          fontSize: 10,
                          fontWeight: 500,
                          opacity: loading ? 0.6 : 1,
                        }}
                      >
                        Update to VCE Engine v{VCE_ENGINE_VERSION}
                      </button>
                    </>
                  )}
                </>
              ) : (
                <>
                  <div style={{
                    padding: '4px 6px',
                    background: theme.bg,
                    borderRadius: 4,
                    color: theme.textMuted,
                    fontSize: 10,
                  }}>
                    <span style={{ color: theme.error }}>Not detected</span>
                    <span style={{ marginLeft: 4, fontSize: 9 }}>- service may not be deployed</span>
                  </div>
                  {/* Deploy button - show if no engine detected */}
                  <p style={{
                    color: theme.textMuted,
                    fontSize: 9,
                    margin: '6px 0 4px 0',
                    fontStyle: 'italic',
                  }}>
                    Deployment takes ~1 minute to propagate.
                  </p>
                  <button
                    onClick={handleUpdateEngine}
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      background: loading ? theme.bgTertiary : theme.primary,
                      color: loading ? theme.textMuted : '#FFFFFF',
                      border: `1px solid ${loading ? theme.border : theme.primary}`,
                      borderRadius: 4,
                      cursor: loading ? 'not-allowed' : 'pointer',
                      fontSize: 10,
                      fontWeight: 500,
                      opacity: loading ? 0.6 : 1,
                    }}
                  >
                    Deploy VCE Engine v{VCE_ENGINE_VERSION}
                  </button>
                </>
              )}
            </div>
          </div>
        )
      })()}

      {/* Config Store */}
      {selectedService && selectedConfigStore && (
        <>
          <label style={{
            display: 'block',
            color: theme.textSecondary,
            fontSize: 10,
            fontWeight: 500,
            marginBottom: 4,
            marginTop: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>Config Store</label>
          <div style={{
            padding: '8px 10px',
            background: theme.bgTertiary,
            border: `1px solid ${theme.border}`,
            borderRadius: 6,
            color: theme.text,
            fontSize: 12,
          }}>
            {configStores.find(s => s.id === selectedConfigStore)?.name || selectedConfigStore}
          </div>
        </>
      )}

      {/* Enable VCE button for non-configured services */}
      {selectedService && !selectedConfigStore && (() => {
        const service = services.find(s => s.id === selectedService)
        if (!service || service.linkedConfigStore) return null
        return (
          <div style={{
            marginTop: 10,
            padding: '10px',
            background: theme.bgTertiary,
            border: `1px solid ${theme.border}`,
            borderRadius: 6,
          }}>
            <p style={{
              color: theme.textMuted,
              fontSize: 10,
              margin: '0 0 8px 0',
              lineHeight: 1.4,
            }}>
              This Compute service is not configured for VCE. Enable VCE to deploy security rules.
            </p>
            <p style={{
              color: theme.textMuted,
              fontSize: 9,
              margin: '0 0 8px 0',
              lineHeight: 1.4,
              fontStyle: 'italic',
            }}>
              This takes 1-2 minutes. Use the refresh button to check status.
            </p>
            {createProgress && (
              <div style={{
                padding: '6px 8px',
                background: theme.bg,
                border: `1px solid ${theme.border}`,
                borderRadius: 4,
                color: theme.textSecondary,
                fontSize: 10,
                marginBottom: 8,
              }}>
                ⏳ {createProgress}
              </div>
            )}
            <button
              onClick={handleEnableVce}
              disabled={loading}
              style={{
                width: '100%',
                padding: '8px 10px',
                background: loading ? theme.bgTertiary : theme.primary,
                color: loading ? theme.textMuted : '#FFFFFF',
                border: `1px solid ${loading ? theme.border : theme.primary}`,
                borderRadius: 4,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: 11,
                fontWeight: 500,
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? 'Enabling...' : 'Enable VCE on this service'}
            </button>
          </div>
        )
      })()}

      {/* Deploy Button */}
      <button
        onClick={handleDeployRules}
        disabled={loading || !selectedConfigStore || !selectedService}
        style={{
          width: '100%',
          padding: '10px 14px',
          background: loading || !selectedConfigStore || !selectedService ? theme.bgTertiary : theme.primary,
          color: loading || !selectedConfigStore || !selectedService ? theme.textMuted : '#FFFFFF',
          border: `1px solid ${loading || !selectedConfigStore || !selectedService ? theme.border : theme.primary}`,
          borderRadius: 6,
          cursor: loading || !selectedConfigStore || !selectedService ? 'not-allowed' : 'pointer',
          fontSize: 12,
          fontWeight: 500,
          marginTop: 12,
          opacity: loading || !selectedConfigStore || !selectedService ? 0.5 : 1,
        }}
      >
        {loading ? 'Deploying...' : 'Deploy Rules'}
      </button>

      <p style={{
        color: theme.textMuted,
        fontSize: 10,
        margin: '6px 0 0 0',
        lineHeight: 1.4,
      }}>
        {nodes.length} nodes, {edges.length} edges
      </p>

      {/* Export JSON Button for local development */}
      <button
        onClick={async () => {
          const validation = validateGraph(nodes, edges)
          if (!validation.valid) {
            setError(`Validation failed:\n• ${validation.errors.join('\n• ')}`)
            return
          }

          const graphPayload = { nodes, edges }
          const compressed = await compressRules(JSON.stringify(graphPayload))
          const fileContent = JSON.stringify({ rules_packed: compressed }, null, 2)

          const blob = new Blob([fileContent], { type: 'application/json' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = 'security-rules.json'
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(url)

          setStatus('Exported security-rules.json - copy to compute/ folder for local testing')
        }}
        disabled={loading}
        style={{
          width: '100%',
          padding: '8px 12px',
          background: theme.bgTertiary,
          color: theme.textSecondary,
          border: `1px solid ${theme.border}`,
          borderRadius: 6,
          cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: 11,
          fontWeight: 500,
          marginTop: 8,
          opacity: loading ? 0.5 : 1,
        }}
      >
        ↓ Export JSON (for local dev)
      </button>

      {/* Status/Error Messages */}
      {error && (
        <div style={{
          marginTop: 10,
          padding: '8px 10px',
          background: theme.errorBg,
          border: `1px solid ${theme.errorBorder}`,
          borderRadius: 6,
          color: theme.error,
          fontSize: 10,
          whiteSpace: 'pre-wrap',
        }}>
          {error}
        </div>
      )}
      {status && !error && (
        <div style={{
          marginTop: 10,
          padding: '8px 10px',
          background: theme.successBg,
          border: `1px solid ${theme.successBorder}`,
          borderRadius: 6,
          color: theme.success,
          fontSize: 10,
        }}>
          ✓ {status}
        </div>
      )}
    </div>
  )
}

// Helper functions
function getData(node: Node): Record<string, any> {
  return node.data as Record<string, any>
}

function convertToRulesFormat(nodes: Node[], edges: Edge[]) {
  const ruleList: string[] = []
  const ruleDefs: Record<string, any> = {}
  const backends: Record<string, any> = {}

  const backendNodes = nodes.filter(n => n.type === 'backend')
  backendNodes.forEach((backendNode) => {
    const data = getData(backendNode)
    const name = data.name || `backend_${backendNode.id}`
    backends[name] = {
      host: data.host || 'origin.example.com',
      port: data.port ?? 443,
      useTLS: data.useTLS ?? true,
      connectTimeout: data.connectTimeout,
      firstByteTimeout: data.firstByteTimeout,
      betweenBytesTimeout: data.betweenBytesTimeout,
    }
  })

  const actionNodes = nodes.filter(n => n.type === 'action')
  actionNodes.forEach((actionNode, idx) => {
    const ruleName = `rule_${idx}`
    ruleList.push(ruleName)
    const actionData = getData(actionNode)

    const outgoingEdge = edges.find(e => e.source === actionNode.id)
    const targetNode = outgoingEdge ? nodes.find(n => n.id === outgoingEdge.target) : null
    const routeToBackend = targetNode?.type === 'backend' ? (getData(targetNode).name || `backend_${targetNode.id}`) : undefined

    const actionType = routeToBackend ? 'route' : (actionData.action || 'block')
    const action: Record<string, any> = { type: actionType }

    if (routeToBackend) {
      action.backend = routeToBackend
    } else {
      action.response_code = actionData.statusCode || 403
      action.response_message = actionData.message || ''
    }

    ruleDefs[ruleName] = {
      enabled: true,
      conditions: buildConditions(actionNode, nodes, edges),
      action,
    }
  })

  return {
    v: '1.0',
    r: ruleList,
    d: ruleDefs,
    ...(Object.keys(backends).length > 0 && { backends }),
  }
}

function buildConditions(actionNode: Node, nodes: Node[], edges: Edge[]): any {
  const incomingEdges = edges.filter(e => e.target === actionNode.id)

  if (incomingEdges.length === 0) {
    return { operator: 'and', rules: [] }
  }

  const conditions: any[] = []

  incomingEdges.forEach(edge => {
    const sourceNode = nodes.find(n => n.id === edge.source)
    if (!sourceNode) return

    const sourceData = getData(sourceNode)
    if (sourceNode.type === 'condition') {
      conditions.push({
        field: sourceData.field,
        operator: sourceData.operator,
        value: sourceData.value,
      })
    } else if (sourceNode.type === 'logic') {
      const logicConditions = buildConditions(sourceNode, nodes, edges)
      conditions.push({
        operator: (sourceData.operation || 'AND').toLowerCase(),
        rules: logicConditions.rules || [],
      })
    }
  })

  return { operator: 'and', rules: conditions }
}
