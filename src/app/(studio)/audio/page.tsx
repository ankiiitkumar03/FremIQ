import { AudioClient } from "@/components/studio/audio-client";
import { ExtensionHints } from "@/components/studio/extension-hints";
import { PageHeader } from "@/components/ui-kit";
import { getActiveProject, getProjectMedia } from "@/lib/data";
import { getExtensionView } from "@/lib/extensions/manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audio Studio" };

export default async function AudioPage() {
  const project = await getActiveProject();
  const [media, earshot] = await Promise.all([
    project ? getProjectMedia(project.id) : Promise.resolve([]),
    getExtensionView("earshot").catch(() => null),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Studio"
        title="Audio Studio"
        description="Trim, normalise, fade and export audio with the core FFmpeg engine, or add sound design through the optional Earshot extension."
      />
      <AudioClient
        projectId={project?.id ?? null}
        projectName={project?.name ?? null}
        media={media.map((item) => ({
          id: item.id,
          name: item.name,
          kind: item.kind,
          durationSec: item.durationSec,
          hasAudio: item.hasAudio,
        }))}
        earshot={{
          installed: earshot?.installed ?? false,
          enabled: earshot?.enabled ?? false,
          operational: earshot?.operational ?? false,
          health: earshot?.health ?? "missing",
          reason:
            earshot?.definition.verification === "planned"
              ? "Earshot is not verified"
              : earshot?.lastError ?? null,
        }}
      />
      <ExtensionHints
        ids={["earshot"]}
        title="Audio extensions"
        description="Earshot adds sound-effect generation and audio analysis. It is optional and isolated from the core FFmpeg pipeline."
      />
    </div>
  );
}
