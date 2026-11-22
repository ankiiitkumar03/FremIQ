import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { fail, handleError, ok, readJson } from "@/lib/api";
import { getProjectById, logActivity } from "@/lib/data";
import { enqueueJob } from "@/lib/jobs/queue";
import { getBackendLabel, validateBackendSelection } from "@/lib/render/backends";
import type { MotionComposition, RenderSpec } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const presets = [
  "title",
  "lower-third",
  "intro",
  "outro",
  "logo",
  "social",
  "chart",
  "kinetic",
];

export async function POST(request: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(request);
    if (typeof body.projectId !== "string" || !body.projectId) {
      return fail("projectId is required", 400);
    }
    const project = await getProjectById(body.projectId);
    if (!project) return fail("Project not found", 404);

    const compositionInput = (body.composition ?? {}) as Partial<MotionComposition>;
    const preset = presets.includes(String(compositionInput.preset))
      ? String(compositionInput.preset)
      : "title";
    const resolution =
      typeof body.resolution === "string" ? body.resolution : project.resolution;
    const [width, height] = resolution.split("x").map(Number);
    const duration = Math.max(1, Math.min(30, Number(compositionInput.duration ?? 5)));

    const composition: MotionComposition = {
      preset,
      title: String(compositionInput.title ?? project.name).slice(0, 120),
      subtitle: String(compositionInput.subtitle ?? "").slice(0, 160),
      accent: String(compositionInput.accent ?? "#A78BFA").slice(0, 9),
      background: String(compositionInput.background ?? "#101116").slice(0, 9),
      width: width || 1920,
      height: height || 1080,
      duration,
      animation: ["fade", "slide", "scale", "typewriter"].includes(String(compositionInput.animation))
        ? (String(compositionInput.animation) as MotionComposition["animation"])
        : "fade",
    };

    let backgroundMediaId: string | null = null;
    if (typeof body.backgroundMediaId === "string" && body.backgroundMediaId) {
      const rows = await db.select().from(media).where(eq(media.id, body.backgroundMediaId)).limit(1);
      if (!rows[0]) return fail("Background media not found", 404);
      backgroundMediaId = rows[0].id;
    }

    const backend = typeof body.backend === "string" && body.backend ? body.backend : "ffmpeg";
    const spec: RenderSpec = {
      type: "motion",
      composition,
      backgroundMediaId,
      resolution,
      fps: Number(body.fps ?? project.frameRate ?? 30),
      duration,
    };
    const validation = await validateBackendSelection(backend, spec);
    if (!validation.ok) {
      return fail(
        `${validation.reason ?? "That backend is unavailable"}. Choose FFmpeg or install and enable the required extension.`,
        409,
        { backend },
      );
    }

    const job = await enqueueJob({
      projectId: project.id,
      name: `${project.name} · ${composition.preset} motion`,
      type: "motion",
      source: "motion-studio",
      backend,
      spec,
    });

    await logActivity({
      projectId: project.id,
      type: "motion.render",
      message: `Queued ${composition.preset} motion composition on ${getBackendLabel(backend)}`,
      meta: { jobId: job.id, backend },
    });

    return ok({ job, composition, backend }, 202);
  } catch (error) {
    return handleError(error);
  }
}
