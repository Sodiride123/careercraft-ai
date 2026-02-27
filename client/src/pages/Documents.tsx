import { MainLayout } from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { Clock, Download, FileText, Loader2, Mail, Search } from "lucide-react";
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

export default function Documents() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<DocTab>("resumes");

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
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
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

  // Filter by document type based on active tab
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
          <h1 className="text-3xl font-bold tracking-tight">My Documents</h1>
          <p className="text-muted-foreground">Manage and download your generated resumes and cover letters.</p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-6 border-b">
          <button
            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
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
            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
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
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {displayItems.map((resume) => (
              <Card
                key={resume.job_id}
                className="group overflow-hidden transition-all hover:shadow-lg hover:border-primary/50"
              >
                <div className="aspect-[3/4] overflow-hidden bg-gradient-to-br from-primary/10 to-purple-600/10 relative flex items-center justify-center">
                  {activeTab === "resumes" ? (
                    <FileText className="h-24 w-24 text-primary/30" />
                  ) : (
                    <Mail className="h-24 w-24 text-primary/30" />
                  )}
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
                <CardFooter className="p-4 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-8 w-full"
                    onClick={() => activeTab === "resumes"
                      ? handleDownload(resume.job_id)
                      : handleDownloadCoverLetter(resume.job_id)
                    }
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Download {activeTab === "resumes" ? "Resume" : "Cover Letter"}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
