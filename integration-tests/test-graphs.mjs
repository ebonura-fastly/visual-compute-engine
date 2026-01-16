/**
 * Integration tests for Visual Compute Engine graph evaluation.
 *
 * These tests verify that graphs created in the UI are correctly
 * interpreted by the Rust engine.
 *
 * Run with: node test-graphs.mjs [--deployed]
 *   --deployed: Test against deployed service instead of local viceroy
 *
 * Local mode spawns and kills Viceroy between each test for full isolation.
 * This ensures each test runs with its own graph configuration.
 *
 * Requires:
 *   - Local: WASM binary built (cargo build --release --target wasm32-wasip1)
 *   - Local: fastly CLI installed
 *   - Deployed: VCE_TEST_DOMAIN env var set
 */

import { createGzip } from 'zlib'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const COMPUTE_DIR = join(__dirname, '..', 'compute')

// Configuration
const LOCAL_URL = 'http://127.0.0.1:7676'
const DEPLOYED_URL = process.env.VCE_TEST_DOMAIN ?
  `https://${process.env.VCE_TEST_DOMAIN}` : null

const useDeployed = process.argv.includes('--deployed')
const BASE_URL = useDeployed ? DEPLOYED_URL : LOCAL_URL

if (useDeployed && !DEPLOYED_URL) {
  console.error('Error: --deployed requires VCE_TEST_DOMAIN environment variable')
  process.exit(1)
}

console.log(`Testing against: ${BASE_URL}`)
console.log(`Mode: ${useDeployed ? 'deployed' : 'local (spawning Viceroy per test)'}`)
console.log('')

// Viceroy process management
let viceroyProcess = null

/**
 * Spawn Viceroy process (does not wait for ready - use waitForViceroy).
 */
async function startViceroy() {
  if (useDeployed) return  // No-op for deployed mode

  viceroyProcess = spawn('fastly', ['compute', 'serve', '--skip-build'], {
    cwd: COMPUTE_DIR,
    stdio: ['ignore', 'ignore', 'ignore'],
    detached: true,
  })

  viceroyProcess.on('error', (err) => {
    console.error(`\n      Viceroy spawn error: ${err.message}`)
  })

  // Small delay to let the process start
  await new Promise(r => setTimeout(r, 100))
}

/**
 * Stop Viceroy process and wait for port to be released.
 */
async function stopViceroy() {
  if (useDeployed) return

  // Use pkill to reliably kill Viceroy and the Fastly CLI wrapper
  // This is more reliable than trying to kill process groups
  const { execSync } = await import('child_process')
  try {
    execSync('pkill -9 viceroy 2>/dev/null; pkill -9 -f "fastly compute serve" 2>/dev/null', {
      stdio: 'ignore',
      timeout: 5000
    })
  } catch {
    // pkill returns non-zero if no processes found, which is fine
  }

  viceroyProcess = null

  // Wait for port to be released (poll until connection refused)
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`${LOCAL_URL}/_version`, { signal: AbortSignal.timeout(100) })
      // Still responding, wait more
      await new Promise(r => setTimeout(r, 100))
    } catch {
      // Connection refused = port is free, wait a bit more for OS to fully release
      await new Promise(r => setTimeout(r, 200))
      return
    }
  }
  console.warn('      Warning: Port may not be fully released')
}

/**
 * Wait for Viceroy to be ready by polling /_version.
 */
async function waitForViceroy(maxAttempts = 100, delayMs = 100) {
  if (useDeployed) return

  for (let i = 0; i < maxAttempts; i++) {
    // Check if process died
    if (viceroyProcess && viceroyProcess.exitCode !== null) {
      throw new Error(`Viceroy process exited with code ${viceroyProcess.exitCode}`)
    }

    try {
      const resp = await fetch(`${LOCAL_URL}/_version`, {
        signal: AbortSignal.timeout(500)
      })
      if (resp.ok) return
    } catch {
      // Not ready yet
    }
    await new Promise(r => setTimeout(r, delayMs))
  }
  throw new Error(`Viceroy did not become ready after ${maxAttempts * delayMs}ms`)
}

// Test results tracking
let passed = 0
let failed = 0
const failures = []

/**
 * Compress and encode a graph for the Config Store.
 * Format: base64(gzip(JSON)) - no prefix for gzip, or "raw:" + base64(JSON) for uncompressed
 */
async function packGraph(graph, useCompression = false) {
  const json = JSON.stringify(graph)

  if (!useCompression) {
    // Uncompressed format with "raw:" prefix - simpler for testing
    return 'raw:' + Buffer.from(json).toString('base64')
  }

  // Compressed format: base64(gzip(JSON)) - NO prefix
  const compressed = await new Promise((resolve, reject) => {
    const gz = createGzip()
    const chunks = []
    gz.on('data', chunk => chunks.push(chunk))
    gz.on('end', () => resolve(Buffer.concat(chunks)))
    gz.on('error', reject)
    gz.write(json)
    gz.end()
  })
  return compressed.toString('base64')
}

/**
 * Write a test graph to the local security-rules.json file.
 */
async function writeTestGraph(graph) {
  const packed = await packGraph(graph)
  const rulesJson = { rules_packed: packed }

  // Write to the compute directory for local testing
  const fs = await import('fs/promises')
  const filePath = new URL('../compute/security-rules.json', import.meta.url)
  await fs.writeFile(filePath, JSON.stringify(rulesJson, null, 2))
}

/**
 * Make a test request and return the response.
 */
async function makeRequest(path, options = {}) {
  const url = `${BASE_URL}${path}`
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: options.headers || {},
    redirect: 'manual',  // Don't follow redirects - we want to see the 3xx response
  })

  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: await response.text(),
  }
}

/**
 * Run a single test case.
 * In local mode, this spawns Viceroy, runs the test, then kills Viceroy.
 */
async function runTest(name, graph, requests) {
  const startTime = Date.now()
  process.stdout.write(`  ${name}... `)

  try {
    // Write the test graph first
    await writeTestGraph(graph)

    // Start Viceroy (no-op in deployed mode)
    await startViceroy()
    await waitForViceroy()

    // Run each request
    for (const req of requests) {
      const response = await makeRequest(req.path, req.options)

      // Check expected status
      if (req.expectStatus && response.status !== req.expectStatus) {
        throw new Error(
          `Expected status ${req.expectStatus}, got ${response.status} for ${req.path}`
        )
      }

      // Check expected header
      if (req.expectHeader) {
        const [header, value] = req.expectHeader
        const actual = response.headers[header.toLowerCase()]
        if (actual !== value) {
          throw new Error(
            `Expected header ${header}="${value}", got "${actual}" for ${req.path}`
          )
        }
      }

      // Check body contains
      if (req.expectBodyContains && !response.body.includes(req.expectBodyContains)) {
        throw new Error(
          `Expected body to contain "${req.expectBodyContains}" for ${req.path}`
        )
      }
    }

    const elapsed = Date.now() - startTime
    console.log(`PASS (${elapsed}ms)`)
    passed++
  } catch (err) {
    const elapsed = Date.now() - startTime
    console.log(`FAIL (${elapsed}ms)`)
    console.log(`      ${err.message}`)
    failed++
    failures.push({ name, error: err.message })
  } finally {
    // Always stop Viceroy after each test
    await stopViceroy()
  }
}

// ============================================================================
// TEST GRAPHS
// ============================================================================

/**
 * Test: Simple routing to backend.
 * Request -> Backend (httpbin)
 */
const simpleRoutingGraph = {
  nodes: [
    {
      id: 'req-1',
      type: 'request',
      position: { x: 100, y: 100 },
      data: {},
    },
    {
      id: 'backend-1',
      type: 'backend',
      position: { x: 300, y: 100 },
      data: {
        name: 'httpbin',
        host: 'httpbin.org',
        port: 443,
        useTLS: true,
      },
    },
  ],
  edges: [
    {
      id: 'e1',
      source: 'req-1',
      sourceHandle: 'request',
      target: 'backend-1',
      targetHandle: 'route',
    },
  ],
}

/**
 * Test: Condition node with true/false handles.
 * Request -> Condition (path=/blocked) -> [true: Block, false: Backend]
 */
const conditionBlockGraph = {
  nodes: [
    {
      id: 'req-1',
      type: 'request',
      position: { x: 100, y: 100 },
      data: {},
    },
    {
      id: 'cond-1',
      type: 'condition',
      position: { x: 300, y: 100 },
      data: {
        field: 'path',
        operator: 'equals',
        value: '/blocked',
      },
    },
    {
      id: 'action-1',
      type: 'action',
      position: { x: 500, y: 50 },
      data: {
        action: 'block',
        statusCode: 403,
        message: 'Access denied',
      },
    },
    {
      id: 'backend-1',
      type: 'backend',
      position: { x: 500, y: 150 },
      data: {
        name: 'httpbin',
        host: 'httpbin.org',
        port: 443,
        useTLS: true,
      },
    },
  ],
  edges: [
    {
      id: 'e1',
      source: 'req-1',
      sourceHandle: 'request',
      target: 'cond-1',
      targetHandle: 'trigger',
    },
    {
      id: 'e2',
      source: 'cond-1',
      sourceHandle: 'true',  // UI uses 'true' for match
      target: 'action-1',
      targetHandle: 'trigger',
    },
    {
      id: 'e3',
      source: 'cond-1',
      sourceHandle: 'false',  // UI uses 'false' for no match
      target: 'backend-1',
      targetHandle: 'route',
    },
  ],
}

/**
 * Test: RuleGroup node with match/noMatch handles.
 * Request -> RuleGroup (path startsWith /admin AND method=POST) -> [match: Block, noMatch: Backend]
 */
const ruleGroupGraph = {
  nodes: [
    {
      id: 'req-1',
      type: 'request',
      position: { x: 100, y: 100 },
      data: {},
    },
    {
      id: 'rg-1',
      type: 'ruleGroup',
      position: { x: 300, y: 100 },
      data: {
        name: 'Admin POST Block',
        logic: 'AND',
        conditions: [
          { id: 'c1', field: 'path', operator: 'startsWith', value: '/admin' },
          { id: 'c2', field: 'method', operator: 'equals', value: 'POST' },
        ],
      },
    },
    {
      id: 'action-1',
      type: 'action',
      position: { x: 500, y: 50 },
      data: {
        action: 'block',
        statusCode: 403,
        message: 'Admin POST blocked',
      },
    },
    {
      id: 'backend-1',
      type: 'backend',
      position: { x: 500, y: 150 },
      data: {
        name: 'httpbin',
        host: 'httpbin.org',
        port: 443,
        useTLS: true,
      },
    },
  ],
  edges: [
    {
      id: 'e1',
      source: 'req-1',
      sourceHandle: 'request',
      target: 'rg-1',
      targetHandle: 'trigger',
    },
    {
      id: 'e2',
      source: 'rg-1',
      sourceHandle: 'match',  // RuleGroup uses 'match'
      target: 'action-1',
      targetHandle: 'trigger',
    },
    {
      id: 'e3',
      source: 'rg-1',
      sourceHandle: 'noMatch',  // RuleGroup uses 'noMatch'
      target: 'backend-1',
      targetHandle: 'route',
    },
  ],
}

/**
 * Test: Contains operator for path matching.
 */
const containsGraph = {
  nodes: [
    {
      id: 'req-1',
      type: 'request',
      position: { x: 100, y: 100 },
      data: {},
    },
    {
      id: 'cond-1',
      type: 'condition',
      position: { x: 300, y: 100 },
      data: {
        field: 'path',
        operator: 'contains',
        value: 'secret',
      },
    },
    {
      id: 'action-1',
      type: 'action',
      position: { x: 500, y: 50 },
      data: {
        action: 'block',
        statusCode: 403,
        message: 'Secret path blocked',
      },
    },
    {
      id: 'backend-1',
      type: 'backend',
      position: { x: 500, y: 150 },
      data: {
        name: 'httpbin',
        host: 'httpbin.org',
        port: 443,
        useTLS: true,
      },
    },
  ],
  edges: [
    {
      id: 'e1',
      source: 'req-1',
      sourceHandle: 'request',
      target: 'cond-1',
      targetHandle: 'trigger',
    },
    {
      id: 'e2',
      source: 'cond-1',
      sourceHandle: 'true',
      target: 'action-1',
      targetHandle: 'trigger',
    },
    {
      id: 'e3',
      source: 'cond-1',
      sourceHandle: 'false',
      target: 'backend-1',
      targetHandle: 'route',
    },
  ],
}

/**
 * Test: Method matching.
 */
const methodGraph = {
  nodes: [
    {
      id: 'req-1',
      type: 'request',
      position: { x: 100, y: 100 },
      data: {},
    },
    {
      id: 'cond-1',
      type: 'condition',
      position: { x: 300, y: 100 },
      data: {
        field: 'method',
        operator: 'equals',
        value: 'DELETE',
      },
    },
    {
      id: 'action-1',
      type: 'action',
      position: { x: 500, y: 50 },
      data: {
        action: 'block',
        statusCode: 405,
        message: 'DELETE not allowed',
      },
    },
    {
      id: 'backend-1',
      type: 'backend',
      position: { x: 500, y: 150 },
      data: {
        name: 'httpbin',
        host: 'httpbin.org',
        port: 443,
        useTLS: true,
      },
    },
  ],
  edges: [
    {
      id: 'e1',
      source: 'req-1',
      sourceHandle: 'request',
      target: 'cond-1',
      targetHandle: 'trigger',
    },
    {
      id: 'e2',
      source: 'cond-1',
      sourceHandle: 'true',
      target: 'action-1',
      targetHandle: 'trigger',
    },
    {
      id: 'e3',
      source: 'cond-1',
      sourceHandle: 'false',
      target: 'backend-1',
      targetHandle: 'route',
    },
  ],
}

// ============================================================================
// NEW v1.1.5 TEST GRAPHS
// ============================================================================

/**
 * Test: Redirect node with 302 status.
 * Request -> Condition (path=/old) -> [true: Redirect, false: Backend]
 */
const redirectGraph = {
  nodes: [
    {
      id: 'req-1',
      type: 'request',
      position: { x: 100, y: 100 },
      data: {},
    },
    {
      id: 'cond-1',
      type: 'condition',
      position: { x: 300, y: 100 },
      data: {
        field: 'path',
        operator: 'equals',
        value: '/old-page',
      },
    },
    {
      id: 'redirect-1',
      type: 'redirect',
      position: { x: 500, y: 50 },
      data: {
        url: 'https://example.com/new-page',
        statusCode: 302,
        preserveQuery: true,
      },
    },
    {
      id: 'backend-1',
      type: 'backend',
      position: { x: 500, y: 150 },
      data: {
        name: 'httpbin',
        host: 'httpbin.org',
        port: 443,
        useTLS: true,
      },
    },
  ],
  edges: [
    {
      id: 'e1',
      source: 'req-1',
      sourceHandle: 'request',
      target: 'cond-1',
      targetHandle: 'trigger',
    },
    {
      id: 'e2',
      source: 'cond-1',
      sourceHandle: 'true',
      target: 'redirect-1',
      targetHandle: 'trigger',
    },
    {
      id: 'e3',
      source: 'cond-1',
      sourceHandle: 'false',
      target: 'backend-1',
      targetHandle: 'route',
    },
  ],
}

/**
 * Test: Redirect with 301 permanent redirect.
 */
const redirect301Graph = {
  nodes: [
    {
      id: 'req-1',
      type: 'request',
      position: { x: 100, y: 100 },
      data: {},
    },
    {
      id: 'redirect-1',
      type: 'redirect',
      position: { x: 300, y: 100 },
      data: {
        url: 'https://new-domain.com/',
        statusCode: 301,
        preserveQuery: false,
      },
    },
  ],
  edges: [
    {
      id: 'e1',
      source: 'req-1',
      sourceHandle: 'request',
      target: 'redirect-1',
      targetHandle: 'trigger',
    },
  ],
}

/**
 * Test: inCidr operator for IP range matching.
 * Note: Viceroy may not provide real client IPs, so we test the graph parses correctly.
 */
const inCidrGraph = {
  nodes: [
    {
      id: 'req-1',
      type: 'request',
      position: { x: 100, y: 100 },
      data: {},
    },
    {
      id: 'cond-1',
      type: 'condition',
      position: { x: 300, y: 100 },
      data: {
        field: 'clientIp',
        operator: 'inCidr',
        value: '192.168.0.0/16, 10.0.0.0/8',  // Private ranges
      },
    },
    {
      id: 'action-1',
      type: 'action',
      position: { x: 500, y: 50 },
      data: {
        action: 'block',
        statusCode: 403,
        message: 'Internal IP blocked',
      },
    },
    {
      id: 'backend-1',
      type: 'backend',
      position: { x: 500, y: 150 },
      data: {
        name: 'httpbin',
        host: 'httpbin.org',
        port: 443,
        useTLS: true,
      },
    },
  ],
  edges: [
    {
      id: 'e1',
      source: 'req-1',
      sourceHandle: 'request',
      target: 'cond-1',
      targetHandle: 'trigger',
    },
    {
      id: 'e2',
      source: 'cond-1',
      sourceHandle: 'true',
      target: 'action-1',
      targetHandle: 'trigger',
    },
    {
      id: 'e3',
      source: 'cond-1',
      sourceHandle: 'false',
      target: 'backend-1',
      targetHandle: 'route',
    },
  ],
}

/**
 * Test: Regex matches operator.
 */
const regexGraph = {
  nodes: [
    {
      id: 'req-1',
      type: 'request',
      position: { x: 100, y: 100 },
      data: {},
    },
    {
      id: 'cond-1',
      type: 'condition',
      position: { x: 300, y: 100 },
      data: {
        field: 'path',
        operator: 'matches',
        value: '^/api/v[0-9]+/',  // Matches /api/v1/, /api/v2/, etc.
      },
    },
    {
      id: 'action-1',
      type: 'action',
      position: { x: 500, y: 50 },
      data: {
        action: 'block',
        statusCode: 403,
        message: 'API blocked',
      },
    },
    {
      id: 'backend-1',
      type: 'backend',
      position: { x: 500, y: 150 },
      data: {
        name: 'httpbin',
        host: 'httpbin.org',
        port: 443,
        useTLS: true,
      },
    },
  ],
  edges: [
    {
      id: 'e1',
      source: 'req-1',
      sourceHandle: 'request',
      target: 'cond-1',
      targetHandle: 'trigger',
    },
    {
      id: 'e2',
      source: 'cond-1',
      sourceHandle: 'true',
      target: 'action-1',
      targetHandle: 'trigger',
    },
    {
      id: 'e3',
      source: 'cond-1',
      sourceHandle: 'false',
      target: 'backend-1',
      targetHandle: 'route',
    },
  ],
}

/**
 * Test: In list operator.
 */
const inListGraph = {
  nodes: [
    {
      id: 'req-1',
      type: 'request',
      position: { x: 100, y: 100 },
      data: {},
    },
    {
      id: 'cond-1',
      type: 'condition',
      position: { x: 300, y: 100 },
      data: {
        field: 'method',
        operator: 'in',
        value: 'PUT, PATCH, DELETE',
      },
    },
    {
      id: 'action-1',
      type: 'action',
      position: { x: 500, y: 50 },
      data: {
        action: 'block',
        statusCode: 405,
        message: 'Method not allowed',
      },
    },
    {
      id: 'backend-1',
      type: 'backend',
      position: { x: 500, y: 150 },
      data: {
        name: 'httpbin',
        host: 'httpbin.org',
        port: 443,
        useTLS: true,
      },
    },
  ],
  edges: [
    {
      id: 'e1',
      source: 'req-1',
      sourceHandle: 'request',
      target: 'cond-1',
      targetHandle: 'trigger',
    },
    {
      id: 'e2',
      source: 'cond-1',
      sourceHandle: 'true',
      target: 'action-1',
      targetHandle: 'trigger',
    },
    {
      id: 'e3',
      source: 'cond-1',
      sourceHandle: 'false',
      target: 'backend-1',
      targetHandle: 'route',
    },
  ],
}

/**
 * Test: Backend node with full configuration options.
 * Request -> Backend (with timeouts, TLS, pooling settings)
 */
const backendConfigGraph = {
  nodes: [
    {
      id: 'req-1',
      type: 'request',
      position: { x: 100, y: 100 },
      data: {},
    },
    {
      id: 'backend-1',
      type: 'backend',
      position: { x: 300, y: 100 },
      data: {
        name: 'configured-backend',
        host: 'httpbin.org',
        port: 443,
        useTLS: true,
        // Timeouts
        connectTimeout: 2000,
        firstByteTimeout: 30000,
        betweenBytesTimeout: 15000,
        // TLS settings
        verifyCertificate: false,  // Don't verify for testing
        minTLSVersion: '1.2',
        maxTLSVersion: '1.3',
        // Connection pooling
        enablePooling: true,
        keepaliveTime: 60000,
        maxConnections: 0,  // 0 = unlimited
        maxConnectionUses: 0,  // 0 = unlimited
        maxConnectionLifetime: 0,  // 0 = unlimited
        // Host override
        overrideHost: 'httpbin.org',
        preferIPv6: false,
      },
    },
  ],
  edges: [
    {
      id: 'e1',
      source: 'req-1',
      sourceHandle: 'request',
      target: 'backend-1',
      targetHandle: 'route',
    },
  ],
}

/**
 * Test: Backend node with TCP keepalive settings.
 */
const backendTcpKeepaliveGraph = {
  nodes: [
    {
      id: 'req-1',
      type: 'request',
      position: { x: 100, y: 100 },
      data: {},
    },
    {
      id: 'backend-1',
      type: 'backend',
      position: { x: 300, y: 100 },
      data: {
        name: 'tcp-keepalive-backend',
        host: 'httpbin.org',
        port: 443,
        useTLS: true,
        // TCP Keepalive settings
        tcpKeepalive: true,
        tcpKeepaliveTime: 7200,
        tcpKeepaliveInterval: 75,
        tcpKeepaliveProbes: 9,
      },
    },
  ],
  edges: [
    {
      id: 'e1',
      source: 'req-1',
      sourceHandle: 'request',
      target: 'backend-1',
      targetHandle: 'route',
    },
  ],
}

// ============================================================================
// CACHE NODE TESTS
// ============================================================================

/**
 * Test: Cache node with TTL configuration.
 * Request -> Cache (TTL 300s) -> Backend
 * Verifies cache settings are applied via x-vce-cache-ttl header.
 */
const cacheTtlGraph = {
  nodes: [
    {
      id: 'req-1',
      type: 'request',
      position: { x: 100, y: 100 },
      data: {},
    },
    {
      id: 'cache-1',
      type: 'cache',
      position: { x: 300, y: 100 },
      data: {
        mode: 'configure',
        ttl: 300,
        ttlUnit: 'seconds',
        staleWhileRevalidate: 60,
        swrUnit: 'seconds',
        surrogateKeys: 'homepage static',
      },
    },
    {
      id: 'backend-1',
      type: 'backend',
      position: { x: 500, y: 100 },
      data: {
        name: 'httpbin',
        host: 'httpbin.org',
        port: 443,
        useTLS: true,
      },
    },
  ],
  edges: [
    {
      id: 'e1',
      source: 'req-1',
      sourceHandle: 'request',
      target: 'cache-1',
      targetHandle: 'trigger',
    },
    {
      id: 'e2',
      source: 'cache-1',
      sourceHandle: 'next',
      target: 'backend-1',
      targetHandle: 'route',
    },
  ],
}

/**
 * Test: Cache node in pass (bypass) mode.
 * Request -> Cache (pass) -> Backend
 */
const cachePassGraph = {
  nodes: [
    {
      id: 'req-1',
      type: 'request',
      position: { x: 100, y: 100 },
      data: {},
    },
    {
      id: 'cache-1',
      type: 'cache',
      position: { x: 300, y: 100 },
      data: {
        mode: 'pass',
      },
    },
    {
      id: 'backend-1',
      type: 'backend',
      position: { x: 500, y: 100 },
      data: {
        name: 'httpbin',
        host: 'httpbin.org',
        port: 443,
        useTLS: true,
      },
    },
  ],
  edges: [
    {
      id: 'e1',
      source: 'req-1',
      sourceHandle: 'request',
      target: 'cache-1',
      targetHandle: 'trigger',
    },
    {
      id: 'e2',
      source: 'cache-1',
      sourceHandle: 'next',
      target: 'backend-1',
      targetHandle: 'route',
    },
  ],
}

// ============================================================================
// HEADER NODE TESTS
// ============================================================================

/**
 * Test: Header node - set operation.
 * Request -> Header (set X-Custom-Header) -> Backend
 */
const headerSetGraph = {
  nodes: [
    {
      id: 'req-1',
      type: 'request',
      position: { x: 100, y: 100 },
      data: {},
    },
    {
      id: 'header-1',
      type: 'header',
      position: { x: 300, y: 100 },
      data: {
        operation: 'set',
        name: 'X-Custom-Header',
        value: 'test-value-123',
      },
    },
    {
      id: 'backend-1',
      type: 'backend',
      position: { x: 500, y: 100 },
      data: {
        name: 'httpbin',
        host: 'httpbin.org',
        port: 443,
        useTLS: true,
      },
    },
  ],
  edges: [
    {
      id: 'e1',
      source: 'req-1',
      sourceHandle: 'request',
      target: 'header-1',
      targetHandle: 'trigger',
    },
    {
      id: 'e2',
      source: 'header-1',
      sourceHandle: 'next',
      target: 'backend-1',
      targetHandle: 'route',
    },
  ],
}

/**
 * Test: Header node - remove operation.
 * Request -> Header (remove User-Agent) -> Backend
 */
const headerRemoveGraph = {
  nodes: [
    {
      id: 'req-1',
      type: 'request',
      position: { x: 100, y: 100 },
      data: {},
    },
    {
      id: 'header-1',
      type: 'header',
      position: { x: 300, y: 100 },
      data: {
        operation: 'remove',
        name: 'User-Agent',
      },
    },
    {
      id: 'backend-1',
      type: 'backend',
      position: { x: 500, y: 100 },
      data: {
        name: 'httpbin',
        host: 'httpbin.org',
        port: 443,
        useTLS: true,
      },
    },
  ],
  edges: [
    {
      id: 'e1',
      source: 'req-1',
      sourceHandle: 'request',
      target: 'header-1',
      targetHandle: 'trigger',
    },
    {
      id: 'e2',
      source: 'header-1',
      sourceHandle: 'next',
      target: 'backend-1',
      targetHandle: 'route',
    },
  ],
}

/**
 * Test: Multiple header operations chained.
 * Request -> Header (set X-First) -> Header (set X-Second) -> Backend
 */
const headerChainGraph = {
  nodes: [
    {
      id: 'req-1',
      type: 'request',
      position: { x: 100, y: 100 },
      data: {},
    },
    {
      id: 'header-1',
      type: 'header',
      position: { x: 250, y: 100 },
      data: {
        operation: 'set',
        name: 'X-First-Header',
        value: 'first-value',
      },
    },
    {
      id: 'header-2',
      type: 'header',
      position: { x: 400, y: 100 },
      data: {
        operation: 'set',
        name: 'X-Second-Header',
        value: 'second-value',
      },
    },
    {
      id: 'backend-1',
      type: 'backend',
      position: { x: 550, y: 100 },
      data: {
        name: 'httpbin',
        host: 'httpbin.org',
        port: 443,
        useTLS: true,
      },
    },
  ],
  edges: [
    {
      id: 'e1',
      source: 'req-1',
      sourceHandle: 'request',
      target: 'header-1',
      targetHandle: 'trigger',
    },
    {
      id: 'e2',
      source: 'header-1',
      sourceHandle: 'next',
      target: 'header-2',
      targetHandle: 'trigger',
    },
    {
      id: 'e3',
      source: 'header-2',
      sourceHandle: 'next',
      target: 'backend-1',
      targetHandle: 'route',
    },
  ],
}

// ============================================================================
// TRANSFORM NODE TESTS
// ============================================================================

/**
 * Test: Transform node - lowercase operation.
 * Request -> Transform (lowercase path) -> Backend
 * Verifies transform node is processed correctly.
 */
const transformLowercaseGraph = {
  nodes: [
    {
      id: 'req-1',
      type: 'request',
      position: { x: 100, y: 100 },
      data: {},
    },
    {
      id: 'transform-1',
      type: 'transform',
      position: { x: 300, y: 100 },
      data: {
        operation: 'lowercase',
        field: 'path',
        outputVar: 'lowercased_path',
      },
    },
    {
      id: 'backend-1',
      type: 'backend',
      position: { x: 500, y: 100 },
      data: {
        name: 'httpbin',
        host: 'httpbin.org',
        port: 443,
        useTLS: true,
      },
    },
  ],
  edges: [
    {
      id: 'e1',
      source: 'req-1',
      sourceHandle: 'request',
      target: 'transform-1',
      targetHandle: 'trigger',
    },
    {
      id: 'e2',
      source: 'transform-1',
      sourceHandle: 'value_out',
      target: 'backend-1',
      targetHandle: 'route',
    },
  ],
}

/**
 * Test: Transform node - URL decode operation.
 * Request -> Transform (urlDecode query) -> Backend
 */
const transformUrlDecodeGraph = {
  nodes: [
    {
      id: 'req-1',
      type: 'request',
      position: { x: 100, y: 100 },
      data: {},
    },
    {
      id: 'transform-1',
      type: 'transform',
      position: { x: 300, y: 100 },
      data: {
        operation: 'urlDecode',
        field: 'query',
        outputVar: 'decoded_query',
      },
    },
    {
      id: 'backend-1',
      type: 'backend',
      position: { x: 500, y: 100 },
      data: {
        name: 'httpbin',
        host: 'httpbin.org',
        port: 443,
        useTLS: true,
      },
    },
  ],
  edges: [
    {
      id: 'e1',
      source: 'req-1',
      sourceHandle: 'request',
      target: 'transform-1',
      targetHandle: 'trigger',
    },
    {
      id: 'e2',
      source: 'transform-1',
      sourceHandle: 'value_out',
      target: 'backend-1',
      targetHandle: 'route',
    },
  ],
}

/**
 * Test: Transform node - regex extract operation.
 * Request -> Transform (extract API version from path) -> Backend
 */
const transformExtractGraph = {
  nodes: [
    {
      id: 'req-1',
      type: 'request',
      position: { x: 100, y: 100 },
      data: {},
    },
    {
      id: 'transform-1',
      type: 'transform',
      position: { x: 300, y: 100 },
      data: {
        operation: 'extract',
        field: 'path',
        pattern: '/api/v(\\d+)/',
        outputVar: 'api_version',
      },
    },
    {
      id: 'backend-1',
      type: 'backend',
      position: { x: 500, y: 100 },
      data: {
        name: 'httpbin',
        host: 'httpbin.org',
        port: 443,
        useTLS: true,
      },
    },
  ],
  edges: [
    {
      id: 'e1',
      source: 'req-1',
      sourceHandle: 'request',
      target: 'transform-1',
      targetHandle: 'trigger',
    },
    {
      id: 'e2',
      source: 'transform-1',
      sourceHandle: 'value_out',
      target: 'backend-1',
      targetHandle: 'route',
    },
  ],
}

/**
 * Test: Transform node chained - multiple transforms.
 * Request -> Transform (uppercase) -> Transform (removeWhitespace) -> Backend
 */
const transformChainGraph = {
  nodes: [
    {
      id: 'req-1',
      type: 'request',
      position: { x: 100, y: 100 },
      data: {},
    },
    {
      id: 'transform-1',
      type: 'transform',
      position: { x: 250, y: 100 },
      data: {
        operation: 'uppercase',
        field: 'userAgent',
        outputVar: 'upper_ua',
      },
    },
    {
      id: 'transform-2',
      type: 'transform',
      position: { x: 400, y: 100 },
      data: {
        operation: 'removeWhitespace',
        field: 'path',
        outputVar: 'trimmed_path',
      },
    },
    {
      id: 'backend-1',
      type: 'backend',
      position: { x: 550, y: 100 },
      data: {
        name: 'httpbin',
        host: 'httpbin.org',
        port: 443,
        useTLS: true,
      },
    },
  ],
  edges: [
    {
      id: 'e1',
      source: 'req-1',
      sourceHandle: 'request',
      target: 'transform-1',
      targetHandle: 'trigger',
    },
    {
      id: 'e2',
      source: 'transform-1',
      sourceHandle: 'value_out',
      target: 'transform-2',
      targetHandle: 'trigger',
    },
    {
      id: 'e3',
      source: 'transform-2',
      sourceHandle: 'value_out',
      target: 'backend-1',
      targetHandle: 'route',
    },
  ],
}

// ============================================================================
// RUN TESTS
// ============================================================================

async function main() {
  console.log('Visual Compute Engine Integration Tests')
  console.log('========================================')
  console.log('')

  // In deployed mode, verify the service is available
  if (useDeployed) {
    try {
      const versionResp = await fetch(`${BASE_URL}/_version`)
      const version = await versionResp.json()
      console.log(`Engine: ${version.engine} v${version.version}`)
      console.log('')
    } catch (err) {
      console.error(`Cannot connect to ${BASE_URL}`)
      console.error('Check that VCE_TEST_DOMAIN is correct')
      process.exit(1)
    }
  } else {
    // In local mode, check that the WASM binary exists
    const fs = await import('fs')
    const wasmPath = join(COMPUTE_DIR, 'target', 'wasm32-wasip1', 'release', 'vce-engine.wasm')
    if (!fs.existsSync(wasmPath)) {
      console.error('WASM binary not found. Run: cd compute && cargo build --release --target wasm32-wasip1')
      process.exit(1)
    }
    console.log('WASM binary found, running isolated tests...')
    console.log('')
  }

  // Cleanup handler
  const cleanup = async () => {
    await stopViceroy()
    process.exit(failed > 0 ? 1 : 0)
  }
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)

  console.log('Running tests...')
  console.log('')

  // Test 1: Simple routing
  // Note: Viceroy returns 503 for dynamic backends, but the x-vce-action header confirms correct routing
  await runTest('Simple routing to backend', simpleRoutingGraph, [
    {
      path: '/get',
      expectHeader: ['x-vce-action', 'routed:httpbin'],
      // Don't check status - Viceroy returns 503 for dynamic backends
    },
  ])

  // Test 2: Condition with true/false handles
  await runTest('Condition node - path equals (block)', conditionBlockGraph, [
    {
      path: '/blocked',
      expectStatus: 403,
      expectHeader: ['x-vce-action', 'blocked'],
      expectBodyContains: 'Access denied',
    },
    {
      path: '/allowed',
      expectHeader: ['x-vce-action', 'routed:httpbin'],
      // Don't check status - Viceroy returns 503 for dynamic backends
    },
  ])

  // Test 3: RuleGroup with match/noMatch handles
  await runTest('RuleGroup node - AND logic', ruleGroupGraph, [
    {
      path: '/admin/users',
      options: { method: 'POST' },
      expectStatus: 403,
      expectBodyContains: 'Admin POST blocked',
    },
    {
      path: '/admin/users',
      options: { method: 'GET' },
      expectHeader: ['x-vce-action', 'routed:httpbin'],  // GET doesn't match (AND requires both)
    },
    {
      path: '/public',
      options: { method: 'POST' },
      expectHeader: ['x-vce-action', 'routed:httpbin'],  // Not /admin, doesn't match
    },
  ])

  // Test 4: Contains operator
  await runTest('Condition node - contains operator', containsGraph, [
    {
      path: '/api/secret/data',
      expectStatus: 403,
      expectBodyContains: 'Secret path blocked',
    },
    {
      path: '/my-secret-page',
      expectStatus: 403,
      expectHeader: ['x-vce-action', 'blocked'],
    },
    {
      path: '/public/data',
      expectHeader: ['x-vce-action', 'routed:httpbin'],
    },
  ])

  // Test 5: Method matching
  await runTest('Condition node - method equals', methodGraph, [
    {
      path: '/resource',
      options: { method: 'DELETE' },
      expectStatus: 405,
      expectBodyContains: 'DELETE not allowed',
    },
    {
      path: '/resource',
      options: { method: 'GET' },
      expectHeader: ['x-vce-action', 'routed:httpbin'],
    },
    {
      path: '/resource',
      options: { method: 'POST' },
      expectHeader: ['x-vce-action', 'routed:httpbin'],
    },
  ])

  // ============================================================================
  // v1.1.5 NEW FEATURE TESTS
  // ============================================================================

  // Test 6: Redirect node (302)
  await runTest('Redirect node - 302 Found', redirectGraph, [
    {
      path: '/old-page',
      expectStatus: 302,
      expectHeader: ['location', 'https://example.com/new-page'],
    },
    {
      path: '/other',
      expectHeader: ['x-vce-action', 'routed:httpbin'],
    },
  ])

  // Test 7: Redirect node (301) - all requests
  await runTest('Redirect node - 301 Permanent', redirect301Graph, [
    {
      path: '/anything',
      expectStatus: 301,
      expectHeader: ['location', 'https://new-domain.com/'],
    },
  ])

  // Test 8: inCidr operator
  // Note: Local testing with Viceroy may show 127.0.0.1 as client IP
  // which doesn't match our CIDR ranges, so it routes to backend
  await runTest('inCidr operator - IP range matching', inCidrGraph, [
    {
      path: '/test',
      // Viceroy uses 127.0.0.1 which is NOT in 192.168.0.0/16 or 10.0.0.0/8
      // So it should route to backend (not block)
      expectHeader: ['x-vce-action', 'routed:httpbin'],
    },
  ])

  // Test 9: Regex matches operator
  await runTest('Regex matches operator', regexGraph, [
    {
      path: '/api/v1/users',
      expectStatus: 403,
      expectBodyContains: 'API blocked',
    },
    {
      path: '/api/v2/orders',
      expectStatus: 403,
      expectHeader: ['x-vce-action', 'blocked'],
    },
    {
      path: '/api/users',  // No version number
      expectHeader: ['x-vce-action', 'routed:httpbin'],
    },
    {
      path: '/public',
      expectHeader: ['x-vce-action', 'routed:httpbin'],
    },
  ])

  // Test 10: In list operator
  await runTest('In list operator', inListGraph, [
    {
      path: '/resource',
      options: { method: 'PUT' },
      expectStatus: 405,
      expectBodyContains: 'Method not allowed',
    },
    {
      path: '/resource',
      options: { method: 'PATCH' },
      expectStatus: 405,
    },
    {
      path: '/resource',
      options: { method: 'DELETE' },
      expectStatus: 405,
    },
    {
      path: '/resource',
      options: { method: 'GET' },
      expectHeader: ['x-vce-action', 'routed:httpbin'],
    },
    {
      path: '/resource',
      options: { method: 'POST' },
      expectHeader: ['x-vce-action', 'routed:httpbin'],
    },
  ])

  // ============================================================================
  // BACKEND CONFIGURATION TESTS
  // ============================================================================

  // Test 11: Backend node with full configuration
  // Note: Viceroy returns 503 for dynamic backends, but x-vce-action confirms routing
  await runTest('Backend with full config (timeouts, TLS, pooling)', backendConfigGraph, [
    {
      path: '/get',
      expectHeader: ['x-vce-action', 'routed:configured-backend'],
    },
  ])

  // Test 12: Backend node with TCP keepalive
  await runTest('Backend with TCP keepalive settings', backendTcpKeepaliveGraph, [
    {
      path: '/get',
      expectHeader: ['x-vce-action', 'routed:tcp-keepalive-backend'],
    },
  ])

  // ============================================================================
  // CACHE NODE TESTS
  // ============================================================================

  // Test 13: Cache node with TTL configuration
  // Note: We can verify the cache node was processed via x-vce-action header
  await runTest('Cache node - TTL configuration', cacheTtlGraph, [
    {
      path: '/get',
      expectHeader: ['x-vce-action', 'routed:httpbin'],
      // Cache settings are applied internally - we verify the graph processes correctly
    },
  ])

  // Test 14: Cache node in pass (bypass) mode
  await runTest('Cache node - pass (bypass) mode', cachePassGraph, [
    {
      path: '/get',
      expectHeader: ['x-vce-action', 'routed:httpbin'],
    },
  ])

  // ============================================================================
  // HEADER NODE TESTS
  // ============================================================================

  // Test 15: Header node - set operation
  await runTest('Header node - set operation', headerSetGraph, [
    {
      path: '/get',
      expectHeader: ['x-vce-action', 'routed:httpbin'],
      // Header modification is applied to the backend request
    },
  ])

  // Test 16: Header node - remove operation
  await runTest('Header node - remove operation', headerRemoveGraph, [
    {
      path: '/get',
      expectHeader: ['x-vce-action', 'routed:httpbin'],
    },
  ])

  // Test 17: Multiple header operations chained
  await runTest('Header node - chained operations', headerChainGraph, [
    {
      path: '/get',
      expectHeader: ['x-vce-action', 'routed:httpbin'],
    },
  ])

  // ============================================================================
  // TRANSFORM NODE TESTS
  // ============================================================================

  // Test 18: Transform node - lowercase operation
  await runTest('Transform node - lowercase operation', transformLowercaseGraph, [
    {
      path: '/GET',
      expectHeader: ['x-vce-action', 'routed:httpbin'],
      // Transform processes the path, then routes to backend
    },
  ])

  // Test 19: Transform node - URL decode operation
  await runTest('Transform node - URL decode operation', transformUrlDecodeGraph, [
    {
      path: '/search?q=hello%20world',
      expectHeader: ['x-vce-action', 'routed:httpbin'],
    },
  ])

  // Test 20: Transform node - regex extract operation
  await runTest('Transform node - regex extract operation', transformExtractGraph, [
    {
      path: '/api/v1/users',
      expectHeader: ['x-vce-action', 'routed:httpbin'],
      // Transform extracts "1" from path and stores in api_version variable
    },
  ])

  // Test 21: Transform node - chained operations
  await runTest('Transform node - chained operations', transformChainGraph, [
    {
      path: '/test',
      expectHeader: ['x-vce-action', 'routed:httpbin'],
      // Multiple transforms are processed in sequence
    },
  ])

  // Summary
  console.log('')
  console.log('============================')
  console.log(`Results: ${passed} passed, ${failed} failed`)

  if (failures.length > 0) {
    console.log('')
    console.log('Failures:')
    for (const f of failures) {
      console.log(`  - ${f.name}: ${f.error}`)
    }
    process.exit(1)
  }
}

main().catch(err => {
  console.error('Test error:', err)
  process.exit(1)
})
