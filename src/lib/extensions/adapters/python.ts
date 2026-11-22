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
import { BaseAdapter, removeDirectory } from "./base";

function sitePackages(context: ExtensionContext) {
  return path.join(context.installDir, "site-packages");
}

function pythonEnv(context: ExtensionContext): Record<string, string> {
  const current = process.env.PYTHONPATH;
  return {
    PYTHONPATH: current ? `${sitePackages(context)}${path.delimiter}${current}` : sitePackages(context),
    PYTHONIOENCODING: "utf-8",
  };
}

export class PythonPackageAdapter extends BaseAdapter {
  async detect(): Promise<ExtensionDetection> {
    const installDir = path.join(process.cwd(), ".data", "extensions", "earshot");
    const packageDir = path.join(installDir, "site-packages", "earshot");
    if (!fs.existsSync(packageDir)) {
      return { installed: false, version: null, path: null, detail: "earshot package not found" };
    }
    return { installed: true, version: "git-main", path: installDir, detail: "earshot package present" };
  }

  async install(context: ExtensionContext): Promise<ExtensionOperationResult> {
    const python = findOnPath(["python3", "python"]);
    if (!python) {
      return { ok: false, message: "Python 3.10+ was not found on PATH" };
    }
    const spec = context.definition.packageSpec;
    if (!spec) return { ok: false, message: "The registry entry has no package specification" };
    const target = sitePackages(context);
    fs.mkdirSync(target, { recursive: true });
    context.appendLog("Installing the base package only. Listening extras and models are not downloaded.");
    const result = await runCommand(
      python,
      [
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        "--no-warn-script-location",
        "--upgrade",
        "--target",
        target,
        spec,
      ],
      { timeoutMs: 20 * 60 * 1000, onLine: context.appendLog },
    );
    if (result.code !== 0) {
      return {
        ok: false,
        message: result.timedOut ? "pip install timed out" : `pip install failed with exit code ${result.code}`,
      };
    }
    return { ok: true, message: "Earshot installed without listening extras" };
  }

  async uninstall(context: ExtensionContext): Promise<ExtensionOperationResult> {
    removeDirectory(context.installDir);
    context.appendLog(`Removed ${context.installDir}`);
    return { ok: true, message: "Extension files removed" };
  }

  async healthCheck(context: ExtensionContext): Promise<ExtensionHealthResult> {
    const python = findOnPath(["python3", "python"]);
    if (!python) return { health: "error", detail: "Python is not available" };
    if (!fs.existsSync(path.join(sitePackages(context), "earshot"))) {
      return { health: "missing", detail: "earshot is not installed" };
    }
    const result = await runCommand(
      python,
      ["-c", "import earshot; print(getattr(earshot, '__version__', 'installed'))"],
      { timeoutMs: 30_000, env: pythonEnv(context) },
    );
    if (result.code !== 0) {
      return { health: "degraded", detail: result.output.trim().split("\n").slice(-1)[0] ?? "Import failed" };
    }
    return { health: "ok", detail: result.output.trim() || "earshot imports successfully" };
  }

  getCapabilities(): string[] {
    return ["detect", "install", "uninstall", "enable", "disable", "update", "healthCheck", "make", "doctor"];
  }

  async execute(
    context: ExtensionContext,
    payload: ExtensionExecutePayload,
  ): Promise<ExtensionOperationResult> {
    const python = findOnPath(["python3", "python"]);
    if (!python) return { ok: false, message: "Python is not available" };
    const operation = String(payload.operation ?? "doctor");
    const env = pythonEnv(context);

    if (operation === "doctor") {
      const result = await runCommand(python, ["-m", "earshot", "doctor"], {
        timeoutMs: 60_000,
        env,
        onLine: context.appendLog,
      });
      return { ok: result.code === 0, message: result.output.trim().slice(-4000) || "No output" };
    }

    if (operation === "make") {
      const request = typeof payload.request === "string" ? payload.request.trim() : "";
      if (!request || request.length > 300) {
        return { ok: false, message: "Describe the sound in 1–300 characters" };
      }
      const requested = typeof payload.output === "string" && payload.output ? payload.output : "earshot-sfx.wav";
      const output = path.isAbsolute(requested) ? path.resolve(requested) : resolveDataPath(requested);
      const allowed = [path.resolve(dirs.root) + path.sep, path.resolve(dirs.exports) + path.sep];
      if (!allowed.some((prefix) => output.startsWith(prefix))) {
        return { ok: false, message: "Audio outputs must be written inside the FREMIQ data directory" };
      }
      fs.mkdirSync(path.dirname(output), { recursive: true });
      context.appendLog(`Generating sound effect: ${request}`);
      const result = await runCommand(python, ["-m", "earshot", "make", request, "-o", output], {
        timeoutMs: 10 * 60 * 1000,
        env,
        onLine: context.appendLog,
      });
      if (result.code !== 0) {
        return { ok: false, message: "earshot make failed", logs: [result.output.slice(-2000)] };
      }
      if (!fs.existsSync(output)) {
        return { ok: false, message: "earshot did not write the requested file" };
      }
      return { ok: true, message: `Sound written to ${output}` };
    }

    return { ok: false, message: `Unsupported Earshot operation: ${operation}` };
  }
}
