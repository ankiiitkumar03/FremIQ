import fs from "node:fs";
import path from "node:path";
import type {
  ExtensionAdapter,
  ExtensionContext,
  ExtensionDetection,
  ExtensionExecutePayload,
  ExtensionHealthResult,
  ExtensionOperationResult,
} from "../types";

export function readPackageVersion(installDir: string, packageName: string): string | null {
  try {
    const file = path.join(installDir, "node_modules", packageName, "package.json");
    if (!fs.existsSync(file)) return null;
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

export function binaryInInstall(installDir: string, name: string): string | null {
  const candidates =
    process.platform === "win32"
      ? [
          path.join(installDir, "node_modules", ".bin", `${name}.cmd`),
          path.join(installDir, "node_modules", ".bin", `${name}.ps1`),
          path.join(installDir, "node_modules", ".bin", name),
        ]
      : [path.join(installDir, "node_modules", ".bin", name)];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

export function removeDirectory(target: string) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

export function notSupported(message: string): ExtensionOperationResult {
  return { ok: false, message };
}

export abstract class BaseAdapter implements ExtensionAdapter {
  abstract detect(): Promise<ExtensionDetection>;
  abstract install(context: ExtensionContext): Promise<ExtensionOperationResult>;
  abstract healthCheck(context: ExtensionContext): Promise<ExtensionHealthResult>;

  async uninstall(context: ExtensionContext): Promise<ExtensionOperationResult> {
    removeDirectory(context.installDir);
    context.appendLog(`Removed ${context.installDir}`);
    return { ok: true, message: "Extension files removed" };
  }

  async enable(context: ExtensionContext): Promise<ExtensionOperationResult> {
    return { ok: true, message: `${context.definition.name} enabled` };
  }

  async disable(context: ExtensionContext): Promise<ExtensionOperationResult> {
    return { ok: true, message: `${context.definition.name} disabled` };
  }

  async update(context: ExtensionContext): Promise<ExtensionOperationResult> {
    return this.install(context);
  }

  async execute(
    _context: ExtensionContext,
    _payload: ExtensionExecutePayload,
  ): Promise<ExtensionOperationResult> {
    return notSupported("This extension does not expose a direct execute action");
  }

  getCapabilities(): string[] {
    return [];
  }
}
