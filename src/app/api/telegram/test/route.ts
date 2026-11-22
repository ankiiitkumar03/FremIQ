import { fail, handleError, ok, readJson } from "@/lib/api";
import { getTelegramStatus, sendTelegramMessage } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJson<{ text?: string }>(request);
    const status = await getTelegramStatus();
    if (!status.connected) return fail(status.message, 400);
    const text =
      body.text?.trim() ||
      `FREMIQ remote control is connected. ${new Date().toLocaleString()}`;
    const results = await sendTelegramMessage(text);
    const delivered = results.filter((result) => result.ok).length;
    if (delivered === 0) {
      return fail(
        `Telegram could not deliver the message: ${results.map((result) => result.error).filter(Boolean).join("; ")}`,
        502,
      );
    }
    return ok({ delivered, results });
  } catch (error) {
    return handleError(error);
  }
}
