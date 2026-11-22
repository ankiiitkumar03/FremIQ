import type { MediaItem } from "@/lib/db/schema";
import type { ClipSegment, SubtitleCue } from "@/lib/types";
import { resolveDataPath } from "@/lib/storage";
import { detectScenes, detectSilences } from "./probe";

type Range = { start: number; end: number };

function complement(ranges: Range[], total: number): Range[] {
  const sorted = ranges
    .map((range) => ({ start: Math.max(0, range.start), end: Math.min(total, range.end) }))
    .sort((a, b) => a.start - b.start);
  const output: Range[] = [];
  let cursor = 0;
  for (const range of sorted) {
    if (range.start > cursor + 0.05) output.push({ start: cursor, end: range.start });
    cursor = Math.max(cursor, range.end);
  }
  if (cursor < total - 0.05) output.push({ start: cursor, end: total });
  return output;
}

function overlap(ranges: Range[], start: number, end: number) {
  return ranges.reduce((sum, range) => {
    const overlapStart = Math.max(start, range.start);
    const overlapEnd = Math.min(end, range.end);
    return sum + Math.max(0, overlapEnd - overlapStart);
  }, 0);
}

function overlapRatio(a: ClipSegment, b: ClipSegment) {
  const intersection = Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
  const shortest = Math.min(a.end - a.start, b.end - b.start);
  return shortest > 0 ? intersection / shortest : 0;
}

function hookStrength(text: string) {
  const normalized = text.trim();
  if (!normalized) return 0;
  let score = 0;
  if (/\b(why|how|what|secret|truth|mistake|reason|never|always|best|worst|stop|avoid|important|listen|imagine|instead)\b/i.test(normalized)) {
    score += 12;
  }
  if (/\b\d+\b/.test(normalized)) score += 4;
  if (/[?!]/.test(normalized)) score += 4;
  if (normalized.length >= 24 && normalized.length <= 120) score += 2;
  return Math.min(20, score);
}

const ignoredFocusWords = new Set([
  "about", "after", "also", "and", "are", "for", "from", "how", "into", "that", "the", "their", "them", "then", "there", "this", "those", "through", "with", "what", "when", "where", "which", "who", "will", "would", "your",
]);

function focusTerms(value: string) {
  return [...new Set(value.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])]
    .filter((word) => !ignoredFocusWords.has(word))
    .slice(0, 12);
}

export type ClipAnalysis = {
  sourceDuration: number;
  sceneCount: number;
  silenceCount: number;
  speechSeconds: number;
  method: string;
  warnings: string[];
};

export async function generateClipCandidates(input: {
  media: MediaItem;
  count: number;
  duration: number;
  focus?: string;
  subtitles?: SubtitleCue[];
}): Promise<{ candidates: ClipSegment[]; analysis: ClipAnalysis }> {
  const absolutePath = resolveDataPath(input.media.relativePath);
  const sourceDuration = input.media.durationSec ?? 0;
  if (!sourceDuration || sourceDuration < 1) {
    throw new Error("The source video has no readable duration");
  }

  const warnings: string[] = [];
  let scenes: number[] = [];
  let silences: Range[] = [];

  try {
    [scenes, silences] = await Promise.all([
      detectScenes(absolutePath),
      detectSilences(absolutePath),
    ]);
  } catch {
    warnings.push("Scene analysis failed; FREMIQ fell back to evenly spaced highlights.");
  }

  const speech = complement(silences, sourceDuration);
  const speechSeconds = speech.reduce((sum, range) => sum + (range.end - range.start), 0);
  const targetDuration = Math.max(4, Math.min(input.duration, sourceDuration));
  const count = Math.max(1, Math.min(10, input.count || 3));
  const terms = focusTerms(input.focus ?? "");

  const scored: Array<ClipSegment & { sceneHits: number; speechRatio: number }> = [];
  let matchedFocus = false;
  const step = Math.max(1.5, targetDuration * 0.4);
  const candidateStarts = new Set<number>();
  for (let start = 0; start + targetDuration <= sourceDuration + 0.01; start += step) {
    candidateStarts.add(Math.round(start * 10) / 10);
  }
  const transcriptHooks = (input.subtitles ?? [])
    .filter((cue) => hookStrength(cue.text) >= 12)
    .slice(0, 160);
  for (const cue of transcriptHooks) {
    const start = Math.max(0, Math.min(sourceDuration - targetDuration, cue.start - 0.4));
    candidateStarts.add(Math.round(start * 10) / 10);
  }

  for (const start of candidateStarts) {
    let aligned = start;
    const hookAnchor = transcriptHooks.some(
      (cue) => cue.start >= start - 0.1 && cue.start <= start + 2.5,
    );
    const nearScene = scenes
      .filter((scene) => Math.abs(scene - start) <= (hookAnchor ? 1.25 : targetDuration * 0.25))
      .sort((a, b) => Math.abs(a - start) - Math.abs(b - start))[0];
    if (nearScene !== undefined) aligned = nearScene;
    aligned = Math.max(0, Math.min(sourceDuration - targetDuration, aligned));
    const end = aligned + targetDuration;
    const speechRatio = overlap(speech, aligned, end) / targetDuration;
    const silenceRatio = overlap(silences, aligned, end) / targetDuration;
    if (speechRatio < 0.12) continue;
    const sceneHits = scenes.filter((scene) => scene > aligned + 0.2 && scene < end - 0.2).length;
    const score = Math.round(
      speechRatio * 60 + Math.min(5, sceneHits) * 7 + (sceneHits > 0 ? 8 : 0) - silenceRatio * 25,
    );
    const openingCues = input.subtitles?.filter(
      (cue) => cue.end > aligned && cue.start < aligned + 5,
    ) ?? [];
    const hookCue = openingCues.find((cue) => hookStrength(cue.text) > 0) ?? openingCues[0];
    const hookScore = hookStrength(hookCue?.text ?? "");
    const spokenWords = new Set<string>(
      (input.subtitles ?? [])
        .filter((cue) => cue.end > aligned && cue.start < end)
        .map((cue) => cue.text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])
        .flat(),
    );
    const focusMatches = terms.filter((term) => spokenWords.has(term)).length;
    if (focusMatches > 0) matchedFocus = true;
    const focusScore = terms.length ? Math.round((focusMatches / terms.length) * 35) : 0;
    scored.push({
      start: Math.round(aligned * 10) / 10,
      end: Math.round(end * 10) / 10,
      score: Math.max(1, Math.min(100, score + hookScore + focusScore)),
      hook: hookCue?.text.slice(0, 90),
      title: hookCue?.text.slice(0, 40) || `Highlight ${scored.length + 1}`,
      sceneHits,
      speechRatio,
    });
  }

  const selected: ClipSegment[] = [];
  const rankedCandidates = scored
    .filter((candidate) => !terms.length || !matchedFocus || terms.some((term) => {
      const candidateCues = (input.subtitles ?? []).filter(
        (cue) => cue.end > candidate.start && cue.start < candidate.end,
      );
      return candidateCues.some((cue) => {
        const words: string[] = cue.text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [];
        return words.includes(term);
      });
    }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  for (const candidate of rankedCandidates) {
    if (selected.some((existing) => overlapRatio(existing, candidate) > 0.35)) continue;
    selected.push(candidate);
    if (selected.length >= count) break;
  }

  if (selected.length < count) {
    const evenStep = sourceDuration / count;
    for (let index = 0; index < count && selected.length < count; index += 1) {
      const start = Math.min(
        sourceDuration - targetDuration,
        Math.max(0, evenStep * index),
      );
      const candidate: ClipSegment = {
        start: Math.round(start * 10) / 10,
        end: Math.round((start + targetDuration) * 10) / 10,
        score: 40,
        title: `Highlight ${selected.length + 1}`,
      };
      if (!selected.some((existing) => overlapRatio(existing, candidate) > 0.5)) {
        selected.push(candidate);
      }
    }
  }

  if (selected.length === 0) {
    selected.push({
      start: 0,
      end: Math.min(targetDuration, sourceDuration),
      score: 35,
      title: "Full source",
    });
  }

  if (sourceDuration < input.duration) {
    warnings.push(
      `The source is shorter than the requested ${input.duration}s. Clips use the full ${sourceDuration.toFixed(1)}s.`,
    );
  }
  if (!input.subtitles || input.subtitles.length === 0) {
    warnings.push("No subtitle track was available, so clips have no caption hooks or burned captions.");
    if (terms.length) warnings.push("Speech focus was not applied. Transcribe the source with Whisper, then analyse again.");
  } else if (terms.length && !matchedFocus) {
    warnings.push("No speech matched the requested focus words. Review the transcript or try broader wording.");
  }

  return {
    candidates: selected.sort((a, b) => a.start - b.start),
    analysis: {
      sourceDuration,
      sceneCount: scenes.length,
      silenceCount: silences.length,
      speechSeconds: Math.round(speechSeconds),
      method: input.subtitles?.length
        ? "FFmpeg scene and silence analysis + transcript hook scoring"
        : "FFmpeg scene detection + silence analysis",
      warnings,
    },
  };
}
