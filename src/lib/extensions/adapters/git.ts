import fs from "node:fs";
import path from "node:path";
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

export class GitSkillAdapter extends BaseAdapter {
  async detect(): Promise<ExtensionDetection> {
    const installDir = path.join(process.cwd(), ".data", "extensions", "motionmaxxing");
    const skill = path.join(installDir, "SKILL.md");
    if (!fs.existsSync(skill)) {
      return { installed: false, version: null, path: null, detail: "SKILL.md not found" };
    }
    return { installed: true, version: "main", path: installDir, detail: "Agent skill present" };
  }

  async install(context: ExtensionContext): Promise<ExtensionOperationResult> {
    const git = findOnPath(["git"]);
    if (!git) {
      return { ok: false, message: "Git was not found on PATH. Install Git for Windows from git-scm.com." };
    }
    const spec = context.definition.packageSpec ?? "";
    const [repo, branch = "main"] = spec.split("#");
    if (!repo) return { ok: false, message: "The registry entry has no repository to clone" };

    removeDirectory(context.installDir);
    fs.mkdirSync(path.dirname(context.installDir), { recursive: true });
    context.appendLog(`Cloning ${repo} (branch ${branch})`);
    const result = await runCommand(
      git,
      ["clone", "--depth", "1", "--branch", branch, repo, context.installDir],
      { timeoutMs: 10 * 60 * 1000, onLine: context.appendLog },
    );
    if (result.code !== 0) {
      return {
        ok: false,
        message: result.timedOut ? "git clone timed out" : `git clone failed with exit code ${result.code}`,
      };
    }
    if (!fs.existsSync(path.join(context.installDir, "SKILL.md"))) {
      return { ok: false, message: "The repository did not contain SKILL.md" };
    }
    return { ok: true, message: "Agent skill installed" };
  }

  async healthCheck(context: ExtensionContext): Promise<ExtensionHealthResult> {
    const skill = path.join(context.installDir, "SKILL.md");
    if (!fs.existsSync(skill)) return { health: "missing", detail: "SKILL.md is missing" };
    const runtime = path.join(context.installDir, "runtime");
    if (!fs.existsSync(runtime)) {
      return { health: "degraded", detail: "SKILL.md present but the runtime folder is missing" };
    }
    return { health: "ok", detail: "SKILL.md and runtime are present" };
  }

  getCapabilities(): string[] {
    return ["detect", "install", "uninstall", "enable", "disable", "update", "healthCheck", "skillPath"];
  }

  async execute(
    context: ExtensionContext,
    payload: ExtensionExecutePayload,
  ): Promise<ExtensionOperationResult> {
    const operation = String(payload.operation ?? "skillPath");
    if (operation === "skillPath") {
      return { ok: true, message: path.join(context.installDir, "SKILL.md") };
    }
    return { ok: false, message: `Unsupported Motionmaxxing operation: ${operation}` };
  }
}
