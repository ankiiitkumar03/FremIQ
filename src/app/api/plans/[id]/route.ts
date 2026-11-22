import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { editingPlans } from "@/lib/db/schema";
import { fail, handleError, ok, readJson } from "@/lib/api";
import { logActivity } from "@/lib/data";
import type { PlanOperation } from "@/lib/types";

export const dynamic = "force-dynamic";

const allowedStatuses = ["draft", "approved", "rejected", "executed"];

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const rows = await db.select().from(editingPlans).where(eq(editingPlans.id, id)).limit(1);
    if (!rows[0]) return fail("Plan not found", 404);
    return ok({ plan: rows[0] });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await readJson<Record<string, unknown>>(request);
    const rows = await db.select().from(editingPlans).where(eq(editingPlans.id, id)).limit(1);
    const plan = rows[0];
    if (!plan) return fail("Plan not found", 404);
    if (plan.status === "executed") return fail("An executed plan cannot be changed", 400);

    const updates: Partial<typeof editingPlans.$inferInsert> = { updatedAt: new Date() };
    if (typeof body.status === "string") {
      if (!allowedStatuses.includes(body.status)) return fail("Invalid plan status", 400);
      updates.status = body.status;
    }
    if (Array.isArray(body.operations)) {
      const operations = body.operations as PlanOperation[];
      if (
        operations.some(
          (operation) =>
            !operation ||
            typeof operation.id !== "string" ||
            typeof operation.title !== "string" ||
            !["pending", "approved", "skipped"].includes(operation.status),
        )
      ) {
        return fail("One or more operations are invalid", 400);
      }
      updates.operations = operations;
    }
    if (typeof body.summary === "string") updates.summary = body.summary.slice(0, 400);

    const updated = await db
      .update(editingPlans)
      .set(updates)
      .where(eq(editingPlans.id, id))
      .returning();

    if (updates.status === "approved") {
      await logActivity({
        projectId: plan.projectId,
        type: "plan.approved",
        message: "Approved an editing plan for local rendering",
        meta: { planId: id },
      });
    }
    if (updates.status === "rejected") {
      await logActivity({
        projectId: plan.projectId,
        type: "plan.rejected",
        message: "Rejected an editing plan",
        meta: { planId: id },
      });
    }

    return ok({ plan: updated[0] });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const rows = await db.delete(editingPlans).where(eq(editingPlans.id, id)).returning();
    if (!rows[0]) return fail("Plan not found", 404);
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
