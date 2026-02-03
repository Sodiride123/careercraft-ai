#!/usr/bin/env python3
"""
Unit tests for Claude Code log parser
"""

import unittest
import json
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import process_message, calculate_cost, parse_jsonl_file

class TestCalculateCost(unittest.TestCase):
    """Test cost calculation"""
    
    def test_basic_cost_calculation(self):
        """Test basic token cost calculation"""
        usage = {
            'input_tokens': 1000,
            'output_tokens': 100,
            'cache_creation_input_tokens': 0,
            'cache_read_input_tokens': 0
        }
        cost = calculate_cost(usage, 'claude-opus-4-5-20251101')
        # 1000 input * $15/1M + 100 output * $75/1M = $0.015 + $0.0075 = $0.0225
        self.assertAlmostEqual(cost, 0.0225, places=4)
    
    def test_cache_cost_calculation(self):
        """Test cost calculation with cache tokens"""
        usage = {
            'input_tokens': 0,
            'output_tokens': 0,
            'cache_creation_input_tokens': 1000000,
            'cache_read_input_tokens': 1000000
        }
        cost = calculate_cost(usage, 'claude-opus-4-5-20251101')
        # 1M cache write * $18.75/1M + 1M cache read * $1.875/1M = $18.75 + $1.875 = $20.625
        self.assertAlmostEqual(cost, 20.625, places=2)


class TestProcessMessage(unittest.TestCase):
    """Test message processing"""
    
    def test_user_message_simple(self):
        """Test processing a simple user message"""
        msg = {
            "type": "user",
            "sessionId": "test-session-123",
            "timestamp": "2025-12-28T03:00:00.000Z",
            "uuid": "uuid-123",
            "message": {
                "role": "user",
                "content": "Hello, how are you?"
            }
        }
        result = process_message(msg)
        
        self.assertEqual(result['type'], 'user')
        self.assertEqual(result['role'], 'user')
        self.assertEqual(result['session_id'], 'test-session-123')
        self.assertEqual(result['content'], 'Hello, how are you?')
        self.assertEqual(result['tool_uses'], [])
        self.assertEqual(result['tool_results'], [])
    
    def test_user_message_with_tool_result(self):
        """Test processing a user message containing tool results"""
        msg = {
            "type": "user",
            "sessionId": "test-session-123",
            "timestamp": "2025-12-28T03:00:00.000Z",
            "uuid": "uuid-456",
            "message": {
                "role": "user",
                "content": [
                    {
                        "tool_use_id": "toolu_123",
                        "type": "tool_result",
                        "content": "File created successfully at: /workspace/test.txt"
                    }
                ]
            },
            "toolUseResult": {
                "type": "create",
                "filePath": "/workspace/test.txt",
                "content": "Hello World"
            }
        }
        result = process_message(msg)
        
        self.assertEqual(result['type'], 'user')
        self.assertEqual(result['role'], 'user')
        self.assertEqual(len(result['tool_results']), 1)
        self.assertEqual(result['tool_results'][0]['tool_use_id'], 'toolu_123')
        self.assertEqual(result['tool_results'][0]['content'], 'File created successfully at: /workspace/test.txt')
        self.assertIn('tool_use_detail', result)
        self.assertEqual(result['tool_use_detail']['type'], 'create')
        self.assertEqual(result['tool_use_detail']['file_path'], '/workspace/test.txt')
    
    def test_assistant_message_with_text(self):
        """Test processing an assistant message with text content"""
        msg = {
            "type": "assistant",
            "sessionId": "test-session-123",
            "timestamp": "2025-12-28T03:00:00.000Z",
            "uuid": "uuid-789",
            "message": {
                "model": "claude-opus-4-5-20251101",
                "role": "assistant",
                "content": [
                    {
                        "type": "text",
                        "text": "Hello! I'm doing well, thank you for asking."
                    }
                ],
                "stop_reason": "end_turn",
                "usage": {
                    "input_tokens": 100,
                    "output_tokens": 20,
                    "cache_creation_input_tokens": 5000,
                    "cache_read_input_tokens": 0
                }
            }
        }
        result = process_message(msg)
        
        self.assertEqual(result['type'], 'assistant')
        self.assertEqual(result['role'], 'assistant')
        self.assertEqual(result['model'], 'claude-opus-4-5-20251101')
        self.assertEqual(result['content'], "Hello! I'm doing well, thank you for asking.")
        self.assertEqual(result['tool_uses'], [])
        self.assertEqual(result['usage']['input_tokens'], 100)
        self.assertEqual(result['usage']['output_tokens'], 20)
        self.assertGreater(result['cost'], 0)
    
    def test_assistant_message_with_tool_use(self):
        """Test processing an assistant message with tool use"""
        msg = {
            "type": "assistant",
            "sessionId": "test-session-123",
            "timestamp": "2025-12-28T03:00:00.000Z",
            "uuid": "uuid-tool",
            "message": {
                "model": "claude-opus-4-5-20251101",
                "role": "assistant",
                "content": [
                    {
                        "type": "tool_use",
                        "id": "toolu_0163UTKPuW683ttpn65QhWpn",
                        "name": "Write",
                        "input": {
                            "file_path": "/workspace/test.txt",
                            "content": "Hello World"
                        }
                    }
                ],
                "stop_reason": "tool_use",
                "usage": {
                    "input_tokens": 50,
                    "output_tokens": 76,
                    "cache_creation_input_tokens": 3310,
                    "cache_read_input_tokens": 23749
                }
            }
        }
        result = process_message(msg)
        
        self.assertEqual(result['type'], 'assistant')
        self.assertEqual(result['role'], 'assistant')
        self.assertEqual(len(result['tool_uses']), 1)
        self.assertEqual(result['tool_uses'][0]['name'], 'Write')
        self.assertEqual(result['tool_uses'][0]['id'], 'toolu_0163UTKPuW683ttpn65QhWpn')
        self.assertEqual(result['tool_uses'][0]['input']['file_path'], '/workspace/test.txt')
        self.assertEqual(result['content'], '')  # No text content, only tool use
        self.assertEqual(result['stop_reason'], 'tool_use')
    
    def test_assistant_message_with_text_and_tool_use(self):
        """Test processing an assistant message with both text and tool use"""
        msg = {
            "type": "assistant",
            "sessionId": "test-session-123",
            "timestamp": "2025-12-28T03:00:00.000Z",
            "uuid": "uuid-mixed",
            "message": {
                "model": "claude-opus-4-5-20251101",
                "role": "assistant",
                "content": [
                    {
                        "type": "text",
                        "text": "I'll create that file for you."
                    },
                    {
                        "type": "tool_use",
                        "id": "toolu_abc123",
                        "name": "Write",
                        "input": {
                            "file_path": "/workspace/example.txt",
                            "content": "Example content"
                        }
                    }
                ],
                "stop_reason": "tool_use",
                "usage": {
                    "input_tokens": 100,
                    "output_tokens": 50,
                    "cache_creation_input_tokens": 0,
                    "cache_read_input_tokens": 0
                }
            }
        }
        result = process_message(msg)
        
        self.assertEqual(result['content'], "I'll create that file for you.")
        self.assertEqual(len(result['tool_uses']), 1)
        self.assertEqual(result['tool_uses'][0]['name'], 'Write')
    
    def test_queue_operation_message(self):
        """Test processing a queue operation message"""
        msg = {
            "type": "queue-operation",
            "operation": "dequeue",
            "timestamp": "2025-12-28T03:00:00.000Z",
            "sessionId": "test-session-123"
        }
        result = process_message(msg)
        
        self.assertEqual(result['type'], 'queue-operation')
        self.assertEqual(result['role'], 'system')
        self.assertEqual(result['operation'], 'dequeue')
        self.assertIn('dequeue', result['content'])
    
    def test_mcp_tool_use(self):
        """Test processing MCP tool use (like LinkedIn API)"""
        msg = {
            "type": "assistant",
            "sessionId": "test-session-123",
            "timestamp": "2025-12-28T03:14:30.398Z",
            "uuid": "uuid-mcp",
            "message": {
                "model": "claude-opus-4-5-20251101",
                "role": "assistant",
                "content": [
                    {
                        "type": "tool_use",
                        "id": "toolu_01U4QR6tLXqa7q8k5Fo1U5xs",
                        "name": "mcp__RapidAPI-Hub-Fresh-LinkedIn-Profile-Data__Google_Profiles",
                        "input": {
                            "name": "Babak Pahlavan",
                            "page": 1
                        }
                    }
                ],
                "stop_reason": "tool_use",
                "usage": {
                    "input_tokens": 1,
                    "output_tokens": 95,
                    "cache_creation_input_tokens": 1000,
                    "cache_read_input_tokens": 5000
                }
            }
        }
        result = process_message(msg)
        
        self.assertEqual(len(result['tool_uses']), 1)
        self.assertEqual(result['tool_uses'][0]['name'], 'mcp__RapidAPI-Hub-Fresh-LinkedIn-Profile-Data__Google_Profiles')
        self.assertEqual(result['tool_uses'][0]['input']['name'], 'Babak Pahlavan')


class TestToolResultMatching(unittest.TestCase):
    """Test that tool results are properly matched with tool uses"""
    
    def test_tool_result_content_extraction_string(self):
        """Test extracting content from tool result messages with string content"""
        msg = {
            "type": "user",
            "sessionId": "test-session",
            "timestamp": "2025-12-28T03:11:19.948Z",
            "uuid": "result-uuid",
            "message": {
                "role": "user",
                "content": [
                    {
                        "tool_use_id": "toolu_0163UTKPuW683ttpn65QhWpn",
                        "type": "tool_result",
                        "content": "File created successfully at: /workspace/test.txt"
                    }
                ]
            },
            "toolUseResult": {
                "type": "create",
                "filePath": "/workspace/test.txt",
                "content": "Hello World",
                "structuredPatch": [],
                "originalFile": None
            }
        }
        result = process_message(msg)
        
        self.assertEqual(len(result['tool_results']), 1)
        self.assertEqual(result['tool_results'][0]['tool_use_id'], 'toolu_0163UTKPuW683ttpn65QhWpn')
        self.assertEqual(result['tool_results'][0]['content'], 'File created successfully at: /workspace/test.txt')
        self.assertIn('tool_use_detail', result)
        self.assertEqual(result['tool_use_detail']['type'], 'create')
    
    def test_tool_result_content_extraction_list(self):
        """Test extracting content from tool result messages with list content (MCP tools)"""
        msg = {
            "type": "user",
            "sessionId": "test-session",
            "timestamp": "2025-12-28T03:14:32.000Z",
            "uuid": "result-uuid-mcp",
            "message": {
                "role": "user",
                "content": [
                    {
                        "tool_use_id": "toolu_01U4QR6tLXqa7q8k5Fo1U5xs",
                        "type": "tool_result",
                        "content": [
                            {
                                "text": '{"data":["https://www.linkedin.com/in/babakp"],"message":"ok"}\n',
                                "type": "text"
                            }
                        ]
                    }
                ]
            }
        }
        result = process_message(msg)
        
        self.assertEqual(len(result['tool_results']), 1)
        self.assertEqual(result['tool_results'][0]['tool_use_id'], 'toolu_01U4QR6tLXqa7q8k5Fo1U5xs')
        self.assertIn('linkedin.com/in/babakp', result['tool_results'][0]['content'])
        self.assertIn('message', result['tool_results'][0]['content'])
        self.assertIn('ok', result['tool_results'][0]['content'])


if __name__ == '__main__':
    unittest.main(verbosity=2)