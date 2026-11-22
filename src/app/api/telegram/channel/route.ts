import { fail, handleError, ok, readJson } from "@/lib/api";
import { checkTelegramChannelAccess } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin) return fail("Channel check must be requested from this FREMIQ site", 403);
    const body = await readJson<{ chatId?: string }>(request);
    if (!body.chatId?.trim()) return fail("Enter a channel ID or @username", 400);
    return ok(await checkTelegramChannelAccess(body.chatId));
  } catch (error) {
    return handleError(error, 400);
  }
}
