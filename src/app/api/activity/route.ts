import { handleError, ok } from "@/lib/api";
import { getRecentActivity } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit") ?? 12)));
    const rows = await getRecentActivity(limit);
    return ok({ activity: rows });
  } catch (error) {
    return handleError(error, 500);
  }
}
