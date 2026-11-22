import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { subtitleTracks, timelines } from "@/lib/db/schema";
import { fail, handleError, ok, readJson } from "@/lib/api";
import { getProjectById, logActivity } from "@/lib/data";
import { enqueueJob } from "@/lib/jobs/queue";
import type { SubtitleCue, SubtitleStyle, TimelineData } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(request);
    if (typeof body.projectId !== "string" || !body.projectId) {
      return fail("projectId is required", 400);
    }
    const project = await getProjectById(body.projectId);
    if (!project) return fail("Project not found", 404);

    const rows = await db
      .select()
      .from(timelines)
      .where(eq(timelines.projectId, project.id))
      .orderBy(desc(timelines.updatedAt))
      .limit(1);
    const timeline = rows[0];
    if (!timeline) return fail("Save a timeline before rendering", 400);

    const subtitleRows = await db
      .select()
      .from(subtitleTracks)
      .where(eq(subtitleTracks.projectId, project.id))
      .orderBy(desc(subtitleTracks.updatedAt));
    const subtitle = subtitleRows[0] ?? null;
    const data = timeline.data as unknown as TimelineData;

    const job = await enqueueJob({
      projectId: project.id,
      name: `${project.name} · Timeline v${timeline.version}`,
      type: "render",
      spec: {
        type: "timeline",
        timeline: data,
        subtitles: subtitle
          ? {
              cues: subtitle.cues as SubtitleCue[],
              style: subtitle.style as unknown as SubtitleStyle,
            }
          : null,
        music: null,
        duration: timeline.durationSec,
      },
    });

    await logActivity({
      projectId: project.id,
      type: "timeline.render",
      message: `Queued timeline render v${timeline.version}`,
      meta: { jobId: job.id },
    });

    return ok({ job }, 202);
  } catch (error) {
    return handleError(error);
  }
}
