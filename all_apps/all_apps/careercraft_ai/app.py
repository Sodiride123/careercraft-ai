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
from datetime import datetime
from flask import Flask, request, jsonify, render_template, send_file
from flask_cors import CORS

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
CORS(app)

# Store job status
jobs = {}

class ResumeGeneratorJob:
    """Class to manage resume generation jobs"""
    
    def __init__(self, job_id, linkedin_url, job_ad_url):
        self.job_id = job_id
        self.linkedin_url = linkedin_url
        self.job_ad_url = job_ad_url
        self.status = "pending"
        self.progress = 0
        self.current_step = "Initializing..."
        self.logs = []
        self.result = None
        self.error = None
        self.pdf_path = None
        self.cover_letter_path = None
        self.created_at = datetime.now().isoformat()
        
    def add_log(self, message, level="info"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        log_entry = {"timestamp": timestamp, "level": level, "message": message}
        self.logs.append(log_entry)
        logger.info(f"[{self.job_id}] {message}")
        
    def to_dict(self):
        return {
            "job_id": self.job_id,
            "status": self.status,
            "progress": self.progress,
            "current_step": self.current_step,
            "logs": self.logs,
            "result": self.result,
            "error": self.error,
            "pdf_path": self.pdf_path,
            "cover_letter_path": self.cover_letter_path,
            "created_at": self.created_at
        }


def run_claude_command(prompt: str, timeout: int = 180) -> str:
    """Run a Claude Code command and return the output using wrapper script"""
    try:
        # Use the wrapper script which sets HOME and PATH
        wrapper_path = '/workspace/linkedin-resume-app/claude_wrapper.sh'
        
        # Set environment explicitly
        env = os.environ.copy()
        env['HOME'] = '/root'
        env['USER'] = 'root'
        env['PATH'] = '/usr/local/bin:' + env.get('PATH', '')
        
        logger.info(f"Running Claude command with timeout={timeout}s")
        
        # Use wrapper script with pseudo-TTY
        result = subprocess.run(
            [wrapper_path, '-p', prompt],
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd='/workspace/linkedin-resume-app',
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


def generate_resume_with_claude(job: ResumeGeneratorJob):
    """Generate resume and cover letter using Claude Code with MCP tools"""
    try:
        job.status = "running"
        job.progress = 5
        job.current_step = "Starting Ninja AI Agent..."
        job.add_log("Initializing Ninja AI Agent for resume generation")
        
        output_dir = "/workspace/linkedin-resume-app/output"
        
        # Step 1: Fetch LinkedIn Profile
        job.progress = 10
        job.current_step = "Fetching LinkedIn profile..."
        job.add_log(f"Fetching profile: {job.linkedin_url}")
        
        profile_prompt = f'''Use the Get_Profile_Details MCP tool to fetch the LinkedIn profile for {job.linkedin_url} with include_skills=true, include_certifications=true, include_projects=true.

Return the data as a valid JSON object with this structure:
{{
    "full_name": "...",
    "headline": "...",
    "summary": "...",
    "location": "...",
    "experiences": [...],
    "education": [...],
    "skills": [...],
    "certifications": [...]
}}

Only output the JSON, nothing else.'''

        profile_result = run_claude_command(profile_prompt, timeout=300)
        job.add_log("LinkedIn profile fetched successfully", "success")
        
        # Save profile data
        profile_path = os.path.join(output_dir, f"{job.job_id}_profile.json")
        with open(profile_path, 'w') as f:
            f.write(profile_result)
        
        # Step 2: Fetch Job Details (from URL or use provided text)
        job.progress = 25
        job.current_step = "Processing job details..."
        
        job_ad_text = getattr(job, 'job_ad_text', None)
        
        if job.job_ad_url:
            # Fetch from URL using MCP tool
            job.add_log(f"Fetching job from URL: {job.job_ad_url}")
            
            job_prompt = f'''Use the Get_Job_Details MCP tool to fetch job details for {job.job_ad_url} with include_skills=true.

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

            job_result = run_claude_command(job_prompt, timeout=300)
            job.add_log("Job details fetched successfully", "success")
        else:
            # Use provided job description text
            job.add_log("Using provided job description text")
            
            job_prompt = f'''Analyze the following job description and extract key information.

JOB DESCRIPTION:
{job_ad_text}

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

            job_result = run_claude_command(job_prompt, timeout=300)
            job.add_log("Job description analyzed successfully", "success")
        
        # Save job data
        job_path = os.path.join(output_dir, f"{job.job_id}_job.json")
        with open(job_path, 'w') as f:
            f.write(job_result)
        
        # Step 3: Generate Tailored Resume HTML
        job.progress = 40
        job.current_step = "Generating tailored resume..."
        job.add_log("Analyzing profile and job requirements...")
        
        resume_prompt = f'''I need you to create a professional, ATS-friendly HTML resume.

LINKEDIN PROFILE DATA:
{profile_result}

JOB DETAILS:
{job_result}

Create a complete HTML resume that:
1. Is tailored for the specific job position
2. Highlights skills that match the job requirements
3. Uses a clean, professional design with inline CSS
4. Is ATS-friendly (simple formatting, standard sections)
5. Includes: Header with name/contact, Professional Summary (tailored to the job), Experience, Education, Skills (prioritize matching skills)

Output ONLY the complete HTML code starting with <!DOCTYPE html> and ending with </html>. No explanations or markdown.'''

        html_result = run_claude_command(resume_prompt, timeout=300)
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
        
        cover_letter_prompt = f'''I need you to create a professional cover letter in HTML format.

LINKEDIN PROFILE DATA:
{profile_result}

JOB DETAILS:
{job_result}

Create a complete HTML cover letter that:
1. Is professionally formatted with proper business letter structure
2. Is personalized for the specific job and company
3. Highlights relevant experience and skills from the profile that match the job
4. Shows enthusiasm for the role and company
5. Uses a clean, professional design with inline CSS that matches a resume style
6. Includes: Date, Hiring Manager greeting, 3-4 compelling paragraphs, Professional closing
7. Is approximately 300-400 words in the body

The cover letter should:
- Opening paragraph: Express interest in the specific position and company, mention how you found the role
- Second paragraph: Highlight 2-3 most relevant experiences/achievements that match job requirements
- Third paragraph: Explain why you're a great fit and what you can bring to the company
- Closing paragraph: Express enthusiasm, mention availability for interview, thank them

Use this HTML structure with inline CSS for professional styling:
- Clean, readable font (Arial or similar)
- Proper margins and spacing
- Professional color scheme (dark text, minimal accent colors)
- A4/Letter page size friendly

Output ONLY the complete HTML code starting with <!DOCTYPE html> and ending with </html>. No explanations or markdown.'''

        cover_letter_result = run_claude_command(cover_letter_prompt, timeout=300)
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
        
        # Use wkhtmltopdf for conversion
        pdf_result = subprocess.run(
            ['wkhtmltopdf', '--enable-local-file-access', '--page-size', 'A4',
             '--margin-top', '10mm', '--margin-bottom', '10mm',
             '--margin-left', '10mm', '--margin-right', '10mm',
             '--encoding', 'UTF-8',
             html_path, pdf_path],
            capture_output=True,
            text=True,
            timeout=60
        )
        
        resume_pdf_success = os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 0
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
        
        cl_pdf_result = subprocess.run(
            ['wkhtmltopdf', '--enable-local-file-access', '--page-size', 'A4',
             '--margin-top', '15mm', '--margin-bottom', '15mm',
             '--margin-left', '20mm', '--margin-right', '20mm',
             '--encoding', 'UTF-8',
             cl_html_path, cl_pdf_path],
            capture_output=True,
            text=True,
            timeout=60
        )
        
        cover_letter_pdf_success = os.path.exists(cl_pdf_path) and os.path.getsize(cl_pdf_path) > 0
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
            
    except Exception as e:
        job.status = "failed"
        job.error = str(e)
        job.add_log(f"Error: {str(e)}", "error")
        logger.error(f"Job {job.job_id} failed: {str(e)}")


@app.route('/')
def index():
    """Serve the main page"""
    return render_template('index.html')


@app.route('/api/generate', methods=['POST'])
def generate_resume():
    """Start a new resume generation job"""
    data = request.json
    linkedin_url = data.get('linkedin_url', '').strip()
    job_ad_url = data.get('job_ad_url', '').strip()
    job_ad_text = data.get('job_ad_text', '').strip()
    
    # Validate inputs
    if not linkedin_url:
        return jsonify({"error": "LinkedIn URL is required"}), 400
    
    if not job_ad_url and not job_ad_text:
        return jsonify({"error": "Job Ad URL or Description is required"}), 400
    
    if 'linkedin.com' not in linkedin_url.lower():
        return jsonify({"error": "Please provide a valid LinkedIn profile URL"}), 400
    
    # Create new job - use URL if provided, otherwise use text
    job_id = str(uuid.uuid4())[:8]
    job = ResumeGeneratorJob(job_id, linkedin_url, job_ad_url if job_ad_url else None)
    job.job_ad_text = job_ad_text if job_ad_text else None
    jobs[job_id] = job
    
    logger.info(f"Created new job {job_id} for LinkedIn: {linkedin_url}, Job URL: {job_ad_url}, Job Text: {'Yes' if job_ad_text else 'No'}")
    
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
    if not job:
        return jsonify({"error": "Job not found"}), 404
    
    if job.status != "completed" or not job.pdf_path:
        return jsonify({"error": "PDF not ready"}), 400
    
    pdf_full_path = os.path.join('/workspace/linkedin-resume-app', job.pdf_path)
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
    if not job:
        return jsonify({"error": "Job not found"}), 404
    
    if job.status != "completed" or not job.cover_letter_path:
        return jsonify({"error": "Cover letter not ready"}), 400
    
    cl_full_path = os.path.join('/workspace/linkedin-resume-app', job.cover_letter_path)
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


@app.route('/api/health')
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "healthy", "timestamp": datetime.now().isoformat()})


if __name__ == '__main__':
    logger.info("Starting LinkedIn Resume & Cover Letter Generator App on port 9000")
    app.run(host='0.0.0.0', port=9000, debug=False, threaded=True)