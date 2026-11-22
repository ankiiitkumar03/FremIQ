import { fail, handleError, ok } from "@/lib/api";
import { listBranches } from "@/lib/github";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const owner = url.searchParams.get("owner");
    const repo = url.searchParams.get("repo");
    if (!owner || !repo) return fail("owner and repo are required", 400);
    const branches = await listBranches(owner, repo);
    return ok({ branches });
  } catch (error) {
    return handleError(error, 401);
  }
}
