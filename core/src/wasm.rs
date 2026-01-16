//! WASM bindings for vce-core.
//!
//! Exposes the graph manipulation and execution APIs to JavaScript.

use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use crate::{
    Graph, Node, NodeKind, Edge, GraphError,
    RequestField, Operator, ConditionValue, ActionType, ChallengeType, LogSeverity,
    RateLimitMode, RateWindow, HeaderOp, NodeCategory,
    RequestContext, ExecutionState, ExecutionResult, execute,
};
use std::collections::HashMap;

// ═══════════════════════════════════════════════════════════════════════════
// Graph API
// ═══════════════════════════════════════════════════════════════════════════

/// A wrapper around Graph for WASM.
#[wasm_bindgen]
pub struct WasmGraph {
    inner: Graph,
}

#[wasm_bindgen]
impl WasmGraph {
    /// Create a new empty graph with the given name.
    #[wasm_bindgen(constructor)]
    pub fn new(name: &str) -> WasmGraph {
        WasmGraph {
            inner: Graph::new(name),
        }
    }

    /// Load a graph from JSON.
    #[wasm_bindgen(js_name = fromJson)]
    pub fn from_json(json: &str) -> Result<WasmGraph, JsError> {
        let graph: Graph = serde_json::from_str(json)
            .map_err(|e| JsError::new(&e.to_string()))?;
        Ok(WasmGraph { inner: graph })
    }

    /// Load a graph from RON format.
    #[wasm_bindgen(js_name = fromRon)]
    pub fn from_ron(ron: &str) -> Result<WasmGraph, JsError> {
        let graph = Graph::from_ron(ron)
            .map_err(|e| JsError::new(&e.to_string()))?;
        Ok(WasmGraph { inner: graph })
    }

    /// Serialize the graph to JSON.
    #[wasm_bindgen(js_name = toJson)]
    pub fn to_json(&self) -> Result<String, JsError> {
        serde_json::to_string_pretty(&self.inner)
            .map_err(|e| JsError::new(&e.to_string()))
    }

    /// Serialize the graph to RON format.
    #[wasm_bindgen(js_name = toRon)]
    pub fn to_ron(&self) -> Result<String, JsError> {
        self.inner.to_ron()
            .map_err(|e| JsError::new(&e.to_string()))
    }

    /// Get the graph name.
    #[wasm_bindgen(getter)]
    pub fn name(&self) -> String {
        self.inner.name.clone()
    }

    /// Set the graph name.
    #[wasm_bindgen(setter)]
    pub fn set_name(&mut self, name: &str) {
        self.inner.name = name.to_string();
    }

    /// Get the graph description.
    #[wasm_bindgen(getter)]
    pub fn description(&self) -> String {
        self.inner.description.clone()
    }

    /// Set the graph description.
    #[wasm_bindgen(setter)]
    pub fn set_description(&mut self, desc: &str) {
        self.inner.description = desc.to_string();
    }

    /// Add a node to the graph. Returns the new node ID.
    /// The node should be a JSON object matching the Node structure.
    #[wasm_bindgen(js_name = addNode)]
    pub fn add_node(&mut self, node_json: &str) -> Result<u32, JsError> {
        let node: Node = serde_json::from_str(node_json)
            .map_err(|e| JsError::new(&format!("Invalid node JSON: {}", e)))?;
        Ok(self.inner.add_node(node))
    }

    /// Add a node by kind (simpler API for common cases).
    #[wasm_bindgen(js_name = addNodeByKind)]
    pub fn add_node_by_kind(&mut self, kind_json: &str, x: f32, y: f32) -> Result<u32, JsError> {
        let kind: NodeKind = serde_json::from_str(kind_json)
            .map_err(|e| JsError::new(&format!("Invalid node kind JSON: {}", e)))?;
        let node = Node {
            id: 0, // Will be assigned by add_node
            kind,
            position: (x, y),
        };
        Ok(self.inner.add_node(node))
    }

    /// Remove a node by ID.
    #[wasm_bindgen(js_name = removeNode)]
    pub fn remove_node(&mut self, node_id: u32) {
        self.inner.remove_node(node_id);
    }

    /// Connect two nodes.
    #[wasm_bindgen]
    pub fn connect(
        &mut self,
        from_node: u32,
        from_port: u8,
        to_node: u32,
        to_port: u8,
    ) -> Result<(), JsError> {
        self.inner
            .connect(from_node, from_port, to_node, to_port)
            .map_err(|e| JsError::new(&e.to_string()))
    }

    /// Disconnect an edge by target node and port.
    #[wasm_bindgen]
    pub fn disconnect(&mut self, to_node: u32, to_port: u8) {
        self.inner.disconnect(to_node, to_port);
    }

    /// Get a node by ID as JSON.
    #[wasm_bindgen(js_name = getNode)]
    pub fn get_node(&self, id: u32) -> Result<Option<String>, JsError> {
        match self.inner.get_node(id) {
            Some(node) => {
                let json = serde_json::to_string(node)
                    .map_err(|e| JsError::new(&e.to_string()))?;
                Ok(Some(json))
            }
            None => Ok(None),
        }
    }

    /// Get all nodes as JSON array.
    #[wasm_bindgen(js_name = getNodes)]
    pub fn get_nodes(&self) -> Result<String, JsError> {
        serde_json::to_string(&self.inner.nodes)
            .map_err(|e| JsError::new(&e.to_string()))
    }

    /// Get all edges as JSON array.
    #[wasm_bindgen(js_name = getEdges)]
    pub fn get_edges(&self) -> Result<String, JsError> {
        serde_json::to_string(&self.inner.edges)
            .map_err(|e| JsError::new(&e.to_string()))
    }

    /// Update a node's position.
    #[wasm_bindgen(js_name = setNodePosition)]
    pub fn set_node_position(&mut self, node_id: u32, x: f32, y: f32) -> bool {
        if let Some(node) = self.inner.get_node_mut(node_id) {
            node.position = (x, y);
            true
        } else {
            false
        }
    }

    /// Validate the graph (check for cycles, etc).
    #[wasm_bindgen]
    pub fn validate(&self) -> Result<bool, JsError> {
        match self.inner.topological_sort() {
            Ok(_) => Ok(true),
            Err(GraphError::CycleDetected) => Ok(false),
            Err(e) => Err(JsError::new(&e.to_string())),
        }
    }

    /// Get topologically sorted node IDs.
    #[wasm_bindgen(js_name = getExecutionOrder)]
    pub fn get_execution_order(&self) -> Result<Vec<u32>, JsError> {
        self.inner
            .topological_sort()
            .map_err(|e| JsError::new(&e.to_string()))
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Execution API
// ═══════════════════════════════════════════════════════════════════════════

/// Execute a graph against a mock request for preview/testing.
#[wasm_bindgen(js_name = executeWithMockRequest)]
pub fn execute_with_mock_request(graph: &WasmGraph) -> Result<String, JsError> {
    let request = RequestContext::mock();
    let mut state = ExecutionState::new();
    let result = execute(&graph.inner, &request, &mut state);
    serde_json::to_string(&ExecutionResultJson::from(result))
        .map_err(|e| JsError::new(&e.to_string()))
}

/// Execute a graph against a custom request context.
/// request_json should be a JSON object with fields matching RequestContext.
#[wasm_bindgen(js_name = executeGraph)]
pub fn execute_graph(graph: &WasmGraph, request_json: &str) -> Result<String, JsError> {
    let request: RequestContextJson = serde_json::from_str(request_json)
        .map_err(|e| JsError::new(&format!("Invalid request JSON: {}", e)))?;

    let mut state = ExecutionState::new();
    let result = execute(&graph.inner, &request.into(), &mut state);

    serde_json::to_string(&ExecutionResultJson::from(result))
        .map_err(|e| JsError::new(&e.to_string()))
}

// JSON-friendly version of RequestContext (IpAddr as string)
#[derive(Debug, Clone, Serialize, Deserialize)]
struct RequestContextJson {
    #[serde(default)]
    pub client_ip: Option<String>,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub method: String,
    #[serde(default)]
    pub host: String,
    #[serde(default)]
    pub user_agent: String,
    #[serde(default)]
    pub ja3: Option<String>,
    #[serde(default)]
    pub ja4: Option<String>,
    #[serde(default)]
    pub asn: Option<u32>,
    #[serde(default)]
    pub country: Option<String>,
    #[serde(default)]
    pub proxy_type: Option<String>,
    #[serde(default)]
    pub proxy_description: Option<String>,
    #[serde(default)]
    pub is_hosting_provider: bool,
    #[serde(default)]
    pub headers: HashMap<String, String>,
}

impl From<RequestContextJson> for RequestContext {
    fn from(json: RequestContextJson) -> Self {
        RequestContext {
            client_ip: json.client_ip.and_then(|s| s.parse().ok()),
            path: json.path,
            method: json.method,
            host: json.host,
            user_agent: json.user_agent,
            ja3: json.ja3,
            ja4: json.ja4,
            asn: json.asn,
            country: json.country,
            proxy_type: json.proxy_type,
            proxy_description: json.proxy_description,
            is_hosting_provider: json.is_hosting_provider,
            headers: json.headers,
        }
    }
}

// JSON-friendly version of ExecutionResult
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum ExecutionResultJson {
    Allow,
    Block { status_code: u16, message: String },
    Challenge { challenge_type: String },
    Tarpit { delay_ms: u32 },
    Log { message: String, severity: String },
    Forward { backend: String },
}

impl From<ExecutionResult> for ExecutionResultJson {
    fn from(result: ExecutionResult) -> Self {
        match result {
            ExecutionResult::Allow => ExecutionResultJson::Allow,
            ExecutionResult::Block { status_code, message } => {
                ExecutionResultJson::Block { status_code, message }
            }
            ExecutionResult::Challenge { challenge_type } => {
                ExecutionResultJson::Challenge { challenge_type }
            }
            ExecutionResult::Tarpit { delay_ms } => {
                ExecutionResultJson::Tarpit { delay_ms }
            }
            ExecutionResult::Log { message, severity } => {
                ExecutionResultJson::Log { message, severity }
            }
            ExecutionResult::Forward { backend } => {
                ExecutionResultJson::Forward { backend }
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Schema/Metadata API (for UI building)
// ═══════════════════════════════════════════════════════════════════════════

/// Get all available request fields as JSON array.
#[wasm_bindgen(js_name = getRequestFields)]
pub fn get_request_fields() -> String {
    let fields: Vec<_> = RequestField::all_standard()
        .iter()
        .map(|f| serde_json::json!({
            "value": f,
            "display_name": f.display_name(),
        }))
        .collect();
    serde_json::to_string(&fields).unwrap()
}

/// Get operators for a given field type as JSON array.
#[wasm_bindgen(js_name = getStringOperators)]
pub fn get_string_operators() -> String {
    let ops: Vec<_> = Operator::string_operators()
        .iter()
        .map(|o| serde_json::json!({
            "value": o,
            "display_name": o.display_name(),
        }))
        .collect();
    serde_json::to_string(&ops).unwrap()
}

#[wasm_bindgen(js_name = getNumericOperators)]
pub fn get_numeric_operators() -> String {
    let ops: Vec<_> = Operator::numeric_operators()
        .iter()
        .map(|o| serde_json::json!({
            "value": o,
            "display_name": o.display_name(),
        }))
        .collect();
    serde_json::to_string(&ops).unwrap()
}

#[wasm_bindgen(js_name = getIpOperators)]
pub fn get_ip_operators() -> String {
    let ops: Vec<_> = Operator::ip_operators()
        .iter()
        .map(|o| serde_json::json!({
            "value": o,
            "display_name": o.display_name(),
        }))
        .collect();
    serde_json::to_string(&ops).unwrap()
}

/// Get all node categories as JSON array.
#[wasm_bindgen(js_name = getNodeCategories)]
pub fn get_node_categories() -> String {
    let categories: Vec<_> = NodeCategory::all()
        .iter()
        .map(|c| serde_json::json!({
            "value": format!("{:?}", c),
            "display_name": c.display_name(),
        }))
        .collect();
    serde_json::to_string(&categories).unwrap()
}

/// Get node metadata (inputs, outputs, color) for a given node kind.
#[wasm_bindgen(js_name = getNodeMetadata)]
pub fn get_node_metadata(kind_json: &str) -> Result<String, JsError> {
    let kind: NodeKind = serde_json::from_str(kind_json)
        .map_err(|e| JsError::new(&format!("Invalid node kind JSON: {}", e)))?;

    let color = kind.color();
    let metadata = serde_json::json!({
        "display_name": kind.display_name(),
        "category": kind.category().display_name(),
        "inputs": kind.inputs(),
        "outputs": kind.outputs(),
        "color": {
            "r": color.0,
            "g": color.1,
            "b": color.2,
        }
    });

    Ok(serde_json::to_string(&metadata).unwrap())
}

// ═══════════════════════════════════════════════════════════════════════════
// Node Factory Functions (convenience for JS)
// ═══════════════════════════════════════════════════════════════════════════

/// Create a Request node kind JSON.
#[wasm_bindgen(js_name = createRequestNode)]
pub fn create_request_node() -> String {
    serde_json::to_string(&NodeKind::Request).unwrap()
}

/// Create a Condition node kind JSON.
#[wasm_bindgen(js_name = createConditionNode)]
pub fn create_condition_node(field_json: &str, operator_json: &str, value_json: &str) -> Result<String, JsError> {
    let field: RequestField = serde_json::from_str(field_json)
        .map_err(|e| JsError::new(&format!("Invalid field JSON: {}", e)))?;
    let operator: Operator = serde_json::from_str(operator_json)
        .map_err(|e| JsError::new(&format!("Invalid operator JSON: {}", e)))?;
    let value: ConditionValue = serde_json::from_str(value_json)
        .map_err(|e| JsError::new(&format!("Invalid value JSON: {}", e)))?;

    let kind = NodeKind::Condition { field, operator, value };
    Ok(serde_json::to_string(&kind).unwrap())
}

/// Create an AND node kind JSON.
#[wasm_bindgen(js_name = createAndNode)]
pub fn create_and_node(input_count: u8) -> String {
    serde_json::to_string(&NodeKind::And { input_count }).unwrap()
}

/// Create an OR node kind JSON.
#[wasm_bindgen(js_name = createOrNode)]
pub fn create_or_node(input_count: u8) -> String {
    serde_json::to_string(&NodeKind::Or { input_count }).unwrap()
}

/// Create a NOT node kind JSON.
#[wasm_bindgen(js_name = createNotNode)]
pub fn create_not_node() -> String {
    serde_json::to_string(&NodeKind::Not).unwrap()
}

/// Create a Block action node kind JSON.
#[wasm_bindgen(js_name = createBlockNode)]
pub fn create_block_node(status_code: u16, message: &str) -> String {
    let kind = NodeKind::Action {
        action: ActionType::Block {
            status_code,
            message: message.to_string(),
        },
    };
    serde_json::to_string(&kind).unwrap()
}

/// Create an Allow action node kind JSON.
#[wasm_bindgen(js_name = createAllowNode)]
pub fn create_allow_node() -> String {
    let kind = NodeKind::Action {
        action: ActionType::Allow,
    };
    serde_json::to_string(&kind).unwrap()
}

/// Create a Challenge action node kind JSON.
#[wasm_bindgen(js_name = createChallengeNode)]
pub fn create_challenge_node(challenge_type: &str) -> Result<String, JsError> {
    let ct = match challenge_type {
        "captcha" | "Captcha" => ChallengeType::Captcha,
        "interactive" | "Interactive" => ChallengeType::Interactive,
        "non_interactive" | "NonInteractive" => ChallengeType::NonInteractive,
        _ => return Err(JsError::new("Invalid challenge type. Use: captcha, interactive, or non_interactive")),
    };

    let kind = NodeKind::Action {
        action: ActionType::Challenge { challenge_type: ct },
    };
    Ok(serde_json::to_string(&kind).unwrap())
}

/// Create a RateLimit node kind JSON.
#[wasm_bindgen(js_name = createRateLimitNode)]
pub fn create_rate_limit_node(
    mode: &str,
    counter_name: &str,
    window: &str,
    threshold: u32,
    penalty_ttl_seconds: u32,
) -> Result<String, JsError> {
    let mode = match mode {
        "check" | "CheckRate" => RateLimitMode::CheckRate,
        "check_and_penalize" | "CheckRateAndPenalize" => RateLimitMode::CheckRateAndPenalize,
        "in_penalty_box" | "InPenaltyBox" => RateLimitMode::InPenaltyBox,
        "add_to_penalty_box" | "AddToPenaltyBox" => RateLimitMode::AddToPenaltyBox,
        _ => return Err(JsError::new("Invalid rate limit mode")),
    };

    let window = match window {
        "1s" | "OneSec" => RateWindow::OneSec,
        "10s" | "TenSecs" => RateWindow::TenSecs,
        "60s" | "SixtySecs" => RateWindow::SixtySecs,
        _ => return Err(JsError::new("Invalid window. Use: 1s, 10s, or 60s")),
    };

    let kind = NodeKind::RateLimit {
        mode,
        counter_name: counter_name.to_string(),
        window,
        threshold,
        penalty_ttl_seconds,
    };
    Ok(serde_json::to_string(&kind).unwrap())
}
