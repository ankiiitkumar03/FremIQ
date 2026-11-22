import type { RenderSpec } from "@/lib/types";
import { ffmpegBackend } from "./ffmpeg";
import { hyperframesBackend } from "./hyperframes";
import { remotionBackend } from "./remotion";
import type { BackendStatus, RenderBackend, RenderBackendKey } from "./types";

const backends: Record<RenderBackendKey, RenderBackend> = {
  ffmpeg: ffmpegBackend,
  hyperframes: hyperframesBackend,
  remotion: remotionBackend,
};

export const backendKeys = Object.keys(backends) as RenderBackendKey[];

export function isRenderBackendKey(value: unknown): value is RenderBackendKey {
  return typeof value === "string" && value in backends;
}

export function getBackend(key: string | null | undefined): RenderBackend {
  if (isRenderBackendKey(key)) return backends[key];
  return ffmpegBackend;
}

export function getBackendLabel(key: string | null | undefined): string {
  return getBackend(key).label;
}

export async function getBackendViews(): Promise<BackendStatus[]> {
  return Promise.all(backendKeys.map((key) => backends[key].detect()));
}

export async function validateBackendSelection(
  key: string,
  spec: RenderSpec,
): Promise<{ ok: boolean; reason: string | null }> {
  if (!isRenderBackendKey(key)) {
    return { ok: false, reason: `Unknown rendering backend: ${key}` };
  }
  const backend = backends[key];
  const status = await backend.detect();
  if (!status.available) {
    return { ok: false, reason: status.reason ?? `${status.label} is unavailable` };
  }
  if (spec.type !== "clips" && !status.operational) {
    return { ok: false, reason: status.reason ?? `${status.label} is not configured for this render type` };
  }
  const validation = backend.validate(spec);
  if (!validation.ok) return validation;
  return { ok: true, reason: null };
}

export async function executeWithBackend(
  key: string,
  context: Parameters<RenderBackend["execute"]>[0],
) {
  return getBackend(key).execute(context);
}

export type { BackendStatus, BackendResult, RenderBackendKey } from "./types";
