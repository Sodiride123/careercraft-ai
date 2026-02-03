import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { FileText, LayoutDashboard, MessageSquare, Settings, Zap } from "lucide-react";
import { Link, useLocation } from "wouter";

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Sidebar({ className }: SidebarProps) {
  const [location] = useLocation();

  const isActive = (path: string) => location === path;

  return (
    <div className={cn("pb-12 w-64 border-r bg-sidebar h-screen flex flex-col", className)}>
      <div className="space-y-4 py-4 flex-1">
        {/* Logo Section */}
        <div className="px-3 py-2">
          <div className="flex items-center gap-2 px-4 mb-6">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-white font-bold shadow-lg shadow-primary/20">
              CC
            </div>
            <h2 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-600">
              CareerCraft
            </h2>
          </div>

          {/* Navigation Items */}
          <div className="space-y-1">
            <Link href="/">
              <Button 
                variant={isActive("/") ? "secondary" : "ghost"} 
                className="w-full justify-start"
              >
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Dashboard
              </Button>
            </Link>
            <Link href="/chat">
              <Button 
                variant={isActive("/chat") ? "secondary" : "ghost"} 
                className="w-full justify-start"
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                Chat with Aria
              </Button>
            </Link>
            <Link href="/resumes">
              <Button 
                variant={isActive("/resumes") ? "secondary" : "ghost"} 
                className="w-full justify-start"
              >
                <FileText className="mr-2 h-4 w-4" />
                My Resumes
              </Button>
            </Link>
          </div>
        </div>

        <Separator className="mx-4 w-auto opacity-50" />

        {/* System Section */}
        <div className="px-3 py-2">
          <h3 className="mb-2 px-4 text-xs font-semibold text-muted-foreground tracking-wider uppercase">
            System
          </h3>
          <div className="space-y-1">
            <a href="https://000m6.app.super.betamyninja.ai" target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" className="w-full justify-start">
                <Zap className="mr-2 h-4 w-4 text-yellow-500" />
                Token Usage
              </Button>
            </a>
            <Link href="/settings">
              <Button 
                variant={isActive("/settings") ? "secondary" : "ghost"} 
                className="w-full justify-start"
              >
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Aria Profile Card */}
      <div className="p-4 mt-auto">
        <div className="bg-sidebar-accent/50 rounded-xl p-4 border border-sidebar-border backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-3">
            <Avatar className="h-10 w-10 border-2 border-white shadow-sm">
              <AvatarImage src="/aria-avatar.png" alt="Aria" />
              <AvatarFallback>AC</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium">Aria Craftwell</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <span className="block h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                Online
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground italic">
            "Ready to craft your next opportunity?"
          </p>
        </div>
      </div>
    </div>
  );
}