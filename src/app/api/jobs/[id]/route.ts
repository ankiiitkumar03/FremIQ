import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { fail, handleError, ok } from "@/lib/api";
import { getJobWithProject } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const row = await getJobWithProject(id);
    if (!row) return fail("Job not found", 404);
    return ok(row);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const rows = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
    const job = rows[0];
    if (!job) return fail("Job not found", 404);
    if (["queued", "preparing", "analyzing", "processing", "rendering"].includes(job.status)) {
      return fail("Cancel the job before removing it", 400);
    }
    await db.delete(jobs).where(eq(jobs.id, id));
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
