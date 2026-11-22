import { TimelineClient } from "@/components/studio/timeline-client";
import { PageHeader } from "@/components/ui-kit";
import { getActiveProject, getProjectMedia, getProjectTimeline } from "@/lib/data";
import { defaultTimeline } from "@/lib/timeline-defaults";
import { relativeTime } from "@/lib/format";
import type { TimelineData } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Timeline Studio" };

export default async function TimelinePage() {
  const project = await getActiveProject();
  const [timelineRow, media] = project
    ? await Promise.all([getProjectTimeline(project.id), getProjectMedia(project.id)])
    : [null, []];

  const data =
    (timelineRow?.data as unknown as TimelineData | undefined) ??
    defaultTimeline({
      aspectRatio: project?.aspectRatio ?? "16:9",
      resolution: project?.resolution ?? "1920x1080",
      fps: project?.frameRate ?? 30,
    });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Studio"
        title="Timeline Studio"
        description="A multi-track timeline for manual edits. Arrange clips, titles and audio, then render through the same queue as every other studio."
      />
      <TimelineClient
        projectId={project?.id ?? null}
        projectName={project?.name ?? null}
        initialTimeline={data}
        savedAt={timelineRow ? relativeTime(timelineRow.updatedAt) : null}
        media={media.map((item) => ({
          id: item.id,
          name: item.name,
          kind: item.kind,
          durationSec: item.durationSec,
          thumbnailPath: item.thumbnailPath,
        }))}
      />
    </div>
  );
}
