import { SubtitlesClient } from "@/components/studio/subtitles-client";
import { PageHeader } from "@/components/ui-kit";
import { getActiveProject, getProjectMedia, getProjectSubtitles } from "@/lib/data";
import type { SubtitleCue, SubtitleStyle } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Subtitle Studio" };

export default async function SubtitlesPage({
  searchParams,
}: {
  searchParams: Promise<{ mediaId?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedMediaId = Array.isArray(params.mediaId) ? params.mediaId[0] : params.mediaId;
  const project = await getActiveProject();
  const [tracks, media] = project
    ? await Promise.all([getProjectSubtitles(project.id), getProjectMedia(project.id)])
    : [[], []];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Studio"
        title="Subtitle Studio"
        description="Import, edit and style captions, or transcribe audio with the Local Agent. Burn word-accurate captions straight into a render."
      />
      <SubtitlesClient
        projectId={project?.id ?? null}
        projectName={project?.name ?? null}
        tracks={tracks.map((track) => ({
          id: track.id,
          name: track.name,
          language: track.language,
          format: track.format,
          source: track.source,
          mediaId: track.mediaId,
          style: track.style as unknown as SubtitleStyle,
          cues: track.cues as SubtitleCue[],
          updatedAt: track.updatedAt.toISOString(),
        }))}
        media={media.map((item) => ({
          id: item.id,
          name: item.name,
          kind: item.kind,
          hasAudio: item.hasAudio,
        }))}
        initialMediaId={requestedMediaId}
      />
    </div>
  );
}
