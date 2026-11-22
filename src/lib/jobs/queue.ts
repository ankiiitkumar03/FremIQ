import fs from "node:fs";
import path from "node:path";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { dirs, resolveDataPath, toRelative } from "@/lib/storage";
import { logActivity } from "@/lib/data";
import type { RenderSpec } from "@/lib/types";
import { getSettings } from "@/lib/settings";
import { executeWithBackend, getBackend, getBackendLabel } from "@/lib/render/backends";
import { parseIdList, sendTelegramMessageToChat, sendTelegramVideo } from "@/lib/telegram";

type QueueState = {
  running: boolean;
  recovered: boolean;
  controllers: Map<string, AbortController>;
  timer: NodeJS.Timeout | null;
};

const globalForQueue = globalThis as unknown as { fremiqQueue?: QueueState };

const state: QueueState =
  globalForQueue.fremiqQueue ??
  (globalForQueue.fremiqQueue = {
    running: false,
    recovered: false,
    controllers: new Map(),
    timer: null,
  });

const ACTIVE_STATUSES = ["queued", "preparing", "analyzing", "processing", "rendering"];

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "job"
  );
}

function extensionForSpec(spec: RenderSpec) {
  if (spec.type === "audio") return spec.operations.format;
  return "mp4";
}

function appendLog(existing: string, line: string) {
  const stamped = `[${new Date().toISOString()}] ${line}`;
  const next = `${existing}${existing ? "\n" : ""}${stamped}`;
  return next.length > 24_000 ? next.slice(next.length - 24_000) : next;
}

export async function enqueueJob(input: {
  projectId: string;
  planId?: string | null;
  name: string;
  type?: string;
  spec: RenderSpec;
  source?: string;
  priority?: number;
  backend?: string;
  telegramDelivery?: { chatId?: string };
}) {
  const settings = await getSettings();
  const allowedChats = parseIdList(settings.telegram.chatAllowlist);
  const autoPostChannel = settings.telegram.enabled && settings.telegram.autoPostEnabled && settings.telegram.autoPostChatId && allowedChats.includes(settings.telegram.autoPostChatId)
    ? settings.telegram.autoPostChatId
    : null;
  const telegramDelivery = input.telegramDelivery?.chatId || autoPostChannel
    ? { chatId: input.telegramDelivery?.chatId ?? null, channelId: autoPostChannel }
    : undefined;
  const spec = telegramDelivery
    ? { ...input.spec, _telegramDelivery: telegramDelivery } as unknown as RenderSpec
    : input.spec;
  const rows = await db
    .insert(jobs)
    .values({
      projectId: input.projectId,
      planId: input.planId ?? null,
      name: input.name,
      type: input.type ?? (input.spec.type === "audio" ? "audio" : "render"),
      status: "queued",
      stage: "Queued",
      spec: spec as unknown as Record<string, unknown>,
      source: input.source ?? "web",
      priority: input.priority ?? 0,
      backend: input.backend ?? "ffmpeg",
      logs: appendLog(
        "",
        `Queued ${input.spec.type} job on the ${getBackendLabel(input.backend)} backend`,
      ),
    })
    .returning();
  const job = rows[0];
  await logActivity({
    projectId: input.projectId,
    type: "job.queued",
    message: `Queued render “${input.name}”`,
    meta: { jobId: job.id, type: job.type, backend: job.backend },
  });
  kickQueue();
  return job;
}

async function deliverTelegramOutput(job: typeof jobs.$inferSelect, outputPath: string) {
  const metadata = (job.spec as Record<string, unknown>)._telegramDelivery as
    | { chatId?: string | null; channelId?: string | null }
    | undefined;
  if (!metadata) return;
  let channelId = metadata.channelId;
  if (channelId) {
    const settings = await getSettings();
    if (!settings.telegram.enabled || !settings.telegram.autoPostEnabled || settings.telegram.autoPostChatId !== channelId) channelId = null;
  }
  const targets = Array.from(new Set([metadata.chatId, channelId].filter((value): value is string => Boolean(value))));
  const failed: string[] = [];
  for (const chatId of targets) {
    try {
      await sendTelegramVideo(chatId, outputPath, `FREMIQ render ready · ${job.name}`);
    } catch (error) {
      failed.push(`${chatId}: ${error instanceof Error ? error.message : "Telegram delivery failed"}`);
    }
  }
  if (failed.length) {
    const text = `Render “${job.name}” completed, but Telegram delivery failed: ${failed.join("; ")}`;
    await logActivity({ projectId: job.projectId, type: "telegram.delivery.failed", message: text, meta: { jobId: job.id } });
    if (metadata.chatId) {
      try { await sendTelegramMessageToChat(metadata.chatId, text); } catch { /* chat may have been removed */ }
    }
  } else {
    await logActivity({ projectId: job.projectId, type: "telegram.delivery.sent", message: `Delivered “${job.name}” to Telegram`, meta: { jobId: job.id, targets } });
  }
}

export async function cancelJob(jobId: string) {
  const rows = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  const job = rows[0];
  if (!job) throw new Error("Job not found");
  if (!ACTIVE_STATUSES.includes(job.status)) {
    throw new Error(`Job is already ${job.status}`);
  }
  state.controllers.get(jobId)?.abort();
  state.controllers.delete(jobId);
  await db
    .update(jobs)
    .set({
      status: "cancelled",
      stage: "Cancelled",
      completedAt: new Date(),
      updatedAt: new Date(),
      logs: appendLog(job.logs, "Cancellation requested by user"),
    })
    .where(eq(jobs.id, jobId));
  await logActivity({
    projectId: job.projectId,
    type: "job.cancelled",
    message: `Cancelled “${job.name}”`,
    meta: { jobId },
  });
  return { ok: true };
}

export async function retryJob(jobId: string) {
  const rows = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  const job = rows[0];
  if (!job) throw new Error("Job not found");
  if (ACTIVE_STATUSES.includes(job.status)) throw new Error("Job is still active");
  await db
    .update(jobs)
    .set({
      status: "queued",
      stage: "Queued",
      progress: 0,
      error: null,
      completedAt: null,
      startedAt: null,
      outputPath: null,
      outputSizeBytes: null,
      updatedAt: new Date(),
      logs: appendLog(job.logs, "Retry requested by user"),
    })
    .where(eq(jobs.id, jobId));
  kickQueue();
  return { ok: true };
}

export async function recoverInterruptedJobs() {
  if (state.recovered) return;
  state.recovered = true;
  const stale = await db
    .select({ id: jobs.id, name: jobs.name, logs: jobs.logs })
    .from(jobs)
    .where(inArray(jobs.status, ["preparing", "analyzing", "processing", "rendering"]));
  for (const job of stale) {
    await db
      .update(jobs)
      .set({
        status: "queued",
        stage: "Recovered after restart",
        progress: 0,
        updatedAt: new Date(),
        logs: appendLog(job.logs, "Job was interrupted by a server restart and has been re-queued"),
      })
      .where(eq(jobs.id, job.id));
  }
}

async function updateJob(
  jobId: string,
  values: Partial<typeof jobs.$inferInsert>,
  throttle?: { last: number; fraction: number },
) {
  if (throttle) {
    const now = Date.now();
    if (now - throttle.last < 1200 && values.progress !== 100) return;
    throttle.last = now;
    throttle.fraction = Number(values.progress ?? throttle.fraction);
  }
  await db.update(jobs).set({ ...values, updatedAt: new Date() }).where(eq(jobs.id, jobId));
}

async function processJob(jobId: string) {
  const rows = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  const job = rows[0];
  if (!job || job.status !== "queued") return;

  const controller = new AbortController();
  state.controllers.set(jobId, controller);
  const spec = job.spec as unknown as RenderSpec;
  const extension = extensionForSpec(spec);
  const outputName = `${jobId.slice(0, 8)}-${slugify(job.name)}.${extension}`;
  const outputAbs = path.join(dirs.exports, outputName);
  fs.mkdirSync(dirs.exports, { recursive: true });

  const throttle = { last: 0, fraction: 0 };
  const backendKey = job.backend ?? "ffmpeg";
  let logs = appendLog(
    job.logs,
    `Worker started · backend: ${getBackend(backendKey).label}`,
  );

  await updateJob(jobId, {
    status: "preparing",
    stage: "Preparing",
    progress: 1,
    startedAt: new Date(),
    logs,
  });

  try {
    const result = await executeWithBackend(backendKey, {
      jobId,
      spec,
      outputPath: outputAbs,
      signal: controller.signal,
      onProgress: async (stage, fraction, log) => {
        logs = appendLog(logs, `${stage}: ${log}`);
        await updateJob(
          jobId,
          {
            stage,
            status: stage === "Verifying" ? "rendering" : stage === "Processing" ? "processing" : "rendering",
            progress: Math.max(1, Math.min(99, Math.round(fraction * 100))),
            logs,
          },
          throttle,
        );
      },
    });

    const current = await db.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (current[0]?.status === "cancelled") return;

    const completedLog = appendLog(
      logs,
      `Completed with ${result.backend}: ${result.sizeBytes} bytes, ${result.durationSec ?? 0}s`,
    );
    await db
      .update(jobs)
      .set({
        status: "completed",
        stage: "Completed",
        progress: 100,
        outputPath: toRelative(outputAbs),
        outputSizeBytes: result.sizeBytes,
        completedAt: new Date(),
        updatedAt: new Date(),
        logs: completedLog,
      })
      .where(eq(jobs.id, jobId));

    try {
      await logActivity({
        projectId: job.projectId,
        type: "job.completed",
        message: `Rendered “${job.name}”`,
        meta: { jobId, output: outputName, sizeBytes: result.sizeBytes },
      });
    } catch (error) {
      console.error(`[fremiq-queue] completion activity could not be recorded for ${jobId}`, error);
    }
    try {
      await deliverTelegramOutput(job, outputAbs);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`[fremiq-queue] post-render delivery failed for ${jobId}`, error);
      try {
        await updateJob(jobId, { logs: appendLog(completedLog, `Post-render delivery failed: ${detail}`) });
      } catch {
        // Keep the completed render even if its follow-up log cannot be saved.
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const current = await db.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (current[0]?.status === "cancelled") return;
    await db
      .update(jobs)
      .set({
        status: "failed",
        stage: "Failed",
        error: message,
        completedAt: new Date(),
        updatedAt: new Date(),
        logs: appendLog(logs, `Failed: ${message}`),
      })
      .where(eq(jobs.id, jobId));
    await logActivity({
      projectId: job.projectId,
      type: "job.failed",
      message: `Render failed for “${job.name}”`,
      meta: { jobId, error: message },
    });
  } finally {
    state.controllers.delete(jobId);
  }
}

async function tick() {
  if (state.running) return;
  state.running = true;
  try {
    await recoverInterruptedJobs();
    const settings = await getSettings();
    const concurrency = Math.max(1, Math.min(2, settings.processing.maxConcurrency ?? 1));
    const active = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(inArray(jobs.status, ["preparing", "analyzing", "processing", "rendering"]));
    const slots = Math.max(0, concurrency - active.length);
    if (slots === 0) return;
    const queued = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.status, "queued"))
      .orderBy(asc(jobs.priority), asc(jobs.createdAt))
      .limit(slots);
    await Promise.all(queued.map((job) => processJob(job.id)));
  } catch (error) {
    console.error("[fremiq-queue] tick failed", error);
  } finally {
    state.running = false;
  }
}

export function kickQueue() {
  setTimeout(() => {
    void tick();
  }, 50);
  if (!state.timer) {
    state.timer = setInterval(() => {
      void tick();
    }, 4000);
    if (typeof state.timer.unref === "function") state.timer.unref();
  }
}

export async function getQueueSummary() {
  const rows = await db.select({ status: jobs.status }).from(jobs);
  const summary = { queued: 0, running: 0, completed: 0, failed: 0, cancelled: 0 };
  for (const row of rows) {
    if (row.status === "queued") summary.queued += 1;
    else if (["preparing", "analyzing", "processing", "rendering"].includes(row.status))
      summary.running += 1;
    else if (row.status === "completed") summary.completed += 1;
    else if (row.status === "failed") summary.failed += 1;
    else if (row.status === "cancelled") summary.cancelled += 1;
  }
  return summary;
}

export async function getJobOutput(jobId: string) {
  const rows = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  const job = rows[0];
  if (!job?.outputPath) return null;
  const absolute = resolveDataPath(job.outputPath);
  if (!fs.existsSync(absolute)) return null;
  return { job, absolutePath: absolute };
}
