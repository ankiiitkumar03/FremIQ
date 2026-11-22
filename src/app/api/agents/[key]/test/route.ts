import { handleError, ok } from "@/lib/api";
import { testAgent } from "@/lib/agents";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    const { key } = await params;
    const probe = await testAgent(key);
    return ok({ agent: probe });
  } catch (error) {
    return handleError(error);
  }
}
