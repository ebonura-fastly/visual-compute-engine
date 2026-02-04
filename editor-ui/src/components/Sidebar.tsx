import { useState, useCallback, useRef } from 'react'
import type { Node, Edge } from '@xyflow/react'
import {
  Button,
  Box,
  Flex,
  Text,
  TextInput,
  Select,
  Alert,
  Pill,
  LoadingIndicator,
  PopOver,
  Checkbox,
} from '@fastly/beacon'
import type { SelectOptionType } from '@fastly/beacon'
import { allTemplates, templatesByCategory, instantiateTemplate, type RuleTemplate } from '../templates'

type SidebarProps = {
  nodes: Node[]
  edges: Edge[]
  onAddTemplate: (nodes: Node[], edges: Edge[]) => void
  onLoadRules?: (nodes: Node[], edges: Edge[]) => void
}

type Tab = 'components' | 'templates' | 'fastly'

// Node types with categories (must match the actual node component categories)
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
    category: 'logic' as const,
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
  routing: 'Routing',
}

export function Sidebar({ nodes, edges, onAddTemplate, onLoadRules }: SidebarProps) {
  const [activeTab, setActiveTab] = useState<Tab>('fastly')

  // Templates state
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())
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

  // Filter templates by search query and/or selected categories
  const filteredTemplates = allTemplates.filter(t => {
    // Apply search filter
    const matchesSearch = !searchQuery ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))

    // Apply category filter (OR logic - match any selected category)
    const matchesCategory = selectedCategories.size === 0 || selectedCategories.has(t.category)

    return matchesSearch && matchesCategory
  })

  const tabs: { id: Tab; label: string }[] = [
    { id: 'fastly', label: 'Services' },
    { id: 'components', label: 'Components' },
    { id: 'templates', label: 'Templates' },
  ]

  return (
    <aside className="vce-sidebar">
      {/* Tab Bar */}
      <div className="vce-sidebar-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className="vce-sidebar-tab"
            data-active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
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
            selectedCategories={selectedCategories}
            setSelectedCategories={setSelectedCategories}
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
    </aside>
  )
}

type NodeCategory = 'input' | 'condition' | 'logic' | 'action' | 'routing'

type NodeTypeDef = {
  type: string
  label: string
  category: NodeCategory
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
    <Box className="vce-components-tab">
      <div className="vce-node-list">
        {nodeTypes.map(({ type, label, category, description }) => (
          <div
            key={type}
            draggable
            onDragStart={(e) => onDragStart(e, type)}
            className="vce-node-item"
            data-category={category}
          >
            <div className="vce-node-item-header">
              <span className="vce-node-item-title">{label}</span>
              <span className="vce-node-item-category">{category}</span>
            </div>
            <span className="vce-node-item-description">{description}</span>
          </div>
        ))}
      </div>
      <div className="vce-sidebar-hint">
        Drag components onto the canvas
      </div>
    </Box>
  )
}

// Templates Tab
function TemplatesTab({
  searchQuery,
  setSearchQuery,
  selectedCategories,
  setSelectedCategories,
  filteredTemplates,
  onAddTemplate,
}: {
  searchQuery: string
  setSearchQuery: (q: string) => void
  selectedCategories: Set<string>
  setSelectedCategories: (c: Set<string>) => void
  filteredTemplates: RuleTemplate[]
  onAddTemplate: (template: RuleTemplate) => void
}) {
  const [filterOpen, setFilterOpen] = useState(false)
  const filterButtonRef = useRef<HTMLButtonElement>(null)

  const activeFilterCount = selectedCategories.size

  const toggleCategory = (key: string) => {
    const newSet = new Set(selectedCategories)
    if (newSet.has(key)) {
      newSet.delete(key)
    } else {
      newSet.add(key)
    }
    setSelectedCategories(newSet)
  }

  const clearFilters = () => {
    setSelectedCategories(new Set())
    setSearchQuery('')
  }

  return (
    <Box className="vce-templates-tab">
      {/* Search with Filter Icon */}
      <div className="vce-search-filter-row">
        <div className="vce-search-wrapper">
          <svg className="vce-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            className="vce-search-input"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="vce-search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <PopOver
          active={filterOpen}
          attach="bottom-start"
          portal
          onClose={() => setFilterOpen(false)}
          content={
            <Box className="vce-filter-popover" padding="md">
              <div className="vce-filter-header">
                <Text size="sm" style={{ fontWeight: 600 }}>Filter by Category</Text>
                {activeFilterCount > 0 && (
                  <button className="vce-filter-clear" onClick={clearFilters}>
                    Clear all
                  </button>
                )}
              </div>
              <div className="vce-filter-options">
                {Object.entries(categoryLabels).map(([key, label]) => (
                  <label key={key} className="vce-filter-option">
                    <Checkbox
                      name={`filter-${key}`}
                      value={key}
                      checked={selectedCategories.has(key)}
                      onChange={() => toggleCategory(key)}
                      label={label}
                    />
                  </label>
                ))}
              </div>
            </Box>
          }
        >
          <button
            ref={filterButtonRef}
            className="vce-filter-button"
            data-active={filterOpen || activeFilterCount > 0}
            onClick={() => setFilterOpen(!filterOpen)}
            aria-label="Filter templates"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            {activeFilterCount > 0 && (
              <span className="vce-filter-badge">{activeFilterCount}</span>
            )}
          </button>
        </PopOver>
      </div>

      {/* Active Filters Display */}
      {activeFilterCount > 0 && (
        <div className="vce-active-filters">
          {Array.from(selectedCategories).map((key) => (
            <span key={key} className="vce-active-filter-tag">
              {categoryLabels[key]}
              <button onClick={() => toggleCategory(key)} aria-label={`Remove ${categoryLabels[key]} filter`}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Templates List */}
      <div className="vce-templates-list">
        {filteredTemplates.map((template) => (
          <div
            key={template.id}
            className="vce-template-card"
            onClick={() => onAddTemplate(template)}
          >
            <div className="vce-template-header">
              <span className="vce-template-name">{template.name}</span>
              <span className="vce-template-category">{categoryLabels[template.category] || template.category}</span>
            </div>
            <span className="vce-template-description">{template.description}</span>
            {template.tags.length > 0 && (
              <div className="vce-template-tags">
                {template.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="vce-template-tag">{tag}</span>
                ))}
              </div>
            )}
          </div>
        ))}
        {filteredTemplates.length === 0 && (
          <div className="vce-templates-empty">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <Text size="sm" color="muted">No templates found</Text>
            {(searchQuery || activeFilterCount > 0) && (
              <button className="vce-templates-reset" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>
    </Box>
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
      <Box padding="md">
        {/* Local Mode Banner */}
        <Flex style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <Pill status="info">Local Dev Mode</Pill>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => updateLocalModeState({ localMode: false, localServerAvailable: false })}
          >
            Switch to Fastly
          </Button>
        </Flex>

        {/* Local Compute Status */}
        <Text size="sm" style={{ fontWeight: 500, marginBottom: '4px' }}>Local Compute Server</Text>
        <Box padding="sm" marginBottom="md" style={{ border: '1px solid var(--color-border)', borderRadius: '8px' }}>
          <Flex style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <a
              href="http://127.0.0.1:7676/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--color-link)', fontFamily: 'monospace', fontSize: '12px' }}
            >
              127.0.0.1:7676
            </a>
            <Button variant="secondary" size="sm" onClick={handleRefreshLocal} disabled={loading}>
              {loading ? '...' : 'Refresh'}
            </Button>
          </Flex>

          {/* Status */}
          <Flex style={{ alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Pill status={localComputeRunning ? 'success' : 'error'} size="sm">
              {localComputeRunning ? 'Running' : 'Not Running'}
            </Pill>
          </Flex>

          {/* Engine Version */}
          {localComputeRunning && localEngineVersion && (
            <Box padding="sm" marginBottom="sm" style={{ background: 'var(--color-bg-subtle)', borderRadius: '4px' }}>
              <Text size="xs" color="muted">Engine: </Text>
              <Text size="xs">{localEngineVersion.engine} v{localEngineVersion.version}</Text>
            </Box>
          )}

          {/* Open in Browser button when running */}
          {localComputeRunning && (
            <Button
              variant="secondary"
              as="a"
              href="http://127.0.0.1:7676/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ width: '100%' }}
            >
              Open in Browser
            </Button>
          )}

          {!localComputeRunning && (
            <Text size="xs" color="muted">
              Run <code style={{ background: 'var(--color-bg-subtle)', padding: '2px 4px', borderRadius: '2px' }}>make serve</code> to start the local Compute server
            </Text>
          )}
        </Box>

        {/* Deploy to Local Button */}
        <Button variant="primary" onClick={handleDeployLocal} disabled={loading} style={{ width: '100%', marginBottom: '8px' }}>
          {loading ? 'Saving...' : 'Save Rules Locally'}
        </Button>

        <Text size="xs" color="muted">
          {nodes.length} nodes, {edges.length} edges
        </Text>

        {localComputeRunning && (
          <Text size="xs" color="muted" style={{ fontStyle: 'italic' }}>
            Restart the Compute server to reload rules
          </Text>
        )}

        {/* Status/Error Messages */}
        {error && (
          <Box marginTop="md">
            <Alert status="error">{error}</Alert>
          </Box>
        )}
        {status && !error && (
          <Box marginTop="md">
            <Alert status="success">{status}</Alert>
          </Box>
        )}

        {/* Test URLs */}
        {localComputeRunning && (
          <Box marginTop="md">
            <Text size="sm" style={{ fontWeight: 500, marginBottom: '4px' }}>Test URLs</Text>
            <Box padding="sm" style={{ border: '1px solid var(--color-border)', borderRadius: '6px' }}>
              <Box marginBottom="sm">
                <a href="http://127.0.0.1:7676/_version" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-link)' }}>
                  /_version
                </a>
                <Text size="xs" color="muted"> - Engine info</Text>
              </Box>
              <Box>
                <a href="http://127.0.0.1:7676/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-link)' }}>
                  /
                </a>
                <Text size="xs" color="muted"> - Test request</Text>
              </Box>
            </Box>
          </Box>
        )}
      </Box>
    )
  }

  // Show connection UI if not connected to Fastly
  if (!isConnected) {
    return (
      <Box padding="md">
        {/* Local Dev Mode button */}
        <Button variant="primary" onClick={checkLocalEnvironment} style={{ width: '100%' }}>
          Use Local Dev Mode
        </Button>

        <Flex style={{ alignItems: 'center', gap: '12px', margin: '16px 0' }}>
          <Box style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
          <Text size="xs" color="muted">OR</Text>
          <Box style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
        </Flex>

        <Text size="sm" color="muted" style={{ marginBottom: '12px' }}>
          Connect to Fastly to deploy rules to the edge.
        </Text>

        <Box marginBottom="md">
          <TextInput
            label="API Token"
            type="password"
            value={apiToken}
            onChange={(e) => updateFastlyState({ apiToken: e.target.value })}
            placeholder="Enter your Fastly API token"
          />
          <Text size="xs" color="muted" style={{ marginTop: '4px' }}>
            Create a token at{' '}
            <a href="https://manage.fastly.com/account/personal/tokens" target="_blank" rel="noreferrer" style={{ color: 'var(--color-link)' }}>
              manage.fastly.com
            </a>
          </Text>
        </Box>

        <Button
          variant="primary"
          onClick={handleConnect}
          disabled={loading || !apiToken}
          style={{ width: '100%' }}
        >
          {loading ? 'Connecting...' : 'Connect to Fastly'}
        </Button>

        {error && (
          <Box marginTop="md">
            <Alert status="error">{error}</Alert>
          </Box>
        )}
      </Box>
    )
  }

  // Connected to Fastly - show full UI
  return (
    <Box padding="md">
      {/* Connection status row */}
      <Flex style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <Pill status="success">Connected</Pill>
        <Button variant="secondary" size="sm" onClick={handleDisconnect}>
          Disconnect
        </Button>
      </Flex>

      {/* Check for local mode button */}
      {!localMode && (
        <Box marginBottom="md">
          <Button variant="secondary" onClick={checkLocalEnvironment} style={{ width: '100%' }}>
            Switch to Local Dev Mode
          </Button>
        </Box>
      )}

      {/* Create New Service Form */}
      {showCreateForm ? (
        <Box padding="sm" marginBottom="md" style={{ border: '1px solid var(--color-border)', borderRadius: '8px' }}>
          <Flex style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <Text size="sm" style={{ fontWeight: 600 }}>New VCE Service</Text>
            <Button variant="secondary" size="sm" onClick={() => setShowCreateForm(false)}>×</Button>
          </Flex>

          <Box marginBottom="sm">
            <TextInput
              label="Service Name"
              value={createForm.serviceName}
              onChange={(e) => setCreateForm(prev => ({ ...prev, serviceName: e.target.value }))}
              placeholder="my-vce-service"
            />
          </Box>

          {createProgress && (
            <Box padding="sm" marginBottom="sm" style={{ background: 'var(--color-bg-subtle)', borderRadius: '4px', fontFamily: 'monospace', fontSize: '12px' }}>
              {createProgress}
            </Box>
          )}

          <Text size="xs" color="muted" style={{ marginBottom: '8px' }}>
            Service creation takes 1-2 minutes.
          </Text>

          <Button
            variant="primary"
            onClick={handleCreateService}
            disabled={loading || !createForm.serviceName}
            style={{ width: '100%' }}
          >
            {loading ? 'Creating...' : 'Create Service'}
          </Button>
        </Box>
      ) : (
        <Box marginBottom="md">
          <Button variant="secondary" onClick={() => setShowCreateForm(true)} style={{ width: '100%', border: '1px dashed var(--color-border)' }}>
            + Create New VCE Service
          </Button>
        </Box>
      )}

      {/* Service Selection */}
      <Box marginBottom="md">
        <Text size="sm" style={{ fontWeight: 500, marginBottom: '4px' }}>VCE Service</Text>

        {services.length === 0 ? (
          <Box padding="sm" style={{ border: '1px solid var(--color-border)', borderRadius: '6px' }}>
            <Text size="sm" color="muted">No Compute services found. Create one above.</Text>
          </Box>
        ) : (
          <Select
            options={[
              ...services.filter(s => s.isVceEnabled).map(s => ({
                value: s.id,
                label: s.name,
                group: 'VCE Services'
              })),
              ...services.filter(s => !s.isVceEnabled).map(s => ({
                value: s.id,
                label: `${s.name} (not configured)`,
                group: 'Other Compute Services'
              }))
            ]}
            value={selectedService ? { value: selectedService, label: services.find(s => s.id === selectedService)?.name || '' } : null}
            onChange={(option) => option && handleServiceChange((option as SelectOptionType).value)}
            placeholder="Select a Compute service..."
          />
        )}
      </Box>

      {/* Service Info */}
      {selectedService && (() => {
        const service = services.find(s => s.id === selectedService)
        if (!service) return null
        const serviceUrl = `https://${generateDomainName(service.name)}`
        return (
          <>
          {/* Service Info Card */}
          <Box padding="sm" marginBottom="md" style={{ border: '1px solid var(--color-border)', borderRadius: '8px' }}>
            <Flex style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <Text size="sm" style={{ fontWeight: 600 }}>Service Info</Text>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRefreshService}
                disabled={engineVersionLoading}
              >
                {engineVersionLoading ? '...' : 'Refresh'}
              </Button>
            </Flex>

            <Box marginBottom="sm">
              <Text size="xs" color="muted">Service ID</Text>
              <Flex style={{ alignItems: 'center', gap: '8px' }}>
                <Text size="xs" style={{ fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{service.id}</Text>
                <Button variant="secondary" size="sm" onClick={() => navigator.clipboard.writeText(service.id)}>Copy</Button>
              </Flex>
            </Box>

            <Box>
              <Text size="xs" color="muted">Test URL</Text>
              <Flex style={{ alignItems: 'center', gap: '8px' }}>
                <a href={serviceUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--color-link)', fontSize: '11px' }}>
                  {service.name}.edgecompute.app
                </a>
                <Button variant="secondary" size="sm" onClick={() => navigator.clipboard.writeText(serviceUrl)}>Copy</Button>
              </Flex>
            </Box>
          </Box>

          {/* Step 1: Engine */}
          <Box marginBottom="md" padding="sm" style={{ border: '1px solid var(--color-border)', borderRadius: '8px' }}>
            <Flex style={{ alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
              <Box style={{
                width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: engineVersion?.version === VCE_ENGINE_VERSION ? 'var(--color-success)' : 'var(--color-border)',
                color: engineVersion?.version === VCE_ENGINE_VERSION ? 'white' : 'var(--color-text-muted)',
                fontSize: '12px', fontWeight: 600, flexShrink: 0
              }}>1</Box>
              <Box>
                <Text size="sm" style={{ fontWeight: 600 }}>Engine (WASM Binary)</Text>
                <Text size="xs" color="muted">The code that runs on Fastly's edge servers</Text>
              </Box>
            </Flex>

            {engineUpdateProgress ? (
              <Box padding="sm" style={{ background: 'var(--color-bg-subtle)', borderRadius: '4px', fontFamily: 'monospace', fontSize: '12px' }}>
                <Box marginBottom="sm">{engineUpdateProgress}</Box>
                {engineUpdateProgress.includes('POPs') && (() => {
                  const match = engineUpdateProgress.match(/(\d+)\/(\d+) POPs \((\d+)%\)/)
                  if (match) {
                    const percent = parseInt(match[3], 10)
                    return (
                      <Box style={{ height: '4px', background: 'var(--color-border)', borderRadius: '2px', overflow: 'hidden' }}>
                        <Box style={{ height: '100%', width: `${percent}%`, background: percent >= 95 ? 'var(--color-success)' : 'var(--color-info)', transition: 'width 0.3s' }} />
                      </Box>
                    )
                  }
                  return null
                })()}
              </Box>
            ) : engineVersionLoading ? (
              <Flex style={{ justifyContent: 'center', padding: '12px' }}>
                <LoadingIndicator />
              </Flex>
            ) : engineVersion ? (
              <>
                <Flex style={{ alignItems: 'center', justifyContent: 'space-between', padding: '8px', background: 'var(--color-bg-subtle)', borderRadius: '4px' }}>
                  <Text size="sm">{engineVersion.engine} v{engineVersion.version}</Text>
                  {engineVersion.engine !== 'Visual Compute Engine' ? (
                    <Pill status="error" size="sm">Unknown</Pill>
                  ) : engineVersion.version === VCE_ENGINE_VERSION ? (
                    <Pill status="success" size="sm">Up to date</Pill>
                  ) : (
                    <Pill status="warning" size="sm">Update available</Pill>
                  )}
                </Flex>
                {(engineVersion.engine !== 'Visual Compute Engine' || engineVersion.version !== VCE_ENGINE_VERSION) ? (
                  <>
                    <Text size="xs" color="muted" style={{ marginTop: '8px' }}>Updates typically take ~30-60s to propagate.</Text>
                    <Button variant="primary" onClick={handleUpdateEngine} disabled={loading} style={{ width: '100%', marginTop: '8px' }}>
                      Update Engine to v{VCE_ENGINE_VERSION}
                    </Button>
                  </>
                ) : (
                  <Button variant="secondary" size="sm" onClick={handleUpdateEngine} disabled={loading} style={{ marginTop: '8px' }}>
                    {loading ? 'Re-deploying...' : 'Force Re-deploy Engine'}
                  </Button>
                )}
              </>
            ) : (
              <>
                <Box padding="sm" style={{ background: 'var(--color-bg-subtle)', borderRadius: '4px' }}>
                  <Text size="sm" style={{ color: 'var(--color-error)' }}>Not detected</Text>
                  <Text size="xs" color="muted"> - service may not be deployed</Text>
                </Box>
                <Text size="xs" color="muted" style={{ marginTop: '8px', fontStyle: 'italic' }}>
                  {selectedConfigStore ? 'Deployment typically takes ~30-60s to propagate.' : 'Deploy the engine first, then setup Config Store.'}
                </Text>
                <Button variant="primary" onClick={handleUpdateEngine} disabled={loading} style={{ width: '100%', marginTop: '8px' }}>
                  Deploy Engine v{VCE_ENGINE_VERSION}
                </Button>
              </>
            )}
          </Box>
          </>
        )
      })()}

      {/* Step 2: Config Store */}
      {selectedService && selectedConfigStore && (
        <Box marginBottom="md" padding="sm" style={{ border: '1px solid var(--color-border)', borderRadius: '8px' }}>
          <Flex style={{ alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
            <Box style={{
              width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--color-success)', color: 'white', fontSize: '12px', fontWeight: 600, flexShrink: 0
            }}>2</Box>
            <Box>
              <Text size="sm" style={{ fontWeight: 600 }}>Config Store</Text>
              <Text size="xs" color="muted">Where your rules are stored (edge key-value store)</Text>
            </Box>
          </Flex>

          <Flex style={{ alignItems: 'center', justifyContent: 'space-between', padding: '8px', background: 'var(--color-bg-subtle)', borderRadius: '4px' }}>
            <Text size="sm" style={{ fontFamily: 'monospace' }}>
              {configStores.find(s => s.id === selectedConfigStore)?.name || selectedConfigStore}
            </Text>
            <Button variant="secondary" size="sm" onClick={() => fetchStorePreview(selectedConfigStore)}>
              {storePreview?.storeId === selectedConfigStore ? 'Hide' : 'View'}
            </Button>
          </Flex>

          {/* Config Store Preview */}
          {storePreview?.storeId === selectedConfigStore && (
            <Box marginTop="sm" padding="sm" style={{ border: '1px solid var(--color-border)', borderRadius: '4px', maxHeight: '200px', overflow: 'auto' }}>
              {storePreview.loading && (
                <Flex style={{ justifyContent: 'center' }}>
                  <LoadingIndicator />
                </Flex>
              )}
              {storePreview.error && (
                <Text size="sm" style={{ color: 'var(--color-error)' }}>{storePreview.error}</Text>
              )}
              {!storePreview.loading && !storePreview.error && storePreview.items.length === 0 && (
                <Text size="sm" color="muted" style={{ textAlign: 'center' }}>Empty store</Text>
              )}
              {storePreview.items.map((item, idx) => (
                <Box key={idx} marginBottom="sm" style={{ borderBottom: idx < storePreview.items.length - 1 ? '1px solid var(--color-border)' : 'none', paddingBottom: '8px' }}>
                  <Text size="xs" style={{ fontWeight: 600 }}>{item.key}</Text>
                  <Text size="xs" color="muted" style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    {item.value}{item.truncated && '...'}
                  </Text>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      )}

      {/* Enable VCE button for non-configured services */}
      {selectedService && !selectedConfigStore && (() => {
        const service = services.find(s => s.id === selectedService)
        if (!service || service.linkedConfigStore) return null

        const getStatusPill = () => {
          if (configStoreStatusLoading) return <Pill size="sm">Checking...</Pill>
          if (!configStoreStatus) return <Pill size="sm">Not checked</Pill>
          switch (configStoreStatus.status) {
            case 'linked_ok':
              return <Pill status="success" size="sm">Ready</Pill>
            case 'linked_outdated':
              return <Pill status="warning" size="sm">Update available</Pill>
            case 'linked_no_manifest':
              return <Pill status="warning" size="sm">Needs init</Pill>
            case 'not_linked':
              return <Pill size="sm">Not linked</Pill>
            case 'error':
              return <Pill status="error" size="sm">Error</Pill>
            default:
              return <Pill size="sm">-</Pill>
          }
        }

        return (
          <Box padding="sm" marginBottom="md" style={{ border: '1px solid var(--color-border)', borderRadius: '8px' }}>
            <Flex style={{ alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
              <Box style={{
                width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--color-border)', color: 'var(--color-text-muted)', fontSize: '12px', fontWeight: 600, flexShrink: 0
              }}>2</Box>
              <Box>
                <Text size="sm" style={{ fontWeight: 600 }}>Config Store</Text>
                <Text size="xs" color="muted">Setup required</Text>
              </Box>
            </Flex>

            {/* Status display */}
            <Box padding="sm" marginBottom="sm" style={{ background: 'var(--color-bg-subtle)', borderRadius: '4px' }}>
              <Flex style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Flex style={{ alignItems: 'center', gap: '8px', flex: 1 }}>
                  {getStatusPill()}
                  <Text size="xs" color="muted" style={{ flex: 1 }}>
                    {configStoreStatusLoading ? 'Checking...' :
                     configStoreStatus ? configStoreStatus.message :
                     'Click Refresh to check status'}
                  </Text>
                </Flex>
                {!configStoreStatusLoading && (
                  <Button variant="secondary" size="sm" onClick={() => fetchConfigStoreStatus(selectedService)}>
                    Refresh
                  </Button>
                )}
              </Flex>
              {configStoreStatus?.status === 'linked_outdated' && (
                <Text size="xs" style={{ color: 'var(--color-warning)', marginTop: '4px' }}>
                  Update available: v{configStoreStatus.manifestVersion} → v{configStoreStatus.currentVersion}
                </Text>
              )}
            </Box>

            {createProgress && (
              <Box padding="sm" marginBottom="sm" style={{ background: 'var(--color-bg-subtle)', borderRadius: '4px', fontFamily: 'monospace', fontSize: '12px' }}>
                {createProgress}
              </Box>
            )}

            <Button variant="primary" onClick={handleSetupConfigStore} disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Setting up...' :
               configStoreStatus?.status === 'linked_ok' ? 'Re-deploy VCE Engine' :
               configStoreStatus?.status === 'linked_outdated' ? 'Update VCE Engine' :
               configStoreStatus?.status === 'linked_no_manifest' ? 'Initialize Config Store' :
               'Setup Config Store'}
            </Button>
          </Box>
        )
      })()}

      {/* Step 3: Deploy Rules */}
      <Box marginBottom="md" padding="sm" style={{ border: '1px solid var(--color-border)', borderRadius: '8px' }}>
        <Flex style={{ alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
          <Box style={{
            width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--color-border)', color: 'var(--color-text-muted)', fontSize: '12px', fontWeight: 600, flexShrink: 0
          }}>3</Box>
          <Box>
            <Text size="sm" style={{ fontWeight: 600 }}>Deploy Rules</Text>
            <Text size="xs" color="muted">Push your graph to the edge (updates in ~30-40 seconds)</Text>
          </Box>
        </Flex>

        <Button
          variant="primary"
          onClick={handleDeployRules}
          disabled={loading || !selectedConfigStore || !selectedService}
          style={{ width: '100%' }}
        >
          {deployStatus === 'deploying' ? 'Deploying...' :
           deployStatus === 'verifying' ? 'Verifying...' :
           'Deploy Rules'}
        </Button>

        {/* Deployment Status */}
        {deployStatus !== 'idle' && (
          <Box marginTop="sm">
            <Pill
              status={
                deployStatus === 'verified' ? 'success' :
                deployStatus === 'timeout' ? 'warning' :
                deployStatus === 'error' ? 'error' : undefined
              }
            >
              {deployStatus === 'deploying' ? 'Pushing to Config Store...' :
               deployStatus === 'verifying' ? 'Verifying deployment...' :
               deployStatus === 'verified' ? 'Deployment verified' :
               deployStatus === 'timeout' ? 'Verification timed out' :
               deployStatus === 'error' ? 'Deployment failed' : ''}
            </Pill>
          </Box>
        )}

        <Flex style={{ gap: '16px', marginTop: '12px' }}>
          <Box style={{ flex: 1, textAlign: 'center', padding: '8px', background: 'var(--color-bg-subtle)', borderRadius: '4px' }}>
            <Text size="xs" color="muted">Nodes</Text>
            <Text size="lg" style={{ fontWeight: 600 }}>{nodes.length}</Text>
          </Box>
          <Box style={{ flex: 1, textAlign: 'center', padding: '8px', background: 'var(--color-bg-subtle)', borderRadius: '4px' }}>
            <Text size="xs" color="muted">Edges</Text>
            <Text size="lg" style={{ fontWeight: 600 }}>{edges.length}</Text>
          </Box>
        </Flex>

        <Button
          variant="secondary"
          size="sm"
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
          style={{ marginTop: '12px' }}
        >
          Export JSON (for local dev)
        </Button>
      </Box>

      {/* Status/Error Messages */}
      {error && (
        <Box marginTop="md">
          <Alert status="error">{error}</Alert>
        </Box>
      )}
      {status && !error && (
        <Box marginTop="md">
          <Alert status="success">{status}</Alert>
        </Box>
      )}
    </Box>
  )
}
