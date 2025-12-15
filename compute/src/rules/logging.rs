//! Security event logging system for the WAF (Web Application Firewall).
//!
//! This module provides structured logging capabilities for security events:
//! - Detailed request/response information
//! - Graph evaluation results
//! - Performance metrics
//! - Security actions taken

use chrono::Utc;
use fastly::{Request, Response};
use serde::Serialize;
use std::time::Instant;
use uuid::{timestamp::Timestamp, NoContext, Uuid};

/// Detailed information about the incoming HTTP request.
///
/// Captures all relevant request data for security analysis:
/// - HTTP method and URL
/// - Client/server IP addresses
/// - Headers and body information
/// - Protocol details
#[derive(Serialize)]
struct RequestDetails {
    method: String,
    url: String,
    path: String,
    query_string: String,
    client_ip: String,
    server_ip: String,
    content_length: usize,
    has_body: bool,
    version: String,
    content_type: String,
    headers: Vec<(String, String)>,
}

/// Information about the HTTP response sent back to the client.
///
/// Tracks the outcome of request processing:
/// - Status code
/// - Content details
/// - Response headers
#[derive(Serialize)]
struct ResponseDetails {
    status_code: u16,
    content_length: Option<usize>,
    content_type: Option<String>,
    headers: Vec<(String, String)>,
}

/// Complete log entry for a request processed by the WAF.
///
/// This is the main logging structure that combines:
/// - Request/response details
/// - Timing information
/// - Final security decision
#[derive(Serialize)]
pub struct WafLog {
    pub request_id: String,
    pub timestamp: String,
    pub processing_time_ms: u64,
    request: RequestDetails,
    response: Option<ResponseDetails>,
    pub final_action: String,
    pub blocked: bool,
    #[serde(skip)]
    start_time: Instant,
}

impl WafLog {
    /// Creates a new WAF log entry for a request.
    ///
    /// Initializes logging with:
    /// - Unique request ID (UUIDv7)
    /// - Timestamp
    /// - Complete request details
    /// - Performance tracking
    pub fn new(req: &Request, start_time: Instant) -> Self {
        let now = Utc::now();
        let ts = Timestamp::from_unix(
            &NoContext,
            now.timestamp() as u64,
            now.timestamp_subsec_nanos(),
        );
        let uuid = Uuid::new_v7(ts);

        let headers = req
            .get_header_names()
            .filter_map(|name| {
                req.get_header(name).map(|value| {
                    (
                        name.to_string(),
                        value.to_str().unwrap_or("invalid").to_string(),
                    )
                })
            })
            .collect();

        WafLog {
            request_id: uuid.to_string(),
            timestamp: now.to_rfc3339(),
            processing_time_ms: 0,
            start_time,
            request: RequestDetails {
                method: req.get_method().to_string(),
                url: req.get_url().to_string(),
                path: req.get_path().to_string(),
                query_string: req.get_query_str().unwrap_or("none").to_string(),
                client_ip: req
                    .get_client_ip_addr()
                    .map_or("none".to_string(), |ip| ip.to_string()),
                server_ip: req
                    .get_server_ip_addr()
                    .map_or("none".to_string(), |ip| ip.to_string()),
                content_length: req.get_content_length().unwrap_or(0),
                has_body: req.has_body(),
                version: format!("{:?}", req.get_version()),
                content_type: req
                    .get_content_type()
                    .map_or("none".to_string(), |ct| ct.to_string()),
                headers,
            },
            response: None,
            final_action: "initializing".to_string(),
            blocked: false,
        }
    }

    /// Completes the log entry by calculating final processing time.
    ///
    /// Should be called just before writing the log entry.
    pub fn finalize(&mut self) {
        self.processing_time_ms = self.start_time.elapsed().as_millis() as u64;
    }

    /// Adds response information to the log entry.
    ///
    /// Captures all response details:
    /// - Status code
    /// - Headers
    /// - Content information
    pub fn add_response(&mut self, resp: &Response) {
        let headers = resp
            .get_header_names()
            .filter_map(|name| {
                resp.get_header(name).map(|value| {
                    (
                        name.to_string(),
                        value.to_str().unwrap_or("invalid").to_string(),
                    )
                })
            })
            .collect();

        self.response = Some(ResponseDetails {
            status_code: resp.get_status().as_u16(),
            content_length: resp.get_content_length(),
            content_type: resp.get_content_type().map(|ct| ct.to_string()),
            headers,
        });
    }

    /// Sets the final security action taken.
    ///
    /// Records the ultimate decision:
    /// - forwarded: Request allowed through
    /// - blocked: Request denied
    /// - routed: Request sent to specific backend
    pub fn set_final_action(&mut self, action: &str) {
        self.final_action = action.to_string();
    }
}
