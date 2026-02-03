# Claude Token Usage Monitor - Installation Guide

## Overview
A real-time Claude API token usage and cost monitoring dashboard.

## Prerequisites
- Python 3.8 or higher
- Claude API access

## Installation Steps

### 1. Install Dependencies
```bash
cd /workspace/all_apps/token_monitor
pip install -r requirements.txt
```

### 2. Configure Application
Edit `app.py` if needed to customize:
- Port (default: 9010)
- Update interval
- Token pricing

### 3. Start the Monitor
```bash
python app.py
```

The monitor will start on port 9010 by default.

## Files Structure
- `app.py` - Main Flask application
- `templates/` - HTML templates for dashboard
- `static/` - CSS and JavaScript files
- `app.log` - Application logs
- `requirements.txt` - Python dependencies

## Usage
1. Open http://localhost:9010 in your browser
2. View real-time token usage
3. Monitor API costs
4. Track usage trends over time

## Features
- Real-time token tracking
- Cost calculation
- Usage statistics
- Visual dashboard
- Historical data logging

## Troubleshooting
- If the monitor doesn't start, check port 9010 is not in use
- Verify Python dependencies are installed
- Check logs in `app.log` for errors
