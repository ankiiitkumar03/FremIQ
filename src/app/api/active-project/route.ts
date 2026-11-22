import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { ACTIVE_PROJECT_COOKIE } from "@/lib/data";
import { fail, handleError, ok, readJson } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJson<{ projectId?: string }>(request);
    if (!body.projectId) return fail("projectId is required", 400);
    const rows = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, body.projectId))
      .limit(1);
    if (!rows[0]) return fail("Project not found", 404);
    const store = await cookies();
    store.set(ACTIVE_PROJECT_COOKIE, body.projectId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return ok({ activeProjectId: body.projectId });
  } catch (error) {
    return handleError(error);
  }
}
