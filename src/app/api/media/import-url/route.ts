import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { fail, handleError, ok, readJson, requireString } from "@/lib/api";
import { importVideoFromUrl } from "@/lib/media/remote-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(request);
    const projectId = requireString(body.projectId, "projectId");
    const url = requireString(body.url, "Video link");
    const projectRows = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!projectRows[0]) return fail("Project not found", 404);

    const result = await importVideoFromUrl(url, projectId);
    return ok({ media: result.item }, 201);
  } catch (error) {
    return handleError(error, 500);
  }
}
