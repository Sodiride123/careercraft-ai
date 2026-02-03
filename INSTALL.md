# CareerCraft AI - Installation Guide

## Overview
CareerCraft AI is a LinkedIn profile to job-tailored resume and cover letter generator application powered by Claude Code with MCP tools.

## Prerequisites
- Python 3.11 or higher
- Claude CLI configured and available in PATH
- Linux/macOS/Windows with WSL

## Installation Steps

### 1. Install Dependencies
```bash
cd /workspace
pip install -r requirements.txt
```

### 2. Make Scripts Executable
```bash
chmod +x start.sh
```

### 3. Start the Application
```bash
./start.sh
```

Or run directly:
```bash
python app.py
```

The application will start on port 9000 by default.

## Files Structure
- `app.py` - Main Flask application
- `start.sh` - Startup script
- `templates/` - HTML templates
- `static/` - CSS and JavaScript files
- `resume_generator.py` - Resume generation logic
- `requirements.txt` - Python dependencies

## Usage
1. Open http://localhost:9000 in your browser
2. Chat with Aria Craftwell (AI Career Coach)
3. Provide your LinkedIn profile URL
4. Share the job description you're applying for
5. Get a tailored resume and cover letter

## Troubleshooting
- If the app doesn't start, check port 9000 is not in use
- Check logs in the `logs/` directory