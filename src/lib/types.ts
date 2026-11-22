export type ProjectStatus = "active" | "draft" | "archived";

export type MediaKind = "video" | "audio" | "image" | "archive" | "other";

export type TrackKind = "video" | "audio" | "subtitle" | "text" | "overlay";

export type TimelineTrack = {
  id: string;
  name: string;
  kind: TrackKind;
  locked: boolean;
  visible: boolean;
  muted: boolean;
};

export type ClipTransform = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
};

export type ClipText = {
  content: string;
  fontSize: number;
  color: string;
  position: "top" | "center" | "bottom";
};

export type TimelineClip = {
  id: string;
  trackId: string;
  mediaId?: string;
  name: string;
  kind: "video" | "audio" | "image" | "text";
  start: number;
  duration: number;
  inPoint: number;
  speed: number;
  volume: number;
  fit: "cover" | "contain";
  color?: string;
  text?: ClipText;
  transform?: ClipTransform;
  effects?: {
    brightness?: number;
    contrast?: number;
    saturation?: number;
    blur?: number;
    fadeIn?: number;
    fadeOut?: number;
  };
};

export type TimelineSettings = {
  width: number;
  height: number;
  fps: number;
  aspectRatio: string;
  background: string;
};

export type TimelineData = {
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  settings: TimelineSettings;
};

export type SubtitleWord = {
  text: string;
  start: number;
  end: number;
};

export type SubtitleCue = {
  id: string;
  start: number;
  end: number;
  text: string;
  words?: SubtitleWord[];
};

export type SubtitleStyle = {
  preset: string;
  fontFamily: string;
  fontSize: number;
  primaryColor: string;
  outlineColor: string;
  outlineWidth: number;
  shadow: number;
  background: boolean;
  backgroundOpacity: number;
  position: "top" | "center" | "bottom";
  bold: boolean;
  italic: boolean;
  uppercase: boolean;
  highlightColor: string;
  karaoke: boolean;
};

export type PlanOperation = {
  id: string;
  type:
    | "trim"
    | "clip"
    | "captions"
    | "aspect"
    | "silence"
    | "transitions"
    | "color"
    | "motion"
    | "audio"
    | "speed"
    | "text";
  title: string;
  description: string;
  parameters: Record<string, unknown>;
  status: "pending" | "approved" | "skipped";
};

export type ClipSegment = {
  start: number;
  end: number;
  title?: string;
  hook?: string;
  score?: number;
};

export type RenderSpec =
  | {
      type: "timeline";
      timeline: TimelineData;
      subtitles?: { cues: SubtitleCue[]; style: SubtitleStyle } | null;
      music?: { mediaId: string; volume: number } | null;
      duration: number;
    }
  | {
      type: "clips";
      sourceMediaId: string;
      segments: ClipSegment[];
      aspectRatio: string;
      resolution: string;
      fps: number;
      subtitles?: { cues: SubtitleCue[]; style: SubtitleStyle } | null;
      titleCard?: string | null;
    }
  | {
      type: "audio";
      sourceMediaId: string;
      operations: {
        trimStart?: number;
        trimEnd?: number;
        normalize?: boolean;
        fadeIn?: number;
        fadeOut?: number;
        volume?: number;
        format: "mp3" | "wav" | "m4a";
      };
    }
  | {
      type: "convert";
      sourceMediaId: string;
      aspectRatio: string;
      resolution: string;
      fps: number;
      start?: number;
      end?: number;
    }
  | {
      type: "motion";
      composition: MotionComposition;
      backgroundMediaId?: string | null;
      resolution: string;
      fps: number;
      duration: number;
    };

export type MotionComposition = {
  preset: string;
  title: string;
  subtitle: string;
  accent: string;
  background: string;
  width: number;
  height: number;
  duration: number;
  animation: "fade" | "slide" | "scale" | "typewriter";
};

export type ToolInfo = {
  key: string;
  name: string;
  category: "core" | "media" | "ai-agent" | "ai";
  description: string;
  required: boolean;
  installed: boolean;
  version: string | null;
  path: string | null;
  health: "ok" | "missing" | "error";
  installHint: string;
};

export type ActivityItem = {
  id: string;
  projectId: string | null;
  type: string;
  message: string;
  meta: Record<string, unknown> | null;
  createdAt: Date;
};

export type AgentProbe = {
  key: string;
  name: string;
  installed: boolean;
  version: string | null;
  path: string | null;
  status: "connected" | "detected" | "not_installed" | "error";
  capabilities: string[];
  notes: string;
  lastCheckedAt: string;
};

export type SystemStatus = {
  engine: {
    mode: "hosted" | "local-agent";
    label: string;
    ffmpeg: boolean;
    ffprobe: boolean;
    cpu: number;
    memoryUsedBytes: number;
    memoryTotalBytes: number;
    diskFreeBytes: number | null;
    diskTotalBytes: number | null;
    platform: string;
    hostname: string;
    gpu: string | null;
    uptimeSec: number;
    checkedAt: string;
  };
  agent: {
    connected: boolean;
    url: string | null;
    version: string | null;
    lastCheckedAt: string;
  };
  queue: {
    queued: number;
    running: number;
    completed: number;
    failed: number;
  };
};
