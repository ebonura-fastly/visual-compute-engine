//! Compression benchmark: JSON vs RON
//!
//! Run with: cargo test bench_compression -- --nocapture

use crate::graph::{Edge, Graph};
use crate::nodes::{
    ActionType, ChallengeType, ConditionValue, HeaderOp, LogSeverity, Node, NodeKind, Operator,
    RateLimitMode, RateWindow, RequestField,
};
use flate2::write::GzEncoder;
use flate2::Compression;
use std::io::Write;

/// Generate a test graph with the specified number of nodes
fn generate_test_graph(num_nodes: usize) -> Graph {
    let mut graph = Graph::new(format!("Test Graph ({} nodes)", num_nodes));
    graph.description = "A test graph for benchmarking serialization formats".to_string();

    // Always start with a Request node
    let request_node = Node {
        id: 0,
        kind: NodeKind::Request,
        position: (0.0, 0.0),
    };
    graph.add_node(request_node);

    let mut current_id = 1u32;
    let mut last_condition_id = 0u32;

    // Generate a variety of nodes to simulate realistic graphs
    for i in 1..num_nodes {
        let node = match i % 8 {
            0 => Node {
                id: current_id,
                kind: NodeKind::Condition {
                    field: RequestField::Path,
                    operator: Operator::StartsWith,
                    value: ConditionValue::String("/admin".to_string()),
                },
                position: (i as f32 * 200.0, 0.0),
            },
            1 => Node {
                id: current_id,
                kind: NodeKind::Condition {
                    field: RequestField::ClientIp,
                    operator: Operator::InCidr,
                    value: ConditionValue::CidrList(vec![
                        "192.168.0.0/16".to_string(),
                        "10.0.0.0/8".to_string(),
                        "172.16.0.0/12".to_string(),
                    ]),
                },
                position: (i as f32 * 200.0, 100.0),
            },
            2 => Node {
                id: current_id,
                kind: NodeKind::Condition {
                    field: RequestField::UserAgent,
                    operator: Operator::Contains,
                    value: ConditionValue::String("bot".to_string()),
                },
                position: (i as f32 * 200.0, 200.0),
            },
            3 => Node {
                id: current_id,
                kind: NodeKind::And { input_count: 2 },
                position: (i as f32 * 200.0, 300.0),
            },
            4 => Node {
                id: current_id,
                kind: NodeKind::Or { input_count: 3 },
                position: (i as f32 * 200.0, 400.0),
            },
            5 => Node {
                id: current_id,
                kind: NodeKind::RateLimit {
                    mode: RateLimitMode::CheckRateAndPenalize,
                    counter_name: format!("rate_counter_{}", i),
                    window: RateWindow::SixtySecs,
                    threshold: 100,
                    penalty_ttl_seconds: 300,
                },
                position: (i as f32 * 200.0, 500.0),
            },
            6 => Node {
                id: current_id,
                kind: NodeKind::Action {
                    action: ActionType::Block {
                        status_code: 403,
                        message: "Access denied by security policy".to_string(),
                    },
                },
                position: (i as f32 * 200.0, 600.0),
            },
            7 => Node {
                id: current_id,
                kind: NodeKind::Header {
                    operation: HeaderOp::Set,
                    name: "X-Security-Check".to_string(),
                    value: Some("passed".to_string()),
                },
                position: (i as f32 * 200.0, 700.0),
            },
            _ => unreachable!(),
        };

        // Track last condition for edge generation
        if matches!(node.kind, NodeKind::Condition { .. }) {
            last_condition_id = current_id;
        }

        graph.add_node(node);
        current_id += 1;
    }

    // Add some edges to make the graph realistic
    // Connect request to first condition
    if graph.nodes.len() > 1 {
        graph.edges.push(Edge {
            from_node: 0,
            from_port: 0,
            to_node: 1,
            to_port: 0,
        });
    }

    // Add more edges for larger graphs
    for i in 2..graph.nodes.len().min(20) {
        graph.edges.push(Edge {
            from_node: (i - 1) as u32,
            from_port: 0,
            to_node: i as u32,
            to_port: 0,
        });
    }

    graph
}

/// Compress data with gzip
fn gzip_compress(data: &[u8]) -> Vec<u8> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(data).unwrap();
    encoder.finish().unwrap()
}

/// Format bytes as human-readable string
fn format_bytes(bytes: usize) -> String {
    if bytes >= 1024 * 1024 {
        format!("{:.2} MB", bytes as f64 / (1024.0 * 1024.0))
    } else if bytes >= 1024 {
        format!("{:.2} KB", bytes as f64 / 1024.0)
    } else {
        format!("{} B", bytes)
    }
}

/// Run benchmark for a single graph
fn benchmark_graph(graph: &Graph) {
    // Serialize to JSON
    let json_str = serde_json::to_string(graph).unwrap();
    let json_pretty = serde_json::to_string_pretty(graph).unwrap();

    // Serialize to RON
    let ron_str = ron::to_string(graph).unwrap();
    let ron_pretty = graph.to_ron().unwrap();

    // Compress each format
    let json_compressed = gzip_compress(json_str.as_bytes());
    let json_pretty_compressed = gzip_compress(json_pretty.as_bytes());
    let ron_compressed = gzip_compress(ron_str.as_bytes());
    let ron_pretty_compressed = gzip_compress(ron_pretty.as_bytes());

    // Calculate compression ratios
    let json_ratio = 100.0 - (json_compressed.len() as f64 / json_str.len() as f64 * 100.0);
    let json_pretty_ratio =
        100.0 - (json_pretty_compressed.len() as f64 / json_pretty.len() as f64 * 100.0);
    let ron_ratio = 100.0 - (ron_compressed.len() as f64 / ron_str.len() as f64 * 100.0);
    let ron_pretty_ratio =
        100.0 - (ron_pretty_compressed.len() as f64 / ron_pretty.len() as f64 * 100.0);

    println!("\n{}", "=".repeat(80));
    println!(
        "Graph: {} nodes, {} edges",
        graph.nodes.len(),
        graph.edges.len()
    );
    println!("{}", "=".repeat(80));

    println!("\n{:<25} {:>15} {:>15} {:>12}", "Format", "Raw Size", "Compressed", "Ratio");
    println!("{}", "-".repeat(70));

    println!(
        "{:<25} {:>15} {:>15} {:>11.1}%",
        "JSON (compact)",
        format_bytes(json_str.len()),
        format_bytes(json_compressed.len()),
        json_ratio
    );

    println!(
        "{:<25} {:>15} {:>15} {:>11.1}%",
        "JSON (pretty)",
        format_bytes(json_pretty.len()),
        format_bytes(json_pretty_compressed.len()),
        json_pretty_ratio
    );

    println!(
        "{:<25} {:>15} {:>15} {:>11.1}%",
        "RON (compact)",
        format_bytes(ron_str.len()),
        format_bytes(ron_compressed.len()),
        ron_ratio
    );

    println!(
        "{:<25} {:>15} {:>15} {:>11.1}%",
        "RON (pretty)",
        format_bytes(ron_pretty.len()),
        format_bytes(ron_pretty_compressed.len()),
        ron_pretty_ratio
    );

    // Compare JSON vs RON compressed
    println!("\n{}", "-".repeat(70));
    println!("Comparison (compressed):");

    let json_vs_ron = json_compressed.len() as f64 / ron_compressed.len() as f64;
    if json_vs_ron < 1.0 {
        println!(
            "  JSON compact is {:.1}% SMALLER than RON compact",
            (1.0 - json_vs_ron) * 100.0
        );
    } else {
        println!(
            "  RON compact is {:.1}% SMALLER than JSON compact",
            (json_vs_ron - 1.0) * 100.0
        );
    }

    let json_pretty_vs_ron_pretty =
        json_pretty_compressed.len() as f64 / ron_pretty_compressed.len() as f64;
    if json_pretty_vs_ron_pretty < 1.0 {
        println!(
            "  JSON pretty is {:.1}% SMALLER than RON pretty",
            (1.0 - json_pretty_vs_ron_pretty) * 100.0
        );
    } else {
        println!(
            "  RON pretty is {:.1}% SMALLER than JSON pretty",
            (json_pretty_vs_ron_pretty - 1.0) * 100.0
        );
    }

    // Config Store fit check (8KB limit)
    let config_store_limit = 8000;
    println!("\n{}", "-".repeat(70));
    println!("Config Store fit check (8KB limit):");
    println!(
        "  JSON compact compressed: {} ({})",
        if json_compressed.len() <= config_store_limit {
            "FITS"
        } else {
            "TOO LARGE"
        },
        format_bytes(json_compressed.len())
    );
    println!(
        "  RON compact compressed:  {} ({})",
        if ron_compressed.len() <= config_store_limit {
            "FITS"
        } else {
            "TOO LARGE"
        },
        format_bytes(ron_compressed.len())
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bench_compression_comparison() {
        println!("\n");
        println!("{}", "=".repeat(80));
        println!("         RON vs JSON Serialization & Compression Benchmark");
        println!("{}", "=".repeat(80));

        // Test different graph sizes
        let sizes = [5, 10, 20, 50, 100];

        for &size in &sizes {
            let graph = generate_test_graph(size);
            benchmark_graph(&graph);
        }

        println!("\n{}", "=".repeat(80));
        println!("                              SUMMARY");
        println!("{}", "=".repeat(80));
        println!("\nKey findings:");
        println!("- Compare compressed sizes to determine optimal storage format");
        println!("- Config Store limit is 8KB per value");
        println!("- Base64 encoding adds ~33% overhead after compression");
        println!("\nRecommendation:");
        println!("- Use whichever format compresses smaller for your typical graph size");
        println!("- Consider parsing speed if frequently deserializing");
    }

    #[test]
    fn bench_with_base64_overhead() {
        use base64::{engine::general_purpose::STANDARD as BASE64, Engine};

        println!("\n");
        println!("{}", "=".repeat(80));
        println!("     RON vs JSON with Base64 Encoding (Actual Config Store Format)");
        println!("{}", "=".repeat(80));

        let sizes = [10, 50, 100];

        for &size in &sizes {
            let graph = generate_test_graph(size);

            // Serialize
            let json_str = serde_json::to_string(&graph).unwrap();
            let ron_str = ron::to_string(&graph).unwrap();

            // Compress
            let json_compressed = gzip_compress(json_str.as_bytes());
            let ron_compressed = gzip_compress(ron_str.as_bytes());

            // Base64 encode (this is what goes in Config Store)
            let json_b64 = BASE64.encode(&json_compressed);
            let ron_b64 = BASE64.encode(&ron_compressed);

            println!("\n{} nodes:", size);
            println!(
                "  JSON: {} raw -> {} compressed -> {} base64",
                format_bytes(json_str.len()),
                format_bytes(json_compressed.len()),
                format_bytes(json_b64.len())
            );
            println!(
                "  RON:  {} raw -> {} compressed -> {} base64",
                format_bytes(ron_str.len()),
                format_bytes(ron_compressed.len()),
                format_bytes(ron_b64.len())
            );

            let config_store_limit = 8000;
            println!(
                "  Config Store: JSON {} | RON {}",
                if json_b64.len() <= config_store_limit {
                    "FITS"
                } else {
                    "TOO LARGE"
                },
                if ron_b64.len() <= config_store_limit {
                    "FITS"
                } else {
                    "TOO LARGE"
                }
            );

            // Winner
            if json_b64.len() < ron_b64.len() {
                println!(
                    "  Winner: JSON ({:.1}% smaller)",
                    (1.0 - json_b64.len() as f64 / ron_b64.len() as f64) * 100.0
                );
            } else if ron_b64.len() < json_b64.len() {
                println!(
                    "  Winner: RON ({:.1}% smaller)",
                    (1.0 - ron_b64.len() as f64 / json_b64.len() as f64) * 100.0
                );
            } else {
                println!("  Winner: TIE");
            }
        }
    }
}
