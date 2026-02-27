import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FileText, MessageSquare } from "lucide-react";
import { Link, useLocation } from "wouter";

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Sidebar({ className, onClick }: SidebarProps) {
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
          <div className="space-y-1" onClick={onClick}>
            <Link href="/">
              <Button
                variant={isActive("/") ? "secondary" : "ghost"}
                className="w-full justify-start"
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                Chat with Aria
              </Button>
            </Link>
            <Link href="/documents">
              <Button
                variant={isActive("/documents") ? "secondary" : "ghost"}
                className="w-full justify-start"
              >
                <FileText className="mr-2 h-4 w-4" />
                My Documents
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
