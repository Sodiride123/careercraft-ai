import { ChatInterface } from "@/components/chat/ChatInterface";
import { MainLayout } from "@/components/layout/MainLayout";
import { ResumePreview } from "@/components/resume/ResumePreview";

interface HomeProps {
  currentJobId: string | null;
  onJobCreated: (jobId: string) => void;
}

export default function Home({ currentJobId, onJobCreated }: HomeProps) {
  return (
    <MainLayout>
      <div className="h-[calc(100vh-80px)]">
        <div className="flex flex-col lg:flex-row gap-4 h-full rounded-xl border bg-background/50 backdrop-blur-sm shadow-sm overflow-hidden">
          {/* Chat Panel */}
          <div className="flex-1 lg:w-[45%] p-4 bg-background/30">
            <ChatInterface onJobCreated={onJobCreated} />
          </div>

          {/* Divider */}
          <div className="hidden lg:block w-px bg-border" />

          {/* Preview Panel */}
          <div className="flex-1 lg:w-[55%] p-4 bg-muted/20">
            <ResumePreview jobId={currentJobId} />
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
