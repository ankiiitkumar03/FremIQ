import { MotionClient } from "@/components/studio/motion-client";
import { ExtensionHints } from "@/components/studio/extension-hints";
import { PageHeader } from "@/components/ui-kit";
import { getActiveProject, getProjectMedia } from "@/lib/data";
import { getBackendViews } from "@/lib/render/backends";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Motion Studio" };

export default async function MotionPage() {
  const project = await getActiveProject();
  const [media, backends, settings] = await Promise.all([
    project ? getProjectMedia(project.id) : Promise.resolve([]),
    getBackendViews(),
    getSettings(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Studio"
        title="Motion Studio"
        description="Compose titles, lower thirds, bumpers and kinetic type, then render them through FFmpeg or an installed motion extension."
      />
      <MotionClient
        projectId={project?.id ?? null}
        projectName={project?.name ?? null}
        defaultResolution={project?.resolution ?? "1920x1080"}
        media={media
          .filter((item) => item.kind === "video" || item.kind === "image")
          .map((item) => ({ id: item.id, name: item.name, kind: item.kind }))}
        backends={backends.map((backend) => ({
          key: backend.key,
          label: backend.label,
          available: backend.available,
          operational: backend.operational,
          reason: backend.reason,
        }))}
        defaultBackend={settings.processing.defaultBackend ?? "ffmpeg"}
      />
      <ExtensionHints ids={["hyperframes", "remotion", "motionmaxxing"]} />
    </div>
  );
}
