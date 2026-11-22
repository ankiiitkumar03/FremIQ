import { handleError, ok } from "@/lib/api";
import { getGithubStatus } from "@/lib/github";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(await getGithubStatus());
  } catch (error) {
    return handleError(error, 500);
  }
}
