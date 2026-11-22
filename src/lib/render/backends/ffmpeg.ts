import fs from "node:fs";
import { executeRenderSpec } from "@/lib/media/render";
import { FFMPEG_PATH } from "@/lib/media/ffmpeg";
import type { BackendStatus, RenderBackend } from "./types";

export const ffmpegBackend: RenderBackend = {
  key: "ffmpeg",
  label: "FFmpeg",
  description:
    "The core FREMIQ processing engine. Always available and used for timelines, clips, captions, audio and motion when no optional backend is selected.",
  extensionId: null,
  supports: ["timeline", "clips", "audio", "convert", "motion"],
  configRequirements: [],
  async detect(): Promise<BackendStatus> {
    const installed = fs.existsSync(FFMPEG_PATH);
    return {
      key: "ffmpeg",
      label: "FFmpeg",
      description: this.description,
      extensionId: null,
      installed,
      operational: installed,
      available: installed,
      reason: installed ? null : "FFmpeg binary not found",
      supports: this.supports,
      configRequirements: [],
      version: installed ? "bundled" : null,
    };
  },
  validate() {
    return { ok: true, reason: null };
  },
  async execute({ spec, outputPath, signal, onProgress }) {
    const result = await executeRenderSpec(spec, outputPath, onProgress, signal);
    return {
      sizeBytes: result.sizeBytes,
      durationSec: result.durationSec ?? null,
      backend: "ffmpeg",
      detail: "Rendered with the core FFmpeg engine",
    };
  },
};
