import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { editingPlans } from "@/lib/db/schema";
import { fail, handleError, ok } from "@/lib/api";
import { getProjectById } from "@/lib/data";
import { executePlan } from "@/lib/jobs/execute-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const rows = await db.select().from(editingPlans).where(eq(editingPlans.id, id)).limit(1);
    const plan = rows[0];
    if (!plan) return fail("Plan not found", 404);
    const project = await getProjectById(plan.projectId);
    if (!project) return fail("Project not found", 404);
    const result = await executePlan(plan, project);
    return ok(result, 202);
  } catch (error) {
    return handleError(error);
  }
}
