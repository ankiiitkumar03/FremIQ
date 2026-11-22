import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

function resolveBinary(envPath: string | undefined, candidates: Array<string | null | undefined>, command: string) {
  if (envPath && fs.existsSync(envPath)) return envPath;
  const bundledPath = candidates.find((candidate) => candidate && fs.existsSync(candidate));
  if (bundledPath) return bundledPath;
  if (envPath && !path.isAbsolute(envPath) && !envPath.includes(path.sep) && !path.extname(envPath)) {
    return envPath;
  }
  return command;
}

const ffmpegPackagePath = path.join(
  process.cwd(),
  "node_modules",
  "ffmpeg-static",
  `ffmpeg${process.platform === "win32" ? ".exe" : ""}`,
);
const ffprobePackagePath = path.join(
  process.cwd(),
  "node_modules",
  "ffprobe-static",
  "bin",
  process.platform,
  process.arch,
  `ffprobe${process.platform === "win32" ? ".exe" : ""}`,
);

export const FFMPEG_PATH = resolveBinary(process.env.FFMPEG_PATH, [
  ffmpegStatic as unknown as string,
  ffmpegPackagePath,
], "ffmpeg");
export const FFPROBE_PATH = resolveBinary(process.env.FFPROBE_PATH, [
  ffprobeStatic?.path as string | undefined,
  ffprobePackagePath,
], "ffprobe");

export type RunResult = {
  code: number;
  stdout: string;
  stderr: string;
  durationMs: number;
};

export function runBinary(
  binary: string,
  args: string[],
  options: {
    timeoutMs?: number;
    signal?: AbortSignal;
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
  } = {},
): Promise<RunResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(binary, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    let killedForTimeout = false;

    const timer = setTimeout(() => {
      killedForTimeout = true;
      child.kill("SIGKILL");
    }, options.timeoutMs ?? 30 * 60 * 1000);

    const onAbort = () => child.kill("SIGKILL");
    if (options.signal) {
      if (options.signal.aborted) onAbort();
      else options.signal.addEventListener("abort", onAbort, { once: true });
    }

    child.stdout.on("data", (data: Buffer) => {
      const chunk = data.toString();
      if (stdout.length < 2_000_000) stdout += chunk;
      options.onStdout?.(chunk);
    });
    child.stderr.on("data", (data: Buffer) => {
      const chunk = data.toString();
      if (stderr.length < 2_000_000) stderr += chunk;
      options.onStderr?.(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        code: -1,
        stdout,
        stderr: `${stderr}\n${error.message}`,
        durationMs: Date.now() - started,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      if (killedForTimeout) stderr += "\nProcess timed out";
      if (options.signal?.aborted) stderr += "\nProcess cancelled";
      resolve({ code: code ?? -1, stdout, stderr, durationMs: Date.now() - started });
    });
  });
}

export function runFfmpeg(
  args: string[],
  options: {
    timeoutMs?: number;
    totalDuration?: number;
    signal?: AbortSignal;
    onProgress?: (fraction: number, log: string) => void;
  } = {},
): Promise<RunResult> {
  let progressBuffer = "";
  return runBinary(FFMPEG_PATH, ["-hide_banner", "-progress", "pipe:1", ...args], {
    timeoutMs: options.timeoutMs,
    signal: options.signal,
    onStdout: (chunk) => {
      progressBuffer += chunk;
      const lines = progressBuffer.split("\n");
      progressBuffer = lines.pop() ?? "";
      for (const line of lines) {
        const [key, value] = line.split("=");
        if (key === "out_time_ms" && options.totalDuration && options.onProgress) {
          const seconds = Number(value) / 1_000_000;
          if (Number.isFinite(seconds) && seconds >= 0) {
            const fraction = Math.min(0.99, seconds / options.totalDuration);
            options.onProgress(fraction, `out_time=${seconds.toFixed(1)}s`);
          }
        }
        if (key === "progress" && value === "end") {
          options.onProgress?.(1, "muxing complete");
        }
      }
    },
  });
}

export function runFfprobe(args: string[]) {
  return runBinary(FFPROBE_PATH, args, { timeoutMs: 60_000 });
}
