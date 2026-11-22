import { handleError, ok } from "@/lib/api";
import { retryJob } from "@/lib/jobs/queue";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await retryJob(id);
    return ok({ queued: true });
  } catch (error) {
    return handleError(error);
  }
}
