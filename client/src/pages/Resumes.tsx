import { MainLayout } from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { Clock, Download, Eye, FileText, Loader2, Search } from "lucide-react";
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

export default function Resumes() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

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
    // Use candidate name if available, otherwise extract from LinkedIn URL
    if (resume.candidate_name) {
      return resume.candidate_name;
    }
    
    const linkedinMatch = resume.linkedin_url.match(/\/in\/([^\/]+)/);
    const name = linkedinMatch ? linkedinMatch[1].replace(/-/g, ' ') : `Resume ${resume.job_id}`;
    return name.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const getResumeSubtitle = (resume: Resume) => {
    // Create subtitle from job title and company
    const parts = [];
    if (resume.job_title) parts.push(resume.job_title);
    if (resume.company_name) parts.push(resume.company_name);
    
    if (parts.length > 0) {
      return parts.join(' at ');
    }
    
    // Fallback to job URL or generic text
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
    const url = resume.linkedin_url.toLowerCase();
    return title.includes(searchQuery.toLowerCase()) || url.includes(searchQuery.toLowerCase());
  });

  const handleDownload = (jobId: string) => {
    window.open(api.getDownloadUrl(jobId), '_blank');
  };

  const handleDownloadCoverLetter = (jobId: string) => {
    window.open(api.getCoverLetterUrl(jobId), '_blank');
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Resumes</h1>
          <p className="text-muted-foreground">Manage and download your generated documents.</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search resumes..."
              className="pl-9 bg-background/50"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {resumes.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {filteredResumes.length} of {resumes.length} resume{resumes.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
              <p className="text-muted-foreground">Loading your resumes...</p>
            </div>
          </div>
        ) : filteredResumes.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center space-y-4">
              <FileText className="h-16 w-16 text-muted-foreground/30 mx-auto" />
              <div>
                <p className="text-lg font-semibold text-muted-foreground">
                  {searchQuery ? 'No resumes found' : 'No resumes yet'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {searchQuery 
                    ? 'Try a different search term' 
                    : 'Start a conversation with Aria to generate your first resume'}
                </p>
              </div>
              {!searchQuery && (
                <Button 
                  className="bg-gradient-to-r from-primary to-purple-600"
                  onClick={() => window.location.href = '/'}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Create Your First Resume
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredResumes.map((resume) => (
              <Card 
                key={resume.job_id} 
                className="group overflow-hidden transition-all hover:shadow-lg hover:border-primary/50"
              >
                <div className="aspect-[3/4] overflow-hidden bg-gradient-to-br from-primary/10 to-purple-600/10 relative flex items-center justify-center">
                  <FileText className="h-24 w-24 text-primary/30" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <Button 
                      size="icon" 
                      variant="secondary" 
                      className="rounded-full"
                      onClick={() => handleDownload(resume.job_id)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button 
                      size="icon" 
                      variant="secondary" 
                      className="rounded-full"
                      onClick={() => handleDownload(resume.job_id)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                  <Badge className="absolute top-2 right-2 bg-background/80 text-foreground backdrop-blur-sm hover:bg-background/90">
                    Ready
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
                <CardFooter className="p-4 pt-2 flex justify-between gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="text-xs h-8 flex-1"
                    onClick={() => handleDownload(resume.job_id)}
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Resume
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="text-xs h-8 flex-1"
                    onClick={() => handleDownloadCoverLetter(resume.job_id)}
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Cover Letter
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