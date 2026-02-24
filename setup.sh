
#!/bin/bash
# CareerCraft AI - Dependency Setup Script
# Run this once before starting the app

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Installing Python dependencies..."
pip install -r "$SCRIPT_DIR/requirements.txt" -q

echo "==> Installing frontend Node dependencies..."
cd "$SCRIPT_DIR/client" && npm install

echo "==> Creating required runtime directories..."
mkdir -p "$SCRIPT_DIR/logs" "$SCRIPT_DIR/output"

echo "==> Setup complete"
