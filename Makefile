# MSS Engine - Development Makefile
# Run 'make' or 'make help' for available commands

.PHONY: help dev build serve ui clean install all

# Default target
help:
	@echo "MSS Engine Development Commands"
	@echo "================================"
	@echo ""
	@echo "  make dev        - Run both UI and Compute locally (recommended)"
	@echo "  make ui         - Run only the Editor UI (port 5173)"
	@echo "  make serve      - Run only the Compute engine (port 7676)"
	@echo "  make build      - Build the Compute WASM binary"
	@echo "  make install    - Install all dependencies"
	@echo "  make clean      - Clean build artifacts"
	@echo ""
	@echo "Quick Start:"
	@echo "  1. make install  - First time setup"
	@echo "  2. make dev      - Start developing"
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

# Build and update the embedded WASM in editor-ui
embed-wasm: build
	@echo "Embedding WASM in Editor UI..."
	base64 -i compute/target/wasm32-wasip1/release/mss-engine.wasm -o editor-ui/src/assets/mss-engine.wasm.b64
	@echo "Updated editor-ui/src/assets/mss-engine.wasm.b64"
