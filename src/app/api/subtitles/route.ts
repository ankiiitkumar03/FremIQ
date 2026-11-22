import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { subtitleTracks } from "@/lib/db/schema";
import { fail, handleError, ok, readJson } from "@/lib/api";
import { getProjectById, logActivity } from "@/lib/data";
import { defaultSubtitleStyle, parseSubtitles, subtitlePresets } from "@/lib/media/subtitles";
import type { SubtitleCue, SubtitleStyle } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId");
    const rows = projectId
      ? await db
          .select()
          .from(subtitleTracks)
          .where(eq(subtitleTracks.projectId, projectId))
          .orderBy(desc(subtitleTracks.updatedAt))
      : await db.select().from(subtitleTracks).orderBy(desc(subtitleTracks.updatedAt)).limit(50);
    return ok({ tracks: rows });
  } catch (error) {
    return handleError(error, 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(request);
    if (typeof body.projectId !== "string" || !body.projectId) {
      return fail("projectId is required", 400);
    }
    const project = await getProjectById(body.projectId);
    if (!project) return fail("Project not found", 404);

    const format = ["srt", "vtt", "ass"].includes(String(body.format))
      ? (String(body.format) as "srt" | "vtt" | "ass")
      : "srt";
    let cues: SubtitleCue[] = [];
    if (Array.isArray(body.cues)) {
      cues = body.cues as SubtitleCue[];
    } else if (typeof body.content === "string" && body.content.trim()) {
      cues = parseSubtitles(body.content, format);
    }
    if (cues.length === 0) return fail("Provide subtitle content or cues to import", 400);
    if (
      cues.some(
        (cue) =>
          typeof cue.start !== "number" ||
          typeof cue.end !== "number" ||
          typeof cue.text !== "string" ||
          cue.end <= cue.start,
      )
    ) {
      return fail("One or more subtitle cues are invalid", 400);
    }

    const preset = typeof body.preset === "string" ? body.preset : "bold";
    const style: SubtitleStyle = {
      ...(subtitlePresets[preset] ?? defaultSubtitleStyle),
      ...((body.style as Partial<SubtitleStyle>) ?? {}),
    };

    const rows = await db
      .insert(subtitleTracks)
      .values({
        projectId: body.projectId,
        mediaId: typeof body.mediaId === "string" && body.mediaId ? body.mediaId : null,
        name:
          typeof body.name === "string" && body.name.trim()
            ? body.name.trim().slice(0, 120)
            : "Captions",
        language: typeof body.language === "string" ? body.language.slice(0, 12) : "en",
        format,
        style: style as unknown as Record<string, unknown>,
        cues: cues as unknown[],
        source: typeof body.source === "string" ? body.source : "imported",
      })
      .returning();

    await logActivity({
      projectId: body.projectId,
      type: "subtitles.imported",
      message: `Added ${cues.length} caption cue${cues.length === 1 ? "" : "s"}`,
      meta: { subtitleId: rows[0].id },
    });

    return ok({ track: rows[0] }, 201);
  } catch (error) {
    return handleError(error);
  }
}
