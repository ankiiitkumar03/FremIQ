import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "./index";
import {
  activity,
  aiAgents,
  appSettings,
  editingPlans,
  jobs,
  media,
  projects,
  subtitleTracks,
  timelines,
} from "./schema";
import { dirs, ensureDirs, resolveDataPath, safeFileName, toRelative, uniqueName } from "../storage";
import { runFfmpeg } from "../media/ffmpeg";
import { probeMedia } from "../media/probe";
import { makeThumbnail } from "../media/import";
import { buildTimelineFromSegments, executeRenderSpec } from "../media/render";
import { generatePlan } from "../planner";
import { defaultSettings } from "../settings";
import { defaultSubtitleStyle, splitTranscriptToCues } from "../media/subtitles";
import type { RenderSpec } from "../types";

async function renderDemoAsset(name: string, args: string[]) {
  ensureDirs();
  const relative = `media/${uniqueName(safeFileName(name))}`;
  const absolute = resolveDataPath(relative);
  const result = await runFfmpeg([...args, "-y", absolute], { timeoutMs: 120_000 });
  if (result.code !== 0 || !fs.existsSync(absolute)) {
    throw new Error(`Failed to generate demo asset ${name}: ${result.stderr.slice(-400)}`);
  }
  return { relative, absolute };
}

async function insertMedia(input: {
  projectId: string;
  name: string;
  relative: string;
  absolute: string;
  mimeType: string;
}) {
  const probe = await probeMedia(input.absolute);
  const size = fs.statSync(input.absolute).size;
  const rows = await db
    .insert(media)
    .values({
      projectId: input.projectId,
      name: input.name,
      kind: probe.kind,
      mimeType: input.mimeType,
      relativePath: input.relative,
      sizeBytes: size,
      durationSec: probe.durationSec,
      width: probe.width,
      height: probe.height,
      fps: probe.fps,
      videoCodec: probe.videoCodec,
      audioCodec: probe.audioCodec,
      sampleRate: probe.sampleRate,
      channels: probe.channels,
      hasAudio: probe.hasAudio,
      metadata: { formatName: probe.formatName, seeded: true },
    })
    .returning();
  const thumbnail = await makeThumbnail(input.absolute, probe.kind, rows[0].id);
  if (thumbnail) {
    await db.update(media).set({ thumbnailPath: thumbnail }).where(eq(media.id, rows[0].id));
    rows[0].thumbnailPath = thumbnail;
  }
  return rows[0];
}

async function main() {
  ensureDirs();
  const existing = await db.select({ id: projects.id }).from(projects).limit(1);
  if (existing.length > 0) {
    console.log("FREMIQ demo data already exists. Seed skipped.");
    return;
  }

  console.log("Generating demo media with FFmpeg…");

  const interview = await renderDemoAsset("Aurora Launch Interview.mp4", [
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=1280x720:rate=30:duration=18",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=320:sample_rate=48000:duration=18",
    "-shortest",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
  ]);

  const broll = await renderDemoAsset("Aurora Product B-Roll.mp4", [
    "-f",
    "lavfi",
    "-i",
    "gradients=size=1280x720:rate=30:c0=0x101116:c1=0x7C3AED:c2=0xA78BFA:n=3:d=12",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=520:sample_rate=48000:duration=12",
    "-shortest",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
  ]);

  const music = await renderDemoAsset("Ambient Score.mp3", [
    "-f",
    "lavfi",
    "-i",
    "aevalsrc=0.18*sin(2*PI*220*t)+0.08*sin(2*PI*330*t):s=48000:d=24",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "192k",
  ]);

  const cover = await renderDemoAsset("Aurora Cover Frame.png", [
    "-f",
    "lavfi",
    "-i",
    "gradients=size=1280x720:r=30:c0=0x171820:c1=0x7C3AED:c2=0xA78BFA:n=3:d=1",
    "-frames:v",
    "1",
  ]);

  const podcast = await renderDemoAsset("Episode 14 - Master.mp3", [
    "-f",
    "lavfi",
    "-i",
    "aevalsrc=0.2*(1+0.4*sin(2*PI*0.7*t))*sin(2*PI*180*t):s=48000:d=30",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "192k",
  ]);

  const [aurora, podcastProject, clientProject] = await db
    .insert(projects)
    .values([
      {
        name: "Aurora Launch Film",
        description:
          "Launch film and vertical cutdowns for the Aurora product release. Demo workspace generated locally.",
        status: "active",
        aspectRatio: "16:9",
        resolution: "1920x1080",
        frameRate: 30,
        isDemo: true,
      },
      {
        name: "Podcast Cuts",
        description: "Weekly show masters, cleaned audio and caption tracks.",
        status: "active",
        aspectRatio: "9:16",
        resolution: "1080x1920",
        frameRate: 30,
        isDemo: true,
      },
      {
        name: "Client Reels",
        description: "Short-form social cuts awaiting a first editing plan.",
        status: "draft",
        aspectRatio: "9:16",
        resolution: "1080x1920",
        frameRate: 30,
        isDemo: true,
      },
    ])
    .returning();

  const interviewRow = await insertMedia({
    projectId: aurora.id,
    name: "Aurora Launch Interview.mp4",
    relative: interview.relative,
    absolute: interview.absolute,
    mimeType: "video/mp4",
  });
  const brollRow = await insertMedia({
    projectId: aurora.id,
    name: "Aurora Product B-Roll.mp4",
    relative: broll.relative,
    absolute: broll.absolute,
    mimeType: "video/mp4",
  });
  const musicRow = await insertMedia({
    projectId: aurora.id,
    name: "Ambient Score.mp3",
    relative: music.relative,
    absolute: music.absolute,
    mimeType: "audio/mpeg",
  });
  const coverRow = await insertMedia({
    projectId: aurora.id,
    name: "Aurora Cover Frame.png",
    relative: cover.relative,
    absolute: cover.absolute,
    mimeType: "image/png",
  });
  const podcastRow = await insertMedia({
    projectId: podcastProject.id,
    name: "Episode 14 - Master.mp3",
    relative: podcast.relative,
    absolute: podcast.absolute,
    mimeType: "audio/mpeg",
  });
  await insertMedia({
    projectId: clientProject.id,
    name: "Aurora Product B-Roll.mp4",
    relative: broll.relative,
    absolute: broll.absolute,
    mimeType: "video/mp4",
  });

  const transcript =
    "Every frame carries a decision. FREMIQ turns plain language into a structured editing plan. You review the plan before a single frame is rendered. Processing stays on your machine, and the original media is never modified.";
  const cues = splitTranscriptToCues(transcript, 14);

  const [subtitleRow] = await db
    .insert(subtitleTracks)
    .values({
      projectId: aurora.id,
      mediaId: interviewRow.id,
      name: "Aurora launch captions",
      language: "en",
      format: "srt",
      style: { ...defaultSubtitleStyle, preset: "karaoke", karaoke: true },
      cues,
      source: "demo",
    })
    .returning();

  const timelineData = buildTimelineFromSegments({
    sourceMediaId: interviewRow.id,
    sourceDuration: interviewRow.durationSec,
    segments: [{ start: 0, end: 8 }],
    aspectRatio: "16:9",
    resolution: "1920x1080",
    fps: 30,
  });
  timelineData.tracks.push({
    id: "v2",
    name: "Video 2 · B-roll",
    kind: "video",
    locked: false,
    visible: true,
    muted: false,
  });
  timelineData.clips.push({
    id: "clip-broll",
    trackId: "v1",
    mediaId: brollRow.id,
    name: "Product B-Roll",
    kind: "video",
    start: 8,
    duration: 6,
    inPoint: 0,
    speed: 1,
    volume: 0.4,
    fit: "cover",
    effects: { fadeIn: 0.4, fadeOut: 0.4, contrast: 1.06, saturation: 1.1 },
  });
  const [timelineRow] = await db
    .insert(timelines)
    .values({
      projectId: aurora.id,
      name: "Launch film · Main",
      data: timelineData as unknown as Record<string, unknown>,
      durationSec: 14,
      version: 3,
    })
    .returning();

  const plan = generatePlan({
    prompt:
      "Create two vertical clips with karaoke captions, remove silences and add a cinematic grade.",
    project: aurora,
    media: [interviewRow, brollRow, musicRow, coverRow],
    hasSubtitles: true,
    audioTracks: [musicRow],
  });
  const [planRow] = await db
    .insert(editingPlans)
    .values({
      projectId: aurora.id,
      prompt:
        "Create two vertical clips with karaoke captions, remove silences and add a cinematic grade.",
      summary: plan.summary,
      engine: plan.context.engine,
      status: "draft",
      operations: plan.operations,
      context: plan.context as unknown as Record<string, unknown>,
    })
    .returning();

  console.log("Rendering a verified demo export with FFmpeg…");
  const exportSpec: RenderSpec = {
    type: "clips",
    sourceMediaId: interviewRow.id,
    segments: [{ start: 1, end: 7, title: "Aurora opening" }],
    aspectRatio: "9:16",
    resolution: "1080x1920",
    fps: 30,
    subtitles: {
      cues: cues.filter((cue) => cue.end > 1 && cue.start < 7),
      style: { ...defaultSubtitleStyle, preset: "karaoke", karaoke: true },
    },
    titleCard: null,
  };
  const exportPath = path.join(dirs.exports, "demo-aurora-vertical.mp4");
  const exportResult = await executeRenderSpec(exportSpec, exportPath, () => undefined);
  const startedAt = new Date(Date.now() - 1000 * 60 * 9);
  const completedAt = new Date(Date.now() - 1000 * 60 * 8);

  const [completedJob] = await db
    .insert(jobs)
    .values({
      projectId: aurora.id,
      name: "Aurora · Vertical demo export",
      type: "clip",
      status: "completed",
      stage: "Completed",
      progress: 100,
      spec: exportSpec as unknown as Record<string, unknown>,
      outputPath: toRelative(exportPath),
      outputSizeBytes: exportResult.sizeBytes,
      logs: "Seeded demo export rendered and verified with the bundled FFmpeg engine.",
      source: "demo",
      startedAt,
      completedAt,
    })
    .returning();

  const audioPath = path.join(dirs.exports, "demo-podcast-clean.m4a");
  const audioSpec: RenderSpec = {
    type: "audio",
    sourceMediaId: podcastRow.id,
    operations: { normalize: true, fadeIn: 0.6, fadeOut: 1.2, format: "m4a" },
  };
  const audioResult = await executeRenderSpec(audioSpec, audioPath, () => undefined);
  const [audioJob] = await db
    .insert(jobs)
    .values({
      projectId: podcastProject.id,
      name: "Episode 14 · Normalise audio",
      type: "audio",
      status: "completed",
      stage: "Completed",
      progress: 100,
      spec: audioSpec as unknown as Record<string, unknown>,
      outputPath: toRelative(audioPath),
      outputSizeBytes: audioResult.sizeBytes,
      logs: "Seeded audio normalisation rendered and verified with FFmpeg loudnorm.",
      source: "demo",
      startedAt: new Date(Date.now() - 1000 * 60 * 40),
      completedAt: new Date(Date.now() - 1000 * 60 * 38),
    })
    .returning();

  await db.insert(subtitleTracks).values({
    projectId: podcastProject.id,
    mediaId: podcastRow.id,
    name: "Episode 14 captions",
    language: "en",
    format: "srt",
    style: { ...defaultSubtitleStyle, preset: "podcast", karaoke: true },
    cues: splitTranscriptToCues(
      "Welcome back to the show. Today we are talking about local-first creative workflows and why privacy matters for production teams.",
      20,
    ),
    source: "demo",
  });

  await db.insert(aiAgents).values(
    [
      {
        key: "codex",
        name: "Codex CLI",
        executablePath: "",
        enabled: true,
        status: "unknown",
        notes: "Run a health check to detect the Codex CLI on the processing host.",
        capabilities: ["Code generation", "Repository edits", "Shell workflows"],
      },
      {
        key: "claude",
        name: "[CC]",
        executablePath: "",
        enabled: true,
        status: "unknown",
        notes: "Run a health check to detect [CC] on the processing host.",
        capabilities: ["Code generation", "Refactoring", "Project context"],
      },
      {
        key: "gemini",
        name: "Gemini CLI",
        executablePath: "",
        enabled: true,
        status: "unknown",
        notes: "Run a health check to detect the Gemini CLI.",
        capabilities: ["Code generation", "Long-context analysis"],
      },
      {
        key: "cursor",
        name: "Cursor",
        executablePath: "",
        enabled: true,
        status: "unknown",
        notes: "Cursor's CLI is detected only when installed.",
        capabilities: ["Editor agent", "Codebase Q&A"],
      },
    ],
  ).onConflictDoNothing();

  await db
    .insert(appSettings)
    .values({ id: "default", data: defaultSettings })
    .onConflictDoNothing();

  await db.insert(activity).values([
    {
      projectId: aurora.id,
      type: "project.created",
      message: "Created project “Aurora Launch Film”",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 26),
    },
    {
      projectId: aurora.id,
      type: "media.imported",
      message: "Imported Aurora Launch Interview.mp4",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 25),
    },
    {
      projectId: aurora.id,
      type: "plan.created",
      message: "Drafted an AI editing plan for Aurora Launch Film",
      meta: { planId: planRow.id },
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3),
    },
    {
      projectId: aurora.id,
      type: "job.completed",
      message: "Rendered “Aurora · Vertical demo export”",
      meta: { jobId: completedJob.id },
      createdAt: completedAt,
    },
    {
      projectId: podcastProject.id,
      type: "job.completed",
      message: "Rendered “Episode 14 · Normalise audio”",
      meta: { jobId: audioJob.id },
      createdAt: new Date(Date.now() - 1000 * 60 * 38),
    },
    {
      projectId: clientProject.id,
      type: "project.created",
      message: "Created project “Client Reels”",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5),
    },
  ]);

  console.log(
    `Seed complete: 3 projects, 6 media items, ${subtitleRow ? "2" : "1"} subtitle tracks, timeline v${timelineRow.version}, ${planRow ? "1" : "0"} plan, 2 verified exports.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
