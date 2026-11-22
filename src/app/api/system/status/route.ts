import { handleError, ok } from "@/lib/api";
import { getSystemStatus } from "@/lib/system";
import { kickQueue } from "@/lib/jobs/queue";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    kickQueue();
    const status = await getSystemStatus();
    return ok(status);
  } catch (error) {
    return handleError(error, 500);
  }
}
