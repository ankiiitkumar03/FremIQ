import type { RenderSpec } from "@/lib/types";

export type RenderBackendKey = "ffmpeg" | "hyperframes" | "remotion";

export type BackendStatus = {
  key: RenderBackendKey;
  label: string;
  description: string;
  extensionId: string | null;
  installed: boolean;
  operational: boolean;
  available: boolean;
  reason: string | null;
  supports: RenderSpec["type"][];
  configRequirements: string[];
  version: string | null;
};

export type BackendProgress = (stage: string, fraction: number, log: string) => Promise<void> | void;

export type BackendExecutionContext = {
  jobId: string;
  spec: RenderSpec;
  outputPath: string;
  signal?: AbortSignal;
  onProgress: BackendProgress;
};

export type BackendResult = {
  sizeBytes: number;
  durationSec: number | null;
  backend: RenderBackendKey;
  detail: string;
};

export interface RenderBackend {
  key: RenderBackendKey;
  label: string;
  description: string;
  extensionId: string | null;
  supports: RenderSpec["type"][];
  configRequirements: string[];
  detect(): Promise<BackendStatus>;
  validate(spec: RenderSpec): { ok: boolean; reason: string | null };
  execute(context: BackendExecutionContext): Promise<BackendResult>;
}
