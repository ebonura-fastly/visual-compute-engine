import { useState, useCallback, useRef, useEffect } from 'react'
import type { Node, Edge } from '@xyflow/react'
import type { CanonicalGraph } from '../types/graph'
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
  Tooltip,
  Loader,
} from '@fastly/beacon-mantine'
import { IconClose, IconSearch, IconFilter, IconLink, IconUnlink, IconCode, IconSwap, IconSync, IconCopy, IconUpload, IconAttentionFilled, IconCheckCircleFilled, IconDownload } from '@fastly/beacon-icons'
import { allTemplates, instantiateTemplate, type RuleTemplate } from '../templates'

type SidebarProps = {
  nodes: Node[]
  edges: Edge[]
  canonicalGraph: CanonicalGraph
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
    description: 'Starting point for all incoming requests. Connect to conditions or actions.',
  },
  {
    type: 'condition',
    label: 'Condition',
    category: 'condition' as const,
    description: 'Evaluate request properties like path, IP, headers, geo location, and more.',
  },
  {
    type: 'ruleGroup',
    label: 'Rule Group',
    category: 'logic' as const,
    description: 'Combine multiple conditions using AND/OR logic for complex matching.',
  },
  {
    type: 'rateLimit',
    label: 'Rate Limit',
    category: 'condition' as const,
    description: 'Limit requests per second/minute/hour. Group by IP, fingerprint, or header.',
  },
  {
    type: 'transform',
    label: 'Transform',
    category: 'routing' as const,
    description: 'Transform request values: lowercase, trim, URL encode/decode, and more.',
  },
  {
    type: 'backend',
    label: 'Backend',
    category: 'routing' as const,
    description: 'Route requests to a specific origin server or backend service.',
  },
  {
    type: 'header',
    label: 'Header',
    category: 'routing' as const,
    description: 'Modify HTTP headers on requests or responses.',
  },
  {
    type: 'cache',
    label: 'Cache',
    category: 'routing' as const,
    description: 'Configure caching: TTL, stale-while-revalidate, cache key, and bypass.',
  },
  {
    type: 'logging',
    label: 'Logging',
    category: 'action' as const,
    description: 'Send logs to BigQuery, S3, or other logging endpoints in real-time.',
  },
  {
    type: 'action',
    label: 'Action',
    category: 'action' as const,
    description: 'Terminal action: block with status code, allow through, or challenge.',
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

export function Sidebar({ nodes, edges, canonicalGraph, onAddTemplate, onLoadRules, routeServiceId, isLocalRoute, onNavigate }: SidebarProps) {
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
    sharedStoreId: null,
    engineVersion: null,
    engineVersionLoading: false,
    serviceDomain: null,
  })

  // Local development mode state - lifted up to persist across tab switches
  const [localModeState, setLocalModeState] = useState({
    localMode: isLocalRoute || false,
    localServerAvailable: false,
    localComputeRunning: false,
    localEngineVersion: null as { engine: string; version: string; format: string } | null,
    hasLoadedRules: false,
  })

  // FastlyTab UI state - lifted up to persist across tab switches
  const [fastlyTabState, setFastlyTabState] = useState({
    loading: false,
    error: null as string | null,
    status: null as string | null,
    showCreateForm: false,
    createForm: { serviceName: '' },
    createProgress: null as string | null,
    engineUpdateProgress: null as string | null,
    deployStatus: 'idle' as 'idle' | 'deploying' | 'verifying' | 'verified' | 'error' | 'timeout',
    deployProgress: null as string | null,
    resourceLinkInfo: null as { storeId: string; storeName: string } | null,
    fixingLink: false,
    deployedRulesHash: null as string | null,
    currentGraphHash: null as string | null,
    shouldCaptureDeployedHash: false,
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
    <aside className="cc-sidebar">
      {isActive ? (
        <Tabs value={activeTab} onChange={(v) => setActiveTab(v as Tab)} className="cc-sidebar-tabs-container">
          <Tabs.List grow className="cc-sidebar-tabs">
            {tabs.map((tab) => (
              <Tabs.Tab key={tab.id} value={tab.id} className="cc-sidebar-tab">
                {tab.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
      ) : null}

      {/* Tab Content */}
      <Box className="cc-sidebar-content">
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
            canonicalGraph={canonicalGraph}
            onLoadRules={onLoadRules}
            fastlyState={fastlyState}
            setFastlyState={setFastlyState}
            localModeState={localModeState}
            setLocalModeState={setLocalModeState}
            fastlyTabState={fastlyTabState}
            setFastlyTabState={setFastlyTabState}
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
    <Box className="cc-components-tab" p="sm">
      <Stack className="cc-node-list" gap="xs">
        {nodeTypes.map(({ type, label, category, description }) => (
          <Box
            key={type}
            draggable
            onDragStart={(e) => onDragStart(e, type)}
            className="cc-node-item"
            data-category={category}
          >
            <Flex className="cc-node-item-header" justify="space-between" align="center">
              <Text size="sm" weight="bold" className="cc-node-item-title">{label}</Text>
              <Badge size="xs" variant="light" className="cc-node-item-category">{category}</Badge>
            </Flex>
            <Text size="xs" className="cc-node-item-description cc-text-muted">{description}</Text>
          </Box>
        ))}
      </Stack>
      <Text size="xs" className="cc-sidebar-hint cc-text-muted">
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
  const filterButtonRef = useRef<HTMLDivElement>(null)

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
    <Box className="cc-templates-tab" p="sm">
      {/* Search with Filter Icon */}
      <Flex className="cc-search-filter-row" gap="xs" align="center">
        <TextInput
          className="cc-search-input"
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
            <Box
              ref={filterButtonRef}
              onClick={() => setFilterOpen(!filterOpen)}
              aria-label="Filter templates"
              className="cc-filter-icon"
              style={{ position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <IconFilter
                width={16}
                height={16}
                style={{ color: activeFilterCount > 0 ? 'var(--COLOR--action--text--primary)' : 'var(--COLOR--text--secondary)' }}
              />
              {activeFilterCount > 0 && (
                <Badge
                  size="xs"
                  variant="filled"
                  className="cc-filter-badge"
                  style={{ position: 'absolute', top: -6, right: -8 }}
                >
                  {activeFilterCount}
                </Badge>
              )}
            </Box>
          </Popover.Target>
          <Popover.Dropdown>
            <Flex className="cc-filter-header" justify="space-between" align="center" style={{ marginBottom: '12px' }}>
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
        <Flex className="cc-active-filters" gap="xs" wrap="wrap">
          {Array.from(selectedCategories).map((key) => (
            <Pill
              key={key}
              variant="default"
              withRemoveButton
              onRemove={() => toggleCategory(key)}
              className="cc-active-filter-tag"
            >
              {categoryLabels[key]}
            </Pill>
          ))}
        </Flex>
      )}

      {/* Templates List */}
      <Stack className="cc-templates-list" gap="xs">
        {filteredTemplates.map((template) => (
          <Box
            key={template.id}
            className="cc-template-card"
            onClick={() => onAddTemplate(template)}
          >
            <Flex className="cc-template-header" justify="space-between" align="center">
              <Text size="sm" weight="bold" className="cc-template-name">{template.name}</Text>
              <Badge size="xs" variant="light" className="cc-template-category">
                {categoryLabels[template.category] || template.category}
              </Badge>
            </Flex>
            <Text size="xs" className="cc-template-description cc-text-muted">{template.description}</Text>
            {template.tags.length > 0 && (
              <Flex className="cc-template-tags" gap="xs" style={{ marginTop: '8px' }}>
                {template.tags.slice(0, 3).map((tag) => (
                  <Badge key={tag} size="xs" variant="outline" className="cc-template-tag">{tag}</Badge>
                ))}
              </Flex>
            )}
          </Box>
        ))}
        {filteredTemplates.length === 0 && (
          <Stack className="cc-templates-empty" align="center" gap="sm">
            <IconSearch width={24} height={24} className="cc-text-muted" />
            <Text size="sm" className="cc-text-muted">No templates found</Text>
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
import { compressRules, decompressRules, validateGraph } from '../utils/ruleConverter'
import { buildCcPackage } from '../lib/fastlyPackage'

type FastlyService = {
  id: string
  name: string
  type: string
  version: number
  domain?: string
  isCcEnabled?: boolean
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

// Combined payload stored under single key: {serviceId}
type CcPayload = {
  version: string       // Engine version at deploy time
  deployedAt: string    // ISO timestamp
  rules_packed: string  // Compressed graph data
}

const CC_ENGINE_VERSION = '0.1.8'
const FASTLY_API_BASE = 'https://api.fastly.com'
const STORAGE_KEY = 'cc-fastly'
const CC_SHARED_STORE_NAME = 'cc-shared-rules'

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

// Fetch the actual domain from a service's active version
async function getServiceDomain(
  serviceId: string,
  version: number,
  fastlyFetch: (endpoint: string, options?: RequestInit) => Promise<unknown>
): Promise<string | null> {
  try {
    const domains = await fastlyFetch(`/service/${serviceId}/version/${version}/domain`) as Array<{ name: string }>
    if (domains.length > 0) {
      return domains[0].name
    }
  } catch (err) {
    console.log('[Domain] Failed to fetch domain:', err)
  }
  return null
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
  sharedStoreId: string | null  // ID of cc-shared-rules store, null if doesn't exist
  serviceDomain: string | null  // Cached domain for selected service
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

type FastlyTabState = {
  loading: boolean
  error: string | null
  status: string | null
  showCreateForm: boolean
  createForm: { serviceName: string }
  createProgress: string | null
  engineUpdateProgress: string | null
  deployStatus: DeployStatus
  deployProgress: string | null
  resourceLinkInfo: { storeId: string; storeName: string } | null
  fixingLink: boolean
  deployedRulesHash: string | null
  currentGraphHash: string | null
  shouldCaptureDeployedHash: boolean
}

function FastlyTab({
  nodes,
  edges,
  canonicalGraph,
  onLoadRules,
  fastlyState,
  setFastlyState,
  localModeState,
  setLocalModeState,
  fastlyTabState,
  setFastlyTabState,
  routeServiceId,
  isLocalRoute,
  onNavigate,
}: {
  nodes: Node[]
  edges: Edge[]
  canonicalGraph: CanonicalGraph
  onLoadRules?: (nodes: Node[], edges: Edge[]) => void
  fastlyState: FastlyState
  setFastlyState: React.Dispatch<React.SetStateAction<FastlyState>>
  localModeState: LocalModeState
  setLocalModeState: React.Dispatch<React.SetStateAction<LocalModeState>>
  fastlyTabState: FastlyTabState
  setFastlyTabState: React.Dispatch<React.SetStateAction<FastlyTabState>>
  routeServiceId?: string
  isLocalRoute?: boolean
  onNavigate?: (path: string) => void
}) {
  const { apiToken, isConnected, services, configStores, selectedService, selectedConfigStore, sharedStoreId, engineVersion, engineVersionLoading, serviceDomain } = fastlyState
  const { localMode, localServerAvailable, localComputeRunning, localEngineVersion, hasLoadedRules } = localModeState
  const {
    loading, error, status, showCreateForm, createForm, createProgress,
    engineUpdateProgress, deployStatus, deployProgress, resourceLinkInfo, fixingLink,
    deployedRulesHash, currentGraphHash, shouldCaptureDeployedHash
  } = fastlyTabState

  const updateLocalModeState = (updates: Partial<LocalModeState>) => {
    setLocalModeState(prev => ({ ...prev, ...updates }))
  }

  const updateTabState = (updates: Partial<FastlyTabState>) => {
    setFastlyTabState(prev => ({ ...prev, ...updates }))
  }

  // Helper setters for cleaner code
  const setLoading = (v: boolean) => updateTabState({ loading: v })
  const setError = (v: string | null) => updateTabState({ error: v })
  const setStatus = (v: string | null) => updateTabState({ status: v })
  const setShowCreateForm = (v: boolean) => updateTabState({ showCreateForm: v })
  const setCreateForm = (v: { serviceName: string }) => updateTabState({ createForm: v })
  const setCreateProgress = (v: string | null) => updateTabState({ createProgress: v })
  const setEngineUpdateProgress = (v: string | null) => updateTabState({ engineUpdateProgress: v })
  const setDeployStatus = (v: DeployStatus) => updateTabState({ deployStatus: v })
  const setDeployProgress = (v: string | null) => updateTabState({ deployProgress: v })
  const setResourceLinkInfo = (v: { storeId: string; storeName: string } | null) => updateTabState({ resourceLinkInfo: v })
  const setFixingLink = (v: boolean) => updateTabState({ fixingLink: v })
  const setDeployedRulesHash = (v: string | null) => updateTabState({ deployedRulesHash: v })
  const setCurrentGraphHash = (v: string | null) => updateTabState({ currentGraphHash: v })
  const setShouldCaptureDeployedHash = (v: boolean) => updateTabState({ shouldCaptureDeployedHash: v })

  const setEngineVersion = (version: EngineVersion) => {
    setFastlyState(prev => ({ ...prev, engineVersion: version }))
  }
  const setEngineVersionLoading = (loading: boolean) => {
    setFastlyState(prev => ({ ...prev, engineVersionLoading: loading }))
  }
  const setServiceDomain = (domain: string | null) => {
    setFastlyState(prev => ({ ...prev, serviceDomain: domain }))
  }

  // Compute current graph hash when canonical graph changes
  // Uses canonicalGraph which already has React Flow internal fields stripped
  useEffect(() => {
    const computeHash = async () => {
      if (canonicalGraph.nodes.length === 0 && canonicalGraph.edges.length === 0) {
        setCurrentGraphHash(null)
        if (shouldCaptureDeployedHash) {
          setDeployedRulesHash(null)
          setShouldCaptureDeployedHash(false)
        }
        return
      }
      try {
        const compressed = await compressRules(JSON.stringify(canonicalGraph))
        const hash = await computeRulesHash(compressed)
        setCurrentGraphHash(hash)

        // If flagged, also set this as the deployed hash
        if (shouldCaptureDeployedHash) {
          setDeployedRulesHash(hash)
          setShouldCaptureDeployedHash(false)
        }
      } catch {
        setCurrentGraphHash(null)
      }
    }
    computeHash()
  }, [canonicalGraph, shouldCaptureDeployedHash])

  // Determine if graph has been modified since last load/deploy
  const isGraphModified = deployedRulesHash !== null && currentGraphHash !== null && deployedRulesHash !== currentGraphHash
  const isGraphInSync = deployedRulesHash !== null && currentGraphHash !== null && deployedRulesHash === currentGraphHash

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

  // Refresh resource link info when service changes
  useEffect(() => {
    const refreshLinkInfo = async () => {
      if (!selectedService || !isConnected || !apiToken) {
        setResourceLinkInfo(null)
        return
      }

      try {
        // Get active version for the service
        const versions = await fastlyFetch(`/service/${selectedService}/version`)
        const activeVersion = versions.find((v: { active: boolean }) => v.active)?.number
        if (!activeVersion) {
          setResourceLinkInfo(null)
          return
        }

        // Find the security_rules link
        const actualLink = await getServiceConfigStoreLink(selectedService, activeVersion, fastlyFetch)
        if (actualLink) {
          const linkedStoreName = configStores.find(s => s.id === actualLink.resourceId)?.name || actualLink.resourceId
          setResourceLinkInfo({ storeId: actualLink.resourceId, storeName: linkedStoreName })
        } else {
          setResourceLinkInfo(null)
        }
      } catch (err) {
        console.log('[LinkInfo] Failed to refresh:', err)
        setResourceLinkInfo(null)
      }
    }

    refreshLinkInfo()
  }, [selectedService, isConnected, apiToken, configStores])

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
      // Use canonical graph (no React Flow internal fields) for deployment
      const compressed = await compressRules(JSON.stringify(canonicalGraph))
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

  const fetchEngineVersion = useCallback(async (serviceName: string, serviceId?: string, version?: number) => {
    setEngineVersionLoading(true)

    try {
      // Try to get actual domain from service, fall back to generated name
      let domain = generateDomainName(serviceName)
      if (serviceId && version && apiToken) {
        const actualDomain = await getServiceDomain(serviceId, version, fastlyFetch)
        if (actualDomain) {
          domain = actualDomain
          setServiceDomain(actualDomain)
        }
      }
      const url = `https://${domain}/_version`
      console.log('[Version] Fetching from:', url)

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      })

      console.log('[Version] Response status:', response.status)

      if (response.ok) {
        const data = await response.json()
        console.log('[Version] Response data:', data)
        if (data.engine && data.version) {
          console.log('[Version] Engine detected:', data.engine, data.version)
          setEngineVersion(data)
        } else {
          console.log('[Version] Missing engine or version in response')
          setEngineVersion(null)
        }
      } else {
        console.log('[Version] Non-OK response:', response.status, response.statusText)
        setEngineVersion(null)
      }
    } catch (err) {
      console.error('[Version] Failed to fetch engine version:', err)
      setEngineVersion(null)
    } finally {
      setEngineVersionLoading(false)
    }
  }, [apiToken, fastlyFetch])

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

      setEngineUpdateProgress('Building Configure Compute package...')
      console.log('[Engine Update] Building package...')
      const packageB64 = await buildCcPackage(service.name)
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

      setStatus(`Engine deployed, verifying...`)
      console.log('[Engine Update] Update complete! Verifying deployment...')

      // Get actual domain from the service and cache it
      const actualDomain = await getServiceDomain(service.id, newVersionNumber, fastlyFetch)
      const domain = actualDomain || generateDomainName(service.name)
      if (actualDomain) {
        setServiceDomain(actualDomain)
      }
      console.log('[Engine Update] Using domain:', domain)
      const serviceUrl = `https://${domain}/_version`
      const maxAttempts = 30
      const pollInterval = 2000

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        setEngineUpdateProgress(`Verifying deployment (${attempt}/${maxAttempts})...`)

        try {
          const versionResponse = await fetch(serviceUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            cache: 'no-store',
          })

          if (versionResponse.ok) {
            const versionData = await versionResponse.json()
            console.log(`[Engine Update] Version check ${attempt}/${maxAttempts}:`, versionData)

            if (versionData.engine === 'Configure Compute' && versionData.version === CC_ENGINE_VERSION) {
              setEngineVersion(versionData)
              setEngineUpdateProgress(null)
              setStatus(`Engine v${CC_ENGINE_VERSION} deployed!`)
              setLoading(false)
              return
            } else {
              console.log('[Engine Update] Version mismatch, waiting for propagation...')
            }
          } else {
            console.log(`[Engine Update] Version check ${attempt}/${maxAttempts}: ${versionResponse.status}`)
          }
        } catch (pollErr) {
          console.log(`[Engine Update] Version check ${attempt}/${maxAttempts}: error`, pollErr)
        }

        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, pollInterval))
        }
      }

      console.warn('[Engine Update] Verification timed out after', maxAttempts, 'attempts')
      setEngineUpdateProgress(null)
      setStatus('Engine deployed (verification timed out)')
      await fetchEngineVersion(service.name, service.id, newVersionNumber)
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

      // Find the shared Configure Compute config store by name
      const sharedStore = stores.find(s => s.name === CC_SHARED_STORE_NAME)
      let foundSharedStoreId: string | null = null

      // Only check the shared store for service manifests
      if (sharedStore) {
        foundSharedStoreId = sharedStore.id
        try {
          const itemsResponse = await fetch(`${FASTLY_API_BASE}/resources/stores/config/${sharedStore.id}/items?limit=100`, {
            headers: { 'Fastly-Key': apiToken, 'Accept': 'application/json' },
          })

          if (itemsResponse.ok) {
            const itemsData = await itemsResponse.json()
            const items = itemsData?.data || itemsData || []

            // Check for service ID keys (new format: key is just the service ID)
            for (const item of items) {
              const key = item.key || item.item_key || ''
              // Key is the service ID directly
              const serviceIdx = computeServices.findIndex(s => s.id === key)
              if (serviceIdx !== -1) {
                computeServices[serviceIdx].isCcEnabled = true
                computeServices[serviceIdx].linkedConfigStore = sharedStore.id
              }
            }
          }
        } catch (err) {
          console.log('[ConfigStore] Error reading shared store:', err)
        }
      }

      computeServices.sort((a, b) => {
        if (a.isCcEnabled && !b.isCcEnabled) return -1
        if (!a.isCcEnabled && b.isCcEnabled) return 1
        return a.name.localeCompare(b.name)
      })

      // Mark services with CC naming convention
      for (const service of computeServices) {
        if (!service.isCcEnabled && service.name.toLowerCase().startsWith('cc-')) {
          service.isCcEnabled = true
        }
      }

      const ccServices = computeServices.filter(s => s.isCcEnabled)
      let serviceToSelect = selectedService
      let storeToSelect = ''

      // Priority: 1) URL route service ID, 2) previously selected, 3) first CC service
      const routeService = routeServiceId ? computeServices.find(s => s.id === routeServiceId) : null
      const previousService = computeServices.find(s => s.id === selectedService && s.isCcEnabled)

      if (routeService) {
        // URL specifies a service - use it
        serviceToSelect = routeService.id
        storeToSelect = routeService.linkedConfigStore || ''
      } else if (previousService) {
        storeToSelect = previousService.linkedConfigStore || ''
      } else if (ccServices.length > 0) {
        serviceToSelect = ccServices[0].id
        storeToSelect = ccServices[0].linkedConfigStore || ''
      }

      // If shared store exists, use it; otherwise storeToSelect stays empty
      if (!storeToSelect && foundSharedStoreId) {
        storeToSelect = foundSharedStoreId
      }

      updateFastlyState({
        services: computeServices,
        configStores: stores,
        isConnected: true,
        selectedService: serviceToSelect,
        selectedConfigStore: storeToSelect,
        sharedStoreId: foundSharedStoreId,
      })
      setStatus('Connected to Fastly')
      saveSettings({ apiToken, selectedService: serviceToSelect, selectedConfigStore: storeToSelect })

      // Always fetch engine version if we have a selected service
      const serviceName = computeServices.find(s => s.id === serviceToSelect)?.name || ''
      const serviceVersion = computeServices.find(s => s.id === serviceToSelect)?.version || 1
      if (serviceName) {
        console.log('[Connect] Fetching engine version for:', serviceName)
        fetchEngineVersion(serviceName, serviceToSelect, serviceVersion)

        // Check actual resource link and store it for display
        const actualLink = await getServiceConfigStoreLink(serviceToSelect, serviceVersion, fastlyFetch)
        if (actualLink) {
          const linkedStoreName = stores.find(s => s.id === actualLink.resourceId)?.name || actualLink.resourceId
          setResourceLinkInfo({ storeId: actualLink.resourceId, storeName: linkedStoreName })
          console.log(`[Connect] Service "${serviceName}" security_rules link points to: ${linkedStoreName} (${actualLink.resourceId})`)
          if (actualLink.resourceId !== foundSharedStoreId) {
            console.warn(`[Connect] WARNING: Link mismatch! Expected ${CC_SHARED_STORE_NAME} but linked to ${linkedStoreName}`)
          }
        } else {
          setResourceLinkInfo(null)
          console.log(`[Connect] Service "${serviceName}" has no security_rules resource link`)
        }
      } else {
        console.log('[Connect] No service name found for:', serviceToSelect)
      }

      // Load rules from store if available
      if (storeToSelect && onLoadRules) {
        await loadRulesFromStore(storeToSelect, serviceToSelect, serviceName)
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

  const loadRulesFromStore = async (storeId: string, serviceId: string, serviceName: string) => {
    if (!onLoadRules) return

    try {
      // Key is just the service ID, value is CcPayload JSON
      const url = `${FASTLY_API_BASE}/resources/stores/config/${storeId}/item/${encodeURIComponent(serviceId)}`
      console.log('[Load] Fetching from:', url)
      const response = await fetch(url, {
        headers: { 'Fastly-Key': apiToken, 'Accept': 'application/json' },
      })
      console.log('[Load] Response status:', response.status)

      if (response.ok) {
        const itemData = await response.json()
        const itemValue = itemData?.value || itemData?.item_value
        // Parse the CcPayload JSON
        const payload: CcPayload = itemValue ? JSON.parse(itemValue) : null
        const compressedRules = payload?.rules_packed
        if (compressedRules) {
          const decompressed = await decompressRules(compressedRules)
          const graphData = JSON.parse(decompressed)

          if (graphData.nodes && graphData.edges) {
            console.log('[Load] Loaded graph - nodes:', graphData.nodes.length, 'edges:', graphData.edges.length)
            onLoadRules(graphData.nodes, graphData.edges)
            setStatus(`Loaded ${graphData.nodes.length} nodes from ${serviceName}`)
            // Flag to capture deployed hash from React state after render
            setShouldCaptureDeployedHash(true)
          } else {
            onLoadRules([], [])
            setStatus(`Selected ${serviceName} (no rules deployed yet)`)
            setDeployedRulesHash(null)
          }
        } else {
          onLoadRules([], [])
          setStatus(`Selected ${serviceName} (no rules deployed yet)`)
          setDeployedRulesHash(null)
        }
      } else {
        onLoadRules([], [])
        setStatus(`Selected ${serviceName} (no rules deployed yet)`)
        setDeployedRulesHash(null)
      }
    } catch (err) {
      console.error('[Load] Error:', err)
      onLoadRules([], [])
      setStatus(`Selected ${serviceName}`)
      setDeployedRulesHash(null)
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
      sharedStoreId: null,
      serviceDomain: null,
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

  const handleServiceChange = async (serviceId: string) => {
    console.log('[Load] Service changed to:', serviceId)
    const service = services.find(s => s.id === serviceId)
    const linkedStore = service?.linkedConfigStore || ''
    console.log('[Load] Linked store:', linkedStore)
    // Clear cached domain when service changes - will be re-fetched
    setServiceDomain(null)
    updateFastlyState({
      selectedService: serviceId,
      selectedConfigStore: linkedStore,
    })
    saveSettings({ apiToken, selectedService: serviceId, selectedConfigStore: linkedStore })

    // Navigate to the service URL
    navigateToService(serviceId)

    if (service?.name) {
      console.log('[ServiceChange] Fetching engine version for:', service.name)
      fetchEngineVersion(service.name, service.id, service.version)
    } else {
      console.log('[ServiceChange] No service name found for:', serviceId)
    }

    if (linkedStore) {
      setLoading(true)
      setStatus('Loading rules from Config Store...')
      await loadRulesFromStore(linkedStore, serviceId, service?.name || '')
      setLoading(false)
    } else if (service) {
      if (onLoadRules) {
        onLoadRules([], [])
      }
      setStatus('')
    }
  }

  const handleRefreshService = async () => {
    // Full refresh: services list, config stores, and engine version
    await handleConnect()
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

      // Use shared config store for all services
      const { id: configStoreId, created: storeCreated } = await findOrCreateConfigStore(
        CC_SHARED_STORE_NAME,
        configStores,
        fastlyFetch
      )

      setCreateProgress(storeCreated ? 'Linking shared Config Store to service...' : 'Using shared Config Store...')

      const existingLink = await getServiceConfigStoreLink(service.id, versionToUse, fastlyFetch)
      if (!existingLink) {
        // No existing link - create one
        await fastlyFetch(`/service/${service.id}/version/${versionToUse}/resource`, {
          method: 'POST',
          body: JSON.stringify({ resource_id: configStoreId, name: 'security_rules' }),
        })
      } else if (existingLink.resourceId !== configStoreId) {
        // Existing link points to wrong store - delete and recreate
        console.log('[ConfigStore] Updating resource link from old store to shared store...')
        await fastlyFetch(`/service/${service.id}/version/${versionToUse}/resource/${existingLink.linkName}`, {
          method: 'DELETE',
        })
        await fastlyFetch(`/service/${service.id}/version/${versionToUse}/resource`, {
          method: 'POST',
          body: JSON.stringify({ resource_id: configStoreId, name: 'security_rules' }),
        })
      } else {
        console.log('[ConfigStore] Store already linked to service, skipping link step')
      }

      setCreateProgress('Activating service version...')
      await fastlyFetch(`/service/${service.id}/version/${versionToUse}/activate`, { method: 'PUT' })

      setCreateProgress('Creating CC payload entry...')
      const payload: CcPayload = {
        version: CC_ENGINE_VERSION,
        deployedAt: new Date().toISOString(),
        rules_packed: '',  // Empty until rules are deployed
      }
      const payloadFormData = new URLSearchParams()
      payloadFormData.append('item_value', JSON.stringify(payload))

      // Key is just the service ID
      await fetch(`${FASTLY_API_BASE}/resources/stores/config/${configStoreId}/item/${encodeURIComponent(service.id)}`, {
        method: 'PUT',
        headers: { 'Fastly-Key': apiToken, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: payloadFormData.toString(),
      })

      // Update state with the new/existing shared store
      const updatedConfigStores = storeCreated
        ? [{ id: configStoreId, name: CC_SHARED_STORE_NAME, hasVceManifest: true }, ...configStores]
        : configStores.map(s => s.id === configStoreId ? { ...s, hasVceManifest: true } : s)

      updateFastlyState({
        services: services.map(s =>
          s.id === service.id ? { ...s, isCcEnabled: true, linkedConfigStore: configStoreId } : s
        ),
        configStores: updatedConfigStores,
        selectedConfigStore: configStoreId,
        sharedStoreId: configStoreId,
      })
      saveSettings({ apiToken, selectedService: service.id, selectedConfigStore: configStoreId })
      setStatus(`Config Store linked to "${service.name}"!`)

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

      // Use shared config store for all services
      const { id: configStoreId, created: storeCreated } = await findOrCreateConfigStore(
        CC_SHARED_STORE_NAME,
        configStores,
        fastlyFetch
      )

      setCreateProgress(storeCreated ? 'Linking shared Config Store to service...' : 'Using shared Config Store...')

      const existingLink = await getServiceConfigStoreLink(serviceId, serviceVersion, fastlyFetch)
      if (!existingLink) {
        await fastlyFetch(`/service/${serviceId}/version/${serviceVersion}/resource`, {
          method: 'POST',
          body: JSON.stringify({ resource_id: configStoreId, name: 'security_rules' }),
        })
      } else if (existingLink.resourceId !== configStoreId) {
        console.log('[ConfigStore] Updating resource link from old store to shared store...')
        await fastlyFetch(`/service/${serviceId}/version/${serviceVersion}/resource/${existingLink.linkName}`, {
          method: 'DELETE',
        })
        await fastlyFetch(`/service/${serviceId}/version/${serviceVersion}/resource`, {
          method: 'POST',
          body: JSON.stringify({ resource_id: configStoreId, name: 'security_rules' }),
        })
      }
      setCreateProgress('Adding domain...')

      const domain = generateDomainName(createForm.serviceName)
      await fastlyFetch(`/service/${serviceId}/version/${serviceVersion}/domain`, {
        method: 'POST',
        body: JSON.stringify({ name: domain }),
      })
      setCreateProgress('Building and uploading WASM package...')

      const packageB64 = await buildCcPackage(createForm.serviceName)
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
      setCreateProgress('Deploying CC payload...')

      const payload: CcPayload = {
        version: CC_ENGINE_VERSION,
        deployedAt: new Date().toISOString(),
        rules_packed: '',  // Empty until rules are deployed
      }
      const payloadFormData = new URLSearchParams()
      payloadFormData.append('item_value', JSON.stringify(payload))

      // Key is just the service ID
      await fetch(`${FASTLY_API_BASE}/resources/stores/config/${configStoreId}/item/${encodeURIComponent(serviceId)}`, {
        method: 'PUT',
        headers: { 'Fastly-Key': apiToken, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: payloadFormData.toString(),
      }).then(async (res) => {
        if (!res.ok) {
          const text = await res.text()
          throw new Error(`Payload creation failed: ${res.status} - ${text}`)
        }
        return res.json()
      })

      const newService: FastlyService = {
        id: serviceId,
        name: createForm.serviceName,
        type: 'wasm',
        version: serviceVersion,
        isCcEnabled: true,
        linkedConfigStore: configStoreId,
      }

      // Update state with the new/existing shared store
      const updatedConfigStores = storeCreated
        ? [{ id: configStoreId, name: CC_SHARED_STORE_NAME, hasVceManifest: true }, ...configStores]
        : configStores.map(s => s.id === configStoreId ? { ...s, hasVceManifest: true } : s)

      updateFastlyState({
        services: [newService, ...services],
        configStores: updatedConfigStores,
        selectedService: serviceId,
        selectedConfigStore: configStoreId,
        sharedStoreId: configStoreId,
      })
      saveSettings({ apiToken, selectedService: serviceId, selectedConfigStore: configStoreId })
      setShowCreateForm(false)
      setCreateForm({ serviceName: '' })
      setStatus(`Service "${createForm.serviceName}" created successfully!`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Service creation failed')
    } finally {
      setLoading(false)
      setCreateProgress(null)
    }
  }

  // Fix the resource link when it's pointing to the wrong store or missing
  const handleFixResourceLink = async () => {
    if (!selectedService || !sharedStoreId) {
      setError('Cannot fix link: shared store does not exist')
      return
    }

    setFixingLink(true)
    setError(null)

    try {
      const service = services.find(s => s.id === selectedService)
      if (!service) throw new Error('Service not found')

      // Get service versions
      const versions = await fastlyFetch(`/service/${service.id}/version`)
      const activeVersion = versions.find((v: { active: boolean }) => v.active)?.number
      const latestVersion = versions[versions.length - 1]?.number

      if (!activeVersion && !latestVersion) {
        throw new Error('No service versions found')
      }

      let versionToUse = activeVersion || latestVersion
      const versionData = await fastlyFetch(`/service/${service.id}/version/${versionToUse}`)

      // Clone if needed
      if (versionData.active || versionData.locked) {
        const clonedVersion = await fastlyFetch(`/service/${service.id}/version/${versionToUse}/clone`, {
          method: 'PUT',
        })
        versionToUse = clonedVersion.number
      }

      // Ensure the correct link exists - use create-first approach with retry
      const createLink = async () => {
        await fastlyFetch(`/service/${service.id}/version/${versionToUse}/resource`, {
          method: 'POST',
          body: JSON.stringify({ resource_id: sharedStoreId, name: 'security_rules' }),
        })
      }

      try {
        // Try to create the link
        await createLink()
        console.log('[FixLink] Created new link to shared store')
      } catch (createErr) {
        // 409 means link already exists - need to check and possibly replace it
        console.log('[FixLink] Create failed (likely 409), checking existing link...')

        const currentLink = await getServiceConfigStoreLink(service.id, versionToUse, fastlyFetch)
        if (currentLink?.resourceId === sharedStoreId) {
          // Link already points to correct store, we're good
          console.log('[FixLink] Existing link already points to correct store')
        } else if (currentLink) {
          // Link exists but points to wrong store - need to delete and recreate
          console.log('[FixLink] Existing link points to wrong store, deleting...')

          // Get all resource links to find the exact link ID
          const allLinks = await fastlyFetch(`/service/${service.id}/version/${versionToUse}/resource`)
          const linkToDelete = allLinks.find((l: { name: string }) => l.name === 'security_rules')

          if (linkToDelete?.id) {
            // Delete by numeric ID
            await fastlyFetch(`/service/${service.id}/version/${versionToUse}/resource/${linkToDelete.id}`, {
              method: 'DELETE',
            })
            console.log('[FixLink] Deleted old link, creating new one...')
            await createLink()
          } else {
            throw new Error('Could not find link ID to delete')
          }
        } else {
          // No link exists but create still failed - something else is wrong
          throw createErr
        }
      }

      // Activate the version
      await fastlyFetch(`/service/${service.id}/version/${versionToUse}/activate`, { method: 'PUT' })

      // Update local state
      setResourceLinkInfo({ storeId: sharedStoreId, storeName: CC_SHARED_STORE_NAME })
      setStatus('Resource link fixed successfully!')

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fix resource link')
    } finally {
      setFixingLink(false)
    }
  }

  const handleDeployRules = async () => {
    if (!sharedStoreId) {
      setError('Config store not found. Click refresh to reconnect.')
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
    setDeployProgress('Compressing rules...')

    try {
      // Use canonical graph (no React Flow internal fields) for deployment
      console.log('[Deploy] Nodes count:', canonicalGraph.nodes.length)
      console.log('[Deploy] Edges count:', canonicalGraph.edges.length)
      const compressed = await compressRules(JSON.stringify(canonicalGraph))
      console.log('[Deploy] Compressed length:', compressed.length)

      setDeployProgress('Computing verification hash...')
      const expectedHash = await computeRulesHash(compressed)
      console.log('[Deploy] Expected rules hash:', expectedHash)

      setDeployProgress('Uploading to Config Store...')
      // Combined payload: manifest fields + rules
      const payload: CcPayload = {
        version: CC_ENGINE_VERSION,
        deployedAt: new Date().toISOString(),
        rules_packed: compressed,
      }

      const payloadFormData = new URLSearchParams()
      payloadFormData.append('item_value', JSON.stringify(payload))

      // Key is just the service ID
      const response = await fetch(`${FASTLY_API_BASE}/resources/stores/config/${sharedStoreId}/item/${encodeURIComponent(selectedService)}`, {
        method: 'PUT',
        headers: { 'Fastly-Key': apiToken, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: payloadFormData.toString(),
      })
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to save payload: ${response.status} - ${errorText}`)
      }

      updateFastlyState({
        services: services.map(s =>
          s.id === selectedService ? { ...s, isCcEnabled: true, linkedConfigStore: sharedStoreId } : s
        ),
        configStores: configStores.map(s =>
          s.id === sharedStoreId ? { ...s, hasVceManifest: true } : s
        ),
      })

      const storeName = configStores.find(s => s.id === sharedStoreId)?.name
      const service = services.find(s => s.id === selectedService)
      console.log('[Deploy] Config Store updated, starting verification...')
      setStatus(`Deployed to ${storeName}, verifying...`)
      setDeployStatus('verifying')
      setDeployProgress('Waiting for edge propagation...')

      // Use cached domain, or fetch it, or fall back to generated name
      let domain = serviceDomain
      if (!domain && service) {
        const fetchedDomain = await getServiceDomain(service.id, service.version, fastlyFetch)
        if (fetchedDomain) {
          domain = fetchedDomain
          setServiceDomain(fetchedDomain)
        }
      }
      domain = domain || generateDomainName(service?.name || '')
      console.log('[Deploy] Using domain for verification:', domain)
      const maxAttempts = 60
      const pollInterval = 2000
      const verifyStartTime = Date.now()

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          // Only show progress after first attempt - avoids flash on quick verify
          if (attempt > 1) {
            setDeployProgress(`Verifying (${attempt}/${maxAttempts})...`)
          }
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
              // Mark current graph as in sync - use flag to capture from same React state
              setShouldCaptureDeployedHash(true)
              return
            } else {
              console.log(`[Deploy] Still propagating: edge has ${versionData.rules_hash?.slice(0, 8) || 'none'}, waiting for ${expectedHash.slice(0, 8)}`)
            }
          } else {
            console.log(`[Deploy] HTTP ${versionResponse.status}`)
          }
        } catch (pollErr) {
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
            <Card.Section style={{ padding: '4px 12px', background: 'var(--COLOR--surface--secondary)' }}>
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
                  <Text span className="cc-text-muted">Engine:</Text> {localEngineVersion.engine} v{localEngineVersion.version}
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
                <Text size="xs" className="cc-text-muted">
                  Run <code style={{ background: 'var(--COLOR--surface--tertiary)', padding: '2px 4px', borderRadius: '2px' }}>make serve</code> to start
                </Text>
              )}
            </Box>
          </Card>
        </Box>

        {/* Deploy Rules Card */}
        <Box mb="md">
          <Card withBorder radius="md" padding={0}>
            <Card.Section style={{ padding: '4px 12px', background: 'var(--COLOR--surface--secondary)' }}>
              <Flex align="center" gap="sm">
                <Box>
                  <Title order={5}>Save Rules</Title>
                  <Text size="xs" className="cc-text-muted">Export to local file system</Text>
                </Box>
              </Flex>
            </Card.Section>

            <Box style={{ padding: '12px' }}>
              <Flex gap="md" style={{ marginBottom: '12px' }}>
                <Text size="sm"><Text span weight="bold">{nodes.length}</Text> <Text span className="cc-text-muted">nodes</Text></Text>
                <Text size="sm"><Text span weight="bold">{edges.length}</Text> <Text span className="cc-text-muted">edges</Text></Text>
              </Flex>

              <Button variant="filled" leftSection={<IconUpload width={16} height={16} />} onClick={handleDeployLocal} disabled={loading} fullWidth>
                {loading ? 'Saving...' : 'Save Rules Locally'}
              </Button>

              {localComputeRunning && (
                <Text size="xs" className="cc-text-muted" style={{ marginTop: '8px', fontStyle: 'italic' }}>
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
              <Card.Section style={{ padding: '4px 12px', background: 'var(--COLOR--surface--secondary)' }}>
                <Title order={5}>Test URLs</Title>
              </Card.Section>

              <Box style={{ padding: '12px' }}>
                <Stack gap="xs">
                  <Flex justify="space-between" align="center">
                    <Anchor href="http://127.0.0.1:7676/_version" target="_blank" size="xs">
                      /_version
                    </Anchor>
                    <Text size="xs" className="cc-text-muted">Engine info</Text>
                  </Flex>
                  <Flex justify="space-between" align="center">
                    <Anchor href="http://127.0.0.1:7676/" target="_blank" size="xs">
                      /
                    </Anchor>
                    <Text size="xs" className="cc-text-muted">Test request</Text>
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
        <Text size="sm" className="cc-text-muted" style={{ marginBottom: '12px' }}>
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
          <Text size="xs" className="cc-text-muted" style={{ marginTop: '4px' }}>
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
          <Text size="xs" className="cc-text-muted">OR</Text>
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
            <Card.Section style={{ padding: '4px 12px', background: 'var(--COLOR--surface--secondary)' }}>
              <Flex justify="space-between" align="center">
                <Title order={5}>New Compute Service</Title>
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
                  onChange={(e) => setCreateForm({ serviceName: e.target.value })}
                  placeholder="my-cc-service"
                />
              </Box>

              {createProgress && (
                <Text size="xs" style={{ fontFamily: 'monospace', marginBottom: '12px' }}>{createProgress}</Text>
              )}

              <Text size="xs" className="cc-text-muted" style={{ marginBottom: '12px' }}>
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
            + Create New Compute Service
          </Button>
        </Box>
      )}

      {/* Service Selection */}
      <Box mb="md">
        <Text size="sm" style={{ fontWeight: 500, marginBottom: '4px' }}>Compute Service</Text>

        {services.length === 0 ? (
          <Box p="sm" style={{ border: '1px solid var(--COLOR--border--primary)', borderRadius: '6px' }}>
            <Text size="sm" className="cc-text-muted">No Compute services found. Create one above.</Text>
          </Box>
        ) : (
          <Select
            data={[
              // Configured services first (sorted by name)
              ...services
                .filter(s => s.isCcEnabled)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(s => ({ value: s.id, label: s.name })),
              // Then non-configured services (sorted by name, marked with ⚠)
              ...services
                .filter(s => !s.isCcEnabled)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(s => ({ value: s.id, label: `⚠ ${s.name}` })),
            ]}
            value={selectedService || undefined}
            onChange={(value) => value && handleServiceChange(value)}
            placeholder="Select a Compute service..."
          />
        )}

        {/* Warning only when deploying will make destructive changes */}
        {selectedService && (
          // Show warning if engine needs deploying OR config store link needs changing
          (engineVersion?.version !== CC_ENGINE_VERSION || resourceLinkInfo?.storeName !== CC_SHARED_STORE_NAME)
        ) && (
          <Alert variant="caution" icon={<IconAttentionFilled width={16} height={16} />} style={{ marginTop: 8 }}>
            <Text size="xs">
              <strong>Warning:</strong> Deploying will{' '}
              {engineVersion?.version !== CC_ENGINE_VERSION && 'replace this service\'s WASM binary'}
              {engineVersion?.version !== CC_ENGINE_VERSION && resourceLinkInfo?.storeName !== CC_SHARED_STORE_NAME && ' and '}
              {resourceLinkInfo?.storeName !== CC_SHARED_STORE_NAME && 'change the config store link'}
              .
            </Text>
          </Alert>
        )}
      </Box>

      {/* Service Info - Consolidated view */}
      {selectedService && (() => {
        const service = services.find(s => s.id === selectedService)
        if (!service) return null
        const displayDomain = serviceDomain || generateDomainName(service.name)
        const serviceUrl = `https://${displayDomain}`
        const validation = validateGraph(nodes, edges)
        const canDeploy = validation.valid && sharedStoreId && selectedService

        return (
          <Box mb="md">
            <Card withBorder radius="md" padding={0}>
              <Card.Section style={{ padding: '4px 12px', background: 'var(--COLOR--surface--secondary)' }}>
                <Flex justify="space-between" align="center">
                  <Title order={5}>Service Info</Title>
                  <ActionIcon variant="subtle" onClick={handleRefreshService} loading={engineVersionLoading}>
                    <IconSync width={16} height={16} />
                  </ActionIcon>
                </Flex>
              </Card.Section>

              <Stack gap="sm" style={{ padding: '12px' }}>
                {/* Service ID */}
                <Flex align="center" justify="space-between">
                  <Text size="xs" className="cc-text-muted">Service ID</Text>
                  <Flex align="center" gap="xs">
                    <Text size="xs" style={{ fontFamily: 'monospace' }}>{service.id}</Text>
                    <ActionIcon variant="subtle" size="xs" onClick={() => navigator.clipboard.writeText(service.id)}>
                      <IconCopy width={12} height={12} />
                    </ActionIcon>
                  </Flex>
                </Flex>

                {/* Test URL */}
                <Flex align="center" justify="space-between">
                  <Text size="xs" className="cc-text-muted">Test URL</Text>
                  <Anchor href={serviceUrl} target="_blank" size="xs">
                    {displayDomain}
                  </Anchor>
                </Flex>

                <Divider />

                {/* Config Store */}
                <Flex align="center" justify="space-between">
                  <Text size="xs" className="cc-text-muted">Config Store</Text>
                  {resourceLinkInfo?.storeName === CC_SHARED_STORE_NAME ? (
                    <Flex align="center" gap={4}>
                      <IconCheckCircleFilled width={14} height={14} style={{ color: 'var(--COLOR--success--text)' }} />
                      <Text size="xs" style={{ fontFamily: 'monospace' }}>{CC_SHARED_STORE_NAME}</Text>
                    </Flex>
                  ) : !sharedStoreId ? (
                    <Button size="compact-sm" variant="light" onClick={handleSetupConfigStore} loading={!!createProgress}>
                      Create Store
                    </Button>
                  ) : resourceLinkInfo ? (
                    <Flex align="center" gap={4}>
                      <IconAttentionFilled width={14} height={14} style={{ color: 'var(--COLOR--error--text)' }} />
                      <Button size="compact-sm" variant="light" color="red" onClick={handleFixResourceLink} loading={fixingLink}>
                        Fix Link
                      </Button>
                    </Flex>
                  ) : (
                    <Flex align="center" gap={4}>
                      <IconAttentionFilled width={14} height={14} style={{ color: 'var(--COLOR--caution--text)' }} />
                      <Button size="compact-sm" variant="light" color="yellow" onClick={handleFixResourceLink} loading={fixingLink}>
                        Connect
                      </Button>
                    </Flex>
                  )}
                </Flex>

                {/* Engine Version */}
                <Flex align="center" justify="space-between">
                  <Text size="xs" className="cc-text-muted">Engine</Text>
                  {engineVersionLoading ? (
                    <Loader size="xs" />
                  ) : engineUpdateProgress ? (
                    <Text size="xs" style={{ fontFamily: 'monospace' }}>{engineUpdateProgress}</Text>
                  ) : engineVersion?.version === CC_ENGINE_VERSION ? (
                    <Flex align="center" gap={4}>
                      <IconCheckCircleFilled width={14} height={14} style={{ color: 'var(--COLOR--success--text)' }} />
                      <Text size="xs">v{CC_ENGINE_VERSION}</Text>
                    </Flex>
                  ) : engineVersion ? (
                    <Flex align="center" gap={4}>
                      <IconAttentionFilled width={14} height={14} style={{ color: 'var(--COLOR--caution--text)' }} />
                      <Button size="compact-sm" variant="light" color="orange" onClick={handleUpdateEngine}>
                        Update to v{CC_ENGINE_VERSION}
                      </Button>
                    </Flex>
                  ) : (
                    <Button size="compact-sm" variant="light" onClick={handleUpdateEngine}>
                      Deploy Engine
                    </Button>
                  )}
                </Flex>

                {/* Rules Info */}
                <Flex align="center" justify="space-between">
                  <Text size="xs" className="cc-text-muted">Rules</Text>
                  <Flex align="center" gap="xs">
                    {engineVersion && (engineVersion.nodes_count ?? 0) > 0 ? (
                      <>
                        <Text size="xs">{engineVersion.nodes_count} nodes · {engineVersion.edges_count} edges</Text>
                        <Text size="xs" className="cc-text-muted">({engineVersion.rules_hash?.slice(0, 8)})</Text>
                      </>
                    ) : (
                      <Text size="xs" className="cc-text-muted">No rules deployed</Text>
                    )}
                    <Tooltip label="Export graph.json" position="left">
                      <ActionIcon variant="subtle" size="xs" disabled={!validation.valid} onClick={() => {
                        if (!validation.valid) return
                        const graphPayload = { nodes, edges }
                        const blob = new Blob([JSON.stringify(graphPayload, null, 2)], { type: 'application/json' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = 'graph.json'
                        document.body.appendChild(a)
                        a.click()
                        document.body.removeChild(a)
                        URL.revokeObjectURL(url)
                      }}>
                        <IconDownload width={12} height={12} />
                      </ActionIcon>
                    </Tooltip>
                  </Flex>
                </Flex>

                <Divider />

                {/* Validation Errors */}
                {!validation.valid && (
                  <Box style={{ padding: '8px', borderRadius: '6px', background: 'var(--COLOR--error--surface--secondary)' }}>
                    <Text size="xs" style={{ color: 'var(--COLOR--error--text)', fontWeight: 500, marginBottom: '4px' }}>
                      Fix to deploy:
                    </Text>
                    {validation.errors.slice(0, 3).map((err, i) => (
                      <Text key={i} size="xs" style={{ color: 'var(--COLOR--error--text)' }}>• {err}</Text>
                    ))}
                    {validation.errors.length > 3 && (
                      <Text size="xs" style={{ color: 'var(--COLOR--error--text)' }}>• +{validation.errors.length - 3} more</Text>
                    )}
                  </Box>
                )}

                {/* Graph Stats (current canvas) */}
                <Flex align="center" justify="space-between">
                  <Text size="xs" className="cc-text-muted">Canvas</Text>
                  <Flex align="center" gap="xs">
                    <Text size="xs">{nodes.length} nodes · {edges.length} edges</Text>
                    {isGraphInSync ? (
                      <Badge size="xs" color="green" variant="light">synced</Badge>
                    ) : isGraphModified ? (
                      <Badge size="xs" color="orange" variant="light">modified</Badge>
                    ) : null}
                  </Flex>
                </Flex>

                {/* Deploy Button */}
                <Button
                  variant="filled"
                  color={
                    deployStatus === 'verified' ? 'green' :
                    deployStatus === 'error' ? 'red' :
                    deployStatus === 'timeout' ? 'orange' :
                    !validation.valid ? 'gray' :
                    isGraphModified ? 'orange' : undefined
                  }
                  onClick={handleDeployRules}
                  disabled={!canDeploy || deployStatus === 'deploying' || deployStatus === 'verifying' || isGraphInSync}
                  fullWidth
                >
                  {(deployStatus === 'deploying' || deployStatus === 'verifying') ? (
                    <Flex align="center" gap="xs" justify="center">
                      <Loader size="xs" color="white" />
                      <Text size="xs" style={{ color: 'white', whiteSpace: 'nowrap' }}>{deployProgress || 'Deploying...'}</Text>
                    </Flex>
                  ) : deployStatus === 'verified' ? 'Deployed ✓' :
                   deployStatus === 'timeout' ? 'Deployed (propagating...)' :
                   deployStatus === 'error' ? 'Deploy Failed' :
                   !validation.valid ? 'Fix Issues to Deploy' :
                   isGraphInSync ? 'Deployed ✓' :
                   'Deploy Rules'}
                </Button>
              </Stack>
            </Card>
          </Box>
        )
      })()}

      {/* Status/Error Messages - only show non-deployment messages */}
      {error && (
        <Alert variant="error" icon={<IconAttentionFilled width={16} height={16} />}>{error}</Alert>
      )}
      {status && !error && !status.includes('Loaded') && !status.includes('Deployed') && !status.includes('verifying') && (
        <Alert variant="success" icon={<IconCheckCircleFilled width={16} height={16} />}>{status}</Alert>
      )}
    </Box>
  )
}
