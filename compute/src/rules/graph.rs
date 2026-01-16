//! Graph-based rule interpreter.
//!
//! Evaluates security rules stored as a visual graph (nodes + edges).
//! This allows the editor to deploy rules directly without conversion.

use std::collections::HashMap;
use std::net::IpAddr;
use fastly::backend::BackendBuilder;
use fastly::{Request, Response};
use fastly::geo::geo_lookup;
use fastly::device_detection::lookup as device_lookup;

use std::time::Duration;
use fastly::erl::{ERL, RateCounter, Penaltybox, RateWindow, CounterDuration};
use ipnet::IpNet;

use super::types::{
    GraphPayload, GraphNode, GraphEdge,
    BackendNodeData, ActionNodeData, RuleGroupNodeData, ConditionNodeData, RateLimitNodeData,
    HeaderNodeData, RedirectNodeData,
};

/// Result of evaluating the graph for a request.
pub enum GraphResult {
    /// Route the request to a backend with full configuration
    Route(BackendNodeData),
    /// Block the request with a response
    Block { status_code: u16, message: String },
    /// Redirect the request
    Redirect { url: String, status_code: u16, preserve_query: bool },
    /// Allow the request (pass through to default backend)
    Allow,
    /// No matching path found
    NoMatch,
}

/// Header modification to apply before forwarding
#[derive(Debug, Clone)]
pub enum HeaderMod {
    Set { name: String, value: String },
    Append { name: String, value: String },
    Remove { name: String },
}

/// Evaluates a graph against an incoming request.
pub struct GraphInterpreter<'a> {
    nodes: HashMap<String, &'a GraphNode>,
    edges_from: HashMap<String, Vec<&'a GraphEdge>>,
    rate_limiter: Option<ERL>,
    /// Separate rate counter for debug lookups (ERL takes ownership of the main one)
    rate_counter_debug: Option<RateCounter>,
    /// Cached geo lookup result
    geo_cache: std::cell::RefCell<Option<Option<fastly::geo::Geo>>>,
    /// Header modifications collected during traversal
    header_mods: std::cell::RefCell<Vec<HeaderMod>>,
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
        let (rate_limiter, rate_counter_debug) = if has_rate_limit {
            // Try to open the rate counter and penalty box
            // These must be configured in fastly.toml and linked to the service
            let counter = RateCounter::open("vce_rate_counter");
            let penaltybox = Penaltybox::open("vce_penalty_box");
            // Open a second counter handle for debug lookups
            let counter_debug = RateCounter::open("vce_rate_counter");
            (Some(ERL::open(counter, penaltybox)), Some(counter_debug))
        } else {
            (None, None)
        };

        Self {
            nodes,
            edges_from,
            rate_limiter,
            rate_counter_debug,
            geo_cache: std::cell::RefCell::new(None),
            header_mods: std::cell::RefCell::new(Vec::new()),
        }
    }

    /// Get the header modifications collected during evaluation.
    /// Call this after evaluate() to get the mods to apply.
    pub fn get_header_mods(&self) -> Vec<HeaderMod> {
        self.header_mods.borrow().clone()
    }

    /// Clear collected header modifications (for reuse).
    pub fn clear_header_mods(&self) {
        self.header_mods.borrow_mut().clear();
    }

    /// Get geo data for client IP, caching the result
    fn get_geo(&self, req: &Request) -> Option<fastly::geo::Geo> {
        let mut cache = self.geo_cache.borrow_mut();
        if cache.is_none() {
            let geo_result = match req.get_client_ip_addr() {
                Some(ip) => geo_lookup(ip),
                None => None,
            };
            *cache = Some(geo_result);
        }
        // Return a clone of the cached geo result
        match cache.as_ref() {
            Some(Some(geo)) => Some(geo.clone()),
            _ => None,
        }
    }

    /// Get device data for user agent (not cached since Device doesn't implement Clone)
    fn get_device(&self, req: &Request) -> Option<fastly::device_detection::Device> {
        let ua = req.get_header_str("user-agent").unwrap_or("");
        device_lookup(ua)
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
                    "redirect" => {
                        let url = data.url.unwrap_or_else(|| "/".to_string());
                        println!("[Graph] Action Redirect: {} -> {} (preserve_query: {})",
                            data.status_code.unwrap_or(302), url, data.preserve_query.unwrap_or(true));
                        GraphResult::Redirect {
                            url,
                            status_code: data.status_code.unwrap_or(302),
                            preserve_query: data.preserve_query.unwrap_or(true),
                        }
                    }
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

                println!("[Graph] Routing to backend: {} ({}:{})",
                    data.name, data.host, data.port.unwrap_or(443));

                GraphResult::Route(data)
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

                // Warning for local development
                println!("[Graph] ⚠️  Rate limiting in local dev (Viceroy) may not persist counters between requests.");
                println!("[Graph]    Deploy to Fastly to test rate limiting behavior accurately.");

                // Get the client identifier based on keyBy
                let entry = self.get_rate_limit_key(&data, req);

                // Map window unit to RateWindow enum (for check_rate)
                let window = match data.window_unit.as_str() {
                    "second" => RateWindow::OneSec,
                    "minute" => RateWindow::SixtySecs,
                    "hour" => RateWindow::SixtySecs, // Use 60s window for hourly, limit is adjusted
                    _ => RateWindow::SixtySecs,
                };

                // Helper to get CounterDuration for lookup_count debug
                let get_counter_duration = || match data.window_unit.as_str() {
                    "second" => CounterDuration::TenSec, // Closest to 1 second
                    "minute" => CounterDuration::SixtySecs,
                    "hour" => CounterDuration::SixtySecs,
                    _ => CounterDuration::SixtySecs,
                };

                // Debug: lookup current count before check
                let count_before = self.rate_counter_debug.as_ref()
                    .and_then(|c| c.lookup_count(&entry, get_counter_duration()).ok())
                    .unwrap_or(0);

                println!("[Graph] Rate limit check for entry: {} (count: {}, limit: {}/{})",
                    entry, count_before, data.limit, data.window_unit);

                // Check if we have a rate limiter
                let exceeded = match &self.rate_limiter {
                    Some(erl) => {
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
                                // Debug: lookup count after increment
                                let count_after = self.rate_counter_debug.as_ref()
                                    .and_then(|c| c.lookup_count(&entry, get_counter_duration()).ok())
                                    .unwrap_or(0);
                                println!("[Graph] Rate limit result: blocked={}, count: {} -> {}",
                                    is_blocked, count_before, count_after);
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

            "header" => {
                // Header modification node - collect the mod and continue
                let data: HeaderNodeData = match serde_json::from_value(node.data.clone()) {
                    Ok(d) => d,
                    Err(e) => {
                        println!("[Graph] Failed to parse header data: {}", e);
                        return self.follow_outgoing(node_id, None, req);
                    }
                };

                // Collect the header modification
                let header_mod = match data.operation.as_str() {
                    "set" => {
                        let value = data.value.unwrap_or_default();
                        println!("[Graph] Header SET: {} = {}", data.name, value);
                        Some(HeaderMod::Set { name: data.name, value })
                    }
                    "append" => {
                        let value = data.value.unwrap_or_default();
                        println!("[Graph] Header APPEND: {} += {}", data.name, value);
                        Some(HeaderMod::Append { name: data.name, value })
                    }
                    "remove" => {
                        println!("[Graph] Header REMOVE: {}", data.name);
                        Some(HeaderMod::Remove { name: data.name })
                    }
                    _ => {
                        println!("[Graph] Header unknown op: {}", data.operation);
                        None
                    }
                };

                if let Some(hm) = header_mod {
                    self.header_mods.borrow_mut().push(hm);
                }

                // Continue to next node
                self.follow_outgoing(node_id, Some("next"), req)
            }

            "redirect" => {
                // Terminal node - return redirect result
                let data: RedirectNodeData = match serde_json::from_value(node.data.clone()) {
                    Ok(d) => d,
                    Err(e) => {
                        println!("[Graph] Failed to parse redirect data: {}", e);
                        return GraphResult::Block { status_code: 500, message: "Invalid redirect config".to_string() };
                    }
                };

                println!("[Graph] Redirect: {} -> {} (preserve_query: {})",
                    data.status_code.unwrap_or(302), data.url, data.preserve_query.unwrap_or(true));

                GraphResult::Redirect {
                    url: data.url,
                    status_code: data.status_code.unwrap_or(302),
                    preserve_query: data.preserve_query.unwrap_or(true),
                }
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
                    header_name: c.header_name.clone(),
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
        // For custom header field, use the headerName
        let effective_field = if data.field == "header" {
            data.header_name.as_deref().unwrap_or("header")
        } else {
            &data.field
        };
        let field_value = self.get_field_value(effective_field, req);
        let field_value_str = field_value.as_deref().unwrap_or("");

        println!("[Graph] Checking {} {} {} (actual: {})", effective_field, data.operator, data.value, field_value_str);

        match data.operator.as_str() {
            "equals" => field_value_str == data.value,
            "startsWith" | "starts" => field_value_str.starts_with(&data.value),
            "endsWith" | "ends" => field_value_str.ends_with(&data.value),
            "contains" => field_value_str.contains(&data.value),
            "notContains" => !field_value_str.contains(&data.value),
            "notEquals" | "!=" => field_value_str != data.value,
            "in" => data.value.split(',').map(|s| s.trim()).any(|v| field_value_str == v),
            "notIn" | "!in" => !data.value.split(',').map(|s| s.trim()).any(|v| field_value_str == v),
            "matches" => {
                // Regex matching
                regex::Regex::new(&data.value)
                    .map(|re| re.is_match(field_value_str))
                    .unwrap_or(false)
            }
            "inCidr" => {
                // CIDR range matching for IP addresses
                if let Some(ip_str) = &field_value {
                    if let Ok(ip) = ip_str.parse::<IpAddr>() {
                        // Support comma-separated CIDR list
                        data.value.split(',').map(|s| s.trim()).any(|cidr| {
                            cidr.parse::<IpNet>()
                                .map(|net| net.contains(&ip))
                                .unwrap_or(false)
                        })
                    } else {
                        println!("[Graph] Failed to parse IP: {}", ip_str);
                        false
                    }
                } else {
                    false
                }
            }
            "greaterThan" | ">" => {
                field_value_str.parse::<f64>().ok()
                    .zip(data.value.parse::<f64>().ok())
                    .map(|(a, b)| a > b)
                    .unwrap_or(false)
            }
            "lessThan" | "<" => {
                field_value_str.parse::<f64>().ok()
                    .zip(data.value.parse::<f64>().ok())
                    .map(|(a, b)| a < b)
                    .unwrap_or(false)
            }
            "greaterOrEqual" | ">=" => {
                field_value_str.parse::<f64>().ok()
                    .zip(data.value.parse::<f64>().ok())
                    .map(|(a, b)| a >= b)
                    .unwrap_or(false)
            }
            "lessOrEqual" | "<=" => {
                field_value_str.parse::<f64>().ok()
                    .zip(data.value.parse::<f64>().ok())
                    .map(|(a, b)| a <= b)
                    .unwrap_or(false)
            }
            "exists" => field_value.is_some() && !field_value_str.is_empty(),
            "notExists" => field_value.is_none() || field_value_str.is_empty(),
            _ => {
                println!("[Graph] Unknown operator: {}", data.operator);
                false
            }
        }
    }

    /// Get the value of a field from the request.
    fn get_field_value(&self, field: &str, req: &Request) -> Option<String> {
        match field {
            // ═══════════════════════════════════════════════════════════════════
            // REQUEST BASICS
            // ═══════════════════════════════════════════════════════════════════
            "path" => Some(req.get_path().to_string()),
            "query" => {
                let url = req.get_url_str();
                url.find('?').map(|i| url[i..].to_string())
            }
            "method" => Some(req.get_method_str().to_string()),
            "host" => req.get_header_str("host")
                .or_else(|| req.get_header_str("fastly-orig-host"))
                .map(|s| s.to_string()),
            "scheme" => req.get_header_str("x-forwarded-proto")
                .map(|s| s.to_string())
                .or_else(|| Some("https".to_string())),

            // ═══════════════════════════════════════════════════════════════════
            // CLIENT & CONNECTION
            // ═══════════════════════════════════════════════════════════════════
            "clientIp" | "client-ip" | "ip" => {
                // Try native API first, then headers
                req.get_client_ip_addr()
                    .map(|ip| ip.to_string())
                    .or_else(|| req.get_header_str("fastly-client-ip").map(|s| s.to_string()))
                    .or_else(|| req.get_header_str("x-forwarded-for")
                        .map(|s| s.split(',').next().unwrap_or(s).trim().to_string()))
            }
            "asn" => {
                // Try native geo lookup first
                self.get_geo(req)
                    .map(|g| g.as_number().to_string())
                    .or_else(|| req.get_header_str("fastly-client-geo-asn").map(|s| s.to_string()))
            }
            "datacenter" | "pop" => {
                req.get_header_str("fastly-pop")
                    .map(|s| s.to_string())
                    .or_else(|| std::env::var("FASTLY_POP").ok())
            }
            "ddosDetected" => {
                // Returns "true" if Fastly has detected this request is part of a DDoS attack
                req.get_client_ddos_detected().map(|v| v.to_string())
            }

            // ═══════════════════════════════════════════════════════════════════
            // GEOLOCATION (Native Fastly Geo API with header fallback)
            // ═══════════════════════════════════════════════════════════════════
            "country" => {
                self.get_geo(req)
                    .map(|g| g.country_code().to_string())
                    .or_else(|| req.get_header_str("fastly-client-geo-country").map(|s| s.to_string()))
            }
            "countryCode3" => {
                self.get_geo(req)
                    .map(|g| g.country_code3().to_string())
            }
            "continent" => {
                self.get_geo(req)
                    .map(|g| format!("{:?}", g.continent()))
                    .or_else(|| req.get_header_str("fastly-client-geo-continent").map(|s| s.to_string()))
            }
            "city" => {
                self.get_geo(req)
                    .map(|g| g.city().to_string())
                    .or_else(|| req.get_header_str("fastly-client-geo-city").map(|s| s.to_string()))
            }
            "region" => {
                self.get_geo(req)
                    .and_then(|g| g.region().map(|s| s.to_string()))
            }
            "postalCode" => {
                self.get_geo(req)
                    .map(|g| g.postal_code().to_string())
            }
            "latitude" => {
                self.get_geo(req)
                    .map(|g| g.latitude().to_string())
            }
            "longitude" => {
                self.get_geo(req)
                    .map(|g| g.longitude().to_string())
            }
            "metroCode" => {
                self.get_geo(req)
                    .map(|g| g.metro_code().to_string())
            }
            "utcOffset" => {
                self.get_geo(req)
                    .and_then(|g| g.utc_offset().map(|uo| {
                        let (h, m, _) = uo.as_hms();
                        if m == 0 { format!("{}", h) } else { format!("{}:{:02}", h, m.abs()) }
                    }))
            }
            "connSpeed" => {
                self.get_geo(req)
                    .map(|g| format!("{:?}", g.conn_speed()))
            }
            "connType" => {
                self.get_geo(req)
                    .map(|g| format!("{:?}", g.conn_type()))
            }

            // ═══════════════════════════════════════════════════════════════════
            // PROXY/VPN DETECTION (Native Fastly Geo API)
            // ═══════════════════════════════════════════════════════════════════
            "proxyType" => {
                self.get_geo(req)
                    .map(|g| format!("{:?}", g.proxy_type()))
            }
            "proxyDescription" => {
                self.get_geo(req)
                    .map(|g| format!("{:?}", g.proxy_description()))
            }
            "isHostingProvider" => {
                // Check if proxy_description indicates hosting
                self.get_geo(req)
                    .map(|g| {
                        let desc = format!("{:?}", g.proxy_description()).to_lowercase();
                        desc.contains("hosting").to_string()
                    })
                    .or(Some("false".to_string()))
            }

            // ═══════════════════════════════════════════════════════════════════
            // DEVICE DETECTION (Native Fastly Device Detection API)
            // ═══════════════════════════════════════════════════════════════════
            "isBot" => {
                self.get_device(req)
                    .and_then(|d| d.is_bot().map(|b| b.to_string()))
                    .or(Some("false".to_string()))
            }
            "botName" => {
                self.get_device(req)
                    .and_then(|d| {
                        if d.is_bot().unwrap_or(false) {
                            d.device_name().map(|s| s.to_string())
                        } else {
                            None
                        }
                    })
            }
            "isMobile" => {
                self.get_device(req)
                    .and_then(|d| d.is_mobile().map(|b| b.to_string()))
                    .or(Some("false".to_string()))
            }
            "isTablet" => {
                self.get_device(req)
                    .and_then(|d| d.is_tablet().map(|b| b.to_string()))
                    .or(Some("false".to_string()))
            }
            "isDesktop" => {
                self.get_device(req)
                    .and_then(|d| d.is_desktop().map(|b| b.to_string()))
                    .or(Some("false".to_string()))
            }
            "isSmartTV" => {
                self.get_device(req)
                    .and_then(|d| d.is_smarttv().map(|b| b.to_string()))
                    .or(Some("false".to_string()))
            }
            "isGameConsole" => {
                self.get_device(req)
                    .and_then(|d| d.is_gameconsole().map(|b| b.to_string()))
                    .or(Some("false".to_string()))
            }
            "deviceName" => {
                self.get_device(req)
                    .and_then(|d| d.device_name().map(|s| s.to_string()))
            }
            "deviceBrand" => {
                self.get_device(req)
                    .and_then(|d| d.brand().map(|s| s.to_string()))
            }
            "deviceModel" => {
                self.get_device(req)
                    .and_then(|d| d.model().map(|s| s.to_string()))
            }
            "browserName" => {
                self.get_device(req)
                    .and_then(|d| d.user_agent_name().map(|s| s.to_string()))
            }
            "browserVersion" => {
                // Combine major.minor.patch versions
                self.get_device(req)
                    .and_then(|d| {
                        d.user_agent_major_version().map(|major| {
                            let minor = d.user_agent_minor_version().unwrap_or("0");
                            format!("{}.{}", major, minor)
                        })
                    })
            }
            "osName" => {
                self.get_device(req)
                    .and_then(|d| d.os_name().map(|s| s.to_string()))
            }
            "osVersion" => {
                // Combine major.minor versions
                self.get_device(req)
                    .and_then(|d| {
                        d.os_major_version().map(|major| {
                            let minor = d.os_minor_version().unwrap_or("0");
                            format!("{}.{}", major, minor)
                        })
                    })
            }

            // ═══════════════════════════════════════════════════════════════════
            // COMMON REQUEST HEADERS
            // ═══════════════════════════════════════════════════════════════════
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

            // ═══════════════════════════════════════════════════════════════════
            // TLS/SECURITY FINGERPRINTS
            // ═══════════════════════════════════════════════════════════════════
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

            // ═══════════════════════════════════════════════════════════════════
            // FALLBACK: Try as a header name directly
            // ═══════════════════════════════════════════════════════════════════
            _ => {
                req.get_header_str(field).map(|s| s.to_string())
            }
        }
    }
}

/// Send a request to a dynamic backend with full configuration.
pub fn send_to_backend(
    mut req: Request,
    data: &BackendNodeData,
) -> Result<Response, String> {
    let backend_port = data.port.unwrap_or(443);
    let use_tls = data.use_tls.unwrap_or(true);

    // Clean the host - strip protocol prefix and trailing slashes
    let clean_host = data.host
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .trim_end_matches('/');

    println!("[Backend] Clean host: {} (from: {})", clean_host, data.host);

    // Set the host header to the backend host (or override if specified)
    let host_header = data.override_host.as_deref().unwrap_or(clean_host);
    req.set_header("host", host_header);

    // Create a unique backend name per request to avoid conflicts
    let unique_name = format!("dyn_{}_{}", data.name, std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0));

    // Create dynamic backend
    let target = format!("{}:{}", clean_host, backend_port);
    println!("[Backend] Creating backend '{}' targeting: {}", unique_name, target);

    let mut builder = BackendBuilder::new(&unique_name, &target)
        .override_host(host_header);

    // Timeouts
    if let Some(timeout) = data.connect_timeout {
        builder = builder.connect_timeout(Duration::from_millis(timeout));
    }
    if let Some(timeout) = data.first_byte_timeout {
        builder = builder.first_byte_timeout(Duration::from_millis(timeout));
    }
    if let Some(timeout) = data.between_bytes_timeout {
        builder = builder.between_bytes_timeout(Duration::from_millis(timeout));
    }

    // TLS/SSL
    if use_tls {
        builder = builder.enable_ssl();

        if data.verify_certificate.unwrap_or(false) {
            builder = builder.check_certificate(clean_host);
        }

        if let Some(ref sni) = data.sni_hostname {
            if !sni.is_empty() {
                builder = builder.sni_hostname(sni);
            }
        }

        if let Some(ref ca_cert) = data.ca_certificate {
            if !ca_cert.is_empty() {
                builder = builder.ca_certificate(ca_cert);
            }
        }

        if let (Some(ref cert), Some(ref key)) = (&data.client_certificate, &data.client_key) {
            if !cert.is_empty() && !key.is_empty() {
                // Note: In production, the key should come from Secret Store
                // This is a plaintext fallback for development
                let secret_key = fastly::secret_store::Secret::from_bytes(key.as_bytes().into())
                    .map_err(|e| format!("Failed to create secret from key: {:?}", e))?;
                builder = builder.provide_client_certificate(cert, secret_key);
            }
        }
    }

    // IPv6 preference
    if data.prefer_ipv6.unwrap_or(false) {
        builder = builder.prefer_ipv6(true);
    }

    // Connection pooling
    if let Some(enable) = data.enable_pooling {
        builder = builder.enable_pooling(enable);
    }
    if let Some(time) = data.keepalive_time {
        builder = builder.http_keepalive_time(Duration::from_millis(time));
    }
    if let Some(max) = data.max_connections {
        builder = builder.max_connections(max);
    }
    if let Some(max) = data.max_connection_uses {
        builder = builder.max_use(max);
    }
    if let Some(lifetime) = data.max_connection_lifetime {
        builder = builder.max_lifetime(Duration::from_millis(lifetime));
    }

    // TCP Keepalive
    if data.tcp_keepalive.unwrap_or(false) {
        builder = builder.tcp_keepalive_enable(true);
        if let Some(time) = data.tcp_keepalive_time {
            if let Some(nz) = std::num::NonZeroU32::new(time as u32) {
                builder = builder.tcp_keepalive_time_secs(nz);
            }
        }
        if let Some(interval) = data.tcp_keepalive_interval {
            if let Some(nz) = std::num::NonZeroU32::new(interval as u32) {
                builder = builder.tcp_keepalive_interval_secs(nz);
            }
        }
        if let Some(probes) = data.tcp_keepalive_probes {
            if let Some(nz) = std::num::NonZeroU32::new(probes) {
                builder = builder.tcp_keepalive_probes(nz);
            }
        }
    }

    let backend = builder
        .finish()
        .map_err(|e| format!("Failed to create backend: {:?}", e))?;

    // Send the request
    req.send(backend)
        .map_err(|e| format!("Backend request failed: {}", e))
}
