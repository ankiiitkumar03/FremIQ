import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { media, subtitleTracks } from "@/lib/db/schema";
import { fail, handleError, ok, readJson } from "@/lib/api";
import { getProjectById, logActivity } from "@/lib/data";
import { enqueueJob } from "@/lib/jobs/queue";
import { isRenderBackendKey, validateBackendSelection } from "@/lib/render/backends";
import type { ClipSegment, SubtitleCue, SubtitleStyle } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(request);
    if (typeof body.projectId !== "string" || !body.projectId) {
      return fail("projectId is required", 400);
    }
    if (typeof body.mediaId !== "string" || !body.mediaId) {
      return fail("Choose a source video", 400);
    }
    const project = await getProjectById(body.projectId);
    if (!project) return fail("Project not found", 404);
    const rows = await db.select().from(media).where(eq(media.id, body.mediaId)).limit(1);
    const source = rows[0];
    if (!source || source.projectId !== project.id || source.kind !== "video") {
      return fail("Choose a video from this project", 400);
    }
    const splitCameraId = typeof body.splitCameraMediaId === "string" ? body.splitCameraMediaId : "";
    const splitCamera = splitCameraId
      ? (await db.select().from(media).where(eq(media.id, splitCameraId)).limit(1))[0]
      : null;
    if (splitCameraId && (!splitCamera || splitCamera.projectId !== project.id || splitCamera.kind !== "video" || splitCamera.id === source.id)) {
      return fail("Choose a different camera video from this project", 400);
    }
    const cameraOffsetSec = Number(body.cameraOffsetSec ?? 0);
    if (!Number.isFinite(cameraOffsetSec) || cameraOffsetSec < 0 || cameraOffsetSec > 3600) {
      return fail("Camera start offset must be between 0 and 3600 seconds", 400);
    }

    const candidates = Array.isArray(body.candidates) ? (body.candidates as ClipSegment[]) : [];
    if (candidates.length === 0) return fail("Select at least one clip candidate", 400);
    if (candidates.length > 10) return fail("Render at most 10 clips at once", 400);
    if (
      candidates.some(
        (candidate) =>
          typeof candidate.start !== "number" ||
          typeof candidate.end !== "number" ||
          !Number.isFinite(candidate.start) ||
          !Number.isFinite(candidate.end) ||
          candidate.start < 0 ||
          candidate.end <= candidate.start ||
          candidate.end > (source.durationSec ?? 0) + 0.05 ||
          (splitCamera && candidate.end + cameraOffsetSec > (splitCamera.durationSec ?? 0) + 0.05),
      )
    ) {
      return fail("One or more clip ranges are invalid", 400);
    }

    const aspectRatio = typeof body.aspectRatio === "string" ? body.aspectRatio : project.aspectRatio;
    const resolution = typeof body.resolution === "string" ? body.resolution : project.resolution;
    const fps = Number(body.fps ?? project.frameRate ?? 30);
    const backend = isRenderBackendKey(body.backend) ? body.backend : "ffmpeg";
    if (splitCamera && backend !== "ffmpeg") {
      return fail("Split-screen export currently uses FFmpeg. Select FFmpeg as the render engine.", 400);
    }
    const renderSpec = {
      type: "clips" as const,
      sourceMediaId: source.id,
      segments: candidates,
      aspectRatio,
      resolution,
      fps,
      subtitles: null as { cues: SubtitleCue[]; style: SubtitleStyle } | null,
      titleCard: null,
      splitScreen: splitCamera
        ? {
            mediaId: splitCamera.id,
            layout: body.splitLayout === "side-by-side" ? "side-by-side" as const : "top-bottom" as const,
            cameraOffsetSec,
          }
        : null,
    };

    let subtitle: { cues: SubtitleCue[]; style: SubtitleStyle } | null = null;
    if (typeof body.subtitleTrackId === "string" && body.subtitleTrackId) {
      const trackRows = await db
        .select()
        .from(subtitleTracks)
        .where(eq(subtitleTracks.id, body.subtitleTrackId))
        .limit(1);
      if (
        trackRows[0] &&
        trackRows[0].projectId === project.id &&
        trackRows[0].mediaId === source.id
      ) {
        subtitle = {
          cues: trackRows[0].cues as SubtitleCue[],
          style: trackRows[0].style as unknown as SubtitleStyle,
        };
      }
    } else {
      const trackRows = await db
        .select()
        .from(subtitleTracks)
        .where(and(eq(subtitleTracks.projectId, project.id), eq(subtitleTracks.mediaId, source.id)))
        .orderBy(desc(subtitleTracks.updatedAt))
        .limit(1);
      if (trackRows[0]) {
        subtitle = {
          cues: trackRows[0].cues as SubtitleCue[],
          style: trackRows[0].style as unknown as SubtitleStyle,
        };
      }
    }

    renderSpec.subtitles = subtitle;
    const validation = await validateBackendSelection(backend, renderSpec);
    if (!validation.ok) {
      return fail(`${validation.reason ?? "Selected render engine is unavailable"}. Manage render engines in Tool Manager.`, 409, { backend });
    }

    const created: Array<{ id: string; name: string }> = [];
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const job = await enqueueJob({
        projectId: project.id,
        name: `${project.name} · Clip ${index + 1} (${Math.round(candidate.start)}–${Math.round(candidate.end)}s)`,
        type: "clip",
        source: "clip-generator",
        backend,
        spec: { ...renderSpec, segments: [candidate] },
      });
      created.push({ id: job.id, name: job.name });
    }

    await logActivity({
      projectId: project.id,
      type: "clips.render",
      message: `Queued ${created.length} clip render${created.length === 1 ? "" : "s"}`,
      meta: { jobIds: created.map((job) => job.id) },
    });

    return ok({ jobs: created }, 202);
  } catch (error) {
    return handleError(error);
  }
}
