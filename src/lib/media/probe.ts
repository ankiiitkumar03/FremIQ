import { runFfprobe } from "./ffmpeg";

export type ProbeResult = {
  kind: "video" | "audio" | "image" | "other";
  durationSec: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  sampleRate: number | null;
  channels: number | null;
  hasAudio: boolean;
  hasVideo: boolean;
  bitRate: number | null;
  formatName: string | null;
  raw: Record<string, unknown>;
};

function parseFps(value?: string): number | null {
  if (!value) return null;
  const [num, den] = value.split("/").map(Number);
  if (!num || !den) return null;
  const fps = num / den;
  return Number.isFinite(fps) ? Math.round(fps * 100) / 100 : null;
}

export async function probeMedia(absolutePath: string): Promise<ProbeResult> {
  const result = await runFfprobe([
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    absolutePath,
  ]);

  if (result.code !== 0) {
    throw new Error(result.stderr.split("\n").slice(-3).join(" ").trim() || "ffprobe failed");
  }

  const parsed = JSON.parse(result.stdout) as {
    streams?: Array<Record<string, unknown>>;
    format?: Record<string, unknown>;
  };
  const streams = parsed.streams ?? [];
  const format = parsed.format ?? {};
  const video = streams.find((stream) => stream.codec_type === "video");
  const audio = streams.find((stream) => stream.codec_type === "audio");

  const formatName = (format.format_name as string) ?? null;
  const isImage =
    Boolean(video) &&
    (formatName?.includes("image2") ||
      formatName?.includes("png") ||
      formatName?.includes("jpeg") ||
      (video?.nb_frames === "1" && Number(format.duration ?? 0) <= 0));

  const kind: ProbeResult["kind"] = video
    ? isImage
      ? "image"
      : "video"
    : audio
      ? "audio"
      : "other";

  const duration =
    Number(format.duration ?? video?.duration ?? audio?.duration ?? 0) || null;

  return {
    kind,
    durationSec: kind === "image" ? null : duration,
    width: video ? Number(video.width) || null : null,
    height: video ? Number(video.height) || null : null,
    fps: video ? parseFps(video.avg_frame_rate as string) : null,
    videoCodec: video ? (video.codec_name as string) ?? null : null,
    audioCodec: audio ? (audio.codec_name as string) ?? null : null,
    sampleRate: audio ? Number(audio.sample_rate) || null : null,
    channels: audio ? Number(audio.channels) || null : null,
    hasAudio: Boolean(audio),
    hasVideo: Boolean(video),
    bitRate: Number(format.bit_rate ?? 0) || null,
    formatName,
    raw: parsed as Record<string, unknown>,
  };
}

export type SilenceRange = { start: number; end: number };

export async function detectSilences(
  absolutePath: string,
  options: { noiseDb?: number; minDuration?: number; timeoutMs?: number } = {},
): Promise<SilenceRange[]> {
  const noise = options.noiseDb ?? -35;
  const minDuration = options.minDuration ?? 0.7;
  const { runFfmpeg } = await import("./ffmpeg");
  const result = await runFfmpeg(
    [
      "-i",
      absolutePath,
      "-af",
      `silencedetect=noise=${noise}dB:d=${minDuration}`,
      "-f",
      "null",
      "-",
    ],
    { timeoutMs: options.timeoutMs ?? 10 * 60 * 1000 },
  );
  const ranges: SilenceRange[] = [];
  const startRegex = /silence_start:\s*(-?\d+(?:\.\d+)?)/g;
  const endRegex = /silence_end:\s*(\d+(?:\.\d+)?)/g;
  const starts = Array.from(result.stderr.matchAll(startRegex)).map((match) =>
    Math.max(0, Number(match[1])),
  );
  const ends = Array.from(result.stderr.matchAll(endRegex)).map((match) =>
    Number(match[1]),
  );
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i];
    const end = ends[i] ?? start + minDuration;
    if (end > start) ranges.push({ start, end });
  }
  return ranges;
}

export async function detectScenes(
  absolutePath: string,
  options: { threshold?: number; timeoutMs?: number } = {},
): Promise<number[]> {
  const threshold = options.threshold ?? 0.32;
  const { runFfmpeg } = await import("./ffmpeg");
  const result = await runFfmpeg(
    [
      "-i",
      absolutePath,
      "-vf",
      `select='gt(scene,${threshold})',showinfo`,
      "-an",
      "-f",
      "null",
      "-",
    ],
    { timeoutMs: options.timeoutMs ?? 10 * 60 * 1000 },
  );
  const times = Array.from(result.stderr.matchAll(/pts_time:(\d+(?:\.\d+)?)/g)).map(
    (match) => Number(match[1]),
  );
  return Array.from(new Set(times.map((time) => Math.round(time * 10) / 10))).sort(
    (a, b) => a - b,
  );
}
