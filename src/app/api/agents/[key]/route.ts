import { handleError, ok, readJson } from "@/lib/api";
import { updateAgentConfig } from "@/lib/agents";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    const { key } = await params;
    const body = await readJson<Record<string, unknown>>(request);
    const probe = await updateAgentConfig(key, {
      executablePath: typeof body.executablePath === "string" ? body.executablePath : undefined,
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    });
    return ok({ agent: probe });
  } catch (error) {
    return handleError(error);
  }
}
