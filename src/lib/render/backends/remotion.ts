import fs from "node:fs";
import path from "node:path";
import { loadMediaForRender } from "@/lib/media/render";
import { executeExtension, getExtensionView } from "@/lib/extensions/manager";
import type { RenderSpec } from "@/lib/types";
import type { BackendStatus, RenderBackend } from "./types";

function remotionClipEntry(input: {
  fps: number;
  frames: number;
  width: number;
  height: number;
  sourceName: string;
  trimBefore: number;
  captions: Array<{ startFrame: number; endFrame: number; text: string }>;
  captionStyle: Record<string, string | number | boolean>;
}) {
  return [
    'import React from "react";',
    'import { AbsoluteFill, Composition, OffthreadVideo, registerRoot, staticFile, useCurrentFrame } from "remotion";',
    `const captions = ${JSON.stringify(input.captions)};`,
    `const captionStyle = ${JSON.stringify(input.captionStyle)};`,
    `const Clip = () => { const frame = useCurrentFrame(); const cue = captions.find((item) => frame >= item.startFrame && frame < item.endFrame); return <AbsoluteFill style={{backgroundColor:"black"}}><OffthreadVideo src={staticFile(${JSON.stringify(input.sourceName)})} trimBefore={${input.trimBefore}} durationInFrames={${input.frames}} style={{width:"100%",height:"100%",objectFit:"cover"}} />{cue ? <div style={captionStyle}>{cue.text}</div> : null}</AbsoluteFill>; };`,
    `const Root = () => <Composition id="FremiqClip" component={Clip} width={${input.width}} height={${input.height}} fps={${input.fps}} durationInFrames={${input.frames}} />;`,
    "registerRoot(Root);",
  ].join("\n");
}

function safeColor(value: string | undefined, fallback: string) {
  return value && /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : fallback;
}

async function renderClipWithRemotion(
  jobId: string,
  spec: Extract<RenderSpec, { type: "clips" }>,
  outputPath: string,
  onProgress: Parameters<RenderBackend["execute"]>[0]["onProgress"],
) {
  if (spec.segments.length !== 1) throw new Error("Render clips one at a time with Remotion");
  const view = await getExtensionView("remotion");
  if (!view.operational || !view.installPath) throw new Error("Remotion must be installed, enabled and healthy");
  const segment = spec.segments[0];
  const duration = Math.max(0.2, segment.end - segment.start);
  const fps = Math.max(1, Math.min(60, spec.fps));
  const frames = Math.max(1, Math.ceil(duration * fps));
  const [widthValue, heightValue] = spec.resolution.split("x").map(Number);
  const width = widthValue > 0 ? widthValue : 1080;
  const height = heightValue > 0 ? heightValue : 1920;
  const source = await loadMediaForRender(spec.sourceMediaId);
  const runtimeDir = path.join(view.installPath, `.fremiq-${jobId.slice(0, 12)}`);
  const publicDir = path.join(runtimeDir, "public");
  fs.rmSync(runtimeDir, { recursive: true, force: true });
  fs.mkdirSync(publicDir, { recursive: true });
  const sourceName = `source${path.extname(source.absolutePath) || ".mp4"}`;
  const localSource = path.join(publicDir, sourceName);
  try {
    fs.linkSync(source.absolutePath, localSource);
  } catch {
    fs.copyFileSync(source.absolutePath, localSource);
  }

  const style = spec.subtitles?.style;
  const captions = (spec.subtitles?.cues ?? [])
    .filter((cue) => cue.end > segment.start && cue.start < segment.end)
    .map((cue) => ({
      startFrame: Math.floor(Math.max(0, cue.start - segment.start) * fps),
      endFrame: Math.ceil(Math.min(duration, cue.end - segment.start) * fps),
      text: style?.uppercase ? cue.text.toUpperCase() : cue.text,
    }))
    .filter((cue) => cue.endFrame > cue.startFrame);
  const top = style?.position === "top" ? "8%" : style?.position === "center" ? "50%" : "88%";
  const captionStyle = {
    position: "absolute",
    left: "6%",
    width: "88%",
    top,
    transform: "translateY(-50%)",
    boxSizing: "border-box",
    padding: style?.background ? "0.24em 0.5em" : "0",
    borderRadius: "0.2em",
    backgroundColor: style?.background ? `rgba(0,0,0,${Math.max(0, Math.min(1, style.backgroundOpacity ?? 0.55))})` : "transparent",
    color: safeColor(style?.primaryColor, "#ffffff"),
    fontFamily: style?.fontFamily ?? "Arial, sans-serif",
    fontSize: Math.max(18, Math.min(128, style?.fontSize ?? Math.round(height / 18))),
    fontWeight: style?.bold ? "700" : "500",
    fontStyle: style?.italic ? "italic" : "normal",
    textAlign: "center",
    textShadow: style?.outlineWidth
      ? `0 2px ${Math.min(16, style.outlineWidth * 2)}px ${safeColor(style.outlineColor, "#000000")}`
      : "0 2px 12px #000",
    lineHeight: 1.18,
  };
  fs.writeFileSync(
    path.join(runtimeDir, "index.tsx"),
    remotionClipEntry({
      fps,
      frames,
      width,
      height,
      sourceName,
      trimBefore: Math.round(segment.start * Math.max(1, source.row.fps ?? fps)),
      captions,
      captionStyle,
    }),
    "utf8",
  );

  try {
    await onProgress("Preparing", 0.1, "Preparing FREMIQ clip composition for Remotion");
    const result = await executeExtension("remotion", {
      operation: "render",
      projectDir: runtimeDir,
      entryPoint: "index.tsx",
      compositionId: "FremiqClip",
      output: outputPath,
    });
    if (!result.ok) throw new Error(result.message);
    const stat = fs.statSync(outputPath);
    if (stat.size < 1024) throw new Error("Remotion produced an empty or invalid clip");
    await onProgress("Verifying", 0.95, "Verifying Remotion clip output");
    await onProgress("Completed", 1, `Verified ${(stat.size / 1024 / 1024).toFixed(2)} MB output`);
    return { sizeBytes: stat.size, durationSec: duration, backend: "remotion" as const, detail: "Rendered clip with Remotion" };
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
}

export const remotionBackend: RenderBackend = {
  key: "remotion",
  label: "Remotion",
  description:
    "React-based clip exports use a FREMIQ composition. Motion Studio can render a custom Remotion project you configure.",
  extensionId: "remotion",
  supports: ["motion", "clips"],
  configRequirements: [
    "Install and enable the Remotion extension",
    "Custom Motion Studio renders need a project directory, entry point and composition ID",
    "Confirm your organisation meets the Remotion License terms",
  ],
  async detect(): Promise<BackendStatus> {
    try {
      const view = await getExtensionView("remotion");
      const config = view.config;
      const configured = Boolean(config.projectDir && config.compositionId);
      const operational = view.operational && configured;
      let reason: string | null = null;
      if (!view.installed) reason = "Remotion extension is not installed";
      else if (!view.enabled) reason = "Remotion extension is disabled";
      else if (view.health !== "ok") reason = `Health check is ${view.health}`;
      else if (!configured) reason = "Remotion can render FREMIQ clips; configure a project for custom motion renders";
      return {
        key: "remotion",
        label: "Remotion",
        description: this.description,
        extensionId: "remotion",
        installed: view.installed,
        operational,
        available: view.operational,
        reason,
        supports: this.supports,
        configRequirements: this.configRequirements,
        version: view.installedVersion,
      };
    } catch {
      return {
        key: "remotion",
        label: "Remotion",
        description: this.description,
        extensionId: "remotion",
        installed: false,
        operational: false,
        available: false,
        reason: "Extension state unavailable",
        supports: this.supports,
        configRequirements: this.configRequirements,
        version: null,
      };
    }
  },
  validate(spec) {
    if (spec.type !== "motion" && spec.type !== "clips") {
      return { ok: false, reason: "Remotion in FREMIQ supports clip and motion renders" };
    }
    return { ok: true, reason: null };
  },
  async execute({ jobId, spec, outputPath, onProgress }) {
    if (spec.type === "clips") {
      return renderClipWithRemotion(jobId, spec, outputPath, onProgress);
    }
    if (spec.type !== "motion") throw new Error("Remotion only supports motion renders");
    const status = await this.detect();
    if (!status.operational) throw new Error(status.reason ?? "Remotion is not operational");
    const view = await getExtensionView("remotion");
    const projectDir = view.config.projectDir;
    const compositionId = view.config.compositionId;
    const entryPoint = view.config.entryPoint;
    if (typeof projectDir !== "string" || typeof compositionId !== "string") {
      throw new Error("Remotion project configuration is incomplete");
    }
    await onProgress("Preparing", 0.1, `Remotion composition ${compositionId}`);
    const result = await executeExtension("remotion", {
      operation: "render",
      projectDir,
      entryPoint: typeof entryPoint === "string" ? entryPoint : undefined,
      compositionId,
      output: outputPath,
    });
    if (!result.ok) throw new Error(result.message);
    await onProgress("Verifying", 0.95, "Verifying Remotion output");
    const stat = fs.statSync(outputPath);
    if (stat.size < 1024) throw new Error("Remotion produced an empty or invalid file");
    await onProgress("Completed", 1, `Verified ${(stat.size / 1024 / 1024).toFixed(2)} MB output`);
    return {
      sizeBytes: stat.size,
      durationSec: spec.duration,
      backend: "remotion",
      detail: `Rendered Remotion composition ${compositionId}`,
    };
  },
};
