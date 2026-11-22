import { handleError, ok } from "@/lib/api";
import { getProjectJobs } from "@/lib/data";
import { kickQueue } from "@/lib/jobs/queue";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId") ?? undefined;
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") ?? 50)));
    kickQueue();
    const rows = await getProjectJobs(projectId, limit);
    return ok({ jobs: rows });
  } catch (error) {
    return handleError(error, 500);
  }
}
