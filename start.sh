#!/bin/bash
# CareerCraft AI - Startup Script
# Serves the app on port 8888 (Flask serves built frontend)

set -e

export HOME=/root
export PATH="/usr/local/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "$SCRIPT_DIR/logs" "$SCRIPT_DIR/output"

# Load environment variables from .env if it exists
if [ -f "$SCRIPT_DIR/.env" ]; then
    echo "==> Loading environment from .env..."
    set -a
    source "$SCRIPT_DIR/.env"
    set +a
fi

# Check if frontend is built
if [ ! -d "$SCRIPT_DIR/client/dist" ]; then
    echo "==> Frontend not built. Building now..."
    cd "$SCRIPT_DIR/client" && npm run build
fi

echo "==> Starting CareerCraft AI on port 8888..."
cd "$SCRIPT_DIR" && python app.py > logs/app.log 2>&1 &

echo "==> CareerCraft AI is running."
echo "    App: http://localhost:8888"
echo ""
echo "    Logs: $SCRIPT_DIR/logs/app.log"