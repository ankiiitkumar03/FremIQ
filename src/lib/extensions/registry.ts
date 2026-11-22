import type { ExtensionDefinition } from "./types";

/**
 * Trusted extension registry.
 *
 * Every definition is committed source code reviewed by the FREMIQ team. FREMIQ
 * never derives installation commands from remote repository metadata. The
 * `packageSpec` values below are the only inputs an adapter may install, and
 * they are pinned to reviewed versions.
 */
export const extensionRegistry: ExtensionDefinition[] = [
  {
    id: "hyperframes",
    name: "HyperFrames",
    icon: "frames",
    tagline: "HTML, CSS and GSAP video compositions rendered locally.",
    description:
      "HyperFrames turns plain HTML, CSS, media and seekable animations into deterministic MP4 files. It renders each frame in headless Chrome and encodes with FFmpeg, so the same composition produces the same video. FREMIQ uses it as an optional rendering backend for motion graphics, explainers and social bumpers.",
    category: "Video Rendering",
    version: "0.9.77",
    verification: "verified",
    source: {
      repository: "https://github.com/heygen-com/hyperframes",
      documentation: "https://hyperframes.heygen.com/introduction",
      website: "https://hyperframes.studio",
    },
    license: {
      name: "Apache License 2.0",
      spdx: "Apache-2.0",
      url: "https://github.com/heygen-com/hyperframes/blob/main/LICENSE",
      commercialUse: "Permitted, including commercial use, with no per-render fee.",
      acknowledgementRequired: false,
    },
    installMethod: "npm",
    packageSpec: "hyperframes@0.9.77",
    installSizeBytes: 145_000_000,
    supportedPlatforms: ["win32", "darwin", "linux"],
    dependencies: [
      { name: "Node.js", kind: "node", minVersion: "22.0.0", required: true, hint: "Install Node.js 22 LTS from nodejs.org." },
      { name: "FFmpeg", kind: "ffmpeg", required: true, hint: "FREMIQ bundles FFmpeg, or install it on PATH." },
      { name: "Git", kind: "git", required: false, hint: "Optional; only needed for skill updates from source." },
    ],
    capabilities: [
      "HTML/CSS/JavaScript video compositions",
      "GSAP-powered animation",
      "Animated explainers and product videos",
      "Local rendering through headless Chrome",
      "Agent skill integration",
    ],
    configuration: [
      "FREMIQ creates a frame-seekable HyperFrames composition from Motion Studio settings for each render.",
      "Optionally install the HyperFrames core skills for AI agents.",
    ],
    healthCheck: "Verifies the pinned npm package and the hyperframes CLI, then runs --version.",
    integration: ["Motion Studio", "AI Editor", "Render Queue", "Local Agent"],
    skill: true,
    mcp: false,
    notes:
      "Installed into an isolated directory under .data/extensions/hyperframes. FREMIQ does not modify your global npm packages.",
  },
  {
    id: "remotion",
    name: "Remotion",
    icon: "react",
    tagline: "React-based programmatic video compositions.",
    description:
      "Remotion renders FREMIQ clip exports from a generated React composition. For Motion Studio, it can also render a custom Remotion project you configure, while FFmpeg remains the default backend.",
    category: "Video Rendering",
    version: "4.0.545",
    verification: "verified",
    source: {
      repository: "https://github.com/remotion-dev/remotion",
      documentation: "https://www.remotion.dev/docs",
      website: "https://www.remotion.dev",
    },
    license: {
      name: "Remotion License (free for individuals and teams of up to 3)",
      spdx: "NOASSERTION",
      url: "https://github.com/remotion-dev/remotion/blob/main/LICENSE.md",
      commercialUse:
        "Free for individuals, non-profits and for-profit organisations with up to 3 employees. Larger for-profit companies require a paid company license from Remotion.",
      acknowledgementRequired: true,
    },
    installMethod: "npm",
    packageSpec: "remotion@4.0.545 @remotion/cli@4.0.545",
    installSizeBytes: 210_000_000,
    supportedPlatforms: ["win32", "darwin", "linux"],
    dependencies: [
      { name: "Node.js", kind: "node", minVersion: "18.0.0", required: true, hint: "Install Node.js 20+ from nodejs.org." },
      { name: "FFmpeg", kind: "ffmpeg", required: true, hint: "FREMIQ bundles FFmpeg, or install it on PATH." },
      { name: "Chrome", kind: "browser", required: false, hint: "Remotion downloads or uses Chrome for rendering." },
    ],
    capabilities: [
      "React video compositions",
      "Reusable templates",
      "Data-driven videos",
      "Programmatic rendering",
      "Interactive Remotion Player previews",
    ],
    configuration: [
      "FREMIQ clip exports work after installation. Provide a project directory, entry point and composition ID only when using a custom Motion Studio composition.",
      "Confirm your organisation is eligible under the Remotion License before enabling.",
    ],
    healthCheck: "Verifies remotion and @remotion/cli are installed at the pinned version.",
    integration: ["Motion Studio", "AI Editor", "Render Queue", "Timeline Studio"],
    skill: false,
    mcp: false,
    notes:
      "Remotion licensing depends on your organisation size. FREMIQ requires an explicit licence acknowledgement before installation.",
  },
  {
    id: "motionmaxxing",
    name: "Motionmaxxing",
    icon: "motion",
    tagline: "An agent skill for motion-design direction and quality checks.",
    description:
      "Motionmaxxing is an agent skill that turns generic AI motion into deliberate motion design: launch films, kinetic typography and product promos. It ships animation guidelines, measured easing references and a quality-check protocol. FREMIQ installs it as an optional skill for Motion Studio and the AI Editor.",
    category: "Motion Graphics",
    version: "main",
    verification: "verified",
    source: {
      repository: "https://github.com/Tejashmakwana/motionmaxxing",
      documentation: "https://github.com/Tejashmakwana/motionmaxxing#readme",
      website: "https://finalmotion.video",
    },
    license: {
      name: "Apache License 2.0",
      spdx: "Apache-2.0",
      url: "https://github.com/Tejashmakwana/motionmaxxing/blob/main/LICENSE",
      commercialUse: "Permitted under Apache 2.0.",
      acknowledgementRequired: false,
    },
    installMethod: "git-clone",
    packageSpec: "https://github.com/Tejashmakwana/motionmaxxing.git#main",
    installSizeBytes: 12_000_000,
    supportedPlatforms: ["win32", "darwin", "linux"],
    dependencies: [
      { name: "Node.js", kind: "node", minVersion: "22.0.0", required: true, hint: "The skill runtime expects Node.js 22+." },
      { name: "Git", kind: "git", required: true, hint: "Install Git for Windows from git-scm.com." },
      { name: "FFmpeg", kind: "ffmpeg", required: true, hint: "Used for the skill's local render checks." },
      { name: "Chrome", kind: "browser", required: false, hint: "Used by the skill's render runtime." },
    ],
    capabilities: [
      "Professional motion design direction",
      "Product launch films",
      "Kinetic typography",
      "GSAP animation workflows",
      "Animation quality gates",
    ],
    configuration: [
      "Copy the installed SKILL.md folder into your AI agent's skills directory.",
      "FREMIQ exposes the skill path from the extension detail view.",
    ],
    healthCheck: "Verifies the cloned repository contains SKILL.md and the runtime folder.",
    integration: ["Motion Studio", "AI Editor", "AI Agents"],
    skill: true,
    mcp: false,
    notes:
      "This is an agent skill, not a rendering engine. It works alongside FFmpeg, HyperFrames or Remotion rather than replacing them.",
  },
  {
    id: "earshot",
    name: "Earshot",
    icon: "audio",
    tagline: "Sound-effect design and audio analysis for agents.",
    description:
      "Earshot renders sound effects from plain-language requests using a catalogue of code-built designs, can analyse an audio file in words and numbers, and ships an MCP server. FREMIQ installs the base Python package only; listening models are never downloaded until you explicitly enable them.",
    category: "Audio & Sound Design",
    version: "git-main",
    verification: "verified",
    source: {
      repository: "https://github.com/Leonxlnx/earshot",
      documentation: "https://github.com/Leonxlnx/earshot#readme",
      website: "https://leonxlnx.github.io/earshot-site/",
    },
    license: {
      name: "MIT License",
      spdx: "MIT",
      url: "https://github.com/Leonxlnx/earshot/blob/main/LICENSE",
      commercialUse: "Permitted under MIT.",
      acknowledgementRequired: false,
    },
    installMethod: "pip-git",
    packageSpec: "earshot @ git+https://github.com/Leonxlnx/earshot",
    installSizeBytes: 40_000_000,
    supportedPlatforms: ["win32", "darwin", "linux"],
    dependencies: [
      { name: "Python", kind: "python", minVersion: "3.10.0", required: true, hint: "Install Python 3.10+ and enable “Add to PATH”." },
      { name: "Git", kind: "git", required: true, hint: "The package is installed from its GitHub repository." },
      { name: "FFmpeg", kind: "ffmpeg", required: false, hint: "Recommended for audio decoding and export." },
    ],
    capabilities: [
      "Sound-effect workflows",
      "Audio analysis and description",
      "Sound design from code",
      "Audio matching",
      "MCP server and agent skills",
    ],
    configuration: [
      "Base package only. Listening models stay disabled until enabled explicitly.",
      "Optionally register the earshot MCP server with your AI agent.",
    ],
    healthCheck: "Imports the package from its isolated site-packages directory and reports its version.",
    integration: ["Audio Studio", "AI Editor", "AI Agents", "Media Library"],
    skill: true,
    mcp: true,
    notes:
      "PyPI already hosts an unrelated package named earshot, so FREMIQ installs directly from the verified GitHub repository into an isolated target directory.",
  },
  {
    id: "shortcraft",
    name: "Shortcraft",
    icon: "clapper",
    tagline: "Planned short-form video extension. Not yet verified.",
    description:
      "Shortcraft is listed as a planned extension. FREMIQ has not confirmed a canonical project, repository, supported platform, installation procedure or license, so it cannot be installed. This entry exists so the marketplace can track it without inventing capabilities.",
    category: "Video Rendering",
    version: "unverified",
    verification: "planned",
    source: {
      repository: null,
      documentation: null,
      website: null,
    },
    license: {
      name: "Unverified",
      spdx: null,
      url: null,
      commercialUse: "Unknown until the canonical project is verified.",
      acknowledgementRequired: false,
    },
    installMethod: "unverified",
    packageSpec: null,
    installSizeBytes: null,
    supportedPlatforms: [],
    dependencies: [],
    capabilities: [],
    configuration: ["Verification required before this extension can be installed."],
    healthCheck: "Not available until the project is verified.",
    integration: [],
    skill: false,
    mcp: false,
    notes:
      "Multiple unrelated repositories share the name “shortcraft”. FREMIQ will not guess which one is canonical or run any installation command.",
  },
  {
    id: "3dviz",
    name: "3DViz",
    icon: "box",
    tagline: "Planned 3D visualisation extension. Not yet verified.",
    description:
      "3DViz is listed as a planned extension. FREMIQ has not confirmed which project owns the name, its supported platform, installation procedure or license, so it cannot be installed. This entry tracks the plan without inventing capabilities.",
    category: "3D & Visualization",
    version: "unverified",
    verification: "planned",
    source: {
      repository: null,
      documentation: null,
      website: null,
    },
    license: {
      name: "Unverified",
      spdx: null,
      url: null,
      commercialUse: "Unknown until the canonical project is verified.",
      acknowledgementRequired: false,
    },
    installMethod: "unverified",
    packageSpec: null,
    installSizeBytes: null,
    supportedPlatforms: [],
    dependencies: [],
    capabilities: [],
    configuration: ["Verification required before this extension can be installed."],
    healthCheck: "Not available until the project is verified.",
    integration: [],
    skill: false,
    mcp: false,
    notes:
      "Several unrelated 3D projects share the name “3dviz”. FREMIQ will not install an unverified package.",
  },
];

export const extensionCategories = [
  "Video Rendering",
  "Motion Graphics",
  "3D & Visualization",
  "Audio & Sound Design",
  "AI Agent Skills",
  "Developer Tools",
] as const;

export function getDefinition(id: string): ExtensionDefinition | undefined {
  return extensionRegistry.find((extension) => extension.id === id);
}
