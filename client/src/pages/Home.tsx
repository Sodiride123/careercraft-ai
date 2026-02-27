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
      <div className="h-[calc(100vh-5rem)] md:h-[calc(100vh-5rem)]">
        <div className="flex flex-col lg:flex-row gap-4 h-full rounded-xl border bg-background/50 backdrop-blur-sm shadow-sm overflow-hidden">
          {/* Chat Panel — full width on mobile, 45% on large */}
          <div className="flex-1 min-h-0 lg:w-[45%] p-2 md:p-4 bg-background/30">
            <ChatInterface onJobCreated={onJobCreated} />
          </div>

          {/* Divider — desktop only */}
          <div className="hidden lg:block w-px bg-border" />

          {/* Preview Panel — hidden on mobile/tablet, visible on large */}
          <div className="hidden lg:block flex-1 lg:w-[55%] p-4 bg-muted/20">
            <ResumePreview jobId={currentJobId} />
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
