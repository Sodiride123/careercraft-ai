// API client for CareerCraft AI backend

// Determine API base URL
// Priority: VITE_API_URL env var > same origin > localhost fallback
export const getApiBaseUrl = (): string => {
  // Check for environment variable (set in .env or at build time)
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // In production/sandbox: use same origin (if frontend served from Flask)
  // In development: fallback to localhost:8888
  if (import.meta.env.PROD) {
    return window.location.origin;
  }

  return "http://localhost:8888";
};

const API_BASE_URL = getApiBaseUrl();

interface GenerateResumeRequest {
  linkedin_url?: string;
  profile_text?: string;
  job_input: string;
  edit_instructions?: string;
  edit_target?: "resume" | "cover_letter" | "both";
  previous_job_id?: string;
}

interface ChatRequest {
  message: string;
  history?: { role: string; content: string }[];
  context?: {
    profile_summary?: string;
    job_title?: string;
    company?: string;
  };
}

interface ChatResponse {
  response: string;
  action: "generate" | "edit" | null;
  edit_target: "resume" | "cover_letter" | "both" | null;
  job_input: string | null;
  edit_instructions: string | null;
}

interface UploadResponse {
  success: boolean;
  text: string;
  filename: string;
  characters: number;
}

interface GenerateResumeResponse {
  job_id: string;
  status: string;
  message: string;
}

interface JobStatus {
  job_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  current_step: string;
  result?: string;
  error?: string;
  job_title?: string | null;
  company_name?: string | null;
}

interface Resume {
  job_id: string;
  created_at: string;
  linkedin_url: string;
  job_ad_url: string | null;
  pdf_path: string | null;
  cover_letter_path: string | null;
  candidate_name: string | null;
  job_title: string | null;
  company_name: string | null;
}

interface ResumesResponse {
  resumes: Resume[];
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Request failed: ${response.status}`);
    }

    return response.json();
  }

  async healthCheck(): Promise<{ status: string }> {
    return this.request("/api/health");
  }

  async generateResume(data: GenerateResumeRequest): Promise<GenerateResumeResponse> {
    return this.request("/api/generate", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getJobStatus(jobId: string): Promise<JobStatus> {
    return this.request(`/api/status/${jobId}`);
  }

  async getResumes(): Promise<ResumesResponse> {
    return this.request("/api/resumes");
  }

  async uploadFile(file: File): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append("file", file);

    const url = `${this.baseUrl}/api/upload`;
    const response = await fetch(url, {
      method: "POST",
      body: formData,
      // Note: do NOT set Content-Type header — browser sets it with boundary
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Upload failed: ${response.status}`);
    }

    return response.json();
  }

  async chat(data: ChatRequest): Promise<ChatResponse> {
    return this.request("/api/chat", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  getDownloadUrl(jobId: string): string {
    return `${this.baseUrl}/api/download/${jobId}`;
  }

  getCoverLetterUrl(jobId: string): string {
    return `${this.baseUrl}/api/download-cover-letter/${jobId}`;
  }

  getResumePreviewUrl(jobId: string): string {
    return `${this.baseUrl}/output/${jobId}_resume.html`;
  }

  getCoverLetterPreviewUrl(jobId: string): string {
    return `${this.baseUrl}/output/${jobId}_cover_letter.html`;
  }
}

export const api = new ApiClient(API_BASE_URL);
