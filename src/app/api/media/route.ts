import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { handleError, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId");
    const kind = url.searchParams.get("kind");
    const rows = projectId
      ? await db
          .select()
          .from(media)
          .where(eq(media.projectId, projectId))
          .orderBy(desc(media.createdAt))
      : await db.select().from(media).orderBy(desc(media.createdAt));
    return ok({ media: kind ? rows.filter((item) => item.kind === kind) : rows });
  } catch (error) {
    return handleError(error, 500);
  }
}
