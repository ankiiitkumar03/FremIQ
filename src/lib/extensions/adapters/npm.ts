import fs from "node:fs";
import path from "node:path";
import { dirs, resolveDataPath } from "@/lib/storage";
import { findOnPath } from "@/lib/tools";
import { runCommand } from "../runner";
import type {
  ExtensionContext,
  ExtensionDetection,
  ExtensionExecutePayload,
  ExtensionHealthResult,
  ExtensionOperationResult,
} from "../types";
import { BaseAdapter, binaryInInstall, readPackageVersion, removeDirectory } from "./base";

function resolveProjectDirectory(input: unknown): string {
  if (typeof input !== "string" || !input.trim()) {
    throw new Error("A project directory is required");
  }
  const candidate = path.isAbsolute(input)
    ? path.resolve(input)
    : path.resolve(dirs.root, input.replace(/^[/\\]+/, ""));
  const root = path.resolve(dirs.root);
  if (!candidate.startsWith(root + path.sep)) {
    throw new Error("Project directories must live inside the FREMIQ data directory");
  }
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isDirectory()) {
    throw new Error("Project directory was not found");
  }
  return candidate;
}

function resolveOutput(input: unknown, fallbackName: string): string {
  const value = typeof input === "string" && input.trim() ? input : fallbackName;
  const absolute = path.isAbsolute(value)
    ? path.resolve(value)
    : resolveDataPath(value);
  if (!absolute.startsWith(path.resolve(dirs.exports) + path.sep)) {
    throw new Error("Render outputs must be written inside the FREMIQ exports directory");
  }
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  return absolute;
}

export class NpmAdapter extends BaseAdapter {
  constructor(
    private readonly extensionId: string,
    private readonly packageNames: string[],
    private readonly primary: string,
    private readonly binaryName?: string,
  ) {
    super();
  }

  async detect(): Promise<ExtensionDetection> {
    const installDir = path.join(process.cwd(), ".data", "extensions", this.extensionId);
    const versions = this.packageNames
      .map((name) => readPackageVersion(installDir, name))
      .filter((value): value is string => Boolean(value));
    if (versions.length !== this.packageNames.length) {
      return { installed: false, version: null, path: null, detail: "Pinned packages are not installed" };
    }
    return {
      installed: true,
      version: readPackageVersion(installDir, this.primary),
      path: installDir,
      detail: `${this.packageNames.length} package${this.packageNames.length === 1 ? "" : "s"} present`,
    };
  }

  async install(context: ExtensionContext): Promise<ExtensionOperationResult> {
    const npm = findOnPath(["npm", "npm.cmd"]);
    if (!npm) {
      return { ok: false, message: "npm was not found on PATH. Install Node.js 22+ first." };
    }
    const node = findOnPath(["node"]);
    const npmCli = path.join(path.dirname(npm), "node_modules", "npm", "bin", "npm-cli.js");
    const runNpmThroughNode = process.platform === "win32" && Boolean(node) && fs.existsSync(npmCli);
    const npmBinary = runNpmThroughNode ? node! : npm;
    fs.mkdirSync(context.installDir, { recursive: true });
    const packageJson = path.join(context.installDir, "package.json");
    if (!fs.existsSync(packageJson)) {
      fs.writeFileSync(
        packageJson,
        JSON.stringify(
          { name: `fremiq-extension-${context.definition.id}`, private: true, version: "1.0.0" },
          null,
          2,
        ),
      );
    }
    const specs = (context.definition.packageSpec ?? "").split(/\s+/).filter(Boolean);
    context.appendLog(`Installing pinned packages: ${specs.join(", ")}`);
    const result = await runCommand(
      npmBinary,
      [
        ...(runNpmThroughNode ? [npmCli] : []),
        "install",
        "--prefix",
        context.installDir,
        "--no-audit",
        "--no-fund",
        "--loglevel=error",
        ...specs,
      ],
      { timeoutMs: 20 * 60 * 1000, onLine: context.appendLog },
    );
    if (result.code !== 0) {
      return {
        ok: false,
        message: result.timedOut
          ? "Installation timed out after 20 minutes"
          : `npm install failed with exit code ${result.code}`,
        logs: [result.output.slice(-4000)],
      };
    }
    return { ok: true, message: `${context.definition.name} installed into its isolated directory` };
  }

  async uninstall(context: ExtensionContext): Promise<ExtensionOperationResult> {
    removeDirectory(context.installDir);
    context.appendLog(`Removed ${context.installDir}`);
    return { ok: true, message: "Extension files removed" };
  }

  async healthCheck(context: ExtensionContext): Promise<ExtensionHealthResult> {
    const missing = this.packageNames.filter(
      (name) => !readPackageVersion(context.installDir, name),
    );
    if (missing.length > 0) {
      return { health: "missing", detail: `Missing packages: ${missing.join(", ")}` };
    }
    if (this.binaryName) {
      const binary = binaryInInstall(context.installDir, this.binaryName);
      if (!binary) {
        return { health: "degraded", detail: `Package present but the ${this.binaryName} CLI is missing` };
      }
    }
    return {
      health: "ok",
      detail: `${this.packageNames.join(", ")} installed at the pinned version`,
    };
  }

  getCapabilities(): string[] {
    return ["detect", "install", "uninstall", "enable", "disable", "update", "healthCheck"];
  }
}

export class HyperFramesAdapter extends NpmAdapter {
  constructor() {
    super("hyperframes", ["hyperframes"], "hyperframes", "hyperframes");
  }

  getCapabilities(): string[] {
    return [...super.getCapabilities(), "render"];
  }

  async execute(
    context: ExtensionContext,
    payload: ExtensionExecutePayload,
  ): Promise<ExtensionOperationResult> {
    const operation = String(payload.operation ?? "version");
    const binary = binaryInInstall(context.installDir, "hyperframes");
    if (!binary) return { ok: false, message: "The hyperframes CLI is not installed" };

    if (operation === "version") {
      const result = await runCommand(binary, ["--version"], { timeoutMs: 30_000 });
      return {
        ok: result.code === 0,
        message: result.output.trim().split("\n")[0] || "Version check failed",
      };
    }

    if (operation === "render") {
      const projectDir = resolveProjectDirectory(payload.projectDir);
      const output = resolveOutput(payload.output, "hyperframes-render.mp4");
      context.appendLog(`Rendering HyperFrames project ${projectDir}`);
      const result = await runCommand(binary, ["render", "-o", output], {
        cwd: projectDir,
        timeoutMs: 60 * 60 * 1000,
        onLine: context.appendLog,
      });
      if (result.code !== 0) {
        return {
          ok: false,
          message: result.timedOut
            ? "HyperFrames render timed out"
            : `HyperFrames render failed with exit code ${result.code}`,
        };
      }
      if (!fs.existsSync(output)) {
        return { ok: false, message: "HyperFrames reported success but no output file was written" };
      }
      return { ok: true, message: `Rendered ${path.basename(output)}` };
    }

    return { ok: false, message: `Unsupported HyperFrames operation: ${operation}` };
  }
}

export class RemotionAdapter extends NpmAdapter {
  constructor() {
    super("remotion", ["remotion", "@remotion/cli"], "remotion", "remotion");
  }

  getCapabilities(): string[] {
    return [...super.getCapabilities(), "render"];
  }

  async execute(
    context: ExtensionContext,
    payload: ExtensionExecutePayload,
  ): Promise<ExtensionOperationResult> {
    const operation = String(payload.operation ?? "version");
    const binary = binaryInInstall(context.installDir, "remotion");
    if (!binary) return { ok: false, message: "The Remotion CLI is not installed" };

    if (operation === "version") {
      const result = await runCommand(binary, ["versions"], { timeoutMs: 30_000 });
      return {
        ok: result.code === 0,
        message: result.output.trim().split("\n")[0] || "Version check failed",
      };
    }

    if (operation === "render") {
      const projectDir = resolveProjectDirectory(payload.projectDir);
      const entryPoint = typeof payload.entryPoint === "string" ? payload.entryPoint : "src/index.ts";
      const compositionId = payload.compositionId;
      if (typeof compositionId !== "string" || !compositionId.trim()) {
        return { ok: false, message: "A Remotion composition ID is required" };
      }
      if (entryPoint.includes("..")) {
        return { ok: false, message: "Entry point must stay inside the Remotion project" };
      }
      const output = resolveOutput(payload.output, "remotion-render.mp4");
      context.appendLog(`Rendering Remotion composition ${compositionId}`);
      const result = await runCommand(binary, ["render", entryPoint, compositionId, output], {
        cwd: projectDir,
        timeoutMs: 60 * 60 * 1000,
        onLine: context.appendLog,
      });
      if (result.code !== 0) {
        return {
          ok: false,
          message: result.timedOut
            ? "Remotion render timed out"
            : `Remotion render failed with exit code ${result.code}`,
        };
      }
      if (!fs.existsSync(output)) {
        return { ok: false, message: "Remotion reported success but no output file was written" };
      }
      return { ok: true, message: `Rendered ${path.basename(output)}` };
    }

    return { ok: false, message: `Unsupported Remotion operation: ${operation}` };
  }
}
