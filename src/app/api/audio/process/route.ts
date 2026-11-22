import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { fail, handleError, ok, readJson } from "@/lib/api";
import { getProjectById, logActivity } from "@/lib/data";
import { enqueueJob } from "@/lib/jobs/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(request);
    if (typeof body.projectId !== "string" || !body.projectId) {
      return fail("projectId is required", 400);
    }
    if (typeof body.mediaId !== "string" || !body.mediaId) {
      return fail("Choose an audio or video file", 400);
    }
    const project = await getProjectById(body.projectId);
    if (!project) return fail("Project not found", 404);
    const rows = await db.select().from(media).where(eq(media.id, body.mediaId)).limit(1);
    const source = rows[0];
    if (!source) return fail("Media not found", 404);
    if (!source.hasAudio) return fail("That file has no audio stream", 400);

    const input = (body.operations ?? {}) as Record<string, unknown>;
    const format = ["mp3", "wav", "m4a"].includes(String(input.format))
      ? (String(input.format) as "mp3" | "wav" | "m4a")
      : "mp3";
    const operations = {
      trimStart:
        input.trimStart !== undefined ? Math.max(0, Number(input.trimStart)) : undefined,
      trimEnd: input.trimEnd !== undefined ? Math.max(0, Number(input.trimEnd)) : undefined,
      normalize: Boolean(input.normalize),
      fadeIn: input.fadeIn !== undefined ? Math.max(0, Number(input.fadeIn)) : undefined,
      fadeOut: input.fadeOut !== undefined ? Math.max(0, Number(input.fadeOut)) : undefined,
      volume: input.volume !== undefined ? Math.max(0, Number(input.volume)) : undefined,
      format,
    };
    if (
      operations.trimEnd !== undefined &&
      operations.trimStart !== undefined &&
      operations.trimEnd <= operations.trimStart
    ) {
      return fail("Trim end must be after trim start", 400);
    }

    const job = await enqueueJob({
      projectId: project.id,
      name: `${source.name.replace(/\.[^.]+$/, "")} · Audio process`,
      type: "audio",
      source: "audio-studio",
      spec: { type: "audio", sourceMediaId: source.id, operations },
    });

    await logActivity({
      projectId: project.id,
      type: "audio.render",
      message: `Queued audio processing for “${source.name}”`,
      meta: { jobId: job.id },
    });

    return ok({ job }, 202);
  } catch (error) {
    return handleError(error);
  }
}
