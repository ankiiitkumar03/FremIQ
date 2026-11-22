import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { media, type MediaItem } from "@/lib/db/schema";
import { dirs, resolveDataPath } from "@/lib/storage";
import type {
  ClipSegment,
  RenderSpec,
  SubtitleCue,
  TimelineClip,
  TimelineData,
} from "@/lib/types";
import { FFMPEG_PATH, runFfmpeg } from "./ffmpeg";
import { probeMedia } from "./probe";
import {
  buildAssFile,
  buildMotionAss,
  defaultSubtitleStyle,
  textStyleFromClip,
} from "./subtitles";

export type RenderProgress = (stage: string, fraction: number, log: string) => Promise<void> | void;

export const aspectDimensions: Record<string, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
  "4:3": { width: 1440, height: 1080 },
  "21:9": { width: 2520, height: 1080 },
};

export function parseResolution(resolution: string) {
  const [width, height] = resolution.split("x").map(Number);
  if (!width || !height) return { width: 1920, height: 1080 };
  return { width, height };
}

function escapeFilterPath(filePath: string) {
  return filePath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function atempoChain(speed: number) {
  let remaining = Math.min(4, Math.max(0.25, speed));
  const filters: string[] = [];
  while (remaining > 2.0001) {
    filters.push("atempo=2");
    remaining /= 2;
  }
  while (remaining < 0.5001) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }
  filters.push(`atempo=${remaining.toFixed(4)}`);
  return filters.join(",");
}

export async function loadMediaForRender(id: string): Promise<{ row: MediaItem; absolutePath: string }> {
  const rows = await db.select().from(media).where(eq(media.id, id)).limit(1);
  const row = rows[0];
  if (!row) throw new Error(`Media ${id} was not found`);
  const absolutePath = resolveDataPath(row.relativePath);
  if (!fs.existsSync(absolutePath)) throw new Error(`Media file missing: ${row.name}`);
  return { row, absolutePath };
}

const loadMedia = loadMediaForRender;

type InputPlan = {
  args: string[];
  indexById: Map<string, number>;
  nextIndex: number;
};

function createInputPlan(): InputPlan {
  return { args: [], indexById: new Map(), nextIndex: 0 };
}

function addInput(plan: InputPlan, key: string, absolutePath: string, options: { loop?: boolean; streamLoop?: boolean } = {}) {
  if (plan.indexById.has(key)) return plan.indexById.get(key)!;
  if (options.streamLoop) plan.args.push("-stream_loop", "-1");
  if (options.loop) plan.args.push("-loop", "1");
  plan.args.push("-i", absolutePath);
  const index = plan.nextIndex;
  plan.indexById.set(key, index);
  plan.nextIndex += 1;
  return index;
}

export function buildTimelineFromSegments(input: {
  sourceMediaId: string;
  sourceDuration: number | null;
  segments: ClipSegment[];
  aspectRatio: string;
  resolution: string;
  fps: number;
  name?: string;
}): TimelineData {
  const { width, height } = parseResolution(input.resolution);
  const clips: TimelineClip[] = input.segments.map((segment, index) => ({
    id: `clip-${index + 1}`,
    trackId: "v1",
    mediaId: input.sourceMediaId,
    name: segment.title ?? input.name ?? `Clip ${index + 1}`,
    kind: "video",
    start: index === 0 ? 0 : input.segments.slice(0, index).reduce((sum, item) => sum + (item.end - item.start), 0),
    duration: Math.max(0.2, segment.end - segment.start),
    inPoint: Math.max(0, segment.start),
    speed: 1,
    volume: 1,
    fit: "cover",
  }));
  return {
    tracks: [
      { id: "v1", name: "Video 1", kind: "video", locked: false, visible: true, muted: false },
      { id: "a1", name: "Audio 1", kind: "audio", locked: false, visible: true, muted: false },
    ],
    clips,
    settings: {
      width,
      height,
      fps: input.fps,
      aspectRatio: input.aspectRatio,
      background: "#101116",
    },
  };
}

async function renderTimelineSpec(
  spec: Extract<RenderSpec, { type: "timeline" }>,
  outputPath: string,
  onProgress: RenderProgress,
  signal?: AbortSignal,
) {
  const timeline = spec.timeline;
  const { width, height, fps } = timeline.settings;
  const background = /^#[0-9a-f]{6}$/i.test(timeline.settings.background)
    ? timeline.settings.background.replace("#", "0x")
    : "0x101116";
  const tracks = new Map(timeline.tracks.map((track) => [track.id, track]));
  const clips = timeline.clips.filter((clip) => tracks.get(clip.trackId)?.visible !== false);
  const total = Math.max(
    spec.duration,
    ...clips.map((clip) => clip.start + clip.duration),
    0.5,
  );
  const visualClips = clips.filter(
    (clip) => (clip.kind === "video" || clip.kind === "image") && tracks.get(clip.trackId)?.kind !== "audio",
  );
  if (visualClips.length === 0) throw new Error("Timeline has no visible video or image clips to render");

  const plan = createInputPlan();
  const filters: string[] = [];
  filters.push(`color=c=${background}:s=${width}x${height}:r=${fps}:d=${total.toFixed(3)},format=rgba[canvas0]`);
  let canvas = "canvas0";

  const orderedVisuals = [...visualClips].sort((left, right) => {
    const leftTrack = timeline.tracks.findIndex((track) => track.id === left.trackId);
    const rightTrack = timeline.tracks.findIndex((track) => track.id === right.trackId);
    // Tracks are displayed top-to-bottom, so render the lower rows first and
    // the top row last to keep the visual stacking order intuitive.
    return rightTrack - leftTrack || left.start - right.start;
  });
  for (let index = 0; index < orderedVisuals.length; index += 1) {
    const clip = orderedVisuals[index];
    if (!clip.mediaId) continue;
    const mediaItem = await loadMedia(clip.mediaId);
    const isImage = mediaItem.row.kind === "image" || clip.kind === "image";
    const inputIndex = addInput(plan, `timeline:${clip.mediaId}`, mediaItem.absolutePath, { loop: isImage });
    const speed = Math.max(0.25, Math.min(4, clip.speed || 1));
    const duration = Math.max(0.1, clip.duration);
    const sourceStart = Math.max(0, clip.inPoint);
    const sourceDuration = duration * speed;
    const fit = clip.fit === "contain"
      ? `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=${background}`
      : `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
    const label = `layer${index}`;
    const sourceFilters = [
      `trim=start=${sourceStart.toFixed(3)}:duration=${sourceDuration.toFixed(3)}`,
      `setpts=(PTS-STARTPTS)/${speed.toFixed(4)}+${clip.start.toFixed(3)}/TB`,
      fit,
      `fps=${fps}`,
    ];
    const effects = clip.effects ?? {};
    if (effects.brightness !== undefined || effects.contrast !== undefined || effects.saturation !== undefined) {
      sourceFilters.push(`eq=brightness=${(effects.brightness ?? 1) - 1}:contrast=${effects.contrast ?? 1}:saturation=${effects.saturation ?? 1}`);
    }
    if (effects.blur && effects.blur > 0) sourceFilters.push(`boxblur=${effects.blur}:1`);
    if (effects.fadeIn && effects.fadeIn > 0) sourceFilters.push(`fade=t=in:st=0:d=${effects.fadeIn}:alpha=1`);
    if (effects.fadeOut && effects.fadeOut > 0) {
      sourceFilters.push(`fade=t=out:st=${Math.max(0, duration - effects.fadeOut).toFixed(3)}:d=${effects.fadeOut}:alpha=1`);
    }
    sourceFilters.push("format=rgba", "setsar=1");
    filters.push(`[${inputIndex}:v]${sourceFilters.join(",")}[${label}]`);
    const nextCanvas = `canvas${index + 1}`;
    const clipEnd = Math.min(total, clip.start + duration);
    filters.push(`[${canvas}][${label}]overlay=0:0:eof_action=pass:shortest=0:enable='between(t,${clip.start.toFixed(3)},${clipEnd.toFixed(3)})'[${nextCanvas}]`);
    canvas = nextCanvas;
  }

  const audioLabels: string[] = [];
  let audioIndex = 0;
  for (const clip of clips) {
    const track = tracks.get(clip.trackId);
    if (track?.muted || !clip.mediaId || (clip.kind !== "audio" && clip.kind !== "video")) continue;
    const mediaItem = await loadMedia(clip.mediaId);
    if (!mediaItem.row.hasAudio) continue;
    const inputIndex = addInput(plan, `timeline:${clip.mediaId}`, mediaItem.absolutePath);
    const speed = Math.max(0.25, Math.min(4, clip.speed || 1));
    const sourceStart = Math.max(0, clip.inPoint);
    const duration = Math.max(0.1, clip.duration);
    const label = `aud${audioIndex++}`;
    const audioFilters = [
      `atrim=start=${sourceStart.toFixed(3)}:duration=${(duration * speed).toFixed(3)}`,
      "asetpts=PTS-STARTPTS",
      "aresample=48000",
      "aformat=sample_fmts=fltp:channel_layouts=stereo",
    ];
    if (speed !== 1) audioFilters.push(atempoChain(speed));
    audioFilters.push(`volume=${Math.max(0, Math.min(2, clip.volume ?? 1))}`);
    audioFilters.push(`adelay=${Math.round(clip.start * 1000)}:all=1`, `apad=pad_dur=${total.toFixed(3)}`, `atrim=duration=${total.toFixed(3)}`, "asetpts=PTS-STARTPTS");
    filters.push(`[${inputIndex}:a]${audioFilters.join(",")}[${label}]`);
    audioLabels.push(`[${label}]`);
  }

  if (spec.music) {
    const music = await loadMedia(spec.music.mediaId);
    const inputIndex = addInput(plan, `timeline-music:${spec.music.mediaId}`, music.absolutePath, { streamLoop: true });
    filters.push(`[${inputIndex}:a]atrim=duration=${total.toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${Math.max(0, Math.min(2, spec.music.volume))}[music]`);
    audioLabels.push("[music]");
  }
  if (audioLabels.length === 0) {
    filters.push(`anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${total.toFixed(3)}[audioout]`);
  } else if (audioLabels.length === 1) {
    filters.push(`${audioLabels[0]}anull[audioout]`);
  } else {
    filters.push(`${audioLabels.join("")}amix=inputs=${audioLabels.length}:duration=longest:dropout_transition=0:normalize=0,atrim=duration=${total.toFixed(3)}[audioout]`);
  }

  const visibleTextTracks = new Set(timeline.tracks.filter((track) => ["text", "overlay", "subtitle"].includes(track.kind) && track.visible).map((track) => track.id));
  const textClips = timeline.clips.filter((clip) => clip.kind === "text" && clip.text?.content && visibleTextTracks.has(clip.trackId));
  let videoOut = canvas;
  if (spec.subtitles?.cues.length) {
    fs.mkdirSync(dirs.temp, { recursive: true });
    const assPath = path.join(dirs.temp, `timeline-subs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.ass`);
    fs.writeFileSync(assPath, buildAssFile({ width, height, cues: spec.subtitles.cues, style: spec.subtitles.style ?? defaultSubtitleStyle }), "utf8");
    filters.push(`[${videoOut}]ass='${escapeFilterPath(assPath)}'[withsubs]`);
    videoOut = "withsubs";
  }
  for (let index = 0; index < textClips.length; index += 1) {
    const clip = textClips[index];
    if (!clip.text?.content) continue;
    fs.mkdirSync(dirs.temp, { recursive: true });
    const assPath = path.join(dirs.temp, `timeline-title-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}.ass`);
    const cue: SubtitleCue = { id: clip.id, start: clip.start, end: clip.start + clip.duration, text: clip.text.content };
    fs.writeFileSync(assPath, buildAssFile({ width, height, cues: [cue], style: textStyleFromClip(clip.text) }), "utf8");
    const nextVideo = `title${index}`;
    filters.push(`[${videoOut}]ass='${escapeFilterPath(assPath)}'[${nextVideo}]`);
    videoOut = nextVideo;
  }

  await onProgress("Rendering", 0.05, `Compositing ${orderedVisuals.length} video layer(s) across ${audioLabels.length} audio track(s)`);
  const result = await runFfmpeg([
    ...plan.args,
    "-filter_complex", filters.join(";"),
    "-map", `[${videoOut}]`,
    "-map", "[audioout]",
    "-t", total.toFixed(3),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", "-y", outputPath,
  ], {
    totalDuration: total,
    signal,
    timeoutMs: 45 * 60 * 1000,
    onProgress: (fraction, log) => onProgress("Rendering", 0.1 + fraction * 0.85, log),
  });
  if (result.code !== 0) throw new Error(`FFmpeg timeline composite failed: ${result.stderr.split("\n").slice(-12).join("\n")}`);
}

async function renderSplitClipsSpec(
  spec: Extract<RenderSpec, { type: "clips" }>,
  outputPath: string,
  onProgress: RenderProgress,
  signal?: AbortSignal,
) {
  if (!spec.splitScreen) throw new Error("Split-screen settings are missing");
  const source = await loadMedia(spec.sourceMediaId);
  const camera = await loadMedia(spec.splitScreen.mediaId);
  if (source.row.kind !== "video" || camera.row.kind !== "video") {
    throw new Error("Split-screen needs two video files");
  }
  const { width, height } = parseResolution(spec.resolution);
  const paneWidth =
    spec.splitScreen.layout === "side-by-side" ? Math.max(2, Math.floor(width / 4) * 2) : width;
  const paneHeight =
    spec.splitScreen.layout === "top-bottom" ? Math.max(2, Math.floor(height / 4) * 2) : height;
  const plan = createInputPlan();
  const sourceIndex = addInput(plan, "split-main:" + source.row.id, source.absolutePath);
  const cameraIndex = addInput(plan, "split-camera:" + camera.row.id, camera.absolutePath);
  const filterParts: string[] = [];
  const videoLabels: string[] = [];
  const audioLabels: string[] = [];
  const offset = Math.max(0, spec.splitScreen.cameraOffsetSec);
  let totalDuration = 0;

  for (let index = 0; index < spec.segments.length; index += 1) {
    const segment = spec.segments[index];
    const start = Math.max(0, segment.start);
    const end = segment.end;
    const cameraStart = start + offset;
    const cameraEnd = end + offset;
    const duration = end - start;
    if (
      duration <= 0 ||
      end > (source.row.durationSec ?? 0) + 0.05 ||
      cameraEnd > (camera.row.durationSec ?? 0) + 0.05
    ) {
      throw new Error("A split-screen clip range exceeds one of the source videos");
    }

    const mainLabel = "main" + index;
    const cameraLabel = "camera" + index;
    const videoLabel = "v" + index;
    const audioLabel = "a" + index;
    const mainFilters = [
      "trim=start=" + start.toFixed(3) + ":end=" + end.toFixed(3),
      "setpts=PTS-STARTPTS",
      "scale=" + paneWidth + ":" + paneHeight + ":force_original_aspect_ratio=increase",
      "crop=" + paneWidth + ":" + paneHeight,
      "fps=" + spec.fps,
      "format=yuv420p",
      "setsar=1",
    ];
    const cameraFilters = [
      "trim=start=" + cameraStart.toFixed(3) + ":end=" + cameraEnd.toFixed(3),
      "setpts=PTS-STARTPTS",
      "scale=" + paneWidth + ":" + paneHeight + ":force_original_aspect_ratio=increase",
      "crop=" + paneWidth + ":" + paneHeight,
      "fps=" + spec.fps,
      "format=yuv420p",
      "setsar=1",
    ];
    filterParts.push("[" + sourceIndex + ":v]" + mainFilters.join(",") + "[" + mainLabel + "]");
    filterParts.push("[" + cameraIndex + ":v]" + cameraFilters.join(",") + "[" + cameraLabel + "]");
    const stack = spec.splitScreen.layout === "side-by-side" ? "hstack" : "vstack";
    const stackedLabel = "stacked" + index;
    filterParts.push(
      "[" + mainLabel + "][" + cameraLabel + "]" + stack + "=inputs=2[" + stackedLabel + "]",
    );
    filterParts.push(
      "[" + stackedLabel + "]pad=" + width + ":" + height + ":(ow-iw)/2:(oh-ih)/2:color=black,fps=" +
        spec.fps + ",format=yuv420p,setsar=1[" + videoLabel + "]",
    );

    if (source.row.hasAudio) {
      filterParts.push(
        "[" + sourceIndex + ":a]atrim=start=" + start.toFixed(3) + ":end=" + end.toFixed(3) +
          ",asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=" +
          duration.toFixed(3) + "[" + audioLabel + "]",
      );
    } else {
      filterParts.push(
        "anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=" +
          duration.toFixed(3) + ",asetpts=PTS-STARTPTS[" + audioLabel + "]",
      );
    }
    videoLabels.push("[" + videoLabel + "]");
    audioLabels.push("[" + audioLabel + "]");
    totalDuration += duration;
  }

  filterParts.push(videoLabels.join("") + "concat=n=" + videoLabels.length + ":v=1:a=0[vcat]");
  filterParts.push(audioLabels.join("") + "concat=n=" + audioLabels.length + ":v=0:a=1[asrc]");

  let cues: SubtitleCue[] = [];
  let timelineOffset = 0;
  for (const segment of spec.segments) {
    const duration = segment.end - segment.start;
    for (const cue of spec.subtitles?.cues ?? []) {
      if (cue.end <= segment.start || cue.start >= segment.end) continue;
      const start = Math.max(0, cue.start - segment.start) + timelineOffset;
      const end = Math.min(duration, cue.end - segment.start) + timelineOffset;
      if (end > start) cues.push({ ...cue, id: cue.id + "-" + timelineOffset.toFixed(2), start, end });
    }
    timelineOffset += duration;
  }
  if (spec.titleCard) {
    cues = [
      { id: "title-card", start: 0, end: Math.min(2.4, totalDuration), text: spec.titleCard },
      ...cues,
    ];
  }

  let videoOut = "vcat";
  if (cues.length > 0) {
    const assPath = path.join(dirs.temp, "split-subs-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7) + ".ass");
    fs.mkdirSync(dirs.temp, { recursive: true });
    fs.writeFileSync(
      assPath,
      buildAssFile({ width, height, cues, style: spec.subtitles?.style ?? defaultSubtitleStyle }),
      "utf8",
    );
    filterParts.push("[vcat]ass='" + escapeFilterPath(assPath) + "'[vout]");
    videoOut = "vout";
  }

  await onProgress("Rendering", 0.08, "Synchronizing and stacking the two video sources");
  const result = await runFfmpeg(
    [
      ...plan.args,
      "-filter_complex",
      filterParts.join(";"),
      "-map",
      "[" + videoOut + "]",
      "-map",
      "[asrc]",
      "-t",
      totalDuration.toFixed(3),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "48000",
      "-movflags",
      "+faststart",
      "-y",
      outputPath,
    ],
    {
      totalDuration,
      signal,
      timeoutMs: 45 * 60 * 1000,
      onProgress: (fraction, log) => onProgress("Rendering", 0.08 + fraction * 0.88, log),
    },
  );
  if (result.code !== 0) {
    throw new Error("FFmpeg split-screen render failed: " + result.stderr.split("\n").slice(-12).join("\n"));
  }
}

async function renderClipsSpec(
  spec: Extract<RenderSpec, { type: "clips" }>,
  outputPath: string,
  onProgress: RenderProgress,
  signal?: AbortSignal,
) {
  if (spec.splitScreen) {
    await renderSplitClipsSpec(spec, outputPath, onProgress, signal);
    return;
  }
  const source = await loadMedia(spec.sourceMediaId);
  const totalSourceDuration = source.row.durationSec ?? 0;

  const timelineData = buildTimelineFromSegments({
    sourceMediaId: spec.sourceMediaId,
    sourceDuration: totalSourceDuration,
    segments: spec.segments,
    aspectRatio: spec.aspectRatio,
    resolution: spec.resolution,
    fps: spec.fps,
  });

  let cues = spec.subtitles?.cues ?? [];
  if (cues.length > 0) {
    const shifted: SubtitleCue[] = [];
    let offset = 0;
    for (const segment of spec.segments) {
      const segmentDuration = segment.end - segment.start;
      const overlapping = cues.filter(
        (cue) => cue.end > segment.start && cue.start < segment.end,
      );
      for (const cue of overlapping) {
        const start = Math.max(0, cue.start - segment.start) + offset;
        const end = Math.min(segmentDuration, cue.end - segment.start) + offset;
        if (end > start) {
          shifted.push({
            ...cue,
            id: `${cue.id}-${offset.toFixed(2)}`,
            start,
            end,
          });
        }
      }
      offset += segmentDuration;
    }
    cues = shifted;
  }

  if (spec.titleCard) {
    cues = [
      {
        id: "title-card",
        start: 0,
        end: Math.min(2.4, timelineData.clips.reduce((sum, clip) => sum + clip.duration, 0)),
        text: spec.titleCard,
      },
      ...cues,
    ];
  }

  await renderTimelineSpec(
    {
      type: "timeline",
      timeline: timelineData,
      subtitles: cues.length > 0 ? { cues, style: spec.subtitles?.style ?? defaultSubtitleStyle } : null,
      music: null,
      duration: timelineData.clips.reduce((sum, clip) => sum + clip.duration, 0),
    },
    outputPath,
    onProgress,
    signal,
  );
}

async function renderConvertSpec(
  spec: Extract<RenderSpec, { type: "convert" }>,
  outputPath: string,
  onProgress: RenderProgress,
  signal?: AbortSignal,
) {
  const source = await loadMedia(spec.sourceMediaId);
  const duration = source.row.durationSec ?? 10;
  const start = spec.start ?? 0;
  const end = spec.end ?? duration;
  const timelineData = buildTimelineFromSegments({
    sourceMediaId: spec.sourceMediaId,
    sourceDuration: duration,
    segments: [{ start, end }],
    aspectRatio: spec.aspectRatio,
    resolution: spec.resolution,
    fps: spec.fps,
  });
  await renderTimelineSpec(
    {
      type: "timeline",
      timeline: timelineData,
      subtitles: null,
      music: null,
      duration: end - start,
    },
    outputPath,
    onProgress,
    signal,
  );
}

async function renderMotionSpec(
  spec: Extract<RenderSpec, { type: "motion" }>,
  outputPath: string,
  onProgress: RenderProgress,
  signal?: AbortSignal,
) {
  const { composition } = spec;
  const { width, height } = parseResolution(spec.resolution);
  fs.mkdirSync(dirs.temp, { recursive: true });
  const assPath = path.join(dirs.temp, `motion-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.ass`);
  fs.writeFileSync(assPath, buildMotionAss({ ...composition, width, height }), "utf8");

  const plan = createInputPlan();
  const filterParts: string[] = [];
  let hasAudio = false;

  if (spec.backgroundMediaId) {
    const background = await loadMedia(spec.backgroundMediaId);
    const index = addInput(plan, `media:${spec.backgroundMediaId}`, background.absolutePath);
    filterParts.push(
      `[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${spec.fps},trim=duration=${spec.duration},setpts=PTS-STARTPTS,ass='${escapeFilterPath(assPath)}'[vout]`,
    );
    if (background.row.hasAudio) {
      hasAudio = true;
      filterParts.push(
        `[${index}:a]atrim=duration=${spec.duration},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[aout]`,
      );
    }
  } else {
    filterParts.push(
      `color=c=${composition.background.replace("#", "0x")}:s=${width}x${height}:r=${spec.fps}:d=${spec.duration},ass='${escapeFilterPath(assPath)}'[vout]`,
    );
  }

  if (!hasAudio) {
    filterParts.push(
      `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${spec.duration},asetpts=PTS-STARTPTS[aout]`,
    );
  }

  await onProgress("Rendering", 0.1, "Rendering motion composition");
  const result = await runFfmpeg(
    [
      ...plan.args,
      "-filter_complex",
      filterParts.join(";"),
      "-map",
      "[vout]",
      "-map",
      "[aout]",
      "-t",
      spec.duration.toFixed(3),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      "-y",
      outputPath,
    ],
    {
      totalDuration: spec.duration,
      signal,
      onProgress: (fraction, log) => onProgress("Rendering", 0.1 + fraction * 0.85, log),
    },
  );

  if (result.code !== 0) {
    throw new Error(`FFmpeg exited with code ${result.code}\n${result.stderr.split("\n").slice(-10).join("\n")}`);
  }
}

async function renderAudioSpec(
  spec: Extract<RenderSpec, { type: "audio" }>,
  outputPath: string,
  onProgress: RenderProgress,
  signal?: AbortSignal,
) {
  const source = await loadMedia(spec.sourceMediaId);
  const ops = spec.operations;
  const filters: string[] = [];
  if (ops.trimStart !== undefined || ops.trimEnd !== undefined) {
    filters.push(
      `atrim=start=${(ops.trimStart ?? 0).toFixed(3)}:end=${(ops.trimEnd ?? source.row.durationSec ?? 0).toFixed(3)}`,
    );
    filters.push("asetpts=PTS-STARTPTS");
  }
  if (ops.volume !== undefined && ops.volume !== 1) filters.push(`volume=${ops.volume}`);
  if (ops.normalize) filters.push("loudnorm=I=-16:TP=-1.5:LRA=11");
  const duration = Math.max(
    0.1,
    (ops.trimEnd ?? source.row.durationSec ?? 1) - (ops.trimStart ?? 0),
  );
  if (ops.fadeIn && ops.fadeIn > 0) filters.push(`afade=t=in:st=0:d=${ops.fadeIn}`);
  if (ops.fadeOut && ops.fadeOut > 0) {
    filters.push(`afade=t=out:st=${Math.max(0, duration - ops.fadeOut).toFixed(3)}:d=${ops.fadeOut}`);
  }
  if (filters.length === 0) filters.push("anull");

  const codec =
    ops.format === "wav"
      ? ["-c:a", "pcm_s16le"]
      : ops.format === "m4a"
        ? ["-c:a", "aac", "-b:a", "192k"]
        : ["-c:a", "libmp3lame", "-b:a", "192k"];

  await onProgress("Processing", 0.08, "Processing audio");
  const result = await runFfmpeg(
    [
      "-i",
      source.absolutePath,
      "-vn",
      "-af",
      filters.join(","),
      ...codec,
      "-ar",
      "48000",
      "-y",
      outputPath,
    ],
    {
      totalDuration: duration,
      signal,
      onProgress: (fraction, log) => onProgress("Processing", 0.08 + fraction * 0.88, log),
    },
  );
  if (result.code !== 0) {
    throw new Error(`FFmpeg exited with code ${result.code}\n${result.stderr.split("\n").slice(-10).join("\n")}`);
  }
}

export async function executeRenderSpec(
  spec: RenderSpec,
  outputPath: string,
  onProgress: RenderProgress,
  signal?: AbortSignal,
) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await onProgress("Preparing", 0.02, `FFmpeg engine: ${FFMPEG_PATH}`);

  if (spec.type === "timeline") {
    await renderTimelineSpec(spec, outputPath, onProgress, signal);
  } else if (spec.type === "clips") {
    await renderClipsSpec(spec, outputPath, onProgress, signal);
  } else if (spec.type === "convert") {
    await renderConvertSpec(spec, outputPath, onProgress, signal);
  } else if (spec.type === "motion") {
    await renderMotionSpec(spec, outputPath, onProgress, signal);
  } else if (spec.type === "audio") {
    await renderAudioSpec(spec, outputPath, onProgress, signal);
  } else {
    throw new Error("Unsupported render specification");
  }

  await onProgress("Verifying", 0.97, "Verifying output file");
  const stat = fs.statSync(outputPath);
  if (stat.size < 1024) {
    throw new Error("Render produced an empty or invalid file");
  }
  const probe = await probeMedia(outputPath);
  if (!probe.durationSec && spec.type !== "audio") {
    throw new Error("Output file could not be verified as playable media");
  }
  await onProgress("Completed", 1, `Verified ${(stat.size / 1024 / 1024).toFixed(2)} MB output`);
  return { sizeBytes: stat.size, durationSec: probe.durationSec };
}
