import type { TimelineData } from "@/lib/types";

export function defaultTimeline(settings: {
  aspectRatio: string;
  resolution: string;
  fps: number;
}): TimelineData {
  const [width, height] = settings.resolution.split("x").map(Number);
  return {
    tracks: [
      { id: "v1", name: "Video 1", kind: "video", locked: false, visible: true, muted: false },
      { id: "v2", name: "Video 2", kind: "video", locked: false, visible: true, muted: false },
      { id: "a1", name: "Audio 1", kind: "audio", locked: false, visible: true, muted: false },
      { id: "s1", name: "Subtitles", kind: "subtitle", locked: false, visible: true, muted: false },
      { id: "t1", name: "Titles", kind: "text", locked: false, visible: true, muted: false },
    ],
    clips: [],
    settings: {
      width: width || 1920,
      height: height || 1080,
      fps: settings.fps || 30,
      aspectRatio: settings.aspectRatio || "16:9",
      background: "#101116",
    },
  };
}
