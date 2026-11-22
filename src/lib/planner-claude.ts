import { spawn } from "node:child_process";
import { findOnPath } from "@/lib/tools";
import type { MediaItem, Project } from "@/lib/db/schema";

const responseSchema = {
  type: "object",
  properties: { normalizedPrompt: { type: "string" } },
  required: ["normalizedPrompt"],
  additionalProperties: false,
};

export function hasClaudePlanner() {
  return Boolean(findOnPath(["claude", "claude-code"]));
}

export async function normalizeEditPromptWithClaude(input: {
  prompt: string;
  project: Project;
  media: MediaItem[];
  hasSubtitles: boolean;
  audioTracks: MediaItem[];
}) {
  const binary = findOnPath(["claude", "claude-code"]);
  if (!binary) throw new Error("Claude Code is not installed on the FREMIQ host");

  const context = {
    project: input.project.name,
    videos: input.media
      .filter((item) => item.kind === "video")
      .map((item) => ({ name: item.name, durationSeconds: item.durationSec })),
    hasSubtitles: input.hasSubtitles,
    audioTracks: input.audioTracks.map((item) => item.name),
  };
  const request = [
    "Rewrite the user's request as one concise editing instruction for FREMIQ's built-in video planner.",
    "Keep the user's intent. Do not invent source media, captions, or audio. Mention only supported requests: clip count, clip duration, aspect ratio (vertical 9:16, square 1:1, portrait 4:5, landscape 16:9), captions, silence removal, transitions, cinematic color, playback speed, background music, and an animated title.",
    "When a feature is unavailable from the supplied project context, preserve the request so FREMIQ can mark it unavailable. Return only the required structured result.",
    `Project context: ${JSON.stringify(context)}`,
    `User request: ${input.prompt.slice(0, 2000)}`,
  ].join("\n\n");

  const args = [
    "--bare",
    "--no-session-persistence",
    "--tools",
    "",
    "--disallowedTools",
    "mcp__*",
    "--max-turns",
    "1",
    "--output-format",
    "json",
    "--json-schema",
    JSON.stringify(responseSchema),
    "-p",
    request,
  ];

  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(binary, args, { cwd: process.cwd(), windowsHide: true });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(() => reject(new Error("Claude planning took too long. Check Claude Code login and try again.")));
    }, 120_000);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.length > 100_000) {
        child.kill();
        finish(() => reject(new Error("Claude returned an unexpectedly large response")));
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    child.once("error", (error) => {
      finish(() => reject(new Error(`Could not start Claude Code: ${error.message}`)));
    });
    child.once("close", (code) => {
      if (code !== 0) {
        finish(() => reject(new Error(stderr.trim() || `Claude Code exited with code ${code}`)));
        return;
      }
      finish(() => resolve(stdout));
    });
  });

  let parsed: { structured_output?: { normalizedPrompt?: unknown }; result?: string };
  try {
    parsed = JSON.parse(output) as typeof parsed;
  } catch {
    throw new Error("Claude Code returned an invalid response. Update Claude Code and try again.");
  }
  const normalizedPrompt = parsed.structured_output?.normalizedPrompt;
  if (typeof normalizedPrompt !== "string" || !normalizedPrompt.trim()) {
    throw new Error("Claude Code did not return a usable editing instruction");
  }
  return normalizedPrompt.trim().slice(0, 2000);
}
