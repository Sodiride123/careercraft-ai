#!/bin/bash
# CareerCraft AI - Startup Script
# Ensures proper environment variables are set for Claude Code

# Set HOME environment variable (required for Claude Code)
export HOME=/root
export PATH="/usr/local/bin:$PATH"

# Change to app directory
cd /workspace/linkedin-resume-app

# Create logs directory if it doesn't exist
mkdir -p logs output

# Start the Flask application
echo "Starting CareerCraft AI on port 9000..."
echo "HOME=$HOME"
echo "PATH=$PATH"

exec python app.py