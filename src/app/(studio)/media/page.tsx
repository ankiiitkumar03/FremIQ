import { MediaClient } from "@/components/studio/media-client";
import { PageHeader } from "@/components/ui-kit";
import { getActiveProject, getProjectMedia } from "@/lib/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Media Library" };

export default async function MediaPage() {
  const project = await getActiveProject();
  const items = project ? await getProjectMedia(project.id) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Create"
        title="Media Library"
        description={
          project
            ? `Footage, audio and images for “${project.name}”. Originals are never modified; every render writes a new file.`
            : "Footage, audio and images. Create a project to start a library."
        }
      />
      <MediaClient
        projectId={project?.id ?? null}
        projectName={project?.name ?? null}
        items={items.map((item) => ({
          id: item.id,
          name: item.name,
          kind: item.kind,
          mimeType: item.mimeType,
          sizeBytes: item.sizeBytes,
          durationSec: item.durationSec,
          width: item.width,
          height: item.height,
          fps: item.fps,
          hasAudio: item.hasAudio,
          thumbnailPath: item.thumbnailPath,
          createdAt: item.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
