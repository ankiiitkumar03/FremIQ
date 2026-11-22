import { handleError, ok } from "@/lib/api";
import { getBackendViews } from "@/lib/render/backends";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const backends = await getBackendViews();
    return ok({
      backends,
      defaultBackend: "ffmpeg",
      ffmpegAvailable: backends.find((backend) => backend.key === "ffmpeg")?.available ?? false,
    });
  } catch (error) {
    return handleError(error, 500);
  }
}
