//! Graph-based rule interpreter.
//!
//! Evaluates security rules stored as a visual graph (nodes + edges).
//! This allows the editor to deploy rules directly without conversion.

use std::collections::HashMap;
use fastly::backend::BackendBuilder;
use fastly::{Request, Response};

use std::time::Duration;
use fastly::erl::{ERL, RateCounter, Penaltybox, RateWindow};

use super::types::{
    GraphPayload, GraphNode, GraphEdge,
    BackendNodeData, ActionNodeData, RuleGroupNodeData, ConditionNodeData, RateLimitNodeData,
};

/// Result of evaluating the graph for a request.
pub enum GraphResult {
    /// Route the request to a backend
    Route { backend_name: String, backend_host: String, backend_port: u16, use_tls: bool },
    /// Block the request with a response
    Block { status_code: u16, message: String },
    /// Allow the request (pass through to default backend)
    Allow,
    /// No matching path found
    NoMatch,
}

/// Evaluates a graph against an incoming request.
pub struct GraphInterpreter<'a> {
    nodes: HashMap<String, &'a GraphNode>,
    edges_from: HashMap<String, Vec<&'a GraphEdge>>,
    rate_limiter: Option<ERL>,
}

impl<'a> GraphInterpreter<'a> {
    /// Create a new interpreter for the given graph.
    pub fn new(graph: &'a GraphPayload) -> Self {
        let mut nodes = HashMap::new();
        let mut edges_from: HashMap<String, Vec<&GraphEdge>> = HashMap::new();

        for node in &graph.nodes {
            nodes.insert(node.id.clone(), node);
        }

        for edge in &graph.edges {
            edges_from.entry(edge.source.clone()).or_default().push(edge);
        }

        // Initialize rate limiter if graph contains rateLimit nodes
        let has_rate_limit = graph.nodes.iter().any(|n| n.node_type == "rateLimit");
        let rate_limiter = if has_rate_limit {
            // Try to open the rate counter and penalty box
            // These must be configured in fastly.toml and linked to the service
            let counter = RateCounter::open("vce_rate_counter");
            let penaltybox = Penaltybox::open("vce_penalty_box");
            Some(ERL::open(counter, penaltybox))
        } else {
            None
        };

        Self { nodes, edges_from, rate_limiter }
    }

    /// Evaluate the graph for an incoming request.
    pub fn evaluate(&self, req: &Request) -> GraphResult {
        // Find the request node (entry point)
        let request_node = self.nodes.values()
            .find(|n| n.node_type == "request");

        let request_node = match request_node {
            Some(n) => n,
            None => {
                println!("[Graph] No request node found");
                return GraphResult::NoMatch;
            }
        };

        println!("[Graph] Starting evaluation from request node {}", request_node.id);

        // Follow edges from the request node
        self.follow_path(&request_node.id, req)
    }

    /// Follow edges from a node, evaluating conditions along the way.
    fn follow_path(&self, node_id: &str, req: &Request) -> GraphResult {
        let node = match self.nodes.get(node_id) {
            Some(n) => n,
            None => return GraphResult::NoMatch,
        };

        println!("[Graph] Evaluating node {} (type: {})", node_id, node.node_type);

        match node.node_type.as_str() {
            "request" => {
                // Entry point - follow outgoing edges
                self.follow_outgoing(node_id, None, req)
            }

            "ruleGroup" => {
                // Evaluate inline conditions
                let data: RuleGroupNodeData = match serde_json::from_value(node.data.clone()) {
                    Ok(d) => d,
                    Err(e) => {
                        println!("[Graph] Failed to parse ruleGroup data: {}", e);
                        return GraphResult::NoMatch;
                    }
                };

                let matches = self.evaluate_rule_group(&data, req);
                println!("[Graph] RuleGroup '{}' matches: {}", data.name.as_deref().unwrap_or("unnamed"), matches);

                // Follow the appropriate output handle
                let handle = if matches { "match" } else { "noMatch" };
                self.follow_outgoing(node_id, Some(handle), req)
            }

            "condition" => {
                // Evaluate single condition
                let data: ConditionNodeData = match serde_json::from_value(node.data.clone()) {
                    Ok(d) => d,
                    Err(e) => {
                        println!("[Graph] Failed to parse condition data: {}", e);
                        return GraphResult::NoMatch;
                    }
                };

                let matches = self.evaluate_condition(&data, req);
                println!("[Graph] Condition {}={} matches: {}", data.field, data.value, matches);

                // UI uses "true"/"false" handles for condition nodes
                if matches {
                    self.follow_outgoing(node_id, Some("true"), req)
                } else {
                    self.follow_outgoing(node_id, Some("false"), req)
                }
            }

            "action" => {
                // Terminal node - return action result
                let data: ActionNodeData = match serde_json::from_value(node.data.clone()) {
                    Ok(d) => d,
                    Err(e) => {
                        println!("[Graph] Failed to parse action data: {}", e);
                        return GraphResult::Block { status_code: 500, message: "Invalid action config".to_string() };
                    }
                };

                println!("[Graph] Action: {} (status: {:?})", data.action, data.status_code);

                match data.action.as_str() {
                    "block" => GraphResult::Block {
                        status_code: data.status_code.unwrap_or(403),
                        message: data.message.unwrap_or_else(|| "Blocked".to_string()),
                    },
                    "allow" => GraphResult::Allow,
                    _ => GraphResult::Block {
                        status_code: data.status_code.unwrap_or(403),
                        message: data.message.unwrap_or_else(|| "Blocked".to_string()),
                    },
                }
            }

            "backend" => {
                // Terminal node - route to backend
                let data: BackendNodeData = match serde_json::from_value(node.data.clone()) {
                    Ok(d) => d,
                    Err(e) => {
                        println!("[Graph] Failed to parse backend data: {}", e);
                        return GraphResult::NoMatch;
                    }
                };

                println!("[Graph] Routing to backend: {} ({})", data.name, data.host);

                GraphResult::Route {
                    backend_name: data.name,
                    backend_host: data.host,
                    backend_port: data.port.unwrap_or(443),
                    use_tls: data.use_tls.unwrap_or(true),
                }
            }

            "rateLimit" => {
                // Rate limiting node - check if client has exceeded rate limit
                let data: RateLimitNodeData = match serde_json::from_value(node.data.clone()) {
                    Ok(d) => d,
                    Err(e) => {
                        println!("[Graph] Failed to parse rateLimit data: {}", e);
                        // Fail open - continue to "ok" path
                        return self.follow_outgoing(node_id, Some("ok"), req);
                    }
                };

                // Get the client identifier based on keyBy
                let entry = self.get_rate_limit_key(&data, req);
                println!("[Graph] Rate limit check for entry: {} (limit: {}/{})", entry, data.limit, data.window_unit);

                // Check if we have a rate limiter
                let exceeded = match &self.rate_limiter {
                    Some(erl) => {
                        // Map window unit to RateWindow enum
                        let window = match data.window_unit.as_str() {
                            "second" => RateWindow::OneSec,
                            "minute" => RateWindow::SixtySecs,
                            "hour" => RateWindow::SixtySecs, // Use 60s window for hourly, limit is adjusted
                            _ => RateWindow::SixtySecs,
                        };

                        // Calculate the rate limit based on window
                        // ERL checks requests per second, so we need to convert
                        let rps_limit = match data.window_unit.as_str() {
                            "second" => data.limit,
                            "minute" => data.limit, // limit per 60s window
                            "hour" => data.limit / 60, // approximate hourly to per-minute
                            _ => data.limit,
                        };

                        // Penalty box TTL: 2 minutes for second/minute, 10 minutes for hour
                        let ttl = match data.window_unit.as_str() {
                            "hour" => Duration::from_secs(600),
                            _ => Duration::from_secs(120),
                        };

                        match erl.check_rate(&entry, 1, window, rps_limit, ttl) {
                            Ok(is_blocked) => {
                                println!("[Graph] Rate limit result: blocked={}", is_blocked);
                                is_blocked
                            }
                            Err(e) => {
                                println!("[Graph] Rate limit error: {:?}, failing open", e);
                                false // Fail open on error
                            }
                        }
                    }
                    None => {
                        println!("[Graph] No rate limiter configured, failing open");
                        false // Fail open if no rate limiter
                    }
                };

                // Follow the appropriate output handle
                let handle = if exceeded { "exceeded" } else { "ok" };
                self.follow_outgoing(node_id, Some(handle), req)
            }

            _ => {
                println!("[Graph] Unknown node type: {}", node.node_type);
                self.follow_outgoing(node_id, None, req)
            }
        }
    }

    /// Get the rate limit key based on the keyBy field
    fn get_rate_limit_key(&self, data: &RateLimitNodeData, req: &Request) -> String {
        match data.key_by.as_str() {
            "ip" => {
                self.get_field_value("clientIp", req)
                    .unwrap_or_else(|| "unknown".to_string())
            }
            "fingerprint" => {
                // Try JA4 first, then JA3
                self.get_field_value("ja4", req)
                    .or_else(|| self.get_field_value("ja3", req))
                    .unwrap_or_else(|| "unknown".to_string())
            }
            "header" => {
                if let Some(header_name) = &data.header_name {
                    req.get_header_str(header_name)
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| "unknown".to_string())
                } else {
                    "unknown".to_string()
                }
            }
            "path" => req.get_path().to_string(),
            _ => "unknown".to_string(),
        }
    }

    /// Follow outgoing edges from a node, optionally filtering by source handle.
    fn follow_outgoing(&self, node_id: &str, source_handle: Option<&str>, req: &Request) -> GraphResult {
        let edges = match self.edges_from.get(node_id) {
            Some(e) => e,
            None => {
                println!("[Graph] No outgoing edges from {}", node_id);
                return GraphResult::NoMatch;
            }
        };

        // Filter by source handle if specified
        let matching_edges: Vec<_> = edges.iter()
            .filter(|e| {
                match source_handle {
                    Some(h) => e.source_handle.as_deref() == Some(h),
                    None => true,
                }
            })
            .collect();

        if matching_edges.is_empty() {
            println!("[Graph] No matching edges from {} (handle: {:?})", node_id, source_handle);
            return GraphResult::NoMatch;
        }

        // Follow the first matching edge
        let edge = matching_edges[0];
        println!("[Graph] Following edge {} -> {}", edge.source, edge.target);
        self.follow_path(&edge.target, req)
    }

    /// Evaluate a rule group's conditions.
    fn evaluate_rule_group(&self, data: &RuleGroupNodeData, req: &Request) -> bool {
        let logic = data.logic.to_uppercase();

        if data.conditions.is_empty() {
            return true; // No conditions = always match
        }

        let results: Vec<bool> = data.conditions.iter()
            .map(|c| {
                let cond = ConditionNodeData {
                    field: c.field.clone(),
                    operator: c.operator.clone(),
                    value: c.value.clone(),
                };
                self.evaluate_condition(&cond, req)
            })
            .collect();

        match logic.as_str() {
            "AND" => results.iter().all(|&r| r),
            "OR" => results.iter().any(|&r| r),
            "NOT" => !results.iter().any(|&r| r),
            _ => results.iter().all(|&r| r), // Default to AND
        }
    }

    /// Evaluate a single condition against a request.
    fn evaluate_condition(&self, data: &ConditionNodeData, req: &Request) -> bool {
        let field_value = self.get_field_value(&data.field, req);
        let field_value = field_value.as_deref().unwrap_or("");

        println!("[Graph] Checking {} {} {} (actual: {})", data.field, data.operator, data.value, field_value);

        match data.operator.as_str() {
            "equals" => field_value == data.value,
            "startsWith" | "starts" => field_value.starts_with(&data.value),
            "endsWith" | "ends" => field_value.ends_with(&data.value),
            "contains" => field_value.contains(&data.value),
            "notEquals" | "!=" => field_value != data.value,
            "in" => data.value.split(',').map(|s| s.trim()).any(|v| field_value == v),
            "notIn" | "!in" => !data.value.split(',').map(|s| s.trim()).any(|v| field_value == v),
            "matches" => {
                // Simple regex matching
                regex::Regex::new(&data.value)
                    .map(|re| re.is_match(field_value))
                    .unwrap_or(false)
            }
            _ => {
                println!("[Graph] Unknown operator: {}", data.operator);
                false
            }
        }
    }

    /// Get the value of a field from the request.
    fn get_field_value(&self, field: &str, req: &Request) -> Option<String> {
        match field {
            // Request basics
            "path" => Some(req.get_path().to_string()),
            "query" => {
                let url = req.get_url_str();
                url.find('?').map(|i| url[i..].to_string())
            }
            "method" => Some(req.get_method_str().to_string()),
            "host" => req.get_header_str("host")
                .or_else(|| req.get_header_str("fastly-orig-host"))
                .map(|s| s.to_string()),
            "scheme" => {
                // Check X-Forwarded-Proto or default to https for Fastly
                req.get_header_str("x-forwarded-proto")
                    .map(|s| s.to_string())
                    .or_else(|| Some("https".to_string()))
            }

            // Client & Connection
            "clientIp" | "client-ip" | "ip" => {
                req.get_header_str("fastly-client-ip")
                    .or_else(|| req.get_header_str("x-forwarded-for"))
                    .or_else(|| req.get_header_str("x-real-ip"))
                    .map(|s| s.split(',').next().unwrap_or(s).trim().to_string())
            }
            "asn" => req.get_header_str("client-geo-asn")
                .or_else(|| req.get_header_str("fastly-client-geo-asn"))
                .map(|s| s.to_string()),
            "datacenter" | "pop" => {
                // FASTLY_POP is set as env var, but we can also check headers
                req.get_header_str("fastly-pop")
                    .map(|s| s.to_string())
                    .or_else(|| std::env::var("FASTLY_POP").ok())
            }

            // Geolocation
            "country" => req.get_header_str("client-geo-country")
                .or_else(|| req.get_header_str("fastly-client-geo-country"))
                .map(|s| s.to_string()),
            "city" => req.get_header_str("client-geo-city")
                .or_else(|| req.get_header_str("fastly-client-geo-city"))
                .map(|s| s.to_string()),
            "continent" => req.get_header_str("client-geo-continent")
                .or_else(|| req.get_header_str("fastly-client-geo-continent"))
                .map(|s| s.to_string()),

            // Common Request Headers
            "userAgent" | "user-agent" => req.get_header_str("user-agent").map(|s| s.to_string()),
            "referer" | "referrer" => req.get_header_str("referer").map(|s| s.to_string()),
            "accept" => req.get_header_str("accept").map(|s| s.to_string()),
            "acceptLanguage" | "accept-language" => req.get_header_str("accept-language").map(|s| s.to_string()),
            "acceptEncoding" | "accept-encoding" => req.get_header_str("accept-encoding").map(|s| s.to_string()),
            "contentType" | "content-type" => req.get_header_str("content-type").map(|s| s.to_string()),
            "cacheControl" | "cache-control" => req.get_header_str("cache-control").map(|s| s.to_string()),
            "xForwardedFor" | "x-forwarded-for" => req.get_header_str("x-forwarded-for").map(|s| s.to_string()),
            "xForwardedProto" | "x-forwarded-proto" => req.get_header_str("x-forwarded-proto").map(|s| s.to_string()),
            "xRequestedWith" | "x-requested-with" => req.get_header_str("x-requested-with").map(|s| s.to_string()),

            // TLS/Security fingerprints (these come from Fastly's client info via headers)
            "tlsVersion" | "tls-version" => req.get_header_str("fastly-ssl-protocol")
                .or_else(|| req.get_header_str("tls-client-protocol"))
                .map(|s| s.to_string()),
            "tlsCipher" | "tls-cipher" => req.get_header_str("fastly-ssl-cipher")
                .or_else(|| req.get_header_str("tls-client-cipher"))
                .map(|s| s.to_string()),
            "ja3" => req.get_header_str("fastly-client-ja3-md5")
                .or_else(|| req.get_header_str("tls-ja3-md5"))
                .map(|s| s.to_string()),
            "ja4" => req.get_header_str("fastly-client-ja4")
                .or_else(|| req.get_header_str("tls-ja4"))
                .map(|s| s.to_string()),
            "h2Fingerprint" | "h2-fingerprint" => req.get_header_str("fastly-client-h2-fingerprint")
                .map(|s| s.to_string()),
            "ohFingerprint" | "oh-fingerprint" => req.get_header_str("fastly-client-oh-fingerprint")
                .map(|s| s.to_string()),

            // Fallback: try as a header name directly
            _ => {
                req.get_header_str(field).map(|s| s.to_string())
            }
        }
    }
}

/// Send a request to a dynamic backend.
pub fn send_to_backend(
    mut req: Request,
    backend_name: &str,
    backend_host: &str,
    backend_port: u16,
    use_tls: bool,
) -> Result<Response, String> {
    // Clean the host - strip protocol prefix and trailing slashes
    let clean_host = backend_host
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .trim_end_matches('/');

    println!("[Backend] Clean host: {} (from: {})", clean_host, backend_host);

    // Set the host header to the backend host
    req.set_header("host", clean_host);

    // Create a unique backend name per request to avoid conflicts
    let unique_name = format!("dyn_{}_{}", backend_name, std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0));

    // Create dynamic backend
    let target = format!("{}:{}", clean_host, backend_port);
    println!("[Backend] Creating backend '{}' targeting: {}", unique_name, target);

    let mut builder = BackendBuilder::new(&unique_name, &target)
        .override_host(clean_host);

    if use_tls {
        builder = builder.enable_ssl();
    }

    let backend = builder
        .finish()
        .map_err(|e| format!("Failed to create backend: {:?}", e))?;

    // Send the request
    req.send(backend)
        .map_err(|e| format!("Backend request failed: {}", e))
}
