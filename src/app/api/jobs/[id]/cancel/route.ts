import { handleError, ok } from "@/lib/api";
import { cancelJob } from "@/lib/jobs/queue";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await cancelJob(id);
    return ok({ cancelled: true });
  } catch (error) {
    return handleError(error);
  }
}
