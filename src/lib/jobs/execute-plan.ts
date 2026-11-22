import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { editingPlans, subtitleTracks, type EditingPlan, type Project } from "@/lib/db/schema";
import { getProjectMedia } from "@/lib/data";
import type { ClipSegment, PlanOperation, SubtitleCue, SubtitleStyle, TimelineClip, TimelineData } from "@/lib/types";
import { detectSilences } from "@/lib/media/probe";
import { buildTimelineFromSegments } from "@/lib/media/render";
import { generateClipCandidates } from "@/lib/media/clips";
import { resolveDataPath } from "@/lib/storage";
import { defaultSubtitleStyle } from "@/lib/media/subtitles";
import { enqueueJob } from "./queue";

function complement(ranges: Array<{ start: number; end: number }>, total: number) {
  const sorted = ranges
    .map((range) => ({ start: Math.max(0, range.start), end: Math.min(total, range.end) }))
    .sort((a, b) => a.start - b.start);
  const output: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const range of sorted) {
    if (range.start > cursor + 0.15) output.push({ start: cursor, end: range.start });
    cursor = Math.max(cursor, range.end);
  }
  if (cursor < total - 0.15) output.push({ start: cursor, end: total });
  return output;
}

export type ExecutionResult = {
  jobs: Array<{ id: string; name: string }>;
  warnings: string[];
  analysis?: Record<string, unknown>;
};

export async function executePlan(
  plan: EditingPlan,
  project: Project,
  delivery: { telegramChatId?: string; source?: string } = {},
): Promise<ExecutionResult> {
  if (plan.status === "executed") throw new Error("This plan has already been rendered");
  if (plan.status !== "approved") throw new Error("Approve the plan before rendering");

  const operations = plan.operations as PlanOperation[];
  const active = operations.filter((operation) => operation.status !== "skipped");
  const context = (plan.context ?? {}) as Record<string, unknown>;
  const mediaRows = await getProjectMedia(project.id);
  const videos = mediaRows.filter((item) => item.kind === "video");
  const sourceId = (context.sourceMediaId as string) ?? videos[0]?.id;
  const source = mediaRows.find((item) => item.id === sourceId) ?? videos[0];
  if (!source) throw new Error("The source video is missing from this project");

  const subtitleRows = await db
    .select()
    .from(subtitleTracks)
    .where(eq(subtitleTracks.projectId, project.id))
    .orderBy(desc(subtitleTracks.updatedAt));
  const subtitle = subtitleRows.find((row) => row.mediaId === source.id) ?? null;

  const warnings: string[] = [];
  const aspectRatio = (context.aspectRatio as string) ?? project.aspectRatio ?? "16:9";
  const resolution = (context.resolution as string) ?? project.resolution ?? "1920x1080";
  const fps = Number(context.fps ?? project.frameRate ?? 30);
  const captionsOp = active.find((operation) => operation.type === "captions");
  const style: SubtitleStyle = subtitle
    ? ({ ...defaultSubtitleStyle, ...(subtitle.style as SubtitleStyle) } as SubtitleStyle)
    : defaultSubtitleStyle;
  const captionCues: SubtitleCue[] = subtitle ? (subtitle.cues as SubtitleCue[]) : [];

  if (captionsOp && captionCues.length === 0) {
    warnings.push("Captions were requested but no subtitle track exists. Add one in Subtitle Studio first.");
  }

  const clipOp = active.find((operation) => operation.type === "clip");
  if (clipOp) {
    const count = Number(clipOp.parameters.count ?? 3);
    const duration = Number(clipOp.parameters.duration ?? 30);
    const { candidates, analysis } = await generateClipCandidates({
      media: source,
      count,
      duration,
      subtitles: captionCues,
    });
    warnings.push(...analysis.warnings);

    const created: Array<{ id: string; name: string }> = [];
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const name = `${project.name} · Clip ${index + 1}`;
      const job = await enqueueJob({
        projectId: project.id,
        planId: plan.id,
        name,
        type: "clip",
        source: delivery.source ?? "ai-editor",
        telegramDelivery: delivery.telegramChatId ? { chatId: delivery.telegramChatId } : undefined,
        spec: {
          type: "clips",
          sourceMediaId: source.id,
          segments: [candidate],
          aspectRatio,
          resolution,
          fps,
          subtitles:
            captionCues.length > 0 ? { cues: captionCues, style } : null,
          titleCard: null,
        },
      });
      created.push({ id: job.id, name: job.name });
    }

    await db
      .update(editingPlans)
      .set({ status: "executed", updatedAt: new Date() })
      .where(eq(editingPlans.id, plan.id));

    return {
      jobs: created,
      warnings,
      analysis: {
        sceneCount: analysis.sceneCount,
        silenceCount: analysis.silenceCount,
        speechSeconds: analysis.speechSeconds,
        method: analysis.method,
        candidates: candidates.map((candidate) => ({
          start: candidate.start,
          end: candidate.end,
          score: candidate.score,
          title: candidate.title,
        })),
      },
    };
  }

  const silenceOp = active.find((operation) => operation.type === "silence");
  let segments: ClipSegment[] = [];
  if (silenceOp) {
    const absolutePath = resolveDataPath(source.relativePath);
    const silences = await detectSilences(absolutePath, {
      noiseDb: Number(silenceOp.parameters.noiseDb ?? -35),
      minDuration: Number(silenceOp.parameters.minDuration ?? 0.7),
    });
    const speech = complement(silences, source.durationSec ?? 0);
    if (speech.length > 0) {
      segments = speech.map((range) => ({ start: range.start, end: range.end }));
      warnings.push(
        `Removed ${silences.length} silent range(s); the edit keeps ${speech.length} speech segment(s).`,
      );
    } else {
      warnings.push("No speech segments were found after silence detection; using the full source.");
    }
  }
  if (segments.length === 0) {
    segments = [{ start: 0, end: source.durationSec ?? 10 }];
  }

  const timeline: TimelineData = buildTimelineFromSegments({
    sourceMediaId: source.id,
    sourceDuration: source.durationSec,
    segments,
    aspectRatio,
    resolution,
    fps,
  });

  const colorOp = active.find((operation) => operation.type === "color");
  const transitionOp = active.find((operation) => operation.type === "transitions");
  const speedOp = active.find((operation) => operation.type === "speed");
  const motionOp = active.find((operation) => operation.type === "motion");
  const audioOp = active.find((operation) => operation.type === "audio");

  for (const clip of timeline.clips) {
    if (colorOp) {
      clip.effects = {
        ...clip.effects,
        brightness: Number(colorOp.parameters.brightness ?? 0.98),
        contrast: Number(colorOp.parameters.contrast ?? 1.08),
        saturation: Number(colorOp.parameters.saturation ?? 1.12),
      };
    }
    if (transitionOp) {
      clip.effects = {
        ...clip.effects,
        fadeIn: Number(transitionOp.parameters.duration ?? 0.35),
        fadeOut: Number(transitionOp.parameters.duration ?? 0.35),
      };
    }
    if (speedOp) {
      clip.speed = Number(speedOp.parameters.speed ?? 1);
    }
  }

  if (motionOp) {
    const duration = Number(motionOp.parameters.duration ?? 2.6);
    const textClip: TimelineClip = {
      id: "motion-title",
      trackId: "t1",
      name: "Animated title",
      kind: "text",
      start: 0.4,
      duration,
      inPoint: 0,
      speed: 1,
      volume: 0,
      fit: "cover",
      text: {
        content: String(motionOp.parameters.text ?? project.name),
        fontSize: 72,
        color: "#F5F5F7",
        position: "center",
      },
    };
    timeline.tracks.push({
      id: "t1",
      name: "Titles",
      kind: "text",
      locked: false,
      visible: true,
      muted: false,
    });
    timeline.clips.push(textClip);
  }

  const musicId = audioOp?.parameters.mediaId ? String(audioOp.parameters.mediaId) : null;
  const music = musicId ? mediaRows.find((item) => item.id === musicId) : null;

  const job = await enqueueJob({
    projectId: project.id,
    planId: plan.id,
    name: `${project.name} · ${plan.summary.slice(0, 48)}`,
    type: "render",
    source: delivery.source ?? "ai-editor",
    telegramDelivery: delivery.telegramChatId ? { chatId: delivery.telegramChatId } : undefined,
    spec: {
      type: "timeline",
      timeline,
      subtitles:
        captionsOp && captionCues.length > 0 ? { cues: captionCues, style } : null,
      music: music ? { mediaId: music.id, volume: Number(audioOp?.parameters.volume ?? 0.28) } : null,
      duration: timeline.clips.reduce((sum, clip) => sum + clip.duration, 0),
    },
  });

  await db
    .update(editingPlans)
    .set({ status: "executed", updatedAt: new Date() })
    .where(eq(editingPlans.id, plan.id));

  return { jobs: [{ id: job.id, name: job.name }], warnings };
}
