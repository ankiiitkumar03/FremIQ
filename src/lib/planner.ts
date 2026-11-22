import type { MediaItem, Project } from "@/lib/db/schema";
import type { PlanOperation } from "@/lib/types";

const wordNumbers: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

function detectCount(prompt: string): number {
  const match = prompt.match(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\s+(?:[a-z-]+\s+)?(?:shorts?|clips?|videos?|reels?)\b/i,
  );
  if (!match) return 0;
  const raw = match[1].toLowerCase();
  return wordNumbers[raw] ?? Number(raw) ?? 0;
}

function detectDuration(prompt: string): number | null {
  const match = prompt.match(/\b(\d{1,3})\s*(?:s|sec|secs|seconds?)\b/i);
  if (match) return Math.max(5, Math.min(180, Number(match[1])));
  if (/\bshort\b|\bshorts\b|\breels?\b|\btiktok\b/i.test(prompt)) return 30;
  return null;
}

function detectAspect(prompt: string): string | null {
  if (/\b9:16\b|\bvertical\b|\breels?\b|\btiktok\b|\bshorts?\b/i.test(prompt)) return "9:16";
  if (/\b1:1\b|\bsquare\b/i.test(prompt)) return "1:1";
  if (/\b4:5\b/i.test(prompt)) return "4:5";
  if (/\b16:9\b|\bhorizontal\b|\bwidescreen\b/i.test(prompt)) return "16:9";
  return null;
}

function resolutionFor(aspect: string): string {
  const map: Record<string, string> = {
    "9:16": "1080x1920",
    "1:1": "1080x1080",
    "4:5": "1080x1350",
    "4:3": "1440x1080",
    "21:9": "2520x1080",
    "16:9": "1920x1080",
  };
  return map[aspect] ?? "1920x1080";
}

export type GeneratedPlan = {
  summary: string;
  operations: PlanOperation[];
  context: {
    sourceMediaId: string | null;
    sourceMediaName: string | null;
    aspectRatio: string;
    resolution: string;
    fps: number;
    clipCount: number;
    clipDuration: number;
    wantsCaptions: boolean;
    captionPreset: string;
    wantsMusic: boolean;
    wantsMotion: boolean;
    wantsSilenceRemoval: boolean;
    wantsTransitions: boolean;
    wantsColor: boolean;
    speed: number;
    engine: string;
    warnings: string[];
  };
};

export function generatePlan(input: {
  prompt: string;
  project: Project;
  media: MediaItem[];
  hasSubtitles: boolean;
  audioTracks: MediaItem[];
}): GeneratedPlan {
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error("Describe the edit you want FREMIQ to plan");

  const videos = input.media.filter((item) => item.kind === "video");
  const primary = videos[0] ?? null;
  if (!primary) {
    throw new Error("Add a video to this project before generating an editing plan");
  }

  const warnings: string[] = [];
  const count = detectCount(prompt);
  const duration = detectDuration(prompt) ?? 30;
  const aspect = detectAspect(prompt) ?? input.project.aspectRatio ?? "16:9";
  const wantsCaptions = /\bcaption|\bsubtitle|\blyric|\bkaraoke|\bwords?\b/i.test(prompt);
  const captionPreset = /\bkaraoke|\blyric|\bhighlight/i.test(prompt)
    ? "karaoke"
    : /\bcinematic|\bdocumentary/i.test(prompt)
      ? "documentary"
      : /\bgaming/i.test(prompt)
        ? "gaming"
        : "bold";
  const wantsSilenceRemoval = /\bsilence|\bdead air|\bpauses?|\btighten\b/i.test(prompt);
  const wantsTransitions = /\btransitions?\b|\bsmooth\b|\bdynamic\b/i.test(prompt);
  const wantsColor = /\bcinematic|\bcolor grad|\bmontage|\bfilm look/i.test(prompt);
  const wantsMusic = /\bmusic|\bbeat|\bsoundtrack|\blyric/i.test(prompt);
  const wantsMotion = /\bmotion graphics|\btypography|\banimated|\bintro|\boutro|\blower third|\btitle/i.test(prompt);
  const isClipRequest = count > 0 || /\bshorts?\b|\bclips?\b|\breels?\b|\bhighlights?\b/i.test(prompt);
  const speedMatch = prompt.match(/\b(?:speed|slow)\s*(?:x|at)?\s*(0\.\d+|1\.\d+|[2-4])\b/i);
  const speed = speedMatch ? Math.max(0.5, Math.min(2, Number(speedMatch[1]))) : 1;

  if (wantsCaptions && !input.hasSubtitles) {
    warnings.push(
      "No subtitle track exists for this project yet. Captions will be skipped unless you add or import one in Subtitle Studio.",
    );
  }
  if (wantsMusic && input.audioTracks.length === 0) {
    warnings.push(
      "No audio track is available for music. Add a licensed music file in the Media Library, then rerun the plan.",
    );
  }

  const operations: PlanOperation[] = [];

  if (isClipRequest) {
    operations.push({
      id: "op-clip",
      type: "clip",
      title: `Generate ${count || 3} short clip${(count || 3) === 1 ? "" : "s"}`,
      description: `Analyse scene changes and silence, then cut ${count || 3} candidate${(count || 3) === 1 ? "" : "s"} of about ${duration}s in ${aspect}.`,
      parameters: { count: count || 3, duration, aspectRatio: aspect },
      status: "approved",
    });
  } else {
    operations.push({
      id: "op-trim",
      type: "trim",
      title: "Build the edit from the full source",
      description: `Use ${primary.name} as the primary video and keep the original untouched.`,
      parameters: { mediaId: primary.id },
      status: "approved",
    });
  }

  if (wantsSilenceRemoval) {
    operations.push({
      id: "op-silence",
      type: "silence",
      title: "Remove silences",
      description: "Detect dead air with FFmpeg silencedetect and drop gaps longer than 0.7s.",
      parameters: { noiseDb: -35, minDuration: 0.7 },
      status: "approved",
    });
  }

  if (aspect !== input.project.aspectRatio || /\bconvert\b|\bvertical\b/i.test(prompt)) {
    operations.push({
      id: "op-aspect",
      type: "aspect",
      title: `Reframe to ${aspect}`,
      description: `Scale and crop every segment to ${resolutionFor(aspect)} without changing the original media.`,
      parameters: { aspectRatio: aspect, resolution: resolutionFor(aspect) },
      status: "approved",
    });
  }

  if (wantsCaptions) {
    operations.push({
      id: "op-captions",
      type: "captions",
      title: `Add ${captionPreset} captions`,
      description: "Burn the project's subtitle track with word-level highlighting when timings are available.",
      parameters: { preset: captionPreset },
      status: "approved",
    });
  }

  if (wantsTransitions) {
    operations.push({
      id: "op-transitions",
      type: "transitions",
      title: "Add fade transitions",
      description: "Apply short fade-in and fade-out transitions at every cut.",
      parameters: { style: "fade", duration: 0.35 },
      status: "approved",
    });
  }

  if (wantsColor) {
    operations.push({
      id: "op-color",
      type: "color",
      title: "Cinematic colour pass",
      description: "Lift contrast and saturation with a subtle FFmpeg colour grade.",
      parameters: { brightness: 0.98, contrast: 1.08, saturation: 1.12 },
      status: "approved",
    });
  }

  if (speed !== 1) {
    operations.push({
      id: "op-speed",
      type: "speed",
      title: `Change speed to ${speed}x`,
      description: "Adjust video and audio speed while keeping pitch where possible.",
      parameters: { speed },
      status: "approved",
    });
  }

  if (wantsMusic) {
    operations.push({
      id: "op-audio",
      type: "audio",
      title: "Add background music",
      description: input.audioTracks[0]
        ? `Mix ${input.audioTracks[0].name} under the source audio at 28% volume.`
        : "Requires an audio file in the project.",
      parameters: {
        mediaId: input.audioTracks[0]?.id ?? null,
        volume: 0.28,
      },
      status: input.audioTracks[0] ? "approved" : "skipped",
    });
  }

  if (wantsMotion) {
    operations.push({
      id: "op-motion",
      type: "motion",
      title: "Add an animated title",
      description: `Place a ${input.project.name} title card with motion typography over the opening seconds.`,
      parameters: { text: input.project.name, duration: 2.6 },
      status: "approved",
    });
  }

  const parts: string[] = [];
  if (isClipRequest) parts.push(`Cut ${count || 3} clip${(count || 3) === 1 ? "" : "s"} (~${duration}s)`);
  else parts.push("Edit the full source");
  parts.push(`${aspect} output`);
  if (wantsSilenceRemoval) parts.push("silence removed");
  if (wantsCaptions) parts.push(`${captionPreset} captions`);
  if (wantsTransitions) parts.push("fade transitions");
  if (wantsColor) parts.push("cinematic grade");
  if (wantsMusic) parts.push("music mix");
  if (wantsMotion) parts.push("animated title");

  return {
    summary: `${parts.join(" · ")}.`,
    operations,
    context: {
      sourceMediaId: primary.id,
      sourceMediaName: primary.name,
      aspectRatio: aspect,
      resolution: resolutionFor(aspect),
      fps: input.project.frameRate || 30,
      clipCount: isClipRequest ? count || 3 : 0,
      clipDuration: duration,
      wantsCaptions,
      captionPreset,
      wantsMusic: wantsMusic && input.audioTracks.length > 0,
      wantsMotion,
      wantsSilenceRemoval,
      wantsTransitions,
      wantsColor,
      speed,
      engine: "fremiq-planner-v1",
      warnings,
    },
  };
}

export function operationsForExecution(plan: { operations: unknown }) {
  return (plan.operations as PlanOperation[]).filter((op) => op.status !== "skipped");
}
