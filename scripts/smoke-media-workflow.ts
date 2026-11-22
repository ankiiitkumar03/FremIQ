import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const baseUrl = process.env.FREMIQ_SMOKE_BASE_URL ?? "http://127.0.0.1:4000";
const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "fremiq-media-smoke-"));
const inputPath = path.join(temporaryDirectory, "source.mp4");
const outputPath = path.join(temporaryDirectory, "render.mp4");

async function api<T>(pathname: string, init?: RequestInit): Promise<T> {
  const response = await fetch(new URL(pathname, baseUrl), init);
  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const message = data && typeof data === "object" && "error" in data
      ? String((data as { error: unknown }).error)
      : typeof data === "string" ? data.slice(0, 300) : `HTTP ${response.status}`;
    throw new Error(`${pathname} failed: ${message}`);
  }
  return data as T;
}

async function main() {
  await execFileAsync("/usr/bin/ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24:duration=8",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=8",
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-shortest", inputPath,
  ]);

  const { project } = await api<{ project: { id: string } }>("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: `CI media workflow ${randomUUID().slice(0, 8)}` }),
  });

  const form = new FormData();
  form.set("projectId", project.id);
  form.set("file", new File([await fs.readFile(inputPath)], "smoke-source.mp4", { type: "video/mp4" }));
  const { media } = await api<{ media: { id: string; kind: string; durationSec: number | null } }>("/api/media/upload", {
    method: "POST",
    body: form,
  });
  if (media.kind !== "video" || !media.durationSec || media.durationSec < 6) {
    throw new Error(`Uploaded fixture was not recognized as a video: ${media.kind}, ${media.durationSec}s`);
  }

  const { candidates } = await api<{ candidates: Array<{ start: number; end: number }> }>("/api/clips/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: project.id, mediaId: media.id, count: 1, duration: 5 }),
  });
  if (candidates.length === 0) throw new Error("Clip analysis did not return a candidate");

  const { track } = await api<{ track: { id: string } }>("/api/subtitles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: project.id,
      mediaId: media.id,
      name: "CI smoke captions",
      language: "en",
      preset: "bold",
      cues: [{ id: randomUUID(), start: 0.4, end: 3.2, text: "FREMIQ media workflow verified" }],
    }),
  });

  const { jobs } = await api<{ jobs: Array<{ id: string }> }>("/api/clips/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: project.id,
      mediaId: media.id,
      candidates: [candidates[0]],
      subtitleTrackId: track.id,
      aspectRatio: "9:16",
      resolution: "360x640",
      fps: 24,
      backend: "ffmpeg",
    }),
  });
  if (!jobs[0]?.id) throw new Error("Clip render did not return a job ID");

  const deadline = Date.now() + 120_000;
  let completed = false;
  while (Date.now() < deadline) {
    const { job } = await api<{ job: { status: string; error: string | null } }>(`/api/jobs/${jobs[0].id}`);
    if (job.status === "completed") {
      completed = true;
      break;
    }
    if (job.status === "failed") throw new Error(`FFmpeg clip render failed: ${job.error ?? "no error detail"}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!completed) throw new Error("FFmpeg clip render did not finish within 120 seconds");

  const rendered = await fetch(new URL(`/api/jobs/${jobs[0].id}/file?inline=1`, baseUrl));
  if (!rendered.ok) throw new Error(`Rendered clip download failed with HTTP ${rendered.status}`);
  const bytes = new Uint8Array(await rendered.arrayBuffer());
  if (bytes.byteLength < 1024) throw new Error(`Rendered clip is unexpectedly small (${bytes.byteLength} bytes)`);
  await fs.writeFile(outputPath, bytes);

  const { stdout } = await execFileAsync("/usr/bin/ffprobe", [
    "-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", outputPath,
  ]);
  const probe = JSON.parse(stdout) as { format?: { duration?: string }; streams?: Array<{ codec_type: string }> };
  const codecs = new Set((probe.streams ?? []).map((stream) => stream.codec_type));
  const duration = Number(probe.format?.duration ?? 0);
  if (!codecs.has("video") || !codecs.has("audio") || duration < 4 || duration > 6) {
    throw new Error(`Rendered file validation failed: codecs=${[...codecs].join(",")}, duration=${duration}s`);
  }

  console.log(`Verified upload → clip analysis → synced subtitle render → playable MP4 (${bytes.byteLength} bytes, ${duration.toFixed(2)}s)`);
}

try {
  await main();
} finally {
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
}
