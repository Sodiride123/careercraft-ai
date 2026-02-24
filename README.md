# CareerCraft AI - LinkedIn Resume & Cover Letter Generator

## Overview

CareerCraft AI generates professional, job-tailored resumes and cover letters from LinkedIn profiles using AI.

## Architecture

This app is designed to run in a **sandbox environment** with Claude CLI pre-installed.

### How It Works

```
User Input (LinkedIn URL + Job Description)
        ↓
┌─────────────────────────────────────────┐
│ 1. Fetch LinkedIn Profile               │
│    → Try MCP first (if .env configured) │
│    → Fallback to Claude CLI             │
├─────────────────────────────────────────┤
│ 2. Analyze Job Description              │
│    → Claude CLI                         │
├─────────────────────────────────────────┤
│ 3. Generate Resume HTML                 │
│    → Claude CLI                         │
├─────────────────────────────────────────┤
│ 4. Generate Cover Letter HTML           │
│    → Claude CLI                         │
├─────────────────────────────────────────┤
│ 5. Convert to PDF                       │
│    → wkhtmltopdf                        │
└─────────────────────────────────────────┘
        ↓
    Download Resume + Cover Letter
```

### Dependencies

| Component | Required | Purpose |
|-----------|----------|---------|
| Claude CLI (`/usr/local/bin/claude`) | **Yes** | AI generation (job analysis, resume, cover letter) |
| `.env` with `ANTHROPIC_API_KEY` | Optional | Enables MCP for faster LinkedIn profile fetching |
| wkhtmltopdf | Yes | PDF conversion |

## Tech Stack

- **Backend**: Flask (Python 3.11)
- **Frontend**: React 18 + TypeScript + Vite
- **AI**: Claude CLI (sandbox) or LiteLLM API
- **LinkedIn Data**: MCP (optional) or Claude CLI
- **PDF**: wkhtmltopdf

## Project Structure

```
careercraft-ai/
├── app.py                  # Main Flask application
├── linkedin_client.py      # MCP client for LinkedIn (optional)
├── requirements.txt        # Python dependencies
├── start.sh                # Startup script (sandbox)
├── setup.sh                # Dependency setup (sandbox)
├── client/                 # React frontend
├── output/                 # Generated files
├── logs/                   # Application logs
├── static/                 # Built frontend assets
└── templates/              # Flask templates
```

## Installation (Sandbox)

### Quick Start

```bash
# Install dependencies
./setup.sh

# Start the app
./start.sh
```

### Manual Setup

```bash
# Install Python dependencies
pip install -r requirements.txt

# Install frontend dependencies
cd client && npm install && cd ..

# Start backend
python app.py

# Start frontend (separate terminal)
cd client && npm run dev
```

## Configuration

### Optional: Enable MCP for LinkedIn

Create `.env` file to use MCP instead of Claude CLI for LinkedIn profile fetching:

```env
ANTHROPIC_BASE_URL=http://localhost:4000
ANTHROPIC_API_KEY=your_litellm_api_key
```

**Note**: This only affects LinkedIn profile fetching. All other AI operations still use Claude CLI.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/generate` | POST | Start resume generation |
| `/api/status/<job_id>` | GET | Get job status |
| `/api/download/<job_id>` | GET | Download resume |
| `/api/download-cover-letter/<job_id>` | GET | Download cover letter |
| `/api/resumes` | GET | List completed resumes |

### Generate Resume

```bash
curl -X POST http://localhost:8888/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "linkedin_url": "https://www.linkedin.com/in/username/",
    "job_ad_text": "Job description here"
  }'
```

## Running Locally (Without Sandbox)

The default app requires Claude CLI which is only available in the sandbox. For local development, use the `verify-and-debug-app` branch which replaces Claude CLI with direct LiteLLM API calls.

```bash
git checkout verify-and-debug-app

# Create .env (required for local)
cat > .env << 'EOF'
ANTHROPIC_BASE_URL=http://localhost:4000
ANTHROPIC_API_KEY=your_litellm_api_key
EOF

# Setup
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# For PDF generation on macOS
brew install pango

# Run
python app.py
```

## License

MIT License
