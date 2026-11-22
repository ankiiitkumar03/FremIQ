export type ExtensionCategory =
  | "Video Rendering"
  | "Motion Graphics"
  | "3D & Visualization"
  | "Audio & Sound Design"
  | "AI Agent Skills"
  | "Developer Tools";

export type ExtensionStatus =
  | "not_installed"
  | "installing"
  | "installed"
  | "updating"
  | "uninstalling"
  | "error";

export type ExtensionHealth = "unknown" | "ok" | "degraded" | "error" | "missing";

export type ExtensionVerification = "verified" | "planned";

export type ExtensionInstallMethod = "npm" | "pip-git" | "git-clone" | "external" | "unverified";

export type DependencyKind = "node" | "python" | "git" | "ffmpeg" | "browser" | "package";

export type ExtensionDependency = {
  name: string;
  kind: DependencyKind;
  minVersion?: string;
  required: boolean;
  hint: string;
};

export type ExtensionCommand = {
  label: string;
  binary: string;
  args: string[];
};

export type ExtensionSource = {
  repository: string | null;
  documentation: string | null;
  website: string | null;
};

export type ExtensionLicense = {
  name: string;
  spdx: string | null;
  url: string | null;
  commercialUse: string;
  acknowledgementRequired: boolean;
};

export type ExtensionDefinition = {
  id: string;
  name: string;
  icon: string;
  tagline: string;
  description: string;
  category: ExtensionCategory;
  version: string;
  verification: ExtensionVerification;
  source: ExtensionSource;
  license: ExtensionLicense;
  installMethod: ExtensionInstallMethod;
  packageSpec: string | null;
  installSizeBytes: number | null;
  supportedPlatforms: Array<"win32" | "darwin" | "linux">;
  dependencies: ExtensionDependency[];
  capabilities: string[];
  configuration: string[];
  healthCheck: string;
  integration: string[];
  skill: boolean;
  mcp: boolean;
  notes: string;
};

export type ExtensionView = {
  definition: ExtensionDefinition;
  status: ExtensionStatus;
  enabled: boolean;
  health: ExtensionHealth;
  installedVersion: string | null;
  installPath: string | null;
  lastError: string | null;
  lastHealthAt: string | null;
  installedAt: string | null;
  logs: string;
  installed: boolean;
  operational: boolean;
  config: Record<string, unknown>;
  missingDependencies: Array<{ name: string; hint: string; required: boolean }>;
  healthDetail: string | null;
};

export type ExtensionDetection = {
  installed: boolean;
  version: string | null;
  path: string | null;
  detail: string;
};

export type ExtensionHealthResult = {
  health: ExtensionHealth;
  detail: string;
};

export type ExtensionOperationResult = {
  ok: boolean;
  message: string;
  logs?: string[];
};

export type ExtensionContext = {
  definition: ExtensionDefinition;
  installDir: string;
  config: Record<string, unknown>;
  appendLog: (line: string) => void;
};

export type ExtensionExecutePayload = Record<string, unknown>;

export interface ExtensionAdapter {
  detect(): Promise<ExtensionDetection>;
  install(context: ExtensionContext): Promise<ExtensionOperationResult>;
  uninstall(context: ExtensionContext): Promise<ExtensionOperationResult>;
  enable(context: ExtensionContext): Promise<ExtensionOperationResult>;
  disable(context: ExtensionContext): Promise<ExtensionOperationResult>;
  update(context: ExtensionContext): Promise<ExtensionOperationResult>;
  healthCheck(context: ExtensionContext): Promise<ExtensionHealthResult>;
  execute(
    context: ExtensionContext,
    payload: ExtensionExecutePayload,
  ): Promise<ExtensionOperationResult>;
  getCapabilities(): string[];
}

export type HostDependency = {
  key: string;
  label: string;
  installed: boolean;
  version: string | null;
  path: string | null;
  minVersion: string | null;
  meetsMinimum: boolean;
  requiredBy: string[];
};
