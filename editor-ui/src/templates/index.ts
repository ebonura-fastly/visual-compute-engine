import type { Node, Edge } from '@xyflow/react'

export type RuleTemplate = {
  id: string
  name: string
  description: string
  category: 'security' | 'rate-limiting' | 'geo' | 'bot' | 'access-control' | 'routing' | 'custom'
  tags: string[]
  nodes: Node[]
  edges: Edge[]
}

// Helper to generate unique IDs for template instances
let templateIdCounter = 0
export function instantiateTemplate(template: RuleTemplate, offsetX = 0, offsetY = 0): { nodes: Node[], edges: Edge[] } {
  const idMap = new Map<string, string>()
  const baseId = Date.now() + (templateIdCounter++)

  // Create ID mapping for all nodes
  template.nodes.forEach((node, idx) => {
    const newId = `${baseId}-${idx}`
    idMap.set(node.id, newId)
  })

  // Create nodes with updated IDs and apply offset
  const nodes = template.nodes.map((node) => {
    const newId = idMap.get(node.id)!
    return {
      ...node,
      id: newId,
      position: {
        x: node.position.x + offsetX,
        y: node.position.y + offsetY,
      },
    }
  })

  // Update edge references and set deletable type
  const edges = template.edges.map((edge, idx) => ({
    ...edge,
    id: `${baseId}-e${idx}`,
    type: 'deletable',
    source: idMap.get(edge.source) || edge.source,
    target: idMap.get(edge.target) || edge.target,
  }))

  return { nodes, edges }
}

// ============================================
// SECURITY TEMPLATES
// ============================================

export const blockAdminAccess: RuleTemplate = {
  id: 'block-admin-access',
  name: 'Block Admin Access',
  description: 'Block access to admin paths from non-whitelisted IPs',
  category: 'security',
  tags: ['admin', 'ip-whitelist', 'access-control'],
  nodes: [
    { id: '0', type: 'request', position: { x: 0, y: 150 }, data: {} },
    { id: '1', type: 'ruleGroup', position: { x: 220, y: 80 }, data: {
      name: 'Admin + Non-Allowlist',
      logic: 'AND',
      conditions: [
        { id: 'c1', field: 'path', operator: 'startsWith', value: '/admin' },
        { id: 'c2', field: 'clientIp', operator: 'notIn', value: '10.0.0.0/8, 192.168.0.0/16' },
      ]
    }},
    { id: '2', type: 'action', position: { x: 540, y: 0 }, data: { action: 'block', statusCode: 403, message: 'Admin access denied' } },
    { id: '3', type: 'backend', position: { x: 540, y: 220 }, data: { name: 'origin', host: 'httpbin.org', port: 443, useTLS: true } },
  ],
  edges: [
    { id: 'e0-1', source: '0', sourceHandle: 'request', target: '1', targetHandle: 'trigger' },
    { id: 'e1-2', source: '1', sourceHandle: 'match', target: '2', targetHandle: 'trigger' },
    { id: 'e1-3', source: '1', sourceHandle: 'noMatch', target: '3', targetHandle: 'route' },
  ],
}

export const sqlInjectionProtection: RuleTemplate = {
  id: 'sql-injection',
  name: 'SQL Injection Protection',
  description: 'Block requests containing SQL injection patterns',
  category: 'security',
  tags: ['sql', 'injection', 'owasp'],
  nodes: [
    { id: '0', type: 'request', position: { x: 0, y: 150 }, data: {} },
    { id: '1', type: 'ruleGroup', position: { x: 220, y: 80 }, data: {
      name: 'SQL Injection Patterns',
      logic: 'OR',
      conditions: [
        { id: 'c1', field: 'path', operator: 'matches', value: '(?i)(union|select|insert|update|delete|drop|--|;)' },
        { id: 'c2', field: 'userAgent', operator: 'matches', value: '(?i)(sqlmap|havij|sqlninja)' },
      ]
    }},
    { id: '2', type: 'action', position: { x: 540, y: 0 }, data: { action: 'block', statusCode: 403, message: 'Forbidden - SQL injection detected' } },
    { id: '3', type: 'backend', position: { x: 540, y: 220 }, data: { name: 'origin', host: 'httpbin.org', port: 443, useTLS: true } },
  ],
  edges: [
    { id: 'e0-1', source: '0', sourceHandle: 'request', target: '1', targetHandle: 'trigger' },
    { id: 'e1-2', source: '1', sourceHandle: 'match', target: '2', targetHandle: 'trigger' },
    { id: 'e1-3', source: '1', sourceHandle: 'noMatch', target: '3', targetHandle: 'route' },
  ],
}

export const xssProtection: RuleTemplate = {
  id: 'xss-protection',
  name: 'XSS Protection',
  description: 'Block requests with cross-site scripting patterns',
  category: 'security',
  tags: ['xss', 'owasp', 'injection'],
  nodes: [
    { id: '0', type: 'request', position: { x: 0, y: 150 }, data: {} },
    { id: '1', type: 'condition', position: { x: 200, y: 150 }, data: { field: 'path', operator: 'matches', value: '(?i)(<script|javascript:|onerror=|onload=)' } },
    { id: '2', type: 'action', position: { x: 480, y: 0 }, data: { action: 'block', statusCode: 403, message: 'XSS attempt blocked' } },
    { id: '3', type: 'backend', position: { x: 480, y: 250 }, data: { name: 'origin', host: 'httpbin.org', port: 443, useTLS: true } },
  ],
  edges: [
    { id: 'e0-1', source: '0', sourceHandle: 'request', target: '1', targetHandle: 'trigger' },
    { id: 'e1-2', source: '1', sourceHandle: 'true', target: '2', targetHandle: 'trigger' },
    { id: 'e1-3', source: '1', sourceHandle: 'false', target: '3', targetHandle: 'route' },
  ],
}

// ============================================
// RATE LIMITING TEMPLATES
// ============================================

export const apiRateLimit: RuleTemplate = {
  id: 'api-rate-limit',
  name: 'API Rate Limiting',
  description: 'Limit API requests to 100/minute per IP',
  category: 'rate-limiting',
  tags: ['api', 'throttle', 'abuse'],
  nodes: [
    { id: '0', type: 'request', position: { x: 0, y: 150 }, data: {} },
    { id: '1', type: 'condition', position: { x: 200, y: 150 }, data: { field: 'path', operator: 'startsWith', value: '/api' } },
    { id: '2', type: 'rateLimit', position: { x: 480, y: 150 }, data: { limit: 100, windowUnit: 'minute', keyBy: 'ip' } },
    { id: '3', type: 'action', position: { x: 740, y: 0 }, data: { action: 'block', statusCode: 429, message: 'Rate limit exceeded' } },
    { id: '4', type: 'backend', position: { x: 740, y: 250 }, data: { name: 'api_origin', host: 'httpbin.org', port: 443, useTLS: true } },
  ],
  edges: [
    { id: 'e0-1', source: '0', sourceHandle: 'request', target: '1', targetHandle: 'trigger' },
    { id: 'e1-2', source: '1', sourceHandle: 'true', target: '2', targetHandle: 'trigger' },
    { id: 'e1-4', source: '1', sourceHandle: 'false', target: '4', targetHandle: 'route' },
    { id: 'e2-3', source: '2', sourceHandle: 'exceeded', target: '3', targetHandle: 'trigger' },
    { id: 'e2-4', source: '2', sourceHandle: 'ok', target: '4', targetHandle: 'route' },
  ],
}

export const loginRateLimit: RuleTemplate = {
  id: 'login-rate-limit',
  name: 'Login Brute Force Protection',
  description: 'Limit login attempts to 5/minute per IP',
  category: 'rate-limiting',
  tags: ['login', 'brute-force', 'auth'],
  nodes: [
    { id: '0', type: 'request', position: { x: 0, y: 150 }, data: {} },
    { id: '1', type: 'ruleGroup', position: { x: 220, y: 80 }, data: {
      name: 'Login POST Request',
      logic: 'AND',
      conditions: [
        { id: 'c1', field: 'path', operator: 'equals', value: '/login' },
        { id: 'c2', field: 'method', operator: 'equals', value: 'POST' },
      ]
    }},
    { id: '2', type: 'rateLimit', position: { x: 540, y: 120 }, data: { limit: 5, windowUnit: 'minute', keyBy: 'ip' } },
    { id: '3', type: 'action', position: { x: 800, y: 0 }, data: { action: 'block', statusCode: 429, message: 'Too many login attempts' } },
    { id: '4', type: 'backend', position: { x: 800, y: 220 }, data: { name: 'auth_origin', host: 'httpbin.org', port: 443, useTLS: true } },
  ],
  edges: [
    { id: 'e0-1', source: '0', sourceHandle: 'request', target: '1', targetHandle: 'trigger' },
    { id: 'e1-2', source: '1', sourceHandle: 'match', target: '2', targetHandle: 'trigger' },
    { id: 'e1-4', source: '1', sourceHandle: 'noMatch', target: '4', targetHandle: 'route' },
    { id: 'e2-3', source: '2', sourceHandle: 'exceeded', target: '3', targetHandle: 'trigger' },
    { id: 'e2-4', source: '2', sourceHandle: 'ok', target: '4', targetHandle: 'route' },
  ],
}

// ============================================
// GEO BLOCKING TEMPLATES
// ============================================

export const geoBlock: RuleTemplate = {
  id: 'geo-block',
  name: 'Country Block',
  description: 'Block traffic from specific countries',
  category: 'geo',
  tags: ['geo', 'country', 'compliance'],
  nodes: [
    { id: '0', type: 'request', position: { x: 0, y: 150 }, data: {} },
    { id: '1', type: 'condition', position: { x: 200, y: 150 }, data: { field: 'country', operator: 'in', value: 'CN, RU, KP, IR' } },
    { id: '2', type: 'action', position: { x: 480, y: 0 }, data: { action: 'block', statusCode: 403, message: 'Access denied from your region' } },
    { id: '3', type: 'backend', position: { x: 480, y: 250 }, data: { name: 'origin', host: 'httpbin.org', port: 443, useTLS: true } },
  ],
  edges: [
    { id: 'e0-1', source: '0', sourceHandle: 'request', target: '1', targetHandle: 'trigger' },
    { id: 'e1-2', source: '1', sourceHandle: 'true', target: '2', targetHandle: 'trigger' },
    { id: 'e1-3', source: '1', sourceHandle: 'false', target: '3', targetHandle: 'route' },
  ],
}

export const geoRedirect: RuleTemplate = {
  id: 'geo-redirect',
  name: 'Regional Content Redirect',
  description: 'Allow only specific countries, block others',
  category: 'geo',
  tags: ['geo', 'region', 'compliance'],
  nodes: [
    { id: '0', type: 'request', position: { x: 0, y: 150 }, data: {} },
    { id: '1', type: 'condition', position: { x: 200, y: 150 }, data: { field: 'country', operator: 'notIn', value: 'US, CA, GB, AU' } },
    { id: '2', type: 'action', position: { x: 480, y: 0 }, data: { action: 'block', statusCode: 451, message: 'Content not available in your region' } },
    { id: '3', type: 'backend', position: { x: 480, y: 250 }, data: { name: 'origin', host: 'httpbin.org', port: 443, useTLS: true } },
  ],
  edges: [
    { id: 'e0-1', source: '0', sourceHandle: 'request', target: '1', targetHandle: 'trigger' },
    { id: 'e1-2', source: '1', sourceHandle: 'true', target: '2', targetHandle: 'trigger' },
    { id: 'e1-3', source: '1', sourceHandle: 'false', target: '3', targetHandle: 'route' },
  ],
}

// ============================================
// BOT PROTECTION TEMPLATES
// ============================================

export const blockBadBots: RuleTemplate = {
  id: 'block-bad-bots',
  name: 'Block Bad Bots',
  description: 'Block known malicious crawlers and scrapers',
  category: 'bot',
  tags: ['bot', 'scraper', 'crawler'],
  nodes: [
    { id: '0', type: 'request', position: { x: 0, y: 150 }, data: {} },
    { id: '1', type: 'condition', position: { x: 200, y: 150 }, data: { field: 'userAgent', operator: 'matches', value: '(?i)(ahrefsbot|semrushbot|mj12bot|dotbot|blexbot|petalbot)' } },
    { id: '2', type: 'action', position: { x: 480, y: 0 }, data: { action: 'block', statusCode: 403, message: 'Bot access denied' } },
    { id: '3', type: 'backend', position: { x: 480, y: 250 }, data: { name: 'origin', host: 'httpbin.org', port: 443, useTLS: true } },
  ],
  edges: [
    { id: 'e0-1', source: '0', sourceHandle: 'request', target: '1', targetHandle: 'trigger' },
    { id: 'e1-2', source: '1', sourceHandle: 'true', target: '2', targetHandle: 'trigger' },
    { id: 'e1-3', source: '1', sourceHandle: 'false', target: '3', targetHandle: 'route' },
  ],
}

export const botChallenge: RuleTemplate = {
  id: 'bot-challenge',
  name: 'Bot Challenge',
  description: 'Challenge suspicious traffic with known bot signatures',
  category: 'bot',
  tags: ['bot', 'challenge', 'captcha'],
  nodes: [
    { id: '0', type: 'request', position: { x: 0, y: 150 }, data: {} },
    { id: '1', type: 'listLookup', position: { x: 200, y: 150 }, data: { listType: 'bot_signatures', field: 'ja3' } },
    { id: '2', type: 'action', position: { x: 460, y: 0 }, data: { action: 'challenge' } },
    { id: '3', type: 'backend', position: { x: 460, y: 250 }, data: { name: 'origin', host: 'httpbin.org', port: 443, useTLS: true } },
  ],
  edges: [
    { id: 'e0-1', source: '0', sourceHandle: 'request', target: '1', targetHandle: 'trigger' },
    { id: 'e1-2', source: '1', sourceHandle: 'found', target: '2', targetHandle: 'trigger' },
    { id: 'e1-3', source: '1', sourceHandle: 'notFound', target: '3', targetHandle: 'route' },
  ],
}

export const emptyUserAgentBlock: RuleTemplate = {
  id: 'empty-ua-block',
  name: 'Block Empty User-Agent',
  description: 'Block requests with missing or empty User-Agent',
  category: 'bot',
  tags: ['bot', 'user-agent', 'suspicious'],
  nodes: [
    { id: '0', type: 'request', position: { x: 0, y: 150 }, data: {} },
    { id: '1', type: 'condition', position: { x: 200, y: 150 }, data: { field: 'userAgent', operator: 'equals', value: '' } },
    { id: '2', type: 'action', position: { x: 480, y: 0 }, data: { action: 'block', statusCode: 400, message: 'Bad request - User-Agent required' } },
    { id: '3', type: 'backend', position: { x: 480, y: 250 }, data: { name: 'origin', host: 'httpbin.org', port: 443, useTLS: true } },
  ],
  edges: [
    { id: 'e0-1', source: '0', sourceHandle: 'request', target: '1', targetHandle: 'trigger' },
    { id: 'e1-2', source: '1', sourceHandle: 'true', target: '2', targetHandle: 'trigger' },
    { id: 'e1-3', source: '1', sourceHandle: 'false', target: '3', targetHandle: 'route' },
  ],
}

// ============================================
// ACCESS CONTROL TEMPLATES
// ============================================

export const ipBlocklist: RuleTemplate = {
  id: 'ip-blocklist',
  name: 'IP Blocklist',
  description: 'Block traffic from known malicious IPs',
  category: 'access-control',
  tags: ['ip', 'blocklist', 'threat-intel'],
  nodes: [
    { id: '0', type: 'request', position: { x: 0, y: 150 }, data: {} },
    { id: '1', type: 'listLookup', position: { x: 200, y: 150 }, data: { listType: 'ip_blocklist', field: 'clientIp' } },
    { id: '2', type: 'action', position: { x: 460, y: 0 }, data: { action: 'block', statusCode: 403, message: 'Your IP has been blocked' } },
    { id: '3', type: 'backend', position: { x: 460, y: 250 }, data: { name: 'origin', host: 'httpbin.org', port: 443, useTLS: true } },
  ],
  edges: [
    { id: 'e0-1', source: '0', sourceHandle: 'request', target: '1', targetHandle: 'trigger' },
    { id: 'e1-2', source: '1', sourceHandle: 'found', target: '2', targetHandle: 'trigger' },
    { id: 'e1-3', source: '1', sourceHandle: 'notFound', target: '3', targetHandle: 'route' },
  ],
}

export const apiKeyValidation: RuleTemplate = {
  id: 'api-key-validation',
  name: 'API Key Validation',
  description: 'Require valid API key for API endpoints',
  category: 'access-control',
  tags: ['api', 'auth', 'key'],
  nodes: [
    { id: '0', type: 'request', position: { x: 0, y: 150 }, data: {} },
    { id: '1', type: 'ruleGroup', position: { x: 220, y: 80 }, data: {
      name: 'API + Missing Key',
      logic: 'AND',
      conditions: [
        { id: 'c1', field: 'path', operator: 'startsWith', value: '/api' },
        { id: 'c2', field: 'header', operator: 'equals', value: '' }, // X-API-Key header missing
      ]
    }},
    { id: '2', type: 'action', position: { x: 540, y: 0 }, data: { action: 'block', statusCode: 401, message: 'API key required' } },
    { id: '3', type: 'backend', position: { x: 540, y: 220 }, data: { name: 'api_origin', host: 'httpbin.org', port: 443, useTLS: true } },
  ],
  edges: [
    { id: 'e0-1', source: '0', sourceHandle: 'request', target: '1', targetHandle: 'trigger' },
    { id: 'e1-2', source: '1', sourceHandle: 'match', target: '2', targetHandle: 'trigger' },
    { id: 'e1-3', source: '1', sourceHandle: 'noMatch', target: '3', targetHandle: 'route' },
  ],
}

export const torBlocking: RuleTemplate = {
  id: 'tor-blocking',
  name: 'TOR Exit Node Blocking',
  description: 'Block traffic from TOR exit nodes',
  category: 'access-control',
  tags: ['tor', 'anonymizer', 'security'],
  nodes: [
    { id: '0', type: 'request', position: { x: 0, y: 150 }, data: {} },
    { id: '1', type: 'listLookup', position: { x: 200, y: 150 }, data: { listType: 'threat_intel', field: 'clientIp' } },
    { id: '2', type: 'action', position: { x: 460, y: 0 }, data: { action: 'block', statusCode: 403, message: 'Anonymous proxies not allowed' } },
    { id: '3', type: 'backend', position: { x: 460, y: 250 }, data: { name: 'origin', host: 'httpbin.org', port: 443, useTLS: true } },
  ],
  edges: [
    { id: 'e0-1', source: '0', sourceHandle: 'request', target: '1', targetHandle: 'trigger' },
    { id: 'e1-2', source: '1', sourceHandle: 'found', target: '2', targetHandle: 'trigger' },
    { id: 'e1-3', source: '1', sourceHandle: 'notFound', target: '3', targetHandle: 'route' },
  ],
}

// ============================================
// ANOMALY DETECTION TEMPLATES
// ============================================

export const anomalyScoring: RuleTemplate = {
  id: 'anomaly-scoring',
  name: 'Anomaly Score Detection',
  description: 'Accumulate threat score from multiple signals',
  category: 'security',
  tags: ['anomaly', 'score', 'threat'],
  nodes: [
    { id: '0', type: 'request', position: { x: 0, y: 350 }, data: {} },
    // Check various suspicious signals
    { id: '1', type: 'condition', position: { x: 200, y: 0 }, data: { field: 'country', operator: 'in', value: 'CN, RU' } },
    { id: '2', type: 'condition', position: { x: 200, y: 350 }, data: { field: 'userAgent', operator: 'equals', value: '' } },
    { id: '3', type: 'condition', position: { x: 200, y: 700 }, data: { field: 'path', operator: 'contains', value: '..' } },
    // Score nodes
    { id: '4', type: 'score', position: { x: 500, y: 50 }, data: { operation: 'add', value: 20 } },
    { id: '5', type: 'score', position: { x: 500, y: 350 }, data: { operation: 'add', value: 30 } },
    { id: '6', type: 'score', position: { x: 500, y: 650 }, data: { operation: 'add', value: 25 } },
    // Threshold check
    { id: '7', type: 'score', position: { x: 740, y: 350 }, data: { operation: 'threshold', threshold: 50 } },
    { id: '8', type: 'action', position: { x: 980, y: 100 }, data: { action: 'block', statusCode: 403, message: 'Suspicious activity detected' } },
    { id: '9', type: 'backend', position: { x: 980, y: 450 }, data: { name: 'origin', host: 'httpbin.org', port: 443, useTLS: true } },
  ],
  edges: [
    { id: 'e0-1', source: '0', sourceHandle: 'request', target: '1', targetHandle: 'trigger' },
    { id: 'e0-2', source: '0', sourceHandle: 'request', target: '2', targetHandle: 'trigger' },
    { id: 'e0-3', source: '0', sourceHandle: 'request', target: '3', targetHandle: 'trigger' },
    { id: 'e0-9', source: '0', sourceHandle: 'request', target: '9', targetHandle: 'route' },
    { id: 'e1-4', source: '1', sourceHandle: 'true', target: '4', targetHandle: 'trigger' },
    { id: 'e2-5', source: '2', sourceHandle: 'true', target: '5', targetHandle: 'trigger' },
    { id: 'e3-6', source: '3', sourceHandle: 'true', target: '6', targetHandle: 'trigger' },
    { id: 'e4-7', source: '4', sourceHandle: 'score_out', target: '7', targetHandle: 'trigger' },
    { id: 'e5-7', source: '5', sourceHandle: 'score_out', target: '7', targetHandle: 'trigger' },
    { id: 'e6-7', source: '6', sourceHandle: 'score_out', target: '7', targetHandle: 'trigger' },
    { id: 'e7-8', source: '7', sourceHandle: 'exceeded', target: '8', targetHandle: 'trigger' },
    { id: 'e7-9', source: '7', sourceHandle: 'ok', target: '9', targetHandle: 'route' },
  ],
}

// ============================================
// ROUTING TEMPLATES
// URL redirection and routing rules
// ============================================

export const redirectPermanent: RuleTemplate = {
  id: 'redirect-301',
  name: 'Permanent Redirect (301)',
  description: 'Redirect /old-path to /new-path with 301 (permanent)',
  category: 'routing',
  tags: ['redirect', '301', 'seo'],
  nodes: [
    { id: '0', type: 'request', position: { x: 0, y: 150 }, data: {} },
    { id: '1', type: 'condition', position: { x: 200, y: 150 }, data: { field: 'path', operator: 'startsWith', value: '/old-path' } },
    { id: '2', type: 'action', position: { x: 480, y: 0 }, data: { action: 'redirect', url: 'https://httpbin.org/get', statusCode: 301, preserveQuery: true } },
    { id: '3', type: 'backend', position: { x: 480, y: 250 }, data: { name: 'httpbin', host: 'httpbin.org', port: 443, useTLS: true } },
  ],
  edges: [
    { id: 'e0-1', source: '0', sourceHandle: 'request', target: '1', targetHandle: 'trigger' },
    { id: 'e1-2', source: '1', sourceHandle: 'true', target: '2', targetHandle: 'trigger' },
    { id: 'e1-3', source: '1', sourceHandle: 'false', target: '3', targetHandle: 'route' },
  ],
}

export const redirectTemporary: RuleTemplate = {
  id: 'redirect-302',
  name: 'Temporary Redirect (302)',
  description: 'Redirect dangerous methods (PUT/PATCH/DELETE) to safe endpoint',
  category: 'routing',
  tags: ['redirect', '302', 'method'],
  nodes: [
    { id: '0', type: 'request', position: { x: 0, y: 150 }, data: {} },
    { id: '1', type: 'condition', position: { x: 200, y: 150 }, data: { field: 'method', operator: 'in', value: 'PUT, PATCH, DELETE' } },
    { id: '2', type: 'action', position: { x: 480, y: 0 }, data: { action: 'redirect', url: 'https://httpbin.org/anything', statusCode: 302, preserveQuery: false } },
    { id: '3', type: 'backend', position: { x: 480, y: 250 }, data: { name: 'httpbin', host: 'httpbin.org', port: 443, useTLS: true } },
  ],
  edges: [
    { id: 'e0-1', source: '0', sourceHandle: 'request', target: '1', targetHandle: 'trigger' },
    { id: 'e1-2', source: '1', sourceHandle: 'true', target: '2', targetHandle: 'trigger' },
    { id: 'e1-3', source: '1', sourceHandle: 'false', target: '3', targetHandle: 'route' },
  ],
}

export const blockDetectedBots: RuleTemplate = {
  id: 'block-detected-bots',
  name: 'Block Detected Bots',
  description: 'Block requests detected as bots using device detection',
  category: 'bot',
  tags: ['bot', 'device-detection', 'isBot'],
  nodes: [
    { id: '0', type: 'request', position: { x: 0, y: 150 }, data: {} },
    { id: '1', type: 'condition', position: { x: 200, y: 150 }, data: { field: 'isBot', operator: 'equals', value: 'true' } },
    { id: '2', type: 'action', position: { x: 480, y: 0 }, data: { action: 'block', statusCode: 403, message: 'Bot traffic not allowed' } },
    { id: '3', type: 'backend', position: { x: 480, y: 250 }, data: { name: 'httpbin', host: 'httpbin.org', port: 443, useTLS: true } },
  ],
  edges: [
    { id: 'e0-1', source: '0', sourceHandle: 'request', target: '1', targetHandle: 'trigger' },
    { id: 'e1-2', source: '1', sourceHandle: 'true', target: '2', targetHandle: 'trigger' },
    { id: 'e1-3', source: '1', sourceHandle: 'false', target: '3', targetHandle: 'route' },
  ],
}

export const mobileRedirect: RuleTemplate = {
  id: 'mobile-redirect',
  name: 'Mobile Device Redirect',
  description: 'Redirect mobile devices to mobile site',
  category: 'routing',
  tags: ['mobile', 'device-detection', 'redirect'],
  nodes: [
    { id: '0', type: 'request', position: { x: 0, y: 150 }, data: {} },
    { id: '1', type: 'condition', position: { x: 200, y: 150 }, data: { field: 'isMobile', operator: 'equals', value: 'true' } },
    { id: '2', type: 'action', position: { x: 480, y: 0 }, data: { action: 'redirect', url: 'https://httpbin.org/anything?device=mobile', statusCode: 302, preserveQuery: true } },
    { id: '3', type: 'backend', position: { x: 480, y: 250 }, data: { name: 'httpbin', host: 'httpbin.org', port: 443, useTLS: true } },
  ],
  edges: [
    { id: 'e0-1', source: '0', sourceHandle: 'request', target: '1', targetHandle: 'trigger' },
    { id: 'e1-2', source: '1', sourceHandle: 'true', target: '2', targetHandle: 'trigger' },
    { id: 'e1-3', source: '1', sourceHandle: 'false', target: '3', targetHandle: 'route' },
  ],
}

export const blockHostingProviders: RuleTemplate = {
  id: 'block-hosting-providers',
  name: 'Block Hosting Providers',
  description: 'Block requests from datacenter/hosting provider IPs',
  category: 'access-control',
  tags: ['proxy', 'hosting', 'datacenter'],
  nodes: [
    { id: '0', type: 'request', position: { x: 0, y: 150 }, data: {} },
    { id: '1', type: 'condition', position: { x: 200, y: 150 }, data: { field: 'isHostingProvider', operator: 'equals', value: 'true' } },
    { id: '2', type: 'action', position: { x: 480, y: 0 }, data: { action: 'block', statusCode: 403, message: 'Datacenter IPs not allowed' } },
    { id: '3', type: 'backend', position: { x: 480, y: 250 }, data: { name: 'httpbin', host: 'httpbin.org', port: 443, useTLS: true } },
  ],
  edges: [
    { id: 'e0-1', source: '0', sourceHandle: 'request', target: '1', targetHandle: 'trigger' },
    { id: 'e1-2', source: '1', sourceHandle: 'true', target: '2', targetHandle: 'trigger' },
    { id: 'e1-3', source: '1', sourceHandle: 'false', target: '3', targetHandle: 'route' },
  ],
}

export const asnRangeBlock: RuleTemplate = {
  id: 'asn-range-block',
  name: 'ASN Range Block',
  description: 'Block requests from ASNs greater than a threshold',
  category: 'access-control',
  tags: ['asn', 'numeric', 'greaterThan'],
  nodes: [
    { id: '0', type: 'request', position: { x: 0, y: 150 }, data: {} },
    { id: '1', type: 'condition', position: { x: 200, y: 150 }, data: { field: 'asn', operator: 'greaterThan', value: '65000' } },
    { id: '2', type: 'action', position: { x: 480, y: 0 }, data: { action: 'block', statusCode: 403, message: 'ASN not allowed' } },
    { id: '3', type: 'backend', position: { x: 480, y: 250 }, data: { name: 'httpbin', host: 'httpbin.org', port: 443, useTLS: true } },
  ],
  edges: [
    { id: 'e0-1', source: '0', sourceHandle: 'request', target: '1', targetHandle: 'trigger' },
    { id: 'e1-2', source: '1', sourceHandle: 'true', target: '2', targetHandle: 'trigger' },
    { id: 'e1-3', source: '1', sourceHandle: 'false', target: '3', targetHandle: 'route' },
  ],
}

export const cidrAllowlist: RuleTemplate = {
  id: 'cidr-allowlist',
  name: 'CIDR IP Allowlist',
  description: 'Only allow requests from specific CIDR ranges',
  category: 'access-control',
  tags: ['cidr', 'ip', 'allowlist'],
  nodes: [
    { id: '0', type: 'request', position: { x: 0, y: 150 }, data: {} },
    { id: '1', type: 'condition', position: { x: 200, y: 150 }, data: { field: 'clientIp', operator: 'inCidr', value: '10.0.0.0/8, 192.168.0.0/16, 172.16.0.0/12' } },
    { id: '2', type: 'backend', position: { x: 480, y: 0 }, data: { name: 'httpbin', host: 'httpbin.org', port: 443, useTLS: true } },
    { id: '3', type: 'action', position: { x: 480, y: 250 }, data: { action: 'block', statusCode: 403, message: 'IP not in allowlist' } },
  ],
  edges: [
    { id: 'e0-1', source: '0', sourceHandle: 'request', target: '1', targetHandle: 'trigger' },
    { id: 'e1-2', source: '1', sourceHandle: 'true', target: '2', targetHandle: 'route' },
    { id: 'e1-3', source: '1', sourceHandle: 'false', target: '3', targetHandle: 'trigger' },
  ],
}

export const requireAuthHeader: RuleTemplate = {
  id: 'require-auth-header',
  name: 'Require Authorization Header',
  description: 'Block requests missing Authorization header',
  category: 'access-control',
  tags: ['header', 'exists', 'auth'],
  nodes: [
    { id: '0', type: 'request', position: { x: 0, y: 150 }, data: {} },
    { id: '1', type: 'ruleGroup', position: { x: 220, y: 80 }, data: {
      name: 'API + No Auth',
      logic: 'AND',
      conditions: [
        { id: 'c1', field: 'path', operator: 'startsWith', value: '/api' },
        { id: 'c2', field: 'header:Authorization', operator: 'notExists', value: '' },
      ]
    }},
    { id: '2', type: 'action', position: { x: 540, y: 0 }, data: { action: 'block', statusCode: 401, message: 'Authorization header required' } },
    { id: '3', type: 'backend', position: { x: 540, y: 220 }, data: { name: 'httpbin', host: 'httpbin.org', port: 443, useTLS: true } },
  ],
  edges: [
    { id: 'e0-1', source: '0', sourceHandle: 'request', target: '1', targetHandle: 'trigger' },
    { id: 'e1-2', source: '1', sourceHandle: 'match', target: '2', targetHandle: 'trigger' },
    { id: 'e1-3', source: '1', sourceHandle: 'noMatch', target: '3', targetHandle: 'route' },
  ],
}

export const regionBlock: RuleTemplate = {
  id: 'region-block',
  name: 'Block by Region/State',
  description: 'Block requests from specific US states',
  category: 'geo',
  tags: ['region', 'geo', 'state'],
  nodes: [
    { id: '0', type: 'request', position: { x: 0, y: 150 }, data: {} },
    { id: '1', type: 'ruleGroup', position: { x: 220, y: 80 }, data: {
      name: 'US + Restricted States',
      logic: 'AND',
      conditions: [
        { id: 'c1', field: 'country', operator: 'equals', value: 'US' },
        { id: 'c2', field: 'region', operator: 'in', value: 'CA, NY, TX' },
      ]
    }},
    { id: '2', type: 'action', position: { x: 540, y: 0 }, data: { action: 'block', statusCode: 451, message: 'Service not available in your state' } },
    { id: '3', type: 'backend', position: { x: 540, y: 220 }, data: { name: 'httpbin', host: 'httpbin.org', port: 443, useTLS: true } },
  ],
  edges: [
    { id: 'e0-1', source: '0', sourceHandle: 'request', target: '1', targetHandle: 'trigger' },
    { id: 'e1-2', source: '1', sourceHandle: 'match', target: '2', targetHandle: 'trigger' },
    { id: 'e1-3', source: '1', sourceHandle: 'noMatch', target: '3', targetHandle: 'route' },
  ],
}

export const blockOldBrowsers: RuleTemplate = {
  id: 'block-old-browsers',
  name: 'Block Old Browsers',
  description: 'Block requests from outdated browsers',
  category: 'bot',
  tags: ['browser', 'device-detection'],
  nodes: [
    { id: '0', type: 'request', position: { x: 0, y: 150 }, data: {} },
    { id: '1', type: 'condition', position: { x: 200, y: 150 }, data: { field: 'browserName', operator: 'in', value: 'Internet Explorer, MSIE' } },
    { id: '2', type: 'action', position: { x: 480, y: 0 }, data: { action: 'redirect', url: 'https://httpbin.org/anything?error=browser-unsupported', statusCode: 302, preserveQuery: false } },
    { id: '3', type: 'backend', position: { x: 480, y: 250 }, data: { name: 'httpbin', host: 'httpbin.org', port: 443, useTLS: true } },
  ],
  edges: [
    { id: 'e0-1', source: '0', sourceHandle: 'request', target: '1', targetHandle: 'trigger' },
    { id: 'e1-2', source: '1', sourceHandle: 'true', target: '2', targetHandle: 'trigger' },
    { id: 'e1-3', source: '1', sourceHandle: 'false', target: '3', targetHandle: 'route' },
  ],
}

export const latitudeFilter: RuleTemplate = {
  id: 'latitude-filter',
  name: 'Latitude Range Filter',
  description: 'Only allow requests from northern hemisphere (latitude > 0)',
  category: 'geo',
  tags: ['latitude', 'geo', 'numeric'],
  nodes: [
    { id: '0', type: 'request', position: { x: 0, y: 150 }, data: {} },
    { id: '1', type: 'condition', position: { x: 200, y: 150 }, data: { field: 'latitude', operator: 'lessThan', value: '0' } },
    { id: '2', type: 'action', position: { x: 480, y: 0 }, data: { action: 'block', statusCode: 451, message: 'Service only available in northern hemisphere' } },
    { id: '3', type: 'backend', position: { x: 480, y: 250 }, data: { name: 'httpbin', host: 'httpbin.org', port: 443, useTLS: true } },
  ],
  edges: [
    { id: 'e0-1', source: '0', sourceHandle: 'request', target: '1', targetHandle: 'trigger' },
    { id: 'e1-2', source: '1', sourceHandle: 'true', target: '2', targetHandle: 'trigger' },
    { id: 'e1-3', source: '1', sourceHandle: 'false', target: '3', targetHandle: 'route' },
  ],
}

export const blockProxiesVpns: RuleTemplate = {
  id: 'block-proxies-vpns',
  name: 'Block Proxies/VPNs',
  description: 'Block anonymous proxies and VPNs',
  category: 'access-control',
  tags: ['proxy', 'vpn', 'anonymizer'],
  nodes: [
    { id: '0', type: 'request', position: { x: 0, y: 150 }, data: {} },
    { id: '1', type: 'condition', position: { x: 200, y: 150 }, data: { field: 'proxyType', operator: 'in', value: 'anonymous, vpn, tor' } },
    { id: '2', type: 'action', position: { x: 480, y: 0 }, data: { action: 'block', statusCode: 403, message: 'Proxy/VPN traffic not allowed' } },
    { id: '3', type: 'backend', position: { x: 480, y: 250 }, data: { name: 'httpbin', host: 'httpbin.org', port: 443, useTLS: true } },
  ],
  edges: [
    { id: 'e0-1', source: '0', sourceHandle: 'request', target: '1', targetHandle: 'trigger' },
    { id: 'e1-2', source: '1', sourceHandle: 'true', target: '2', targetHandle: 'trigger' },
    { id: 'e1-3', source: '1', sourceHandle: 'false', target: '3', targetHandle: 'route' },
  ],
}

// Export all templates
export const allTemplates: RuleTemplate[] = [
  // Security
  blockAdminAccess,
  sqlInjectionProtection,
  xssProtection,
  anomalyScoring,
  // Rate Limiting
  apiRateLimit,
  loginRateLimit,
  // Geo
  geoBlock,
  geoRedirect,
  regionBlock,
  latitudeFilter,
  // Bot
  blockBadBots,
  botChallenge,
  emptyUserAgentBlock,
  blockDetectedBots,
  blockOldBrowsers,
  // Access Control
  ipBlocklist,
  apiKeyValidation,
  torBlocking,
  blockHostingProviders,
  asnRangeBlock,
  cidrAllowlist,
  requireAuthHeader,
  blockProxiesVpns,
  // Routing
  redirectPermanent,
  redirectTemporary,
  mobileRedirect,
]

export const templatesByCategory = {
  security: allTemplates.filter(t => t.category === 'security'),
  'rate-limiting': allTemplates.filter(t => t.category === 'rate-limiting'),
  geo: allTemplates.filter(t => t.category === 'geo'),
  bot: allTemplates.filter(t => t.category === 'bot'),
  'access-control': allTemplates.filter(t => t.category === 'access-control'),
  routing: allTemplates.filter(t => t.category === 'routing'),
}
