import { Sidebar } from "./Sidebar";

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="flex min-h-screen bg-background font-sans antialiased">
      <Sidebar className="hidden md:flex flex-shrink-0 fixed inset-y-0 z-50" />
      <main className="flex-1 md:pl-64 flex flex-col min-h-screen relative overflow-hidden">
        {/* Background Decorative Elements */}
        <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-primary/5 to-transparent -z-10" />
        <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-purple-500/10 blur-3xl -z-10" />

        <div className="flex-1 container px-4 md:px-6 lg:px-8 py-6 md:py-10 animate-in max-w-7xl">
          {children}
        </div>
      </main>
    </div>
  );
}