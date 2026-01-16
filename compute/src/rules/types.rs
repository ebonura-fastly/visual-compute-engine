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
/// Supports: block, allow, challenge, log, redirect
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ActionNodeData {
    pub action: String,
    #[serde(rename = "statusCode")]
    pub status_code: Option<u16>,
    pub message: Option<String>,
    /// Redirect URL (when action is "redirect")
    pub url: Option<String>,
    /// Preserve query string on redirect (when action is "redirect")
    #[serde(rename = "preserveQuery")]
    pub preserve_query: Option<bool>,
}

/// Node data for backend nodes - full parity with Fastly BackendBuilder.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct BackendNodeData {
    // Basic
    pub name: String,
    pub host: String,
    pub port: Option<u16>,

    // Timeouts (ms)
    #[serde(rename = "connectTimeout")]
    pub connect_timeout: Option<u64>,
    #[serde(rename = "firstByteTimeout")]
    pub first_byte_timeout: Option<u64>,
    #[serde(rename = "betweenBytesTimeout")]
    pub between_bytes_timeout: Option<u64>,

    // SSL/TLS
    #[serde(rename = "useTLS")]
    pub use_tls: Option<bool>,
    #[serde(rename = "verifyCertificate")]
    pub verify_certificate: Option<bool>,
    #[serde(rename = "sniHostname")]
    pub sni_hostname: Option<String>,
    #[serde(rename = "caCertificate")]
    pub ca_certificate: Option<String>,
    #[serde(rename = "clientCertificate")]
    pub client_certificate: Option<String>,
    #[serde(rename = "clientKey")]
    pub client_key: Option<String>,
    #[serde(rename = "minTLSVersion")]
    pub min_tls_version: Option<String>,
    #[serde(rename = "maxTLSVersion")]
    pub max_tls_version: Option<String>,

    // Host
    #[serde(rename = "overrideHost")]
    pub override_host: Option<String>,
    #[serde(rename = "preferIPv6")]
    pub prefer_ipv6: Option<bool>,

    // Connection Pooling
    #[serde(rename = "enablePooling")]
    pub enable_pooling: Option<bool>,
    #[serde(rename = "keepaliveTime")]
    pub keepalive_time: Option<u64>,
    #[serde(rename = "maxConnections")]
    pub max_connections: Option<u32>,
    #[serde(rename = "maxConnectionUses")]
    pub max_connection_uses: Option<u32>,
    #[serde(rename = "maxConnectionLifetime")]
    pub max_connection_lifetime: Option<u64>,

    // TCP Keepalive
    #[serde(rename = "tcpKeepalive")]
    pub tcp_keepalive: Option<bool>,
    #[serde(rename = "tcpKeepaliveTime")]
    pub tcp_keepalive_time: Option<u64>,
    #[serde(rename = "tcpKeepaliveInterval")]
    pub tcp_keepalive_interval: Option<u64>,
    #[serde(rename = "tcpKeepaliveProbes")]
    pub tcp_keepalive_probes: Option<u32>,
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

/// Node data for header nodes.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct HeaderNodeData {
    /// Operation: "set" or "remove"
    pub operation: String,
    /// Header name
    pub name: String,
    /// Header value (for set operation)
    pub value: Option<String>,
}

/// Node data for redirect nodes.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct RedirectNodeData {
    /// Target URL
    pub url: String,
    /// HTTP status code (301, 302, 307, 308)
    #[serde(rename = "statusCode")]
    pub status_code: Option<u16>,
    /// Whether to preserve the query string
    #[serde(rename = "preserveQuery")]
    pub preserve_query: Option<bool>,
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_backend_node_basic_parsing() {
        let json = r#"{
            "name": "my-backend",
            "host": "origin.example.com",
            "port": 443,
            "useTLS": true
        }"#;

        let data: BackendNodeData = serde_json::from_str(json).unwrap();
        assert_eq!(data.name, "my-backend");
        assert_eq!(data.host, "origin.example.com");
        assert_eq!(data.port, Some(443));
        assert_eq!(data.use_tls, Some(true));
    }

    #[test]
    fn test_backend_node_timeouts() {
        let json = r#"{
            "name": "origin",
            "host": "example.com",
            "connectTimeout": 2000,
            "firstByteTimeout": 30000,
            "betweenBytesTimeout": 15000
        }"#;

        let data: BackendNodeData = serde_json::from_str(json).unwrap();
        assert_eq!(data.connect_timeout, Some(2000));
        assert_eq!(data.first_byte_timeout, Some(30000));
        assert_eq!(data.between_bytes_timeout, Some(15000));
    }

    #[test]
    fn test_backend_node_tls_settings() {
        let json = r#"{
            "name": "origin",
            "host": "secure.example.com",
            "useTLS": true,
            "verifyCertificate": true,
            "sniHostname": "custom-sni.example.com",
            "minTLSVersion": "1.2",
            "maxTLSVersion": "1.3"
        }"#;

        let data: BackendNodeData = serde_json::from_str(json).unwrap();
        assert_eq!(data.use_tls, Some(true));
        assert_eq!(data.verify_certificate, Some(true));
        assert_eq!(data.sni_hostname, Some("custom-sni.example.com".to_string()));
        assert_eq!(data.min_tls_version, Some("1.2".to_string()));
        assert_eq!(data.max_tls_version, Some("1.3".to_string()));
    }

    #[test]
    fn test_backend_node_connection_pooling() {
        let json = r#"{
            "name": "origin",
            "host": "example.com",
            "enablePooling": true,
            "keepaliveTime": 60000,
            "maxConnections": 100,
            "maxConnectionUses": 1000,
            "maxConnectionLifetime": 3600000
        }"#;

        let data: BackendNodeData = serde_json::from_str(json).unwrap();
        assert_eq!(data.enable_pooling, Some(true));
        assert_eq!(data.keepalive_time, Some(60000));
        assert_eq!(data.max_connections, Some(100));
        assert_eq!(data.max_connection_uses, Some(1000));
        assert_eq!(data.max_connection_lifetime, Some(3600000));
    }

    #[test]
    fn test_backend_node_unlimited_values() {
        // 0 = unlimited for max_connections, max_connection_uses
        // 0 = unlimited for max_connection_lifetime (in Fastly SDK)
        let json = r#"{
            "name": "origin",
            "host": "example.com",
            "maxConnections": 0,
            "maxConnectionUses": 0,
            "maxConnectionLifetime": 0
        }"#;

        let data: BackendNodeData = serde_json::from_str(json).unwrap();
        assert_eq!(data.max_connections, Some(0));
        assert_eq!(data.max_connection_uses, Some(0));
        assert_eq!(data.max_connection_lifetime, Some(0));
    }

    #[test]
    fn test_backend_node_tcp_keepalive() {
        let json = r#"{
            "name": "origin",
            "host": "example.com",
            "tcpKeepalive": true,
            "tcpKeepaliveTime": 7200,
            "tcpKeepaliveInterval": 75,
            "tcpKeepaliveProbes": 9
        }"#;

        let data: BackendNodeData = serde_json::from_str(json).unwrap();
        assert_eq!(data.tcp_keepalive, Some(true));
        assert_eq!(data.tcp_keepalive_time, Some(7200));
        assert_eq!(data.tcp_keepalive_interval, Some(75));
        assert_eq!(data.tcp_keepalive_probes, Some(9));
    }

    #[test]
    fn test_backend_node_host_overrides() {
        let json = r#"{
            "name": "origin",
            "host": "10.0.0.1",
            "overrideHost": "public.example.com",
            "preferIPv6": true
        }"#;

        let data: BackendNodeData = serde_json::from_str(json).unwrap();
        assert_eq!(data.override_host, Some("public.example.com".to_string()));
        assert_eq!(data.prefer_ipv6, Some(true));
    }

    #[test]
    fn test_backend_node_full_config() {
        // Test a complete backend configuration with all fields
        let json = r#"{
            "name": "production-origin",
            "host": "origin.prod.example.com",
            "port": 8443,
            "connectTimeout": 1000,
            "firstByteTimeout": 15000,
            "betweenBytesTimeout": 10000,
            "useTLS": true,
            "verifyCertificate": true,
            "sniHostname": "origin.prod.example.com",
            "minTLSVersion": "1.2",
            "maxTLSVersion": "1.3",
            "overrideHost": "backend.internal",
            "preferIPv6": false,
            "enablePooling": true,
            "keepaliveTime": 120000,
            "maxConnections": 50,
            "maxConnectionUses": 500,
            "maxConnectionLifetime": 1800000,
            "tcpKeepalive": true,
            "tcpKeepaliveTime": 60,
            "tcpKeepaliveInterval": 30,
            "tcpKeepaliveProbes": 5
        }"#;

        let data: BackendNodeData = serde_json::from_str(json).unwrap();

        // Basic
        assert_eq!(data.name, "production-origin");
        assert_eq!(data.host, "origin.prod.example.com");
        assert_eq!(data.port, Some(8443));

        // Timeouts
        assert_eq!(data.connect_timeout, Some(1000));
        assert_eq!(data.first_byte_timeout, Some(15000));
        assert_eq!(data.between_bytes_timeout, Some(10000));

        // TLS
        assert_eq!(data.use_tls, Some(true));
        assert_eq!(data.verify_certificate, Some(true));
        assert_eq!(data.sni_hostname, Some("origin.prod.example.com".to_string()));
        assert_eq!(data.min_tls_version, Some("1.2".to_string()));
        assert_eq!(data.max_tls_version, Some("1.3".to_string()));

        // Host
        assert_eq!(data.override_host, Some("backend.internal".to_string()));
        assert_eq!(data.prefer_ipv6, Some(false));

        // Pooling
        assert_eq!(data.enable_pooling, Some(true));
        assert_eq!(data.keepalive_time, Some(120000));
        assert_eq!(data.max_connections, Some(50));
        assert_eq!(data.max_connection_uses, Some(500));
        assert_eq!(data.max_connection_lifetime, Some(1800000));

        // TCP Keepalive
        assert_eq!(data.tcp_keepalive, Some(true));
        assert_eq!(data.tcp_keepalive_time, Some(60));
        assert_eq!(data.tcp_keepalive_interval, Some(30));
        assert_eq!(data.tcp_keepalive_probes, Some(5));
    }

    #[test]
    fn test_backend_node_minimal_config() {
        // Test that only name and host are required
        let json = r#"{
            "name": "simple",
            "host": "example.com"
        }"#;

        let data: BackendNodeData = serde_json::from_str(json).unwrap();
        assert_eq!(data.name, "simple");
        assert_eq!(data.host, "example.com");
        assert!(data.port.is_none());
        assert!(data.connect_timeout.is_none());
        assert!(data.use_tls.is_none());
        assert!(data.enable_pooling.is_none());
    }

    #[test]
    fn test_backend_node_serialization_roundtrip() {
        let original = BackendNodeData {
            name: "test-backend".to_string(),
            host: "test.example.com".to_string(),
            port: Some(443),
            connect_timeout: Some(1000),
            first_byte_timeout: Some(15000),
            between_bytes_timeout: Some(10000),
            use_tls: Some(true),
            verify_certificate: Some(true),
            sni_hostname: Some("sni.example.com".to_string()),
            ca_certificate: None,
            client_certificate: None,
            client_key: None,
            min_tls_version: Some("1.2".to_string()),
            max_tls_version: Some("1.3".to_string()),
            override_host: Some("override.example.com".to_string()),
            prefer_ipv6: Some(false),
            enable_pooling: Some(true),
            keepalive_time: Some(60000),
            max_connections: Some(100),
            max_connection_uses: Some(1000),
            max_connection_lifetime: Some(3600000),
            tcp_keepalive: Some(true),
            tcp_keepalive_time: Some(7200),
            tcp_keepalive_interval: Some(75),
            tcp_keepalive_probes: Some(9),
        };

        // Serialize to JSON
        let json = serde_json::to_string(&original).unwrap();

        // Deserialize back
        let deserialized: BackendNodeData = serde_json::from_str(&json).unwrap();

        // Verify roundtrip
        assert_eq!(original.name, deserialized.name);
        assert_eq!(original.host, deserialized.host);
        assert_eq!(original.port, deserialized.port);
        assert_eq!(original.connect_timeout, deserialized.connect_timeout);
        assert_eq!(original.max_connections, deserialized.max_connections);
        assert_eq!(original.tcp_keepalive_probes, deserialized.tcp_keepalive_probes);
    }

    #[test]
    fn test_graph_payload_with_backend_node() {
        let json = r#"{
            "nodes": [
                {
                    "id": "req-1",
                    "type": "request",
                    "position": { "x": 100, "y": 100 },
                    "data": {}
                },
                {
                    "id": "backend-1",
                    "type": "backend",
                    "position": { "x": 300, "y": 100 },
                    "data": {
                        "name": "httpbin",
                        "host": "httpbin.org",
                        "port": 443,
                        "useTLS": true,
                        "connectTimeout": 2000,
                        "maxConnections": 0
                    }
                }
            ],
            "edges": [
                {
                    "id": "e1",
                    "source": "req-1",
                    "sourceHandle": "request",
                    "target": "backend-1",
                    "targetHandle": "route"
                }
            ]
        }"#;

        let graph: GraphPayload = serde_json::from_str(json).unwrap();
        assert_eq!(graph.nodes.len(), 2);
        assert_eq!(graph.edges.len(), 1);

        // Find the backend node and parse its data
        let backend_node = graph.nodes.iter().find(|n| n.node_type == "backend").unwrap();
        let backend_data: BackendNodeData = serde_json::from_value(backend_node.data.clone()).unwrap();

        assert_eq!(backend_data.name, "httpbin");
        assert_eq!(backend_data.host, "httpbin.org");
        assert_eq!(backend_data.port, Some(443));
        assert_eq!(backend_data.connect_timeout, Some(2000));
        assert_eq!(backend_data.max_connections, Some(0)); // 0 = unlimited
    }
}
