//! Graph interpreter - executes security rule graphs.
//!
//! The interpreter evaluates a node graph against a request context,
//! determining whether to allow, block, or challenge the request.

use crate::{
    Graph, Node, NodeKind, NodeId, Value,
    RequestField, Operator, ConditionValue, RateLimitMode, ActionType,
};
use std::collections::{HashMap, HashSet};
use std::net::IpAddr;
use regex::Regex;
use ipnet::IpNet;

/// Request data available during graph execution.
#[derive(Debug, Clone, Default)]
pub struct RequestContext {
    // Connection
    pub client_ip: Option<IpAddr>,
    pub asn: Option<u32>,

    // Geolocation
    pub country: Option<String>,
    pub country_code3: Option<String>,
    pub continent: Option<String>,
    pub city: Option<String>,
    pub region: Option<String>,
    pub postal_code: Option<String>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub metro_code: Option<i32>,
    pub utc_offset: Option<i32>,
    pub conn_speed: Option<String>,
    pub conn_type: Option<String>,

    // Proxy detection
    pub proxy_type: Option<String>,
    pub proxy_description: Option<String>,
    pub is_hosting_provider: bool,

    // Device detection
    pub is_bot: bool,
    pub bot_name: Option<String>,
    pub is_mobile: bool,
    pub is_tablet: bool,
    pub is_desktop: bool,
    pub is_smart_tv: bool,
    pub is_game_console: bool,
    pub device_name: Option<String>,
    pub device_brand: Option<String>,
    pub device_model: Option<String>,
    pub browser_name: Option<String>,
    pub browser_version: Option<String>,
    pub os_name: Option<String>,
    pub os_version: Option<String>,

    // Request
    pub method: String,
    pub path: String,
    pub host: String,
    pub user_agent: String,

    // TLS
    pub ja3: Option<String>,
    pub ja4: Option<String>,

    // Headers
    pub headers: HashMap<String, String>,
}

impl RequestContext {
    pub fn new() -> Self {
        Self::default()
    }

    /// Create a mock request for testing/preview
    pub fn mock() -> Self {
        Self {
            // Connection
            client_ip: Some("192.168.1.100".parse().unwrap()),
            asn: Some(15169),
            // Geo
            country: Some("US".to_string()),
            country_code3: Some("USA".to_string()),
            continent: Some("NA".to_string()),
            city: Some("San Francisco".to_string()),
            region: Some("CA".to_string()),
            postal_code: Some("94107".to_string()),
            latitude: Some(37.7749),
            longitude: Some(-122.4194),
            metro_code: Some(807),
            utc_offset: Some(-8),
            conn_speed: Some("broadband".to_string()),
            conn_type: Some("wired".to_string()),
            // Proxy
            proxy_type: None,
            proxy_description: None,
            is_hosting_provider: false,
            // Device
            is_bot: false,
            bot_name: None,
            is_mobile: false,
            is_tablet: false,
            is_desktop: true,
            is_smart_tv: false,
            is_game_console: false,
            device_name: Some("Windows Desktop".to_string()),
            device_brand: None,
            device_model: None,
            browser_name: Some("Chrome".to_string()),
            browser_version: Some("120.0".to_string()),
            os_name: Some("Windows".to_string()),
            os_version: Some("10".to_string()),
            // Request
            method: "GET".to_string(),
            path: "/api/users".to_string(),
            host: "example.com".to_string(),
            user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36".to_string(),
            // TLS
            ja3: Some("e7d705a3286e19ea42f587b344ee6865".to_string()),
            ja4: Some("t13d1516h2_8daaf6152771_b186095e22b6".to_string()),
            // Headers
            headers: HashMap::new(),
        }
    }

    /// Get a field value from the request
    pub fn get_field(&self, field: &RequestField) -> Value {
        match field {
            // Connection
            RequestField::ClientIp => self.client_ip.map(Value::Ip).unwrap_or(Value::None),
            RequestField::Asn => self.asn.map(|n| Value::Number(n as f64)).unwrap_or(Value::None),
            // Geo
            RequestField::Country => self.country.clone().map(Value::String).unwrap_or(Value::None),
            RequestField::CountryCode3 => self.country_code3.clone().map(Value::String).unwrap_or(Value::None),
            RequestField::Continent => self.continent.clone().map(Value::String).unwrap_or(Value::None),
            RequestField::City => self.city.clone().map(Value::String).unwrap_or(Value::None),
            RequestField::Region => self.region.clone().map(Value::String).unwrap_or(Value::None),
            RequestField::PostalCode => self.postal_code.clone().map(Value::String).unwrap_or(Value::None),
            RequestField::Latitude => self.latitude.map(Value::Number).unwrap_or(Value::None),
            RequestField::Longitude => self.longitude.map(Value::Number).unwrap_or(Value::None),
            RequestField::MetroCode => self.metro_code.map(|n| Value::Number(n as f64)).unwrap_or(Value::None),
            RequestField::UtcOffset => self.utc_offset.map(|n| Value::Number(n as f64)).unwrap_or(Value::None),
            RequestField::ConnSpeed => self.conn_speed.clone().map(Value::String).unwrap_or(Value::None),
            RequestField::ConnType => self.conn_type.clone().map(Value::String).unwrap_or(Value::None),
            // Proxy
            RequestField::ProxyType => self.proxy_type.clone().map(Value::String).unwrap_or(Value::None),
            RequestField::ProxyDescription => self.proxy_description.clone().map(Value::String).unwrap_or(Value::None),
            RequestField::IsHostingProvider => Value::Bool(self.is_hosting_provider),
            // Device
            RequestField::IsBot => Value::Bool(self.is_bot),
            RequestField::BotName => self.bot_name.clone().map(Value::String).unwrap_or(Value::None),
            RequestField::IsMobile => Value::Bool(self.is_mobile),
            RequestField::IsTablet => Value::Bool(self.is_tablet),
            RequestField::IsDesktop => Value::Bool(self.is_desktop),
            RequestField::IsSmartTV => Value::Bool(self.is_smart_tv),
            RequestField::IsGameConsole => Value::Bool(self.is_game_console),
            RequestField::DeviceName => self.device_name.clone().map(Value::String).unwrap_or(Value::None),
            RequestField::DeviceBrand => self.device_brand.clone().map(Value::String).unwrap_or(Value::None),
            RequestField::DeviceModel => self.device_model.clone().map(Value::String).unwrap_or(Value::None),
            RequestField::BrowserName => self.browser_name.clone().map(Value::String).unwrap_or(Value::None),
            RequestField::BrowserVersion => self.browser_version.clone().map(Value::String).unwrap_or(Value::None),
            RequestField::OsName => self.os_name.clone().map(Value::String).unwrap_or(Value::None),
            RequestField::OsVersion => self.os_version.clone().map(Value::String).unwrap_or(Value::None),
            // Request
            RequestField::Method => Value::String(self.method.clone()),
            RequestField::Path => Value::String(self.path.clone()),
            RequestField::Host => Value::String(self.host.clone()),
            RequestField::UserAgent => Value::String(self.user_agent.clone()),
            // TLS
            RequestField::Ja3 => self.ja3.clone().map(Value::String).unwrap_or(Value::None),
            RequestField::Ja4 => self.ja4.clone().map(Value::String).unwrap_or(Value::None),
            // Header
            RequestField::Header { name } => {
                self.headers.get(name).cloned().map(Value::String).unwrap_or(Value::None)
            }
        }
    }
}

/// Runtime state during graph execution.
#[derive(Default)]
pub struct ExecutionState {
    pub outputs: HashMap<(NodeId, u8), Value>,
    pub rate_counters: HashMap<String, HashMap<String, u32>>,
    pub penalty_boxes: HashMap<String, HashSet<String>>,
}

impl ExecutionState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn get_output(&self, node_id: NodeId, port: u8) -> Option<&Value> {
        self.outputs.get(&(node_id, port))
    }

    pub fn set_output(&mut self, node_id: NodeId, port: u8, value: Value) {
        self.outputs.insert((node_id, port), value);
    }

    pub fn is_in_penalty_box(&self, box_name: &str, entry: &str) -> bool {
        self.penalty_boxes
            .get(box_name)
            .map(|b| b.contains(entry))
            .unwrap_or(false)
    }

    pub fn add_to_penalty_box(&mut self, box_name: &str, entry: &str) {
        self.penalty_boxes
            .entry(box_name.to_string())
            .or_default()
            .insert(entry.to_string());
    }

    pub fn increment_rate(&mut self, counter_name: &str, entry: &str) -> u32 {
        let counter = self.rate_counters.entry(counter_name.to_string()).or_default();
        let count = counter.entry(entry.to_string()).or_insert(0);
        *count += 1;
        *count
    }

    pub fn get_rate(&self, counter_name: &str, entry: &str) -> u32 {
        self.rate_counters
            .get(counter_name)
            .and_then(|c| c.get(entry))
            .copied()
            .unwrap_or(0)
    }
}

/// The result of executing a graph
#[derive(Debug, Clone, PartialEq)]
pub enum ExecutionResult {
    Allow,
    Block { status_code: u16, message: String },
    Challenge { challenge_type: String },
    Tarpit { delay_ms: u32 },
    Log { message: String, severity: String },
    Forward { backend: String },
}

/// Execute a graph against a request context.
pub fn execute(
    graph: &Graph,
    request: &RequestContext,
    state: &mut ExecutionState,
) -> ExecutionResult {
    let order = match graph.topological_sort() {
        Ok(order) => order,
        Err(_) => return ExecutionResult::Allow,
    };

    for node_id in order {
        if let Some(node) = graph.get_node(node_id) {
            execute_node(graph, node, request, state);

            if let Some(result) = check_action_result(graph, node, state) {
                return result;
            }
        }
    }

    ExecutionResult::Allow
}

fn execute_node(
    graph: &Graph,
    node: &Node,
    request: &RequestContext,
    state: &mut ExecutionState,
) {
    let inputs = gather_inputs(graph, node.id, state);

    let outputs = match &node.kind {
        NodeKind::Request => vec![Value::Bool(true)], // Just a marker

        NodeKind::Condition { field, operator, value } => {
            let field_value = request.get_field(field);
            let matched = evaluate_condition(&field_value, operator, value);
            vec![Value::Bool(matched)]
        }

        NodeKind::And { input_count } => {
            let result = (0..*input_count as usize)
                .all(|i| inputs.get(i).map(|v| v.is_truthy()).unwrap_or(false));
            vec![Value::Bool(result)]
        }

        NodeKind::Or { input_count } => {
            let result = (0..*input_count as usize)
                .any(|i| inputs.get(i).map(|v| v.is_truthy()).unwrap_or(false));
            vec![Value::Bool(result)]
        }

        NodeKind::Not => {
            let input = inputs.get(0).map(|v| v.is_truthy()).unwrap_or(false);
            vec![Value::Bool(!input)]
        }

        NodeKind::RateLimit { mode, counter_name, threshold, penalty_ttl_seconds: _, .. } => {
            let entry = request.client_ip.map(|ip| ip.to_string()).unwrap_or_default();

            match mode {
                RateLimitMode::CheckRate => {
                    let rate = state.increment_rate(counter_name, &entry);
                    vec![Value::Bool(rate > *threshold)]
                }
                RateLimitMode::CheckRateAndPenalize => {
                    let rate = state.increment_rate(counter_name, &entry);
                    let exceeded = rate > *threshold;
                    if exceeded {
                        state.add_to_penalty_box(counter_name, &entry);
                    }
                    vec![Value::Bool(exceeded)]
                }
                RateLimitMode::InPenaltyBox => {
                    let in_box = state.is_in_penalty_box(counter_name, &entry);
                    vec![Value::Bool(in_box)]
                }
                RateLimitMode::AddToPenaltyBox => {
                    let trigger = inputs.get(0).map(|v| v.is_truthy()).unwrap_or(false);
                    if trigger {
                        state.add_to_penalty_box(counter_name, &entry);
                    }
                    vec![]
                }
            }
        }

        NodeKind::Action { .. } | NodeKind::Forward { .. } | NodeKind::Header { .. } => vec![],

        NodeKind::Comment { .. } => vec![],
    };

    for (port, value) in outputs.into_iter().enumerate() {
        state.set_output(node.id, port as u8, value);
    }
}

fn evaluate_condition(field_value: &Value, operator: &Operator, cond_value: &ConditionValue) -> bool {
    match operator {
        Operator::Equals => match (field_value, cond_value) {
            (Value::String(a), ConditionValue::String(b)) => a == b,
            (Value::Number(a), ConditionValue::Number(b)) => (a - b).abs() < f64::EPSILON,
            (Value::Bool(a), ConditionValue::Bool(b)) => a == b,
            _ => false,
        },
        Operator::NotEquals => !evaluate_condition(field_value, &Operator::Equals, cond_value),

        Operator::Contains => match (field_value, cond_value) {
            (Value::String(a), ConditionValue::String(b)) => a.contains(b),
            _ => false,
        },
        Operator::NotContains => !evaluate_condition(field_value, &Operator::Contains, cond_value),

        Operator::StartsWith => match (field_value, cond_value) {
            (Value::String(a), ConditionValue::String(b)) => a.starts_with(b),
            _ => false,
        },
        Operator::EndsWith => match (field_value, cond_value) {
            (Value::String(a), ConditionValue::String(b)) => a.ends_with(b),
            _ => false,
        },

        Operator::Matches => match (field_value, cond_value) {
            (Value::String(text), ConditionValue::String(pattern)) => {
                // Compile regex and check for match
                Regex::new(pattern)
                    .map(|re| re.is_match(text))
                    .unwrap_or(false)
            }
            _ => false,
        }

        Operator::GreaterThan => match (field_value, cond_value) {
            (Value::Number(a), ConditionValue::Number(b)) => a > b,
            _ => false,
        },
        Operator::LessThan => match (field_value, cond_value) {
            (Value::Number(a), ConditionValue::Number(b)) => a < b,
            _ => false,
        },
        Operator::GreaterOrEqual => match (field_value, cond_value) {
            (Value::Number(a), ConditionValue::Number(b)) => a >= b,
            _ => false,
        },
        Operator::LessOrEqual => match (field_value, cond_value) {
            (Value::Number(a), ConditionValue::Number(b)) => a <= b,
            _ => false,
        },

        Operator::In => match (field_value, cond_value) {
            (Value::String(a), ConditionValue::List(list)) => list.contains(a),
            _ => false,
        },
        Operator::NotIn => !evaluate_condition(field_value, &Operator::In, cond_value),

        Operator::InCidr => match (field_value, cond_value) {
            (Value::Ip(ip), ConditionValue::CidrList(cidrs)) => {
                cidrs.iter().any(|cidr| {
                    cidr.parse::<IpNet>()
                        .map(|net| net.contains(ip))
                        .unwrap_or(false)
                })
            }
            (Value::Ip(ip), ConditionValue::String(cidr)) => {
                // Single CIDR as string
                cidr.parse::<IpNet>()
                    .map(|net| net.contains(ip))
                    .unwrap_or(false)
            }
            _ => false,
        }

        Operator::Exists => !matches!(field_value, Value::None),
        Operator::NotExists => matches!(field_value, Value::None),
    }
}

fn gather_inputs(graph: &Graph, node_id: NodeId, state: &ExecutionState) -> Vec<Value> {
    let node = match graph.get_node(node_id) {
        Some(n) => n,
        None => return vec![],
    };

    let input_count = node.kind.inputs().len();
    let mut inputs = vec![Value::None; input_count];

    for edge in graph.get_incoming_edges(node_id) {
        if let Some(value) = state.get_output(edge.from_node, edge.from_port) {
            if (edge.to_port as usize) < inputs.len() {
                inputs[edge.to_port as usize] = value.clone();
            }
        }
    }

    inputs
}

fn check_action_result(graph: &Graph, node: &Node, state: &ExecutionState) -> Option<ExecutionResult> {
    // Check if trigger input is true
    let trigger = gather_inputs(graph, node.id, state)
        .get(0)
        .map(|v| v.is_truthy())
        .unwrap_or(false);

    if !trigger {
        return None;
    }

    match &node.kind {
        NodeKind::Action { action } => match action {
            ActionType::Block { status_code, message } => {
                Some(ExecutionResult::Block {
                    status_code: *status_code,
                    message: message.clone(),
                })
            }
            ActionType::Challenge { challenge_type } => {
                Some(ExecutionResult::Challenge {
                    challenge_type: format!("{:?}", challenge_type),
                })
            }
            ActionType::Tarpit { delay_ms } => {
                Some(ExecutionResult::Tarpit { delay_ms: *delay_ms })
            }
            ActionType::Log { message, severity } => {
                Some(ExecutionResult::Log {
                    message: message.clone(),
                    severity: format!("{:?}", severity),
                })
            }
            ActionType::Allow => Some(ExecutionResult::Allow),
        },
        NodeKind::Forward { backend } => {
            Some(ExecutionResult::Forward { backend: backend.clone() })
        }
        _ => None,
    }
}
