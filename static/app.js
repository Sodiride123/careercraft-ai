/**
 * CareerCraft AI - Aria Craftwell - AI Career Consultant
 * Conversational Resume & Cover Letter Generator Interface
 */

class CareerCraftApp {
    constructor() {
        this.currentJobId = null;
        this.pollInterval = null;
        this.pollDelay = 2000;
        this.linkedinUrl = '';
        this.jobInputMode = 'url';
        this.hasCoverLetter = false;
        
        this.initElements();
        this.bindEvents();
    }
    
    initElements() {
        // Chat container
        this.chatContainer = document.getElementById('chatContainer');
        this.dynamicMessages = document.getElementById('dynamicMessages');
        
        // Input steps
        this.step1 = document.getElementById('step1');
        this.step2 = document.getElementById('step2');
        this.progressStep = document.getElementById('progressStep');
        this.resultStep = document.getElementById('resultStep');
        
        // Step 1 elements
        this.linkedinInput = document.getElementById('linkedinUrl');
        this.submitLinkedinBtn = document.getElementById('submitLinkedin');
        
        // Step 2 elements
        this.jobUrlMode = document.getElementById('jobUrlMode');
        this.jobTextMode = document.getElementById('jobTextMode');
        this.jobUrlGroup = document.getElementById('jobUrlGroup');
        this.jobTextGroup = document.getElementById('jobTextGroup');
        this.jobAdUrlInput = document.getElementById('jobAdUrl');
        this.jobAdTextInput = document.getElementById('jobAdText');
        this.submitJobUrlBtn = document.getElementById('submitJobUrl');
        this.submitJobTextBtn = document.getElementById('submitJobText');
        
        // Progress elements
        this.progressStatus = document.getElementById('progressStatus');
        this.progressFill = document.getElementById('progressFill');
        this.progressPercent = document.getElementById('progressPercent');
        this.progressSteps = document.getElementById('progressSteps');
        
        // Result elements
        this.downloadBtn = document.getElementById('downloadBtn');
        this.downloadCoverLetterBtn = document.getElementById('downloadCoverLetterBtn');
        this.newResumeBtn = document.getElementById('newResumeBtn');
    }
    
    bindEvents() {
        // Step 1: LinkedIn submission
        this.submitLinkedinBtn.addEventListener('click', () => this.handleLinkedinSubmit());
        this.linkedinInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleLinkedinSubmit();
        });
        
        // Step 2: Job input mode toggle
        this.jobUrlMode.addEventListener('click', () => this.setJobInputMode('url'));
        this.jobTextMode.addEventListener('click', () => this.setJobInputMode('text'));
        
        // Step 2: Job submission
        this.submitJobUrlBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.handleJobSubmit('url');
        });
        this.submitJobTextBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.handleJobSubmit('text');
        });
        this.jobAdUrlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.handleJobSubmit('url');
            }
        });
        
        // Result actions
        this.downloadBtn.addEventListener('click', () => this.downloadPdf());
        this.downloadCoverLetterBtn.addEventListener('click', () => this.downloadCoverLetter());
        this.newResumeBtn.addEventListener('click', () => this.resetApp());
    }
    
    handleLinkedinSubmit() {
        const url = this.linkedinInput.value.trim();
        
        if (!url) {
            this.showInputError(this.linkedinInput, 'Please enter your LinkedIn profile URL');
            return;
        }
        
        if (!url.includes('linkedin.com')) {
            this.showInputError(this.linkedinInput, 'Please enter a valid LinkedIn URL');
            return;
        }
        
        this.linkedinUrl = url;
        
        // Add user message
        this.addUserMessage(url);
        
        // Add Aria's response
        setTimeout(() => {
            this.addAgentMessage(`
                <p>Perfect! I found your LinkedIn profile. 🎯</p>
                <p>Now, tell me about the job you're applying for. You can either:</p>
                <ul>
                    <li><strong>Share a job URL</strong> from LinkedIn or any job board</li>
                    <li><strong>Paste the job description</strong> directly</li>
                </ul>
                <p>Which would you prefer?</p>
            `);
            
            // Show step 2
            this.step1.classList.add('hidden');
            this.step2.classList.remove('hidden');
            this.scrollToBottom();
        }, 500);
    }
    
    setJobInputMode(mode) {
        this.jobInputMode = mode;
        
        if (mode === 'url') {
            this.jobUrlMode.classList.add('active');
            this.jobTextMode.classList.remove('active');
            this.jobUrlGroup.classList.remove('hidden');
            this.jobTextGroup.classList.add('hidden');
        } else {
            this.jobUrlMode.classList.remove('active');
            this.jobTextMode.classList.add('active');
            this.jobUrlGroup.classList.add('hidden');
            this.jobTextGroup.classList.remove('hidden');
        }
    }
    
    async handleJobSubmit(mode) {
        // Use the current mode from state
        const actualMode = this.jobInputMode;
        let jobInput;
        let displayText;
        
        if (actualMode === 'url') {
            jobInput = this.jobAdUrlInput.value.trim();
            displayText = jobInput;
            
            if (!jobInput) {
                this.showInputError(this.jobAdUrlInput, 'Please enter a job URL');
                return;
            }
        } else {
            jobInput = this.jobAdTextInput.value.trim();
            displayText = jobInput.length > 100 ? jobInput.substring(0, 100) + '...' : jobInput;
            
            if (!jobInput) {
                this.showInputError(this.jobAdTextInput, 'Please enter the job description');
                return;
            }
            
            // No minimum character limit for job description
        }
        
        // Add user message
        this.addUserMessage(displayText);
        
        // Add Aria's working message
        setTimeout(() => {
            this.addAgentMessage(`
                <p>Excellent! I have everything I need. 🚀</p>
                <p>I'm now analyzing your profile and the job requirements to create a <strong>perfectly tailored resume</strong> and <strong>personalized cover letter</strong> for you.</p>
                <p>This usually takes about 2-3 minutes. I'll:</p>
                <ol>
                    <li>Extract your skills and experience from LinkedIn</li>
                    <li>Analyze the job requirements</li>
                    <li>Match your qualifications to the role</li>
                    <li>Generate an ATS-optimized PDF resume</li>
                    <li>Create a compelling cover letter</li>
                </ol>
                <p>Sit tight! ✨</p>
            `);
            
            // Show progress
            this.step2.classList.add('hidden');
            this.progressStep.classList.remove('hidden');
            this.scrollToBottom();
            
            // Start the generation using actualMode
            this.startGeneration(actualMode, jobInput);
        }, 500);
    }
    
    async startGeneration(mode, jobInput) {
        try {
            const requestBody = {
                linkedin_url: this.linkedinUrl
            };
            
            if (mode === 'url') {
                requestBody.job_ad_url = jobInput;
            } else {
                requestBody.job_ad_text = jobInput;
            }
            
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to start generation');
            }
            
            this.currentJobId = data.job_id;
            this.startPolling();
            
        } catch (error) {
            this.showError(error.message);
        }
    }
    
    startPolling() {
        this.pollInterval = setInterval(() => this.pollStatus(), this.pollDelay);
    }
    
    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }
    
    async pollStatus() {
        if (!this.currentJobId) {
            this.stopPolling();
            return;
        }
        
        try {
            const response = await fetch(`/api/status/${this.currentJobId}`);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to get status');
            }
            
            // Update progress
            this.updateProgress(data.progress, data.current_step);
            this.updateProgressSteps(data.logs);
            
            // Check completion
            if (data.status === 'completed') {
                this.stopPolling();
                this.hasCoverLetter = !!data.cover_letter_path;
                this.showSuccess(data);
            } else if (data.status === 'failed') {
                this.stopPolling();
                this.showError(data.error || 'Generation failed');
            }
            
        } catch (error) {
            console.error('Polling error:', error);
        }
    }
    
    updateProgress(progress, step) {
        this.progressFill.style.width = `${progress}%`;
        this.progressPercent.textContent = `${progress}%`;
        this.progressStatus.textContent = step || 'Aria is working on your resume...';
    }
    
    updateProgressSteps(logs) {
        if (!logs || logs.length === 0) return;
        
        this.progressSteps.innerHTML = logs.map(log => {
            const icon = log.level === 'success' ? '✅' : 
                        log.level === 'error' ? '❌' : 
                        log.level === 'warning' ? '⚠️' : '🔄';
            return `
                <div class="progress-step-item ${log.level}">
                    <span class="step-icon">${icon}</span>
                    <span>${log.message}</span>
                </div>
            `;
        }).join('');
        
        // Scroll to bottom of progress steps
        this.progressSteps.scrollTop = this.progressSteps.scrollHeight;
    }
    
    showSuccess(data) {
        // Add success message from Aria
        this.addAgentMessage(`
            <p>🎉 <strong>Your tailored resume and cover letter are ready!</strong></p>
            <p>I've created professional, ATS-optimized documents that highlight your most relevant skills and experience for this position.</p>
            <p>Here's what I did:</p>
            <ul>
                <li>✅ Extracted your key qualifications from LinkedIn</li>
                <li>✅ Analyzed the job requirements</li>
                <li>✅ Matched your skills to the role</li>
                <li>✅ Created an ATS-optimized resume</li>
                <li>✅ Wrote a personalized cover letter</li>
            </ul>
            <p>Click the buttons below to download your documents. Good luck with your application! 🍀</p>
        `, true);
        
        // Show/hide cover letter button based on availability
        if (this.hasCoverLetter && this.downloadCoverLetterBtn) {
            this.downloadCoverLetterBtn.classList.remove('hidden');
        }
        
        // Show result actions
        this.progressStep.classList.add('hidden');
        this.resultStep.classList.remove('hidden');
        this.scrollToBottom();
    }
    
    showError(message) {
        this.addAgentMessage(`
            <p>😔 I'm sorry, something went wrong:</p>
            <p><strong>${message}</strong></p>
            <p>Please try again or contact support if the issue persists.</p>
        `);
        
        this.progressStep.classList.add('hidden');
        this.resultStep.classList.remove('hidden');
        this.downloadBtn.classList.add('hidden');
        if (this.downloadCoverLetterBtn) {
            this.downloadCoverLetterBtn.classList.add('hidden');
        }
        this.scrollToBottom();
    }
    
    async downloadPdf() {
        if (!this.currentJobId) return;
        
        try {
            const response = await fetch(`/api/download/${this.currentJobId}`);
            
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Download failed');
            }
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `tailored_resume_${this.currentJobId}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            
        } catch (error) {
            alert('Download failed: ' + error.message);
        }
    }
    
    async downloadCoverLetter() {
        if (!this.currentJobId) return;
        
        try {
            const response = await fetch(`/api/download-cover-letter/${this.currentJobId}`);
            
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Download failed');
            }
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `cover_letter_${this.currentJobId}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            
        } catch (error) {
            alert('Download failed: ' + error.message);
        }
    }
    
    resetApp() {
        this.stopPolling();
        this.currentJobId = null;
        this.linkedinUrl = '';
        this.hasCoverLetter = false;
        
        // Clear inputs
        this.linkedinInput.value = '';
        this.jobAdUrlInput.value = '';
        this.jobAdTextInput.value = '';
        
        // Clear dynamic messages
        this.dynamicMessages.innerHTML = '';
        
        // Reset progress
        this.progressFill.style.width = '0%';
        this.progressPercent.textContent = '0%';
        this.progressSteps.innerHTML = '';
        
        // Show step 1
        this.step1.classList.remove('hidden');
        this.step2.classList.add('hidden');
        this.progressStep.classList.add('hidden');
        this.resultStep.classList.add('hidden');
        this.downloadBtn.classList.remove('hidden');
        if (this.downloadCoverLetterBtn) {
            this.downloadCoverLetterBtn.classList.add('hidden');
        }
        
        // Reset job input mode
        this.setJobInputMode('url');
        
        this.scrollToBottom();
    }
    
    addUserMessage(text) {
        const messageHtml = `
            <div class="message user-message">
                <div class="message-avatar">👤</div>
                <div class="message-content">
                    <div class="message-header">
                        <span class="message-name">You</span>
                        <span class="message-time">Just now</span>
                    </div>
                    <div class="message-bubble">
                        <p>${this.escapeHtml(text)}</p>
                    </div>
                </div>
            </div>
        `;
        
        this.dynamicMessages.insertAdjacentHTML('beforeend', messageHtml);
        this.scrollToBottom();
    }
    
    addAgentMessage(html, isSuccess = false) {
        const messageHtml = `
            <div class="message agent-message ${isSuccess ? 'success-message' : ''}">
                <div class="message-avatar">
                    <img src="/static/aria-avatar.png" alt="Aria">
                </div>
                <div class="message-content">
                    <div class="message-header">
                        <span class="message-name">Aria Craftwell</span>
                        <span class="message-time">Just now</span>
                    </div>
                    <div class="message-bubble">
                        ${html}
                    </div>
                </div>
            </div>
        `;
        
        this.dynamicMessages.insertAdjacentHTML('beforeend', messageHtml);
        this.scrollToBottom();
    }
    
    showInputError(input, message) {
        input.style.borderColor = 'var(--error-color)';
        input.placeholder = message;
        
        setTimeout(() => {
            input.style.borderColor = '';
            input.placeholder = input.dataset.originalPlaceholder || '';
        }, 3000);
        
        // Store original placeholder
        if (!input.dataset.originalPlaceholder) {
            input.dataset.originalPlaceholder = input.placeholder;
        }
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    scrollToBottom() {
        setTimeout(() => {
            this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
        }, 100);
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    window.app = new CareerCraftApp();
});