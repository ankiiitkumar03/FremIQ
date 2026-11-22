import { fail, handleError, ok, readJson } from "@/lib/api";
import { importRepository } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(request);
    if (typeof body.repo !== "string" || !body.repo.trim()) {
      return fail("Enter a repository as owner/repo or a GitHub URL", 400);
    }
    const result = await importRepository({
      repoInput: body.repo,
      branch: typeof body.branch === "string" ? body.branch : undefined,
      projectId: typeof body.projectId === "string" ? body.projectId : undefined,
    });
    return ok(result, 201);
  } catch (error) {
    return handleError(error);
  }
}
