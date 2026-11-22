import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, timelines } from "@/lib/db/schema";
import { fail, handleError, ok, readJson } from "@/lib/api";
import { logActivity } from "@/lib/data";
import { defaultTimeline } from "@/lib/timeline-defaults";
import type { TimelineData } from "@/lib/types";

export const dynamic = "force-dynamic";

function validateTimeline(data: unknown): TimelineData {
  if (!data || typeof data !== "object") throw new Error("Timeline data is required");
  const candidate = data as TimelineData;
  if (!Array.isArray(candidate.tracks) || !Array.isArray(candidate.clips)) {
    throw new Error("Timeline must contain tracks and clips arrays");
  }
  if (!candidate.settings || typeof candidate.settings !== "object") {
    throw new Error("Timeline settings are required");
  }
  if (candidate.clips.length > 500) throw new Error("Timeline exceeds the 500 clip limit");
  for (const clip of candidate.clips) {
    if (
      typeof clip.id !== "string" ||
      typeof clip.trackId !== "string" ||
      typeof clip.start !== "number" ||
      typeof clip.duration !== "number" ||
      clip.start < 0 ||
      clip.duration <= 0
    ) {
      throw new Error("Timeline contains an invalid clip");
    }
  }
  return candidate;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId");
    if (!projectId) return fail("projectId is required", 400);
    const rows = await db
      .select()
      .from(timelines)
      .where(eq(timelines.projectId, projectId))
      .orderBy(desc(timelines.updatedAt))
      .limit(1);
    const projectRows = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!projectRows[0]) return fail("Project not found", 404);
    return ok({
      timeline: rows[0] ?? null,
      fallback: defaultTimeline({
        aspectRatio: projectRows[0].aspectRatio,
        resolution: projectRows[0].resolution,
        fps: projectRows[0].frameRate,
      }),
    });
  } catch (error) {
    return handleError(error, 500);
  }
}

export async function PUT(request: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(request);
    if (typeof body.projectId !== "string" || !body.projectId) {
      return fail("projectId is required", 400);
    }
    const data = validateTimeline(body.data);
    const duration = data.clips.reduce(
      (max, clip) => Math.max(max, clip.start + clip.duration),
      0,
    );
    const existing = await db
      .select()
      .from(timelines)
      .where(eq(timelines.projectId, body.projectId))
      .orderBy(desc(timelines.updatedAt))
      .limit(1);

    let row;
    if (existing[0]) {
      const updated = await db
        .update(timelines)
        .set({
          data: data as unknown as Record<string, unknown>,
          durationSec: duration,
          version: existing[0].version + 1,
          updatedAt: new Date(),
        })
        .where(eq(timelines.id, existing[0].id))
        .returning();
      row = updated[0];
    } else {
      const inserted = await db
        .insert(timelines)
        .values({
          projectId: body.projectId,
          name: typeof body.name === "string" ? body.name : "Main timeline",
          data: data as unknown as Record<string, unknown>,
          durationSec: duration,
          version: 1,
        })
        .returning();
      row = inserted[0];
    }

    await db
      .update(projects)
      .set({ updatedAt: new Date() })
      .where(eq(projects.id, body.projectId));
    await logActivity({
      projectId: body.projectId,
      type: "timeline.saved",
      message: `Saved timeline version ${row.version}`,
      meta: { timelineId: row.id, clips: data.clips.length },
    });

    return ok({ timeline: row });
  } catch (error) {
    return handleError(error);
  }
}
