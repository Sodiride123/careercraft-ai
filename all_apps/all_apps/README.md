# CareerCraft AI Suite - Complete Package

This package contains two powerful AI-powered applications for career development and API monitoring.

## 📦 Applications Included

### 1. CareerCraft AI
A LinkedIn profile to job-tailored resume and cover letter generator.

**Features:**
- AI-powered resume optimization
- Personalized cover letter generation
- Chat-based interface with Sarah Chen (AI Career Coach)
- LinkedIn profile integration
- Job description matching
- Professional PDF output

**Port:** 9000

### 2. Token Usage Monitor
Real-time Claude API token usage and cost monitoring dashboard.

**Features:**
- Real-time token tracking
- Cost calculation and monitoring
- Usage statistics and trends
- Visual dashboard interface
- Historical data logging

**Port:** 9010

## 🚀 Quick Start

### For CareerCraft AI:
```bash
cd careercraft_ai
pip install -r requirements.txt
chmod +x claude_wrapper.sh start.sh
./start.sh
```
Access at: http://localhost:9000

### For Token Monitor:
```bash
cd token_monitor
pip install -r requirements.txt
python app.py
```
Access at: http://localhost:9010

## 📋 Prerequisites
- Python 3.11+ (for CareerCraft AI)
- Python 3.8+ (for Token Monitor)
- Claude API key (for CareerCraft AI)
- pip package manager

## 📁 Package Structure
```
all_apps/
├── careercraft_ai/
│   ├── app.py
│   ├── claude_wrapper.sh
│   ├── start.sh
│   ├── requirements.txt
│   ├── INSTALL.md
│   ├── templates/
│   ├── static/
│   └── ...
├── token_monitor/
│   ├── app.py
│   ├── requirements.txt
│   ├── INSTALL.md
│   ├── templates/
│   ├── static/
│   └── ...
└── README.md
```

## 🔧 Configuration

### CareerCraft AI Configuration
1. Edit `careercraft_ai/claude_wrapper.sh`
2. Set your Claude API key: `export ANTHROPIC_API_KEY="your-key"`
3. Adjust port in `app.py` if needed (default: 9000)

### Token Monitor Configuration
1. Edit `token_monitor/app.py` if needed
2. Adjust port (default: 9010)
3. Customize token pricing if desired

## 📖 Documentation
- `careercraft_ai/INSTALL.md` - Detailed CareerCraft AI installation guide
- `token_monitor/INSTALL.md` - Detailed Token Monitor installation guide

## 🐛 Troubleshooting

### Common Issues:
1. **Port already in use:** Change the port in the respective app.py file
2. **Import errors:** Ensure all dependencies are installed via pip
3. **Claude API errors:** Verify your API key is correct and has credits
4. **Permission errors:** Make shell scripts executable with `chmod +x`

### Getting Help:
- Check individual INSTALL.md files for detailed troubleshooting
- Review log files in each application directory
- Ensure Python version requirements are met

## 📄 License
This software is provided as-is for personal and commercial use.

## 🤝 Support
For issues or questions, refer to the individual application documentation.
