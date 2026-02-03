#!/usr/bin/env python3
"""
Claude Code Monitoring Service
Reads Claude Code logs and visualizes token usage, costs, and prompts.
"""

import os
import json
import glob
from datetime import datetime
from pathlib import Path
from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
import threading
import time

app = Flask(__name__)
app.config['TEMPLATES_AUTO_RELOAD'] = True
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
CORS(app)

# Configuration
CLAUDE_LOGS_DIR = os.environ.get('CLAUDE_LOGS_DIR', '/root/.claude/projects')
POLL_INTERVAL = 2  # seconds

# Pricing per 1M tokens (Claude Opus 4.5)
PRICING = {
    'claude-opus-4-5-20251101': {
        'input': 15.0,  # $15 per 1M input tokens
        'output': 75.0,  # $75 per 1M output tokens
        'cache_write': 18.75,  # $18.75 per 1M cache write tokens
        'cache_read': 1.875,  # $1.875 per 1M cache read tokens
    },
    'claude-sonnet-4-5-20250514': {
        'input': 3.0,
        'output': 15.0,
        'cache_write': 3.75,
        'cache_read': 0.30,
    },
    'default': {
        'input': 15.0,
        'output': 75.0,
        'cache_write': 18.75,
        'cache_read': 1.875,
    }
}

# In-memory cache for parsed logs
log_cache = {
    'sessions': {},
    'messages': [],
    'last_update': None,
    'total_stats': {
        'total_input_tokens': 0,
        'total_output_tokens': 0,
        'total_cache_write_tokens': 0,
        'total_cache_read_tokens': 0,
        'total_cost': 0.0,
        'total_sessions': 0,
        'total_messages': 0
    }
}
cache_lock = threading.Lock()


def calculate_cost(usage, model='default'):
    """Calculate cost based on token usage and model pricing."""
    pricing = PRICING.get(model, PRICING['default'])
    
    input_tokens = usage.get('input_tokens', 0)
    output_tokens = usage.get('output_tokens', 0)
    cache_write = usage.get('cache_creation_input_tokens', 0)
    cache_read = usage.get('cache_read_input_tokens', 0)
    
    cost = (
        (input_tokens / 1_000_000) * pricing['input'] +
        (output_tokens / 1_000_000) * pricing['output'] +
        (cache_write / 1_000_000) * pricing['cache_write'] +
        (cache_read / 1_000_000) * pricing['cache_read']
    )
    
    return round(cost, 6)


def parse_jsonl_file(filepath):
    """Parse a JSONL log file and extract relevant data."""
    messages = []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    messages.append(data)
                except json.JSONDecodeError:
                    continue
    except Exception as e:
        print(f"Error reading {filepath}: {e}")
    return messages


def process_message(msg):
    """Process a single message and extract relevant information."""
    msg_type = msg.get('type', 'unknown')
    session_id = msg.get('sessionId', 'unknown')
    timestamp = msg.get('timestamp', '')
    
    result = {
        'type': msg_type,
        'session_id': session_id,
        'timestamp': timestamp,
        'uuid': msg.get('uuid', ''),
        'version': msg.get('version', ''),
        'cwd': msg.get('cwd', ''),
        'is_sidechain': msg.get('isSidechain', False),
        'agent_id': msg.get('agentId', ''),
        'slug': msg.get('slug', ''),
    }
    
    message_data = msg.get('message', {})
    
    if msg_type == 'user':
        content = message_data.get('content', '')
        result['role'] = 'user'
        result['model'] = ''
        result['usage'] = {}
        result['cost'] = 0
        result['tool_uses'] = []
        result['tool_results'] = []
        
        # Check if content is a list (tool results)
        if isinstance(content, list):
            tool_results = []
            for item in content:
                if isinstance(item, dict) and item.get('type') == 'tool_result':
                    # Extract the actual content - it might be a string or a list of objects
                    raw_content = item.get('content', '')
                    if isinstance(raw_content, list):
                        # Content is a list of objects like [{"type": "text", "text": "..."}]
                        text_parts = []
                        for content_item in raw_content:
                            if isinstance(content_item, dict) and content_item.get('type') == 'text':
                                text_parts.append(content_item.get('text', ''))
                        extracted_content = '\n'.join(text_parts)
                    else:
                        extracted_content = str(raw_content)
                    
                    tool_results.append({
                        'tool_use_id': item.get('tool_use_id', ''),
                        'content': extracted_content,
                    })
            result['tool_results'] = tool_results
            result['content'] = f"[Tool Results: {len(tool_results)} result(s)]"
            
            # Also capture toolUseResult if present
            tool_use_result = msg.get('toolUseResult', {})
            if tool_use_result and isinstance(tool_use_result, dict):
                result['tool_use_detail'] = {
                    'type': tool_use_result.get('type', ''),
                    'file_path': tool_use_result.get('filePath', ''),
                    'content': tool_use_result.get('content', ''),
                }
        else:
            result['content'] = content
        
    elif msg_type == 'assistant':
        result['role'] = 'assistant'
        result['model'] = message_data.get('model', '')
        result['tool_results'] = []
        
        # Extract content
        content_list = message_data.get('content', [])
        if isinstance(content_list, list):
            text_parts = []
            tool_uses = []
            for item in content_list:
                if isinstance(item, dict):
                    if item.get('type') == 'text':
                        text_parts.append(item.get('text', ''))
                    elif item.get('type') == 'tool_use':
                        tool_uses.append({
                            'id': item.get('id', ''),
                            'name': item.get('name', ''),
                            'input': item.get('input', {})
                        })
            result['content'] = '\n'.join(text_parts)
            result['tool_uses'] = tool_uses
        else:
            result['content'] = str(content_list)
            result['tool_uses'] = []
        
        # Extract usage
        usage = message_data.get('usage', {})
        result['usage'] = {
            'input_tokens': usage.get('input_tokens', 0),
            'output_tokens': usage.get('output_tokens', 0),
            'cache_creation_input_tokens': usage.get('cache_creation_input_tokens', 0),
            'cache_read_input_tokens': usage.get('cache_read_input_tokens', 0),
        }
        result['cost'] = calculate_cost(result['usage'], result['model'])
        result['stop_reason'] = message_data.get('stop_reason', '')
        
    elif msg_type == 'queue-operation':
        result['operation'] = msg.get('operation', '')
        result['content'] = f"Queue operation: {msg.get('operation', '')}"
        result['role'] = 'system'
        result['usage'] = {}
        result['cost'] = 0
        result['tool_uses'] = []
        result['tool_results'] = []
    
    return result


def scan_logs():
    """Scan all log files and update the cache."""
    global log_cache
    
    all_messages = []
    sessions = {}
    all_tool_uses = []
    total_stats = {
        'total_input_tokens': 0,
        'total_output_tokens': 0,
        'total_cache_write_tokens': 0,
        'total_cache_read_tokens': 0,
        'total_cost': 0.0,
        'total_sessions': 0,
        'total_messages': 0,
        'total_tool_uses': 0
    }
    
    # Find all JSONL files
    pattern = os.path.join(CLAUDE_LOGS_DIR, '**', '*.jsonl')
    log_files = glob.glob(pattern, recursive=True)
    
    for filepath in log_files:
        raw_messages = parse_jsonl_file(filepath)
        
        for raw_msg in raw_messages:
            processed = process_message(raw_msg)
            all_messages.append(processed)
            
            session_id = processed['session_id']
            if session_id not in sessions:
                sessions[session_id] = {
                    'session_id': session_id,
                    'messages': [],
                    'total_input_tokens': 0,
                    'total_output_tokens': 0,
                    'total_cache_write_tokens': 0,
                    'total_cache_read_tokens': 0,
                    'total_cost': 0.0,
                    'start_time': processed['timestamp'],
                    'end_time': processed['timestamp'],
                    'models_used': set(),
                    'tools_used': set(),
                    'tool_use_count': 0,
                    'file': filepath
                }
            
            session = sessions[session_id]
            session['messages'].append(processed)
            
            if processed['timestamp']:
                if processed['timestamp'] < session['start_time']:
                    session['start_time'] = processed['timestamp']
                if processed['timestamp'] > session['end_time']:
                    session['end_time'] = processed['timestamp']
            
            usage = processed.get('usage', {})
            session['total_input_tokens'] += usage.get('input_tokens', 0)
            session['total_output_tokens'] += usage.get('output_tokens', 0)
            session['total_cache_write_tokens'] += usage.get('cache_creation_input_tokens', 0)
            session['total_cache_read_tokens'] += usage.get('cache_read_input_tokens', 0)
            session['total_cost'] += processed.get('cost', 0)
            
            if processed.get('model'):
                session['models_used'].add(processed['model'])
            
            # Track tool uses
            tool_uses = processed.get('tool_uses', [])
            for tool in tool_uses:
                tool_name = tool.get('name', '')
                if tool_name:
                    session['tools_used'].add(tool_name)
                    session['tool_use_count'] += 1
                    total_stats['total_tool_uses'] += 1
                    
                    # Add to all_tool_uses list
                    all_tool_uses.append({
                        'timestamp': processed['timestamp'],
                        'session_id': session_id,
                        'tool_id': tool.get('id', ''),
                        'tool_name': tool_name,
                        'input': tool.get('input', {}),
                        'uuid': processed['uuid']
                    })
            
            # Update total stats
            total_stats['total_input_tokens'] += usage.get('input_tokens', 0)
            total_stats['total_output_tokens'] += usage.get('output_tokens', 0)
            total_stats['total_cache_write_tokens'] += usage.get('cache_creation_input_tokens', 0)
            total_stats['total_cache_read_tokens'] += usage.get('cache_read_input_tokens', 0)
            total_stats['total_cost'] += processed.get('cost', 0)
    
    # Convert sets to lists for JSON serialization
    for session_id, session in sessions.items():
        session['models_used'] = list(session['models_used'])
        session['tools_used'] = list(session['tools_used'])
    
    total_stats['total_sessions'] = len(sessions)
    total_stats['total_messages'] = len(all_messages)
    total_stats['total_cost'] = round(total_stats['total_cost'], 6)
    
    # Sort messages by timestamp
    all_messages.sort(key=lambda x: x.get('timestamp', ''))
    all_tool_uses.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
    
    with cache_lock:
        log_cache['sessions'] = sessions
        log_cache['messages'] = all_messages
        log_cache['tool_uses'] = all_tool_uses
        log_cache['total_stats'] = total_stats
        log_cache['last_update'] = datetime.now().isoformat()
    
    return total_stats


def background_scanner():
    """Background thread to periodically scan logs."""
    while True:
        try:
            scan_logs()
        except Exception as e:
            print(f"Error in background scanner: {e}")
        time.sleep(POLL_INTERVAL)


# API Routes
@app.route('/')
def index():
    """Serve the main dashboard."""
    return render_template('index.html')


@app.route('/api/stats')
def get_stats():
    """Get overall statistics."""
    with cache_lock:
        return jsonify({
            'stats': log_cache['total_stats'],
            'last_update': log_cache['last_update']
        })


@app.route('/api/sessions')
def get_sessions():
    """Get all sessions with their statistics."""
    with cache_lock:
        sessions_list = []
        for session_id, session in log_cache['sessions'].items():
            sessions_list.append({
                'session_id': session_id,
                'total_input_tokens': session['total_input_tokens'],
                'total_output_tokens': session['total_output_tokens'],
                'total_cache_write_tokens': session['total_cache_write_tokens'],
                'total_cache_read_tokens': session['total_cache_read_tokens'],
                'total_cost': round(session['total_cost'], 6),
                'start_time': session['start_time'],
                'end_time': session['end_time'],
                'models_used': session['models_used'],
                'message_count': len(session['messages']),
                'file': session['file']
            })
        
        # Sort by start time descending
        sessions_list.sort(key=lambda x: x['start_time'], reverse=True)
        return jsonify({'sessions': sessions_list})


@app.route('/api/sessions/<session_id>')
def get_session_detail(session_id):
    """Get detailed information for a specific session."""
    with cache_lock:
        session = log_cache['sessions'].get(session_id)
        if not session:
            return jsonify({'error': 'Session not found'}), 404
        
        return jsonify({
            'session_id': session_id,
            'total_input_tokens': session['total_input_tokens'],
            'total_output_tokens': session['total_output_tokens'],
            'total_cache_write_tokens': session['total_cache_write_tokens'],
            'total_cache_read_tokens': session['total_cache_read_tokens'],
            'total_cost': round(session['total_cost'], 6),
            'start_time': session['start_time'],
            'end_time': session['end_time'],
            'models_used': session['models_used'],
            'messages': session['messages']
        })


@app.route('/api/messages')
def get_messages():
    """Get all messages with pagination."""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)
    session_filter = request.args.get('session_id', '')
    role_filter = request.args.get('role', '')
    
    with cache_lock:
        messages = log_cache['messages']
        
        # Apply filters
        if session_filter:
            messages = [m for m in messages if m['session_id'] == session_filter]
        if role_filter:
            messages = [m for m in messages if m.get('role') == role_filter]
        
        # Pagination
        total = len(messages)
        start = (page - 1) * per_page
        end = start + per_page
        paginated = messages[start:end]
        
        return jsonify({
            'messages': paginated,
            'total': total,
            'page': page,
            'per_page': per_page,
            'total_pages': (total + per_page - 1) // per_page
        })


@app.route('/api/usage/timeline')
def get_usage_timeline():
    """Get token usage over time for charts."""
    with cache_lock:
        timeline = []
        for msg in log_cache['messages']:
            if msg.get('role') == 'assistant' and msg.get('usage'):
                usage = msg['usage']
                timeline.append({
                    'timestamp': msg['timestamp'],
                    'input_tokens': usage.get('input_tokens', 0),
                    'output_tokens': usage.get('output_tokens', 0),
                    'cache_write_tokens': usage.get('cache_creation_input_tokens', 0),
                    'cache_read_tokens': usage.get('cache_read_input_tokens', 0),
                    'cost': msg.get('cost', 0),
                    'model': msg.get('model', ''),
                    'session_id': msg['session_id']
                })
        
        return jsonify({'timeline': timeline})


@app.route('/api/refresh')
def refresh_logs():
    """Force a refresh of the log cache."""
    stats = scan_logs()
    return jsonify({'status': 'refreshed', 'stats': stats})


@app.route('/api/prompts')
def get_prompts():
    """Get all user prompts."""
    with cache_lock:
        prompts = []
        for msg in log_cache['messages']:
            if msg.get('role') == 'user' and msg.get('content'):
                # Skip tool result messages
                if msg.get('content', '').startswith('[Tool Results:'):
                    continue
                prompts.append({
                    'timestamp': msg['timestamp'],
                    'content': msg['content'],
                    'session_id': msg['session_id'],
                    'uuid': msg['uuid']
                })
        
        # Sort by timestamp descending
        prompts.sort(key=lambda x: x['timestamp'], reverse=True)
        return jsonify({'prompts': prompts})


@app.route('/api/tools')
def get_tool_uses():
    """Get all tool uses with their inputs and results."""
    with cache_lock:
        tool_uses = log_cache.get('tool_uses', [])
        
        # Enrich tool uses with their results
        enriched_tools = []
        for tool in tool_uses:
            tool_data = dict(tool)
            
            # Find the corresponding tool result
            tool_id = tool.get('tool_id', '')
            if tool_id:
                for msg in log_cache['messages']:
                    tool_results = msg.get('tool_results', [])
                    for result in tool_results:
                        if result.get('tool_use_id') == tool_id:
                            tool_data['result'] = result.get('content', '')
                            tool_data['result_detail'] = msg.get('tool_use_detail', {})
                            break
            
            enriched_tools.append(tool_data)
        
        return jsonify({'tools': enriched_tools})


@app.route('/api/tools/summary')
def get_tools_summary():
    """Get summary of tool usage."""
    with cache_lock:
        tool_counts = {}
        for tool in log_cache.get('tool_uses', []):
            name = tool.get('tool_name', 'Unknown')
            tool_counts[name] = tool_counts.get(name, 0) + 1
        
        summary = [
            {'name': name, 'count': count}
            for name, count in sorted(tool_counts.items(), key=lambda x: -x[1])
        ]
        
        return jsonify({
            'summary': summary,
            'total': sum(tool_counts.values())
        })


if __name__ == '__main__':
    # Initial scan
    print("Performing initial log scan...")
    scan_logs()
    
    # Start background scanner
    scanner_thread = threading.Thread(target=background_scanner, daemon=True)
    scanner_thread.start()
    
    print("Starting Claude Code Monitor on port 9010...")
    app.run(host='0.0.0.0', port=9010, debug=False)