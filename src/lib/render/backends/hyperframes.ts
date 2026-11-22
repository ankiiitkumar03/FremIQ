import fs from "node:fs";
import path from "node:path";
import { dirs } from "@/lib/storage";
import { loadMediaForRender } from "@/lib/media/render";
import { executeExtension, getExtensionView } from "@/lib/extensions/manager";
import type { MotionComposition, RenderSpec } from "@/lib/types";
import type { BackendStatus, RenderBackend } from "./types";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeColor(value: string) {
  return /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : "#101116";
}

function compositionHtml(composition: MotionComposition) {
  const accent = safeColor(composition.accent);
  const background = safeColor(composition.background);
  const title = escapeHtml(composition.title || "FREMIQ");
  const subtitle = escapeHtml(composition.subtitle || "");
  const fromVars =
    composition.animation === "slide"
      ? "{ opacity: 0, y: 60 }"
      : composition.animation === "scale"
        ? "{ opacity: 0, scale: 0.8 }"
        : composition.animation === "typewriter"
          ? "{ opacity: 0, clipPath: 'inset(0 100% 0 0)' }"
          : "{ opacity: 0 }";
  const toVars =
    composition.animation === "slide"
      ? "{ opacity: 1, y: 0 }"
      : composition.animation === "scale"
        ? "{ opacity: 1, scale: 1 }"
        : composition.animation === "typewriter"
          ? "{ opacity: 1, clipPath: 'inset(0 0% 0 0)' }"
          : "{ opacity: 1 }";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      html, body { margin: 0; padding: 0; width: ${composition.width}px; height: ${composition.height}px; background: ${background}; overflow: hidden; }
      body { display: flex; align-items: center; justify-content: center; font-family: Inter, system-ui, sans-serif; }
      #fremiq-motion { position: relative; width: ${composition.width}px; height: ${composition.height}px; overflow: hidden; }
      .stage { position: relative; display: flex; flex-direction: column; align-items: center; gap: 18px; text-align: center; padding: 64px; }
      .glow { position: absolute; inset: -20%; background: radial-gradient(50% 50% at 50% 30%, ${accent}55 0%, transparent 70%); pointer-events: none; }
      h1 { position: relative; margin: 0; color: #F5F5F7; font-size: ${Math.round(composition.height / 12)}px; letter-spacing: -0.02em; }
      p { position: relative; margin: 0; color: ${accent}; font-size: ${Math.round(composition.height / 36)}px; font-weight: 600; }
      .rule { position: relative; width: 180px; height: 4px; border-radius: 999px; background: ${accent}; }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
  </head>
  <body>
    <div id="fremiq-motion" data-composition-id="fremiq-motion" data-start="0" data-width="${composition.width}" data-height="${composition.height}" data-duration="${composition.duration}">
      <div class="stage">
        <div class="glow"></div>
        <h1 id="title">${title}</h1>
        ${subtitle ? `<p id="subtitle">${subtitle}</p>` : ""}
        <div class="rule" id="rule"></div>
      </div>
    </div>
    <script>
      const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });
      tl.fromTo("#title", ${fromVars}, Object.assign({}, ${toVars}, { duration: 1.1 }));
      ${subtitle ? 'tl.fromTo("#subtitle", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.8 }, "-=0.5");' : ""}
      tl.fromTo("#rule", { scaleX: 0, transformOrigin: "left center" }, { scaleX: 1, duration: 0.9 }, "-=0.4");
      window.__timelines = window.__timelines || {};
      window.__timelines["fremiq-motion"] = tl;
    </script>
  </body>
</html>`;
}

function clipCompositionHtml(
  spec: Extract<RenderSpec, { type: "clips" }>,
  sourcePath: string,
  hasAudio: boolean,
) {
  const [widthValue, heightValue] = spec.resolution.split("x").map(Number);
  const width = widthValue > 0 ? widthValue : 1080;
  const height = heightValue > 0 ? heightValue : 1920;
  const segment = spec.segments[0];
  if (!segment) throw new Error("HyperFrames needs one clip segment per render job");
  const duration = Math.max(0.2, segment.end - segment.start);
  const mediaUrl = sourcePath.split(path.sep).map((part) => encodeURIComponent(part)).join("/");
  const style = spec.subtitles?.style;
  const cueHtml = (spec.subtitles?.cues ?? [])
    .filter((cue) => cue.end > segment.start && cue.start < segment.end)
    .map((cue) => {
      const start = Math.max(0, cue.start - segment.start);
      const end = Math.min(duration, cue.end - segment.start);
      if (end <= start) return "";
      const text = style?.uppercase ? cue.text.toUpperCase() : cue.text;
      return `<div class="caption clip" data-start="${start.toFixed(3)}" data-duration="${(end - start).toFixed(3)}" data-track-index="1">${escapeHtml(text)}</div>`;
    })
    .join("\n");
  const color = safeColor(style?.primaryColor ?? "#ffffff");
  const top = style?.position === "top" ? "8%" : style?.position === "center" ? "50%" : "88%";
  const background = style?.background
    ? `rgba(0,0,0,${Math.max(0, Math.min(1, style.backgroundOpacity ?? 0.55))})`
    : "transparent";
  const fontSize = Math.max(18, Math.min(128, style?.fontSize ?? Math.round(height / 18)));
  const weight = style?.bold ? "700" : "500";
  const textShadow = style?.outlineWidth
    ? `0 2px ${Math.min(16, style.outlineWidth * 2)}px ${safeColor(style.outlineColor ?? "#000000")}`
    : "0 2px 12px #000";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><style>
html,body{margin:0;padding:0;width:${width}px;height:${height}px;background:#000;overflow:hidden}
#fremiq-clip{position:relative;width:${width}px;height:${height}px;overflow:hidden}
video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.caption{position:absolute;left:6%;width:88%;top:${top};transform:translateY(-50%);box-sizing:border-box;padding:${style?.background ? "0.24em 0.5em" : "0"};border-radius:0.2em;background:${background};color:${color};font-family:${JSON.stringify(style?.fontFamily ?? "Arial, sans-serif")};font-size:${fontSize}px;font-weight:${weight};font-style:${style?.italic ? "italic" : "normal"};text-align:center;text-shadow:${textShadow};line-height:1.18}
</style><script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script></head>
<body><div id="fremiq-clip" data-composition-id="fremiq-clip" data-start="0" data-width="${width}" data-height="${height}" data-duration="${duration.toFixed(3)}">
<video class="clip" data-start="0" data-duration="${duration.toFixed(3)}" data-media-start="${Math.max(0, segment.start).toFixed(3)}" data-track-index="0"${hasAudio ? ' data-has-audio="true"' : ""} src="${escapeHtml(mediaUrl)}"></video>
${cueHtml}
</div><script>const tl=gsap.timeline({paused:true});window.__timelines=window.__timelines||{};window.__timelines["fremiq-clip"]=tl;</script></body></html>`;
}

export const hyperframesBackend: RenderBackend = {
  key: "hyperframes",
  label: "HyperFrames",
  description:
    "HTML/CSS/GSAP compositions rendered locally with headless Chrome and FFmpeg. Requires the optional HyperFrames extension.",
  extensionId: "hyperframes",
  supports: ["motion", "clips"],
  configRequirements: ["Install and enable the HyperFrames extension", "Node.js 22+ and a Chrome/Chromium browser"],
  async detect(): Promise<BackendStatus> {
    try {
      const view = await getExtensionView("hyperframes");
      const operational = view.operational;
      return {
        key: "hyperframes",
        label: "HyperFrames",
        description: this.description,
        extensionId: "hyperframes",
        installed: view.installed,
        operational,
        available: operational,
        reason: operational
          ? null
          : view.installed
            ? `Installed but not operational (health: ${view.health}, enabled: ${view.enabled ? "yes" : "no"})`
            : "HyperFrames extension is not installed",
        supports: this.supports,
        configRequirements: this.configRequirements,
        version: view.installedVersion,
      };
    } catch {
      return {
        key: "hyperframes",
        label: "HyperFrames",
        description: this.description,
        extensionId: "hyperframes",
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
      return { ok: false, reason: "HyperFrames in FREMIQ currently renders motion compositions and short clips" };
    }
    return { ok: true, reason: null };
  },
  async execute({ jobId, spec, outputPath, onProgress }) {
    if (spec.type !== "motion" && spec.type !== "clips") {
      throw new Error("HyperFrames only supports motion and clip renders");
    }
    const status = await this.detect();
    if (!status.operational) {
      throw new Error(status.reason ?? "HyperFrames is not operational");
    }
    const projectDir = path.join(dirs.workspace, "hyperframes", jobId.slice(0, 12));
    fs.mkdirSync(projectDir, { recursive: true });
    if (spec.type === "motion") {
      fs.writeFileSync(path.join(projectDir, "index.html"), compositionHtml(spec.composition), "utf8");
    } else {
      if (spec.segments.length !== 1) throw new Error("Render clips one at a time with HyperFrames");
      const source = await loadMediaForRender(spec.sourceMediaId);
      const relativeSource = path.relative(projectDir, source.absolutePath);
      fs.writeFileSync(path.join(projectDir, "index.html"), clipCompositionHtml(spec, relativeSource, source.row.hasAudio), "utf8");
    }
    await onProgress("Preparing", 0.1, `HyperFrames composition written to ${projectDir}`);

    const result = await executeExtension("hyperframes", {
      operation: "render",
      projectDir,
      output: outputPath,
    });
    if (!result.ok) throw new Error(result.message);
    await onProgress("Verifying", 0.95, "Verifying HyperFrames output");
    const stat = fs.statSync(outputPath);
    if (stat.size < 1024) throw new Error("HyperFrames produced an empty or invalid file");
    await onProgress("Completed", 1, `Verified ${(stat.size / 1024 / 1024).toFixed(2)} MB output`);
    return {
      sizeBytes: stat.size,
      durationSec:
        spec.type === "clips"
          ? spec.segments.reduce((sum, segment) => sum + segment.end - segment.start, 0)
          : spec.duration,
      backend: "hyperframes",
      detail: spec.type === "clips" ? "Rendered clip with HyperFrames" : "Rendered with HyperFrames",
    };
  },
};
