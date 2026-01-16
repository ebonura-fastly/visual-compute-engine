/**
 * Converts visual editor graph format to Fastly Compute rule engine JSON format.
 *
 * The editor uses React Flow's node/edge format, while the compute service
 * expects the rule engine's JSON format with conditions and actions.
 */

import type { Node, Edge } from '@xyflow/react'

// ============================================================================
// Compute Rule Engine Types (matches compute/src/rules/types.rs)
// ============================================================================

export interface ComputeRule {
  enabled: boolean
  conditions: ComputeCondition
  action: ComputeAction
}

export interface ComputeCondition {
  operator: 'and' | 'or' | 'not'
  rules: ComputeConditionRule[]
}

export type ComputeConditionRule =
  | { type: 'path'; operator: StringOperator; value: string }
  | { type: 'ip'; operator: IpOperator; value: string[] }
  | { type: 'device'; operator: DeviceOperator; value: string }
  | { type: 'useragent'; operator: StringOperator; value: string }
  | { type: 'header'; key: string; operator: HeaderOperator }
  | { type: 'ratelimit'; window: RateWindow; max_requests: number; block_ttl: number; counter_name?: string; penaltybox_name?: string }

type StringOperator = 'equals' | 'startswith' | 'contains' | 'matches'
type IpOperator = 'equals' | 'inrange'
type DeviceOperator = 'is' | 'isnot'
type HeaderOperator = 'exists' | 'notexists' | 'equals' | 'contains'
type RateWindow = '1s' | '10s' | '60s'

export interface ComputeAction {
  type: 'block' | 'challenge' | 'allow' | 'log'
  response_code?: number
  response_message?: string
  challenge_type?: string
}

// ============================================================================
// Editor Node Types
// ============================================================================

interface ConditionNodeData {
  field: string
  operator: string
  value: string
}

interface LogicNodeData {
  operation: 'AND' | 'OR' | 'NOT'
}

interface ActionNodeData {
  action: 'block' | 'allow' | 'challenge' | 'log'
  statusCode?: number
  message?: string
}

// ============================================================================
// Backend Configuration Types
// ============================================================================

export interface BackendConfig {
  name: string
  host: string
  port?: number
  useTls?: boolean
  sniHostname?: string
}

export interface ServiceConfig {
  name: string
  backends: BackendConfig[]
  defaultBackend: string
  configStoreName: string
  logEndpoint?: string
  authSecret?: string
}

// ============================================================================
// Conversion Functions
// ============================================================================

/**
 * Converts a visual graph into a set of Compute-compatible rules.
 *
 * The conversion process:
 * 1. Find all action nodes (terminal nodes)
 * 2. For each action, trace back through the graph to collect conditions
 * 3. Build the condition tree based on logic nodes (AND/OR/NOT)
 * 4. Generate rule JSON for each action path
 */
export function convertGraphToComputeRules(
  nodes: Node[],
  edges: Edge[]
): { rules: Record<string, ComputeRule>; ruleList: string[] } {
  const rules: Record<string, ComputeRule> = {}
  const ruleList: string[] = []

  // Find all action nodes
  const actionNodes = nodes.filter(n => n.type === 'action')

  for (const actionNode of actionNodes) {
    const ruleName = `rule_${actionNode.id}`
    const actionData = actionNode.data as unknown as ActionNodeData

    // Trace back to find all conditions leading to this action
    const { conditions, operator } = traceConditionsBack(actionNode.id, nodes, edges)

    if (conditions.length === 0) {
      // No conditions - skip this rule (always-triggered rules need at least one condition)
      continue
    }

    rules[ruleName] = {
      enabled: true,
      conditions: {
        operator: operator.toLowerCase() as 'and' | 'or' | 'not',
        rules: conditions
      },
      action: convertAction(actionData)
    }

    ruleList.push(ruleName)
  }

  return { rules, ruleList }
}

/**
 * Traces back from an action node to collect all conditions.
 */
function traceConditionsBack(
  actionId: string,
  nodes: Node[],
  edges: Edge[]
): { conditions: ComputeConditionRule[]; operator: 'AND' | 'OR' | 'NOT' } {
  const conditions: ComputeConditionRule[] = []
  let operator: 'AND' | 'OR' | 'NOT' = 'AND' // Default

  // Build adjacency list (reverse - target to sources)
  const incoming = new Map<string, string[]>()
  for (const edge of edges) {
    const sources = incoming.get(edge.target) || []
    sources.push(edge.source)
    incoming.set(edge.target, sources)
  }

  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  // BFS from action node backwards
  const visited = new Set<string>()
  const queue = [actionId]

  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)

    const node = nodeMap.get(current)
    if (!node) continue

    // Process node based on type
    if (node.type === 'logic') {
      const logicData = node.data as unknown as LogicNodeData
      operator = logicData.operation
    } else if (node.type === 'condition') {
      const condData = node.data as unknown as ConditionNodeData
      const rule = convertCondition(condData)
      if (rule) {
        conditions.push(rule)
      }
    }

    // Add incoming nodes to queue
    const sources = incoming.get(current) || []
    for (const source of sources) {
      if (!visited.has(source)) {
        queue.push(source)
      }
    }
  }

  return { conditions, operator }
}

/**
 * Converts editor condition data to compute rule format.
 */
function convertCondition(data: ConditionNodeData): ComputeConditionRule | null {
  const { field, operator, value } = data

  // Map editor operators to compute operators
  const opMap: Record<string, StringOperator> = {
    'equals': 'equals',
    'startsWith': 'startswith',
    'contains': 'contains',
    'matches': 'matches'
  }

  switch (field) {
    case 'path':
      return {
        type: 'path',
        operator: opMap[operator] || 'equals',
        value
      }

    case 'ip':
    case 'clientIp':
      return {
        type: 'ip',
        operator: operator === 'inRange' ? 'inrange' : 'equals',
        value: value.split(',').map(v => v.trim())
      }

    case 'userAgent':
      return {
        type: 'useragent',
        operator: opMap[operator] || 'contains',
        value
      }

    case 'country':
      // Country checks use IP rules with special handling
      return {
        type: 'path', // We'll use path as a proxy for now
        operator: 'equals',
        value: `country:${value}`
      }

    case 'method':
      return {
        type: 'header',
        key: ':method',
        operator: 'equals'
      }

    default:
      // Treat unknown fields as header checks
      return {
        type: 'header',
        key: field,
        operator: 'exists'
      }
  }
}

/**
 * Converts editor action data to compute action format.
 */
function convertAction(data: ActionNodeData): ComputeAction {
  switch (data.action) {
    case 'block':
      return {
        type: 'block',
        response_code: data.statusCode || 403,
        response_message: data.message || 'Blocked by security rule'
      }

    case 'challenge':
      return {
        type: 'challenge',
        challenge_type: 'javascript'
      }

    case 'allow':
      return {
        type: 'allow'
      }

    case 'log':
      return {
        type: 'log',
        response_message: data.message || 'Security event logged'
      }

    default:
      return {
        type: 'block',
        response_code: 403
      }
  }
}

// ============================================================================
// Export Functions
// ============================================================================

/**
 * Generates the full Fastly Config Store content for deployment.
 */
export function generateConfigStoreContent(
  nodes: Node[],
  edges: Edge[],
  _config: ServiceConfig
): Record<string, string> {
  const { rules, ruleList } = convertGraphToComputeRules(nodes, edges)

  const content: Record<string, string> = {
    'rule_list': ruleList.join(',')
  }

  // Add each rule as JSON
  for (const [name, rule] of Object.entries(rules)) {
    content[name] = JSON.stringify(rule)
  }

  return content
}

/**
 * Generates a fastly.toml snippet for the service configuration.
 */
export function generateFastlyToml(config: ServiceConfig): string {
  let toml = `# Visual Compute Engine Configuration
# Generated by VCE Editor

name = "${config.name}"
authors = ["Fastly"]
language = "rust"
manifest_version = 3

[local_server]
`

  // Add backends
  for (const backend of config.backends) {
    toml += `
  [local_server.backends.${backend.name}]
  url = "${backend.useTls ? 'https' : 'http'}://${backend.host}${backend.port ? `:${backend.port}` : ''}"
`
  }

  // Add config stores
  toml += `
  [local_server.config_stores.${config.configStoreName}]
  file = "config/${config.configStoreName}.json"
`

  if (config.authSecret) {
    toml += `
  [local_server.config_stores.vce_shared_secret]
  file = "config/vce_shared_secret.json"
`
  }

  return toml
}

/**
 * Validates the graph before export.
 *
 * Minimum valid graph: Request → Backend (pass-through to origin)
 * Action and Condition nodes are optional (for security rules)
 */
export function validateGraph(nodes: Node[], edges: Edge[]): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Check for entry point (Request node) - REQUIRED
  const hasRequest = nodes.some(n => n.type === 'request')
  if (!hasRequest) {
    errors.push('Graph must have a Request node (entry point)')
  }

  // Check for at least one Backend node - REQUIRED
  const hasBackend = nodes.some(n => n.type === 'backend')
  if (!hasBackend) {
    errors.push('Graph must have at least one Backend node')
  }

  // Check that Request node has outgoing connections
  const requestNodes = nodes.filter(n => n.type === 'request')
  for (const req of requestNodes) {
    const hasOutgoing = edges.some(e => e.source === req.id)
    if (!hasOutgoing) {
      errors.push('Request node is not connected to any downstream node')
    }
  }

  // Check that Backend nodes have incoming connections
  const backendNodes = nodes.filter(n => n.type === 'backend')
  for (const backend of backendNodes) {
    const hasIncoming = edges.some(e => e.target === backend.id)
    if (!hasIncoming) {
      const name = (backend.data as { name?: string })?.name || backend.id
      errors.push(`Backend "${name}" has no incoming connections`)
    }
  }

  // Check that action nodes (if any) have incoming connections
  const actionNodes = nodes.filter(n => n.type === 'action')
  for (const action of actionNodes) {
    const hasIncoming = edges.some(e => e.target === action.id)
    if (!hasIncoming) {
      errors.push(`Action node ${action.id} has no incoming connections`)
    }
  }

  // Check for disconnected condition nodes (if any)
  const conditionNodes = nodes.filter(n => n.type === 'condition')
  for (const cond of conditionNodes) {
    const hasOutgoing = edges.some(e => e.source === cond.id)
    if (!hasOutgoing) {
      errors.push(`Condition node ${cond.id} is not connected to any downstream node`)
    }
  }

  return { valid: errors.length === 0, errors }
}

// ============================================================================
// Compression Functions
// ============================================================================

// Config Store limits (from Fastly docs):
// - Key: 256 chars max
// - Value: 8000 UTF-8 chars max
// - Entries: 500 per store (paid accounts)
const CONFIG_STORE_VALUE_LIMIT = 8000

/**
 * Compresses a string using the browser's CompressionStream API (gzip).
 * Returns base64-encoded compressed data.
 */
export async function compressRules(json: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(json)

  // Use CompressionStream if available (modern browsers)
  if (typeof CompressionStream !== 'undefined') {
    const cs = new CompressionStream('gzip')
    const writer = cs.writable.getWriter()
    writer.write(data)
    writer.close()

    const compressedChunks: Uint8Array[] = []
    const reader = cs.readable.getReader()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      compressedChunks.push(value)
    }

    // Concatenate chunks
    const totalLength = compressedChunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const compressed = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of compressedChunks) {
      compressed.set(chunk, offset)
      offset += chunk.length
    }

    // Convert to base64
    return btoa(String.fromCharCode(...compressed))
  }

  // Fallback: return uncompressed with marker
  return `raw:${btoa(json)}`
}

/**
 * Decompresses base64-encoded gzip data back to a string.
 * Used for testing/preview in the browser.
 */
export async function decompressRules(compressed: string): Promise<string> {
  // Handle raw (uncompressed) fallback
  if (compressed.startsWith('raw:')) {
    return atob(compressed.slice(4))
  }

  // Decode base64
  const binaryString = atob(compressed)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  // Decompress using DecompressionStream
  if (typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('gzip')
    const writer = ds.writable.getWriter()
    writer.write(bytes)
    writer.close()

    const decompressedChunks: Uint8Array[] = []
    const reader = ds.readable.getReader()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      decompressedChunks.push(value)
    }

    // Concatenate and decode
    const totalLength = decompressedChunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const decompressed = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of decompressedChunks) {
      decompressed.set(chunk, offset)
      offset += chunk.length
    }

    return new TextDecoder().decode(decompressed)
  }

  throw new Error('DecompressionStream not available')
}

// ============================================================================
// Reverse Conversion: Compute Rules to Editor Graph
// ============================================================================

/** Packed rules format stored in Config Store */
export interface PackedRules {
  v: string
  r: string[]
  d: Record<string, ComputeRule>
}

/**
 * Converts packed rules from Config Store back to visual editor format.
 * This enables loading existing rules when selecting a VCE service.
 */
export function convertComputeRulesToGraph(
  packedRules: PackedRules
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  let nodeIdCounter = 1
  const nextId = () => `node_${nodeIdCounter++}`

  // Starting position for layout
  let yOffset = 100
  const xCondition = 100
  const xLogic = 350
  const xAction = 600
  const rowHeight = 180

  for (const ruleName of packedRules.r) {
    const rule = packedRules.d[ruleName]
    if (!rule || !rule.enabled) continue

    const conditionNodeIds: string[] = []

    // Create condition nodes
    for (const condRule of rule.conditions.rules) {
      const condId = nextId()
      const condData = reverseCondition(condRule)

      if (condData) {
        nodes.push({
          id: condId,
          type: 'condition',
          position: { x: xCondition, y: yOffset + conditionNodeIds.length * 80 },
          data: condData as unknown as Record<string, unknown>,
        })
        conditionNodeIds.push(condId)
      }
    }

    // Create logic node if multiple conditions
    let logicNodeId: string | null = null
    if (conditionNodeIds.length > 1) {
      logicNodeId = nextId()
      nodes.push({
        id: logicNodeId,
        type: 'logic',
        position: { x: xLogic, y: yOffset + (conditionNodeIds.length - 1) * 40 },
        data: { operation: rule.conditions.operator.toUpperCase() as 'AND' | 'OR' | 'NOT' } as unknown as Record<string, unknown>,
      })

      // Connect conditions to logic
      for (const condId of conditionNodeIds) {
        edges.push({
          id: `edge_${condId}_${logicNodeId}`,
          source: condId,
          target: logicNodeId,
          sourceHandle: 'output',
          targetHandle: 'input',
        })
      }
    }

    // Create action node
    const actionId = nextId()
    const actionData = reverseAction(rule.action)
    nodes.push({
      id: actionId,
      type: 'action',
      position: { x: xAction, y: yOffset + (conditionNodeIds.length - 1) * 40 },
      data: actionData as unknown as Record<string, unknown>,
    })

    // Connect to action
    if (logicNodeId) {
      edges.push({
        id: `edge_${logicNodeId}_${actionId}`,
        source: logicNodeId,
        target: actionId,
        sourceHandle: 'output',
        targetHandle: 'input',
      })
    } else if (conditionNodeIds.length === 1) {
      edges.push({
        id: `edge_${conditionNodeIds[0]}_${actionId}`,
        source: conditionNodeIds[0],
        target: actionId,
        sourceHandle: 'output',
        targetHandle: 'input',
      })
    }

    yOffset += rowHeight + conditionNodeIds.length * 60
  }

  return { nodes, edges }
}

/**
 * Reverses a compute condition rule to editor format.
 */
function reverseCondition(rule: ComputeConditionRule): ConditionNodeData | null {
  // Operator mapping (reverse)
  const opMap: Record<string, string> = {
    'equals': 'equals',
    'startswith': 'startsWith',
    'contains': 'contains',
    'matches': 'matches',
    'inrange': 'inRange',
  }

  switch (rule.type) {
    case 'path':
      return {
        field: 'path',
        operator: opMap[rule.operator] || 'equals',
        value: rule.value,
      }

    case 'ip':
      return {
        field: 'clientIp',
        operator: rule.operator === 'inrange' ? 'inRange' : 'equals',
        value: rule.value.join(', '),
      }

    case 'useragent':
      return {
        field: 'userAgent',
        operator: opMap[rule.operator] || 'contains',
        value: rule.value,
      }

    case 'header':
      return {
        field: rule.key,
        operator: rule.operator === 'exists' ? 'exists' : 'equals',
        value: '',
      }

    case 'ratelimit':
      return {
        field: 'rateLimit',
        operator: 'exceeds',
        value: `${rule.max_requests}/${rule.window}`,
      }

    default:
      return null
  }
}

/**
 * Reverses a compute action to editor format.
 */
function reverseAction(action: ComputeAction): ActionNodeData {
  switch (action.type) {
    case 'block':
      return {
        action: 'block',
        statusCode: action.response_code || 403,
        message: action.response_message || 'Blocked',
      }

    case 'challenge':
      return {
        action: 'challenge',
      }

    case 'allow':
      return {
        action: 'allow',
      }

    case 'log':
      return {
        action: 'log',
        message: action.response_message,
      }

    default:
      return { action: 'block', statusCode: 403 }
  }
}

/**
 * Packs all rules into a single compressed payload for Config Store.
 * Format: gzip(JSON({ rules: [...], version: "1.0" })) -> base64
 *
 * This minimizes Config Store entries and maximizes compression
 * since all rules share common structure.
 */
export async function packRulesForConfigStore(
  nodes: Node[],
  edges: Edge[]
): Promise<{
  payload: string
  originalSize: number
  compressedSize: number
  compressionRatio: number
  fitsInConfigStore: boolean
}> {
  const { rules, ruleList } = convertGraphToComputeRules(nodes, edges)

  // Create a compact payload with all rules
  const payload = {
    v: '1.0', // version
    r: ruleList, // rule list (order matters)
    d: rules // rule definitions
  }

  const json = JSON.stringify(payload)
  const originalSize = new TextEncoder().encode(json).length

  const compressed = await compressRules(json)
  const compressedSize = compressed.length

  return {
    payload: compressed,
    originalSize,
    compressedSize,
    compressionRatio: Math.round((1 - compressedSize / originalSize) * 100),
    fitsInConfigStore: compressedSize <= CONFIG_STORE_VALUE_LIMIT
  }
}

/**
 * Generates Config Store content with compression.
 * Uses a single 'rules_packed' key with all rules compressed.
 */
export async function generateCompressedConfigStoreContent(
  nodes: Node[],
  edges: Edge[]
): Promise<{
  content: Record<string, string>
  stats: {
    originalSize: number
    compressedSize: number
    compressionRatio: number
    fitsInConfigStore: boolean
  }
}> {
  const packed = await packRulesForConfigStore(nodes, edges)

  return {
    content: {
      'rules_packed': packed.payload
    },
    stats: {
      originalSize: packed.originalSize,
      compressedSize: packed.compressedSize,
      compressionRatio: packed.compressionRatio,
      fitsInConfigStore: packed.fitsInConfigStore
    }
  }
}
