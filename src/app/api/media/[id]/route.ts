import fs from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { fail, handleError, ok } from "@/lib/api";
import { logActivity } from "@/lib/data";
import { resolveDataPath } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const rows = await db.select().from(media).where(eq(media.id, id)).limit(1);
    if (!rows[0]) return fail("Media not found", 404);
    return ok({ media: rows[0] });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const rows = await db.delete(media).where(eq(media.id, id)).returning();
    if (!rows[0]) return fail("Media not found", 404);
    for (const relative of [rows[0].relativePath, rows[0].thumbnailPath]) {
      if (!relative) continue;
      try {
        const absolute = resolveDataPath(relative);
        if (fs.existsSync(absolute)) fs.unlinkSync(absolute);
      } catch {
        // ignore cleanup errors
      }
    }
    await logActivity({
      projectId: rows[0].projectId,
      type: "media.deleted",
      message: `Removed ${rows[0].name} from the library`,
      meta: { mediaId: id },
    });
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
