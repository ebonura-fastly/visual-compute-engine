"""Inject config values into Cloud Run service template for VCE.

This script loads a config profile and injects values into the
deployment/run-service.template.yaml file to generate a complete
Cloud Run service spec.
"""

import sys
from pathlib import Path

import yaml


def inject_config(template_path: str, config_profile: str, short_sha: str, project_id: str) -> str:
    """Load config profile and inject values into template.

    Args:
        template_path: Path to run-service.template.yaml
        config_profile: Profile name (e.g., 'staging', 'production')
        short_sha: Git commit SHA (7 chars)
        project_id: GCP project ID

    Returns:
        Rendered YAML string with injected values
    """
    # Load config profile
    config_path = Path(f"deployment/config/{config_profile}.yml")
    if not config_path.exists():
        raise FileNotFoundError(
            f"Config profile '{config_profile}' not found at {config_path}. "
            f"Available profiles: staging, production"
        )

    with open(config_path) as f:
        config = yaml.safe_load(f)

    # Load template
    with open(template_path) as f:
        template = f.read()

    # Extract cloud_run config
    cloud_run = config.get("cloud_run", {})

    # Derive environment from profile name
    if config_profile.startswith("staging"):
        environment = "staging"
    elif config_profile.startswith("production"):
        environment = "production"
    else:
        environment = "development"

    # Get service account from config or compute from convention
    service_account = cloud_run.get("service_account") or f"sa-vce@{project_id}.iam.gserviceaccount.com"

    # Substitution values
    values = {
        "SERVICE_NAME": cloud_run.get("service_name", "vce-editor"),
        "SHORT_SHA": short_sha,
        "SERVICE_ACCOUNT": service_account,
        "ENVIRONMENT": environment,
        "IMAGE": f"us-central1-docker.pkg.dev/{project_id}/vce/vce-editor:{short_sha}",
        "CPU": cloud_run.get("resources", {}).get("cpu", "1"),
        "MEMORY": cloud_run.get("resources", {}).get("memory", "512Mi"),
        "CPU_REQUEST": cloud_run.get("resources", {}).get("cpu_request", "500m"),
        "MEMORY_REQUEST": cloud_run.get("resources", {}).get("memory_request", "256Mi"),
        "MIN_INSTANCES": str(cloud_run.get("scaling", {}).get("min_instances", 0)),
        "MAX_INSTANCES": str(cloud_run.get("scaling", {}).get("max_instances", 10)),
        "CONCURRENCY": str(cloud_run.get("scaling", {}).get("concurrency", 80)),
    }

    # Inject values into template
    result = template
    for key, value in values.items():
        result = result.replace(f"{{{{{key}}}}}", value)

    return result


if __name__ == "__main__":
    if len(sys.argv) != 5:
        print("Usage: python build-config.py <template_path> <config_profile> <short_sha> <project_id>")
        print("Example: python build-config.py deployment/run-service.template.yaml staging abc1234 fastly-soc")
        sys.exit(1)

    template_path = sys.argv[1]
    config_profile = sys.argv[2]
    short_sha = sys.argv[3]
    project_id = sys.argv[4]

    try:
        result = inject_config(template_path, config_profile, short_sha, project_id)

        # Write result
        output_path = "deployment/run-service-generated.yaml"
        with open(output_path, "w") as f:
            f.write(result)

        print(f"Generated {output_path} from {config_profile}")

    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
