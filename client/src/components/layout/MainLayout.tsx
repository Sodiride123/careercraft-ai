import { Sidebar } from "./Sidebar";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { useState } from "react";

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background font-sans antialiased">
      {/* Mobile header */}
      <div className="fixed top-0 left-0 right-0 h-14 border-b bg-background/95 backdrop-blur-sm z-40 flex md:hidden items-center px-4 gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => setSidebarOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-white text-xs font-bold">
            CC
          </div>
          <span className="font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-600">
            CareerCraft
          </span>
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — desktop: fixed, mobile: slide-in drawer */}
      <div
        className={`
          fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-in-out
          md:translate-x-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Mobile close button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-3 right-3 h-8 w-8 md:hidden z-10"
          onClick={() => setSidebarOpen(false)}
        >
          <X className="h-4 w-4" />
        </Button>
        <Sidebar onClick={() => setSidebarOpen(false)} />
      </div>

      <main className="flex-1 md:pl-64 flex flex-col min-h-screen relative overflow-hidden pt-14 md:pt-0">
        {/* Background Decorative Elements */}
        <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-primary/5 to-transparent -z-10" />
        <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-purple-500/10 blur-3xl -z-10" />

        <div className="flex-1 container px-3 md:px-6 lg:px-8 py-4 md:py-10 animate-in max-w-7xl">
          {children}
        </div>
      </main>
    </div>
  );
}
