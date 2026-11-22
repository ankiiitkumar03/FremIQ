import type {
  ClipText,
  MotionComposition,
  SubtitleCue,
  SubtitleStyle,
  SubtitleWord,
  TimelineData,
} from "@/lib/types";

export const subtitlePresets: Record<string, SubtitleStyle> = {
  minimal: {
    preset: "minimal",
    fontFamily: "Inter",
    fontSize: 42,
    primaryColor: "#F5F5F7",
    outlineColor: "#101116",
    outlineWidth: 0,
    shadow: 0,
    background: false,
    backgroundOpacity: 0.6,
    position: "bottom",
    bold: false,
    italic: false,
    uppercase: false,
    highlightColor: "#A78BFA",
    karaoke: false,
  },
  bold: {
    preset: "bold",
    fontFamily: "Inter",
    fontSize: 58,
    primaryColor: "#FFFFFF",
    outlineColor: "#101116",
    outlineWidth: 5,
    shadow: 1,
    background: false,
    backgroundOpacity: 0.5,
    position: "center",
    bold: true,
    italic: false,
    uppercase: true,
    highlightColor: "#A78BFA",
    karaoke: false,
  },
  karaoke: {
    preset: "karaoke",
    fontFamily: "Inter",
    fontSize: 56,
    primaryColor: "#FFFFFF",
    outlineColor: "#101116",
    outlineWidth: 4,
    shadow: 0,
    background: false,
    backgroundOpacity: 0.4,
    position: "center",
    bold: true,
    italic: false,
    uppercase: true,
    highlightColor: "#A78BFA",
    karaoke: true,
  },
  kinetic: {
    preset: "kinetic",
    fontFamily: "Inter",
    fontSize: 60,
    primaryColor: "#FFFFFF",
    outlineColor: "#101116",
    outlineWidth: 3,
    shadow: 0,
    background: false,
    backgroundOpacity: 0.4,
    position: "center",
    bold: true,
    italic: false,
    uppercase: true,
    highlightColor: "#C4B5FD",
    karaoke: false,
  },
  documentary: {
    preset: "documentary",
    fontFamily: "Inter",
    fontSize: 38,
    primaryColor: "#F5F5F7",
    outlineColor: "#101116",
    outlineWidth: 2,
    shadow: 1,
    background: true,
    backgroundOpacity: 0.55,
    position: "bottom",
    bold: false,
    italic: false,
    uppercase: false,
    highlightColor: "#F5F5F7",
    karaoke: false,
  },
  podcast: {
    preset: "podcast",
    fontFamily: "Inter",
    fontSize: 44,
    primaryColor: "#FFFFFF",
    outlineColor: "#101116",
    outlineWidth: 0,
    shadow: 0,
    background: true,
    backgroundOpacity: 0.72,
    position: "bottom",
    bold: true,
    italic: false,
    uppercase: false,
    highlightColor: "#A78BFA",
    karaoke: true,
  },
  gaming: {
    preset: "gaming",
    fontFamily: "Inter",
    fontSize: 54,
    primaryColor: "#FFFFFF",
    outlineColor: "#7C3AED",
    outlineWidth: 6,
    shadow: 2,
    background: false,
    backgroundOpacity: 0.4,
    position: "center",
    bold: true,
    italic: true,
    uppercase: true,
    highlightColor: "#FBBF24",
    karaoke: false,
  },
  cinematic: {
    preset: "cinematic",
    fontFamily: "Georgia",
    fontSize: 40,
    primaryColor: "#F5F5F7",
    outlineColor: "#101116",
    outlineWidth: 0,
    shadow: 2,
    background: false,
    backgroundOpacity: 0.3,
    position: "bottom",
    bold: false,
    italic: true,
    uppercase: false,
    highlightColor: "#F5F5F7",
    karaoke: false,
  },
};

export const defaultSubtitleStyle = subtitlePresets.bold;

function hexToAss(hex: string): string {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean.padEnd(6, "0").slice(0, 6);
  const r = full.slice(0, 2);
  const g = full.slice(2, 4);
  const b = full.slice(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase();
}

function hexToAssAlpha(hex: string, opacity: number): string {
  const clean = hex.replace("#", "").padEnd(6, "0").slice(0, 6);
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  const alpha = Math.round((1 - Math.min(1, Math.max(0, opacity))) * 255)
    .toString(16)
    .padStart(2, "0");
  return `&H${alpha.toUpperCase()}${b}${g}${r}`.toUpperCase();
}

function assTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const cs = Math.round((safe - Math.floor(safe)) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(
    Math.min(99, cs),
  ).padStart(2, "0")}`;
}

export function escapeAssText(text: string) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}")
    .replace(/\r?\n/g, "\\N")
    .trim();
}

function wrapText(text: string, maxChars: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (`${current} ${word}`.length <= maxChars) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.join("\\N");
}

function wordsFromCue(cue: SubtitleCue): SubtitleWord[] {
  if (cue.words && cue.words.length > 0) return cue.words;
  const tokens = cue.text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const per = (cue.end - cue.start) / tokens.length;
  return tokens.map((text, index) => ({
    text,
    start: cue.start + per * index,
    end: cue.start + per * (index + 1),
  }));
}

function karaokeLine(cue: SubtitleCue) {
  const words = wordsFromCue(cue);
  if (words.length === 0) return escapeAssText(cue.text);
  return words
    .map((word) => {
      const cs = Math.max(1, Math.round((word.end - word.start) * 100));
      return `{\\kf${cs}}${escapeAssText(word.text)}`;
    })
    .join(" ");
}

export function buildAssFile(options: {
  width: number;
  height: number;
  cues: SubtitleCue[];
  style: SubtitleStyle;
}): string {
  const { width, height, cues, style } = options;
  const alignment = style.position === "top" ? 8 : style.position === "center" ? 5 : 2;
  const marginV =
    style.position === "top"
      ? Math.round(height * 0.08)
      : style.position === "center"
        ? 0
        : Math.round(height * 0.07);
  const fontSize = Math.max(12, Math.round((style.fontSize / 1080) * height));
  const maxChars = Math.max(14, Math.floor((width / fontSize) * (width > height ? 1.25 : 0.75)));
  const borderStyle = style.background ? 3 : 1;
  const outline = style.background ? 0 : style.outlineWidth;
  const backColour = style.background
    ? hexToAssAlpha(style.outlineColor, style.backgroundOpacity)
    : "&H80000000";

  const lines = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Fremiq,${style.fontFamily},${fontSize},${hexToAss(style.primaryColor)},${hexToAss(style.highlightColor)},${hexToAss(style.outlineColor)},${backColour},${style.bold ? -1 : 0},${style.italic ? -1 : 0},0,0,100,100,0,0,${borderStyle},${outline},${style.shadow},${alignment},40,40,${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  for (const cue of cues) {
    const raw = style.uppercase ? cue.text.toUpperCase() : cue.text;
    const wrapped = wrapText(escapeAssText(raw), maxChars);
    const text = style.karaoke ? karaokeLine({ ...cue, text: raw }) : wrapped;
    const intro =
      style.preset === "kinetic"
        ? "{\\fad(90,90)\\fscx108\\fscy108\\t(0,160,\\fscx100\\fscy100)}"
        : "{\\fad(60,60)}";
    lines.push(
      `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Fremiq,,0,0,0,,${intro}${text}`,
    );
  }

  return `${lines.join("\n")}\n`;
}

export function buildMotionAss(comp: MotionComposition): string {
  const { width, height } = comp;
  const titleSize = Math.round(height * (comp.preset === "lower-third" ? 0.07 : 0.09));
  const subSize = Math.round(height * 0.035);
  const alignment = comp.preset === "lower-third" ? 1 : 5;
  const marginV = comp.preset === "lower-third" ? Math.round(height * 0.16) : 0;
  const marginL = comp.preset === "lower-third" ? Math.round(width * 0.08) : 40;

  const titleAnim =
    comp.animation === "slide"
      ? `{\\move(${comp.preset === "lower-third" ? -width * 0.5 : width / 2},${comp.preset === "lower-third" ? height * 0.84 : height * 0.62},${comp.preset === "lower-third" ? width * 0.08 : width / 2},${comp.preset === "lower-third" ? height * 0.84 : height * 0.5},0,700)\\fad(200,0)}`
      : comp.animation === "scale"
        ? "{\\fscx55\\fscy55\\t(0,650,\\fscx100\\fscy100)\\fad(200,0)}"
        : "{\\fad(450,350)}";

  const subAnim =
    comp.animation === "slide"
      ? `{\\move(${width / 2},${height * 0.72},${width / 2},${height * 0.6},150,750)\\fad(300,0)}`
      : "{\\fad(700,350)}";

  const lines = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Title,Inter,${titleSize},${hexToAss("#F5F5F7")},${hexToAss(comp.accent)},${hexToAss(comp.background)},&H80000000,-1,0,0,0,100,100,2,0,1,0,1,${alignment},${marginL},${marginL},${marginV},1`,
    `Style: Sub,Inter,${subSize},${hexToAss(comp.accent)},${hexToAss(comp.accent)},${hexToAss(comp.background)},&H80000000,0,0,0,0,100,100,3,0,1,0,0,${alignment === 1 ? 1 : 2},${marginL},${marginL},${alignment === 1 ? marginV + titleSize + 20 : 40},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    `Dialogue: 0,0:00:00.00,${assTime(comp.duration)},Title,,0,0,0,,${titleAnim}${escapeAssText(comp.title)}`,
  ];

  if (comp.subtitle) {
    lines.push(
      `Dialogue: 0,0:00:00.20,${assTime(comp.duration)},Sub,,0,0,0,,${subAnim}${escapeAssText(comp.subtitle)}`,
    );
  }

  if (comp.preset === "lower-third") {
    const barY = Math.round(height * 0.83);
    lines.push(
      `Dialogue: 1,0:00:00.00,${assTime(comp.duration)},Title,,0,0,0,,{\\p1\\c${hexToAss(comp.accent).replace("&H00", "&H")}\\pos(${marginL},${barY})\\fad(200,300)}m 0 0 l ${Math.round(width * 0.18)} 0 l ${Math.round(width * 0.18)} 6 l 0 6{\\p0}`,
    );
  }

  return `${lines.join("\n")}\n`;
}

export function cuesFromTimelineText(timeline: TimelineData): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  for (const clip of timeline.clips) {
    if (clip.kind !== "text" || !clip.text?.content) continue;
    cues.push({
      id: clip.id,
      start: clip.start,
      end: clip.start + clip.duration,
      text: clip.text.content,
    });
  }
  return cues;
}

export function textStyleFromClip(text: ClipText): SubtitleStyle {
  return {
    ...defaultSubtitleStyle,
    preset: "custom",
    fontSize: text.fontSize,
    primaryColor: text.color,
    position: text.position,
    bold: true,
    uppercase: false,
  };
}

function parseTimestamp(value: string): number {
  const clean = value.trim().replace(",", ".");
  const parts = clean.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(clean) || 0;
}

export function parseSrt(input: string): SubtitleCue[] {
  const blocks = input.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const cues: SubtitleCue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((line) => line.trim().length > 0);
    if (lines.length < 2) continue;
    const timeLineIndex = lines.findIndex((line) => line.includes("-->"));
    if (timeLineIndex === -1) continue;
    const [startRaw, endRaw] = lines[timeLineIndex].split("-->");
    const text = lines.slice(timeLineIndex + 1).join("\n");
    if (!text.trim()) continue;
    cues.push({
      id: `cue-${cues.length + 1}-${Math.random().toString(36).slice(2, 7)}`,
      start: parseTimestamp(startRaw),
      end: parseTimestamp((endRaw ?? "").trim().split(" ")[0]),
      text,
    });
  }
  return cues;
}

export function parseVtt(input: string): SubtitleCue[] {
  const cleaned = input
    .replace(/\r\n/g, "\n")
    .replace(/^WEBVTT[^\n]*\n/, "")
    .replace(/NOTE[\s\S]*?(?=\n\n|$)/g, "");
  return parseSrt(cleaned);
}

export function parseAss(input: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  for (const line of input.split(/\r?\n/)) {
    if (!line.startsWith("Dialogue:")) continue;
    const parts = line.slice(9).split(",");
    if (parts.length < 10) continue;
    const start = parseTimestamp(parts[1]);
    const end = parseTimestamp(parts[2]);
    const text = parts.slice(9).join(",").replace(/\{[^}]*\}/g, "").replace(/\\N/g, "\n");
    if (!text.trim()) continue;
    cues.push({
      id: `cue-${cues.length + 1}-${Math.random().toString(36).slice(2, 7)}`,
      start,
      end,
      text,
    });
  }
  return cues;
}

export function parseSubtitles(input: string, format: "srt" | "vtt" | "ass") {
  if (format === "vtt") return parseVtt(input);
  if (format === "ass") return parseAss(input);
  return parseSrt(input);
}

function pad(value: number, size = 2) {
  return String(value).padStart(size, "0");
}

export function serializeSrt(cues: SubtitleCue[]): string {
  return `${cues
    .slice()
    .sort((a, b) => a.start - b.start)
    .map((cue, index) => {
      const format = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.round((seconds - Math.floor(seconds)) * 1000);
        return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
      };
      return `${index + 1}\n${format(cue.start)} --> ${format(cue.end)}\n${cue.text}`;
    })
    .join("\n\n")}\n`;
}

export function serializeVtt(cues: SubtitleCue[]): string {
  const body = cues
    .slice()
    .sort((a, b) => a.start - b.start)
    .map((cue) => {
      const format = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.round((seconds - Math.floor(seconds)) * 1000);
        return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
      };
      return `${format(cue.start)} --> ${format(cue.end)}\n${cue.text}`;
    })
    .join("\n\n");
  return `WEBVTT\n\n${body}\n`;
}

export function serializeAss(cues: SubtitleCue[], style: SubtitleStyle, width = 1920, height = 1080) {
  return buildAssFile({ width, height, cues, style });
}

export function splitTranscriptToCues(
  transcript: string,
  totalDuration: number,
  options: { maxChars?: number; gap?: number } = {},
): SubtitleCue[] {
  const maxChars = options.maxChars ?? 84;
  const gap = options.gap ?? 0.08;
  const sentences = transcript
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  const chunks: string[] = [];
  for (const sentence of sentences) {
    if (sentence.length <= maxChars) {
      chunks.push(sentence);
      continue;
    }
    const words = sentence.split(" ");
    let current = "";
    for (const word of words) {
      if (!current) current = word;
      else if (`${current} ${word}`.length <= maxChars) current += ` ${word}`;
      else {
        chunks.push(current);
        current = word;
      }
    }
    if (current) chunks.push(current);
  }
  const totalChars = chunks.reduce((sum, chunk) => sum + chunk.length, 0) || 1;
  let cursor = 0;
  return chunks.map((chunk, index) => {
    const duration = Math.max(1.2, (chunk.length / totalChars) * Math.max(1, totalDuration));
    const start = cursor;
    const end = Math.min(totalDuration, start + duration - gap);
    cursor = end + gap;
    const words = chunk.split(" ");
    const per = (end - start) / Math.max(1, words.length);
    return {
      id: `cue-${index + 1}`,
      start: Math.round(start * 1000) / 1000,
      end: Math.round(end * 1000) / 1000,
      text: chunk,
      words: words.map((text, wordIndex) => ({
        text,
        start: Math.round((start + per * wordIndex) * 1000) / 1000,
        end: Math.round((start + per * (wordIndex + 1)) * 1000) / 1000,
      })),
    };
  });
}
