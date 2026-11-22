import { handleError, ok } from "@/lib/api";
import { getImportedRepos } from "@/lib/github";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const repos = await getImportedRepos();
    return ok({ repos });
  } catch (error) {
    return handleError(error, 500);
  }
}
