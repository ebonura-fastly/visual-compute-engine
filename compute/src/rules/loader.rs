//! Graph loader with compression support.
//!
//! Handles loading the visual graph format from Config Store.
//! The graph format (nodes + edges) is the single source of truth,
//! shared between the editor and compute instance.

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use flate2::read::GzDecoder;
use serde::Deserialize;
use std::io::Read;

use super::types::GraphPayload;

/// Combined payload stored in config store.
/// Key is just the service ID, value is this JSON structure.
#[derive(Debug, Deserialize)]
pub struct VcePayload {
    pub version: String,
    #[serde(rename = "deployedAt")]
    pub deployed_at: String,
    pub rules_packed: String,
}

/// Errors that can occur during graph loading.
#[derive(Debug, thiserror::Error)]
pub enum LoadError {
    #[error("Config store key not found: {0}")]
    KeyNotFound(String),

    #[error("Base64 decode error: {0}")]
    Base64Error(#[from] base64::DecodeError),

    #[error("Gzip decompression error: {0}")]
    DecompressError(#[from] std::io::Error),

    #[error("JSON parse error: {0}")]
    JsonError(#[from] serde_json::Error),

    #[error("Invalid graph format: missing nodes or edges")]
    InvalidFormat,

    #[error("Empty rules_packed in payload")]
    EmptyRules,
}

/// Decompresses and parses graph payload from Config Store.
///
/// Expected encoding: base64(gzip(JSON)) or "raw:" + base64(JSON)
///
/// The JSON must be a graph format: { nodes: [...], edges: [...] }
pub fn decompress_graph(packed: &str) -> Result<GraphPayload, LoadError> {
    let json = if packed.starts_with("raw:") {
        // Uncompressed fallback format
        let b64 = &packed[4..];
        let bytes = BASE64.decode(b64)?;
        String::from_utf8(bytes).map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?
    } else {
        // Compressed format: base64(gzip(json))
        let compressed = BASE64.decode(packed)?;
        let mut decoder = GzDecoder::new(&compressed[..]);
        let mut json = String::new();
        decoder.read_to_string(&mut json)?;
        json
    };

    // Parse as graph format
    let value: serde_json::Value = serde_json::from_str(&json)?;

    if value.get("nodes").is_none() || value.get("edges").is_none() {
        return Err(LoadError::InvalidFormat);
    }

    let graph: GraphPayload = serde_json::from_value(value)?;
    println!("Loaded graph with {} nodes, {} edges", graph.nodes.len(), graph.edges.len());

    Ok(graph)
}

/// Loads graph from Config Store.
///
/// Key format: just the `service_id`
/// Value format: JSON with { version, deployedAt, rules_packed }
pub fn load_graph_from_store(
    store: &fastly::ConfigStore,
    service_id: &str,
) -> Result<GraphPayload, LoadError> {
    // Key is just the service ID
    let payload_json = store
        .get(service_id)
        .ok_or_else(|| LoadError::KeyNotFound(service_id.to_string()))?;

    println!("Loading graph for service {}...", service_id);

    // Parse the VcePayload JSON
    let payload: VcePayload = serde_json::from_str(&payload_json)?;
    println!("Payload version: {}, deployed: {}", payload.version, payload.deployed_at);

    if payload.rules_packed.is_empty() {
        return Err(LoadError::EmptyRules);
    }

    decompress_graph(&payload.rules_packed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decompress_graph_raw_format() {
        // Test the raw (uncompressed) format
        let json = r#"{"nodes":[{"id":"1","type":"request","position":{"x":0,"y":0},"data":{}},{"id":"2","type":"backend","position":{"x":200,"y":0},"data":{"name":"origin","host":"example.com","port":443}}],"edges":[{"id":"e1","source":"1","target":"2"}]}"#;
        let encoded = format!("raw:{}", BASE64.encode(json));

        let graph = decompress_graph(&encoded).unwrap();
        assert_eq!(graph.nodes.len(), 2);
        assert_eq!(graph.edges.len(), 1);
        assert_eq!(graph.nodes[0].node_type, "request");
        assert_eq!(graph.nodes[1].node_type, "backend");
    }

    #[test]
    fn test_decompress_graph_with_rule_group() {
        // Test graph with a ruleGroup node
        let json = r#"{
            "nodes": [
                {"id": "1", "type": "request", "position": {"x": 0, "y": 0}, "data": {}},
                {"id": "2", "type": "ruleGroup", "position": {"x": 200, "y": 0}, "data": {
                    "name": "Block Admin",
                    "logic": "AND",
                    "conditions": [
                        {"id": "c1", "field": "path", "operator": "startsWith", "value": "/admin"}
                    ]
                }},
                {"id": "3", "type": "action", "position": {"x": 400, "y": -50}, "data": {"action": "block", "statusCode": 403}},
                {"id": "4", "type": "backend", "position": {"x": 400, "y": 50}, "data": {"name": "origin", "host": "example.com"}}
            ],
            "edges": [
                {"id": "e1", "source": "1", "target": "2"},
                {"id": "e2", "source": "2", "sourceHandle": "match", "target": "3"},
                {"id": "e3", "source": "2", "sourceHandle": "noMatch", "target": "4"}
            ]
        }"#;
        let encoded = format!("raw:{}", BASE64.encode(json));

        let graph = decompress_graph(&encoded).unwrap();
        assert_eq!(graph.nodes.len(), 4);
        assert_eq!(graph.edges.len(), 3);

        // Verify ruleGroup node
        let rule_group = graph.nodes.iter().find(|n| n.node_type == "ruleGroup").unwrap();
        assert!(rule_group.data.get("name").is_some());
        assert!(rule_group.data.get("conditions").is_some());
    }

    #[test]
    fn test_invalid_format_rejected() {
        // Test that non-graph formats are rejected
        let json = r#"{"v":"1.0","r":["rule1"],"d":{}}"#;
        let encoded = format!("raw:{}", BASE64.encode(json));

        let result = decompress_graph(&encoded);
        assert!(result.is_err());
        assert!(matches!(result, Err(LoadError::InvalidFormat)));
    }

    #[test]
    fn test_decompress_gzip_format() {
        // Test gzip compressed graph format
        // This payload was generated with: gzip(json) | base64
        use flate2::write::GzEncoder;
        use flate2::Compression;
        use std::io::Write;

        let json = r#"{"nodes":[{"id":"1","type":"request","position":{"x":0,"y":0},"data":{}}],"edges":[]}"#;

        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(json.as_bytes()).unwrap();
        let compressed = encoder.finish().unwrap();
        let encoded = BASE64.encode(&compressed);

        let graph = decompress_graph(&encoded).unwrap();
        assert_eq!(graph.nodes.len(), 1);
        assert_eq!(graph.nodes[0].node_type, "request");
    }
}
