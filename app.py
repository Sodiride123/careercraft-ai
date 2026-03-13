#!/usr/bin/env python3
"""
LinkedIn Profile to Job-Tailored PDF Resume & Cover Letter Generator
Main Flask Application - Using Claude Code (Ninja AI)
"""

import os
import json
import uuid
import subprocess
import threading
import time
import logging
import re
from pathlib import Path
from datetime import datetime, timezone
from dotenv import load_dotenv
from flask import Flask, request, jsonify, render_template, send_file
from flask_cors import CORS
from weasyprint import HTML, CSS

# Load .env file from the same directory as this script
_env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(_env_path, override=True)

# Configure logging
os.makedirs('logs', exist_ok=True)
os.makedirs('output', exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/app.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024  # 10MB upload limit
CORS(app)

# Store job status
jobs = {}

class ResumeGeneratorJob:
    """Class to manage resume generation jobs"""
    
    def __init__(self, job_id, linkedin_url, job_ad_url):
        self.job_id = job_id
        self.linkedin_url = linkedin_url
        self.job_ad_url = job_ad_url
        self.profile_text = None  # Alternative to linkedin_url
        self.status = "pending"
        self.progress = 0
        self.current_step = "Initializing..."
        self.logs = []
        self.result = None
        self.error = None
        self.pdf_path = None
        self.cover_letter_path = None
        self.created_at = datetime.now(timezone.utc).isoformat()
        self.candidate_name = None
        self.job_title = None
        self.company_name = None
        
    def add_log(self, message, level="info"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        log_entry = {"timestamp": timestamp, "level": level, "message": message}
        self.logs.append(log_entry)
        logger.info(f"[{self.job_id}] {message}")
        
    def to_dict(self):
        return {
            "job_id": self.job_id,
            "linkedin_url": self.linkedin_url,
            "job_ad_url": self.job_ad_url,
            "status": self.status,
            "progress": self.progress,
            "current_step": self.current_step,
            "logs": self.logs,
            "result": self.result,
            "error": self.error,
            "pdf_path": self.pdf_path,
            "cover_letter_path": self.cover_letter_path,
            "created_at": self.created_at,
            "candidate_name": self.candidate_name,
            "job_title": self.job_title,
            "company_name": self.company_name
        }

    @classmethod
    def from_dict(cls, data):
        """Reconstruct a ResumeGeneratorJob from a dict (e.g., loaded from JSON)."""
        job = cls(
            job_id=data["job_id"],
            linkedin_url=data.get("linkedin_url"),
            job_ad_url=data.get("job_ad_url"),
        )
        job.status = data.get("status", "completed")
        job.progress = data.get("progress", 100)
        job.current_step = data.get("current_step", "")
        job.logs = data.get("logs", [])
        job.result = data.get("result")
        job.error = data.get("error")
        job.pdf_path = data.get("pdf_path")
        job.cover_letter_path = data.get("cover_letter_path")
        job.created_at = data.get("created_at", datetime.now(timezone.utc).isoformat())
        job.candidate_name = data.get("candidate_name")
        job.job_title = data.get("job_title")
        job.company_name = data.get("company_name")
        # Jobs that were in-progress when server stopped are effectively failed
        if job.status in ("running", "pending"):
            job.status = "failed"
            job.error = job.error or "Server restarted while job was in progress"
        return job


JOBS_INDEX_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output", "jobs_index.json")


def save_jobs_index():
    """Persist the in-memory jobs dict to disk as JSON."""
    try:
        data = {job_id: job.to_dict() for job_id, job in jobs.items()}
        tmp_path = JOBS_INDEX_PATH + ".tmp"
        with open(tmp_path, 'w') as f:
            json.dump(data, f, indent=2)
        os.replace(tmp_path, JOBS_INDEX_PATH)
        logger.debug(f"Saved jobs index ({len(data)} jobs)")
    except Exception as e:
        logger.error(f"Failed to save jobs index: {e}")


def load_jobs_index():
    """Load jobs dict from disk on startup. Populates the global `jobs` dict."""
    global jobs
    if not os.path.exists(JOBS_INDEX_PATH):
        logger.info("No jobs index file found, starting fresh")
        return
    try:
        with open(JOBS_INDEX_PATH, 'r') as f:
            data = json.load(f)
        for job_id, job_data in data.items():
            jobs[job_id] = ResumeGeneratorJob.from_dict(job_data)
        logger.info(f"Loaded {len(jobs)} jobs from index")
    except Exception as e:
        logger.error(f"Failed to load jobs index: {e}")


# Restore jobs from previous sessions
load_jobs_index()


def run_claude_command(prompt: str, timeout: int = 180, use_tools: bool = True) -> str:
    """Run a Claude Code command and return the output using wrapper script.

    Args:
        prompt: The prompt to send to Claude.
        timeout: Command timeout in seconds.
        use_tools: If False, disables all tools so Claude outputs text directly
                   to stdout instead of writing files to disk.
    """
    try:
        import shutil

        # Find claude CLI - check common locations
        wrapper_path = shutil.which('claude')
        if not wrapper_path:
            # Fallback paths for sandbox and common installations
            for path in ['/usr/local/bin/claude', os.path.expanduser('~/.local/bin/claude')]:
                if os.path.exists(path):
                    wrapper_path = path
                    break

        if not wrapper_path:
            raise RuntimeError("Claude CLI not found. Please install it or add it to PATH.")

        # Set environment explicitly
        env = os.environ.copy()
        env['HOME'] = os.environ.get('HOME', '/root')
        env['USER'] = os.environ.get('USER', 'root')
        env['PATH'] = '/usr/local/bin:' + os.path.expanduser('~/.local/bin:') + env.get('PATH', '')

        # Use project directory as working directory
        project_dir = os.path.dirname(os.path.abspath(__file__))
        work_dir = os.environ.get('WORKSPACE', project_dir)

        logger.info(f"Running Claude command with timeout={timeout}s (claude: {wrapper_path})")

        # Build command - disable tools when we only need text output
        cmd = [wrapper_path, '-p', prompt]
        if not use_tools:
            cmd.extend(['--tools', ''])

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=work_dir,
            env=env
        )
        
        if result.returncode != 0:
            logger.error(f"Claude command failed with return code {result.returncode}")
            logger.error(f"STDERR: {result.stderr}")
        
        if result.stderr:
            logger.warning(f"Claude STDERR: {result.stderr[:500]}")
            
        return result.stdout.strip()
    except subprocess.TimeoutExpired:
        logger.error(f"Claude command timed out after {timeout}s")
        return "Error: Command timed out"
    except Exception as e:
        logger.error(f"Claude command error: {str(e)}")
        return f"Error: {str(e)}"


def fetch_linkedin_profile_via_mcp(profile_url: str) -> dict:
    """Fetch LinkedIn profile using MCP client"""
    try:
        from linkedin_client import LinkedInClient
        
        logger.info(f"Fetching LinkedIn profile via MCP: {profile_url}")
        
        # Initialize LinkedIn client (auto-loads from .env)
        linkedin = LinkedInClient()
        
        # Get profile with all details
        profile_data = linkedin.profile.get_profile(
            profile_url=profile_url,
            include_skills=True,
            include_certifications=True,
            include_projects=True,
            include_company_public_url=True,
            include_profile_status=False
        )
        
        # Parse the response if it's a string
        if isinstance(profile_data, str):
            profile_data = json.loads(profile_data)
        
        logger.info("LinkedIn profile fetched successfully via MCP")
        return profile_data
        
    except Exception as e:
        logger.error(f"Failed to fetch LinkedIn profile via MCP: {str(e)}")
        raise


def normalize_linkedin_job_url(url: str) -> str:
    """Normalize LinkedIn job URLs to the format expected by the MCP API.

    The MCP Get_Job_Details tool requires URLs like:
      https://www.linkedin.com/jobs/view/1234567890

    But users may paste URLs like:
      https://www.linkedin.com/jobs/collections/recommended/?currentJobId=1234567890
      https://www.linkedin.com/jobs/search/?currentJobId=1234567890&...
      https://www.linkedin.com/jobs/view/1234567890/?...
    """
    import re

    # Extract job ID from currentJobId parameter
    match = re.search(r'currentJobId=(\d+)', url)
    if match:
        job_id = match.group(1)
        normalized = f"https://www.linkedin.com/jobs/view/{job_id}"
        logger.info(f"Normalized LinkedIn job URL: {url} -> {normalized}")
        return normalized

    # Extract job ID from /jobs/view/DIGITS path
    match = re.search(r'/jobs/view/(\d+)', url)
    if match:
        job_id = match.group(1)
        normalized = f"https://www.linkedin.com/jobs/view/{job_id}"
        return normalized

    # Return as-is if we can't normalize
    return url


def fetch_job_via_mcp(job_url: str) -> dict:
    """Fetch LinkedIn job details using MCP client"""
    try:
        from linkedin_client import LinkedInClient

        # Normalize the URL to the format MCP expects
        job_url = normalize_linkedin_job_url(job_url)
        logger.info(f"Fetching LinkedIn job via MCP: {job_url}")

        linkedin = LinkedInClient()
        job_data = linkedin.job.get_job_details(
            job_url=job_url,
            include_skills=True
        )

        if isinstance(job_data, str):
            job_data = json.loads(job_data)

        logger.info(f"LinkedIn job fetched successfully via MCP")
        logger.debug(f"MCP job response keys: {list(job_data.keys()) if isinstance(job_data, dict) else type(job_data)}")

        # Check if MCP returned an error
        if isinstance(job_data, dict) and job_data.get('data') is None and 'message' in job_data:
            error_msg = job_data.get('message', 'Unknown MCP error')
            logger.error(f"MCP returned error: {error_msg}")
            raise Exception(f"LinkedIn MCP error: {error_msg}")

        return job_data

    except Exception as e:
        logger.error(f"Failed to fetch LinkedIn job via MCP: {str(e)}")
        raise


def detect_job_input_type(job_input: str) -> str:
    """Detect the type of job input provided by the user.
    Returns: 'linkedin_url', 'external_url', 'text', or 'title'
    """
    job_input = job_input.strip()

    # Check for LinkedIn job URL
    if 'linkedin.com/jobs' in job_input.lower() or 'linkedin.com/job' in job_input.lower():
        return 'linkedin_url'

    # Check for any URL
    if job_input.startswith('http://') or job_input.startswith('https://'):
        return 'external_url'

    # Check for text description (longer text with multiple sentences/lines)
    if len(job_input) > 100 or '\n' in job_input:
        return 'text'

    # Short input - treat as job title
    return 'title'


def generate_resume_with_claude(job: ResumeGeneratorJob):
    """Generate resume and cover letter using Claude Code with MCP tools"""
    try:
        job.status = "running"
        job.progress = 5
        job.current_step = "Starting Ninja AI Agent..."
        job.add_log("Initializing Ninja AI Agent for resume generation")

        output_dir = os.path.join(os.path.dirname(__file__), "output")

        # ── EDIT MODE: reuse saved data, only regenerate targeted doc(s) ──
        previous_job_id = getattr(job, 'previous_job_id', None)
        edit_instructions = getattr(job, 'edit_instructions', None)
        edit_target = getattr(job, 'edit_target', 'both')

        if previous_job_id and edit_instructions:
            profile_path = os.path.join(output_dir, f"{previous_job_id}_profile.json")
            job_data_path = os.path.join(output_dir, f"{previous_job_id}_job.json")

            if os.path.exists(profile_path) and os.path.exists(job_data_path):
                job.add_log(f"Edit mode: reusing data from job {previous_job_id}")
                job.current_step = "Loading previous data..."
                job.progress = 10

                with open(profile_path, 'r') as f:
                    profile_result = f.read()
                with open(job_data_path, 'r') as f:
                    job_result = f.read()

                # Save copies for the new job
                with open(os.path.join(output_dir, f"{job.job_id}_profile.json"), 'w') as f:
                    f.write(profile_result)
                with open(os.path.join(output_dir, f"{job.job_id}_job.json"), 'w') as f:
                    f.write(job_result)

                # Carry over metadata from previous job
                prev_job = jobs.get(previous_job_id)
                if prev_job:
                    job.candidate_name = prev_job.candidate_name
                    job.job_title = prev_job.job_title
                    job.company_name = prev_job.company_name

                # ── Regenerate only the targeted document(s) ──
                import shutil

                if edit_target in ('resume', 'both'):
                    job.progress = 40
                    job.current_step = "Updating resume..."
                    job.add_log(f"Regenerating resume with edits: {edit_instructions[:100]}")

                    resume_prompt = f'''You are a professional resume writer. Create a complete, ATS-friendly HTML resume based on the data provided.

LINKEDIN PROFILE DATA:
{profile_result}

JOB DETAILS:
{job_result}

IMPORTANT INSTRUCTIONS:
- Work with the job information provided, even if brief
- If job details are limited, focus on making the candidate's experience relevant to the job title and company
- Tailor the professional summary to align with the job title
- Highlight transferable skills and relevant experience
- DO NOT ask for more information - create the resume with what's provided

Create a complete HTML resume that:
1. Is tailored for the specific job position (use the job title and company name provided)
2. Highlights skills and experience that would be relevant for this role
3. Uses a clean, professional design with inline CSS
4. Is ATS-friendly (simple formatting, standard sections)
5. Includes: Header with name/contact, Professional Summary (tailored to the job), Experience, Education, Skills

USER MODIFICATION REQUEST:
The user has specifically asked for the following changes to the resume. Please incorporate this feedback:
{edit_instructions}

Output ONLY the complete HTML code starting with <!DOCTYPE html> and ending with </html>. No explanations, no questions, no markdown - just the HTML.'''

                    html_result = run_claude_command(resume_prompt, timeout=300, use_tools=False)
                    html_match = re.search(r'<!DOCTYPE html>.*?</html>', html_result, re.DOTALL | re.IGNORECASE)
                    if html_match:
                        html_content = html_match.group(0)
                    else:
                        html_match = re.search(r'<html.*?>.*?</html>', html_result, re.DOTALL | re.IGNORECASE)
                        html_content = ('<!DOCTYPE html>\n' + html_match.group(0)) if html_match else html_result

                    html_path = os.path.join(output_dir, f"{job.job_id}_resume.html")
                    with open(html_path, 'w') as f:
                        f.write(html_content)

                    # Convert to PDF
                    pdf_path = os.path.join(output_dir, f"{job.job_id}_resume.pdf")
                    try:
                        HTML(filename=html_path).write_pdf(pdf_path, stylesheets=[CSS(string='@page { size: A4; margin: 10mm; }')])
                        job.pdf_path = f"output/{job.job_id}_resume.pdf" if os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 0 else f"output/{job.job_id}_resume.html"
                    except Exception:
                        job.pdf_path = f"output/{job.job_id}_resume.html"
                    job.add_log("Resume updated successfully", "success")
                else:
                    # Copy resume from previous job unchanged
                    for ext in ['html', 'pdf']:
                        src = os.path.join(output_dir, f"{previous_job_id}_resume.{ext}")
                        dst = os.path.join(output_dir, f"{job.job_id}_resume.{ext}")
                        if os.path.exists(src):
                            shutil.copy2(src, dst)
                    prev_pdf = os.path.join(output_dir, f"{job.job_id}_resume.pdf")
                    job.pdf_path = f"output/{job.job_id}_resume.pdf" if os.path.exists(prev_pdf) else f"output/{job.job_id}_resume.html"
                    job.add_log("Resume kept unchanged", "success")

                if edit_target in ('cover_letter', 'both'):
                    job.progress = 70
                    job.current_step = "Updating cover letter..."
                    job.add_log(f"Regenerating cover letter with edits: {edit_instructions[:100]}")

                    cover_letter_prompt = f'''You are a professional cover letter writer. Create a complete, professional cover letter in HTML format based on the data provided.

LINKEDIN PROFILE DATA:
{profile_result}

JOB DETAILS:
{job_result}

IMPORTANT INSTRUCTIONS:
- Work with the job information provided, even if brief
- If job details are limited, focus on the job title and company name provided
- Make reasonable assumptions about what the role might entail based on the job title
- DO NOT ask for more information - create the cover letter with what's provided

Create a complete HTML cover letter that:
1. Is professionally formatted with proper business letter structure
2. Is personalized for the specific job and company (use the job title and company name provided)
3. Highlights relevant experience and skills from the profile
4. Shows enthusiasm for the role and company
5. Uses a clean, professional design with inline CSS
6. Includes: Date, Hiring Manager greeting, 3-4 compelling paragraphs, Professional closing
7. Is approximately 300-400 words in the body

The cover letter should:
- Opening paragraph: Express interest in the specific position and company
- Second paragraph: Highlight 2-3 most relevant experiences/achievements from the profile
- Third paragraph: Explain why you're a great fit for this type of role
- Closing paragraph: Express enthusiasm, mention availability for interview, thank them

Use professional HTML styling with inline CSS.

USER MODIFICATION REQUEST:
The user has specifically asked for the following changes to the cover letter. Please incorporate this feedback:
{edit_instructions}

Output ONLY the complete HTML code starting with <!DOCTYPE html> and ending with </html>. No explanations, no questions, no markdown - just the HTML.'''

                    cl_result = run_claude_command(cover_letter_prompt, timeout=300, use_tools=False)
                    cl_match = re.search(r'<!DOCTYPE html>.*?</html>', cl_result, re.DOTALL | re.IGNORECASE)
                    if cl_match:
                        cl_html = cl_match.group(0)
                    else:
                        cl_match = re.search(r'<html.*?>.*?</html>', cl_result, re.DOTALL | re.IGNORECASE)
                        cl_html = ('<!DOCTYPE html>\n' + cl_match.group(0)) if cl_match else cl_result

                    cl_html_path = os.path.join(output_dir, f"{job.job_id}_cover_letter.html")
                    with open(cl_html_path, 'w') as f:
                        f.write(cl_html)

                    cl_pdf_path = os.path.join(output_dir, f"{job.job_id}_cover_letter.pdf")
                    try:
                        HTML(filename=cl_html_path).write_pdf(cl_pdf_path, stylesheets=[CSS(string='@page { size: A4; margin: 15mm 20mm; }')])
                        job.cover_letter_path = f"output/{job.job_id}_cover_letter.pdf" if os.path.exists(cl_pdf_path) and os.path.getsize(cl_pdf_path) > 0 else f"output/{job.job_id}_cover_letter.html"
                    except Exception:
                        job.cover_letter_path = f"output/{job.job_id}_cover_letter.html"
                    job.add_log("Cover letter updated successfully", "success")
                else:
                    # Copy cover letter from previous job unchanged
                    for ext in ['html', 'pdf']:
                        src = os.path.join(output_dir, f"{previous_job_id}_cover_letter.{ext}")
                        dst = os.path.join(output_dir, f"{job.job_id}_cover_letter.{ext}")
                        if os.path.exists(src):
                            shutil.copy2(src, dst)
                    prev_cl_pdf = os.path.join(output_dir, f"{job.job_id}_cover_letter.pdf")
                    job.cover_letter_path = f"output/{job.job_id}_cover_letter.pdf" if os.path.exists(prev_cl_pdf) else f"output/{job.job_id}_cover_letter.html"
                    job.add_log("Cover letter kept unchanged", "success")

                # Done — edit mode complete
                job.status = "completed"
                job.progress = 100
                job.current_step = "Documents updated successfully!"
                job.result = f"{'Resume' if edit_target == 'resume' else 'Cover letter' if edit_target == 'cover_letter' else 'Resume and cover letter'} updated successfully"
                job.add_log("Edit completed!", "success")
                save_jobs_index()
                return  # skip the full pipeline below

            else:
                job.add_log(f"Previous job files not found for {previous_job_id}, running full pipeline", "warning")
                # Fall through to full pipeline

        # ── FULL PIPELINE: fetch everything from scratch ──

        # Step 1: Get Profile Data (LinkedIn MCP or provided text)
        job.progress = 10
        profile_text = getattr(job, 'profile_text', None)

        if profile_text:
            # Profile provided as text (file upload or typed) — structure it with Claude
            job.current_step = "Processing your profile..."
            job.add_log("Structuring provided profile text with AI")

            structure_prompt = f'''Analyze the following professional profile/resume text and extract the person's information.

PROFILE TEXT:
{profile_text}

Return the data as a valid JSON object with this structure:
{{
    "full_name": "...",
    "headline": "...",
    "summary": "...",
    "location": "...",
    "experiences": [{{"title": "...", "company": "...", "duration": "...", "description": "..."}}],
    "education": [{{"school": "...", "degree": "...", "field": "...", "dates": "..."}}],
    "skills": ["skill1", "skill2"],
    "certifications": [{{"name": "...", "authority": "..."}}]
}}

Extract as much detail as possible from the text. Only output the JSON, nothing else.'''

            profile_result = run_claude_command(structure_prompt, timeout=300, use_tools=False)
            job.add_log("Profile text structured successfully", "success")
        else:
            # LinkedIn URL — use MCP
            job.current_step = "Fetching LinkedIn profile..."
            job.add_log(f"Fetching profile: {job.linkedin_url}")

            try:
                profile_data = fetch_linkedin_profile_via_mcp(job.linkedin_url)
                profile_result = json.dumps(profile_data, indent=2)
                job.add_log("LinkedIn profile fetched successfully via MCP", "success")
            except Exception as mcp_error:
                logger.warning(f"MCP fetch failed, falling back to Claude Code: {str(mcp_error)}")
                job.add_log(f"MCP fetch failed, using fallback method", "warning")

                profile_prompt = f'''Visit this LinkedIn profile URL and extract the person's professional information: {job.linkedin_url}

Return the data as a valid JSON object with this structure:
{{
    "full_name": "...",
    "headline": "...",
    "summary": "...",
    "location": "...",
    "experiences": [{{"title": "...", "company": "...", "duration": "...", "description": "..."}}],
    "education": [{{"school": "...", "degree": "...", "field": "...", "dates": "..."}}],
    "skills": ["skill1", "skill2"],
    "certifications": [{{"name": "...", "authority": "..."}}]
}}

Extract as much detail as possible. Only output the JSON, nothing else.'''

                profile_result = run_claude_command(profile_prompt, timeout=300)
                job.add_log("LinkedIn profile fetched via fallback", "success")
        
        # Save profile data
        profile_path = os.path.join(output_dir, f"{job.job_id}_profile.json")
        with open(profile_path, 'w') as f:
            f.write(profile_result)
        
        # Extract candidate name from profile
        try:
            # Remove markdown code blocks if present
            profile_json = profile_result
            if '```json' in profile_json:
                profile_json = profile_json.split('```json')[1].split('```')[0].strip()
            elif '```' in profile_json:
                profile_json = profile_json.split('```')[1].split('```')[0].strip()
            
            profile_data = json.loads(profile_json)
            # Handle MCP response wrapper - data may be nested under "data" key
            profile_inner = profile_data.get('data', profile_data) if isinstance(profile_data, dict) else profile_data
            job.candidate_name = (profile_inner.get('full_name', None)
                                  or profile_inner.get('name', None)
                                  or profile_data.get('full_name', None))
            job.add_log(f"Extracted candidate name: {job.candidate_name}")
        except Exception as e:
            job.add_log(f"Could not extract candidate name: {str(e)}", "warning")
            pass
        
        # Step 2: Fetch Job Details (smart routing by input type)
        job.progress = 25
        job.current_step = "Processing job details..."

        # Determine job input - use job_input field first, fall back to legacy fields
        job_input = getattr(job, 'job_input', None)
        if not job_input:
            job_input = job.job_ad_url or getattr(job, 'job_ad_text', '') or ''

        input_type = detect_job_input_type(job_input)
        job.add_log(f"Job input type detected: {input_type}")

        if input_type == 'linkedin_url':
            # Fetch from LinkedIn using MCP tool directly
            job.add_log(f"Fetching job from LinkedIn MCP: {job_input}")
            try:
                job_data = fetch_job_via_mcp(job_input)
                job_result = json.dumps(job_data, indent=2)
                job.add_log("LinkedIn job fetched successfully via MCP", "success")
            except Exception as mcp_error:
                logger.warning(f"MCP job fetch failed, falling back to Claude CLI: {str(mcp_error)}")
                job.add_log(f"MCP job fetch failed, using fallback", "warning")
                job_prompt = f'''Analyze this LinkedIn job URL and provide what you can determine about the role: {job_input}

Return the data as a valid JSON object with this structure:
{{
    "job_title": "...",
    "company_name": "...",
    "location": "...",
    "description": "...",
    "skills": [...],
    "requirements": "..."
}}

Only output the JSON, nothing else.'''
                job_result = run_claude_command(job_prompt, timeout=300, use_tools=False)
                job.add_log("Job details analyzed via fallback", "success")

        elif input_type == 'external_url':
            # Non-LinkedIn URL - fetch page content first, then analyze with Claude
            job.add_log(f"Analyzing external job URL: {job_input}")
            try:
                import requests as http_requests
                logger.info(f"Fetching external URL content: {job_input}")
                resp = http_requests.get(job_input, timeout=30, headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                })
                resp.raise_for_status()
                page_content = resp.text

                # Check if we got meaningful content (not just a Cloudflare/login page)
                content_lower = page_content.lower()
                is_blocked = (
                    len(page_content) < 500
                    or 'cloudflare' in content_lower and 'challenge' in content_lower
                    or 'access denied' in content_lower
                    or 'please enable javascript' in content_lower
                    or 'just a moment' in content_lower and 'cloudflare' in content_lower
                )

                if is_blocked:
                    logger.warning(f"External URL returned blocked/bot-protected page ({len(page_content)} chars)")
                    raise Exception("Website requires JavaScript or login — content not accessible")

                page_content = page_content[:15000]  # Limit to avoid prompt overflow
                logger.info(f"Fetched {len(resp.text)} chars from external URL")
            except Exception as fetch_err:
                logger.warning(f"Failed to fetch external URL: {fetch_err}")
                # Fail the job with a helpful message
                job.status = "failed"
                job.error = (
                    f"Could not access the job posting URL. The website may require login or block automated access.\n\n"
                    f"Please try one of these alternatives:\n"
                    f"1. Copy and paste the job description text directly\n"
                    f"2. Use a LinkedIn job URL instead (these work reliably)\n"
                    f"3. Type the job title (e.g., 'Software Engineer at Google')"
                )
                job.add_log(f"Failed to fetch URL: {fetch_err}", "error")
                save_jobs_index()
                return

            job_prompt = f'''Analyze the following web page content from a job posting URL ({job_input}) and extract the key job information.

WEB PAGE CONTENT:
{page_content}

Return the data as a valid JSON object with this structure:
{{
    "job_title": "...",
    "company_name": "...",
    "location": "...",
    "description": "...",
    "skills": [...],
    "requirements": "..."
}}

Extract as much detail as possible from the page content. Only output the JSON, nothing else.'''
            job_result = run_claude_command(job_prompt, timeout=300, use_tools=False)
            job.add_log("External job URL analyzed", "success")

        elif input_type == 'text':
            # Text description - use Claude CLI to extract structure
            job.add_log("Analyzing provided job description text")
            job_prompt = f'''Analyze the following job description and extract key information.

JOB DESCRIPTION:
{job_input}

Return the data as a valid JSON object with this structure:
{{
    "job_title": "...",
    "company_name": "...",
    "location": "...",
    "description": "...",
    "skills": [...],
    "requirements": "..."
}}

Extract the job title, company name, location, required skills, and key requirements from the description.
Only output the JSON, nothing else.'''
            job_result = run_claude_command(job_prompt, timeout=300, use_tools=False)
            job.add_log("Job description analyzed successfully", "success")

        else:
            # Job title only - create minimal job details
            job.add_log(f"Processing job title: {job_input}")
            job_prompt = f'''The user wants to apply for this role: "{job_input}"

Based on this job title, create a reasonable job description. Return the data as a valid JSON object with this structure:
{{
    "job_title": "...",
    "company_name": "...",
    "location": "...",
    "description": "...",
    "skills": [...],
    "requirements": "..."
}}

For company_name, use what's provided or "Not specified". For other fields, make reasonable inferences based on the job title. Include common skills and requirements for this type of role.
Only output the JSON, nothing else.'''
            job_result = run_claude_command(job_prompt, timeout=300, use_tools=False)
            job.add_log("Job title analyzed successfully", "success")
        
        # Log the raw job result for debugging
        logger.info(f"[{job.job_id}] Raw job_result (first 500 chars): {job_result[:500]}")

        # Save job data
        job_path = os.path.join(output_dir, f"{job.job_id}_job.json")
        with open(job_path, 'w') as f:
            f.write(job_result)

        # Extract job title and company from job data
        try:
            # Remove markdown code blocks if present
            job_json = job_result
            if '```json' in job_json:
                job_json = job_json.split('```json')[1].split('```')[0].strip()
            elif '```' in job_json:
                job_json = job_json.split('```')[1].split('```')[0].strip()

            job_data = json.loads(job_json)
            # Handle MCP response wrapper - data may be nested under "data" key
            job_inner = job_data.get('data', job_data) if isinstance(job_data, dict) else job_data
            job.job_title = (job_inner.get('job_title', None)
                            or job_inner.get('title', None)
                            or job_data.get('job_title', None))
            job.company_name = (job_inner.get('company_name', None)
                               or job_inner.get('company', None)
                               or job_data.get('company_name', None))
            job.add_log(f"Extracted job details: {job.job_title} at {job.company_name}")
        except Exception as e:
            job.add_log(f"Could not extract job details: {str(e)}", "warning")
            logger.warning(f"[{job.job_id}] Failed to parse job JSON. Raw result: {job_result[:300]}")
            pass
        
        # Step 3: Generate Tailored Resume HTML
        job.progress = 40
        job.current_step = "Generating tailored resume..."
        job.add_log("Analyzing profile and job requirements...")
        
        resume_prompt = f'''You are a professional resume writer. Create a complete, ATS-friendly HTML resume based on the data provided.

LINKEDIN PROFILE DATA:
{profile_result}

JOB DETAILS:
{job_result}

IMPORTANT INSTRUCTIONS:
- Work with the job information provided, even if brief
- If job details are limited, focus on making the candidate's experience relevant to the job title and company
- Tailor the professional summary to align with the job title
- Highlight transferable skills and relevant experience
- DO NOT ask for more information - create the resume with what's provided

Create a complete HTML resume that:
1. Is tailored for the specific job position (use the job title and company name provided)
2. Highlights skills and experience that would be relevant for this role
3. Uses a clean, professional design with inline CSS
4. Is ATS-friendly (simple formatting, standard sections)
5. Includes: Header with name/contact, Professional Summary (tailored to the job), Experience, Education, Skills

Output ONLY the complete HTML code starting with <!DOCTYPE html> and ending with </html>. No explanations, no questions, no markdown - just the HTML.'''

        # Append edit instructions if user requested modifications to the resume
        edit_instructions = getattr(job, 'edit_instructions', None)
        edit_target = getattr(job, 'edit_target', 'both')
        if edit_instructions and edit_target in ('resume', 'both'):
            resume_prompt += f'''

USER MODIFICATION REQUEST:
The user has specifically asked for the following changes to the resume. Please incorporate this feedback:
{edit_instructions}'''
            job.add_log(f"Applying edit instructions to resume: {edit_instructions[:100]}")

        html_result = run_claude_command(resume_prompt, timeout=300, use_tools=False)
        job.add_log("Resume HTML generated", "success")
        
        # Extract HTML from response (in case there's extra text)
        html_match = re.search(r'<!DOCTYPE html>.*?</html>', html_result, re.DOTALL | re.IGNORECASE)
        if html_match:
            html_content = html_match.group(0)
        else:
            # Try to find just <html>...</html>
            html_match = re.search(r'<html.*?>.*?</html>', html_result, re.DOTALL | re.IGNORECASE)
            if html_match:
                html_content = '<!DOCTYPE html>\n' + html_match.group(0)
            else:
                html_content = html_result
        
        # Save HTML
        html_path = os.path.join(output_dir, f"{job.job_id}_resume.html")
        with open(html_path, 'w') as f:
            f.write(html_content)
        job.add_log(f"Resume HTML saved")
        
        # Step 4: Generate Cover Letter HTML
        job.progress = 60
        job.current_step = "Generating cover letter..."
        job.add_log("Creating personalized cover letter...")
        
        cover_letter_prompt = f'''You are a professional cover letter writer. Create a complete, professional cover letter in HTML format based on the data provided.

LINKEDIN PROFILE DATA:
{profile_result}

JOB DETAILS:
{job_result}

IMPORTANT INSTRUCTIONS:
- Work with the job information provided, even if brief
- If job details are limited, focus on the job title and company name provided
- Make reasonable assumptions about what the role might entail based on the job title
- DO NOT ask for more information - create the cover letter with what's provided

Create a complete HTML cover letter that:
1. Is professionally formatted with proper business letter structure
2. Is personalized for the specific job and company (use the job title and company name provided)
3. Highlights relevant experience and skills from the profile
4. Shows enthusiasm for the role and company
5. Uses a clean, professional design with inline CSS
6. Includes: Date, Hiring Manager greeting, 3-4 compelling paragraphs, Professional closing
7. Is approximately 300-400 words in the body

The cover letter should:
- Opening paragraph: Express interest in the specific position and company
- Second paragraph: Highlight 2-3 most relevant experiences/achievements from the profile
- Third paragraph: Explain why you're a great fit for this type of role
- Closing paragraph: Express enthusiasm, mention availability for interview, thank them

Use professional HTML styling with inline CSS.

Output ONLY the complete HTML code starting with <!DOCTYPE html> and ending with </html>. No explanations, no questions, no markdown - just the HTML.'''

        # Append edit instructions if user requested modifications to the cover letter
        if edit_instructions and edit_target in ('cover_letter', 'both'):
            cover_letter_prompt += f'''

USER MODIFICATION REQUEST:
The user has specifically asked for the following changes to the cover letter. Please incorporate this feedback:
{edit_instructions}'''
            job.add_log(f"Applying edit instructions to cover letter: {edit_instructions[:100]}")

        cover_letter_result = run_claude_command(cover_letter_prompt, timeout=300, use_tools=False)
        job.add_log("Cover letter generated", "success")
        
        # Extract HTML from response
        cl_html_match = re.search(r'<!DOCTYPE html>.*?</html>', cover_letter_result, re.DOTALL | re.IGNORECASE)
        if cl_html_match:
            cl_html_content = cl_html_match.group(0)
        else:
            cl_html_match = re.search(r'<html.*?>.*?</html>', cover_letter_result, re.DOTALL | re.IGNORECASE)
            if cl_html_match:
                cl_html_content = '<!DOCTYPE html>\n' + cl_html_match.group(0)
            else:
                cl_html_content = cover_letter_result
        
        # Save Cover Letter HTML
        cl_html_path = os.path.join(output_dir, f"{job.job_id}_cover_letter.html")
        with open(cl_html_path, 'w') as f:
            f.write(cl_html_content)
        job.add_log("Cover letter HTML saved")
        
        # Step 5: Convert Resume to PDF
        job.progress = 75
        job.current_step = "Converting resume to PDF..."
        job.add_log("Converting resume HTML to PDF...")
        
        pdf_path = os.path.join(output_dir, f"{job.job_id}_resume.pdf")

        # Use WeasyPrint for conversion
        try:
            html_doc = HTML(filename=html_path)
            html_doc.write_pdf(
                pdf_path,
                stylesheets=[CSS(string='@page { size: A4; margin: 10mm; }')]
            )
            resume_pdf_success = os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 0
        except Exception as e:
            logger.error(f"WeasyPrint error for resume: {e}")
            resume_pdf_success = False
        if resume_pdf_success:
            job.pdf_path = f"output/{job.job_id}_resume.pdf"
            job.add_log("Resume PDF created successfully!", "success")
        else:
            job.pdf_path = f"output/{job.job_id}_resume.html"
            job.add_log("Resume available in HTML format", "warning")
        
        # Step 6: Convert Cover Letter to PDF
        job.progress = 90
        job.current_step = "Converting cover letter to PDF..."
        job.add_log("Converting cover letter HTML to PDF...")
        
        cl_pdf_path = os.path.join(output_dir, f"{job.job_id}_cover_letter.pdf")

        # Use WeasyPrint for conversion
        try:
            cl_html_doc = HTML(filename=cl_html_path)
            cl_html_doc.write_pdf(
                cl_pdf_path,
                stylesheets=[CSS(string='@page { size: A4; margin: 15mm 20mm; }')]
            )
            cover_letter_pdf_success = os.path.exists(cl_pdf_path) and os.path.getsize(cl_pdf_path) > 0
        except Exception as e:
            logger.error(f"WeasyPrint error for cover letter: {e}")
            cover_letter_pdf_success = False
        if cover_letter_pdf_success:
            job.cover_letter_path = f"output/{job.job_id}_cover_letter.pdf"
            job.add_log("Cover letter PDF created successfully!", "success")
        else:
            job.cover_letter_path = f"output/{job.job_id}_cover_letter.html"
            job.add_log("Cover letter available in HTML format", "warning")
        
        # Complete
        job.status = "completed"
        job.progress = 100
        job.current_step = "Resume & Cover Letter generated successfully!"
        job.result = "Resume and Cover Letter PDFs generated successfully"
        job.add_log("All documents created successfully!", "success")
        save_jobs_index()

    except Exception as e:
        job.status = "failed"
        job.error = str(e)
        job.add_log(f"Error: {str(e)}", "error")
        logger.error(f"Job {job.job_id} failed: {str(e)}")
        save_jobs_index()


@app.route('/')
def index():
    """Serve the main page from Vite build"""
    from flask import send_from_directory
    return send_from_directory('client/dist', 'index.html')

@app.route('/assets/<path:filename>')
def serve_assets(filename):
    """Serve static assets from Vite build"""
    from flask import send_from_directory
    return send_from_directory('client/dist/assets', filename)

@app.route('/aria-avatar.png')
def serve_avatar():
    """Serve the Aria avatar image"""
    from flask import send_from_directory
    # Try Vite build first, fallback to static
    try:
        return send_from_directory('client/dist', 'aria-avatar.png')
    except:
        return send_from_directory('static', 'aria-avatar.png')

@app.route('/vite.svg')
def serve_vite_svg():
    """Serve the Vite SVG"""
    from flask import send_from_directory
    return send_from_directory('client/dist', 'vite.svg')

@app.route('/output/<path:filename>')
def serve_output(filename):
    """Serve generated resume/cover letter files"""
    from flask import send_from_directory
    return send_from_directory('output', filename)

# Catch-all route for client-side routing (React Router)
@app.route('/<path:path>')
def serve_spa(path):
    """Serve SPA - return index.html for client-side routes"""
    from flask import send_from_directory
    import os
    # If file exists in dist, serve it
    if os.path.exists(os.path.join('client/dist', path)):
        return send_from_directory('client/dist', path)
    # Otherwise return index.html for client-side routing
    return send_from_directory('client/dist', 'index.html')


@app.route('/api/upload', methods=['POST'])
def upload_file():
    """Upload and parse a file (PDF, DOCX, TXT) to extract text content"""
    from file_parser import parse_uploaded_file, allowed_file

    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files['file']
    if not file.filename:
        return jsonify({"error": "No file selected"}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "Unsupported file type. Please upload a PDF, DOCX, or TXT file."}), 400

    try:
        text = parse_uploaded_file(file)
        return jsonify({
            "success": True,
            "text": text,
            "filename": file.filename,
            "characters": len(text)
        })
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.error(f"File upload error: {str(e)}")
        return jsonify({"error": "Failed to process the uploaded file."}), 500


@app.route('/api/generate', methods=['POST'])
def generate_resume():
    """Start a new resume generation job"""
    data = request.json
    linkedin_url = data.get('linkedin_url', '').strip()
    profile_text = data.get('profile_text', '').strip()
    edit_instructions = data.get('edit_instructions', '').strip()
    edit_target = data.get('edit_target', 'both').strip() or 'both'  # resume, cover_letter, or both
    previous_job_id = data.get('previous_job_id', '').strip()

    # Support new single job_input field, with backward compatibility
    job_input = data.get('job_input', '').strip()
    if not job_input:
        # Backward compatibility: combine old fields
        job_ad_url = data.get('job_ad_url', '').strip()
        job_ad_text = data.get('job_ad_text', '').strip()
        job_input = job_ad_url or job_ad_text

    # Validate inputs - must have either linkedin_url or profile_text
    if not linkedin_url and not profile_text:
        return jsonify({"error": "Please provide a LinkedIn URL or profile information"}), 400

    if linkedin_url and 'linkedin.com' not in linkedin_url.lower():
        return jsonify({"error": "Please provide a valid LinkedIn profile URL"}), 400

    if not job_input:
        return jsonify({"error": "Job information is required (URL, description, or title)"}), 400

    # Create new job
    job_id = str(uuid.uuid4())[:8]
    job = ResumeGeneratorJob(job_id, linkedin_url or None, None)
    job.job_input = job_input
    if profile_text:
        job.profile_text = profile_text
    if edit_instructions:
        job.edit_instructions = edit_instructions
        job.edit_target = edit_target
    if previous_job_id:
        job.previous_job_id = previous_job_id
    jobs[job_id] = job
    save_jobs_index()

    input_type = detect_job_input_type(job_input)
    profile_source = "profile_text" if profile_text else f"LinkedIn: {linkedin_url}"
    logger.info(f"Created new job {job_id} for {profile_source}, Job input type: {input_type}")

    # Start processing in background thread
    thread = threading.Thread(target=generate_resume_with_claude, args=(job,))
    thread.daemon = True
    thread.start()

    return jsonify({"job_id": job_id, "status": "started"})


@app.route('/api/status/<job_id>')
def get_status(job_id):
    """Get the status of a job"""
    job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    return jsonify(job.to_dict())


@app.route('/api/download/<job_id>')
def download_pdf(job_id):
    """Download the generated Resume PDF"""
    job = jobs.get(job_id)
    
    # Use the directory where app.py is located as base
    base_dir = os.path.dirname(__file__)
    
    # If job exists in memory, use its pdf_path
    if job and job.pdf_path:
        pdf_full_path = os.path.join(base_dir, job.pdf_path)
    else:
        # If job not in memory (after restart), try to find the file directly
        pdf_full_path = os.path.join(base_dir, "output", f"{job_id}_resume.pdf")
        if not os.path.exists(pdf_full_path):
            # Try HTML version
            pdf_full_path = os.path.join(base_dir, "output", f"{job_id}_resume.html")
    
    if not os.path.exists(pdf_full_path):
        return jsonify({"error": "PDF file not found"}), 404
    
    # Determine mime type based on file extension
    if pdf_full_path.endswith('.html'):
        mimetype = 'text/html'
        download_name = f'tailored_resume_{job_id}.html'
    else:
        mimetype = 'application/pdf'
        download_name = f'tailored_resume_{job_id}.pdf'
    
    return send_file(
        pdf_full_path,
        mimetype=mimetype,
        as_attachment=True,
        download_name=download_name
    )


@app.route('/api/download-cover-letter/<job_id>')
def download_cover_letter(job_id):
    """Download the generated Cover Letter PDF"""
    job = jobs.get(job_id)
    
    # Use the directory where app.py is located as base
    base_dir = os.path.dirname(__file__)
    
    # If job exists in memory, use its cover_letter_path
    if job and job.cover_letter_path:
        cl_full_path = os.path.join(base_dir, job.cover_letter_path)
    else:
        # If job not in memory (after restart), try to find the file directly
        cl_full_path = os.path.join(base_dir, "output", f"{job_id}_cover_letter.pdf")
        if not os.path.exists(cl_full_path):
            # Try HTML version
            cl_full_path = os.path.join(base_dir, "output", f"{job_id}_cover_letter.html")
    
    if not os.path.exists(cl_full_path):
        return jsonify({"error": "Cover letter file not found"}), 404
    
    # Determine mime type based on file extension
    if cl_full_path.endswith('.html'):
        mimetype = 'text/html'
        download_name = f'cover_letter_{job_id}.html'
    else:
        mimetype = 'application/pdf'
        download_name = f'cover_letter_{job_id}.pdf'
    
    return send_file(
        cl_full_path,
        mimetype=mimetype,
        as_attachment=True,
        download_name=download_name
    )


@app.route('/api/logs/<job_id>')
def get_logs(job_id):
    """Get logs for a specific job"""
    job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    return jsonify({"logs": job.logs})


@app.route('/api/chat', methods=['POST'])
def chat_message():
    """LLM-driven conversational follow-up after resume generation.

    Accepts conversation history and returns Aria's response with an
    optional action. The LLM decides when to act (generate/edit) vs
    when to just respond conversationally.
    """
    data = request.json
    message = data.get('message', '').strip()
    history = data.get('history', [])  # last N messages [{role, content}]
    context = data.get('context', {})

    if not message:
        return jsonify({"error": "Message is required"}), 400

    # Build conversation history string (last 15 messages max)
    history_lines = []
    for msg in history[-15:]:
        role = "User" if msg.get('role') == 'user' else "Aria"
        history_lines.append(f"{role}: {msg.get('content', '')[:300]}")
    history_str = "\n".join(history_lines) if history_lines else "(no prior messages)"

    profile_summary = context.get('profile_summary', 'Not provided')
    job_title = context.get('job_title', 'Not specified')
    company = context.get('company', 'Not specified')

    chat_prompt = f'''You are Aria, an AI career consultant chatbot. The user has just generated a resume and cover letter and is now chatting with you.

SESSION CONTEXT:
- User's profile: {profile_summary}
- Last generated for: {job_title} at {company}

RECENT CONVERSATION:
{history_str}

USER'S LATEST MESSAGE: "{message}"

Respond as Aria and decide whether to take an action. Return ONLY valid JSON:
{{"response": "your conversational reply (1-3 sentences)", "action": null or "generate" or "edit", "edit_target": "resume" or "cover_letter" or "both" or null, "job_input": null or "the complete job info if action is generate", "edit_instructions": null or "specific changes if action is edit"}}

CRITICAL RULES FOR CHOOSING ACTION:
1. action = null (MOST COMMON — default to this when in doubt) — Use this when:
   - The user is asking a question, saying thanks, or chatting
   - The user says they WILL provide something but hasn't yet
   - The user's request is vague and needs clarification
   - You need more information before you can act
   - The user shares a URL or info WITHOUT explicitly asking you to generate/create something
   - The user shares a LinkedIn profile URL → ask what they want to do (update profile? analyze?)
   - The user shares uploaded file content → ask what they want to do with it

2. action = "generate" — ONLY when BOTH conditions are met:
   a) The user provides ACTUAL job content (a job URL, full job description, or job title + company)
   b) The user EXPLICITLY asks you to generate/create a resume or cover letter for it
   Examples that DO trigger generate:
   - "Generate a resume for this job: Senior Engineer at Netflix..."
   - "Create a new resume for this: [job description]"
   - "Here is a new job, please make a resume: [job URL]"
   Examples that do NOT trigger generate (use action=null instead):
   - "Here is a job posting: [URL]" (no explicit request to generate)
   - "What do you think of this role? [job description]" (asking opinion)
   - A bare URL with no instruction
   - "I found this job" (just sharing, not requesting)

3. action = "edit" — ONLY when the user gives a CLEAR, SPECIFIC modification request for the existing documents:
   - "Make the cover letter shorter" → action=edit, edit_target="cover_letter"
   - "Add more technical skills to the resume" → action=edit, edit_target="resume"
   - "Make both documents more formal" → action=edit, edit_target="both"
   - If unclear what to change, ask for clarification with action=null

EDIT TARGET RULES (only when action = "edit"):
- edit_target = "resume" — the user only wants resume changes
- edit_target = "cover_letter" — the user only wants cover letter changes
- edit_target = "both" — the user wants changes to both documents
- Always set edit_target when action = "edit"

RESPONSE RULES:
- Stay in character as Aria, friendly and professional
- 1-3 sentences max
- For career questions, give helpful advice
- For off-topic messages, gently redirect to career help
- When action is "edit", briefly confirm what you'll change and which document
- When action is "generate", confirm you're using their saved profile

Only output the JSON object. No markdown, no extra text, no code fences.'''

    try:
        result = run_claude_command(chat_prompt, timeout=45, use_tools=False)

        # Parse JSON — handle nested braces in edit_instructions/response
        # Find the outermost {...}
        brace_depth = 0
        json_start = None
        json_end = None
        for i, ch in enumerate(result):
            if ch == '{':
                if brace_depth == 0:
                    json_start = i
                brace_depth += 1
            elif ch == '}':
                brace_depth -= 1
                if brace_depth == 0 and json_start is not None:
                    json_end = i + 1
                    break

        if json_start is not None and json_end is not None:
            parsed = json.loads(result[json_start:json_end])
            response_text = parsed.get('response', '')
            action = parsed.get('action')
            job_input = parsed.get('job_input')
            edit_instructions = parsed.get('edit_instructions')
            edit_target = parsed.get('edit_target')

            # Validate action
            if action not in (None, 'generate', 'edit'):
                action = None

            # Safety: don't allow generate without actual job_input
            if action == 'generate' and not job_input:
                action = None

            # Safety: don't allow edit without instructions
            if action == 'edit' and not edit_instructions:
                action = None

            # Validate edit_target
            if edit_target not in ('resume', 'cover_letter', 'both', None):
                edit_target = 'both'
            if action == 'edit' and not edit_target:
                edit_target = 'both'

            return jsonify({
                "response": response_text,
                "action": action,
                "edit_target": edit_target,
                "job_input": job_input,
                "edit_instructions": edit_instructions,
            })
        else:
            # Couldn't parse JSON — return raw text as response, no action
            return jsonify({
                "response": result[:500] if result else "I'm here to help with your resume and career questions!",
                "action": None,
                "edit_target": None,
                "job_input": None,
                "edit_instructions": None,
            })

    except Exception as e:
        logger.error(f"Chat endpoint error: {e}")
        return jsonify({
            "response": "I'm having trouble processing that right now. You can paste a new job posting to generate another resume, or hit 'New Chat' to start fresh.",
            "action": None,
            "edit_target": None,
            "job_input": None,
            "edit_instructions": None,
        })


@app.route('/api/health')
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "healthy", "timestamp": datetime.now().isoformat()})


@app.route('/api/resumes')
def get_resumes():
    """Get all completed resumes"""
    completed_resumes = []
    for job_id, job in jobs.items():
        if job.status == "completed":
            completed_resumes.append({
                "job_id": job_id,
                "created_at": job.created_at,
                "linkedin_url": job.linkedin_url,
                "job_ad_url": job.job_ad_url,
                "pdf_path": job.pdf_path,
                "cover_letter_path": job.cover_letter_path,
                "candidate_name": job.candidate_name,
                "job_title": job.job_title,
                "company_name": job.company_name,
            })
    
    # Sort by creation date (newest first)
    completed_resumes.sort(key=lambda x: x['created_at'], reverse=True)
    
    return jsonify({"resumes": completed_resumes})


if __name__ == '__main__':
    logger.info("Starting LinkedIn Resume & Cover Letter Generator App on port 8888")
    app.run(host='0.0.0.0', port=8888, debug=False, threaded=True)