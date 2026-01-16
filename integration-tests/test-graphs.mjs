/**
 * Integration tests for Visual Compute Engine graph evaluation.
 *
 * These tests verify that graphs created in the UI are correctly
 * interpreted by the Rust engine.
 *
 * Run with: node test-graphs.mjs [--deployed] [--single <test-name>]
 *   --deployed: Test against deployed service instead of local viceroy
 *   --single: Run a single named test (useful with local viceroy)
 *
 * Requires:
 *   - Local: fastly compute serve running (viceroy on localhost:7676)
 *   - Deployed: VCE_TEST_DOMAIN env var set
 *
 * Note: When running locally with Viceroy, the Config Store is loaded once
 * at startup and not reloaded between tests. To run all tests locally:
 *   1. Use --single to run one test at a time
 *   2. Restart viceroy between tests
 *   3. Or use --deployed mode which updates rules via API
 */

import { createGzip } from 'zlib'
import { promisify } from 'util'

const gzip = promisify(createGzip().constructor.prototype.flush ?
  (data, cb) => {
    const gz = createGzip()
    const chunks = []
    gz.on('data', chunk => chunks.push(chunk))
    gz.on('end', () => cb(null, Buffer.concat(chunks)))
    gz.on('error', cb)
    gz.write(data)
    gz.end()
  } :
  require('zlib').gzip
)

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
console.log('')

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
  await fs.writeFile(
    new URL('../compute/security-rules.json', import.meta.url),
    JSON.stringify(rulesJson, null, 2)
  )
}

/**
 * Make a test request and return the response.
 */
async function makeRequest(path, options = {}) {
  const url = `${BASE_URL}${path}`
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: options.headers || {},
  })

  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: await response.text(),
  }
}

/**
 * Run a single test case.
 */
async function runTest(name, graph, requests) {
  console.log(`  ${name}`)

  try {
    // Write the test graph
    await writeTestGraph(graph)

    // Wait a moment for viceroy to pick up the change
    await new Promise(r => setTimeout(r, 100))

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

    console.log(`    PASS`)
    passed++
  } catch (err) {
    console.log(`    FAIL: ${err.message}`)
    failed++
    failures.push({ name, error: err.message })
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
// RUN TESTS
// ============================================================================

async function main() {
  console.log('Visual Compute Engine Integration Tests')
  console.log('============================')
  console.log('')

  // Check if server is running
  try {
    const versionResp = await fetch(`${BASE_URL}/_version`)
    const version = await versionResp.json()
    console.log(`Engine: ${version.engine} v${version.version}`)
    console.log('')
  } catch (err) {
    console.error(`Cannot connect to ${BASE_URL}`)
    console.error('Make sure fastly compute serve is running')
    process.exit(1)
  }

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
