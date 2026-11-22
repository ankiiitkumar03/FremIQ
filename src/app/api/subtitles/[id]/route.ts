import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { subtitleTracks } from "@/lib/db/schema";
import { fail, handleError, ok, readJson } from "@/lib/api";
import { serializeAss, serializeSrt, serializeVtt } from "@/lib/media/subtitles";
import type { SubtitleCue, SubtitleStyle } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const rows = await db.select().from(subtitleTracks).where(eq(subtitleTracks.id, id)).limit(1);
    if (!rows[0]) return fail("Subtitle track not found", 404);
    const url = new URL(request.url);
    const format = url.searchParams.get("format");
    if (format) {
      const cues = rows[0].cues as SubtitleCue[];
      const style = rows[0].style as unknown as SubtitleStyle;
      const content =
        format === "vtt"
          ? serializeVtt(cues)
          : format === "ass"
            ? serializeAss(cues, style)
            : serializeSrt(cues);
      return new Response(content, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="${rows[0].name.replace(/[^\w.-]/g, "_")}.${format}"`,
        },
      });
    }
    return ok({ track: rows[0] });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await readJson<Record<string, unknown>>(request);
    const updates: Partial<typeof subtitleTracks.$inferInsert> = { updatedAt: new Date() };
    if (typeof body.name === "string") updates.name = body.name.trim().slice(0, 120);
    if (typeof body.language === "string") updates.language = body.language.slice(0, 12);
    if (Array.isArray(body.cues)) {
      const cues = body.cues as SubtitleCue[];
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
      updates.cues = cues as unknown[];
    }
    if (body.style && typeof body.style === "object") {
      updates.style = body.style as Record<string, unknown>;
    }
    const rows = await db
      .update(subtitleTracks)
      .set(updates)
      .where(eq(subtitleTracks.id, id))
      .returning();
    if (!rows[0]) return fail("Subtitle track not found", 404);
    return ok({ track: rows[0] });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const rows = await db.delete(subtitleTracks).where(eq(subtitleTracks.id, id)).returning();
    if (!rows[0]) return fail("Subtitle track not found", 404);
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
