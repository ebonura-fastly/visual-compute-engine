import { useState, useCallback } from 'react'
import type { Node, Edge } from '@xyflow/react'
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
    type: 'header',
    label: 'Header',
    category: 'routing' as const,
    description: 'Set, append, or remove headers',
  },
  {
    type: 'cache',
    label: 'Cache',
    category: 'routing' as const,
    description: 'Control cache TTL and behavior',
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
  const [activeTab, setActiveTab] = useState<Tab>('fastly')

  // Templates state
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Fastly connection state - lifted up to persist across tab switches
  const stored = loadStoredSettings()
  const [fastlyState, setFastlyState] = useState<FastlyState>({
    apiToken: stored.apiToken,
    isConnected: false,
    services: [] as FastlyService[],
    configStores: [] as ConfigStore[],
    selectedService: stored.selectedService,
    selectedConfigStore: stored.selectedConfigStore,
    engineVersion: null,
    engineVersionLoading: false,
  })

  // Local development mode state - lifted up to persist across tab switches
  const [localModeState, setLocalModeState] = useState({
    localMode: false,
    localServerAvailable: false,
    localComputeRunning: false,
    localEngineVersion: null as { engine: string; version: string; format: string } | null,
    hasLoadedRules: false,
  })

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
    <div className="vce-sidebar">
      {/* Tab Bar */}
      <div className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="tab"
            data-active={activeTab === tab.id}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="vce-sidebar-content">
        {activeTab === 'components' && (
          <ComponentsTab
            nodeTypes={nodeTypes}
            onDragStart={onDragStart}
          />
        )}
        {activeTab === 'templates' && (
          <TemplatesTab
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
  nodeTypes,
  onDragStart,
}: {
  nodeTypes: NodeTypeDef[]
  onDragStart: (event: React.DragEvent, nodeType: string) => void
}) {
  return (
    <div className="vce-components-tab">
      <div className="vce-node-list">
        {nodeTypes.map(({ type, label, category, description }) => (
          <div
            key={type}
            draggable
            onDragStart={(e) => onDragStart(e, type)}
            className="vce-node-item"
            data-category={category}
          >
            <span className="vce-node-item-tag" data-category={category}>
              {label}
            </span>
            <span className="vce-node-item-description">{description}</span>
          </div>
        ))}
      </div>
      <div className="vce-sidebar-hint">
        Drag components onto the canvas
      </div>
    </div>
  )
}

// Templates Tab
function TemplatesTab({
  searchQuery,
  setSearchQuery,
  selectedCategory,
  setSelectedCategory,
  filteredTemplates,
  onAddTemplate,
}: {
  searchQuery: string
  setSearchQuery: (q: string) => void
  selectedCategory: string | null
  setSelectedCategory: (c: string | null) => void
  filteredTemplates: RuleTemplate[]
  onAddTemplate: (template: RuleTemplate) => void
}) {
  return (
    <div className="vce-templates-tab">
      {/* Search */}
      <input
        type="text"
        placeholder="Search templates..."
        value={searchQuery}
        onChange={(e) => {
          setSearchQuery(e.target.value)
          setSelectedCategory(null)
        }}
        className="form-input vce-template-search"
      />

      {/* Category Tabs */}
      <div className="vce-category-chips">
        <button
          onClick={() => { setSelectedCategory(null); setSearchQuery('') }}
          className="vce-chip"
          data-active={selectedCategory === null && !searchQuery}
        >
          All
        </button>
        {Object.entries(categoryLabels).map(([key, label]) => (
          <button
            key={key}
            onClick={() => { setSelectedCategory(key); setSearchQuery('') }}
            className="vce-chip"
            data-active={selectedCategory === key}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Templates List */}
      <div className="vce-templates-list">
        {filteredTemplates.map((template) => (
          <div
            key={template.id}
            className="vce-template-card"
            onClick={() => onAddTemplate(template)}
          >
            <div className="vce-template-name">{template.name}</div>
            <p className="vce-template-description">{template.description}</p>
            <div className="vce-template-tags">
              {template.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="vce-tag">{tag}</span>
              ))}
            </div>
          </div>
        ))}
        {filteredTemplates.length === 0 && (
          <div className="vce-empty-state">No templates found</div>
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
  rules_hash?: string
  nodes_count?: number
  edges_count?: number
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
const VCE_ENGINE_VERSION = '1.1.5'
const FASTLY_API_BASE = 'https://api.fastly.com'
const STORAGE_KEY = 'vce-fastly'

interface EdgeCheckResult {
  totalPops: number
  successPops: number
  failedPops: number
  percent: number
  allSuccess: boolean
}

async function checkEdgePropagation(
  serviceUrl: string,
  apiToken: string
): Promise<EdgeCheckResult> {
  const response = await fetch(
    `${FASTLY_API_BASE}/content/edge_check?url=${encodeURIComponent(serviceUrl)}`,
    { headers: { 'Fastly-Key': apiToken } }
  )

  if (!response.ok) {
    throw new Error(`Edge check failed: ${response.status}`)
  }

  const data = await response.json() as Array<{
    pop: string
    response: { status: number }
    hash: string
  }>

  const totalPops = data.length
  const successPops = data.filter(p => p.response?.status === 200).length
  const failedPops = totalPops - successPops
  const percent = Math.floor((successPops / totalPops) * 100)

  return {
    totalPops,
    successPops,
    failedPops,
    percent,
    allSuccess: failedPops === 0
  }
}

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

async function findOrCreateConfigStore(
  storeName: string,
  existingStores: ConfigStore[],
  fastlyFetch: (endpoint: string, options?: RequestInit) => Promise<unknown>
): Promise<{ id: string; created: boolean }> {
  const existingStore = existingStores.find(
    s => s.name.toLowerCase() === storeName.toLowerCase()
  )

  if (existingStore) {
    console.log(`[ConfigStore] Found existing store: ${existingStore.name} (${existingStore.id})`)
    return { id: existingStore.id, created: false }
  }

  console.log(`[ConfigStore] Creating new store: ${storeName}`)
  const configStoreData = await fastlyFetch('/resources/stores/config', {
    method: 'POST',
    body: JSON.stringify({ name: storeName }),
  }) as { id: string }

  return { id: configStoreData.id, created: true }
}

async function getServiceConfigStoreLink(
  serviceId: string,
  version: number,
  fastlyFetch: (endpoint: string, options?: RequestInit) => Promise<unknown>
): Promise<{ resourceId: string; linkName: string } | null> {
  try {
    const resources = await fastlyFetch(`/service/${serviceId}/version/${version}/resource`) as Array<{
      resource_id: string
      name: string
      resource_type?: string
    }>

    const configStoreLink = resources.find(r => r.name === 'security_rules')
    if (configStoreLink) {
      return { resourceId: configStoreLink.resource_id, linkName: configStoreLink.name }
    }
    return null
  } catch (err) {
    console.log('[ConfigStore] Error checking service resource links:', err)
    return null
  }
}

interface ConfigStoreStatus {
  status: 'not_linked' | 'linked_no_manifest' | 'linked_outdated' | 'linked_ok' | 'error'
  storeId?: string
  storeName?: string
  manifestVersion?: string
  currentVersion: string
  message: string
}

async function getConfigStoreStatus(
  serviceId: string,
  version: number,
  configStores: ConfigStore[],
  apiToken: string,
  fastlyFetch: (endpoint: string, options?: RequestInit) => Promise<unknown>
): Promise<ConfigStoreStatus> {
  const currentVersion = VCE_ENGINE_VERSION

  try {
    const link = await getServiceConfigStoreLink(serviceId, version, fastlyFetch)
    if (!link) {
      return {
        status: 'not_linked',
        currentVersion,
        message: 'No Config Store linked to this service'
      }
    }

    const store = configStores.find(s => s.id === link.resourceId)
    const storeName = store?.name || link.resourceId

    try {
      const response = await fetch(
        `${FASTLY_API_BASE}/resources/stores/config/${link.resourceId}/item/${VCE_MANIFEST_KEY}`,
        { headers: { 'Fastly-Key': apiToken } }
      )

      if (!response.ok) {
        return {
          status: 'linked_no_manifest',
          storeId: link.resourceId,
          storeName,
          currentVersion,
          message: `Config Store "${storeName}" linked but missing VCE manifest`
        }
      }

      const manifest = await response.json() as VceManifest

      if (manifest.version !== currentVersion) {
        return {
          status: 'linked_outdated',
          storeId: link.resourceId,
          storeName,
          manifestVersion: manifest.version,
          currentVersion,
          message: `Config Store "${storeName}" has VCE v${manifest.version} (v${currentVersion} available)`
        }
      }

      return {
        status: 'linked_ok',
        storeId: link.resourceId,
        storeName,
        manifestVersion: manifest.version,
        currentVersion,
        message: `Config Store "${storeName}" linked with VCE v${manifest.version}`
      }
    } catch {
      return {
        status: 'linked_no_manifest',
        storeId: link.resourceId,
        storeName,
        currentVersion,
        message: `Config Store "${storeName}" linked but manifest not readable`
      }
    }
  } catch (err) {
    return {
      status: 'error',
      currentVersion,
      message: `Error checking config store: ${err instanceof Error ? err.message : 'Unknown error'}`
    }
  }
}

async function computeRulesHash(rulesPacked: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(rulesPacked)

  const blockSize = 64
  const ipad = new Uint8Array(blockSize).fill(0x36)
  const opad = new Uint8Array(blockSize).fill(0x5c)

  const innerData = new Uint8Array(blockSize + data.length)
  innerData.set(ipad, 0)
  innerData.set(data, blockSize)
  const innerHash = await crypto.subtle.digest('SHA-256', innerData)

  const outerData = new Uint8Array(blockSize + 32)
  outerData.set(opad, 0)
  outerData.set(new Uint8Array(innerHash), blockSize)
  const signature = await crypto.subtle.digest('SHA-256', outerData)

  const hashArray = new Uint8Array(signature).slice(0, 8)
  return Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('')
}

type DeployStatus = 'idle' | 'deploying' | 'verifying' | 'verified' | 'timeout' | 'error'

type FastlyState = {
  apiToken: string
  isConnected: boolean
  services: FastlyService[]
  configStores: ConfigStore[]
  selectedService: string
  selectedConfigStore: string
  engineVersion: EngineVersion
  engineVersionLoading: boolean
}

type LocalModeState = {
  localMode: boolean
  localServerAvailable: boolean
  localComputeRunning: boolean
  localEngineVersion: { engine: string; version: string; format: string } | null
  hasLoadedRules: boolean
}

function FastlyTab({
  nodes,
  edges,
  onLoadRules,
  fastlyState,
  setFastlyState,
  localModeState,
  setLocalModeState,
}: {
  nodes: Node[]
  edges: Edge[]
  onLoadRules?: (nodes: Node[], edges: Edge[]) => void
  fastlyState: FastlyState
  setFastlyState: React.Dispatch<React.SetStateAction<FastlyState>>
  localModeState: LocalModeState
  setLocalModeState: React.Dispatch<React.SetStateAction<LocalModeState>>
}) {
  const { apiToken, isConnected, services, configStores, selectedService, selectedConfigStore, engineVersion, engineVersionLoading } = fastlyState
  const { localMode, localServerAvailable, localComputeRunning, localEngineVersion, hasLoadedRules } = localModeState

  const updateLocalModeState = (updates: Partial<LocalModeState>) => {
    setLocalModeState(prev => ({ ...prev, ...updates }))
  }

  const setEngineVersion = (version: EngineVersion) => {
    setFastlyState(prev => ({ ...prev, engineVersion: version }))
  }
  const setEngineVersionLoading = (loading: boolean) => {
    setFastlyState(prev => ({ ...prev, engineVersionLoading: loading }))
  }

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createForm, setCreateForm] = useState({ serviceName: '' })
  const [createProgress, setCreateProgress] = useState<string | null>(null)
  const [engineUpdateProgress, setEngineUpdateProgress] = useState<string | null>(null)
  const [deployStatus, setDeployStatus] = useState<DeployStatus>('idle')
  const [deployProgress, setDeployProgress] = useState<string | null>(null)

  const [storePreview, setStorePreview] = useState<{
    storeId: string
    items: Array<{ key: string; value: string; truncated: boolean }>
    loading: boolean
    error: string | null
  } | null>(null)

  const [configStoreStatus, setConfigStoreStatus] = useState<ConfigStoreStatus | null>(null)
  const [configStoreStatusLoading, setConfigStoreStatusLoading] = useState(false)

  const LOCAL_API_URL = 'http://localhost:3001/local-api'

  const checkLocalEnvironment = useCallback(async () => {
    const shouldLoadRules = !hasLoadedRules

    try {
      const healthResponse = await fetch(`${LOCAL_API_URL}/health`, { method: 'GET' })
      if (healthResponse.ok) {
        updateLocalModeState({ localServerAvailable: true })

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

        updateLocalModeState({ localMode: true })
        setStatus('Local development mode active')
        return true
      }
    } catch {
      // Local server not running
    }
    return false
  }, [onLoadRules, hasLoadedRules, updateLocalModeState])

  const handleDeployLocal = async () => {
    const validation = validateGraph(nodes, edges)
    if (!validation.valid) {
      setError(`Validation failed:\n- ${validation.errors.join('\n- ')}`)
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

  const handleRefreshLocal = async () => {
    setLoading(true)
    try {
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
        } else {
          setEngineVersion(null)
        }
      } else {
        setEngineVersion(null)
      }
    } catch (err) {
      console.log('[Version] Failed to fetch engine version:', err)
      setEngineVersion(null)
    } finally {
      setEngineVersionLoading(false)
    }
  }, [])

  const fetchStorePreview = useCallback(async (storeId: string) => {
    if (storePreview?.storeId === storeId && !storePreview.error) {
      setStorePreview(null)
      return
    }

    setStorePreview({ storeId, items: [], loading: true, error: null })

    try {
      const response = await fetch(`${FASTLY_API_BASE}/resources/stores/config/${storeId}/items?limit=100`, {
        headers: { 'Fastly-Key': apiToken, 'Accept': 'application/json' },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch items: ${response.status}`)
      }

      const data = await response.json()
      const items = (data.data || []).map((item: { item_key: string; item_value?: string }) => ({
        key: item.item_key,
        value: item.item_value?.substring(0, 200) || '[no value]',
        truncated: (item.item_value?.length || 0) > 200,
      }))

      setStorePreview({ storeId, items, loading: false, error: null })
    } catch (err) {
      setStorePreview({
        storeId,
        items: [],
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch',
      })
    }
  }, [apiToken, storePreview])

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
      console.log('[Engine Update] Fetching service details...')
      const serviceData = await fastlyFetch(`/service/${service.id}/details`)
      const activeVersion = serviceData.active_version?.number
      const latestVersion = serviceData.versions?.[serviceData.versions.length - 1]?.number || 1
      console.log('[Engine Update] Active version:', activeVersion, 'Latest version:', latestVersion)

      let newVersionNumber: number
      if (activeVersion) {
        setEngineUpdateProgress('Cloning service version...')
        console.log('[Engine Update] Cloning version', activeVersion)
        const clonedVersion = await fastlyFetch(`/service/${service.id}/version/${activeVersion}/clone`, {
          method: 'PUT',
        })
        newVersionNumber = clonedVersion.number
        console.log('[Engine Update] Created new version:', newVersionNumber)
      } else {
        const versionData = await fastlyFetch(`/service/${service.id}/version/${latestVersion}`)
        if (versionData.locked) {
          setEngineUpdateProgress('Cloning locked version...')
          const clonedVersion = await fastlyFetch(`/service/${service.id}/version/${latestVersion}/clone`, {
            method: 'PUT',
          })
          newVersionNumber = clonedVersion.number
        } else {
          newVersionNumber = latestVersion
        }
        console.log('[Engine Update] Using version:', newVersionNumber, '(new service, no active version)')
      }

      setEngineUpdateProgress('Building VCE Engine package...')
      console.log('[Engine Update] Building package...')
      const packageB64 = await buildVcePackage(service.name)
      console.log('[Engine Update] Package built, size:', packageB64.length, 'bytes (base64)')
      const packageBlob = await fetch(`data:application/gzip;base64,${packageB64}`).then(r => r.blob())
      console.log('[Engine Update] Package blob size:', packageBlob.size, 'bytes')

      setEngineUpdateProgress('Uploading package...')
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
      console.log('[Engine Update] Activating version', newVersionNumber)
      const activateResult = await fastlyFetch(`/service/${service.id}/version/${newVersionNumber}/activate`, { method: 'PUT' })
      console.log('[Engine Update] Version activated:', activateResult)

      setStatus(`VCE Engine deployed, checking global propagation...`)
      console.log('[Engine Update] Update complete! Checking edge propagation...')

      const domain = generateDomainName(service.name)
      const serviceUrl = `https://${domain}/_version`
      const maxAttempts = 30
      const pollInterval = 2000

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const edgeStatus = await checkEdgePropagation(serviceUrl, apiToken)
          console.log(`[Engine Update] Edge check ${attempt}/${maxAttempts}:`, edgeStatus)

          setEngineUpdateProgress(
            `Propagating to edge: ${edgeStatus.successPops}/${edgeStatus.totalPops} POPs (${edgeStatus.percent}%)`
          )

          if (edgeStatus.percent >= 95) {
            console.log('[Engine Update] Edge propagation complete!')

            setEngineUpdateProgress('Verifying engine version...')
            const versionResponse = await fetch(serviceUrl, {
              method: 'GET',
              headers: { 'Accept': 'application/json' },
              cache: 'no-store',
            })

            if (versionResponse.ok) {
              const versionData = await versionResponse.json()
              if (versionData.engine === 'Visual Compute Engine' && versionData.version === VCE_ENGINE_VERSION) {
                setEngineVersion(versionData)
                setEngineUpdateProgress(null)
                setStatus(`VCE Engine v${VCE_ENGINE_VERSION} deployed to ${edgeStatus.successPops} POPs globally!`)
                setLoading(false)
                return
              }
            }

            setEngineUpdateProgress(null)
            setStatus(`Engine deployed to ${edgeStatus.successPops}/${edgeStatus.totalPops} POPs`)
            await fetchEngineVersion(service.name)
            setLoading(false)
            return
          }
        } catch (pollErr) {
          const errMsg = pollErr instanceof Error ? pollErr.message : 'Unknown error'
          setEngineUpdateProgress(`Checking propagation (${attempt}/${maxAttempts}): ${errMsg}`)
          console.log('[Engine Update] Edge check error:', pollErr)
        }

        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, pollInterval))
        }
      }

      console.log('[Engine Update] Propagation check timeout')
      setEngineUpdateProgress(null)
      setStatus('Engine deployed (propagation still in progress)')
      await fetchEngineVersion(service.name)
      setLoading(false)

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

      computeServices.sort((a, b) => {
        if (a.isVceEnabled && !b.isVceEnabled) return -1
        if (!a.isVceEnabled && b.isVceEnabled) return 1
        return a.name.localeCompare(b.name)
      })

      for (const service of computeServices) {
        if (!service.isVceEnabled && service.name.toLowerCase().startsWith('vce-')) {
          service.isVceEnabled = true
        }
      }

      const vceServices = computeServices.filter(s => s.isVceEnabled)
      let serviceToSelect = selectedService
      let storeToSelect = selectedConfigStore

      const previousService = computeServices.find(s => s.id === selectedService && s.isVceEnabled)
      if (previousService) {
        storeToSelect = previousService.linkedConfigStore || ''
      } else if (vceServices.length > 0) {
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

      if (storeToSelect && onLoadRules) {
        const serviceName = computeServices.find(s => s.id === serviceToSelect)?.name || ''
        await loadRulesFromStore(storeToSelect, serviceName)
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

  const fetchConfigStoreStatus = async (serviceId: string) => {
    const service = services.find(s => s.id === serviceId)
    if (!service) {
      setConfigStoreStatus(null)
      return
    }

    setConfigStoreStatusLoading(true)
    try {
      const serviceData = await fastlyFetch(`/service/${serviceId}/details`)
      const latestVersion = serviceData.versions?.[serviceData.versions.length - 1]?.number || 1

      const status = await getConfigStoreStatus(
        serviceId,
        latestVersion,
        configStores,
        apiToken,
        fastlyFetch
      )
      setConfigStoreStatus(status)
    } catch (err) {
      setConfigStoreStatus({
        status: 'error',
        currentVersion: VCE_ENGINE_VERSION,
        message: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`
      })
    } finally {
      setConfigStoreStatusLoading(false)
    }
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

    if (service?.name) {
      fetchEngineVersion(service.name)
    }

    if (service && !service.linkedConfigStore) {
      fetchConfigStoreStatus(serviceId)
    } else {
      setConfigStoreStatus(null)
    }

    if (linkedStore) {
      setLoading(true)
      setStatus('Loading rules from Config Store...')
      await loadRulesFromStore(linkedStore, service?.name || '')
      setLoading(false)
    } else if (service && !service.isVceEnabled) {
      if (onLoadRules) {
        onLoadRules([], [])
      }
      setStatus(`Selected ${service.name} - Click "Enable VCE" to configure`)
    } else if (service) {
      if (onLoadRules) {
        onLoadRules([], [])
      }
      setStatus(`Selected ${service.name} - Deploy rules to configure`)
    }
  }

  const handleRefreshService = async () => {
    const service = services.find(s => s.id === selectedService)
    if (!service) return

    setStatus('Checking engine status...')
    await fetchEngineVersion(service.name)
    setStatus(`Engine status refreshed`)
  }

  const handleSetupConfigStore = async () => {
    const service = services.find(s => s.id === selectedService)
    if (!service) {
      setError('No service selected')
      return
    }

    setLoading(true)
    setError(null)
    setCreateProgress('Setting up Config Store...')

    try {
      const serviceData = await fastlyFetch(`/service/${service.id}/details`)
      const activeVersion = serviceData.active_version?.number
      const latestVersion = serviceData.versions?.[serviceData.versions.length - 1]?.number || 1

      let versionToUse = activeVersion || latestVersion
      const versionData = await fastlyFetch(`/service/${service.id}/version/${versionToUse}`)

      if (versionData.active || versionData.locked) {
        setCreateProgress('Cloning service version...')
        const clonedVersion = await fastlyFetch(`/service/${service.id}/version/${versionToUse}/clone`, {
          method: 'PUT',
        })
        versionToUse = clonedVersion.number
      }

      const configStoreName = `${service.name}-rules`
      const { id: configStoreId, created: storeCreated } = await findOrCreateConfigStore(
        configStoreName,
        configStores,
        fastlyFetch
      )
      setCreateProgress(storeCreated ? 'Linking Config Store to service...' : 'Using existing Config Store...')

      const existingLink = await getServiceConfigStoreLink(service.id, versionToUse, fastlyFetch)
      if (!existingLink || existingLink.resourceId !== configStoreId) {
        try {
          await fastlyFetch(`/service/${service.id}/version/${versionToUse}/resource`, {
            method: 'POST',
            body: JSON.stringify({ resource_id: configStoreId, name: 'security_rules' }),
          })
        } catch (err) {
          if (err instanceof Error && err.message.includes('409')) {
            console.log('[ConfigStore] Store already linked, continuing...')
          } else {
            throw err
          }
        }
      } else {
        console.log('[ConfigStore] Store already linked to service, skipping link step')
      }

      setCreateProgress('Activating service version...')
      await fastlyFetch(`/service/${service.id}/version/${versionToUse}/activate`, { method: 'PUT' })

      setCreateProgress('Creating VCE manifest...')
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
      setStatus(`Config Store linked to "${service.name}"!`)

      setConfigStoreStatus(null)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to setup Config Store')
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
      setCreateProgress('Setting up Config Store...')

      const configStoreName = `${createForm.serviceName}-rules`
      const { id: configStoreId, created: storeCreated } = await findOrCreateConfigStore(
        configStoreName,
        configStores,
        fastlyFetch
      )
      setCreateProgress(storeCreated ? 'Linking Config Store to service...' : 'Using existing Config Store...')

      try {
        await fastlyFetch(`/service/${serviceId}/version/${serviceVersion}/resource`, {
          method: 'POST',
          body: JSON.stringify({ resource_id: configStoreId, name: 'security_rules' }),
        })
      } catch (err) {
        if (err instanceof Error && err.message.includes('409')) {
          console.log('[ConfigStore] Store already linked, continuing...')
        } else {
          throw err
        }
      }
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
      setError(`Validation failed:\n- ${validation.errors.join('\n- ')}`)
      return
    }

    setLoading(true)
    setError(null)
    setDeployStatus('deploying')
    setDeployProgress(null)

    try {
      const graphPayload = { nodes, edges }
      console.log('[Deploy] Nodes count:', nodes.length)
      console.log('[Deploy] Edges count:', edges.length)
      const compressed = await compressRules(JSON.stringify(graphPayload))
      console.log('[Deploy] Compressed length:', compressed.length)

      const expectedHash = await computeRulesHash(compressed)
      console.log('[Deploy] Expected rules hash:', expectedHash)

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

      const storeName = configStores.find(s => s.id === selectedConfigStore)?.name
      const serviceName = services.find(s => s.id === selectedService)?.name
      console.log('[Deploy] Config Store updated, starting verification...')
      setStatus(`Deployed to ${storeName}, verifying...`)
      setDeployStatus('verifying')
      setDeployProgress('Starting verification...')

      const domain = generateDomainName(serviceName || '')
      const maxAttempts = 30
      const pollInterval = 2000
      const verifyStartTime = Date.now()

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          setDeployProgress(`Waiting for Config Store to propagate... (${attempt}/${maxAttempts})`)
          console.log(`[Deploy] Verification attempt ${attempt}/${maxAttempts}...`)
          const versionResponse = await fetch(`https://${domain}/_version`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            cache: 'no-store',
          })

          if (versionResponse.ok) {
            const versionData = await versionResponse.json()
            console.log('[Deploy] Engine response:', versionData)

            if (versionData.rules_hash === expectedHash) {
              const elapsedSec = ((Date.now() - verifyStartTime) / 1000).toFixed(1)
              console.log(`[Deploy] Verified! Hash matches in ${elapsedSec}s`)
              setDeployStatus('verified')
              setDeployProgress(null)
              setEngineVersion(versionData)
              setStatus(`Deployed and verified in ${elapsedSec}s (${versionData.nodes_count} nodes, ${versionData.edges_count} edges)`)
              return
            } else {
              const oldHash = versionData.rules_hash?.slice(0, 8) || 'none'
              setDeployProgress(`Waiting for Config Store to propagate... (${attempt}/${maxAttempts}) - edge still has old rules`)
              console.log(`[Deploy] Still propagating: edge has ${oldHash}, waiting for ${expectedHash.slice(0, 8)}`)
            }
          } else {
            setDeployProgress(`Waiting for edge... (${attempt}/${maxAttempts}) - HTTP ${versionResponse.status}`)
          }
        } catch (pollErr) {
          const errMsg = pollErr instanceof Error ? pollErr.message : 'Unknown error'
          setDeployProgress(`Waiting for edge... (${attempt}/${maxAttempts}) - ${errMsg}`)
          console.log('[Deploy] Poll error:', pollErr)
        }

        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, pollInterval))
        }
      }

      const elapsedSec = ((Date.now() - verifyStartTime) / 1000).toFixed(1)
      setDeployProgress(null)
      console.log(`[Deploy] Verification timeout after ${elapsedSec}s - rules may still be propagating`)
      setDeployStatus('timeout')
      setStatus(`Deployed to ${storeName} - Config Store still propagating after ${elapsedSec}s, refresh in a few seconds`)

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Deployment failed'
      setError(errMsg)
      setDeployProgress(errMsg)
      setDeployStatus('error')
    } finally {
      setLoading(false)
    }
  }

  // If local mode is active, show local mode UI
  if (localMode && localServerAvailable) {
    return (
      <div className="vce-fastly-content">
        {/* Local Mode Banner */}
        <div className="alert alert--local vce-mb-3">
          <span>Local Dev Mode</span>
          <button
            onClick={() => {
              updateLocalModeState({ localMode: false, localServerAvailable: false })
            }}
            className="btn btn--link"
            data-size="sm"
          >
            Switch to Fastly
          </button>
        </div>

        {/* Local Compute Status */}
        <label className="form-label">Local Compute Server</label>
        <div className="card vce-mb-3">
          <div className="card-header">
            <a
              href="http://127.0.0.1:7676/"
              target="_blank"
              rel="noopener noreferrer"
              className="link code"
            >
              127.0.0.1:7676
            </a>
            <button
              onClick={handleRefreshLocal}
              disabled={loading}
              className="btn"
              data-size="sm"
              data-variant="ghost"
            >
              {loading ? '...' : 'Refresh'}
            </button>
          </div>

          {/* Status */}
          <div className="vce-status-row vce-mb-2">
            <span className="status-dot" data-status={localComputeRunning ? 'success' : 'error'} />
            <span className="vce-text-sm">
              {localComputeRunning ? 'Running' : 'Not Running'}
            </span>
          </div>

          {/* Engine Version */}
          {localComputeRunning && localEngineVersion && (
            <div className="code-block vce-mb-2">
              <span className="vce-text-muted">Engine: </span>
              <span>{localEngineVersion.engine} v{localEngineVersion.version}</span>
            </div>
          )}

          {/* Open in Browser button when running */}
          {localComputeRunning && (
            <a
              href="http://127.0.0.1:7676/"
              target="_blank"
              rel="noopener noreferrer"
              className="btn w-full"
              data-variant="ghost"
            >
              Open in Browser
            </a>
          )}

          {!localComputeRunning && (
            <p className="vce-hint">
              Run <code className="code">make serve</code> to start the local Compute server
            </p>
          )}
        </div>

        {/* Deploy to Local Button */}
        <button
          onClick={handleDeployLocal}
          disabled={loading}
          className="btn w-full vce-mb-2"
          data-variant="primary"
        >
          {loading ? 'Saving...' : 'Save Rules Locally'}
        </button>

        <p className="vce-hint">
          {nodes.length} nodes, {edges.length} edges
        </p>

        {localComputeRunning && (
          <p className="vce-hint vce-text-italic">
            Restart the Compute server to reload rules
          </p>
        )}

        {/* Status/Error Messages */}
        {error && (
          <div className="alert vce-mt-3" data-variant="error">
            <span className="alert-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </span>
            <div className="alert-content">{error}</div>
          </div>
        )}
        {status && !error && (
          <div className="alert vce-mt-3" data-variant="success">
            <span className="alert-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </span>
            <div className="alert-content">{status}</div>
          </div>
        )}

        {/* Test URLs */}
        {localComputeRunning && (
          <div className="vce-mt-3">
            <label className="form-label">Test URLs</label>
            <div className="card">
              <div className="vce-mb-1">
                <a href="http://127.0.0.1:7676/_version" target="_blank" rel="noopener noreferrer" className="link">
                  /_version
                </a>
                <span className="vce-text-muted"> - Engine info</span>
              </div>
              <div>
                <a href="http://127.0.0.1:7676/" target="_blank" rel="noopener noreferrer" className="link">
                  /
                </a>
                <span className="vce-text-muted"> - Test request</span>
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
      <div className="vce-fastly-content">
        {/* Local Dev Mode button */}
        <button
          onClick={checkLocalEnvironment}
          className="btn w-full vce-mb-4"
          data-variant="primary"
        >
          Use Local Dev Mode
        </button>

        <div className="separator">
          <span className="separator-text">OR</span>
        </div>

        <p className="vce-hint vce-mb-3">
          Connect to Fastly to deploy rules to the edge.
        </p>

        <div className="form-group vce-mb-3">
          <label className="form-label">API Token</label>
          <input
            type="password"
            value={apiToken}
            onChange={(e) => updateFastlyState({ apiToken: e.target.value })}
            placeholder="Enter your Fastly API token"
            className="form-input"
          />
          <p className="vce-hint">
            Create a token at{' '}
            <a href="https://manage.fastly.com/account/personal/tokens" target="_blank" rel="noreferrer" className="link">
              manage.fastly.com
            </a>
          </p>
        </div>

        <button
          onClick={handleConnect}
          disabled={loading || !apiToken}
          className="btn w-full"
          data-variant="primary"
        >
          {loading ? 'Connecting...' : 'Connect to Fastly'}
        </button>

        {error && (
          <div className="alert vce-mt-3" data-variant="error">
            <span className="alert-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </span>
            <div className="alert-content">{error}</div>
          </div>
        )}
      </div>
    )
  }

  // Connected to Fastly - show full UI
  return (
    <div className="vce-fastly-content">
      {/* Connection status row */}
      <div className="fui-connection-row">
        <div className="fui-status" data-variant="success">
          <span className="fui-status__dot" />
          <span>Connected</span>
        </div>
        <button onClick={handleDisconnect} className="fui-link-btn">
          Disconnect
        </button>
      </div>

      {/* Check for local mode button */}
      {!localMode && (
        <button
          onClick={checkLocalEnvironment}
          className="btn w-full vce-mb-3"
          data-variant="secondary"
        >
          Switch to Local Dev Mode
        </button>
      )}

      {/* Create New Service Form */}
      {showCreateForm ? (
        <div className="fui-info-card vce-mb-3">
          <div className="fui-info-card__header">
            <span className="fui-info-card__title">New VCE Service</span>
            <button onClick={() => setShowCreateForm(false)} className="icon-btn" data-size="sm">×</button>
          </div>
          <div className="fui-info-card__body">
            <div className="form-group vce-mb-2">
              <label className="form-label">Service Name</label>
              <input
                type="text"
                value={createForm.serviceName}
                onChange={(e) => setCreateForm(prev => ({ ...prev, serviceName: e.target.value }))}
                placeholder="my-vce-service"
                className="form-input"
              />
            </div>

            {createProgress && (
              <div className="code-block vce-mb-2">{createProgress}</div>
            )}

            <p className="vce-hint vce-mb-2">
              Service creation takes 1-2 minutes.
            </p>

            <button
              onClick={handleCreateService}
              disabled={loading || !createForm.serviceName}
              className="btn w-full"
              data-variant="primary"
            >
              {loading ? 'Creating...' : 'Create Service'}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowCreateForm(true)} className="fui-btn--dashed vce-mb-3">
          + Create New VCE Service
        </button>
      )}

      {/* Service Selection */}
      <div className="form-group vce-mb-3">
        <label className="form-label">VCE Service</label>

        {services.length === 0 ? (
          <div className="card">
            <span className="vce-text-muted">No Compute services found. Create one above.</span>
          </div>
        ) : (
          <select
            value={selectedService}
            onChange={(e) => handleServiceChange(e.target.value)}
            className="form-select"
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
      </div>

      {/* Service Info */}
      {selectedService && (() => {
        const service = services.find(s => s.id === selectedService)
        if (!service) return null
        const serviceUrl = `https://${generateDomainName(service.name)}`
        return (
          <>
          {/* Service Info Card */}
          <div className="fui-info-card vce-mb-3">
            <div className="fui-info-card__header">
              <span className="fui-info-card__title">Service Info</span>
              <button
                onClick={handleRefreshService}
                disabled={engineVersionLoading}
                className="fui-copy-btn"
              >
                {engineVersionLoading ? '...' : 'Refresh'}
              </button>
            </div>
            <div className="fui-info-card__body">
              <div className="fui-info-card__row">
                <span className="fui-info-card__label">Service ID</span>
                <div className="fui-info-card__value">
                  <code>{service.id}</code>
                  <button onClick={() => navigator.clipboard.writeText(service.id)} className="fui-copy-btn">Copy</button>
                </div>
              </div>
              <div className="fui-info-card__row">
                <span className="fui-info-card__label">Test URL</span>
                <div className="fui-info-card__value">
                  <a href={serviceUrl} target="_blank" rel="noreferrer" className="link" style={{ fontSize: '11px' }}>
                    {service.name}.edgecompute.app
                  </a>
                  <button onClick={() => navigator.clipboard.writeText(serviceUrl)} className="fui-copy-btn">Copy</button>
                </div>
              </div>
            </div>
          </div>

          {/* Step 1: Engine */}
          <div className="fui-step">
            <div className="fui-step__header">
              <span className="fui-step__number" data-complete={engineVersion?.version === VCE_ENGINE_VERSION}>1</span>
              <div className="fui-step__info">
                <h4 className="fui-step__title">Engine (WASM Binary)</h4>
                <p className="fui-step__description">The code that runs on Fastly's edge servers</p>
              </div>
            </div>

            {engineUpdateProgress ? (
              <div className="code-block">
                <div className="vce-mb-1">{engineUpdateProgress}</div>
                {engineUpdateProgress.includes('POPs') && (() => {
                  const match = engineUpdateProgress.match(/(\d+)\/(\d+) POPs \((\d+)%\)/)
                  if (match) {
                    const percent = parseInt(match[3], 10)
                    return (
                      <div className="vce-progress-bar">
                        <div className="vce-progress-fill" data-complete={percent >= 95} style={{ width: `${percent}%` }} />
                      </div>
                    )
                  }
                  return null
                })()}
              </div>
            ) : engineVersionLoading ? (
              <div className="fui-engine-box vce-text-muted">Checking...</div>
            ) : engineVersion ? (
              <>
                <div className="fui-engine-box">
                  <div className="fui-engine-box__row">
                    <span className="fui-engine-box__name">{engineVersion.engine} v{engineVersion.version}</span>
                    {engineVersion.engine !== 'Visual Compute Engine' ? (
                      <span className="fui-badge" data-variant="error">Unknown</span>
                    ) : engineVersion.version === VCE_ENGINE_VERSION ? (
                      <span className="fui-badge" data-variant="success">Up to date</span>
                    ) : (
                      <span className="fui-badge" data-variant="warning">Update available</span>
                    )}
                  </div>
                </div>
                {(engineVersion.engine !== 'Visual Compute Engine' || engineVersion.version !== VCE_ENGINE_VERSION) ? (
                  <>
                    <p className="vce-hint vce-mt-2">Updates typically take ~30-60s to propagate.</p>
                    <button onClick={handleUpdateEngine} disabled={loading} className="btn w-full vce-mt-2" data-variant="primary">
                      Update Engine to v{VCE_ENGINE_VERSION}
                    </button>
                  </>
                ) : (
                  <button onClick={handleUpdateEngine} disabled={loading} className="fui-link-btn vce-mt-2">
                    {loading ? 'Re-deploying...' : 'Force Re-deploy Engine'}
                  </button>
                )}
              </>
            ) : (
                <>
                  <div className="code-block">
                    <span className="vce-text-error">Not detected</span>
                    <span className="vce-text-muted"> - service may not be deployed</span>
                  </div>
                  {selectedConfigStore ? (
                    <>
                      <p className="vce-hint vce-text-italic vce-mt-1">
                        Deployment typically takes ~30-60s to propagate.
                      </p>
                      <button
                        onClick={handleUpdateEngine}
                        disabled={loading}
                        className="btn w-full"
                        data-variant="primary"
                      >
                        Deploy Engine v{VCE_ENGINE_VERSION}
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="vce-hint vce-text-italic vce-mt-1">
                        Deploy the engine first, then setup Config Store.
                      </p>
                      <button
                        onClick={handleUpdateEngine}
                        disabled={loading}
                        className="btn w-full"
                        data-variant="primary"
                      >
                        Deploy Engine v{VCE_ENGINE_VERSION}
                      </button>
                    </>
                  )}
                </>
              )}
          </div>
          </>
        )
      })()}

      {/* Step 2: Config Store */}
      {selectedService && selectedConfigStore && (
        <div className="fui-step">
          <div className="fui-step__header">
            <span className="fui-step__number" data-complete="true">2</span>
            <div className="fui-step__info">
              <h4 className="fui-step__title">Config Store</h4>
              <p className="fui-step__description">Where your rules are stored (edge key-value store)</p>
            </div>
          </div>

          <div className="fui-store-display">
            <span className="fui-store-display__name">
              {configStores.find(s => s.id === selectedConfigStore)?.name || selectedConfigStore}
            </span>
            <button
              onClick={() => fetchStorePreview(selectedConfigStore)}
              className="fui-copy-btn"
            >
              {storePreview?.storeId === selectedConfigStore ? 'Hide' : 'View'}
            </button>
          </div>

          {/* Config Store Preview */}
          {storePreview?.storeId === selectedConfigStore && (
            <div className="card vce-mt-2 vce-store-preview">
              {storePreview.loading && (
                <div className="vce-text-center vce-text-muted">Loading...</div>
              )}
              {storePreview.error && (
                <div className="vce-text-error">{storePreview.error}</div>
              )}
              {!storePreview.loading && !storePreview.error && storePreview.items.length === 0 && (
                <div className="vce-text-center vce-text-muted">Empty store</div>
              )}
              {storePreview.items.map((item, idx) => (
                <div key={idx} className="vce-store-item">
                  <div className="vce-store-item-key">{item.key}</div>
                  <div className="vce-store-item-value text-mono">
                    {item.value}{item.truncated && '...'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Enable VCE button for non-configured services */}
      {selectedService && !selectedConfigStore && (() => {
        const service = services.find(s => s.id === selectedService)
        if (!service || service.linkedConfigStore) return null

        const getStatusStyle = () => {
          if (configStoreStatusLoading) return { variant: 'default', icon: '...' }
          if (!configStoreStatus) return { variant: 'default', icon: '-' }
          switch (configStoreStatus.status) {
            case 'linked_ok':
              return { variant: 'success', icon: '' }
            case 'linked_outdated':
              return { variant: 'warning', icon: '' }
            case 'linked_no_manifest':
              return { variant: 'warning', icon: '' }
            case 'not_linked':
              return { variant: 'default', icon: '-' }
            case 'error':
              return { variant: 'error', icon: '' }
            default:
              return { variant: 'default', icon: '-' }
          }
        }
        const statusStyle = getStatusStyle()

        return (
          <div className="card vce-mb-3">
            <label className="form-label">Step 2: Config Store</label>

            {/* Status display */}
            <div className="code-block vce-mb-2">
              <div className="vce-row">
                <span className="vce-mr-2">{statusStyle.icon}</span>
                <span className="flex-1 vce-text-sm">
                  {configStoreStatusLoading ? 'Checking config store...' :
                   configStoreStatus ? configStoreStatus.message :
                   'Click to check config store status'}
                </span>
                {!configStoreStatusLoading && (
                  <button
                    onClick={() => fetchConfigStoreStatus(selectedService)}
                    className="btn"
                    data-size="sm"
                    data-variant="ghost"
                    title="Refresh status"
                  >
                    Refresh
                  </button>
                )}
              </div>
              {configStoreStatus?.status === 'linked_outdated' && (
                <div className="vce-text-warning vce-mt-1 vce-text-xs">
                  Update available: v{configStoreStatus.manifestVersion} to v{configStoreStatus.currentVersion}
                </div>
              )}
            </div>

            {createProgress && (
              <div className="code-block vce-mb-2">
                {createProgress}
              </div>
            )}
            <button
              onClick={handleSetupConfigStore}
              disabled={loading}
              className="btn w-full"
              data-variant="primary"
            >
              {loading ? 'Setting up...' :
               configStoreStatus?.status === 'linked_ok' ? 'Re-deploy VCE Engine' :
               configStoreStatus?.status === 'linked_outdated' ? 'Update VCE Engine' :
               configStoreStatus?.status === 'linked_no_manifest' ? 'Initialize Config Store' :
               'Setup Config Store'}
            </button>
          </div>
        )
      })()}

      {/* Step 3: Deploy Rules */}
      <div className="fui-step">
        <div className="fui-step__header">
          <span className="fui-step__number">3</span>
          <div className="fui-step__info">
            <h4 className="fui-step__title">Deploy Rules</h4>
            <p className="fui-step__description">Push your graph to the edge (updates in ~30-40 seconds)</p>
          </div>
        </div>

        <button
          onClick={handleDeployRules}
          disabled={loading || !selectedConfigStore || !selectedService}
          className="btn w-full"
          data-variant="primary"
        >
          {deployStatus === 'deploying' ? 'Deploying...' :
           deployStatus === 'verifying' ? 'Verifying...' :
           'Deploy Rules'}
        </button>

        {/* Deployment Status */}
        {deployStatus !== 'idle' && (
          <div
            className="fui-status vce-mt-2 w-full"
            data-variant={
              deployStatus === 'verified' ? 'success' :
              deployStatus === 'timeout' ? 'warning' :
              deployStatus === 'error' ? 'error' : undefined
            }
            style={{ justifyContent: 'flex-start' }}
          >
            <span className="fui-status__dot" />
            <span>
              {deployStatus === 'deploying' ? 'Pushing to Config Store...' :
               deployStatus === 'verifying' ? 'Verifying deployment...' :
               deployStatus === 'verified' ? 'Deployment verified' :
               deployStatus === 'timeout' ? 'Verification timed out' :
               deployStatus === 'error' ? 'Deployment failed' : ''}
            </span>
          </div>
        )}

        <div className="fui-deploy-stats vce-mt-3">
          <div className="fui-deploy-stat">
            <span className="fui-deploy-stat__label">Nodes</span>
            <span className="fui-deploy-stat__value">{nodes.length}</span>
          </div>
          <div className="fui-deploy-stat">
            <span className="fui-deploy-stat__label">Edges</span>
            <span className="fui-deploy-stat__value">{edges.length}</span>
          </div>
        </div>

        <button
          onClick={async () => {
            const validation = validateGraph(nodes, edges)
            if (!validation.valid) {
              setError(`Validation failed:\n- ${validation.errors.join('\n- ')}`)
              return
            }

            const graphPayload = { nodes, edges }
            const fileContent = JSON.stringify(graphPayload, null, 2)

            const blob = new Blob([fileContent], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'graph.json'
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)

            setStatus('Exported graph.json')
          }}
          disabled={loading}
          className="fui-link-btn"
        >
          Export JSON (for local dev)
        </button>
      </div>

      {/* Status/Error Messages */}
      {error && (
        <div className="alert vce-mt-3" data-variant="error">
          <span className="alert-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </span>
          <div className="alert-content">{error}</div>
        </div>
      )}
      {status && !error && (
        <div className="alert vce-mt-3" data-variant="success">
          <span className="alert-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </span>
          <div className="alert-content">{status}</div>
        </div>
      )}
    </div>
  )
}
