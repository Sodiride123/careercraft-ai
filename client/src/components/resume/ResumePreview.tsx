import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, getApiBaseUrl } from "@/lib/api";
import { Download, FileText, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

interface ResumePreviewProps {
  jobId?: string | null;
}

export function ResumePreview({ jobId }: ResumePreviewProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [hasResume, setHasResume] = useState(false);
  const [previewType, setPreviewType] = useState<"resume" | "coverLetter">("resume");

  useEffect(() => {
    if (jobId) {
      setIsLoading(true);
      setPreviewType("resume"); // Reset to resume when new job
      // Poll for job completion
      const checkStatus = async () => {
        try {
          const status = await api.getJobStatus(jobId);
          if (status.status === "completed") {
            setHasResume(true);
            setIsLoading(false);
          } else if (status.status === "failed") {
            setIsLoading(false);
          }
        } catch (error) {
          console.error("Error checking job status:", error);
        }
      };

      const interval = setInterval(checkStatus, 2000);
      checkStatus();

      return () => clearInterval(interval);
    }
  }, [jobId]);

  const handleDownloadResume = () => {
    if (jobId) {
      window.open(api.getDownloadUrl(jobId), '_blank');
    }
  };

  const handleDownloadCoverLetter = () => {
    if (jobId) {
      window.open(api.getCoverLetterUrl(jobId), '_blank');
    }
  };

  const getPreviewUrl = () => {
    if (!jobId) return "";
    if (previewType === "resume") {
      return `${getApiBaseUrl()}/output/${jobId}_resume.html`;
    } else {
      return `${getApiBaseUrl()}/output/${jobId}_cover_letter.html`;
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 px-2">
        <div>
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Live Preview
          </h3>
          <p className="text-xs text-muted-foreground">Generated Resume & Cover Letter</p>
        </div>
        <div className="flex gap-2">
          {hasResume && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={handleDownloadCoverLetter}
              >
                <Download className="h-3.5 w-3.5 mr-2" />
                Cover Letter
              </Button>
              <Button
                size="sm"
                className="h-8 bg-gradient-to-r from-primary to-purple-600 hover:opacity-90 transition-opacity"
                onClick={handleDownloadResume}
              >
                <Download className="h-3.5 w-3.5 mr-2" />
                Download Resume
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Preview Type Toggle */}
      {hasResume && (
        <div className="flex gap-2 mb-3 px-2">
          <Button
            variant={previewType === "resume" ? "default" : "outline"}
            size="sm"
            onClick={() => setPreviewType("resume")}
          >
            Resume
          </Button>
          <Button
            variant={previewType === "coverLetter" ? "default" : "outline"}
            size="sm"
            onClick={() => setPreviewType("coverLetter")}
          >
            Cover Letter
          </Button>
        </div>
      )}

      <Card className="flex-1 bg-white/50 backdrop-blur-sm border-2 border-dashed border-muted-foreground/20 overflow-hidden relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-20">
            <div className="text-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
              <div>
                <p className="text-lg font-semibold">Generating Your Resume</p>
                <p className="text-sm text-muted-foreground">This may take a few minutes...</p>
              </div>
            </div>
          </div>
        )}

        {!isLoading && !hasResume && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center space-y-4 px-4">
              <FileText className="h-16 w-16 text-muted-foreground/30 mx-auto" />
              <div>
                <p className="text-lg font-semibold text-muted-foreground">No Resume Yet</p>
                <p className="text-sm text-muted-foreground">
                  Start a conversation with Aria to generate your tailored resume
                </p>
              </div>
            </div>
          </div>
        )}

        {hasResume && (
          <iframe
            src={getPreviewUrl()}
            className="w-full h-full border-0"
            title={previewType === "resume" ? "Resume Preview" : "Cover Letter Preview"}
          />
        )}
      </Card>
    </div>
  );
}
