import { fail, handleError, ok, readJson } from "@/lib/api";
import { encryptSecret } from "@/lib/secrets";
import { getSettings, saveSettings, toPublicSettings, type Settings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await getSettings();
    return ok({ settings: toPublicSettings(settings) });
  } catch (error) {
    return handleError(error, 500);
  }
}

export async function PUT(request: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(request);
    const incoming = (body.settings ?? body) as Partial<Settings>;
    const patch: Partial<Settings> = {};
    for (const key of Object.keys(incoming) as (keyof Settings)[]) {
      const value = incoming[key];
      if (value && typeof value === "object") {
        patch[key] = { ...(value as object) } as never;
      }
    }

    const clear = Array.isArray(body.clear) ? (body.clear as string[]) : [];
    if (patch.telegram) {
      const token = patch.telegram.botToken;
      if (clear.includes("telegram.botToken")) patch.telegram.botToken = "";
      else if (token) patch.telegram.botToken = encryptSecret(token);
      else delete (patch.telegram as Partial<Settings["telegram"]>).botToken;
    }
    if (patch.github) {
      const token = patch.github.token;
      if (clear.includes("github.token")) patch.github.token = "";
      else if (token) patch.github.token = encryptSecret(token);
      else delete (patch.github as Partial<Settings["github"]>).token;
    }
    if (patch.ai) {
      const apiKey = patch.ai.openaiApiKey;
      if (clear.includes("ai.openaiApiKey")) patch.ai.openaiApiKey = "";
      else if (apiKey) patch.ai.openaiApiKey = encryptSecret(apiKey);
      else delete (patch.ai as Partial<Settings["ai"]>).openaiApiKey;
    }
    if (patch.agent) {
      const pairingToken = patch.agent.pairingToken;
      if (clear.includes("agent.pairingToken")) patch.agent.pairingToken = "";
      else if (pairingToken) patch.agent.pairingToken = encryptSecret(pairingToken);
      else delete (patch.agent as Partial<Settings["agent"]>).pairingToken;
    }

    if (patch.processing) {
      const concurrency = Number(patch.processing.maxConcurrency);
      if (patch.processing.maxConcurrency !== undefined && (!Number.isFinite(concurrency) || concurrency < 1)) {
        return fail("Max concurrency must be at least 1", 400);
      }
    }
    if (patch.video?.fps !== undefined) {
      const fps = Number(patch.video.fps);
      if (!Number.isFinite(fps) || fps < 1 || fps > 120) return fail("Frame rate must be 1–120", 400);
    }

    const saved = await saveSettings(patch);
    return ok({ settings: toPublicSettings(saved) });
  } catch (error) {
    return handleError(error);
  }
}
