import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { media, subtitleTracks } from "@/lib/db/schema";
import { fail, handleError, ok, readJson } from "@/lib/api";
import { getProjectById } from "@/lib/data";
import { generateClipCandidates } from "@/lib/media/clips";
import type { SubtitleCue } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(request);
    if (typeof body.projectId !== "string" || !body.projectId) {
      return fail("projectId is required", 400);
    }
    if (typeof body.mediaId !== "string" || !body.mediaId) {
      return fail("Choose a source video to analyse", 400);
    }
    const project = await getProjectById(body.projectId);
    if (!project) return fail("Project not found", 404);
    const rows = await db.select().from(media).where(eq(media.id, body.mediaId)).limit(1);
    const source = rows[0];
    if (!source || source.projectId !== project.id || source.kind !== "video") {
      return fail("Choose a video from this project", 400);
    }

    const subtitleRows = await db
      .select()
      .from(subtitleTracks)
      .where(eq(subtitleTracks.projectId, project.id))
      .orderBy(desc(subtitleTracks.updatedAt));
    const subtitle = subtitleRows.find((track) => track.mediaId === source.id) ?? null;

    const count = Math.max(1, Math.min(10, Number(body.count ?? 3)));
    const duration = Math.max(5, Math.min(180, Number(body.duration ?? 30)));
    const focus = typeof body.focus === "string" ? body.focus.trim().slice(0, 200) : "";
    const { candidates, analysis } = await generateClipCandidates({
      media: source,
      count,
      duration,
      focus,
      subtitles: (subtitle?.cues as SubtitleCue[] | undefined) ?? [],
    });

    return ok({ candidates, analysis });
  } catch (error) {
    return handleError(error, 500);
  }
}
