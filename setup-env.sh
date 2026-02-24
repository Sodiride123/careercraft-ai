#!/bin/bash
# CareerCraft AI - Environment Setup Script
# Creates .env file from settings.json

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

# Settings file locations (in priority order)
SETTINGS_PRIMARY="/root/.claude/settings.json"
SETTINGS_FALLBACK="$SCRIPT_DIR/settings.json"

echo "==> Setting up .env file for CareerCraft AI..."

# Function to extract env vars from settings.json using Python
extract_env_vars() {
    local settings_file="$1"

    if [ ! -f "$settings_file" ]; then
        return 1
    fi

    # Use Python to parse JSON (more reliable than jq which may not be installed)
    python3 << EOF
import json
import sys

try:
    with open("$settings_file", "r") as f:
        data = json.load(f)

    env = data.get("env", {})
    auth_token = env.get("ANTHROPIC_AUTH_TOKEN", "")
    base_url = env.get("ANTHROPIC_BASE_URL", "")

    if not auth_token or not base_url:
        sys.exit(1)

    print(f"ANTHROPIC_API_KEY={auth_token}")
    print(f"ANTHROPIC_BASE_URL={base_url}")
    sys.exit(0)
except Exception as e:
    sys.exit(1)
EOF
}

# Try primary settings file first
echo "    Checking $SETTINGS_PRIMARY..."
if ENV_CONTENT=$(extract_env_vars "$SETTINGS_PRIMARY"); then
    echo "    Found settings in $SETTINGS_PRIMARY"
else
    # Try fallback settings file
    echo "    Not found or incomplete. Checking $SETTINGS_FALLBACK..."
    if ENV_CONTENT=$(extract_env_vars "$SETTINGS_FALLBACK"); then
        echo "    Found settings in $SETTINGS_FALLBACK"
    else
        echo ""
        echo "ERROR: Could not find ANTHROPIC_AUTH_TOKEN and ANTHROPIC_BASE_URL"
        echo ""
        echo "Please ensure one of these files exists with the required settings:"
        echo "  1. $SETTINGS_PRIMARY"
        echo "  2. $SETTINGS_FALLBACK"
        echo ""
        echo "Expected format:"
        echo '  {'
        echo '    "env": {'
        echo '      "ANTHROPIC_AUTH_TOKEN": "your-token",'
        echo '      "ANTHROPIC_BASE_URL": "https://your-api-url"'
        echo '    }'
        echo '  }'
        exit 1
    fi
fi

# Write .env file
echo "$ENV_CONTENT" > "$ENV_FILE"

echo ""
echo "==> Created $ENV_FILE with:"
echo "$ENV_CONTENT" | sed 's/=.*/=***/' # Show keys but hide values
echo ""
echo "==> Environment setup complete!"
