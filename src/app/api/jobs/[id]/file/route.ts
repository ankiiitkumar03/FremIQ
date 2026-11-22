import path from "node:path";
import { fail, handleError, streamFile } from "@/lib/api";
import { getJobOutput } from "@/lib/jobs/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const output = await getJobOutput(id);
    if (!output) return fail("Output file is not available yet", 404);
    const url = new URL(request.url);
    const inline = url.searchParams.get("inline") === "1";
    return streamFile(request, output.absolutePath, {
      downloadName: `${output.job.name.replace(/[^\w.-]+/g, "-")}${path.extname(output.absolutePath)}`,
      inline,
    });
  } catch (error) {
    return handleError(error);
  }
}
