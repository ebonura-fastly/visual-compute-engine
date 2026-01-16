import { useState, useEffect } from 'react'
import type { Node, Edge } from '@xyflow/react'

// We'll dynamically import the WASM module
let wasmModule: typeof import('vce-core') | null = null

export function useWasmCore() {
  const [isLoaded, setIsLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadWasm() {
      try {
        wasmModule = await import('vce-core')
        setIsLoaded(true)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load WASM')
      }
    }
    loadWasm()
  }, [])

  const convertToWasmGraph = (nodes: Node[], edges: Edge[]) => {
    if (!wasmModule) throw new Error('WASM not loaded')

    const graph = new wasmModule.WasmGraph('rule')

    // Map React Flow node IDs to WASM node IDs
    const idMap = new Map<string, number>()

    // Add nodes
    for (const node of nodes) {
      let kindJson: string

      switch (node.type) {
        case 'condition': {
          const data = node.data as { field: string; operator: string; value: string }
          const fieldJson = JSON.stringify({ type: 'String', value: data.field })
          const opJson = JSON.stringify({ type: 'String', operator: data.operator })
          const valueJson = JSON.stringify({ type: 'String', value: data.value })
          kindJson = wasmModule.createConditionNode(fieldJson, opJson, valueJson)
          break
        }
        case 'logic': {
          const data = node.data as { operation: string }
          if (data.operation === 'AND') {
            kindJson = wasmModule.createAndNode(2)
          } else if (data.operation === 'OR') {
            kindJson = wasmModule.createOrNode(2)
          } else {
            kindJson = wasmModule.createNotNode()
          }
          break
        }
        case 'action': {
          const data = node.data as { action: string; statusCode?: number; message?: string }
          if (data.action === 'block') {
            kindJson = wasmModule.createBlockNode(data.statusCode || 403, data.message || 'Blocked')
          } else if (data.action === 'allow') {
            kindJson = wasmModule.createAllowNode()
          } else if (data.action === 'challenge') {
            kindJson = wasmModule.createChallengeNode('javascript')
          } else {
            kindJson = wasmModule.createAllowNode() // log = allow with logging
          }
          break
        }
        default:
          continue
      }

      const wasmId = graph.addNodeByKind(kindJson, node.position.x, node.position.y)
      idMap.set(node.id, wasmId)
    }

    // Add edges
    for (const edge of edges) {
      const fromId = idMap.get(edge.source)
      const toId = idMap.get(edge.target)
      if (fromId !== undefined && toId !== undefined) {
        graph.connect(fromId, 0, toId, 0)
      }
    }

    return graph
  }

  const executeRules = (nodes: Node[], edges: Edge[], requestContext: object) => {
    if (!wasmModule) throw new Error('WASM not loaded')

    const graph = convertToWasmGraph(nodes, edges)
    const result = wasmModule.executeGraph(graph, JSON.stringify(requestContext))
    graph.free()
    return JSON.parse(result)
  }

  const exportToJson = (nodes: Node[], edges: Edge[]) => {
    if (!wasmModule) throw new Error('WASM not loaded')
    const graph = convertToWasmGraph(nodes, edges)
    const json = graph.toJson()
    graph.free()
    return json
  }

  return {
    isLoaded,
    error,
    executeRules,
    exportToJson,
  }
}
