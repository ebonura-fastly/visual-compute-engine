//! Visual Compute Engine - Edge rules processing for Fastly Compute.
//!
//! This service provides edge-based request processing through:
//! - Visual graph-based rules
//! - Edge authentication
//! - Detailed logging
//! - Request blocking and routing
//!
//! Rules are designed in the visual editor and deployed as graphs (nodes + edges).

use fastly::http::StatusCode;
use fastly::log::Endpoint;
use fastly::ConfigStore;
use fastly::{Error, Request, Response};
use std::io::Write;
use std::time::Instant;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use hmac_sha256::HMAC;

mod rules;
use rules::{GraphInterpreter, GraphResult, WafLog, load_graph_from_store, send_to_backend};

/// Engine version - update this on each release
const VERSION: &str = env!("CARGO_PKG_VERSION");
const ENGINE_NAME: &str = "Visual Compute Engine";

/// Main request handler for the security service.
///
/// Process flow:
/// 1. Initialize logging and timing
/// 2. Load graph rules from config store
/// 3. Evaluate request against graph
/// 4. Apply rule actions (block/route/allow)
/// 5. Log security events
#[fastly::main]
fn main(req: Request) -> Result<Response, Error> {
    // Handle CORS preflight for system endpoints
    if req.get_method() == "OPTIONS" && (req.get_path() == "/_version" || req.get_path() == "/_health") {
        return Ok(Response::from_status(StatusCode::NO_CONTENT)
            .with_header("Access-Control-Allow-Origin", "*")
            .with_header("Access-Control-Allow-Methods", "GET, OPTIONS")
            .with_header("Access-Control-Allow-Headers", "Accept, Content-Type")
            .with_header("Access-Control-Max-Age", "86400"));
    }

    // Handle version/health endpoint - includes rules hash for deployment verification
    if req.get_path() == "/_version" || req.get_path() == "/_health" {
        let store = ConfigStore::open("security_rules");

        // Get the raw rules_packed value to compute hash for deployment verification
        let rules_packed = store.get("rules_packed").unwrap_or_default();
        let rules_hash = if rules_packed.is_empty() {
            "none".to_string()
        } else {
            // Hash: first 16 hex chars of HMAC-SHA256 (using empty key as simple hash)
            let hash_bytes = HMAC::mac(rules_packed.as_bytes(), b"");
            hex::encode(&hash_bytes[..8])
        };

        // Load and parse graph to get stats
        let (nodes_count, edges_count) = match rules::load_graph_from_store(&store) {
            Ok(g) => (g.nodes.len(), g.edges.len()),
            Err(_) => (0, 0),
        };

        let version_info = serde_json::json!({
            "engine": ENGINE_NAME,
            "version": VERSION,
            "format": "graph",
            "rules_hash": rules_hash,
            "nodes_count": nodes_count,
            "edges_count": edges_count,
        });
        return Ok(Response::from_status(StatusCode::OK)
            .with_content_type(fastly::mime::APPLICATION_JSON)
            .with_header("Access-Control-Allow-Origin", "*")
            .with_body(version_info.to_string()));
    }

    let start_time = Instant::now();
    let mut logger = Endpoint::from_name("security_logs");
    println!("[{}] Processing request for path: {}", ENGINE_NAME, req.get_path());

    // Initialize log entry
    let mut log_entry = WafLog::new(&req, start_time);

    // Load graph from config store - fail open if loading fails
    let store = ConfigStore::open("security_rules");
    let graph = match load_graph_from_store(&store) {
        Ok(g) => {
            println!("Loaded graph with {} nodes, {} edges", g.nodes.len(), g.edges.len());
            Some(g)
        }
        Err(e) => {
            println!("Failed to load graph (fail-open): {}", e);
            log_entry.set_final_action("failopen:graph_load_error");
            None
        }
    };

    // If graph loading failed, fail open to default backend
    let graph = match graph {
        Some(g) => g,
        None => {
            return forward_to_default_backend_with_reason(req, &mut logger, log_entry, "failopen:graph_load_error");
        }
    };

    // Create interpreter and evaluate
    let interpreter = GraphInterpreter::new(&graph);
    let result = interpreter.evaluate(&req);

    // Handle result
    match result {
        GraphResult::Block { status_code, message } => {
            println!("Blocked: {} - {}", status_code, message);
            log_entry.blocked = true;
            log_entry.set_final_action("blocked");

            let mut response = Response::from_status(StatusCode::from_u16(status_code).unwrap_or(StatusCode::FORBIDDEN))
                .with_body_text_plain(&message);
            response.set_header("X-VCE-Action", "blocked");

            log_entry.add_response(&response);
            log_entry.finalize();
            writeln!(logger, "{}", serde_json::to_string(&log_entry)?)?;

            Ok(response)
        }

        GraphResult::Route { backend_name, backend_host, backend_port, use_tls } => {
            println!("Routing to backend: {} ({}:{})", backend_name, backend_host, backend_port);
            let action = format!("routed:{}", backend_name);
            log_entry.set_final_action(&action);

            // Add edge auth and send to backend
            let mut backend_req = req.clone_without_body();
            if let Err(e) = add_edge_auth(&mut backend_req) {
                println!("Auth header error: {}", e);
            }

            match send_to_backend(backend_req, &backend_name, &backend_host, backend_port, use_tls) {
                Ok(mut response) => {
                    response.set_header("X-VCE-Action", &action);
                    log_entry.add_response(&response);
                    log_entry.finalize();
                    writeln!(logger, "{}", serde_json::to_string(&log_entry)?)?;
                    Ok(response)
                }
                Err(e) => {
                    // Fail open on backend errors
                    println!("Backend error (fail-open): {}", e);
                    forward_to_default_backend_with_reason(req, &mut logger, log_entry, &format!("failopen:backend_error:{}", backend_name))
                }
            }
        }

        GraphResult::Redirect { url, status_code, preserve_query } => {
            println!("Redirecting to: {} (status: {})", url, status_code);
            log_entry.set_final_action(&format!("redirect:{}", status_code));

            // Build redirect URL
            let redirect_url = if preserve_query {
                if let Some(query) = req.get_query_str() {
                    if url.contains('?') {
                        format!("{}&{}", url, query)
                    } else {
                        format!("{}?{}", url, query)
                    }
                } else {
                    url
                }
            } else {
                url
            };

            let mut response = Response::from_status(
                StatusCode::from_u16(status_code).unwrap_or(StatusCode::FOUND)
            );
            response.set_header("Location", &redirect_url);
            response.set_header("X-VCE-Action", &format!("redirect:{}", status_code));

            log_entry.add_response(&response);
            log_entry.finalize();
            writeln!(logger, "{}", serde_json::to_string(&log_entry)?)?;

            Ok(response)
        }

        GraphResult::Allow => {
            println!("Allowed - using default backend");
            forward_to_default_backend_with_reason(req, &mut logger, log_entry, "allowed")
        }

        GraphResult::NoMatch => {
            println!("No matching path - using default backend");
            forward_to_default_backend_with_reason(req, &mut logger, log_entry, "nomatch")
        }
    }
}

/// Return an error response when no backend is configured.
///
/// This is called when:
/// - `allowed` - Graph action node set to allow but no backend configured
/// - `nomatch` - No matching path in graph and no default backend
/// - `failopen:*` - Error occurred during graph evaluation
///
/// Returns a 503 Service Unavailable with a clear error message.
fn forward_to_default_backend_with_reason(
    _req: Request,
    logger: &mut Endpoint,
    mut log_entry: WafLog,
    reason: &str,
) -> Result<Response, Error> {
    println!("No backend configured (reason: {})", reason);

    let error_message = match reason {
        "allowed" => "No backend configured. Add a Backend node to your graph to route traffic.",
        "nomatch" => "No matching rule in graph. Ensure your graph has a complete path from Request to Backend.",
        r if r.starts_with("failopen:") => "Graph evaluation error. Check your graph configuration.",
        _ => "Backend not configured.",
    };

    let body = serde_json::json!({
        "error": "backend_not_configured",
        "message": error_message,
        "reason": reason,
        "engine": "Visual Compute Engine",
    });

    let mut response = Response::from_status(StatusCode::SERVICE_UNAVAILABLE)
        .with_content_type(fastly::mime::APPLICATION_JSON)
        .with_body(body.to_string());

    response.set_header("X-VCE-Action", reason);

    log_entry.add_response(&response);
    log_entry.set_final_action(reason);
    log_entry.finalize();
    writeln!(logger, "{}", serde_json::to_string(&log_entry)?)?;

    Ok(response)
}

/// Adds edge authentication headers to requests.
///
/// Creates an HMAC-based authentication header using:
/// - Shared secret from edge dictionary
/// - Current timestamp
/// - POP (Point of Presence) identifier
///
/// Format: timestamp,pop,signature
fn add_edge_auth(req: &mut Request) -> Result<(), Error> {
    // Get shared secret - use try_open to avoid panic if store doesn't exist
    let store = match ConfigStore::try_open("vce_shared_secret") {
        Ok(s) => s,
        Err(_) => {
            println!("Auth store not found, skipping auth header");
            return Ok(());
        }
    };
    let secret = match store.get("compute_auth_key") {
        Some(s) => s.to_string(),
        None => {
            println!("Auth secret not configured, skipping auth header");
            return Ok(());
        }
    };

    // Get POP and timestamp
    let pop = std::env::var("FASTLY_POP").unwrap_or_default();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_secs();

    // Generate signature
    let data = format!("{},{}", now, pop);
    let sig = HMAC::mac(data.as_bytes(), secret.as_bytes());
    let sig_hex = hex::encode(sig);

    // Set header
    let auth_header = format!("{},0x{}", data, sig_hex);
    req.set_header("Edge-Auth", &auth_header);

    Ok(())
}
