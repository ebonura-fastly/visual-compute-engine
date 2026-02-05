import { useState, useCallback, useRef, useEffect } from 'react'
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
  Popover,
  Checkbox,
  Stack,
  Tabs,
  ActionIcon,
  Badge,
  Card,
  Anchor,
  Title,
  Divider,
  Skeleton,
} from '@fastly/beacon-mantine'
import { IconClose, IconSearch, IconFilter, IconLink, IconUnlink, IconCode, IconSwap, IconSync, IconCopy, IconUpload, IconAttentionFilled, IconCheckCircleFilled } from '@fastly/beacon-icons'
import { allTemplates, instantiateTemplate, type RuleTemplate } from '../templates'

type SidebarProps = {
  nodes: Node[]
  edges: Edge[]
  onAddTemplate: (nodes: Node[], edges: Edge[]) => void
  onLoadRules?: (nodes: Node[], edges: Edge[]) => void
  routeServiceId?: string
  isLocalRoute?: boolean
  onNavigate?: (path: string) => void
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

export function Sidebar({ nodes, edges, onAddTemplate, onLoadRules, routeServiceId, isLocalRoute, onNavigate }: SidebarProps) {
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
    localMode: isLocalRoute || false,
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

  // User is "active" if connected to Fastly OR in local dev mode
  const isActive = fastlyState.isConnected || (localModeState.localMode && localModeState.localServerAvailable)

  // Only show Components/Templates tabs after user has connected
  const tabs: { id: Tab; label: string }[] = isActive
    ? [
        { id: 'fastly', label: 'Services' },
        { id: 'components', label: 'Components' },
        { id: 'templates', label: 'Templates' },
      ]
    : [
        { id: 'fastly', label: 'Services' },
      ]

  return (
    <aside className="vce-sidebar">
      {isActive ? (
        <Tabs value={activeTab} onChange={(v) => setActiveTab(v as Tab)} className="vce-sidebar-tabs-container">
          <Tabs.List grow className="vce-sidebar-tabs">
            {tabs.map((tab) => (
              <Tabs.Tab key={tab.id} value={tab.id} className="vce-sidebar-tab">
                {tab.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
      ) : null}

      {/* Tab Content */}
      <Box className="vce-sidebar-content">
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
            routeServiceId={routeServiceId}
            isLocalRoute={isLocalRoute}
            onNavigate={onNavigate}
          />
        )}
      </Box>
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
      <Stack className="vce-node-list" gap="xs">
        {nodeTypes.map(({ type, label, category, description }) => (
          <Box
            key={type}
            draggable
            onDragStart={(e) => onDragStart(e, type)}
            className="vce-node-item"
            data-category={category}
          >
            <Flex className="vce-node-item-header" justify="space-between" align="center">
              <Text size="sm" weight="bold" className="vce-node-item-title">{label}</Text>
              <Badge size="xs" variant="light" className="vce-node-item-category">{category}</Badge>
            </Flex>
            <Text size="xs" className="vce-node-item-description vce-text-muted">{description}</Text>
          </Box>
        ))}
      </Stack>
      <Text size="xs" className="vce-sidebar-hint vce-text-muted">
        Drag components onto the canvas
      </Text>
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
      <Flex className="vce-search-filter-row" gap="xs" align="center">
        <TextInput
          className="vce-search-input"
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          size="sm"
          leftSection={<IconSearch width={14} height={14} />}
          rightSection={
            searchQuery ? (
              <ActionIcon
                variant="subtle"
                size="xs"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                <IconClose width={12} height={12} />
              </ActionIcon>
            ) : null
          }
          style={{ flex: 1 }}
        />

        <Popover
          opened={filterOpen}
          onChange={setFilterOpen}
          position="bottom-end"
          withArrow
          shadow="md"
        >
          <Popover.Target>
            <ActionIcon
              ref={filterButtonRef}
              variant={filterOpen || activeFilterCount > 0 ? 'filled' : 'outline'}
              onClick={() => setFilterOpen(!filterOpen)}
              aria-label="Filter templates"
              className="vce-filter-button"
              style={{ position: 'relative' }}
            >
              <IconFilter width={14} height={14} />
              {activeFilterCount > 0 && (
                <Badge
                  size="xs"
                  variant="filled"
                  className="vce-filter-badge"
                  style={{ position: 'absolute', top: -4, right: -4 }}
                >
                  {activeFilterCount}
                </Badge>
              )}
            </ActionIcon>
          </Popover.Target>
          <Popover.Dropdown>
            <Flex className="vce-filter-header" justify="space-between" align="center" style={{ marginBottom: '12px' }}>
              <Text size="sm" weight="bold">Filter by Category</Text>
              {activeFilterCount > 0 && (
                <Button variant="subtle" size="compact-sm" onClick={clearFilters}>
                  Clear all
                </Button>
              )}
            </Flex>
            <Stack gap="xs">
              {Object.entries(categoryLabels).map(([key, label]) => (
                <Checkbox
                  key={key}
                  label={label}
                  checked={selectedCategories.has(key)}
                  onChange={() => toggleCategory(key)}
                  size="sm"
                />
              ))}
            </Stack>
          </Popover.Dropdown>
        </Popover>
      </Flex>

      {/* Active Filters Display */}
      {activeFilterCount > 0 && (
        <Flex className="vce-active-filters" gap="xs" wrap="wrap">
          {Array.from(selectedCategories).map((key) => (
            <Pill
              key={key}
              variant="default"
              withRemoveButton
              onRemove={() => toggleCategory(key)}
              className="vce-active-filter-tag"
            >
              {categoryLabels[key]}
            </Pill>
          ))}
        </Flex>
      )}

      {/* Templates List */}
      <Stack className="vce-templates-list" gap="xs">
        {filteredTemplates.map((template) => (
          <Box
            key={template.id}
            className="vce-template-card"
            onClick={() => onAddTemplate(template)}
          >
            <Flex className="vce-template-header" justify="space-between" align="center">
              <Text size="sm" weight="bold" className="vce-template-name">{template.name}</Text>
              <Badge size="xs" variant="light" className="vce-template-category">
                {categoryLabels[template.category] || template.category}
              </Badge>
            </Flex>
            <Text size="xs" className="vce-template-description vce-text-muted">{template.description}</Text>
            {template.tags.length > 0 && (
              <Flex className="vce-template-tags" gap="xs" style={{ marginTop: '8px' }}>
                {template.tags.slice(0, 3).map((tag) => (
                  <Badge key={tag} size="xs" variant="outline" className="vce-template-tag">{tag}</Badge>
                ))}
              </Flex>
            )}
          </Box>
        ))}
        {filteredTemplates.length === 0 && (
          <Stack className="vce-templates-empty" align="center" gap="sm">
            <IconSearch width={24} height={24} className="vce-text-muted" />
            <Text size="sm" className="vce-text-muted">No templates found</Text>
            {(searchQuery || activeFilterCount > 0) && (
              <Button variant="subtle" size="compact-sm" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </Stack>
        )}
      </Stack>
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
  routeServiceId,
  isLocalRoute,
  onNavigate,
}: {
  nodes: Node[]
  edges: Edge[]
  onLoadRules?: (nodes: Node[], edges: Edge[]) => void
  fastlyState: FastlyState
  setFastlyState: React.Dispatch<React.SetStateAction<FastlyState>>
  localModeState: LocalModeState
  setLocalModeState: React.Dispatch<React.SetStateAction<LocalModeState>>
  routeServiceId?: string
  isLocalRoute?: boolean
  onNavigate?: (path: string) => void
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
  const [_deployProgress, setDeployProgress] = useState<string | null>(null)

  const [storePreview, setStorePreview] = useState<{
    storeId: string
    items: Array<{ key: string; value: string; truncated: boolean }>
    loading: boolean
    error: string | null
  } | null>(null)

  const [configStoreStatus, setConfigStoreStatus] = useState<ConfigStoreStatus | null>(null)
  const [configStoreStatusLoading, setConfigStoreStatusLoading] = useState(false)

  // Sync URL with local mode - navigate to /local when entering local mode
  useEffect(() => {
    if (isLocalRoute && !localMode && localServerAvailable) {
      // URL is /local but we're not in local mode - trigger local mode check
      // This will be handled by the checkLocalEnvironment effect
    }
  }, [isLocalRoute, localMode, localServerAvailable])

  // Sync URL with selected service - when route has serviceId, select that service
  useEffect(() => {
    if (routeServiceId && isConnected && services.length > 0) {
      const serviceExists = services.some(s => s.id === routeServiceId)
      if (serviceExists && selectedService !== routeServiceId) {
        updateFastlyState({ selectedService: routeServiceId })
      }
    }
  }, [routeServiceId, isConnected, services, selectedService])

  // Navigate when service selection changes (user-initiated)
  const navigateToService = useCallback((serviceId: string) => {
    if (onNavigate && serviceId) {
      onNavigate(`/${serviceId}`)
    }
  }, [onNavigate])

  // Navigate to local mode
  const navigateToLocal = useCallback(() => {
    if (onNavigate) {
      onNavigate('/local')
    }
  }, [onNavigate])

  // Navigate to home (disconnected)
  const navigateToHome = useCallback(() => {
    if (onNavigate) {
      onNavigate('/')
    }
  }, [onNavigate])

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
        navigateToLocal()
        return true
      }
    } catch {
      // Local server not running - show error to user
      setError('Local API server not found. Run "make local" to start the full local environment (UI + API + Compute).')
    }
    return false
  }, [onLoadRules, hasLoadedRules, updateLocalModeState, navigateToLocal])

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

      // Navigate to the selected service
      if (serviceToSelect) {
        navigateToService(serviceToSelect)
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
    // Clear the canvas
    if (onLoadRules) {
      onLoadRules([], [])
    }
    // Navigate to home
    navigateToHome()
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

    // Navigate to the service URL
    navigateToService(serviceId)

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
      <Box p="md">
        {/* Local Mode Banner */}
        <Flex style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <Pill variant="action">Local Dev Mode</Pill>
          <Button
            variant="outline"
            size="sm"
            leftSection={<IconSwap width={14} height={14} />}
            onClick={() => {
              updateLocalModeState({ localMode: false, localServerAvailable: false })
              navigateToHome()
            }}
          >
            Switch to Fastly
          </Button>
        </Flex>

        {/* Local Server Card */}
        <Box mb="md">
          <Card withBorder radius="md" padding={0}>
            <Card.Section style={{ padding: '8px 12px', background: 'var(--COLOR--surface--secondary)' }}>
              <Flex justify="space-between" align="center">
                <Title order={5}>Local Server</Title>
                <ActionIcon variant="subtle" onClick={handleRefreshLocal} disabled={loading}>
                  <IconSync width={16} height={16} />
                </ActionIcon>
              </Flex>
            </Card.Section>

            <Box style={{ padding: '12px' }}>
              <Flex justify="space-between" align="center" style={{ marginBottom: '12px' }}>
                <Anchor
                  href="http://127.0.0.1:7676/"
                  target="_blank"
                  size="xs"
                  style={{ fontFamily: 'monospace' }}
                >
                  127.0.0.1:7676
                </Anchor>
                <Pill variant={localComputeRunning ? 'success' : 'error'}>
                  {localComputeRunning ? 'Running' : 'Not Running'}
                </Pill>
              </Flex>

              {localComputeRunning && localEngineVersion && (
                <Text size="sm" style={{ marginBottom: '12px' }}>
                  <Text span className="vce-text-muted">Engine:</Text> {localEngineVersion.engine} v{localEngineVersion.version}
                </Text>
              )}

              {localComputeRunning && (
                <Button
                  variant="outline"
                  component="a"
                  href="http://127.0.0.1:7676/"
                  target="_blank"
                  fullWidth
                >
                  Open in Browser
                </Button>
              )}

              {!localComputeRunning && (
                <Text size="xs" className="vce-text-muted">
                  Run <code style={{ background: 'var(--COLOR--surface--tertiary)', padding: '2px 4px', borderRadius: '2px' }}>make serve</code> to start
                </Text>
              )}
            </Box>
          </Card>
        </Box>

        {/* Deploy Rules Card */}
        <Box mb="md">
          <Card withBorder radius="md" padding={0}>
            <Card.Section style={{ padding: '8px 12px', background: 'var(--COLOR--surface--secondary)' }}>
              <Flex align="center" gap="sm">
                <Box>
                  <Title order={5}>Save Rules</Title>
                  <Text size="xs" className="vce-text-muted">Export to local file system</Text>
                </Box>
              </Flex>
            </Card.Section>

            <Box style={{ padding: '12px' }}>
              <Flex gap="md" style={{ marginBottom: '12px' }}>
                <Text size="sm"><Text span weight="bold">{nodes.length}</Text> <Text span className="vce-text-muted">nodes</Text></Text>
                <Text size="sm"><Text span weight="bold">{edges.length}</Text> <Text span className="vce-text-muted">edges</Text></Text>
              </Flex>

              <Button variant="filled" leftSection={<IconUpload width={16} height={16} />} onClick={handleDeployLocal} disabled={loading} fullWidth>
                {loading ? 'Saving...' : 'Save Rules Locally'}
              </Button>

              {localComputeRunning && (
                <Text size="xs" className="vce-text-muted" style={{ marginTop: '8px', fontStyle: 'italic' }}>
                  Restart the Compute server to reload rules
                </Text>
              )}
            </Box>
          </Card>
        </Box>

        {/* Test URLs Card */}
        {localComputeRunning && (
          <Box mb="md">
            <Card withBorder radius="md" padding={0}>
              <Card.Section style={{ padding: '8px 12px', background: 'var(--COLOR--surface--secondary)' }}>
                <Title order={5}>Test URLs</Title>
              </Card.Section>

              <Box style={{ padding: '12px' }}>
                <Stack gap="xs">
                  <Flex justify="space-between" align="center">
                    <Anchor href="http://127.0.0.1:7676/_version" target="_blank" size="xs">
                      /_version
                    </Anchor>
                    <Text size="xs" className="vce-text-muted">Engine info</Text>
                  </Flex>
                  <Flex justify="space-between" align="center">
                    <Anchor href="http://127.0.0.1:7676/" target="_blank" size="xs">
                      /
                    </Anchor>
                    <Text size="xs" className="vce-text-muted">Test request</Text>
                  </Flex>
                </Stack>
              </Box>
            </Card>
          </Box>
        )}

        {/* Status/Error Messages */}
        {error && (
          <Alert variant="error" icon={<IconAttentionFilled width={16} height={16} />}>{error}</Alert>
        )}
        {status && !error && (
          <Alert variant="success" icon={<IconCheckCircleFilled width={16} height={16} />}>{status}</Alert>
        )}
      </Box>
    )
  }

  // Show connection UI if not connected to Fastly
  if (!isConnected) {
    return (
      <Box p="md">
        {/* Connect to Fastly section */}
        <Text size="sm" className="vce-text-muted" style={{ marginBottom: '12px' }}>
          Connect to Fastly to deploy rules to the edge.
        </Text>

        <Box mb="md">
          <TextInput
            label="API Token"
            type="password"
            value={apiToken}
            onChange={(e) => updateFastlyState({ apiToken: e.target.value })}
            placeholder="Enter your Fastly API token"
          />
          <Text size="xs" className="vce-text-muted" style={{ marginTop: '4px' }}>
            Create a token at{' '}
            <a href="https://manage.fastly.com/account/personal/tokens" target="_blank" rel="noreferrer" style={{ color: 'var(--COLOR--action--text)' }}>
              manage.fastly.com
            </a>
          </Text>
        </Box>

        <Button
          variant="filled"
          onClick={handleConnect}
          disabled={!apiToken}
          loading={loading}
          leftSection={<IconLink width={16} height={16} />}
          style={{ width: '100%' }}
        >
          Connect to Fastly
        </Button>

        {error && (
          <Box mt="md">
            <Alert variant="error" icon={<IconAttentionFilled width={16} height={16} />}>{error}</Alert>
          </Box>
        )}

        <Flex style={{ alignItems: 'center', gap: '12px', margin: '16px 0' }}>
          <Box style={{ flex: 1, height: '1px', background: 'var(--COLOR--border--primary)' }} />
          <Text size="xs" className="vce-text-muted">OR</Text>
          <Box style={{ flex: 1, height: '1px', background: 'var(--COLOR--border--primary)' }} />
        </Flex>

        {/* Local Dev Mode button */}
        <Button variant="outline" onClick={checkLocalEnvironment} leftSection={<IconCode width={16} height={16} />} style={{ width: '100%' }}>
          Use Local Dev Mode
        </Button>
      </Box>
    )
  }

  // Connected to Fastly - show full UI
  return (
    <Box p="md">
      {/* Connection status row */}
      <Flex style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <Pill variant="success">Connected</Pill>
        <Button variant="outline" size="sm" leftSection={<IconUnlink width={14} height={14} />} onClick={handleDisconnect}>
          Disconnect
        </Button>
      </Flex>

      {/* Create New Service Form */}
      {showCreateForm ? (
        <Box mb="md">
          <Card withBorder radius="md" padding={0}>
            <Card.Section style={{ padding: '8px 12px', background: 'var(--COLOR--surface--secondary)' }}>
              <Flex justify="space-between" align="center">
                <Title order={5}>New VCE Service</Title>
                <ActionIcon variant="subtle" onClick={() => setShowCreateForm(false)}>
                  <IconClose width={16} height={16} />
                </ActionIcon>
              </Flex>
            </Card.Section>

            <Box style={{ padding: '12px' }}>
              <Box mb="sm">
                <TextInput
                  label="Service Name"
                  value={createForm.serviceName}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, serviceName: e.target.value }))}
                  placeholder="my-vce-service"
                />
              </Box>

              {createProgress && (
                <Text size="xs" style={{ fontFamily: 'monospace', marginBottom: '12px' }}>{createProgress}</Text>
              )}

              <Text size="xs" className="vce-text-muted" style={{ marginBottom: '12px' }}>
                Service creation takes 1-2 minutes.
              </Text>

              <Button
                variant="filled"
                onClick={handleCreateService}
                disabled={loading || !createForm.serviceName}
                fullWidth
              >
                {loading ? 'Creating...' : 'Create Service'}
              </Button>
            </Box>
          </Card>
        </Box>
      ) : (
        <Box mb="md">
          <Button variant="outline" onClick={() => setShowCreateForm(true)} style={{ width: '100%', border: '1px dashed var(--COLOR--border--primary)' }}>
            + Create New VCE Service
          </Button>
        </Box>
      )}

      {/* Service Selection */}
      <Box mb="md">
        <Text size="sm" style={{ fontWeight: 500, marginBottom: '4px' }}>VCE Service</Text>

        {services.length === 0 ? (
          <Box p="sm" style={{ border: '1px solid var(--COLOR--border--primary)', borderRadius: '6px' }}>
            <Text size="sm" className="vce-text-muted">No Compute services found. Create one above.</Text>
          </Box>
        ) : (
          <Select
            data={services.map(s => ({
              value: s.id,
              label: s.isVceEnabled ? s.name : `${s.name} (not configured)`,
            }))}
            value={selectedService || undefined}
            onChange={(value) => value && handleServiceChange(value)}
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
          <Box mb="md">
            <Card withBorder radius="md" padding={0}>
              <Card.Section style={{ padding: '8px 12px', background: 'var(--COLOR--surface--secondary)' }}>
                <Flex justify="space-between" align="center">
                  <Title order={5}>Service Info</Title>
                  <ActionIcon variant="subtle" onClick={handleRefreshService} loading={engineVersionLoading}>
                    <IconSync width={16} height={16} />
                  </ActionIcon>
                </Flex>
              </Card.Section>

              <Stack gap="xs" style={{ padding: '12px' }}>
                <Box>
                  <Text size="xs" className="vce-text-muted" style={{ marginBottom: 2 }}>Service ID</Text>
                  <Flex align="center" gap="xs">
                    <Text size="sm" style={{ fontFamily: 'var(--TYPOGRAPHY--type--font-family--monospace)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{service.id}</Text>
                    <ActionIcon variant="subtle" size="xs" onClick={() => navigator.clipboard.writeText(service.id)}>
                      <IconCopy width={14} height={14} />
                    </ActionIcon>
                  </Flex>
                </Box>

                <Box>
                  <Text size="xs" className="vce-text-muted" style={{ marginBottom: 2 }}>Test URL</Text>
                  <Flex align="center" gap="xs">
                    <Anchor href={serviceUrl} target="_blank" size="sm">
                      {service.name}.edgecompute.app
                    </Anchor>
                    <ActionIcon variant="subtle" size="xs" onClick={() => navigator.clipboard.writeText(serviceUrl)}>
                      <IconCopy width={14} height={14} />
                    </ActionIcon>
                  </Flex>
                </Box>
              </Stack>
            </Card>
          </Box>

          <Divider style={{ margin: '16px 0' }} />

          {/* Step 1: Engine */}
          <Box mb="md">
            <Card withBorder radius="md" padding={0}>
              <Card.Section style={{ padding: '8px 12px', background: 'var(--COLOR--surface--secondary)' }}>
                <Flex align="center" gap="sm">
                  <Pill variant={engineVersion?.version === VCE_ENGINE_VERSION ? 'success' : 'default'}>1</Pill>
                  <Box>
                    <Title order={5}>Engine</Title>
                    <Text size="xs" className="vce-text-muted">WASM binary on edge servers</Text>
                  </Box>
                </Flex>
              </Card.Section>

              <Box style={{ padding: '12px' }}>
              {engineUpdateProgress ? (
                <Stack gap="xs">
                  <Text size="xs" style={{ fontFamily: 'monospace' }}>{engineUpdateProgress}</Text>
                  {engineUpdateProgress.includes('POPs') && (() => {
                    const match = engineUpdateProgress.match(/(\d+)\/(\d+) POPs \((\d+)%\)/)
                    if (match) {
                      const percent = parseInt(match[3], 10)
                      return (
                        <Box style={{ height: '4px', background: 'var(--COLOR--border--primary)', borderRadius: '2px', overflow: 'hidden' }}>
                          <Box style={{ height: '100%', width: `${percent}%`, background: percent >= 95 ? 'var(--COLOR--success--surface--tertiary)' : 'var(--COLOR--action--surface)', transition: 'width 0.3s' }} />
                        </Box>
                      )
                    }
                    return null
                  })()}
                </Stack>
              ) : engineVersionLoading ? (
                <Stack gap="sm">
                  <Skeleton height={44} radius="md" />
                  <Skeleton height={36} radius="md" />
                </Stack>
              ) : engineVersion ? (
                <Stack gap="sm">
                  <Flex align="center" justify="space-between">
                    <Text size="sm">{engineVersion.engine} v{engineVersion.version}</Text>
                    {engineVersion.engine !== 'Visual Compute Engine' ? (
                      <Pill variant="error">Unknown</Pill>
                    ) : engineVersion.version === VCE_ENGINE_VERSION ? (
                      <Pill variant="success">Up to date</Pill>
                    ) : (
                      <Pill variant="caution">Update available</Pill>
                    )}
                  </Flex>
                  {(engineVersion.engine !== 'Visual Compute Engine' || engineVersion.version !== VCE_ENGINE_VERSION) ? (
                    <>
                      <Text size="xs" className="vce-text-muted">Updates typically take ~30-60s to propagate.</Text>
                      <Button variant="filled" leftSection={<IconUpload width={16} height={16} />} onClick={handleUpdateEngine} loading={loading} fullWidth>
                        Update Engine to v{VCE_ENGINE_VERSION}
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" size="sm" leftSection={<IconSync width={14} height={14} />} onClick={handleUpdateEngine} loading={loading}>
                      Force Re-deploy Engine
                    </Button>
                  )}
                </Stack>
              ) : (
                <Stack gap="sm">
                  <Flex align="center" justify="space-between">
                    <Text size="sm" style={{ color: 'var(--COLOR--error--text)' }}>Not detected</Text>
                    <Pill variant="error">Not deployed</Pill>
                  </Flex>
                  <Text size="xs" className="vce-text-muted" style={{ fontStyle: 'italic' }}>
                    {selectedConfigStore ? 'Deployment typically takes ~30-60s to propagate.' : 'Deploy the engine first, then setup Config Store.'}
                  </Text>
                  <Button variant="filled" leftSection={<IconUpload width={16} height={16} />} onClick={handleUpdateEngine} loading={loading} fullWidth>
                    Deploy Engine v{VCE_ENGINE_VERSION}
                  </Button>
                </Stack>
              )}
              </Box>
            </Card>
          </Box>
          </>
        )
      })()}

      {/* Step 2: Config Store */}
      {selectedService && selectedConfigStore && (
        <Box mb="md">
          <Card withBorder radius="md" padding={0}>
            <Card.Section style={{ padding: '8px 12px', background: 'var(--COLOR--surface--secondary)' }}>
              <Flex align="center" gap="sm">
                <Pill variant="success">2</Pill>
                <Box>
                  <Title order={5}>Config Store</Title>
                  <Text size="xs" className="vce-text-muted">Edge key-value store for rules</Text>
                </Box>
              </Flex>
            </Card.Section>

            <Box style={{ padding: '12px' }}>
            <Flex align="center" justify="space-between">
              <Text size="sm" style={{ fontFamily: 'monospace' }}>
                {configStores.find(s => s.id === selectedConfigStore)?.name || selectedConfigStore}
              </Text>
              <Button variant="outline" size="sm" onClick={() => fetchStorePreview(selectedConfigStore)}>
                {storePreview?.storeId === selectedConfigStore ? 'Hide' : 'View'}
              </Button>
            </Flex>

            {/* Config Store Preview */}
            {storePreview?.storeId === selectedConfigStore && (
              <Box mt="sm">
                <Card withBorder padding="sm" radius="sm" style={{ maxHeight: '200px', overflow: 'auto' }}>
                  {storePreview.loading && (
                    <Stack gap="xs">
                      <Skeleton height={12} width="40%" radius="sm" />
                      <Skeleton height={10} radius="sm" />
                      <Skeleton height={12} width="35%" radius="sm" style={{ marginTop: 8 }} />
                      <Skeleton height={10} radius="sm" />
                    </Stack>
                  )}
                  {storePreview.error && (
                    <Text size="sm" style={{ color: 'var(--COLOR--error--text)' }}>{storePreview.error}</Text>
                  )}
                  {!storePreview.loading && !storePreview.error && storePreview.items.length === 0 && (
                    <Text size="sm" className="vce-text-muted" style={{ textAlign: 'center' }}>Empty store</Text>
                  )}
                  {storePreview.items.map((item, idx) => (
                    <Box key={idx} style={{ paddingBottom: '8px', marginBottom: '8px', borderBottom: idx < storePreview.items.length - 1 ? '1px solid var(--COLOR--border--primary)' : 'none' }}>
                      <Text size="xs" style={{ fontWeight: 600 }}>{item.key}</Text>
                      <Text size="xs" className="vce-text-muted" style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                        {item.value}{item.truncated && '...'}
                      </Text>
                    </Box>
                  ))}
                </Card>
              </Box>
            )}
            </Box>
          </Card>
        </Box>
      )}

      {/* Enable VCE button for non-configured services */}
      {selectedService && !selectedConfigStore && (() => {
        const service = services.find(s => s.id === selectedService)
        if (!service || service.linkedConfigStore) return null

        const getStatusPill = () => {
          if (configStoreStatusLoading) return <Pill variant="default">Checking...</Pill>
          if (!configStoreStatus) return <Pill variant="default">Not checked</Pill>
          switch (configStoreStatus.status) {
            case 'linked_ok':
              return <Pill variant="success">Ready</Pill>
            case 'linked_outdated':
              return <Pill variant="caution">Update available</Pill>
            case 'linked_no_manifest':
              return <Pill variant="caution">Needs init</Pill>
            case 'not_linked':
              return <Pill variant="default">Not linked</Pill>
            case 'error':
              return <Pill variant="error">Error</Pill>
            default:
              return <Pill variant="default">-</Pill>
          }
        }

        return (
          <Box mb="md">
            <Card withBorder radius="md" padding={0}>
              <Card.Section style={{ padding: '8px 12px', background: 'var(--COLOR--surface--secondary)' }}>
                <Flex align="center" gap="sm">
                  <Pill variant="default">2</Pill>
                  <Box>
                    <Title order={5}>Config Store</Title>
                    <Text size="xs" className="vce-text-muted">Setup required</Text>
                  </Box>
                </Flex>
              </Card.Section>

              <Box style={{ padding: '12px' }}>
              {/* Status display */}
              <Stack gap="sm">
                <Flex justify="space-between" align="center">
                  <Flex align="center" gap="xs" style={{ flex: 1 }}>
                    {getStatusPill()}
                    <Text size="xs" className="vce-text-muted" style={{ flex: 1 }}>
                      {configStoreStatusLoading ? 'Checking...' :
                       configStoreStatus ? configStoreStatus.message :
                       'Click Refresh to check status'}
                    </Text>
                  </Flex>
                  {!configStoreStatusLoading && (
                    <ActionIcon variant="subtle" onClick={() => fetchConfigStoreStatus(selectedService)}>
                      <IconSync width={16} height={16} />
                    </ActionIcon>
                  )}
                </Flex>
                {configStoreStatus?.status === 'linked_outdated' && (
                  <Text size="xs" style={{ color: 'var(--COLOR--caution--text)' }}>
                    Update available: v{configStoreStatus.manifestVersion} → v{configStoreStatus.currentVersion}
                  </Text>
                )}

                {createProgress && (
                  <Text size="xs" style={{ fontFamily: 'monospace' }}>{createProgress}</Text>
                )}

                <Button variant="filled" leftSection={<IconUpload width={16} height={16} />} onClick={handleSetupConfigStore} loading={loading} fullWidth>
                  {configStoreStatus?.status === 'linked_ok' ? 'Re-deploy VCE Engine' :
                   configStoreStatus?.status === 'linked_outdated' ? 'Update VCE Engine' :
                   configStoreStatus?.status === 'linked_no_manifest' ? 'Initialize Config Store' :
                   'Setup Config Store'}
                </Button>
              </Stack>
              </Box>
            </Card>
          </Box>
        )
      })()}

      {/* Step 3: Deploy Rules */}
      <Box style={{ marginBottom: '16px' }}>
        <Card withBorder radius="md" padding={0}>
          <Card.Section style={{ padding: '8px 12px', background: 'var(--COLOR--surface--secondary)' }}>
            <Flex align="center" gap="sm">
              <Pill variant="default">3</Pill>
              <Box>
                <Title order={5}>Deploy Rules</Title>
                <Text size="xs" className="vce-text-muted">Push graph to edge (~30-40s)</Text>
              </Box>
            </Flex>
          </Card.Section>

          <Box style={{ padding: '12px' }}>
          <Stack gap="sm">
            <Flex gap="md">
              <Text size="sm"><Text span weight="bold">{nodes.length}</Text> <Text span className="vce-text-muted">nodes</Text></Text>
              <Text size="sm"><Text span weight="bold">{edges.length}</Text> <Text span className="vce-text-muted">edges</Text></Text>
            </Flex>

            <Button
              variant="filled"
              onClick={handleDeployRules}
              disabled={!selectedConfigStore || !selectedService}
              loading={deployStatus === 'deploying' || deployStatus === 'verifying'}
              fullWidth
            >
              {deployStatus === 'deploying' ? 'Deploying...' :
               deployStatus === 'verifying' ? 'Verifying...' :
               'Deploy Rules'}
            </Button>

            {/* Deployment Status */}
            {deployStatus !== 'idle' && (
              <Pill
                variant={
                  deployStatus === 'verified' ? 'success' :
                  deployStatus === 'timeout' ? 'caution' :
                  deployStatus === 'error' ? 'error' : 'default'
                }
              >
                {deployStatus === 'deploying' ? 'Pushing to Config Store...' :
                 deployStatus === 'verifying' ? 'Verifying deployment...' :
                 deployStatus === 'verified' ? 'Deployment verified' :
                 deployStatus === 'timeout' ? 'Verification timed out' :
                 deployStatus === 'error' ? 'Deployment failed' : ''}
              </Pill>
            )}

          <Button
            variant="outline"
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
          >
            Export JSON (for local dev)
          </Button>
          </Stack>
          </Box>
        </Card>
      </Box>

      {/* Status/Error Messages */}
      {error && (
        <Alert variant="error" icon={<IconAttentionFilled width={16} height={16} />}>{error}</Alert>
      )}
      {status && !error && (
        <Alert variant="success" icon={<IconCheckCircleFilled width={16} height={16} />}>{status}</Alert>
      )}
    </Box>
  )
}
