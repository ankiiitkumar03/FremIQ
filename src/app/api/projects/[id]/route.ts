import fs from "node:fs";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { jobs, media, projects } from "@/lib/db/schema";
import { ACTIVE_PROJECT_COOKIE } from "@/lib/data";
import { fail, handleError, ok, optionalString, readJson } from "@/lib/api";
import { resolveDataPath } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const rows = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!rows[0]) return fail("Project not found", 404);
    return ok({ project: rows[0] });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await readJson<Record<string, unknown>>(request);
    const updates: Partial<typeof projects.$inferInsert> = { updatedAt: new Date() };
    if (typeof body.name === "string") updates.name = body.name.trim().slice(0, 120);
    if (typeof body.description === "string") updates.description = body.description.slice(0, 600);
    if (typeof body.status === "string") updates.status = body.status;
    if (typeof body.aspectRatio === "string") updates.aspectRatio = body.aspectRatio;
    if (typeof body.resolution === "string") updates.resolution = body.resolution;
    if (body.frameRate !== undefined) updates.frameRate = Number(body.frameRate) || 30;
    if (optionalString(body.name) === undefined && typeof body.name === "string") {
      return fail("Project name cannot be empty", 400);
    }
    const rows = await db.update(projects).set(updates).where(eq(projects.id, id)).returning();
    if (!rows[0]) return fail("Project not found", 404);
    return ok({ project: rows[0] });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const mediaRows = await db.select().from(media).where(eq(media.projectId, id));
    const jobRows = await db.select().from(jobs).where(eq(jobs.projectId, id));

    const rows = await db.delete(projects).where(eq(projects.id, id)).returning();
    if (!rows[0]) return fail("Project not found", 404);

    const remove = (relative: string | null) => {
      if (!relative) return;
      try {
        const absolute = resolveDataPath(relative);
        if (fs.existsSync(absolute)) fs.unlinkSync(absolute);
      } catch {
        // Ignore missing files during cleanup.
      }
    };
    for (const item of mediaRows) {
      remove(item.relativePath);
      remove(item.thumbnailPath);
    }
    for (const job of jobRows) remove(job.outputPath);

    const store = await cookies();
    if (store.get(ACTIVE_PROJECT_COOKIE)?.value === id) {
      store.delete(ACTIVE_PROJECT_COOKIE);
    }
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
