import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { fail, handleError, streamFile } from "@/lib/api";
import { resolveDataPath } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const rows = await db.select().from(media).where(eq(media.id, id)).limit(1);
    const item = rows[0];
    if (!item?.thumbnailPath) return fail("Thumbnail not available", 404);
    return streamFile(request, resolveDataPath(item.thumbnailPath), { inline: true });
  } catch (error) {
    return handleError(error);
  }
}
