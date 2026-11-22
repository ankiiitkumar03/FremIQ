import { handleError, ok } from "@/lib/api";
import { listGithubRepos } from "@/lib/github";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const repos = await listGithubRepos();
    return ok({ repos });
  } catch (error) {
    return handleError(error, 401);
  }
}
