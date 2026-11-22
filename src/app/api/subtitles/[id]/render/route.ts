import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { media, subtitleTracks } from "@/lib/db/schema";
import { fail, handleError, ok } from "@/lib/api";
import { getProjectById, logActivity } from "@/lib/data";
import { enqueueJob } from "@/lib/jobs/queue";
import { buildTimelineFromSegments } from "@/lib/media/render";
import type { SubtitleCue, SubtitleStyle } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const rows = await db.select().from(subtitleTracks).where(eq(subtitleTracks.id, id)).limit(1);
    const track = rows[0];
    if (!track) return fail("Subtitle track not found", 404);
    if (!track.mediaId) return fail("Link this caption track to a video before rendering", 400);
    const mediaRows = await db.select().from(media).where(eq(media.id, track.mediaId)).limit(1);
    const source = mediaRows[0];
    if (!source) return fail("Source video not found", 404);
    const project = await getProjectById(track.projectId);
    if (!project) return fail("Project not found", 404);

    const timeline = buildTimelineFromSegments({
      sourceMediaId: source.id,
      sourceDuration: source.durationSec,
      segments: [{ start: 0, end: source.durationSec ?? 10 }],
      aspectRatio: project.aspectRatio,
      resolution: project.resolution,
      fps: project.frameRate,
    });

    const job = await enqueueJob({
      projectId: project.id,
      name: `${source.name} · Captions`,
      type: "subtitle",
      spec: {
        type: "timeline",
        timeline,
        subtitles: {
          cues: track.cues as SubtitleCue[],
          style: track.style as unknown as SubtitleStyle,
        },
        music: null,
        duration: source.durationSec ?? 10,
      },
    });

    await logActivity({
      projectId: project.id,
      type: "subtitles.render",
      message: `Queued caption burn for “${source.name}”`,
      meta: { jobId: job.id, subtitleId: track.id },
    });

    return ok({ job }, 202);
  } catch (error) {
    return handleError(error);
  }
}
