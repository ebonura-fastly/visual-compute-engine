declare module 'vce-core' {
  export class WasmGraph {
    constructor(name: string)
    free(): void
    addNode(node_json: string): number
    addNodeByKind(kind_json: string, x: number, y: number): number
    connect(from_node: number, from_port: number, to_node: number, to_port: number): void
    toJson(): string
    toRon(): string
    static fromJson(json: string): WasmGraph
    static fromRon(ron: string): WasmGraph
  }

  export function createConditionNode(field_json: string, operator_json: string, value_json: string): string
  export function createAndNode(input_count: number): string
  export function createOrNode(input_count: number): string
  export function createNotNode(): string
  export function createBlockNode(status_code: number, message: string): string
  export function createAllowNode(): string
  export function createChallengeNode(challenge_type: string): string
  export function createRequestNode(): string
  export function createRateLimitNode(mode: string, counter_name: string, window: string, threshold: number, penalty_ttl_seconds: number): string
  export function executeGraph(graph: WasmGraph, request_json: string): string
  export function executeWithMockRequest(graph: WasmGraph): string
}
