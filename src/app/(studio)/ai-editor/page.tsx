import { AiEditorClient } from "@/components/studio/ai-editor-client";
import { PageHeader } from "@/components/ui-kit";
import {
  getActiveProject,
  getProjectMedia,
  getProjectPlans,
  getProjectSubtitles,
} from "@/lib/data";
import type { PlanOperation } from "@/lib/types";
import { hasClaudePlanner } from "@/lib/planner-claude";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI Editor" };

export default async function AiEditorPage() {
  const project = await getActiveProject();
  const [media, subtitles, plans] = project
    ? await Promise.all([
        getProjectMedia(project.id),
        getProjectSubtitles(project.id),
        getProjectPlans(project.id),
      ])
    : [[], [], []];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Create"
        title="AI Editor"
        description="Describe the edit in plain language. FREMIQ drafts a structured plan you can review, skip or approve before a single frame is rendered."
      />
      <AiEditorClient
        projectId={project?.id ?? null}
        projectName={project?.name ?? null}
        mediaCount={media.length}
        subtitleCount={subtitles.length}
        claudeAvailable={hasClaudePlanner()}
        plans={plans.map((plan) => ({
          id: plan.id,
          prompt: plan.prompt,
          summary: plan.summary,
          engine: plan.engine,
          status: plan.status,
          operations: plan.operations as PlanOperation[],
          warnings: ((plan.context ?? {}) as { warnings?: string[] }).warnings ?? [],
          createdAt: plan.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
