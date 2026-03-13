# CareerCraft AI - Resume & Cover Letter Generator

## Overview

CareerCraft AI is an AI-powered career assistant that generates professional, job-tailored resumes and cover letters. Users chat with Aria, an AI career consultant, to provide their background and target job — then receive polished, downloadable PDF documents.

**Profile input** is flexible: paste a LinkedIn URL, upload a resume file (PDF/DOCX/TXT), or type a summary of your experience. **Job input** supports LinkedIn job URLs, other job site URLs, pasted job descriptions, or a simple job title.

After the initial generation, users can freely chat with Aria to request targeted edits (e.g., "make the cover letter shorter"), ask career questions, or generate new documents for different roles — all without restarting the session.

## Architecture

### How It Works

```
User chats with Aria (AI career consultant)
        ↓
┌─────────────────────────────────────────┐
│ 1. Collect Profile                      │
│    → LinkedIn URL (MCP) / File / Text   │
├─────────────────────────────────────────┤
│ 2. Collect Job Details                  │
│    → LinkedIn job URL (MCP) / URL /     │
│      pasted description / job title     │
├─────────────────────────────────────────┤
│ 3. Generate Tailored Resume HTML        │
│    → Claude CLI                         │
├─────────────────────────────────────────┤
│ 4. Generate Cover Letter HTML           │
│    → Claude CLI                         │
├─────────────────────────────────────────┤
│ 5. Convert to PDF                       │
│    → WeasyPrint                         │
└─────────────────────────────────────────┘
        ↓
    Preview, Download, or Edit via Chat
```

### Edit Mode (Fast Path)

When a user requests changes to existing documents (e.g., "shorten the cover letter"), the app skips steps 1-2 and only regenerates the targeted document using saved profile/job data from the previous generation.

### Conversation Flow

All user messages go through the LLM, which decides what to do:

```
Every message → Aria (LLM) decides:
  ├── Profile provided     → save it, ask for job info
  ├── Job + profile ready  → generate resume & cover letter
  ├── Edit request         → modify only the targeted section
  ├── New job posting      → regenerate with saved profile
  ├── Questions & advice   → conversational response
  └── File / URL shared    → Aria asks what to do
```

### Dependencies

| Component | Required | Purpose |
|-----------|----------|---------|
| Claude CLI (`claude`) | **Yes** | AI generation and conversational chat |
| WeasyPrint | **Yes** | HTML → PDF conversion |
| `.env` with LinkedIn MCP config | Optional | Faster LinkedIn profile/job fetching |

## Tech Stack

- **Backend**: Flask (Python 3.11)
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **AI**: Claude CLI (`claude -p`)
- **LinkedIn Data**: MCP client (optional) or Claude CLI fallback
- **File Parsing**: PyPDF2, python-docx
- **PDF Generation**: WeasyPrint

## Project Structure

```
careercraft-ai/
├── app.py                  # Main Flask application & generation pipeline
├── file_parser.py          # PDF/DOCX/TXT upload parser
├── linkedin_client.py      # MCP client for LinkedIn (optional)
├── requirements.txt        # Python dependencies
├── start.sh                # Startup script (sandbox)
├── setup.sh                # Dependency setup (sandbox)
├── client/                 # React frontend (Vite)
│   └── src/
│       ├── components/chat/ChatInterface.tsx  # Main chat UI (LLM-driven)
│       ├── lib/api.ts                         # API client
│       └── pages/Documents.tsx                # Document management page
├── output/                 # Generated files (HTML, PDF, JSON)
└── logs/                   # Application logs
```

## Installation

### Quick Start (Sandbox)

```bash
./setup.sh && ./start.sh
```

### Manual Setup

```bash
# Python environment
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# For PDF generation on macOS
brew install pango

# Frontend
cd client && npm install && npm run build && cd ..

# Start (port 8888)
python app.py
```

**Note**: If running inside a Claude Code session, unset the `CLAUDECODE` env variable to allow nested `claude -p` calls:

```bash
CLAUDECODE= python app.py
```

## Configuration

### Optional: Enable MCP for LinkedIn

Create `.env` file to use MCP for direct LinkedIn profile/job fetching:

```env
ANTHROPIC_BASE_URL=http://localhost:4000
ANTHROPIC_API_KEY=your_litellm_api_key
```

This enables faster, more reliable LinkedIn data fetching. Without it, Claude CLI is used as a fallback.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/generate` | POST | Start resume/cover letter generation |
| `/api/status/<job_id>` | GET | Get job status and progress |
| `/api/download/<job_id>` | GET | Download resume PDF |
| `/api/download-cover-letter/<job_id>` | GET | Download cover letter PDF |
| `/api/resumes` | GET | List all completed documents |
| `/api/resumes/<job_id>` | DELETE | Delete a document and its files |
| `/api/upload` | POST | Upload and parse a file (PDF/DOCX/TXT) |
| `/api/chat` | POST | LLM-driven conversational follow-up |

### Generate Resume

```bash
curl -X POST http://localhost:8888/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "linkedin_url": "https://www.linkedin.com/in/username/",
    "job_input": "Senior Software Engineer at Google"
  }'
```

### Edit Existing Documents

```bash
curl -X POST http://localhost:8888/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "profile_text": "...",
    "job_input": "Software Engineer at Google",
    "edit_instructions": "Make the cover letter shorter",
    "edit_target": "cover_letter",
    "previous_job_id": "069a86b9"
  }'
```

## License

MIT License
