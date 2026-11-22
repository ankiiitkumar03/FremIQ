import { handleError, ok } from "@/lib/api";
import { getRepoFiles } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await getRepoFiles(id);
    return ok(result);
  } catch (error) {
    return handleError(error);
  }
}
