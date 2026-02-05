# Configure Compute Terraform Integration (Future)

## Overview

This document outlines how Configure Compute could use Terraform for full service lifecycle management, following the same patterns as ConfigureFastly.

## Current Model (Direct API)

```
Browser (user's Fastly token) → Fastly API
                               └─ PUT /service/{id}/resource/{store_id}/item/{key}
```

- User deploys Compute service separately via `fastly compute publish`
- UI only updates Config Store entries (rules)
- Fast (~2s) but limited to rule updates

## Future Model (Terraform Backend)

```
Browser → Configure Compute Backend API → Terraform → Fastly
                           └─ fastly_service_compute
                           └─ fastly_configstore
                           └─ fastly_configstore_entries
                           └─ fastly_service_compute_backend (dynamic)
```

## Terraform Resources

### Main Module Structure

```hcl
# modules/cc-service/main.tf

resource "fastly_service_compute" "service" {
  name = var.service_name

  domain {
    name = var.domain
  }

  package {
    filename         = var.wasm_package_path
    source_code_hash = filesha256(var.wasm_package_path)
  }

  # Dynamic backends from Configure Compute graph
  dynamic "backend" {
    for_each = var.backends
    content {
      name              = backend.value.name
      address           = backend.value.address
      port              = backend.value.port
      use_ssl           = backend.value.use_ssl
      ssl_cert_hostname = backend.value.ssl_cert_hostname
    }
  }

  # Config Store link
  resource_link {
    name        = "security_rules"
    resource_id = fastly_configstore.rules.id
  }

  # Logging endpoint
  dynamic "logging_https" {
    for_each = var.logging_endpoint != null ? [1] : []
    content {
      name   = "security_logs"
      url    = var.logging_endpoint
      format = jsonencode({ /* Configure Compute log format */ })
    }
  }
}

resource "fastly_configstore" "rules" {
  name = "${var.service_name}-rules"
}

resource "fastly_configstore_entries" "rules" {
  store_id = fastly_configstore.rules.id

  entries = {
    rules_packed = var.rules_packed  # Base64-encoded graph JSON
  }
}
```

### Variables

```hcl
# modules/cc-service/variables.tf

variable "service_name" {
  type        = string
  description = "Name of the Fastly Compute service"
}

variable "domain" {
  type        = string
  description = "Domain for the service (e.g., example.configurefastly.com)"
}

variable "wasm_package_path" {
  type        = string
  description = "Path to the Configure Compute engine WASM package"
}

variable "rules_packed" {
  type        = string
  description = "Base64-encoded graph rules JSON"
}

variable "backends" {
  type = list(object({
    name              = string
    address           = string
    port              = number
    use_ssl           = bool
    ssl_cert_hostname = string
  }))
  description = "Backend definitions extracted from Configure Compute graph"
}

variable "logging_endpoint" {
  type        = string
  default     = null
  description = "Optional HTTPS logging endpoint URL"
}
```

## API Design

### Endpoints

```
POST /deploy
  - Accepts Configure Compute deployment config (graph, service name, domain)
  - Extracts backends from graph
  - Generates Terraform config
  - Runs terraform apply in workspace
  - Returns deployment_id for SSE streaming

GET /deploy_events/{deployment_id}
  - SSE stream of Terraform output
  - Same pattern as ConfigureFastly

GET /services
  - List user's deployed Configure Compute services
  - Query Terraform state or Fastly API

DELETE /services/{service_id}
  - terraform destroy for the workspace
```

### Deployment Config Schema

```typescript
interface Configure ComputeDeploymentConfig {
  id: string;              // Becomes Terraform workspace name
  service_name: string;
  domain: string;
  graph: {
    nodes: Node[];
    edges: Edge[];
  };
  logging_endpoint?: string;
}
```

## User Isolation

Same pattern as ConfigureFastly:

1. Each deployment config has unique `id`
2. `id` → Terraform workspace name
3. State stored at: `gs://{bucket}/configure-compute/terraform/{workspace}/default.tfstate`
4. Complete isolation between workspaces

## WASM Package Handling

Options:

1. **Embedded in backend** - Pre-built WASM stored in container, used for all deployments
2. **GCS artifact** - Upload WASM to bucket, reference in Terraform
3. **Fastly Package Hash** - Use `fastly_package_hash` data source with pre-uploaded package

Recommended: Option 1 for simplicity - all users get same Configure Compute engine version.

## Integration with ConfigureFastly

Future unified product could:

1. Share backend infrastructure (Cloud Run, IAP, Terraform runner)
2. Add service type selector: "VCL Service" vs "Compute Service (Configure Compute)"
3. Share workspace/state management patterns
4. Unified service list showing both VCL and Compute services

## Migration Path

1. **Phase 1** (Current): Direct API mode, no backend
2. **Phase 2**: Add optional Terraform backend for full service management
3. **Phase 3**: Integrate with ConfigureFastly UI shell
4. **Phase 4**: Unified product with shared backend

## Not In Scope

- Per-user Fastly API keys (use server-level key like ConfigureFastly)
- Custom WASM uploads (all users get standard Configure Compute engine)
- VCL generation (that's ConfigureFastly's domain)
