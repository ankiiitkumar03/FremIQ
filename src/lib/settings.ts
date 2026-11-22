import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { encryptSecret } from "@/lib/secrets";

export type Settings = {
  general: {
    workspaceName: string;
    exportDir: string;
    tempDir: string;
    theme: "dark" | "light" | "system";
    language: string;
  };
  video: {
    resolution: string;
    fps: number;
    aspectRatio: string;
    codec: string;
    bitrateKbps: number;
    format: string;
  };
  ai: {
    defaultAgent: string;
    planner: string;
    transcriptionModel: string;
    localInference: boolean;
    openaiBaseUrl: string;
    openaiApiKey: string;
  };
  telegram: {
    botToken: string;
    authorizedUserIds: string;
    chatAllowlist: string;
    notifications: boolean;
    enabled: boolean;
    webhookBaseUrl: string;
    autoPostEnabled: boolean;
    autoPostChatId: string;
  };
  github: {
    token: string;
    cloneDir: string;
    defaultBranch: string;
  };
  processing: {
    cpuLimit: number;
    gpuAcceleration: boolean;
    maxConcurrency: number;
    cacheSizeGb: number;
    defaultBackend: string;
  };
  security: {
    trustedOrigins: string;
    allowedDirectories: string;
    commandApproval: boolean;
    requirePairing: boolean;
  };
  agent: {
    url: string;
    pairingToken: string;
    autoConnect: boolean;
  };
};

export const defaultSettings: Settings = {
  general: {
    workspaceName: "FREMIQ Workspace",
    exportDir: "exports",
    tempDir: "temp",
    theme: "dark",
    language: "en",
  },
  video: {
    resolution: "1920x1080",
    fps: 30,
    aspectRatio: "16:9",
    codec: "libx264",
    bitrateKbps: 8000,
    format: "mp4",
  },
  ai: {
    defaultAgent: "builtin",
    planner: "fremiq-planner-v1",
    transcriptionModel: "faster-whisper/base",
    localInference: true,
    openaiBaseUrl: "",
    openaiApiKey: "",
  },
  telegram: {
    botToken: "",
    authorizedUserIds: "",
    chatAllowlist: "",
    notifications: true,
    enabled: false,
    webhookBaseUrl: "",
    autoPostEnabled: false,
    autoPostChatId: "",
  },
  github: {
    token: "",
    cloneDir: "workspace",
    defaultBranch: "main",
  },
  processing: {
    cpuLimit: 80,
    gpuAcceleration: false,
    maxConcurrency: 1,
    cacheSizeGb: 8,
    defaultBackend: "ffmpeg",
  },
  security: {
    trustedOrigins: "",
    allowedDirectories: "",
    commandApproval: true,
    requirePairing: true,
  },
  agent: {
    url: process.env.FREMIQ_AGENT_URL ?? "http://127.0.0.1:8765",
    pairingToken: "",
    autoConnect: false,
  },
};

function mergeSettings(base: Settings, incoming: Partial<Settings>): Settings {
  const merged = { ...base } as Settings;
  for (const key of Object.keys(base) as (keyof Settings)[]) {
    merged[key] = { ...base[key], ...(incoming[key] ?? {}) } as never;
  }
  return merged;
}

export async function getSettings(): Promise<Settings> {
  const rows = await db.select().from(appSettings).where(eq(appSettings.id, "default")).limit(1);
  if (!rows[0]) return defaultSettings;
  return mergeSettings(defaultSettings, rows[0].data as Partial<Settings>);
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const merged = mergeSettings(current, patch);
  await db
    .insert(appSettings)
    .values({ id: "default", data: merged, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.id,
      set: { data: merged, updatedAt: new Date() },
    });
  return merged;
}

export type PublicSettings = Omit<Settings, "telegram" | "github" | "ai" | "agent"> & {
  telegram: Omit<Settings["telegram"], "botToken"> & { hasBotToken: boolean };
  github: Omit<Settings["github"], "token"> & { hasToken: boolean };
  ai: Omit<Settings["ai"], "openaiApiKey"> & { hasApiKey: boolean };
  agent: Omit<Settings["agent"], "pairingToken"> & { hasPairingToken: boolean };
};

export function toPublicSettings(settings: Settings): PublicSettings {
  const { botToken, ...telegram } = settings.telegram;
  const { token, ...github } = settings.github;
  const { openaiApiKey, ...ai } = settings.ai;
  const { pairingToken, ...agent } = settings.agent;
  return {
    ...settings,
    telegram: { ...telegram, hasBotToken: Boolean(botToken) },
    github: { ...github, hasToken: Boolean(token) },
    ai: { ...ai, hasApiKey: Boolean(openaiApiKey) },
    agent: { ...agent, hasPairingToken: Boolean(pairingToken) },
  };
}

export function encryptIncomingSecret(value: string | undefined) {
  if (value === undefined || value === "") return undefined;
  return encryptSecret(value);
}
