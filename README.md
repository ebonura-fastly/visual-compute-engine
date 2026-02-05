# Configure Compute

Visual security rules editor and runtime for Fastly Compute@Edge.

## Overview

Configure Compute provides a visual node-based editor for creating security rules that run on Fastly's edge network. Rules are designed as flow graphs and deployed directly to the edge - no format conversion needed.

## Components

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   Editor UI     │ ───► │  Config Store    │ ◄─── │   Configure Compute    │
│  (React Flow)   │      │  (compressed)    │      │     (Rust)      │
└─────────────────┘      └──────────────────┘      └─────────────────┘
     Design rules         Shared graph format        Execute rules
```

### Editor UI (`/editor-ui`)
- React-based visual editor using React Flow
- Node types: Request, RuleGroup, Action, Backend
- Connect nodes with edges to create rule flows
- Deploy directly to Fastly Config Store

### Configure Compute (`/compute`)
- Rust service compiled to WebAssembly
- Runs on Fastly Compute@Edge
- Evaluates graph rules at the edge
- Routes requests to backends or blocks them
- Version endpoint: `/_version` returns engine info

## Graph Format

Rules are stored as a single graph structure shared between editor and runtime:

```json
{
  "nodes": [
    {
      "id": "1",
      "type": "request",
      "position": { "x": 0, "y": 0 },
      "data": {}
    },
    {
      "id": "2",
      "type": "ruleGroup",
      "position": { "x": 200, "y": 0 },
      "data": {
        "name": "Block Admin",
        "logic": "AND",
        "conditions": [
          { "id": "c1", "field": "path", "operator": "startsWith", "value": "/admin" }
        ]
      }
    },
    {
      "id": "3",
      "type": "action",
      "position": { "x": 400, "y": -50 },
      "data": { "action": "block", "statusCode": 403, "message": "Forbidden" }
    },
    {
      "id": "4",
      "type": "backend",
      "position": { "x": 400, "y": 50 },
      "data": { "name": "origin", "host": "httpbin.org", "port": 443, "useTLS": true }
    }
  ],
  "edges": [
    { "id": "e1", "source": "1", "target": "2" },
    { "id": "e2", "source": "2", "target": "3", "sourceHandle": "match" },
    { "id": "e3", "source": "2", "target": "4", "sourceHandle": "noMatch" }
  ]
}
```

## Node Types

### Request Node
Entry point for all requests. Every graph must have one.

### RuleGroup Node
Evaluates conditions against the request. Has two outputs:
- `match` - conditions matched
- `noMatch` - conditions did not match

**Condition Fields:**
- `path` - Request path
- `method` - HTTP method
- `host` - Host header
- `userAgent` - User-Agent header
- `clientIp` - Client IP address
- `country` - Geo country code
- Any header name

**Operators:**
- `equals` - Exact match
- `startsWith` - Prefix match
- `endsWith` - Suffix match
- `contains` - Substring match
- `matches` - Regex match
- `in` / `notIn` - List membership

### Action Node
Terminal node that blocks or allows requests.
- `action`: "block" or "allow"
- `statusCode`: HTTP status code (for block)
- `message`: Response body (for block)

### Backend Node
Terminal node that routes requests to an origin.
- `name`: Backend identifier
- `host`: Backend hostname
- `port`: Backend port (default: 443)
- `useTLS`: Enable HTTPS (default: true)

## Development

### Editor UI
```bash
cd editor-ui
npm install
npm run dev
```

### Configure Compute
```bash
cd compute
fastly compute build
fastly compute serve  # Local testing
fastly compute publish  # Deploy
```

## Testing

### Prerequisites

Install wasmtime (WebAssembly runtime) for running unit tests:
```bash
brew install wasmtime
```

### Unit Tests (Rust)

The compute service has 34 unit tests covering node data serialization and graph parsing:

```bash
cd compute
cargo test --lib
```

Tests run via wasmtime executing the WASM binary. Coverage includes:
- Backend node configuration (timeouts, TLS, pooling)
- Header node operations (set, append, remove)
- Cache node settings (TTL, SWR, pass mode)
- Condition node operators and custom headers
- Graph payload serialization roundtrips

### Integration Tests

End-to-end tests verify graph evaluation using Viceroy (Fastly's local runtime):

```bash
cd integration-tests
node test-graphs.mjs
```

This spawns Viceroy per test for isolation. Tests cover:
- Simple routing to backend
- Condition matching (equals, contains, regex, CIDR)
- RuleGroup logic (AND/OR)
- Redirect nodes (301/302)
- Backend configuration

To test against a deployed service:
```bash
CC_TEST_DOMAIN=your-service.edgecompute.app node test-graphs.mjs --deployed
```

### Verify Deployment
After deploying, check the version:
```bash
curl https://your-service.edgecompute.app/_version
# Returns: {"engine":"Configure Compute","version":"1.0.0","format":"graph"}
```

Compare package hash:
```bash
# Local build hash
shasum -a 512 pkg/configure-compute.tar.gz

# Deployed hash (via API)
curl -H "Fastly-Key: $TOKEN" "https://api.fastly.com/service/$SERVICE_ID/version/active/package" | jq '.metadata.hashsum'
```

## Deployment

1. Design rules in the editor UI
2. Click "Deploy" to save to Fastly Config Store
3. The compute service automatically loads the new rules

Rules are stored compressed (gzip + base64) in the `rules_packed` key of the `security_rules` Config Store.

## Architecture

### Security Flow

1. Client makes request to Compute service
2. Compute loads graph from Config Store
3. GraphInterpreter evaluates request starting from Request node
4. Follows edges based on condition matches
5. Reaches terminal node (Action or Backend)
6. Returns response or forwards to backend

### Edge Authentication

When forwarding to backends, the compute service adds an `Edge-Auth` header:
- Format: `timestamp,pop,signature`
- Signature: HMAC-SHA256 of timestamp + POP using shared secret
- Validates requests came through the edge

This prevents attackers from bypassing security rules by hitting backends directly.

#### VCL Validation Snippets (`/compute/VCL`)

If your backend is a Fastly VCL service, add these snippets to validate Edge-Auth:

**edge-auth-recv.vcl** (add to `vcl_recv`):
```vcl
# Validate Edge-Auth header format: timestamp,pop,signature
if (!req.http.Edge-Auth || !req.http.Edge-Auth ~ "^([0-9]+),([^,]+),(0x[0-9a-f]{64})$") {
    error 403 "CC Invalid header format";
}

declare local var.timestamp STRING;
declare local var.data STRING;
declare local var.secret STRING;

set var.timestamp = re.group.1;
set var.data = var.timestamp + "," + re.group.2;
set var.secret = table.lookup(cc_shared_secret, "compute_auth_key");

# Verify HMAC signature
if (!digest.secure_is_equal(digest.hmac_sha256(var.secret, var.data), re.group.3)) {
    error 403 "CC Invalid signature";
}

# Reject requests older than 2 seconds (replay protection)
declare local var.request_time TIME;
set var.request_time = std.time(var.timestamp, std.integer2time(-1));
if (!time.is_after(var.request_time, time.sub(now, 2s))) {
    error 403 "CC Request expired";
}
```

**edge-auth-error.vcl** (add to `vcl_error`):
```vcl
if (obj.status == 403 && obj.response ~ "^CC ") {
    set obj.http.Content-Type = "text/plain";
    synthetic {"Edge Authentication Guard: "} obj.response;
    return(deliver);
}
```

**Setup required:**
1. Create an Edge Dictionary named `cc_shared_secret`
2. Add key `compute_auth_key` with your shared secret
3. Use the same secret in the Compute service's `cc_shared_secret` Config Store

## POC Services

- Compute service: `MPo2eiCmac5m4YUkBJoky4`
- VCL service: `SQnQlsK26fQrakQ9eg1hY5`
