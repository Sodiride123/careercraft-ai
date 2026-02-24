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
  linkedin_url: string;
  job_ad_url?: string;
  job_ad_text?: string;
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

  getDownloadUrl(jobId: string): string {
    return `${this.baseUrl}/api/download/${jobId}`;
  }

  getCoverLetterUrl(jobId: string): string {
    return `${this.baseUrl}/api/download-cover-letter/${jobId}`;
  }
}

export const api = new ApiClient(API_BASE_URL);
