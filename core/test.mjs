// Quick test of the WASM bindings
import {
  WasmGraph,
  createRequestNode,
  createConditionNode,
  createBlockNode,
  createAndNode,
  executeWithMockRequest,
  getRequestFields,
  getStringOperators,
  getNodeMetadata,
} from './pkg/vce_core.js';

console.log('=== Testing vce-core WASM bindings ===\n');

// 1. Test schema helpers
console.log('1. Available request fields:');
const fields = JSON.parse(getRequestFields());
console.log(fields.map(f => f.display_name).join(', '));

console.log('\n2. String operators:');
const ops = JSON.parse(getStringOperators());
console.log(ops.map(o => o.display_name).join(', '));

// 2. Create a simple graph
console.log('\n3. Creating a graph...');
const graph = new WasmGraph('Block Admin Mobile');
graph.description = 'Blocks requests to /admin from mobile user agents';

// Add nodes
const requestKind = createRequestNode();
const conditionPathKind = createConditionNode(
  '"Path"',
  '"StartsWith"',
  '{"String": "/admin"}'
);
const conditionUaKind = createConditionNode(
  '"UserAgent"',
  '"Contains"',
  '{"String": "Mobile"}'
);
const andKind = createAndNode(2);
const blockKind = createBlockNode(403, 'Admin access denied from mobile devices');

const requestId = graph.addNodeByKind(requestKind, 0, 100);
const pathCondId = graph.addNodeByKind(conditionPathKind, 200, 50);
const uaCondId = graph.addNodeByKind(conditionUaKind, 200, 150);
const andId = graph.addNodeByKind(andKind, 400, 100);
const blockId = graph.addNodeByKind(blockKind, 600, 100);

console.log(`Created nodes: Request(${requestId}), PathCond(${pathCondId}), UACond(${uaCondId}), AND(${andId}), Block(${blockId})`);

// Connect nodes
graph.connect(pathCondId, 0, andId, 0);  // Path condition -> AND input 0
graph.connect(uaCondId, 0, andId, 1);    // UA condition -> AND input 1
graph.connect(andId, 0, blockId, 0);      // AND -> Block trigger

console.log('\n4. Graph JSON:');
console.log(graph.toJson());

// 3. Validate
console.log('\n5. Graph valid (no cycles):', graph.validate());

// 4. Get execution order
console.log('6. Execution order:', Array.from(graph.getExecutionOrder()));

// 5. Execute with mock request
console.log('\n7. Executing with mock request...');
const result = executeWithMockRequest(graph);
console.log('Result:', result);

// 6. Get node metadata
console.log('\n8. Block node metadata:');
const metadata = JSON.parse(getNodeMetadata(blockKind));
console.log(metadata);

// 7. Serialize to RON
console.log('\n9. RON format (excerpt):');
const ron = graph.toRon();
console.log(ron.substring(0, 500) + '...');

console.log('\n=== All tests passed! ===');
