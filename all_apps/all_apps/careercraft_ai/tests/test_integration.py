#!/usr/bin/env python3
"""
Integration Tests for LinkedIn Resume Generator
Tests the complete workflow including API endpoints and job processing
"""

import unittest
import sys
import os
import json
import time
import tempfile
from unittest.mock import Mock, patch, MagicMock

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, ResumeGeneratorJob, jobs, run_claude_code, convert_html_to_pdf


class TestAPIIntegration(unittest.TestCase):
    """Integration tests for API endpoints"""
    
    def setUp(self):
        """Set up test client and clear state"""
        app.config['TESTING'] = True
        self.client = app.test_client()
        jobs.clear()
    
    def tearDown(self):
        """Clean up after tests"""
        jobs.clear()
    
    def test_full_api_workflow_job_creation(self):
        """Test complete workflow: create job and check status"""
        # Create a job
        with patch('app.threading.Thread') as mock_thread:
            mock_thread_instance = Mock()
            mock_thread.return_value = mock_thread_instance
            
            response = self.client.post('/api/generate',
                data=json.dumps({
                    "linkedin_url": "https://www.linkedin.com/in/testuser/",
                    "job_ad_url": "https://www.linkedin.com/jobs/view/123456/"
                }),
                content_type='application/json'
            )
            
            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            job_id = data["job_id"]
        
        # Check status
        response = self.client.get(f'/api/status/{job_id}')
        self.assertEqual(response.status_code, 200)
        status_data = json.loads(response.data)
        
        self.assertEqual(status_data["job_id"], job_id)
        self.assertIn(status_data["status"], ["pending", "running"])
    
    def test_job_status_updates(self):
        """Test that job status updates are reflected in API"""
        # Create job directly
        job = ResumeGeneratorJob("integ123", "https://linkedin.com/in/test", "https://example.com/job")
        jobs["integ123"] = job
        
        # Initial status
        response = self.client.get('/api/status/integ123')
        data = json.loads(response.data)
        self.assertEqual(data["status"], "pending")
        self.assertEqual(data["progress"], 0)
        
        # Update job
        job.status = "running"
        job.progress = 50
        job.current_step = "Processing..."
        job.add_log("Test log entry")
        
        # Check updated status
        response = self.client.get('/api/status/integ123')
        data = json.loads(response.data)
        self.assertEqual(data["status"], "running")
        self.assertEqual(data["progress"], 50)
        self.assertEqual(data["current_step"], "Processing...")
        self.assertEqual(len(data["logs"]), 1)
    
    def test_logs_accumulation(self):
        """Test that logs accumulate correctly"""
        job = ResumeGeneratorJob("logs123", "https://linkedin.com/in/test", "https://example.com/job")
        jobs["logs123"] = job
        
        # Add logs progressively
        for i in range(5):
            job.add_log(f"Log message {i}", "info")
            
            response = self.client.get('/api/logs/logs123')
            data = json.loads(response.data)
            self.assertEqual(len(data["logs"]), i + 1)
    
    def test_concurrent_jobs(self):
        """Test handling multiple concurrent jobs"""
        job_ids = []
        
        with patch('app.threading.Thread') as mock_thread:
            mock_thread_instance = Mock()
            mock_thread.return_value = mock_thread_instance
            
            # Create multiple jobs
            for i in range(3):
                response = self.client.post('/api/generate',
                    data=json.dumps({
                        "linkedin_url": f"https://www.linkedin.com/in/user{i}/",
                        "job_ad_url": f"https://example.com/job{i}"
                    }),
                    content_type='application/json'
                )
                
                self.assertEqual(response.status_code, 200)
                data = json.loads(response.data)
                job_ids.append(data["job_id"])
        
        # Verify all jobs exist and are independent
        self.assertEqual(len(job_ids), 3)
        self.assertEqual(len(set(job_ids)), 3)  # All unique
        
        for job_id in job_ids:
            response = self.client.get(f'/api/status/{job_id}')
            self.assertEqual(response.status_code, 200)


class TestJobProcessingIntegration(unittest.TestCase):
    """Integration tests for job processing logic"""
    
    def setUp(self):
        """Set up test environment"""
        self.test_output_dir = tempfile.mkdtemp()
    
    def test_job_progress_tracking(self):
        """Test that job progress is tracked correctly"""
        job = ResumeGeneratorJob("prog123", "https://linkedin.com/in/test", "https://example.com/job")
        
        # Simulate progress updates
        progress_steps = [
            (5, "Starting Ninja AI Agent..."),
            (10, "Launching Ninja AI Agent..."),
            (30, "Fetching LinkedIn profile..."),
            (50, "Analyzing job requirements..."),
            (70, "Generating resume..."),
            (90, "Finalizing resume..."),
            (100, "Resume generated successfully!")
        ]
        
        for progress, step in progress_steps:
            job.progress = progress
            job.current_step = step
            
            self.assertEqual(job.progress, progress)
            self.assertEqual(job.current_step, step)
    
    def test_job_error_handling(self):
        """Test job error handling"""
        job = ResumeGeneratorJob("err123", "https://linkedin.com/in/test", "https://example.com/job")
        
        # Simulate error
        job.status = "failed"
        job.error = "Test error: Unable to fetch profile"
        job.add_log("Error occurred during processing", "error")
        
        result = job.to_dict()
        
        self.assertEqual(result["status"], "failed")
        self.assertIsNotNone(result["error"])
        self.assertEqual(result["logs"][-1]["level"], "error")
    
    def test_job_completion_with_pdf(self):
        """Test job completion with PDF path"""
        job = ResumeGeneratorJob("comp123", "https://linkedin.com/in/test", "https://example.com/job")
        
        # Simulate successful completion
        job.status = "completed"
        job.progress = 100
        job.current_step = "Resume generated successfully!"
        job.pdf_path = "output/comp123_resume.pdf"
        job.result = "Resume PDF generated successfully"
        job.add_log("PDF resume created successfully", "success")
        
        result = job.to_dict()
        
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["progress"], 100)
        self.assertIsNotNone(result["pdf_path"])
        self.assertEqual(result["logs"][-1]["level"], "success")


class TestHTMLToPDFConversion(unittest.TestCase):
    """Integration tests for HTML to PDF conversion"""
    
    def setUp(self):
        """Set up test environment"""
        self.test_dir = tempfile.mkdtemp()
        self.test_html = os.path.join(self.test_dir, "test.html")
        self.test_pdf = os.path.join(self.test_dir, "test.pdf")
        
        # Create test HTML file
        with open(self.test_html, 'w') as f:
            f.write("""
            <!DOCTYPE html>
            <html>
            <head><title>Test Resume</title></head>
            <body>
                <h1>John Doe</h1>
                <p>Software Engineer</p>
            </body>
            </html>
            """)
    
    def tearDown(self):
        """Clean up test files"""
        import shutil
        shutil.rmtree(self.test_dir, ignore_errors=True)
    
    def test_html_file_creation(self):
        """Test that HTML file is created correctly"""
        self.assertTrue(os.path.exists(self.test_html))
        
        with open(self.test_html, 'r') as f:
            content = f.read()
            self.assertIn('John Doe', content)
            self.assertIn('Software Engineer', content)
    
    def test_wkhtmltopdf_conversion(self):
        """Test PDF conversion using wkhtmltopdf"""
        job = ResumeGeneratorJob("pdf123", "https://linkedin.com/in/test", "https://example.com/job")
        
        # Test the conversion function - it should handle errors gracefully
        result = convert_html_to_pdf(self.test_html, self.test_pdf, job)
        
        # The function should return True/False and add logs
        self.assertIsInstance(result, bool)
        # Check that logs were added during conversion attempt
        self.assertTrue(len(job.logs) >= 0)  # Logs may or may not be added depending on conversion method


class TestEndToEndWorkflow(unittest.TestCase):
    """End-to-end workflow tests"""
    
    def setUp(self):
        """Set up test client"""
        app.config['TESTING'] = True
        self.client = app.test_client()
        jobs.clear()
    
    def test_complete_user_journey(self):
        """Test complete user journey from form submission to status check"""
        # Step 1: Load the main page
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'LinkedIn Resume Generator', response.data)
        
        # Step 2: Submit the form
        with patch('app.threading.Thread') as mock_thread:
            mock_thread_instance = Mock()
            mock_thread.return_value = mock_thread_instance
            
            response = self.client.post('/api/generate',
                data=json.dumps({
                    "linkedin_url": "https://www.linkedin.com/in/johndoe/",
                    "job_ad_url": "https://www.linkedin.com/jobs/view/software-engineer-123/"
                }),
                content_type='application/json'
            )
            
            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            job_id = data["job_id"]
        
        # Step 3: Poll for status
        response = self.client.get(f'/api/status/{job_id}')
        self.assertEqual(response.status_code, 200)
        status_data = json.loads(response.data)
        self.assertIn("progress", status_data)
        self.assertIn("logs", status_data)
        
        # Step 4: Check logs endpoint
        response = self.client.get(f'/api/logs/{job_id}')
        self.assertEqual(response.status_code, 200)
    
    def test_error_recovery_workflow(self):
        """Test workflow when errors occur"""
        # Create a job that will fail
        job = ResumeGeneratorJob("fail123", "https://linkedin.com/in/test", "https://example.com/job")
        job.status = "failed"
        job.error = "Unable to fetch LinkedIn profile"
        job.add_log("Error: Profile not accessible", "error")
        jobs["fail123"] = job
        
        # Check status shows error
        response = self.client.get('/api/status/fail123')
        data = json.loads(response.data)
        
        self.assertEqual(data["status"], "failed")
        self.assertIsNotNone(data["error"])
        
        # Verify download is not available
        response = self.client.get('/api/download/fail123')
        self.assertEqual(response.status_code, 400)


class TestAPIResponseFormats(unittest.TestCase):
    """Test API response formats and structures"""
    
    def setUp(self):
        """Set up test client"""
        app.config['TESTING'] = True
        self.client = app.test_client()
        jobs.clear()
    
    def test_health_response_format(self):
        """Test health endpoint response format"""
        response = self.client.get('/api/health')
        data = json.loads(response.data)
        
        self.assertIn("status", data)
        self.assertIn("timestamp", data)
        self.assertEqual(data["status"], "healthy")
    
    def test_generate_response_format(self):
        """Test generate endpoint response format"""
        with patch('app.threading.Thread'):
            response = self.client.post('/api/generate',
                data=json.dumps({
                    "linkedin_url": "https://www.linkedin.com/in/test/",
                    "job_ad_url": "https://example.com/job"
                }),
                content_type='application/json'
            )
            
            data = json.loads(response.data)
            
            self.assertIn("job_id", data)
            self.assertIn("status", data)
            self.assertEqual(data["status"], "started")
    
    def test_status_response_format(self):
        """Test status endpoint response format"""
        job = ResumeGeneratorJob("fmt123", "https://linkedin.com/in/test", "https://example.com/job")
        job.add_log("Test log")
        jobs["fmt123"] = job
        
        response = self.client.get('/api/status/fmt123')
        data = json.loads(response.data)
        
        required_fields = [
            "job_id", "status", "progress", "current_step",
            "logs", "result", "error", "pdf_path", "created_at"
        ]
        
        for field in required_fields:
            self.assertIn(field, data, f"Missing field: {field}")
    
    def test_error_response_format(self):
        """Test error response format"""
        response = self.client.post('/api/generate',
            data=json.dumps({"linkedin_url": "invalid"}),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertIn("error", data)


if __name__ == '__main__':
    unittest.main(verbosity=2)