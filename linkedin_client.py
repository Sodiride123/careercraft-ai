"""
LinkedIn MCP Client
A Python wrapper for accessing LinkedIn data via MCP (Model Context Protocol) REST API.
"""

import os
import requests
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional
from dotenv import load_dotenv

# Load .env from the same directory as this file (override=True to take precedence over system env)
_env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(_env_path, override=True)


@dataclass
class LinkedInConfig:
    """Configuration for LinkedIn MCP client"""
    base_url: str = ""           # MCP gateway URL
    api_key: str = ""            # Authentication key
    server_id: str = ""          # MCP server identifier
    tool_prefix: str = ""        # Tool name prefix (e.g., "linkedin-")
    
    def __post_init__(self):
        """Auto-load configuration from environment variables"""
        # 1. Load base_url
        if not self.base_url:
            self.base_url = os.environ.get("ANTHROPIC_BASE_URL", "").rstrip("/")
            if not self.base_url:
                raise ValueError("Base URL required via ANTHROPIC_BASE_URL")
        
        # 2. Load api_key (try LINKEDIN_MCP_API_KEY first, fall back to ANTHROPIC_API_KEY)
        if not self.api_key:
            self.api_key = os.environ.get("LINKEDIN_MCP_API_KEY", "") or \
                          os.environ.get("ANTHROPIC_API_KEY", "")
            if not self.api_key:
                raise ValueError("API key required via LINKEDIN_MCP_API_KEY or ANTHROPIC_API_KEY")
        
        # 3. Auto-discover server_id if not provided
        if not self.server_id:
            self.server_id = os.environ.get("LINKEDIN_MCP_SERVER_ID", "")
            if not self.server_id:
                self._discover_server_id()
    
    def _discover_server_id(self):
        """Auto-discover server_id and tool_prefix from the gateway"""
        try:
            # Call the gateway to list all MCP servers
            r = requests.get(
                f"{self.base_url}/v1/mcp/server",
                headers={"Authorization": f"Bearer {self.api_key}"},
                timeout=10
            )
            
            if r.status_code == 200:
                servers = r.json()
                # Find the LinkedIn server
                for s in servers:
                    server_name = s.get("server_name", "").lower()
                    if "linkedin" in server_name:
                        self.server_id = s["server_id"]
                        self.tool_prefix = s.get("alias", "") + "-"
                        return
            
            raise ValueError("Could not find LinkedIn MCP server. Please ensure it's enabled.")
        except requests.exceptions.RequestException as e:
            raise ValueError(f"Failed to discover LinkedIn server: {e}")


class _MCPSession:
    """Internal HTTP client for MCP REST API calls"""
    
    def __init__(self, cfg: LinkedInConfig):
        self.cfg = cfg
        self._headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {cfg.api_key}",
        }
    
    def call_tool(self, name: str, arguments: Dict[str, Any]) -> Any:
        """Call an MCP tool via REST API"""
        # Prefix tool name with server alias
        prefixed_name = f"{self.cfg.tool_prefix}{name}"
        
        try:
            # Make HTTP POST to MCP REST endpoint
            r = requests.post(
                f"{self.cfg.base_url}/mcp-rest/tools/call",
                headers=self._headers,
                json={
                    "name": prefixed_name,
                    "arguments": arguments,
                    "server_id": self.cfg.server_id
                },
                timeout=60
            )
            
            r.raise_for_status()
            
            # Parse response
            result = r.json()
            
            # Extract content from MCP response
            if isinstance(result, dict):
                # Handle different response formats
                if "content" in result:
                    content = result["content"]
                    if isinstance(content, list) and len(content) > 0:
                        if isinstance(content[0], dict) and "text" in content[0]:
                            return content[0]["text"]
                    return content
                elif "result" in result:
                    return result["result"]
                elif "data" in result:
                    return result["data"]
            
            return result
            
        except requests.exceptions.RequestException as e:
            raise Exception(f"MCP API call failed: {e}")


class _Base:
    """Base class for API modules"""
    
    def __init__(self, mcp: _MCPSession, cfg: LinkedInConfig):
        self._mcp = mcp
        self.cfg = cfg
    
    def _call(self, tool_name: str, arguments: Dict[str, Any]) -> Any:
        """Call an MCP tool"""
        return self._mcp.call_tool(tool_name, arguments)


class Profile(_Base):
    """LinkedIn Profile API"""
    
    def get_profile(
        self,
        profile_url: str,
        include_skills: bool = True,
        include_certifications: bool = True,
        include_projects: bool = True,
        include_company_public_url: bool = True,
        include_profile_status: bool = False,
        include_courses: bool = False,
        include_volunteers: bool = False,
        include_honors: bool = False,
        include_patents: bool = False,
        include_publications: bool = False,
        include_organizations: bool = False
    ) -> Any:
        """
        Get detailed LinkedIn profile information
        
        Args:
            profile_url: LinkedIn profile URL (e.g., "https://www.linkedin.com/in/username")
            include_skills: Include skills section (0.5 credits)
            include_certifications: Include certifications (0.5 credits)
            include_projects: Include projects (0.5 credits)
            include_company_public_url: Include company URLs (0.5 credits)
            include_profile_status: Include profile status (0.5 credits)
            include_courses: Include courses (0.5 credits)
            include_volunteers: Include volunteer experience (0.5 credits)
            include_honors: Include honors and awards (0.5 credits)
            include_patents: Include patents (0.5 credits)
            include_publications: Include publications (0.5 credits)
            include_organizations: Include organizations (0.5 credits)
        
        Returns:
            Profile data as JSON
        """
        # Convert boolean to string as required by the API
        return self._call("Get_Profile_Details", {
            "linkedin_url": profile_url,
            "include_skills": "true" if include_skills else "false",
            "include_certifications": "true" if include_certifications else "false",
            "include_projects": "true" if include_projects else "false",
            "include_company_public_url": "true" if include_company_public_url else "false",
            "include_profile_status": "true" if include_profile_status else "false",
            "include_courses": "true" if include_courses else "false",
            "include_volunteers": "true" if include_volunteers else "false",
            "include_honors": "true" if include_honors else "false",
            "include_patents": "true" if include_patents else "false",
            "include_publications": "true" if include_publications else "false",
            "include_organizations": "true" if include_organizations else "false"
        })
    
    def search_profiles(self, query: str, limit: int = 10) -> Any:
        """
        Search for LinkedIn profiles
        
        Args:
            query: Search query
            limit: Maximum number of results
        
        Returns:
            List of profile search results
        """
        return self._call("Search_Profiles", {
            "query": query,
            "limit": limit
        })


class Company(_Base):
    """LinkedIn Company API"""
    
    def get_company(self, company_url: str) -> Any:
        """
        Get company information
        
        Args:
            company_url: LinkedIn company URL
        
        Returns:
            Company data as JSON
        """
        return self._call("Get_Company_Details", {
            "company_url": company_url
        })


class LinkedInClient:
    """
    Unified interface to LinkedIn MCP tools
    
    Usage:
        # Auto-load from .env
        linkedin = LinkedInClient()
        
        # Get profile
        profile = linkedin.profile.get_profile(
            "https://www.linkedin.com/in/username",
            include_skills=True
        )
        
        # Custom config
        config = LinkedInConfig(api_key="custom-key")
        linkedin = LinkedInClient(config)
    """
    
    def __init__(self, config: Optional[LinkedInConfig] = None):
        """
        Initialize LinkedIn client
        
        Args:
            config: Optional configuration. If not provided, auto-loads from .env
        """
        self.config = config or LinkedInConfig()
        self._mcp = _MCPSession(self.config)
        
        # Initialize API modules
        self.profile = Profile(self._mcp, self.config)
        self.company = Company(self._mcp, self.config)


# Convenience function for quick access
def get_linkedin_profile(
    profile_url: str,
    include_skills: bool = True,
    include_certifications: bool = True,
    include_projects: bool = True
) -> Any:
    """
    Quick function to get LinkedIn profile
    
    Args:
        profile_url: LinkedIn profile URL
        include_skills: Include skills section
        include_certifications: Include certifications
        include_projects: Include projects
    
    Returns:
        Profile data as JSON
    """
    client = LinkedInClient()
    return client.profile.get_profile(
        profile_url,
        include_skills=include_skills,
        include_certifications=include_certifications,
        include_projects=include_projects
    )