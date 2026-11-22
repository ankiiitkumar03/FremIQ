import { ProjectsClient } from "@/components/studio/projects-client";
import { PageHeader } from "@/components/ui-kit";
import { getActiveProject, getProjectStats, getProjects } from "@/lib/data";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const [projects, active, settings] = await Promise.all([
    getProjects(),
    getActiveProject(),
    getSettings(),
  ]);
  const enriched = await Promise.all(
    projects.map(async (project) => {
      const stats = await getProjectStats(project.id);
      return {
        id: project.id,
        name: project.name,
        description: project.description,
        status: project.status,
        aspectRatio: project.aspectRatio,
        resolution: project.resolution,
        frameRate: project.frameRate,
        isDemo: project.isDemo,
        updatedAt: project.updatedAt.toISOString(),
        ...stats,
      };
    }),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Create"
        title="Projects"
        description="Every production in one place. Switch the active project to carry it through the AI editor, timeline, captions and renders."
      />
      <ProjectsClient
        projects={enriched}
        activeProjectId={active?.id ?? null}
        defaults={{
          aspectRatio: settings.video.aspectRatio,
          resolution: settings.video.resolution,
          frameRate: settings.video.fps,
        }}
      />
    </div>
  );
}
