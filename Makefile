# MSS Engine - Development Makefile
# Run 'make' or 'make help' for available commands

.PHONY: help dev build serve ui clean install all local local-api

# Default target
help:
	@echo "MSS Engine Development Commands"
	@echo "================================"
	@echo ""
	@echo "  make local      - Run full local dev environment (recommended for demos)"
	@echo "  make dev        - Run UI and Compute (without local API server)"
	@echo "  make ui         - Run only the Editor UI (port 5173)"
	@echo "  make serve      - Run only the Compute engine (port 7676)"
	@echo "  make build      - Build the Compute WASM binary"
	@echo "  make install    - Install all dependencies"
	@echo "  make clean      - Clean build artifacts"
	@echo ""
	@echo "Quick Start:"
	@echo "  1. make install  - First time setup"
	@echo "  2. make local    - Start local dev environment"
	@echo ""
	@echo "Local Dev Mode:"
	@echo "  The 'local' target runs all three services:"
	@echo "    - Editor UI on http://localhost:5173"
	@echo "    - Local API on http://localhost:3001 (for saving rules)"
	@echo "    - Compute on http://127.0.0.1:7676"
	@echo ""
	@echo "  Click 'Switch to Local Dev Mode' in the UI to enable."
	@echo "  Rules save directly to compute/security-rules.json."
	@echo ""

# Install dependencies
install:
	@echo "Installing Editor UI dependencies..."
	cd editor-ui && npm install
	@echo ""
	@echo "Checking Rust toolchain..."
	cd compute && rustup show
	@echo ""
	@echo "Done! Run 'make dev' to start."

# Build the Compute WASM binary
build:
	@echo "Building MSS Engine..."
	cd compute && cargo build --bin mss-engine --release --target wasm32-wasip1
	@echo ""
	@echo "Binary location: compute/target/wasm32-wasip1/release/mss-engine.wasm"
	@ls -lh compute/target/wasm32-wasip1/release/mss-engine.wasm

# Run Compute engine locally (requires build first)
serve: build
	@echo "Starting MSS Engine on http://127.0.0.1:7676"
	@echo "Test with: curl http://127.0.0.1:7676/_version"
	@echo ""
	cd compute && fastly compute serve

# Run Editor UI
ui:
	@echo "Starting Editor UI on http://localhost:5173"
	cd editor-ui && npm run dev

# Run both UI and Compute (in foreground - use two terminals or Ctrl+C to stop)
dev:
	@echo "==================================================="
	@echo "  MSS Engine Development Mode"
	@echo "==================================================="
	@echo ""
	@echo "Starting services..."
	@echo "  - Editor UI:      http://localhost:5173"
	@echo "  - Compute Engine: http://127.0.0.1:7676"
	@echo ""
	@echo "Press Ctrl+C to stop"
	@echo ""
	@# Run both in parallel, kill both on Ctrl+C
	@trap 'kill 0' INT; \
		(cd editor-ui && npm run dev) & \
		(cd compute && fastly compute serve) & \
		wait

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	cd compute && cargo clean
	cd editor-ui && rm -rf node_modules/.cache dist
	@echo "Done!"

# Run the local API server (for local dev mode file writes)
local-api:
	@echo "Starting Local API server on http://localhost:3001"
	cd editor-ui && node local-server.js

# Run full local development environment (UI + Local API + Compute)
local: build
	@echo "╔═══════════════════════════════════════════════════════════════╗"
	@echo "║           MSS Engine - Local Development Mode                 ║"
	@echo "╠═══════════════════════════════════════════════════════════════╣"
	@echo "║  Editor UI:    http://localhost:5173                          ║"
	@echo "║  Local API:    http://localhost:3001 (for saving rules)       ║"
	@echo "║  Compute:      http://127.0.0.1:7676                          ║"
	@echo "╠═══════════════════════════════════════════════════════════════╣"
	@echo "║  In the UI, click 'Switch to Local Dev Mode' to enable.       ║"
	@echo "║  Rules are saved to compute/security-rules.json automatically.║"
	@echo "╚═══════════════════════════════════════════════════════════════╝"
	@echo ""
	@echo "Press Ctrl+C to stop all services"
	@echo ""
	@trap 'kill 0' INT; \
		(cd editor-ui && npm run dev) & \
		(cd editor-ui && node local-server.js) & \
		(cd compute && fastly compute serve) & \
		wait

# Build and update the embedded WASM in editor-ui
embed-wasm: build
	@echo "Embedding WASM in Editor UI..."
	base64 -i compute/target/wasm32-wasip1/release/mss-engine.wasm -o editor-ui/src/assets/mss-engine.wasm.b64
	@echo "Updated editor-ui/src/assets/mss-engine.wasm.b64"

# ============================================================================
# LOCAL DEMO MODE
# ============================================================================
# For demos: Run Compute locally, edit rules in UI, export to local file
#
# Quick Start (Demo):
#   1. make demo           - Start both UI and local Compute server
#   2. Design rules in the Editor UI (http://localhost:5173)
#   3. Click "↓ Export JSON (for local dev)" in the sidebar
#   4. Copy downloaded file to compute/security-rules.json
#   5. Restart with 'make serve' to reload rules
#
# Two-Terminal Workflow (faster iteration):
#   Terminal 1: make serve   - Compute server on http://127.0.0.1:7676
#   Terminal 2: make ui      - Editor UI on http://localhost:5173
#   - Export JSON from UI → Copy to compute/security-rules.json
#   - Ctrl+C and restart 'make serve' to reload
#
# Test requests:
#   curl http://127.0.0.1:7676/_version
#   curl http://127.0.0.1:7676/admin/test  (should be blocked with sample rules)
#   curl http://127.0.0.1:7676/hello       (should pass through)

demo: dev

# Show current local rules
show-rules:
	@echo "Current local rules (compute/security-rules.json):"
	@echo "=================================================="
	@cat compute/security-rules.json | python3 -c "import sys,json,base64; d=json.load(sys.stdin); p=d.get('rules_packed',''); print(base64.b64decode(p[4:] if p.startswith('raw:') else p).decode())" 2>/dev/null | python3 -m json.tool || cat compute/security-rules.json

# Create a sample rule config for local testing
sample-rules:
	@echo "Creating sample rules in compute/security-rules.json..."
	@echo '{"rules_packed":"raw:eyJub2RlcyI6W3siaWQiOiJyZXEtMSIsInR5cGUiOiJyZXF1ZXN0IiwicG9zaXRpb24iOnsieCI6MTAwLCJ5IjoxMDB9LCJkYXRhIjp7fX0seyJpZCI6ImNvbmQtMSIsInR5cGUiOiJjb25kaXRpb24iLCJwb3NpdGlvbiI6eyJ4IjozMDAsInkiOjEwMH0sImRhdGEiOnsiZmllbGQiOiJwYXRoIiwib3BlcmF0b3IiOiJzdGFydHNXaXRoIiwidmFsdWUiOiIvYWRtaW4ifX0seyJpZCI6ImFjdGlvbi0xIiwidHlwZSI6ImFjdGlvbiIsInBvc2l0aW9uIjp7IngiOjUwMCwieSI6NTB9LCJkYXRhIjp7ImFjdGlvbiI6ImJsb2NrIiwic3RhdHVzQ29kZSI6NDAzLCJtZXNzYWdlIjoiQWNjZXNzIGRlbmllZCJ9fSx7ImlkIjoiYmFja2VuZC0xIiwidHlwZSI6ImJhY2tlbmQiLCJwb3NpdGlvbiI6eyJ4Ijo1MDAsInkiOjE1MH0sImRhdGEiOnsibmFtZSI6Im9yaWdpbiIsImhvc3QiOiJodHRwYmluLm9yZyIsInBvcnQiOjQ0MywidXNlVExTIjp0cnVlfX1dLCJlZGdlcyI6W3siaWQiOiJlMSIsInNvdXJjZSI6InJlcS0xIiwic291cmNlSGFuZGxlIjoicmVxdWVzdCIsInRhcmdldCI6ImNvbmQtMSIsInRhcmdldEhhbmRsZSI6InRyaWdnZXIifSx7ImlkIjoiZTIiLCJzb3VyY2UiOiJjb25kLTEiLCJzb3VyY2VIYW5kbGUiOiJ0cnVlIiwidGFyZ2V0IjoiYWN0aW9uLTEiLCJ0YXJnZXRIYW5kbGUiOiJ0cmlnZ2VyIn0seyJpZCI6ImUzIiwic291cmNlIjoiY29uZC0xIiwic291cmNlSGFuZGxlIjoiZmFsc2UiLCJ0YXJnZXQiOiJiYWNrZW5kLTEiLCJ0YXJnZXRIYW5kbGUiOiJyb3V0ZSJ9XX0="}' > compute/security-rules.json
	@echo "Done! Rules: Block /admin/*, allow everything else"
	@echo "Run 'make serve' to test"
