"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Mail,
  Brain,
  MessageSquare,
  CheckSquare,
  Calendar,
  Database,
  Settings,
  Bot,
  Video,
  Users,
  PanelLeft,
  Sun,
  Moon,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const mainItems = [
  { title: "Pulpit", url: "/overview", icon: LayoutDashboard },
  { title: "E-mail", url: "/mailbox", icon: Mail },
  { title: "Cerebro", url: "/cerebro", icon: Brain },
  { title: "Agent AI", url: "/copilot", icon: MessageSquare },
];

const workItems = [
  { title: "Zadania", url: "/tasks", icon: CheckSquare },
  { title: "Kalendarz", url: "/schedule", icon: Calendar },
];

const systemItems = [
  { title: "Wiedza", url: "/knowledge", icon: Database },
  { title: "Spotkania", url: "/meetings", icon: Users },
  { title: "Nagrywaj", url: "/record", icon: Video },
  { title: "Operacje", url: "/operations", icon: Settings },
];

type NavGroup = {
  label: string;
  items: { title: string; url: string; icon: React.ElementType }[];
};

const navGroups: NavGroup[] = [
  { label: "Main", items: mainItems },
  { label: "Work", items: workItems },
  { label: "System", items: systemItems },
];

type AppShellProps = {
  children: React.ReactNode;
  coveredDays: string;
  creditsLabel: string;
  latestCoverageDay: string;
};

export function AppShell({
  children,
  coveredDays,
  creditsLabel,
  latestCoverageDay,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(true);
  const pathname = usePathname();

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
  };

  return (
    <div className="min-h-screen flex w-full bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col shrink-0 border-r border-sidebar-border bg-sidebar transition-all duration-200",
          collapsed ? "w-12" : "w-56",
        )}
      >
        {/* Header */}
        <div className="p-3 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4 text-primary-foreground" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-sm font-bold text-sidebar-foreground truncate">OjeAI</p>
                <p className="text-xs text-sidebar-foreground/50 truncate">Work Assistant</p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto py-2">
          {navGroups.map((group) => (
            <div key={group.label} className="mb-2">
              {!collapsed && (
                <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                  {group.label}
                </p>
              )}
              {group.items.map((item) => {
                const active = pathname === item.url || pathname.startsWith(item.url + "/");
                return (
                  <Link
                    key={item.url}
                    href={item.url}
                    title={collapsed ? item.title : undefined}
                    className={cn(
                      "flex items-center gap-3 mx-2 px-2 py-2 rounded-md text-sm transition-colors",
                      active
                        ? "bg-sidebar-accent text-sidebar-primary font-medium"
                        : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="truncate">{item.title}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-sidebar-border">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-success animate-pulse-glow shrink-0" />
              <span className="text-xs text-sidebar-foreground/50 truncate">API Connected</span>
            </div>
          )}
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-14 flex items-center border-b border-border px-4 bg-card/50 backdrop-blur-sm sticky top-0 z-10 gap-3">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors shrink-0"
            aria-label="Toggle sidebar"
          >
            <PanelLeft className="h-4 w-4" />
          </button>

          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground truncate">
              Ostatni mail: <span className="text-foreground font-medium">{latestCoverageDay}</span>
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:inline text-xs text-muted-foreground bg-secondary px-2 py-1 rounded">
              {coveredDays} dni
            </span>
            <span className="hidden sm:inline text-xs text-muted-foreground bg-secondary px-2 py-1 rounded">
              {creditsLabel}
            </span>
            <button
              className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
            </button>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleDark}
              className="h-8 w-8"
              aria-label="Toggle theme"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground shrink-0">
              DA
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
