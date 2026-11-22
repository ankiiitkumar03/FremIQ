import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { commandVersion, findOnPath } from "@/lib/tools";
import { FFMPEG_PATH } from "@/lib/media/ffmpeg";
import type { DependencyKind, ExtensionDefinition, HostDependency } from "./types";

function parseVersion(value: string | null): number[] | null {
  if (!value) return null;
  const match = value.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}

export function meetsMinimum(version: string | null, minimum: string | undefined): boolean {
  if (!minimum) return Boolean(version);
  const current = parseVersion(version);
  const required = parseVersion(minimum);
  if (!current || !required) return false;
  for (let index = 0; index < 3; index += 1) {
    if (current[index] > required[index]) return true;
    if (current[index] < required[index]) return false;
  }
  return true;
}

function findBrowser(): string | null {
  const configured = process.env.CHROME_PATH ?? process.env.PUPPETEER_EXECUTABLE_PATH;
  if (configured && fs.existsSync(configured)) return configured;
  const fromPath = findOnPath([
    "chrome",
    "chromium",
    "chromium-browser",
    "google-chrome",
    "msedge",
  ]);
  if (fromPath) return fromPath;
  const candidates =
    process.platform === "win32"
      ? [
          path.join(process.env.PROGRAMFILES ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
          path.join(process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
          path.join(process.env.PROGRAMFILES ?? "C:\\Program Files", "Microsoft", "Edge", "Application", "msedge.exe"),
        ]
      : process.platform === "darwin"
        ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
        : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

export async function detectHostDependencies(): Promise<HostDependency[]> {
  const python = findOnPath(["python3", "python"]);
  const node = findOnPath(["node"]);
  const git = findOnPath(["git"]);
  const browser = findBrowser();
  const [pythonVersion, nodeVersion, gitVersion, ffmpegVersion] = await Promise.all([
    python ? commandVersion(python, ["--version"]) : Promise.resolve(null),
    node ? commandVersion(node, ["--version"]) : Promise.resolve(null),
    git ? commandVersion(git, ["--version"]) : Promise.resolve(null),
    fs.existsSync(FFMPEG_PATH) ? commandVersion(FFMPEG_PATH, ["-version"]) : Promise.resolve(null),
  ]);

  const rows: HostDependency[] = [
    {
      key: "node",
      label: "Node.js",
      installed: Boolean(node),
      version: nodeVersion,
      path: node,
      minVersion: "22.0.0",
      meetsMinimum: meetsMinimum(nodeVersion, "22.0.0"),
      requiredBy: [],
    },
    {
      key: "python",
      label: "Python",
      installed: Boolean(python),
      version: pythonVersion,
      path: python,
      minVersion: "3.10.0",
      meetsMinimum: meetsMinimum(pythonVersion, "3.10.0"),
      requiredBy: [],
    },
    {
      key: "git",
      label: "Git",
      installed: Boolean(git),
      version: gitVersion,
      path: git,
      minVersion: null,
      meetsMinimum: Boolean(git),
      requiredBy: [],
    },
    {
      key: "ffmpeg",
      label: "FFmpeg",
      installed: fs.existsSync(FFMPEG_PATH),
      version: ffmpegVersion,
      path: FFMPEG_PATH,
      minVersion: null,
      meetsMinimum: fs.existsSync(FFMPEG_PATH),
      requiredBy: [],
    },
    {
      key: "browser",
      label: "Chrome / Chromium",
      installed: Boolean(browser),
      version: browser ? "detected" : null,
      path: browser,
      minVersion: null,
      meetsMinimum: Boolean(browser),
      requiredBy: [],
    },
  ];
  return rows;
}

export type MissingDependency = { name: string; hint: string; required: boolean };

export async function checkExtensionDependencies(
  definition: ExtensionDefinition,
  host?: HostDependency[],
): Promise<{ missing: MissingDependency[]; satisfied: boolean }> {
  if (definition.dependencies.length === 0) return { missing: [], satisfied: true };
  const dependencies = host ?? (await detectHostDependencies());
  const byKey = new Map(dependencies.map((dependency) => [dependency.key, dependency]));
  const missing: MissingDependency[] = [];
  for (const dependency of definition.dependencies) {
    const kind: DependencyKind = dependency.kind;
    const hostRow = byKey.get(kind);
    if (!hostRow) continue;
    if (!hostRow.installed) {
      missing.push({ name: dependency.name, hint: dependency.hint, required: dependency.required });
      continue;
    }
    if (dependency.minVersion && !meetsMinimum(hostRow.version, dependency.minVersion)) {
      missing.push({
        name: `${dependency.name} ${dependency.minVersion}+`,
        hint: dependency.hint,
        required: dependency.required,
      });
    }
  }
  const satisfied = missing.filter((item) => item.required).length === 0;
  return { missing, satisfied };
}

export function extensionRoot() {
  return path.join(process.cwd(), ".data", "extensions");
}

export function platformKey(): "win32" | "darwin" | "linux" {
  if (process.platform === "win32") return "win32";
  if (process.platform === "darwin") return "darwin";
  return "linux";
}

export function platformLabel() {
  const platform = platformKey();
  if (platform === "win32") return `Windows ${os.release()}`;
  if (platform === "darwin") return `macOS ${os.release()}`;
  return `Linux ${os.release()}`;
}
