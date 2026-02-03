#!/usr/bin/env python3
"""
Unit Tests for LinkedIn Resume Generator
"""

import unittest
import sys
import os
import json
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, ResumeGeneratorJob, jobs, convert_html_to_pdf


class TestResumeGeneratorJob(unittest.TestCase):
    """Test cases for ResumeGeneratorJob class"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.job_id = "test123"
        self.linkedin_url = "https://www.linkedin.com/in/testuser/"
        self.job_ad_url = "https://www.linkedin.com/jobs/view/123456/"
        self.job = ResumeGeneratorJob(self.job_id, self.linkedin_url, self.job_ad_url)
    
    def test_job_initialization(self):
        """Test job is initialized with correct values"""
        self.assertEqual(self.job.job_id, self.job_id)
        self.assertEqual(self.job.linkedin_url, self.linkedin_url)
        self.assertEqual(self.job.job_ad_url, self.job_ad_url)
        self.assertEqual(self.job.status, "pending")
        self.assertEqual(self.job.progress, 0)
        self.assertEqual(self.job.current_step, "Initializing...")
        self.assertEqual(self.job.logs, [])
        self.assertIsNone(self.job.result)
        self.assertIsNone(self.job.error)
        self.assertIsNone(self.job.pdf_path)
    
    def test_add_log(self):
        """Test adding log entries"""
        self.job.add_log("Test message", "info")
        
        self.assertEqual(len(self.job.logs), 1)
        self.assertEqual(self.job.logs[0]["message"], "Test message")
        self.assertEqual(self.job.logs[0]["level"], "info")
        self.assertIn("timestamp", self.job.logs[0])
    
    def test_add_log_default_level(self):
        """Test adding log with default level"""
        self.job.add_log("Test message")
        
        self.assertEqual(self.job.logs[0]["level"], "info")
    
    def test_add_multiple_logs(self):
        """Test adding multiple log entries"""
        self.job.add_log("Message 1", "info")
        self.job.add_log("Message 2", "warning")
        self.job.add_log("Message 3", "error")
        
        self.assertEqual(len(self.job.logs), 3)
        self.assertEqual(self.job.logs[0]["level"], "info")
        self.assertEqual(self.job.logs[1]["level"], "warning")
        self.assertEqual(self.job.logs[2]["level"], "error")
    
    def test_to_dict(self):
        """Test converting job to dictionary"""
        self.job.status = "running"
        self.job.progress = 50
        self.job.add_log("Test log")
        
        result = self.job.to_dict()
        
        self.assertIsInstance(result, dict)
        self.assertEqual(result["job_id"], self.job_id)
        self.assertEqual(result["status"], "running")
        self.assertEqual(result["progress"], 50)
        self.assertEqual(len(result["logs"]), 1)
        self.assertIn("created_at", result)
    
    def test_to_dict_contains_all_fields(self):
        """Test to_dict contains all required fields"""
        result = self.job.to_dict()
        
        required_fields = [
            "job_id", "status", "progress", "current_step",
            "logs", "result", "error", "pdf_path", "created_at"
        ]
        
        for field in required_fields:
            self.assertIn(field, result)


class TestFlaskRoutes(unittest.TestCase):
    """Test cases for Flask routes"""
    
    def setUp(self):
        """Set up test client"""
        app.config['TESTING'] = True
        self.client = app.test_client()
        # Clear jobs between tests
        jobs.clear()
    
    def test_index_route(self):
        """Test index route returns HTML"""
        response = self.client.get('/')
        
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'LinkedIn Resume Generator', response.data)
    
    def test_health_check(self):
        """Test health check endpoint"""
        response = self.client.get('/api/health')
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertEqual(data["status"], "healthy")
        self.assertIn("timestamp", data)
    
    def test_generate_missing_linkedin_url(self):
        """Test generate endpoint with missing LinkedIn URL"""
        response = self.client.post('/api/generate',
            data=json.dumps({"job_ad_url": "https://example.com/job"}),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertIn("error", data)
        self.assertIn("LinkedIn URL", data["error"])
    
    def test_generate_missing_job_ad_url(self):
        """Test generate endpoint with missing job ad URL"""
        response = self.client.post('/api/generate',
            data=json.dumps({"linkedin_url": "https://www.linkedin.com/in/test/"}),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertIn("error", data)
        self.assertIn("Job Ad URL", data["error"])
    
    def test_generate_invalid_linkedin_url(self):
        """Test generate endpoint with invalid LinkedIn URL"""
        response = self.client.post('/api/generate',
            data=json.dumps({
                "linkedin_url": "https://example.com/profile",
                "job_ad_url": "https://example.com/job"
            }),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertIn("error", data)
        self.assertIn("valid LinkedIn", data["error"])
    
    @patch('app.threading.Thread')
    def test_generate_valid_request(self, mock_thread):
        """Test generate endpoint with valid request"""
        mock_thread_instance = Mock()
        mock_thread.return_value = mock_thread_instance
        
        response = self.client.post('/api/generate',
            data=json.dumps({
                "linkedin_url": "https://www.linkedin.com/in/testuser/",
                "job_ad_url": "https://example.com/job"
            }),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertIn("job_id", data)
        self.assertEqual(data["status"], "started")
        mock_thread_instance.start.assert_called_once()
    
    def test_status_not_found(self):
        """Test status endpoint with non-existent job"""
        response = self.client.get('/api/status/nonexistent')
        
        self.assertEqual(response.status_code, 404)
        data = json.loads(response.data)
        self.assertIn("error", data)
    
    def test_status_existing_job(self):
        """Test status endpoint with existing job"""
        # Create a job
        job = ResumeGeneratorJob("test123", "https://linkedin.com/in/test", "https://example.com/job")
        jobs["test123"] = job
        
        response = self.client.get('/api/status/test123')
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertEqual(data["job_id"], "test123")
        self.assertEqual(data["status"], "pending")
    
    def test_download_not_found(self):
        """Test download endpoint with non-existent job"""
        response = self.client.get('/api/download/nonexistent')
        
        self.assertEqual(response.status_code, 404)
    
    def test_download_not_ready(self):
        """Test download endpoint when PDF not ready"""
        job = ResumeGeneratorJob("test123", "https://linkedin.com/in/test", "https://example.com/job")
        job.status = "running"
        jobs["test123"] = job
        
        response = self.client.get('/api/download/test123')
        
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertIn("not ready", data["error"])
    
    def test_logs_not_found(self):
        """Test logs endpoint with non-existent job"""
        response = self.client.get('/api/logs/nonexistent')
        
        self.assertEqual(response.status_code, 404)
    
    def test_logs_existing_job(self):
        """Test logs endpoint with existing job"""
        job = ResumeGeneratorJob("test123", "https://linkedin.com/in/test", "https://example.com/job")
        job.add_log("Test log message")
        jobs["test123"] = job
        
        response = self.client.get('/api/logs/test123')
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertIn("logs", data)
        self.assertEqual(len(data["logs"]), 1)


class TestInputValidation(unittest.TestCase):
    """Test cases for input validation"""
    
    def setUp(self):
        """Set up test client"""
        app.config['TESTING'] = True
        self.client = app.test_client()
        jobs.clear()
    
    def test_empty_linkedin_url(self):
        """Test with empty LinkedIn URL"""
        response = self.client.post('/api/generate',
            data=json.dumps({
                "linkedin_url": "",
                "job_ad_url": "https://example.com/job"
            }),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 400)
    
    def test_whitespace_linkedin_url(self):
        """Test with whitespace-only LinkedIn URL"""
        response = self.client.post('/api/generate',
            data=json.dumps({
                "linkedin_url": "   ",
                "job_ad_url": "https://example.com/job"
            }),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 400)
    
    def test_valid_linkedin_urls(self):
        """Test various valid LinkedIn URL formats"""
        valid_urls = [
            "https://www.linkedin.com/in/username/",
            "https://linkedin.com/in/username",
            "http://www.linkedin.com/in/username",
            "https://www.linkedin.com/in/user-name-123/",
        ]
        
        for url in valid_urls:
            with patch('app.threading.Thread'):
                response = self.client.post('/api/generate',
                    data=json.dumps({
                        "linkedin_url": url,
                        "job_ad_url": "https://example.com/job"
                    }),
                    content_type='application/json'
                )
                
                self.assertEqual(response.status_code, 200, f"Failed for URL: {url}")


class TestJobStatusTransitions(unittest.TestCase):
    """Test cases for job status transitions"""
    
    def test_status_pending_to_running(self):
        """Test status transition from pending to running"""
        job = ResumeGeneratorJob("test", "https://linkedin.com/in/test", "https://example.com")
        
        self.assertEqual(job.status, "pending")
        
        job.status = "running"
        job.progress = 10
        
        self.assertEqual(job.status, "running")
        self.assertEqual(job.progress, 10)
    
    def test_status_running_to_completed(self):
        """Test status transition from running to completed"""
        job = ResumeGeneratorJob("test", "https://linkedin.com/in/test", "https://example.com")
        job.status = "running"
        
        job.status = "completed"
        job.progress = 100
        job.pdf_path = "output/test_resume.pdf"
        
        self.assertEqual(job.status, "completed")
        self.assertEqual(job.progress, 100)
        self.assertIsNotNone(job.pdf_path)
    
    def test_status_running_to_failed(self):
        """Test status transition from running to failed"""
        job = ResumeGeneratorJob("test", "https://linkedin.com/in/test", "https://example.com")
        job.status = "running"
        
        job.status = "failed"
        job.error = "Test error message"
        
        self.assertEqual(job.status, "failed")
        self.assertIsNotNone(job.error)


if __name__ == '__main__':
    unittest.main(verbosity=2)