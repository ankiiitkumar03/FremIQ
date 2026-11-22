import { fail, handleError, ok, readJson } from "@/lib/api";
import { getTelegramStatus, registerTelegramWebhook, removeTelegramWebhook } from "@/lib/telegram";
import { getSettings, saveSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(await getTelegramStatus());
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    const requestOrigin = new URL(request.url).origin;
    if (!origin || origin !== requestOrigin) return fail("Webhook setup must be requested from this FREMIQ site", 403);
    const body = await readJson<{ action?: string; url?: string }>(request);
    if (body.action === "remove") {
      await removeTelegramWebhook();
      return ok({ removed: true });
    }
    if (body.action !== "register") return fail("Choose register or remove", 400);
    const settings = await getSettings();
    const baseUrl = (body.url ?? settings.telegram.webhookBaseUrl).trim().replace(/\/+$/, "");
    if (!baseUrl) return fail("Enter the public FREMIQ HTTPS URL first", 400);
    if (new URL(baseUrl).origin !== requestOrigin) return fail("Webhook URL must point to this same FREMIQ site", 400);
    const webhookUrl = await registerTelegramWebhook(baseUrl);
    await saveSettings({ telegram: { ...settings.telegram, webhookBaseUrl: baseUrl } });
    return ok({ registered: true, webhookUrl });
  } catch (error) {
    return handleError(error, 400);
  }
}
