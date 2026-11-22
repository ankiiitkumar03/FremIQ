import fs from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";
import { getSettings } from "@/lib/settings";
import { getQueueSummary } from "@/lib/jobs/queue";
import { diskStats } from "@/lib/storage";
import { FFMPEG_PATH, FFPROBE_PATH } from "@/lib/media/ffmpeg";
import type { SystemStatus } from "@/lib/types";

type GpuCache = { value: string | null; at: number };
const globalForGpu = globalThis as unknown as { fremiqGpu?: GpuCache };

async function detectGpu(): Promise<string | null> {
  const cached = globalForGpu.fremiqGpu;
  if (cached && Date.now() - cached.at < 60_000) return cached.value;
  const value = await new Promise<string | null>((resolve) => {
    const child = spawn(
      "nvidia-smi",
      ["--query-gpu=name", "--format=csv,noheader"],
      { windowsHide: true },
    );
    let output = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(null);
    }, 2500);
    child.stdout.on("data", (data: Buffer) => {
      output += data.toString();
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0 && output.trim() ? output.trim().split("\n")[0] : null);
    });
  });
  globalForGpu.fremiqGpu = { value, at: Date.now() };
  return value;
}

export type AgentHealth = {
  ok: boolean;
  url: string;
  version: string | null;
  hostname: string | null;
  os: string | null;
  gpu: string | null;
  tools: string[] | null;
  error: string | null;
  latencyMs: number | null;
};

export async function checkAgentHealth(url: string, token: string): Promise<AgentHealth> {
  const started = Date.now();
  if (!url) {
    return {
      ok: false,
      url,
      version: null,
      hostname: null,
      os: null,
      gpu: null,
      tools: null,
      error: "No agent URL configured",
      latencyMs: null,
    };
  }
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/api/health`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        ok: false,
        url,
        version: null,
        hostname: null,
        os: null,
        gpu: null,
        tools: null,
        error: `Agent returned HTTP ${response.status}`,
        latencyMs: Date.now() - started,
      };
    }
    const data = (await response.json()) as {
      ok?: boolean;
      version?: string;
      hostname?: string;
      os?: string;
      gpu?: string | null;
      tools?: string[];
    };
    return {
      ok: data.ok !== false,
      url,
      version: data.version ?? null,
      hostname: data.hostname ?? null,
      os: data.os ?? null,
      gpu: data.gpu ?? null,
      tools: data.tools ?? null,
      error: data.ok === false ? "Agent reported an unhealthy state" : null,
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    return {
      ok: false,
      url,
      version: null,
      hostname: null,
      os: null,
      gpu: null,
      tools: null,
      error: error instanceof Error ? error.message : "Agent is unreachable",
      latencyMs: Date.now() - started,
    };
  }
}

export async function getSystemStatus(): Promise<SystemStatus> {
  const [settings, queue, gpu] = await Promise.all([
    getSettings(),
    getQueueSummary(),
    detectGpu(),
  ]);
  const agent = await checkAgentHealth(settings.agent.url, settings.agent.pairingToken);
  const cpus = os.cpus().length || 1;
  const load = os.loadavg()[0] ?? 0;
  const cpu = Math.min(100, Math.max(0, Math.round((load / cpus) * 100)));
  const disk = diskStats();

  return {
    engine: {
      mode: agent.ok ? "local-agent" : "hosted",
      label: agent.ok
        ? `FREMIQ Local Agent${agent.hostname ? ` · ${agent.hostname}` : ""}`
        : "FREMIQ Engine (hosted workspace)",
      ffmpeg: fs.existsSync(FFMPEG_PATH),
      ffprobe: fs.existsSync(FFPROBE_PATH),
      cpu,
      memoryUsedBytes: os.totalmem() - os.freemem(),
      memoryTotalBytes: os.totalmem(),
      diskFreeBytes: disk.free,
      diskTotalBytes: disk.total,
      platform: `${os.type()} ${os.release()}`,
      hostname: agent.hostname ?? os.hostname(),
      gpu: agent.gpu ?? gpu,
      uptimeSec: os.uptime(),
      checkedAt: new Date().toISOString(),
    },
    agent: {
      connected: agent.ok,
      url: settings.agent.url || null,
      version: agent.version,
      lastCheckedAt: new Date().toISOString(),
    },
    queue: {
      queued: queue.queued,
      running: queue.running,
      completed: queue.completed,
      failed: queue.failed,
    },
  };
}
