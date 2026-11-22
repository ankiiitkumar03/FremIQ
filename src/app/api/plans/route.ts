import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { editingPlans } from "@/lib/db/schema";
import { fail, handleError, ok, readJson, requireString } from "@/lib/api";
import { getProjectById, getProjectMedia, getProjectSubtitles, logActivity } from "@/lib/data";
import { generatePlan } from "@/lib/planner";
import { hasClaudePlanner, normalizeEditPromptWithClaude } from "@/lib/planner-claude";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId");
    const rows = projectId
      ? await db
          .select()
          .from(editingPlans)
          .where(eq(editingPlans.projectId, projectId))
          .orderBy(desc(editingPlans.createdAt))
      : await db.select().from(editingPlans).orderBy(desc(editingPlans.createdAt)).limit(50);
    return ok({ plans: rows });
  } catch (error) {
    return handleError(error, 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(request);
    const projectId = requireString(body.projectId, "projectId");
    const prompt = requireString(body.prompt, "Editing prompt");
    const engine = body.engine === "claude" ? "claude" : "builtin";
    const project = await getProjectById(projectId);
    if (!project) return fail("Project not found", 404);
    if (engine === "claude" && !hasClaudePlanner()) {
      return fail("Claude Code is not installed on the FREMIQ host. Use the FREMIQ planner or install Claude Code first.", 503);
    }
    const [mediaRows, subtitleRows] = await Promise.all([
      getProjectMedia(projectId),
      getProjectSubtitles(projectId),
    ]);
    const audioTracks = mediaRows.filter((item) => item.kind === "audio");
    const primaryVideo = mediaRows.find((item) => item.kind === "video");
    const hasPrimarySubtitles = Boolean(
      primaryVideo && subtitleRows.some((track) => track.mediaId === primaryVideo.id),
    );
    const planningPrompt = engine === "claude"
      ? await normalizeEditPromptWithClaude({
          prompt,
          project,
          media: mediaRows,
          hasSubtitles: hasPrimarySubtitles,
          audioTracks,
        })
      : prompt;
    const plan = generatePlan({
      prompt: planningPrompt,
      project,
      media: mediaRows,
      hasSubtitles: hasPrimarySubtitles,
      audioTracks,
    });
    if (engine === "claude") {
      plan.context.engine = "claude-code + fremiq-planner-v1";
      plan.context.warnings.unshift(
        "Claude Code normalized your request; FREMIQ built-in planning rules validated the edit. Review every operation before rendering.",
      );
    }

    const rows = await db
      .insert(editingPlans)
      .values({
        projectId,
        prompt,
        summary: plan.summary,
        engine: plan.context.engine,
        status: "draft",
        operations: plan.operations,
        context: plan.context as unknown as Record<string, unknown>,
      })
      .returning();

    await logActivity({
      projectId,
      type: "plan.created",
      message: `Drafted an editing plan for “${project.name}”`,
      meta: { planId: rows[0].id },
    });

    return ok({ plan: rows[0], warnings: plan.context.warnings }, 201);
  } catch (error) {
    return handleError(error);
  }
}
