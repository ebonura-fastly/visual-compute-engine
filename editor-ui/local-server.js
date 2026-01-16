#!/usr/bin/env node
/**
 * Local Development Server for MSS Engine Editor
 *
 * This server provides:
 * 1. Static file serving for the Editor UI (Vite dev server proxy)
 * 2. API endpoint to write rules to compute/security-rules.json
 * 3. Health check for local Compute server detection
 *
 * Usage:
 *   node local-server.js
 *   # Or via Makefile:
 *   make local
 */

import { createServer } from 'http'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = 3001
const COMPUTE_URL = 'http://127.0.0.1:7676'
const RULES_FILE = join(__dirname, '..', 'compute', 'security-rules.json')

// CORS headers for browser requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const server = createServer(async (req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders)
    res.end()
    return
  }

  const url = new URL(req.url, `http://localhost:${PORT}`)

  // Health check - is local dev server running?
  if (url.pathname === '/local-api/health') {
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', mode: 'local-dev' }))
    return
  }

  // Check if local Compute server is running
  if (url.pathname === '/local-api/compute-status') {
    try {
      const response = await fetch(`${COMPUTE_URL}/_version`)
      if (response.ok) {
        const data = await response.json()
        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ running: true, ...data }))
      } else {
        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ running: false }))
      }
    } catch {
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ running: false }))
    }
    return
  }

  // Get current rules
  if (url.pathname === '/local-api/rules' && req.method === 'GET') {
    try {
      if (existsSync(RULES_FILE)) {
        const content = readFileSync(RULES_FILE, 'utf-8')
        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' })
        res.end(content)
      } else {
        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ rules_packed: '' }))
      }
    } catch (err) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    }
    return
  }

  // Write rules to file
  if (url.pathname === '/local-api/rules' && (req.method === 'POST' || req.method === 'PUT')) {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        // Validate it's valid JSON
        const parsed = JSON.parse(body)
        if (!parsed.rules_packed) {
          throw new Error('Missing rules_packed field')
        }

        // Write to file
        writeFileSync(RULES_FILE, JSON.stringify(parsed, null, 2))

        console.log(`[${new Date().toISOString()}] Rules updated (${body.length} bytes)`)

        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: true,
          message: 'Rules saved to compute/security-rules.json',
          note: 'Restart the Compute server to reload rules'
        }))
      } catch (err) {
        res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // 404 for unknown routes
  res.writeHead(404, { ...corsHeaders, 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

server.listen(PORT, () => {
  console.log('')
  console.log('╔════════════════════════════════════════════════════════════╗')
  console.log('║           MSS Engine - Local Development Server            ║')
  console.log('╠════════════════════════════════════════════════════════════╣')
  console.log(`║  Local API:      http://localhost:${PORT}/local-api/        ║`)
  console.log('║  Rules file:     compute/security-rules.json               ║')
  console.log('╠════════════════════════════════════════════════════════════╣')
  console.log('║  Endpoints:                                                ║')
  console.log('║    GET  /local-api/health        - Server health check     ║')
  console.log('║    GET  /local-api/compute-status - Compute server status  ║')
  console.log('║    GET  /local-api/rules         - Get current rules       ║')
  console.log('║    POST /local-api/rules         - Update rules            ║')
  console.log('╚════════════════════════════════════════════════════════════╝')
  console.log('')
})
