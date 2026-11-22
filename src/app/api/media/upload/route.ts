import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { fail, handleError, ok } from "@/lib/api";
import { importUploadedFile } from "@/lib/media/import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const projectId = form.get("projectId");
    const file = form.get("file");
    if (typeof projectId !== "string" || !projectId) {
      return fail("Choose a project before uploading", 400);
    }
    if (!file || typeof file === "string" || !("arrayBuffer" in file)) {
      return fail("Attach a file to upload", 400);
    }
    const projectRows = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!projectRows[0]) return fail("Project not found", 404);

    const uploaded = file as File;
    const { item, extracted } = await importUploadedFile(uploaded, projectId);
    return ok({ media: item, extracted }, 201);
  } catch (error) {
    return handleError(error);
  }
}
