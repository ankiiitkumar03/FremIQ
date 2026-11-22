"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Film,
  ListVideo,
  Loader2,
  Play,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, JobProgress, MetricCard, StatusBadge } from "@/components/ui-kit";
import { apiFetch, deleteJson, postJson } from "@/lib/client-api";
import { formatBytes, formatDateTime, relativeTime } from "@/lib/format";

export type JobRow = {
  id: string;
  projectName: string;
  name: string;
  type: string;
  status: string;
  stage: string;
  progress: number;
  priority: number;
  source: string;
  error: string | null;
  logs: string;
  outputSizeBytes: number | null;
  createdAt: string;
  completedAt: string | null;
};

const filters = ["all", "active", "completed", "failed", "cancelled"] as const;
const activeStatuses = ["queued", "preparing", "analyzing", "processing", "rendering"];

export function QueueClient({ initialJobs }: { initialJobs: JobRow[] }) {
  const router = useRouter();
  const [jobs, setJobs] = React.useState(initialJobs);
  const [filter, setFilter] = React.useState<(typeof filters)[number]>("all");
  const [pending, setPending] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<JobRow | null>(null);

  const refresh = React.useCallback(async (silent = true) => {
    try {
      const data = await apiFetch<{ jobs: Array<{ job: JobRow; projectName: string }> }>(
        "/api/jobs?limit=100",
      );
      setJobs(
        data.jobs.map((row) => ({
          ...row.job,
          projectName: row.projectName,
          createdAt: String(row.job.createdAt),
          completedAt: row.job.completedAt ? String(row.job.completedAt) : null,
        })),
      );
      if (!silent) toast.success("Queue refreshed");
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "Could not load jobs");
    }
  }, []);

  React.useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  const counts = {
    active: jobs.filter((job) => activeStatuses.includes(job.status)).length,
    completed: jobs.filter((job) => job.status === "completed").length,
    failed: jobs.filter((job) => job.status === "failed").length,
    queued: jobs.filter((job) => job.status === "queued").length,
  };

  const visible = jobs.filter((job) => {
    if (filter === "all") return true;
    if (filter === "active") return activeStatuses.includes(job.status);
    return job.status === filter;
  });

  async function act(job: JobRow, action: "cancel" | "retry" | "delete") {
    setPending(job.id);
    try {
      if (action === "delete") await deleteJson(`/api/jobs/${job.id}`);
      else await postJson(`/api/jobs/${job.id}/${action}`, {});
      toast.success(
        action === "cancel" ? "Job cancelled" : action === "retry" ? "Job requeued" : "Job removed",
      );
      if (selected?.id === job.id) setSelected(null);
      await refresh();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Active" value={counts.active} detail={`${counts.queued} queued`} icon={Loader2} tone="brand" />
        <MetricCard label="Completed" value={counts.completed} detail="Ready to download" icon={CheckCircle2} tone="success" />
        <MetricCard label="Failed" value={counts.failed} detail={counts.failed ? "Review and retry" : "No failures"} icon={AlertTriangle} tone={counts.failed ? "danger" : "default"} />
        <MetricCard label="Total jobs" value={jobs.length} detail="This workspace" icon={ListVideo} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
          <TabsList className="h-9">
            {filters.map((value) => (
              <TabsTrigger key={value} value={value} className="px-3 text-[11px] capitalize">
                {value}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button variant="outline" size="sm" onClick={() => refresh(false)}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          variant="jobs"
          title={jobs.length === 0 ? "The queue is empty" : "No jobs in this view"}
          description={
            jobs.length === 0
              ? "Approve an AI plan, render a timeline or export a clip and the job will appear here with live progress."
              : "Switch tabs to see jobs in other states."
          }
        />
      ) : (
        <div className="space-y-2">
          {visible.map((job) => {
            const isActive = activeStatuses.includes(job.status);
            return (
              <Card key={job.id} className="border-border/80 bg-card/60 hairline">
                <CardContent className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-surface-2/60">
                      {isActive ? (
                        <Loader2 className="h-4 w-4 animate-spin text-brand" />
                      ) : job.status === "completed" ? (
                        <Film className="h-4 w-4 text-emerald-400" />
                      ) : job.status === "failed" ? (
                        <AlertTriangle className="h-4 w-4 text-red-400" />
                      ) : (
                        <ListVideo className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          className="truncate text-left text-sm font-medium hover:text-brand"
                          onClick={() => setSelected(job)}
                        >
                          {job.name}
                        </button>
                        <StatusBadge status={job.status} />
                        <Badge variant="outline" className="border-border/70 text-[9px] uppercase text-muted-foreground">
                          {job.type}
                        </Badge>
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {job.projectName} · {job.source} · {relativeTime(job.createdAt)}
                        {job.outputSizeBytes ? ` · ${formatBytes(job.outputSizeBytes)}` : ""}
                      </div>
                      {isActive ? (
                        <div className="mt-2 max-w-xl">
                          <JobProgress progress={job.progress} stage={job.stage} status={job.status} />
                        </div>
                      ) : job.error ? (
                        <p className="mt-1 line-clamp-1 text-[10px] text-red-400">{job.error}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 pl-12 sm:pl-0">
                    {isActive ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        disabled={pending === job.id}
                        onClick={() => act(job, "cancel")}
                      >
                        <X className="mr-1 h-3 w-3" /> Cancel
                      </Button>
                    ) : null}
                    {job.status === "completed" ? (
                      <Button asChild size="sm" variant="outline" className="h-8">
                        <a href={`/api/jobs/${job.id}/file`}>
                          <Download className="mr-1 h-3 w-3" /> Download
                        </a>
                      </Button>
                    ) : null}
                    {job.status === "failed" || job.status === "cancelled" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={pending === job.id}
                        onClick={() => act(job, "retry")}
                      >
                        <RotateCcw className="mr-1 h-3 w-3" /> Retry
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-red-400"
                      disabled={pending === job.id || isActive}
                      onClick={() => act(job, "delete")}
                      aria-label="Remove job"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm">{selected?.name}</DialogTitle>
          </DialogHeader>
          {selected ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={selected.status} />
                <Badge variant="outline" className="border-border/70 text-[10px] uppercase text-muted-foreground">
                  {selected.type}
                </Badge>
                <span className="text-[11px] text-muted-foreground">
                  {selected.projectName} · {selected.source}
                </span>
              </div>
              <JobProgress progress={selected.progress} stage={selected.stage} status={selected.status} />
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <Info label="Created" value={formatDateTime(selected.createdAt)} />
                <Info label="Completed" value={formatDateTime(selected.completedAt)} />
                <Info label="Output" value={selected.outputSizeBytes ? formatBytes(selected.outputSizeBytes) : "—"} />
                <Info label="Priority" value={String(selected.priority)} />
              </div>
              {selected.error ? (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-[11px] text-red-300">
                  {selected.error}
                </div>
              ) : null}
              <div>
                <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">Log</div>
                <pre className="max-h-64 overflow-auto rounded-lg border border-border/70 bg-black/40 p-3 text-[10px] leading-relaxed text-muted-foreground">
                  {selected.logs || "No log output yet."}
                </pre>
              </div>
              <div className="flex justify-end gap-2">
                {selected.status === "completed" ? (
                  <Button asChild size="sm">
                    <a href={`/api/jobs/${selected.id}/file`}>
                      <Download className="mr-1.5 h-3.5 w-3.5" /> Download export
                    </a>
                  </Button>
                ) : null}
                {activeStatuses.includes(selected.status) ? (
                  <Button size="sm" variant="outline" onClick={() => act(selected, "cancel")}>
                    <Play className="mr-1.5 h-3.5 w-3.5 rotate-90" /> Cancel job
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/70 bg-surface/50 p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate font-medium">{value}</div>
    </div>
  );
}
