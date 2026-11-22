import { QueueClient } from "@/components/studio/queue-client";
import { PageHeader } from "@/components/ui-kit";
import { getProjectJobs } from "@/lib/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Render Queue" };

export default async function RenderQueuePage() {
  const rows = await getProjectJobs(undefined, 100);
  const jobs = rows.map(({ job, projectName }) => ({
    id: job.id,
    projectName,
    name: job.name,
    type: job.type,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    priority: job.priority,
    source: job.source,
    error: job.error,
    logs: job.logs,
    outputSizeBytes: job.outputSizeBytes,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt ? job.completedAt.toISOString() : null,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="System"
        title="Render Queue"
        description="Every job FREMIQ processes on this host: AI plan executions, timeline renders, clip exports, caption burns and audio passes. Progress streams live."
      />
      <QueueClient initialJobs={jobs} />
    </div>
  );
}
