#!/usr/bin/env python3
"""
Resume Generator Module
Handles LinkedIn profile fetching, job analysis, and PDF generation
"""

import os
import json
import subprocess
import requests
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

# RapidAPI configuration for LinkedIn data
RAPIDAPI_KEY = "012710e999msh3856498a448e7fap1a68ddjsne35e32edaa78"
RAPIDAPI_HOST = "fresh-linkedin-profile-data.p.rapidapi.com"

def fetch_linkedin_profile(linkedin_url: str) -> dict:
    """Fetch LinkedIn profile data using RapidAPI"""
    logger.info(f"Fetching LinkedIn profile: {linkedin_url}")
    
    url = "https://fresh-linkedin-profile-data.p.rapidapi.com/get-linkedin-profile"
    
    querystring = {
        "linkedin_url": linkedin_url,
        "include_skills": "true",
        "include_certifications": "true",
        "include_publications": "false",
        "include_honors": "false",
        "include_volunteers": "false",
        "include_projects": "true",
        "include_patents": "false",
        "include_courses": "false",
        "include_organizations": "false"
    }
    
    headers = {
        "x-rapidapi-key": RAPIDAPI_KEY,
        "x-rapidapi-host": RAPIDAPI_HOST
    }
    
    try:
        response = requests.get(url, headers=headers, params=querystring, timeout=30)
        response.raise_for_status()
        data = response.json()
        logger.info(f"Successfully fetched profile for: {data.get('data', {}).get('full_name', 'Unknown')}")
        return data
    except Exception as e:
        logger.error(f"Error fetching LinkedIn profile: {str(e)}")
        raise


def fetch_job_details(job_url: str) -> dict:
    """Fetch job details using RapidAPI"""
    logger.info(f"Fetching job details: {job_url}")
    
    url = "https://fresh-linkedin-profile-data.p.rapidapi.com/get-job-details"
    
    querystring = {
        "job_url": job_url,
        "include_skills": "true"
    }
    
    headers = {
        "x-rapidapi-key": RAPIDAPI_KEY,
        "x-rapidapi-host": RAPIDAPI_HOST
    }
    
    try:
        response = requests.get(url, headers=headers, params=querystring, timeout=30)
        response.raise_for_status()
        data = response.json()
        logger.info(f"Successfully fetched job: {data.get('data', {}).get('job_title', 'Unknown')}")
        return data
    except Exception as e:
        logger.error(f"Error fetching job details: {str(e)}")
        raise


def generate_tailored_resume_html(profile_data: dict, job_data: dict, job_id: str) -> str:
    """Generate tailored HTML resume based on profile and job data"""
    
    profile = profile_data.get('data', {})
    job = job_data.get('data', {})
    
    # Extract profile information
    full_name = profile.get('full_name', 'Your Name')
    headline = profile.get('headline', '')
    summary = profile.get('about', profile.get('summary', ''))
    location = profile.get('location', '')
    email = profile.get('email', '')
    
    # Extract experiences
    experiences = profile.get('experiences', [])
    education = profile.get('educations', profile.get('education', []))
    skills = profile.get('skills', [])
    certifications = profile.get('certifications', [])
    
    # Extract job information
    job_title = job.get('job_title', job.get('title', 'Target Position'))
    company_name = job.get('company_name', job.get('company', 'Target Company'))
    job_description = job.get('job_description', job.get('description', ''))
    job_skills = job.get('skills', [])
    
    # Match skills with job requirements
    profile_skills_lower = [s.get('name', s).lower() if isinstance(s, dict) else s.lower() for s in skills[:15]]
    job_skills_lower = [s.get('name', s).lower() if isinstance(s, dict) else s.lower() for s in job_skills] if job_skills else []
    
    # Prioritize matching skills
    matching_skills = []
    other_skills = []
    for skill in skills[:15]:
        skill_name = skill.get('name', skill) if isinstance(skill, dict) else skill
        if any(js in skill_name.lower() or skill_name.lower() in js for js in job_skills_lower):
            matching_skills.append(skill_name)
        else:
            other_skills.append(skill_name)
    
    prioritized_skills = matching_skills + other_skills
    
    # Generate tailored summary
    tailored_summary = summary if summary else f"Experienced professional seeking {job_title} position at {company_name}."
    
    # Build HTML
    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{full_name} - Resume</title>
    <style>
        @page {{
            size: A4;
            margin: 0.5in;
        }}
        
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        
        body {{
            font-family: 'Calibri', 'Arial', sans-serif;
            font-size: 11pt;
            line-height: 1.4;
            color: #333;
            max-width: 8.5in;
            margin: 0 auto;
            padding: 0.5in;
            background: white;
        }}
        
        .header {{
            text-align: center;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid #2c5282;
        }}
        
        .name {{
            font-size: 24pt;
            font-weight: bold;
            color: #1a365d;
            margin-bottom: 5px;
        }}
        
        .headline {{
            font-size: 12pt;
            color: #4a5568;
            margin-bottom: 8px;
        }}
        
        .contact {{
            font-size: 10pt;
            color: #718096;
        }}
        
        .section {{
            margin-bottom: 18px;
        }}
        
        .section-title {{
            font-size: 13pt;
            font-weight: bold;
            color: #2c5282;
            border-bottom: 1px solid #cbd5e0;
            padding-bottom: 3px;
            margin-bottom: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }}
        
        .summary {{
            text-align: justify;
            color: #4a5568;
        }}
        
        .experience-item {{
            margin-bottom: 15px;
        }}
        
        .job-header {{
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            flex-wrap: wrap;
        }}
        
        .job-title {{
            font-weight: bold;
            color: #1a365d;
            font-size: 11pt;
        }}
        
        .company {{
            color: #2d3748;
            font-weight: 600;
        }}
        
        .date {{
            color: #718096;
            font-size: 10pt;
        }}
        
        .location {{
            color: #718096;
            font-size: 10pt;
            font-style: italic;
        }}
        
        .description {{
            margin-top: 5px;
            color: #4a5568;
            text-align: justify;
        }}
        
        .description ul {{
            margin-left: 20px;
            margin-top: 5px;
        }}
        
        .description li {{
            margin-bottom: 3px;
        }}
        
        .education-item {{
            margin-bottom: 10px;
        }}
        
        .degree {{
            font-weight: bold;
            color: #1a365d;
        }}
        
        .school {{
            color: #2d3748;
        }}
        
        .skills-list {{
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }}
        
        .skill {{
            background: #edf2f7;
            padding: 4px 10px;
            border-radius: 3px;
            font-size: 10pt;
            color: #2d3748;
        }}
        
        .skill.matched {{
            background: #c6f6d5;
            color: #22543d;
            font-weight: 500;
        }}
        
        .certifications-list {{
            list-style: none;
        }}
        
        .certifications-list li {{
            margin-bottom: 5px;
            padding-left: 15px;
            position: relative;
        }}
        
        .certifications-list li::before {{
            content: "•";
            position: absolute;
            left: 0;
            color: #2c5282;
        }}
        
        .target-position {{
            background: #ebf8ff;
            padding: 10px;
            border-left: 3px solid #2c5282;
            margin-bottom: 15px;
            font-size: 10pt;
        }}
        
        .target-position strong {{
            color: #2c5282;
        }}
    </style>
</head>
<body>
    <div class="header">
        <div class="name">{full_name}</div>
        <div class="headline">{headline}</div>
        <div class="contact">{location}</div>
    </div>
    
    <div class="target-position">
        <strong>Target Position:</strong> {job_title} at {company_name}
    </div>
    
    <div class="section">
        <div class="section-title">Professional Summary</div>
        <div class="summary">{tailored_summary}</div>
    </div>
    
    <div class="section">
        <div class="section-title">Professional Experience</div>
'''
    
    # Add experiences
    for exp in experiences[:5]:
        title = exp.get('title', '')
        company = exp.get('company', '')
        start_date = exp.get('start_date', exp.get('starts_at', ''))
        end_date = exp.get('end_date', exp.get('ends_at', 'Present'))
        exp_location = exp.get('location', '')
        description = exp.get('description', '')
        
        # Format dates
        if isinstance(start_date, dict):
            start_date = f"{start_date.get('month', '')}/{start_date.get('year', '')}"
        if isinstance(end_date, dict):
            end_date = f"{end_date.get('month', '')}/{end_date.get('year', '')}"
        if not end_date:
            end_date = 'Present'
        
        html += f'''
        <div class="experience-item">
            <div class="job-header">
                <span class="job-title">{title}</span>
                <span class="date">{start_date} - {end_date}</span>
            </div>
            <div class="company">{company}</div>
            <div class="location">{exp_location}</div>
            <div class="description">{description[:500] if description else ''}</div>
        </div>
'''
    
    html += '''
    </div>
    
    <div class="section">
        <div class="section-title">Education</div>
'''
    
    # Add education
    for edu in education[:3]:
        degree = edu.get('degree', edu.get('degree_name', ''))
        field = edu.get('field_of_study', edu.get('field', ''))
        school = edu.get('school', edu.get('school_name', ''))
        grad_year = edu.get('end_date', edu.get('ends_at', ''))
        
        if isinstance(grad_year, dict):
            grad_year = grad_year.get('year', '')
        
        html += f'''
        <div class="education-item">
            <div class="degree">{degree} {f"in {field}" if field else ""}</div>
            <div class="school">{school} {f"• {grad_year}" if grad_year else ""}</div>
        </div>
'''
    
    html += '''
    </div>
    
    <div class="section">
        <div class="section-title">Skills</div>
        <div class="skills-list">
'''
    
    # Add skills (matching skills first)
    for skill in matching_skills[:10]:
        html += f'            <span class="skill matched">{skill}</span>\n'
    for skill in other_skills[:10]:
        html += f'            <span class="skill">{skill}</span>\n'
    
    html += '''
        </div>
    </div>
'''
    
    # Add certifications if available
    if certifications:
        html += '''
    <div class="section">
        <div class="section-title">Certifications</div>
        <ul class="certifications-list">
'''
        for cert in certifications[:5]:
            cert_name = cert.get('name', cert) if isinstance(cert, dict) else cert
            html += f'            <li>{cert_name}</li>\n'
        
        html += '''
        </ul>
    </div>
'''
    
    html += '''
</body>
</html>
'''
    
    return html


def convert_html_to_pdf(html_path: str, pdf_path: str) -> bool:
    """Convert HTML to PDF using wkhtmltopdf"""
    try:
        result = subprocess.run(
            ['wkhtmltopdf', '--enable-local-file-access', '--page-size', 'A4', 
             '--margin-top', '10mm', '--margin-bottom', '10mm',
             '--margin-left', '10mm', '--margin-right', '10mm',
             html_path, pdf_path],
            capture_output=True,
            text=True,
            timeout=60
        )
        
        if result.returncode == 0 or os.path.exists(pdf_path):
            logger.info(f"PDF generated successfully: {pdf_path}")
            return True
        else:
            logger.error(f"wkhtmltopdf error: {result.stderr}")
            return False
    except Exception as e:
        logger.error(f"PDF conversion error: {str(e)}")
        return False


def generate_resume(linkedin_url: str, job_ad_url: str, job_id: str, output_dir: str, progress_callback=None) -> dict:
    """Main function to generate tailored resume"""
    
    result = {
        "success": False,
        "pdf_path": None,
        "error": None,
        "profile_name": None,
        "job_title": None
    }
    
    try:
        # Step 1: Fetch LinkedIn profile
        if progress_callback:
            progress_callback(20, "Fetching LinkedIn profile...")
        
        profile_data = fetch_linkedin_profile(linkedin_url)
        result["profile_name"] = profile_data.get('data', {}).get('full_name', 'Unknown')
        
        # Save profile data
        profile_path = os.path.join(output_dir, f"{job_id}_profile.json")
        with open(profile_path, 'w') as f:
            json.dump(profile_data, f, indent=2)
        
        # Step 2: Fetch job details
        if progress_callback:
            progress_callback(40, "Fetching job details...")
        
        job_data = fetch_job_details(job_ad_url)
        result["job_title"] = job_data.get('data', {}).get('job_title', 'Unknown')
        
        # Save job data
        job_path = os.path.join(output_dir, f"{job_id}_job.json")
        with open(job_path, 'w') as f:
            json.dump(job_data, f, indent=2)
        
        # Step 3: Generate tailored HTML resume
        if progress_callback:
            progress_callback(60, "Generating tailored resume...")
        
        html_content = generate_tailored_resume_html(profile_data, job_data, job_id)
        
        html_path = os.path.join(output_dir, f"{job_id}_resume.html")
        with open(html_path, 'w') as f:
            f.write(html_content)
        
        # Step 4: Convert to PDF
        if progress_callback:
            progress_callback(80, "Converting to PDF...")
        
        pdf_path = os.path.join(output_dir, f"{job_id}_resume.pdf")
        
        if convert_html_to_pdf(html_path, pdf_path):
            result["success"] = True
            result["pdf_path"] = f"output/{job_id}_resume.pdf"
            
            if progress_callback:
                progress_callback(100, "Resume generated successfully!")
        else:
            result["error"] = "Failed to convert HTML to PDF"
            
    except Exception as e:
        result["error"] = str(e)
        logger.error(f"Resume generation error: {str(e)}")
    
    return result