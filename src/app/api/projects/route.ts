import { cookies } from "next/headers";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, timelines } from "@/lib/db/schema";
import { ACTIVE_PROJECT_COOKIE, logActivity } from "@/lib/data";
import { handleError, ok, optionalString, readJson, requireString } from "@/lib/api";
import { defaultTimeline } from "@/lib/timeline-defaults";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await db.select().from(projects).orderBy(desc(projects.updatedAt));
    return ok({ projects: rows });
  } catch (error) {
    return handleError(error, 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(request);
    const name = requireString(body.name, "Project name");
    const description = optionalString(body.description) ?? "";
    const defaults = await getSettings();
    const aspectRatio = optionalString(body.aspectRatio) ?? defaults.video.aspectRatio;
    const resolution = optionalString(body.resolution) ?? defaults.video.resolution;
    const frameRate = Number(body.frameRate ?? defaults.video.fps);

    const rows = await db
      .insert(projects)
      .values({
        name: name.slice(0, 120),
        description: description.slice(0, 600),
        status: "active",
        aspectRatio,
        resolution,
        frameRate: Number.isFinite(frameRate) ? frameRate : 30,
      })
      .returning();
    const project = rows[0];

    await db.insert(timelines).values({
      projectId: project.id,
      name: "Main timeline",
      data: defaultTimeline({ aspectRatio, resolution, fps: project.frameRate }) as unknown as Record<string, unknown>,
      durationSec: 0,
      version: 1,
    });

    const store = await cookies();
    store.set(ACTIVE_PROJECT_COOKIE, project.id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    await logActivity({
      projectId: project.id,
      type: "project.created",
      message: `Created project “${project.name}”`,
    });

    return ok({ project }, 201);
  } catch (error) {
    return handleError(error);
  }
}
