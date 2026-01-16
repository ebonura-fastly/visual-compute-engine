//! # Rusty Shield Core
//!
//! Core node graph types and interpreter for Rusty Shield security rules.
//!
//! This crate defines the visual programming model for security rules,
//! inspired by Unreal Blueprints and Blender Geometry Nodes.
//!
//! ## Architecture
//!
//! A security rule is represented as a directed acyclic graph (DAG) of nodes:
//! - **Input nodes** extract data from the request (IP, headers, fingerprints)
//! - **Match nodes** check conditions (string match, regex, table lookup)
//! - **Logic nodes** combine signals (AND, OR, NOT)
//! - **Action nodes** determine the response (block, challenge, allow)
//!
//! ## Example
//!
//! ```text
//! [Request] ──► [JA3 Match] ──► [OR] ──► [Block]
//!           └─► [Rate > 100] ──►│
//! ```
//!
//! ## Modules
//!
//! - `graph` - Graph structure with nodes and edges
//! - `nodes` - Node type definitions
//! - `ports` - Port type definitions
//! - `value` - Runtime values
//! - `interpreter` - Graph execution engine
//! - `wasm` - WebAssembly bindings for JavaScript

mod graph;
mod nodes;
mod ports;
mod value;
mod interpreter;
pub mod wasm;

#[cfg(test)]
mod bench_compression;

pub use graph::*;
pub use nodes::*;
pub use ports::*;
pub use value::*;
pub use interpreter::*;
