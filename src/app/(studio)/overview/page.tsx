import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clapperboard,
  Cpu,
  Download,
  Film,
  FolderKanban,
  Github,
  HardDrive,
  ListVideo,
  MemoryStick,
  Plus,
  Scissors,
  Send,
  Sparkles,
  Upload,
  Wrench,
} from "lucide-react";
import { PageHeader, MetricCard, Panel, StatusBadge, JobProgress, EmptyState } from "@/components/ui-kit";
import { ActivityChart } from "@/components/overview-chart";
import { OpenProjectButton } from "@/components/open-project-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getActiveProject,
  getDashboardData,
  getProjectMedia,
} from "@/lib/data";
import { getSystemStatus } from "@/lib/system";
import { detectTools } from "@/lib/tools";
import { formatBytes, relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

const quickActions = [
  { href: "/projects", label: "New project", icon: Plus, hint: "Start a production" },
  { href: "/media", label: "Upload media", icon: Upload, hint: "Footage, audio, ZIP" },
  { href: "/ai-editor", label: "AI edit", icon: Sparkles, hint: "Describe the result" },
  { href: "/github", label: "Import GitHub", icon: Github, hint: "Clone a workspace" },
  { href: "/timeline", label: "Timeline Studio", icon: Clapperboard, hint: "Manual editing" },
  { href: "/telegram", label: "Connect Telegram", icon: Send, hint: "Remote control" },
];

export default async function OverviewPage() {
  const [dashboard, system, tools, activeProject] = await Promise.all([
    getDashboardData(),
    getSystemStatus(),
    detectTools(),
    getActiveProject(),
  ]);
  const activeMedia = activeProject ? await getProjectMedia(activeProject.id) : [];
  const hasVideo = activeMedia.some((item) => item.kind === "video");
  const activeProjectSummary = dashboard.recentProjects.find(
    (item) => item.project.id === activeProject?.id,
  );
  const hasQueuedProjectJobs = Number(activeProjectSummary?.jobCount ?? 0) > 0;
  const hasProjectExport = dashboard.recentExports.some(
    ({ job }) => job.projectId === activeProject?.id,
  );
  const primaryAction = !activeProject
    ? { href: "/projects", label: "Create a project", icon: Plus }
    : hasVideo
      ? { href: "/clips", label: "Find clips", icon: Scissors }
      : { href: "/media", label: "Add a video", icon: Upload };
  const PrimaryActionIcon = primaryAction.icon;

  const coreTools = tools.filter((tool) => tool.required);
  const installedTools = tools.filter((tool) => tool.installed).length;
  const memoryPercent = Math.round(
    (system.engine.memoryUsedBytes / Math.max(1, system.engine.memoryTotalBytes)) * 100,
  );
  const diskPercent =
    system.engine.diskFreeBytes && system.engine.diskTotalBytes
      ? Math.round(
          ((system.engine.diskTotalBytes - system.engine.diskFreeBytes) /
            system.engine.diskTotalBytes) *
            100,
        )
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title="Turn videos into shareable clips"
        description="Import a video, review suggested moments, and export clips. FREMIQ handles the video processing."
        actions={
          <>
            {hasVideo ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/media">
                  <Upload className="mr-1.5 h-3.5 w-3.5" /> Add video
                </Link>
              </Button>
            ) : null}
            <Button asChild size="sm">
              <Link href={primaryAction.href}>
                <PrimaryActionIcon className="mr-1.5 h-3.5 w-3.5" /> {primaryAction.label}
              </Link>
            </Button>
          </>
        }
      />

      {activeProject?.isDemo ? (
        <div className="flex flex-col gap-2 rounded-xl border border-brand/25 bg-brand/[0.06] px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <Badge variant="outline" className="border-brand/40 bg-brand/10 text-brand-soft">
              Demo workspace
            </Badge>
            <span className="leading-relaxed">
              The seed data was generated locally with FFmpeg and rendered through the same
              queue as your own jobs. Everything you see is a real record or file.
            </span>
          </div>
          <Link href="/projects" className="shrink-0 font-medium text-brand hover:underline">
            Manage projects
          </Link>
        </div>
      ) : null}

      <Panel
        className="overflow-hidden border-brand/25 bg-[radial-gradient(ellipse_at_top_right,rgba(167,139,250,0.12),transparent_55%)]"
        title="Your next step"
        description={
          activeProject
            ? `Working in ${activeProject.name}. FREMIQ handles the media processing for you.`
            : "Create a project to keep your videos, clips and exports together."
        }
        action={
          <Button asChild size="sm">
            <Link href={primaryAction.href}>
              <PrimaryActionIcon className="h-3.5 w-3.5" /> {primaryAction.label}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        }
      >
        <div className="grid gap-2 sm:grid-cols-3">
          <WorkflowStep
            number="01"
            title={activeProject ? "Add your video" : "Create a project"}
            detail={activeProject ? "Upload a file or paste a direct video link" : "Set up a home for this edit"}
            complete={hasVideo}
          />
          <WorkflowStep
            number="02"
            title="Pick your clips"
            detail="FREMIQ finds moments, you choose what to keep"
            complete={hasQueuedProjectJobs}
          />
          <WorkflowStep
            number="03"
            title="Export and share"
            detail="Download finished videos from your queue"
            complete={hasProjectExport}
          />
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label="Projects"
          value={dashboard.counts.projects}
          detail="All productions"
          icon={FolderKanban}
        />
        <MetricCard
          label="Media items"
          value={dashboard.counts.media}
          detail="Originals untouched"
          icon={Film}
        />
        <MetricCard
          label="Completed exports"
          value={dashboard.counts.completed}
          detail={formatBytes(dashboard.counts.exportedBytes)}
          icon={CheckCircle2}
          tone="success"
        />
        <MetricCard
          label="Active jobs"
          value={dashboard.counts.active}
          detail={`${system.queue.queued} queued · ${system.queue.running} running`}
          icon={Activity}
          tone={dashboard.counts.active > 0 ? "brand" : "default"}
        />
        <MetricCard
          label="Failed jobs"
          value={dashboard.counts.failed}
          detail={dashboard.counts.failed > 0 ? "Review the queue" : "No failures"}
          icon={AlertTriangle}
          tone={dashboard.counts.failed > 0 ? "danger" : "default"}
        />
        <MetricCard
          label="Engine"
          value={system.engine.ffmpeg ? "FFmpeg ready" : "FFmpeg missing"}
          detail={system.engine.label}
          icon={Cpu}
          tone={system.engine.ffmpeg ? "brand" : "warning"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="Render activity"
          description="Jobs created over the last seven days."
          action={
            <Link href="/render-queue" className="text-[11px] text-brand hover:underline">
              Open queue
            </Link>
          }
        >
          <ActivityChart data={dashboard.daily} />
          <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-brand" /> Completed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-400" /> Failed
            </span>
            <span className="ml-auto tabular">
              {dashboard.daily.reduce((sum, day) => sum + day.total, 0)} jobs this week
            </span>
          </div>
        </Panel>

        <Panel
          title="Engine health"
          description={system.engine.label}
          action={
            <StatusBadge
              status={system.engine.mode === "local-agent" ? "connected" : "active"}
              label={system.engine.mode === "local-agent" ? "Local agent" : "Hosted"}
            />
          }
        >
          <div className="space-y-3.5">
            <ResourceBar
              label="CPU"
              value={`${system.engine.cpu}%`}
              percent={system.engine.cpu}
              icon={Cpu}
            />
            <ResourceBar
              label="Memory"
              value={`${formatBytes(system.engine.memoryUsedBytes)} / ${formatBytes(system.engine.memoryTotalBytes)}`}
              percent={memoryPercent}
              icon={MemoryStick}
            />
            <ResourceBar
              label="Disk"
              value={
                diskPercent === null
                  ? "Unavailable"
                  : `${formatBytes(system.engine.diskFreeBytes)} free`
              }
              percent={diskPercent ?? 0}
              icon={HardDrive}
            />
            <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
              <div className="rounded-md border border-border/70 bg-surface/50 p-2">
                <div className="text-muted-foreground">GPU</div>
                <div className="mt-0.5 truncate font-medium">
                  {system.engine.gpu ?? "Not detected"}
                </div>
              </div>
              <div className="rounded-md border border-border/70 bg-surface/50 p-2">
                <div className="text-muted-foreground">Host</div>
                <div className="mt-0.5 truncate font-medium">{system.engine.hostname}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <StatusBadge status={system.engine.ffmpeg ? "ok" : "missing"} label="FFmpeg" />
              <StatusBadge status={system.engine.ffprobe ? "ok" : "missing"} label="FFprobe" />
              <StatusBadge status="detected" label={system.engine.platform} />
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="Recent projects"
          action={
            <Link href="/projects" className="text-[11px] text-brand hover:underline">
              All projects
            </Link>
          }
        >
          {dashboard.recentProjects.length === 0 ? (
            <EmptyState
              variant="projects"
              title="No projects yet"
              description="Create a project to group media, timelines, captions and renders."
              action={
                <Button asChild size="sm">
                  <Link href="/projects">Create a project</Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-border/60">
              {dashboard.recentProjects.map(({ project, mediaCount, jobCount, lastJobAt }) => (
                <li key={project.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-surface-2/60">
                      <Clapperboard className="h-4 w-4 text-brand" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium">{project.name}</span>
                        {project.isDemo ? (
                          <Badge variant="outline" className="border-border/70 text-[9px] text-muted-foreground">
                            demo
                          </Badge>
                        ) : null}
                        <StatusBadge status={project.status} />
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                        {project.description || "No description"}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground/80">
                        {Number(mediaCount)} media · {Number(jobCount)} jobs ·{" "}
                        {lastJobAt ? `last render ${relativeTime(lastJobAt)}` : "no renders yet"}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 pl-12 sm:pl-0">
                    <OpenProjectButton projectId={project.id} label="AI edit" />
                    <OpenProjectButton
                      projectId={project.id}
                      href="/timeline"
                      label="Timeline"
                      variant="ghost"
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Queue" description="Live render pipeline">
          <div className="grid grid-cols-2 gap-2">
            <QueueStat label="Queued" value={system.queue.queued} />
            <QueueStat label="Running" value={system.queue.running} tone="brand" />
            <QueueStat label="Completed" value={system.queue.completed} tone="success" />
            <QueueStat label="Failed" value={system.queue.failed} tone={system.queue.failed ? "danger" : "default"} />
          </div>
          <Button asChild variant="outline" size="sm" className="mt-3 w-full">
            <Link href="/render-queue">
              <ListVideo className="mr-1.5 h-3.5 w-3.5" /> Open render queue
            </Link>
          </Button>
          <div className="mt-3 rounded-lg border border-border/70 bg-surface/50 p-2.5 text-[11px] text-muted-foreground">
            <div className="flex items-center justify-between gap-2">
              <span>Processing backend</span>
              <span className="font-medium text-foreground">
                {system.engine.mode === "local-agent" ? "Local agent" : "Hosted engine"}
              </span>
            </div>
            <p className="mt-1.5 leading-relaxed">
              {system.engine.mode === "local-agent"
                ? "Jobs run on your paired computer."
                : "Pair the Local Agent to process media on your own computer."}
            </p>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Active jobs" action={<Link href="/render-queue" className="text-[11px] text-brand hover:underline">View all</Link>}>
          {dashboard.activeJobs.length === 0 ? (
            <p className="py-4 text-xs text-muted-foreground">
              No jobs are running. Approve an AI plan or render the timeline to start one.
            </p>
          ) : (
            <ul className="space-y-3">
              {dashboard.activeJobs.map(({ job, projectName }) => (
                <li key={job.id} className="rounded-lg border border-border/70 bg-surface/40 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium">{job.name}</span>
                    <StatusBadge status={job.status} />
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{projectName}</p>
                  <div className="mt-2">
                    <JobProgress progress={job.progress} stage={job.stage} status={job.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent exports">
          {dashboard.recentExports.length === 0 ? (
            <p className="py-4 text-xs text-muted-foreground">No exports yet.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {dashboard.recentExports.map(({ job, projectName }) => (
                <li key={job.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-surface-2/60">
                    <Film className="h-3.5 w-3.5 text-brand" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{job.name}</div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {projectName} · {formatBytes(job.outputSizeBytes)} · {relativeTime(job.completedAt)}
                    </div>
                  </div>
                  <Button asChild size="icon" variant="ghost" className="h-7 w-7" aria-label="Download export">
                    <a href={`/api/jobs/${job.id}/file`}>
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Activity" action={<Link href="/projects" className="text-[11px] text-brand hover:underline">Projects</Link>}>
          {dashboard.feed.length === 0 ? (
            <p className="py-4 text-xs text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {dashboard.feed.slice(0, 6).map((item) => (
                <li key={item.id} className="flex gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand/70" />
                  <div className="min-w-0">
                    <p className="text-[11px] leading-snug">{item.message}</p>
                    <p className="text-[10px] text-muted-foreground">{relativeTime(item.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="Quick actions"
          description="Jump straight into the next step."
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className="group flex items-start gap-2.5 rounded-lg border border-border/70 bg-surface/40 p-3 transition-colors hover:border-brand/40 hover:bg-brand/[0.05]"
                >
                  <Icon className="mt-0.5 h-4 w-4 text-brand" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1 text-xs font-medium">
                      {action.label}
                      <ArrowRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">{action.hint}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </Panel>

        <Panel
          title="Dependencies"
          description={`${installedTools} of ${tools.length} detected on this host`}
          action={
            <Link href="/tools" className="text-[11px] text-brand hover:underline">
              Tool Manager
            </Link>
          }
        >
          <ul className="space-y-2">
            {coreTools.map((tool) => (
              <li key={tool.key} className="flex items-center justify-between gap-2 text-xs">
                <div className="flex min-w-0 items-center gap-2">
                  {tool.installed ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                  )}
                  <span className="truncate">{tool.name}</span>
                </div>
                <span className="max-w-[55%] truncate text-right text-[10px] text-muted-foreground">
                  {tool.version ?? "Not installed"}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center gap-2 rounded-md border border-border/70 bg-surface/40 px-2.5 py-2 text-[10px] text-muted-foreground">
            <Wrench className="h-3.5 w-3.5" />
            Install optional modules from your local agent.
          </div>
        </Panel>
      </div>
    </div>
  );
}

function WorkflowStep({
  number,
  title,
  detail,
  complete,
}: {
  number: string;
  title: string;
  detail: string;
  complete: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-background/35 p-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-surface/70 text-[10px] font-medium text-brand">
        {complete ? <CheckCircle2 className="h-3.5 w-3.5" /> : number}
      </div>
      <div className="min-w-0">
        <div className="text-xs font-medium">{title}</div>
        <div className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

function ResourceBar({
  label,
  value,
  percent,
  icon: Icon,
}: {
  label: string;
  value: string;
  percent: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Icon className="h-3 w-3" /> {label}
        </span>
        <span className="tabular text-foreground">{value}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-brand/80"
          style={{ width: `${Math.max(2, Math.min(100, percent))}%` }}
        />
      </div>
    </div>
  );
}

function QueueStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "brand" | "success" | "danger";
}) {
  const toneClass = {
    default: "text-foreground",
    brand: "text-brand",
    success: "text-emerald-400",
    danger: "text-red-400",
  }[tone];
  return (
    <div className="rounded-lg border border-border/70 bg-surface/40 p-2.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular ${toneClass}`}>{value}</div>
    </div>
  );
}
