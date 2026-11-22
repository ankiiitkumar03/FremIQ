import { ClipsClient } from "@/components/studio/clips-client";
import { PageHeader } from "@/components/ui-kit";
import { getActiveProject, getProjectMedia, getProjectSubtitles } from "@/lib/data";
import { getBackendViews } from "@/lib/render/backends";
import { getSettings } from "@/lib/settings";
import type { SubtitleCue } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clip Generator" };

export default async function ClipsPage({
  searchParams,
}: {
  searchParams: Promise<{ mediaId?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedMediaId = Array.isArray(params.mediaId) ? params.mediaId[0] : params.mediaId;
  const project = await getActiveProject();
  const [media, subtitles, backends, settings] = await Promise.all([
    project ? getProjectMedia(project.id) : Promise.resolve([]),
    project ? getProjectSubtitles(project.id) : Promise.resolve([]),
    getBackendViews(),
    getSettings(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Studio"
        title="Clip Generator"
        description="Turn a long video into short clips. FREMIQ scores scene changes and speech gaps, then uses available captions to find stronger opening hooks. Review each suggestion before exporting."
      />
      <ClipsClient
        projectId={project?.id ?? null}
        projectName={project?.name ?? null}
        defaultAspect={project?.aspectRatio ?? "9:16"}
        defaultFps={project?.frameRate ?? 30}
        defaultBackend={settings.processing.defaultBackend}
        backends={backends.map((backend) => ({
          key: backend.key,
          label: backend.label,
          available: backend.available,
          reason: backend.reason,
        }))}
        initialMediaId={requestedMediaId ?? null}
        videos={media
          .filter((item) => item.kind === "video")
          .map((item) => ({
            id: item.id,
            name: item.name,
            kind: item.kind,
            durationSec: item.durationSec,
            thumbnailPath: item.thumbnailPath,
          }))}
        subtitles={subtitles.map((track) => ({
          id: track.id,
          name: track.name,
          cues: (track.cues as SubtitleCue[]).length,
          mediaId: track.mediaId,
        }))}
      />
    </div>
  );
}
