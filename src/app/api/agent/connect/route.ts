import { fail, handleError, ok, readJson } from "@/lib/api";
import { encryptSecret, decryptSecret } from "@/lib/secrets";
import { getSettings, saveSettings } from "@/lib/settings";
import { checkAgentHealth } from "@/lib/system";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeUrl(value: string) {
  const parsed = new URL(value.trim());
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Agent URL must start with http:// or https://");
  }
  return parsed.origin;
}

export async function GET() {
  try {
    const settings = await getSettings();
    const token = decryptSecret(settings.agent.pairingToken);
    const health = await checkAgentHealth(settings.agent.url, token);
    return ok({
      url: settings.agent.url,
      paired: Boolean(token),
      autoConnect: settings.agent.autoConnect,
      health,
    });
  } catch (error) {
    return handleError(error, 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(request);
    if (typeof body.url !== "string" || !body.url.trim()) {
      return fail("Agent URL is required", 400);
    }
    const url = normalizeUrl(body.url);
    let token = typeof body.token === "string" ? body.token.trim() : "";
    const pairingCode =
      typeof body.pairingCode === "string" ? body.pairingCode.trim() : "";

    if (pairingCode) {
      let response: Response;
      try {
        response = await fetch(`${url}/api/pair`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: pairingCode, client: "fremiq-web" }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch (error) {
        return fail(
          `Could not reach the agent at ${url}. Start the FREMIQ Local Agent and check the URL. ${error instanceof Error ? error.message : ""}`.trim(),
          502,
        );
      }
      if (!response.ok) {
        return fail(`Pairing failed: ${(await response.text()).slice(0, 200)}`, 401);
      }
      const data = (await response.json()) as { token?: string };
      if (!data.token) return fail("Agent did not return a pairing token", 502);
      token = data.token;
    }

    await saveSettings({
      agent: {
        ...(await getSettings()).agent,
        url,
        pairingToken: token ? encryptSecret(token) : "",
        autoConnect: true,
      },
    });

    const health = await checkAgentHealth(url, token);
    return ok({ connected: health.ok, url, health, paired: Boolean(token) });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE() {
  try {
    const settings = await getSettings();
    await saveSettings({
      agent: { ...settings.agent, pairingToken: "", autoConnect: false },
    });
    return ok({ disconnected: true });
  } catch (error) {
    return handleError(error);
  }
}
