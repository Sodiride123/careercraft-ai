# LinkedIn MCP Integration Setup Guide

## Overview
The CareerCraft AI application now includes a LinkedIn MCP client that fetches LinkedIn profile data via the Model Context Protocol (MCP). This document explains how to set it up.

## Architecture

```
CareerCraft AI Application
    ↓
linkedin_client.py (Python wrapper)
    ↓
MCP REST API (https://model-gateway.myninja.ai/mcp-rest/tools/call)
    ↓
LinkedIn MCP Server
    ↓
LinkedIn API
    ↓
Profile Data
```

## Files Created

### 1. `linkedin_client.py`
A Python wrapper library that provides easy access to LinkedIn MCP tools.

**Key Components:**
- `LinkedInConfig`: Configuration dataclass (auto-loads from .env)
- `_MCPSession`: HTTP client for MCP REST API calls
- `Profile`: LinkedIn profile API methods
- `Company`: LinkedIn company API methods
- `LinkedInClient`: Main facade class

**Usage:**
```python
from linkedin_client import LinkedInClient

# Auto-loads from .env
linkedin = LinkedInClient()

# Get profile
profile = linkedin.profile.get_profile(
    "https://www.linkedin.com/in/username",
    include_skills=True,
    include_certifications=True,
    include_projects=True
)
```

### 2. `.env` Configuration File
Stores API keys and configuration:

```env
# Anthropic API Configuration
ANTHROPIC_API_KEY=your_api_key_here
ANTHROPIC_BASE_URL=https://model-gateway.myninja.ai
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929

# LinkedIn MCP Configuration (optional)
# LINKEDIN_MCP_API_KEY=your_linkedin_api_key_here
# LINKEDIN_MCP_SERVER_ID=auto-discovered
```

### 3. Updated `app.py`
Added two new functions:

**`fetch_linkedin_profile_via_mcp(profile_url: str)`**
- Fetches LinkedIn profile using the MCP client
- Returns structured JSON data
- Handles errors gracefully

**Updated resume generation flow:**
- First tries to fetch via MCP client
- Falls back to Claude Code if MCP fails
- Logs all attempts for debugging

## Setup Instructions

### Step 1: Enable LinkedIn MCP Server in SuperNinja

1. Go to your SuperNinja dashboard
2. Navigate to MCP Providers / Data Providers
3. Find and enable the **LinkedIn** provider
4. Note the server ID and alias (usually auto-discovered)

### Step 2: Configure API Key

The LinkedIn client uses the same API key as your Claude API access.

**Option A: Use existing ANTHROPIC_API_KEY (Recommended)**
```env
ANTHROPIC_API_KEY=sk-your-actual-key-here
ANTHROPIC_BASE_URL=https://model-gateway.myninja.ai
```

**Option B: Use separate LinkedIn key**
```env
ANTHROPIC_API_KEY=sk-your-claude-key
LINKEDIN_MCP_API_KEY=sk-your-linkedin-key
```

### Step 3: Update .env File

Edit `careercraft-ai/.env`:
```bash
cd careercraft-ai
nano .env
```

Replace `your_api_key_here` with your actual API key.

### Step 4: Restart the Application

```bash
# Stop the current Flask app
pkill -f "python app.py"

# Start it again
cd careercraft-ai
python app.py
```

## How It Works

### Configuration Loading
1. Application starts
2. `linkedin_client.py` loads `.env` file
3. `LinkedInConfig` reads `ANTHROPIC_API_KEY` and `ANTHROPIC_BASE_URL`
4. Auto-discovers LinkedIn MCP server by calling `/v1/mcp/server`
5. Extracts `server_id` and `tool_prefix` (e.g., "linkedin-")

### Profile Fetching Flow
1. User submits LinkedIn URL
2. `app.py` calls `fetch_linkedin_profile_via_mcp(url)`
3. `LinkedInClient` makes HTTP POST to MCP REST endpoint:
   ```
   POST https://model-gateway.myninja.ai/mcp-rest/tools/call
   Headers: {"Authorization": "Bearer sk-..."}
   Body: {
       "name": "linkedin-Get_Profile_Details",
       "arguments": {
           "profile_url": "https://www.linkedin.com/in/username",
           "include_skills": true,
           "include_certifications": true,
           "include_projects": true
       },
       "server_id": "linkedin-server-id"
   }
   ```
4. MCP gateway validates auth and routes to LinkedIn server
5. LinkedIn server fetches profile data
6. Data flows back through the chain
7. Application receives structured JSON:
   ```json
   {
       "full_name": "John Doe",
       "headline": "Software Engineer at Company",
       "summary": "...",
       "location": "San Francisco, CA",
       "experiences": [...],
       "education": [...],
       "skills": [...],
       "certifications": [...]
   }
   ```

### Fallback Mechanism
If MCP fetch fails (server not enabled, network error, etc.):
1. Application logs the error
2. Falls back to Claude Code method
3. Uses the original prompt-based approach
4. Continues with resume generation

## Testing

### Test 1: Check Configuration
```python
from linkedin_client import LinkedInConfig

config = LinkedInConfig()
print(f"Base URL: {config.base_url}")
print(f"API Key: {config.api_key[:20]}...")
print(f"Server ID: {config.server_id}")
print(f"Tool Prefix: {config.tool_prefix}")
```

### Test 2: Fetch Profile
```python
from linkedin_client import get_linkedin_profile

profile = get_linkedin_profile("https://www.linkedin.com/in/username")
print(profile)
```

### Test 3: Full Application Test
1. Access the application
2. Enter a LinkedIn profile URL
3. Provide job description
4. Click "Generate Resume"
5. Check logs for "LinkedIn profile fetched successfully via MCP"

## Troubleshooting

### Error: "No MCP tools available"
**Cause:** LinkedIn MCP server not enabled
**Solution:** Enable LinkedIn provider in SuperNinja dashboard

### Error: "Could not find LinkedIn MCP server"
**Cause:** Server not discovered or wrong configuration
**Solution:** 
- Check that LinkedIn provider is enabled
- Verify `ANTHROPIC_BASE_URL` is correct
- Check API key has access to MCP servers

### Error: "API key required"
**Cause:** Missing or invalid API key in .env
**Solution:** 
- Ensure `.env` file exists
- Check `ANTHROPIC_API_KEY` is set
- Verify key is valid

### Error: "Failed to fetch LinkedIn profile via MCP"
**Cause:** Network error, invalid URL, or rate limiting
**Solution:**
- Check internet connectivity
- Verify LinkedIn URL is valid
- Check application logs for details
- Application will automatically fall back to Claude Code

## Benefits of MCP Integration

✅ **Faster**: Direct API calls instead of AI prompts
✅ **More Reliable**: Structured data instead of parsing AI responses
✅ **Better Error Handling**: Clear error messages
✅ **Fallback Support**: Automatically uses Claude Code if MCP fails
✅ **Consistent Data**: Always returns same JSON structure
✅ **Real-time**: Gets latest LinkedIn data

## API Reference

### LinkedInClient

```python
class LinkedInClient:
    def __init__(self, config: Optional[LinkedInConfig] = None)
    
    # Profile API
    profile.get_profile(
        profile_url: str,
        include_skills: bool = True,
        include_certifications: bool = True,
        include_projects: bool = True,
        include_recommendations: bool = False
    ) -> dict
    
    profile.search_profiles(
        query: str,
        limit: int = 10
    ) -> list
    
    # Company API
    company.get_company(
        company_url: str
    ) -> dict
```

### Convenience Function

```python
from linkedin_client import get_linkedin_profile

profile = get_linkedin_profile(
    "https://www.linkedin.com/in/username",
    include_skills=True,
    include_certifications=True,
    include_projects=True
)
```

## Next Steps

1. ✅ Enable LinkedIn MCP server in SuperNinja
2. ✅ Update `.env` with your API key
3. ✅ Restart the application
4. ✅ Test with a real LinkedIn profile
5. ✅ Monitor logs for successful MCP calls

## Support

If you encounter issues:
1. Check application logs: `tail -f careercraft-ai/logs/app.log`
2. Verify MCP server status in SuperNinja dashboard
3. Test API key with a simple curl command
4. Check that `.env` file is properly formatted

## Summary

The LinkedIn MCP integration provides a robust, production-ready way to fetch LinkedIn profile data. It follows the same pattern as the Booking.com MCP client, with automatic configuration, error handling, and fallback support.

**Key Features:**
- 🔧 Auto-configuration from .env
- 🔍 Auto-discovery of MCP servers
- 🛡️ Fallback to Claude Code if MCP fails
- 📝 Comprehensive logging
- ✅ Production-ready error handling