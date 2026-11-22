import { fail, handleError, ok, readJson } from "@/lib/api";
import { detectTools } from "@/lib/tools";
import { getSettings } from "@/lib/settings";
import { decryptSecret } from "@/lib/secrets";
import { checkAgentHealth } from "@/lib/system";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJson<{ key?: string; action?: string }>(request);
    if (!body.key) return fail("Tool key is required", 400);
    const tools = await detectTools();
    const tool = tools.find((item) => item.key === body.key);
    if (!tool) return fail("Unknown tool", 404);

    if (body.action === "check") {
      return ok({ tool });
    }

    const settings = await getSettings();
    const token = decryptSecret(settings.agent.pairingToken);
    const health = await checkAgentHealth(settings.agent.url, token);
    if (!health.ok) {
      return fail(
        `Installing ${tool.name} must run on your own computer. Connect the FREMIQ Local Agent, then install from Tool Manager. Suggested command: ${tool.installHint}`,
        409,
        { requiresAgent: true, installHint: tool.installHint, tool },
      );
    }

    const response = await fetch(`${settings.agent.url.replace(/\/$/, "")}/api/tools/install`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ key: tool.key, approved: true }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      return fail(`Agent install failed: ${(await response.text()).slice(0, 300)}`, 502);
    }
    return ok(await response.json(), 202);
  } catch (error) {
    return handleError(error);
  }
}
