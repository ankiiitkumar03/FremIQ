import {
  AudioLines,
  Bot,
  Captions,
  Clapperboard,
  FolderKanban,
  Github,
  LayoutDashboard,
  ListVideo,
  MonitorSmartphone,
  Scissors,
  Send,
  Settings,
  Sparkles,
  Wand2,
  Film,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  group: "Create" | "Studio" | "Automate" | "System";
  description: string;
};

export const navItems: NavItem[] = [
  {
    href: "/overview",
    label: "Overview",
    icon: LayoutDashboard,
    group: "Create",
    description: "Workspace health and recent activity",
  },
  {
    href: "/ai-editor",
    label: "AI Editor",
    icon: Sparkles,
    group: "Create",
    description: "Describe the edit, review the plan",
  },
  {
    href: "/projects",
    label: "Projects",
    icon: FolderKanban,
    group: "Create",
    description: "Every production in one place",
  },
  {
    href: "/media",
    label: "Media Library",
    icon: Film,
    group: "Create",
    description: "Footage, audio and images",
  },
  {
    href: "/timeline",
    label: "Timeline Studio",
    icon: Clapperboard,
    group: "Studio",
    description: "Multi-track editing",
  },
  {
    href: "/clips",
    label: "Clip Generator",
    icon: Scissors,
    group: "Studio",
    description: "Find and review video highlights",
  },
  {
    href: "/subtitles",
    label: "Subtitle Studio",
    icon: Captions,
    group: "Studio",
    description: "Captions and word timing",
  },
  {
    href: "/motion",
    label: "Motion Studio",
    icon: Wand2,
    group: "Studio",
    description: "Titles, lower thirds and motion",
  },
  {
    href: "/audio",
    label: "Audio Studio",
    icon: AudioLines,
    group: "Studio",
    description: "Clean, mix and normalise audio",
  },
  {
    href: "/github",
    label: "GitHub Projects",
    icon: Github,
    group: "Automate",
    description: "Import repositories and workspaces",
  },
  {
    href: "/agents",
    label: "AI Agents",
    icon: Bot,
    group: "Automate",
    description: "Detect and connect coding agents",
  },
  {
    href: "/telegram",
    label: "Telegram",
    icon: Send,
    group: "Automate",
    description: "Remote control from your phone",
  },
  {
    href: "/render-queue",
    label: "Render Queue",
    icon: ListVideo,
    group: "System",
    description: "Live jobs, progress and exports",
  },
  {
    href: "/tools",
    label: "Tool Manager",
    icon: Wrench,
    group: "System",
    description: "Dependencies and health checks",
  },
  {
    href: "/local-agent",
    label: "Local Agent",
    icon: MonitorSmartphone,
    group: "System",
    description: "Connect your own computer",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    group: "System",
    description: "Workspace, video and security",
  },
];

export const navGroups = ["Create", "Studio", "Automate", "System"] as const;

export function navItemFor(pathname: string): NavItem | undefined {
  return navItems.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}
