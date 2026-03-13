import { MainLayout } from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { Clock, Download, Eye, FileText, Loader2, Mail, Search, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

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

type DocTab = "resumes" | "cover-letters";

interface PreviewState {
  open: boolean;
  url: string;
  title: string;
  jobId: string;
  type: "resume" | "cover-letter";
}

export default function Documents() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<DocTab>("resumes");
  const [preview, setPreview] = useState<PreviewState>({
    open: false, url: "", title: "", jobId: "", type: "resume",
  });

  useEffect(() => {
    loadResumes();
  }, []);

  const loadResumes = async () => {
    try {
      setIsLoading(true);
      const data = await api.getResumes();
      setResumes(data.resumes);
    } catch (error) {
      console.error("Error loading resumes:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    // Append 'Z' if no timezone info — backend stores UTC via datetime.utcnow()
    const normalized = dateString.endsWith('Z') || dateString.includes('+') || dateString.includes('T') && dateString.match(/[+-]\d{2}:\d{2}$/)
      ? dateString
      : dateString + 'Z';
    const date = new Date(normalized);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    // Handle clock skew / future timestamps
    if (diffMs < 0) {
      return 'Just now';
    }

    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) {
      return 'Just now';
    } else if (diffMins < 60) {
      return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const getResumeTitle = (resume: Resume) => {
    if (resume.candidate_name) {
      return resume.candidate_name;
    }
    if (resume.linkedin_url) {
      const linkedinMatch = resume.linkedin_url.match(/\/in\/([^\/]+)/);
      const name = linkedinMatch ? linkedinMatch[1].replace(/-/g, ' ') : `Resume ${resume.job_id}`;
      return name.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }
    return `Document ${resume.job_id}`;
  };

  const getResumeSubtitle = (resume: Resume) => {
    const parts = [];
    if (resume.job_title) parts.push(resume.job_title);
    if (resume.company_name) parts.push(resume.company_name);

    if (parts.length > 0) {
      return parts.join(' at ');
    }

    if (resume.job_ad_url) {
      try {
        const url = new URL(resume.job_ad_url);
        return url.hostname.replace('www.', '');
      } catch {
        return 'Job Application';
      }
    }

    return 'Job Application';
  };

  const filteredResumes = resumes.filter(resume => {
    if (!searchQuery) return true;
    const title = getResumeTitle(resume).toLowerCase();
    const subtitle = getResumeSubtitle(resume).toLowerCase();
    const query = searchQuery.toLowerCase();
    return title.includes(query) || subtitle.includes(query);
  });

  const displayItems = filteredResumes.filter(resume => {
    if (activeTab === "resumes") return resume.pdf_path != null;
    return resume.cover_letter_path != null;
  });

  const handleDownload = (jobId: string) => {
    window.open(api.getDownloadUrl(jobId), '_blank');
  };

  const handleDownloadCoverLetter = (jobId: string) => {
    window.open(api.getCoverLetterUrl(jobId), '_blank');
  };

  const handleDelete = async (jobId: string, title: string) => {
    if (!confirm(`Delete "${title}"? This will remove both the resume and cover letter permanently.`)) {
      return;
    }
    try {
      await api.deleteResume(jobId);
      setResumes(prev => prev.filter(r => r.job_id !== jobId));
      // Close preview if it was showing the deleted document
      if (preview.open && preview.jobId === jobId) {
        closePreview();
      }
    } catch (error) {
      console.error("Error deleting document:", error);
      alert("Failed to delete document. Please try again.");
    }
  };

  const handlePreview = (resume: Resume) => {
    const isResume = activeTab === "resumes";
    setPreview({
      open: true,
      url: isResume
        ? api.getResumePreviewUrl(resume.job_id)
        : api.getCoverLetterPreviewUrl(resume.job_id),
      title: `${getResumeTitle(resume)} — ${isResume ? "Resume" : "Cover Letter"}`,
      jobId: resume.job_id,
      type: isResume ? "resume" : "cover-letter",
    });
  };

  const closePreview = () => {
    setPreview(prev => ({ ...prev, open: false }));
  };

  const resumeCount = filteredResumes.filter(r => r.pdf_path != null).length;
  const coverLetterCount = filteredResumes.filter(r => r.cover_letter_path != null).length;

  const emptyMessage = activeTab === "resumes"
    ? "No resumes yet"
    : "No cover letters yet";
  const emptyDescription = searchQuery
    ? "Try a different search term"
    : "Start a conversation with Aria to generate your first documents";

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">My Documents</h1>
          <p className="text-sm text-muted-foreground">Manage and download your generated resumes and cover letters.</p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-6 border-b overflow-x-auto">
          <button
            className={`pb-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
              activeTab === "resumes"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("resumes")}
          >
            <FileText className="inline-block mr-1.5 h-4 w-4" />
            Resumes
            {resumeCount > 0 && (
              <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">
                {resumeCount}
              </Badge>
            )}
          </button>
          <button
            className={`pb-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
              activeTab === "cover-letters"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("cover-letters")}
          >
            <Mail className="inline-block mr-1.5 h-4 w-4" />
            Cover Letters
            {coverLetterCount > 0 && (
              <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">
                {coverLetterCount}
              </Badge>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder={`Search ${activeTab === "resumes" ? "resumes" : "cover letters"}...`}
              className="pl-9 bg-background/50"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
              <p className="text-muted-foreground">Loading your documents...</p>
            </div>
          </div>
        ) : displayItems.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center space-y-4">
              {activeTab === "resumes" ? (
                <FileText className="h-16 w-16 text-muted-foreground/30 mx-auto" />
              ) : (
                <Mail className="h-16 w-16 text-muted-foreground/30 mx-auto" />
              )}
              <div>
                <p className="text-lg font-semibold text-muted-foreground">
                  {searchQuery ? 'No results found' : emptyMessage}
                </p>
                <p className="text-sm text-muted-foreground">
                  {emptyDescription}
                </p>
              </div>
              {!searchQuery && (
                <Button
                  className="bg-gradient-to-r from-primary to-purple-600"
                  onClick={() => window.location.href = '/'}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Chat with Aria
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {displayItems.map((resume) => (
              <Card
                key={resume.job_id}
                className="group overflow-hidden transition-all hover:shadow-lg hover:border-primary/50"
              >
                {/* Clickable preview area */}
                <div
                  className="aspect-[3/4] overflow-hidden bg-gradient-to-br from-primary/10 to-purple-600/10 relative flex items-center justify-center cursor-pointer"
                  onClick={() => handlePreview(resume)}
                >
                  {activeTab === "resumes" ? (
                    <FileText className="h-24 w-24 text-primary/30" />
                  ) : (
                    <Mail className="h-24 w-24 text-primary/30" />
                  )}
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="bg-white/90 rounded-full p-3">
                      <Eye className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                  <Badge className="absolute top-2 right-2 bg-background/80 text-foreground backdrop-blur-sm hover:bg-background/90">
                    {activeTab === "resumes" ? "Resume" : "Cover Letter"}
                  </Badge>
                </div>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-base line-clamp-1" title={getResumeTitle(resume)}>
                    {getResumeTitle(resume)}
                  </CardTitle>
                  <CardDescription className="text-xs space-y-1">
                    <div className="line-clamp-1" title={getResumeSubtitle(resume)}>
                      {getResumeSubtitle(resume)}
                    </div>
                    <div className="flex items-center text-muted-foreground">
                      <Clock className="mr-1 h-3 w-3" />
                      {formatDate(resume.created_at)}
                    </div>
                  </CardDescription>
                </CardHeader>
                <CardFooter className="p-4 pt-2 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-8 flex-1"
                    onClick={() => handlePreview(resume)}
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    View
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-8 flex-1"
                    onClick={() => activeTab === "resumes"
                      ? handleDownload(resume.job_id)
                      : handleDownloadCoverLetter(resume.job_id)
                    }
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Download
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-8 w-8 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30"
                    onClick={() => handleDelete(resume.job_id, getResumeTitle(resume))}
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {preview.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closePreview}
          />

          {/* Modal */}
          <div className="relative w-full max-w-4xl h-[90vh] mx-4 bg-background rounded-xl shadow-2xl border overflow-hidden flex flex-col z-10">
            {/* Modal header */}
            <div className="flex items-center justify-between p-4 border-b bg-card">
              <div className="min-w-0 flex-1 mr-4">
                <h3 className="font-semibold text-sm truncate">{preview.title}</h3>
                <p className="text-xs text-muted-foreground">
                  {preview.type === "resume" ? "Resume" : "Cover Letter"} Preview
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => preview.type === "resume"
                    ? handleDownload(preview.jobId)
                    : handleDownloadCoverLetter(preview.jobId)
                  }
                >
                  <Download className="h-3 w-3 mr-1" />
                  Download
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={closePreview}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Iframe preview */}
            <div className="flex-1 bg-white">
              <iframe
                src={preview.url}
                className="w-full h-full border-0"
                title="Document Preview"
              />
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
