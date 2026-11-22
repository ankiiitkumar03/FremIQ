import { fail, handleError, ok } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { decryptSecret } from "@/lib/secrets";
import { checkAgentHealth } from "@/lib/system";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await params;
    const settings = await getSettings();
    const token = decryptSecret(settings.agent.pairingToken);
    const health = await checkAgentHealth(settings.agent.url, token);
    if (!health.ok) return fail("Local Agent disconnected while installing the tool", 409);

    const response = await fetch(
      settings.agent.url.replace(/\/$/, "") + "/api/tools/install/" + encodeURIComponent(jobId),
      {
        headers: token ? { Authorization: "Bearer " + token } : undefined,
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = typeof payload.detail === "string" ? payload.detail : "Could not read Local Agent install status";
      return fail(detail, response.status === 404 ? 404 : 502);
    }
    return ok(payload);
  } catch (error) {
    return handleError(error);
  }
}
