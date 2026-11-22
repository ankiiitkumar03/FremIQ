import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import type { ToolInfo } from "@/lib/types";
import { FFMPEG_PATH, FFPROBE_PATH } from "@/lib/media/ffmpeg";

export function findOnPath(names: string[]): string | null {
  const pathValue = process.env.PATH ?? "";
  const separator = process.platform === "win32" ? ";" : ":";
  const extensions =
    process.platform === "win32"
      ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";")
      : [""];
  for (const dir of pathValue.split(separator).filter(Boolean)) {
    for (const name of names) {
      for (const ext of extensions) {
        const candidate = path.join(dir, `${name}${ext.toLowerCase()}`);
        try {
          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
        } catch {
          // ignore unreadable path entries
        }
      }
    }
  }
  return null;
}

export async function commandVersion(binary: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(binary, args, { windowsHide: true });
    let output = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(null);
    }, 4000);
    child.stdout.on("data", (data: Buffer) => {
      output += data.toString();
    });
    child.stderr.on("data", (data: Buffer) => {
      output += data.toString();
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 && !output.trim()) return resolve(null);
      const first = output.split("\n").map((line) => line.trim()).find(Boolean);
      resolve(first ?? null);
    });
  });
}

async function pythonModules(): Promise<Record<string, boolean>> {
  const python = findOnPath(["python3", "python"]);
  if (!python) return {};
  return new Promise((resolve) => {
    const script =
      "import importlib.util,json;mods=['whisper','faster_whisper','torch','cv2','moviepy','numpy','PIL'];print(json.dumps({m: importlib.util.find_spec(m) is not None for m in mods}))";
    const child = spawn(/* turbopackIgnore: true */ python, ["-c", script], { windowsHide: true });
    let output = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({});
    }, 6000);
    child.stdout.on("data", (data: Buffer) => {
      output += data.toString();
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve({});
    });
    child.on("close", () => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(output.trim()));
      } catch {
        resolve({});
      }
    });
  });
}

export async function detectTools(): Promise<ToolInfo[]> {
  const ffmpegBinary = fs.existsSync(FFMPEG_PATH) ? FFMPEG_PATH : findOnPath(["ffmpeg"]);
  const ffprobeBinary = fs.existsSync(FFPROBE_PATH) ? FFPROBE_PATH : findOnPath(["ffprobe"]);
  const [python, node, git, ffmpegVersion, ffprobeVersion, modules] = await Promise.all([
    (async () => {
      const binary = findOnPath(["python3", "python"]);
      return { binary, version: binary ? await commandVersion(binary, ["--version"]) : null };
    })(),
    (async () => {
      const binary = findOnPath(["node"]);
      return { binary, version: binary ? await commandVersion(binary, ["--version"]) : null };
    })(),
    (async () => {
      const binary = findOnPath(["git"]);
      return { binary, version: binary ? await commandVersion(binary, ["--version"]) : null };
    })(),
    (async () => {
      if (!ffmpegBinary) return null;
      return commandVersion(ffmpegBinary, ["-version"]);
    })(),
    (async () => {
      if (!ffprobeBinary) return null;
      return commandVersion(ffprobeBinary, ["-version"]);
    })(),
    pythonModules(),
  ]);

  const remotionLocal = path.join(process.cwd(), "node_modules", "remotion", "package.json");
  const remotionInstalled = fs.existsSync(remotionLocal);
  let remotionVersion: string | null = null;
  if (remotionInstalled) {
    try {
      remotionVersion = JSON.parse(fs.readFileSync(remotionLocal, "utf8")).version ?? null;
    } catch {
      remotionVersion = null;
    }
  }

  const agentBins = {
    codex: findOnPath(["codex"]),
    claude: findOnPath(["claude", "claude-code"]),
    gemini: findOnPath(["gemini"]),
    cursor: findOnPath(["cursor-agent", "cursor"]),
  };

  const agentVersions = await Promise.all(
    Object.entries(agentBins).map(async ([key, binary]) => {
      if (!binary) return [key, null] as const;
      return [key, await commandVersion(binary, ["--version"])] as const;
    }),
  );
  const agentVersionMap = Object.fromEntries(agentVersions);

  const core = (
    key: string,
    name: string,
    installed: boolean,
    version: string | null,
    binary: string | null,
    hint: string,
    required = false,
  ): ToolInfo => ({
    key,
    name,
    category: "core",
    description: required
      ? "Required for video import and export"
      : "Only needed for optional integrations",
    required,
    installed,
    version,
    path: binary,
    health: installed ? "ok" : "missing",
    installHint: hint,
  });

  const mediaTool = (
    key: string,
    name: string,
    installed: boolean,
    hint: string,
    version: string | null = null,
    binary: string | null = null,
  ): ToolInfo => ({
    key,
    name,
    category: "media",
    description: "Optional media processing module",
    required: false,
    installed,
    version,
    path: binary,
    health: installed ? "ok" : "missing",
    installHint: hint,
  });

  const agentTool = (key: string, name: string, binary: string | null, version: string | null): ToolInfo => ({
    key,
    name,
    category: "ai-agent",
    description: "External coding agent integration",
    required: false,
    installed: Boolean(binary),
    version,
    path: binary,
    health: binary ? "ok" : "missing",
    installHint: `Install ${name} and make sure it is available on PATH, then re-check.`,
  });

  return [
    core(
      "python",
      "Python",
      Boolean(python.binary),
      python.version,
      python.binary,
      "Install Python 3.10+ from python.org and enable “Add to PATH”.",
    ),
    core(
      "node",
      "Node.js",
      Boolean(node.binary),
      node.version,
      node.binary,
      "Install Node.js 22+ (the current LTS release is recommended) from nodejs.org, then restart the FREMIQ host and re-check.",
    ),
    core("git", "Git", Boolean(git.binary), git.version, git.binary, "Install Git for your operating system from git-scm.com, then re-check."),
    core(
      "ffmpeg",
      "FFmpeg",
      Boolean(ffmpegVersion),
      ffmpegVersion,
      ffmpegBinary,
      "Install FFmpeg and add it to PATH, or use the FREMIQ installer bundle.",
      true,
    ),
    core(
      "ffprobe",
      "FFprobe",
      Boolean(ffprobeVersion),
      ffprobeVersion,
      ffprobeBinary,
      "FFprobe ships with FFmpeg. Reinstall FFmpeg with the probe tools.",
      true,
    ),
    mediaTool(
      "whisper",
      "OpenAI Whisper (Local package)",
      Boolean(modules.whisper),
      "pip install openai-whisper",
      modules.whisper ? "detected" : null,
    ),
    mediaTool(
      "faster-whisper",
      "Faster-Whisper (Local)",
      Boolean(modules.faster_whisper),
      "pip install faster-whisper",
      modules.faster_whisper ? "detected" : null,
    ),
    mediaTool(
      "torch",
      "PyTorch",
      Boolean(modules.torch),
      "pip install torch (choose the build for your GPU)",
      modules.torch ? "detected" : null,
    ),
    mediaTool(
      "opencv",
      "OpenCV",
      Boolean(modules.cv2),
      "pip install opencv-python",
      modules.cv2 ? "detected" : null,
    ),
    mediaTool(
      "moviepy",
      "MoviePy",
      Boolean(modules.moviepy),
      "pip install moviepy",
      modules.moviepy ? "detected" : null,
    ),
    mediaTool(
      "numpy",
      "NumPy",
      Boolean(modules.numpy),
      "pip install numpy",
      modules.numpy ? "detected" : null,
    ),
    mediaTool(
      "pillow",
      "Pillow",
      Boolean(modules.PIL),
      "pip install pillow",
      modules.PIL ? "detected" : null,
    ),
    mediaTool(
      "remotion",
      "Remotion",
      remotionInstalled,
      "npm install remotion @remotion/cli in your project",
      remotionVersion,
      remotionInstalled ? remotionLocal : null,
    ),
    agentTool("codex", "Codex CLI", agentBins.codex, agentVersionMap.codex ?? null),
    agentTool("claude", "Claude Code", agentBins.claude, agentVersionMap.claude ?? null),
    agentTool("gemini", "Gemini CLI", agentBins.gemini, agentVersionMap.gemini ?? null),
    agentTool("cursor", "Cursor", agentBins.cursor, agentVersionMap.cursor ?? null),
  ];
}

export function hostInfo() {
  return {
    platform: `${os.type()} ${os.release()}`,
    hostname: os.hostname(),
    cpus: os.cpus().length,
    cpuModel: os.cpus()[0]?.model ?? "Unknown CPU",
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    uptime: os.uptime(),
    arch: os.arch(),
  };
}
