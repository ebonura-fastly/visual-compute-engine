//! Security rules module.
//!
//! This module provides graph-based rule evaluation for the Fastly Compute service.
//! Rules are stored as visual graphs (nodes + edges) that match the editor format exactly.

mod graph;
mod loader;
mod logging;
mod types;

pub use graph::{GraphInterpreter, GraphResult, HeaderMod, send_to_backend};
pub use loader::load_graph_from_store;
pub use logging::WafLog;
pub use types::BackendNodeData;
