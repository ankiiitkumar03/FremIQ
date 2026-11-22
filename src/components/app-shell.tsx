"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  ChevronDown,
  CircleUser,
  Clapperboard,
  Cpu,
  Loader2,
  Settings,
  Sparkles,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BrandMark } from "@/components/brand/logo";
import { navGroups, navItems, navItemFor } from "@/lib/nav";
import { apiFetch, postJson } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/format";
import type { ActivityItem, SystemStatus } from "@/lib/types";

export type ShellProject = { id: string; name: string; isDemo: boolean };

export function useSystemStatus(intervalMs = 15000) {
  const [status, setStatus] = React.useState<SystemStatus | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    try {
      const data = await apiFetch<SystemStatus>("/api/system/status");
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const data = await apiFetch<SystemStatus>("/api/system/status");
        if (!cancelled) {
          setStatus(data);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Status unavailable");
          setLoading(false);
        }
      }
    };
    void load();
    const timer = setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [intervalMs]);

  return { status, loading, error, refresh };
}

function ProjectSwitcher({
  projects,
  activeProjectId,
}: {
  projects: ShellProject[];
  activeProjectId: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const active = projects.find((project) => project.id === activeProjectId);

  if (projects.length === 0) {
    return (
      <Button asChild variant="outline" size="sm" className="h-8">
        <Link href="/projects">Create a project</Link>
      </Button>
    );
  }

  return (
    <Select
      value={activeProjectId ?? projects[0]?.id}
      onValueChange={async (value) => {
        setPending(true);
        try {
          await postJson("/api/active-project", { projectId: value });
          router.refresh();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not switch project");
        } finally {
          setPending(false);
        }
      }}
      disabled={pending}
    >
      <SelectTrigger
        className="h-8 w-[190px] gap-2 border-border/80 bg-surface/60 text-xs sm:w-[230px]"
        aria-label="Active project"
      >
        <Clapperboard className="h-3.5 w-3.5 text-brand" />
        <SelectValue placeholder="Active project">
          {active?.name ?? "Select project"}
        </SelectValue>
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      </SelectTrigger>
      <SelectContent>
        {projects.map((project) => (
          <SelectItem key={project.id} value={project.id}>
            {project.name}
            {project.isDemo ? " · demo" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Notifications() {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<ActivityItem[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ activity: ActivityItem[] }>("/api/activity?limit=10");
      setItems(data.activity);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load activity");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) void load();
  }, [open, load]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {items && items.length > 0 ? (
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-brand" />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border/70 px-3 py-2.5">
          <div className="text-xs font-medium">Workspace activity</div>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={load}>
            Refresh
          </Button>
        </div>
        <ScrollArea className="max-h-80">
          {loading && !items ? (
            <div className="flex items-center gap-2 px-3 py-6 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading activity…
            </div>
          ) : error ? (
            <div className="px-3 py-6 text-xs text-red-400">{error}</div>
          ) : items && items.length > 0 ? (
            <ul className="divide-y divide-border/60">
              {items.map((item) => (
                <li key={item.id} className="px-3 py-2.5">
                  <p className="text-xs leading-snug">{item.message}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {relativeTime(item.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-3 py-6 text-xs text-muted-foreground">
              Nothing yet. Create a project or upload media to get started.
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function AppSidebar() {
  const pathname = usePathname();
  const { status } = useSystemStatus(30000);
  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border/70 px-3 py-3">
        <Link href="/overview" className="flex items-center gap-2 overflow-hidden">
          <BrandMark size={28} />
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="text-[13px] font-semibold leading-none tracking-[0.24em]">
              FREMIQ
            </div>
            <div className="mt-1 truncate text-[9px] text-muted-foreground">
              The intelligence behind every frame.
            </div>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent className="px-1 py-2">
        {navGroups.map((group) => (
          <SidebarGroup key={group}>
            <SidebarGroupLabel className="px-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
              {group}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems
                  .filter((item) => item.group === group)
                  .map((item) => {
                    const active =
                      pathname === item.href || pathname.startsWith(`${item.href}/`);
                    const Icon = item.icon;
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          tooltip={item.label}
                          className={cn(
                            "h-9 text-[13px]",
                            active &&
                              "bg-sidebar-accent text-foreground shadow-[inset_2px_0_0_0_var(--brand)]",
                          )}
                        >
                          <Link href={item.href}>
                            <Icon className={cn("h-4 w-4", active && "text-brand")} />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border/70 p-2">
        <Link
          href="/local-agent"
          className="flex items-center gap-2 rounded-md px-2 py-2 text-[11px] text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        >
          <span
            className={cn(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              status?.agent.connected ? "bg-emerald-400" : "bg-amber-400",
            )}
          />
          <span className="min-w-0 flex-1 truncate group-data-[collapsible=icon]:hidden">
            {status?.engine.label ?? "Checking engine…"}
          </span>
          <span className="hidden text-[10px] tabular text-muted-foreground/60 group-data-[collapsible=icon]:hidden">
            v1.0
          </span>
        </Link>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function Topbar({
  projects,
  activeProjectId,
}: {
  projects: ShellProject[];
  activeProjectId: string | null;
}) {
  const pathname = usePathname();
  const nav = navItemFor(pathname);
  const { status } = useSystemStatus(12000);
  const running = (status?.queue.running ?? 0) + (status?.queue.queued ?? 0);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border/70 bg-background/80 px-3 backdrop-blur-xl sm:px-5">
      <SidebarTrigger className="-ml-1 h-8 w-8" />
      <div className="hidden h-4 w-px bg-border sm:block" />
      <ProjectSwitcher projects={projects} activeProjectId={activeProjectId} />
      <div className="hidden min-w-0 flex-1 items-center gap-2 pl-2 md:flex">
        <span className="truncate text-xs text-muted-foreground">{nav?.description}</span>
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <Link
          href="/local-agent"
          className="hidden items-center gap-1.5 rounded-full border border-border/70 bg-surface/50 px-2.5 py-1 text-[10px] text-muted-foreground hover:text-foreground sm:flex"
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              status?.agent.connected ? "bg-emerald-400" : "bg-amber-400",
            )}
          />
          {status?.agent.connected ? "Local agent" : "Hosted engine"}
        </Link>
        <Link
          href="/render-queue"
          className="flex items-center gap-1.5 rounded-full border border-border/70 bg-surface/50 px-2.5 py-1 text-[10px] text-muted-foreground hover:text-foreground"
        >
          {status?.queue.running ? (
            <Loader2 className="h-3 w-3 animate-spin text-brand" />
          ) : (
            <Zap className="h-3 w-3" />
          )}
          <span className="tabular">{running}</span>
          <span className="hidden sm:inline">in queue</span>
        </Link>
        <Notifications />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Account menu">
              <CircleUser className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-xs">
              Local-first workspace
              <div className="mt-1 font-normal text-[10px] text-muted-foreground">
                {status?.engine.hostname ?? "FREMIQ"} · v1.0.0
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings className="mr-2 h-3.5 w-3.5" /> Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/local-agent">
                <Cpu className="mr-2 h-3.5 w-3.5" /> Local Agent
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/ai-editor">
                <Sparkles className="mr-2 h-3.5 w-3.5" /> AI Editor
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/overview">
                <ChevronDown className="mr-2 h-3.5 w-3.5" /> Back to overview
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

export function AppShell({
  projects,
  activeProjectId,
  children,
}: {
  projects: ShellProject[];
  activeProjectId: string | null;
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider defaultOpen>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <Topbar projects={projects} activeProjectId={activeProjectId} />
        <main className="min-w-0 flex-1 px-4 pb-16 pt-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1400px] animate-rise">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
