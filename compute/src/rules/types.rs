//! Type definitions for the graph-based security rule format.
//!
//! These types match the editor's node/edge structure exactly,
//! allowing rules to be stored and loaded without conversion.

use serde::{Deserialize, Serialize};

// ============================================================================
// Graph Structure (matches editor's React Flow format)
// ============================================================================

/// The complete graph payload from the editor.
/// This is the single format used for both storage and runtime evaluation.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct GraphPayload {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

/// A single node in the visual graph.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct GraphNode {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub position: NodePosition,
    pub data: serde_json::Value,
}

/// Node position for layout (preserved for editor reload).
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct NodePosition {
    pub x: f64,
    pub y: f64,
}

/// An edge connecting two nodes.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct GraphEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    #[serde(rename = "sourceHandle")]
    pub source_handle: Option<String>,
    #[serde(rename = "targetHandle")]
    pub target_handle: Option<String>,
    #[serde(rename = "type")]
    pub edge_type: Option<String>,
}

// ============================================================================
// Node Data Types (parsed from GraphNode.data)
// ============================================================================

/// Node data for condition nodes.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ConditionNodeData {
    pub field: String,
    pub operator: String,
    pub value: String,
}

/// Node data for ruleGroup nodes (inline conditions with match/noMatch outputs).
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct RuleGroupNodeData {
    pub name: Option<String>,
    pub logic: String,
    pub conditions: Vec<RuleGroupCondition>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct RuleGroupCondition {
    pub id: String,
    pub field: String,
    pub operator: String,
    pub value: String,
}

/// Node data for action nodes.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ActionNodeData {
    pub action: String,
    #[serde(rename = "statusCode")]
    pub status_code: Option<u16>,
    pub message: Option<String>,
}

/// Node data for backend nodes.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct BackendNodeData {
    pub name: String,
    pub host: String,
    pub port: Option<u16>,
    #[serde(rename = "useTLS")]
    pub use_tls: Option<bool>,
}

/// Node data for rateLimit nodes.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct RateLimitNodeData {
    /// Maximum requests allowed in the window
    pub limit: u32,
    /// Time window: "second", "minute", or "hour"
    #[serde(rename = "windowUnit")]
    pub window_unit: String,
    /// Key to identify clients: "ip", "fingerprint", "header", or "path"
    #[serde(rename = "keyBy")]
    pub key_by: String,
    /// Header name when keyBy is "header"
    #[serde(rename = "headerName")]
    pub header_name: Option<String>,
}

/// Node data for listLookup nodes.
#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ListLookupNodeData {
    #[serde(rename = "listType")]
    pub list_type: String,
    pub field: String,
}

/// Node data for logic nodes.
#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct LogicNodeData {
    pub operation: String,
}
