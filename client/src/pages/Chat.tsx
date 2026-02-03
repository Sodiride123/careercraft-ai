import { ChatInterface } from "@/components/chat/ChatInterface";
import { MainLayout } from "@/components/layout/MainLayout";

export default function Chat() {
  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto h-[calc(100vh-80px)]">
        <ChatInterface />
      </div>
    </MainLayout>
  );
}