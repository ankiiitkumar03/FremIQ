import { fail, handleError, ok, readJson } from "@/lib/api";
import { decryptSecret } from "@/lib/secrets";
import { getSettings } from "@/lib/settings";
import { checkAgentHealth } from "@/lib/system";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJson<{ action?: string }>(request);
    const action = body.action ?? "reconnect";
    const settings = await getSettings();
    const token = decryptSecret(settings.agent.pairingToken);

    if (action === "reconnect") {
      const health = await checkAgentHealth(settings.agent.url, token);
      return ok({ action, health });
    }
    if (!["restart", "diagnose"].includes(action)) {
      return fail("Unsupported agent action", 400);
    }

    const health = await checkAgentHealth(settings.agent.url, token);
    if (!health.ok) {
      return fail("Connect the local agent before running that action", 409, { health });
    }
    const response = await fetch(
      `${settings.agent.url.replace(/\/$/, "")}/api/agent/${action}`,
      {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        signal: AbortSignal.timeout(30_000),
      },
    );
    const text = await response.text();
    if (!response.ok) return fail(`Agent ${action} failed: ${text.slice(0, 300)}`, 502);
    let data: unknown = text;
    try {
      data = JSON.parse(text);
    } catch {
      // keep text
    }
    return ok({ action, result: data });
  } catch (error) {
    return handleError(error);
  }
}
