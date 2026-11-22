import { handleError, ok } from "@/lib/api";
import { getTelegramStatus } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(await getTelegramStatus());
  } catch (error) {
    return handleError(error, 500);
  }
}
