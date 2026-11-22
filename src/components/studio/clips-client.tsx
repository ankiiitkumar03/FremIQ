"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  AudioLines,
  Loader2,
  Scissors,
  Sparkles,
  TriangleAlert,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, EmptyState } from "@/components/ui-kit";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { postJson } from "@/lib/client-api";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ClipSegment } from "@/lib/types";

export type ClipMedia = {
  id: string;
  name: string;
  kind: string;
  durationSec: number | null;
  thumbnailPath: string | null;
};

export type SubtitleOption = { id: string; name: string; cues: number; mediaId: string | null };
export type ClipBackendOption = {
  key: "ffmpeg" | "hyperframes" | "remotion";
  label: string;
  available: boolean;
  reason: string | null;
};

type Analysis = {
  sourceDuration: number;
  sceneCount: number;
  silenceCount: number;
  speechSeconds: number;
  method: string;
  warnings: string[];
};

const aspectOptions = [
  { value: "9:16", label: "Vertical 9:16", resolution: "1080x1920" },
  { value: "1:1", label: "Square 1:1", resolution: "1080x1080" },
  { value: "4:5", label: "Portrait 4:5", resolution: "1080x1350" },
  { value: "16:9", label: "Landscape 16:9", resolution: "1920x1080" },
];

export function ClipsClient({
  projectId,
  projectName,
  videos,
  subtitles,
  defaultAspect,
  defaultFps,
  defaultBackend,
  backends,
  initialMediaId,
}: {
  projectId: string | null;
  projectName: string | null;
  videos: ClipMedia[];
  subtitles: SubtitleOption[];
  defaultAspect: string;
  defaultFps: number;
  defaultBackend: string;
  backends: ClipBackendOption[];
  initialMediaId?: string | null;
}) {
  const router = useRouter();
  const [mediaId, setMediaId] = React.useState(
    videos.some((video) => video.id === initialMediaId) ? initialMediaId! : videos[0]?.id ?? "",
  );
  const [count, setCount] = React.useState(3);
  const [duration, setDuration] = React.useState(30);
  const [focus, setFocus] = React.useState("");
  const [trimStart, setTrimStart] = React.useState("00:00:00");
  const [trimEnd, setTrimEnd] = React.useState("00:00:30");
  const [aspect, setAspect] = React.useState(defaultAspect);
  const [backend, setBackend] = React.useState(
    backends.some((item) => item.key === defaultBackend) ? defaultBackend : "ffmpeg",
  );
  const [subtitleTrackId, setSubtitleTrackId] = React.useState(subtitles[0]?.id ?? "none");
  const [analyzing, setAnalyzing] = React.useState(false);
  const [transcribing, setTranscribing] = React.useState(false);
  const [rendering, setRendering] = React.useState(false);
  const [candidates, setCandidates] = React.useState<ClipSegment[]>([]);
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [analysis, setAnalysis] = React.useState<Analysis | null>(null);
  const [previewIndex, setPreviewIndex] = React.useState(0);
  const autoAnalysisFor = React.useRef<string | null>(null);
  const clipPreviewRef = React.useRef<HTMLVideoElement>(null);

  const source = videos.find((video) => video.id === mediaId) ?? null;
  const sourceSubtitles = React.useMemo(
    () => subtitles.filter((track) => track.mediaId === mediaId),
    [subtitles, mediaId],
  );
  const previewCandidate = candidates[previewIndex] ?? candidates[0] ?? null;
  const resolution = aspectOptions.find((option) => option.value === aspect)?.resolution ?? "1080x1920";
  const selectedBackend = backends.find((item) => item.key === backend) ?? backends.find((item) => item.key === "ffmpeg");

  React.useEffect(() => {
    if (initialMediaId && videos.some((video) => video.id === initialMediaId)) {
      setMediaId(initialMediaId);
    }
  }, [initialMediaId, videos]);

  const analyze = React.useCallback(async () => {
    if (!projectId || !mediaId) return;
    setAnalyzing(true);
    try {
      const data = await postJson<{ candidates: ClipSegment[]; analysis: Analysis }>(
        "/api/clips/analyze",
        { projectId, mediaId, count, duration, focus },
      );
      setCandidates(data.candidates);
      setAnalysis(data.analysis);
      setSelected(new Set(data.candidates.map((_, index) => index)));
      setPreviewIndex(0);
      toast.success(`Found ${data.candidates.length} clip candidates`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }, [projectId, mediaId, count, duration, focus]);

  async function transcribeAndAnalyze() {
    if (!projectId || !mediaId) return;
    setTranscribing(true);
    try {
      await postJson("/api/subtitles/transcribe", { projectId, mediaId });
      toast.success("Transcript ready. Finding clips with speech hooks…");
      await analyze();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Whisper transcription failed");
    } finally {
      setTranscribing(false);
    }
  }

  React.useEffect(() => {
    if (sourceSubtitles.length === 0) {
      setSubtitleTrackId("none");
    } else if (!sourceSubtitles.some((track) => track.id === subtitleTrackId)) {
      setSubtitleTrackId(sourceSubtitles[0].id);
    }
  }, [mediaId, sourceSubtitles, subtitleTrackId]);

  React.useEffect(() => {
    if (!initialMediaId || !videos.some((video) => video.id === initialMediaId)) return;
    if (mediaId !== initialMediaId) {
      setMediaId(initialMediaId);
      setCandidates([]);
      setSelected(new Set());
      setAnalysis(null);
      setPreviewIndex(0);
      return;
    }
    if (autoAnalysisFor.current === initialMediaId) return;
    autoAnalysisFor.current = initialMediaId;
    void analyze();
  }, [initialMediaId, mediaId, videos, analyze]);

  React.useEffect(() => {
    const player = clipPreviewRef.current;
    if (!player || !previewCandidate) return;
    let cancelled = false;
    const seekToClip = () => {
      if (cancelled) return;
      const lastPlayableTime = Number.isFinite(player.duration) ? Math.max(0, player.duration - 0.05) : previewCandidate.start;
      player.currentTime = Math.min(previewCandidate.start, lastPlayableTime);
      player.pause();
    };
    if (player.readyState >= 1) seekToClip();
    else player.addEventListener("loadedmetadata", seekToClip, { once: true });
    return () => {
      cancelled = true;
      player.removeEventListener("loadedmetadata", seekToClip);
    };
  }, [previewCandidate?.start, source?.id]);

  async function render() {
    if (!projectId || !mediaId) return;
    const chosen = candidates.filter((_, index) => selected.has(index));
    if (chosen.length === 0) {
      toast.error("Select at least one clip to render");
      return;
    }
    setRendering(true);
    try {
      const data = await postJson<{ jobs: Array<{ id: string }> }>("/api/clips/render", {
        projectId,
        mediaId,
        candidates: chosen,
        aspectRatio: aspect,
        resolution,
        fps: defaultFps,
        backend: selectedBackend?.key ?? "ffmpeg",
        subtitleTrackId: subtitleTrackId === "none" ? undefined : subtitleTrackId,
      });
      toast.success(`Queued ${data.jobs.length} clip render${data.jobs.length === 1 ? "" : "s"}`);
      router.push("/render-queue");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not queue clips");
    } finally {
      setRendering(false);
    }
  }

  function addTimestampClip() {
    const start = parseTimestamp(trimStart);
    const end = parseTimestamp(trimEnd);
    if (start === null || end === null) {
      toast.error("Use seconds or a timestamp like 00:01:23");
      return;
    }
    if (start < 0 || end <= start) {
      toast.error("End time must be after start time");
      return;
    }
    if (source?.durationSec && end > source.durationSec + 0.05) {
      toast.error(`End time is past the video length (${formatDuration(source.durationSec)})`);
      return;
    }
    const next = [...candidates, { start, end, title: "Manual timestamp trim" }];
    setCandidates(next);
    setSelected((current) => new Set([...current, next.length - 1]));
    setPreviewIndex(next.length - 1);
    toast.success("Timestamp range added to the render list");
  }

  if (!projectId) {
    return (
      <EmptyState
        variant="projects"
        title="Choose a project"
        description="The clip generator analyses video inside a project and saves renders to its queue."
      />
    );
  }

  if (videos.length === 0) {
    return (
      <EmptyState
        variant="media"
        title="No video in this project"
        description="Choose a video from your device or import a direct video-file URL in the Media Library. YouTube watch/live links need an authorized source file upload."
        action={
          <Button asChild size="sm">
            <Link href="/media">Open Media Library</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <Card className="h-fit border-border/80 bg-card/60 hairline">
        <CardContent className="space-y-3 p-4">
          <h3 className="text-sm font-medium">Source &amp; settings</h3>
          <Field label="Source video">
            <Select
              value={mediaId}
              onValueChange={(value) => {
                setMediaId(value);
                setCandidates([]);
                setSelected(new Set());
                setAnalysis(null);
                setPreviewIndex(0);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {videos.map((video) => (
                  <SelectItem key={video.id} value={video.id}>
                    {video.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {source ? (
            <div className="overflow-hidden rounded-lg border border-border/70 bg-black/30">
              <video src={`/api/media/${source.id}/file?inline=1`} controls aria-label={`Preview ${source.name}`} className="max-h-44 w-full" />
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <Field label="Clips">
              <Input
                type="number"
                min={1}
                max={10}
                value={count}
                onChange={(event) => setCount(Math.max(1, Math.min(10, Number(event.target.value))))}
                className="h-9"
              />
            </Field>
            <Field label="Length (s)">
              <Input
                type="number"
                min={5}
                max={180}
                value={duration}
                onChange={(event) => setDuration(Math.max(5, Math.min(180, Number(event.target.value))))}
                className="h-9"
              />
            </Field>
          </div>

          <Field
            label="What should FREMIQ find in the speech?"
            hint="Optional. Examples: funny reactions, the explanation of pricing, the part about setup mistakes."
          >
            <Input
              value={focus}
              onChange={(event) => setFocus(event.target.value.slice(0, 200))}
              placeholder="e.g. best gameplay reactions"
              maxLength={200}
              className="h-9"
            />
          </Field>

          <div className="space-y-2 rounded-lg border border-border/70 bg-surface/40 p-2.5">
            <Field label="Manual trim · start (seconds or HH:MM:SS)">
              <Input value={trimStart} onChange={(event) => setTrimStart(event.target.value)} placeholder="00:01:20" className="h-9" />
            </Field>
            <Field label="End time">
              <Input value={trimEnd} onChange={(event) => setTrimEnd(event.target.value)} placeholder="00:01:50" className="h-9" />
            </Field>
            <Button className="w-full" variant="outline" onClick={addTimestampClip} disabled={!source}>
              <Scissors className="mr-1.5 h-3.5 w-3.5" /> Add exact trim
            </Button>
            <p className="text-[10px] leading-relaxed text-muted-foreground">Add one exact range, then render it with your selected aspect ratio and captions.</p>
          </div>

          <Field label="Output format">
            <Select value={aspect} onValueChange={setAspect}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {aspectOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Render engine" hint="FFmpeg is the default. HyperFrames and Remotion are optional advanced engines.">
            <Select value={backend} onValueChange={setBackend}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {backends.map((item) => (
                  <SelectItem key={item.key} value={item.key} disabled={!item.available}>
                    {item.label}{item.available ? "" : " · install in Tool Manager"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <p className="text-[10px] text-muted-foreground">
            Install HyperFrames or Remotion in the <Link href="/tools" className="text-brand hover:underline">Tool Manager</Link>. Remotion custom projects can be configured there too.
          </p>
          {selectedBackend && !selectedBackend.available ? (
            <p className="text-[10px] leading-relaxed text-amber-200">
              {selectedBackend.reason ?? `${selectedBackend.label} is not ready.`} {" "}
              <Link href="/tools" className="underline underline-offset-2">Open Tool Manager</Link>
            </p>
          ) : null}

          <Field label="Burn captions" hint="Only captions for this source video are shown.">
            <Select value={subtitleTrackId} onValueChange={setSubtitleTrackId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No captions</SelectItem>
                {sourceSubtitles.map((track) => (
                  <SelectItem key={track.id} value={track.id}>
                    {track.name} · {track.cues} cues
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="space-y-2">
            <Button className="w-full" onClick={analyze} disabled={analyzing || transcribing || !mediaId}>
              {analyzing ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              )}
              Analyse highlights
            </Button>
            {source && sourceSubtitles.length === 0 ? (
              <div className="space-y-1.5 rounded-lg border border-border/70 bg-surface/40 p-2.5">
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  Transcription sends this clip’s audio to your configured web provider. You can also use a paired Local Agent for local Faster-Whisper.
                </p>
                <Button className="w-full" variant="outline" onClick={transcribeAndAnalyze} disabled={analyzing || transcribing}>
                  {transcribing ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <AudioLines className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {transcribing ? "Transcribing video…" : "Transcribe with Whisper + analyse"}
                </Button>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {previewCandidate && source ? (
          <Card className="overflow-hidden border-border/80 bg-card/60 hairline">
            <CardContent className="space-y-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-medium">Clip {previewIndex + 1} preview</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {formatDuration(previewCandidate.start)} – {formatDuration(previewCandidate.end)}
                  </div>
                </div>
                <Badge variant="outline" className="shrink-0 border-brand/40 bg-brand/10 text-[9px] text-brand-soft">
                  {selected.has(previewIndex) ? "Selected for export" : "Preview only"}
                </Badge>
              </div>
              <video
                ref={clipPreviewRef}
                src={`/api/media/${source.id}/file?inline=1`}
                aria-label={`Preview clip from ${source.name}`}
                controls
                playsInline
                preload="metadata"
                onTimeUpdate={(event) => {
                  const player = event.currentTarget;
                  if (previewCandidate && player.currentTime >= previewCandidate.end) {
                    player.pause();
                    player.currentTime = previewCandidate.start;
                  }
                }}
                className="max-h-[52vh] w-full rounded-lg bg-black"
              />
              <p className="text-[10px] text-muted-foreground">Playback stops at this clip&apos;s end.</p>
            </CardContent>
          </Card>
        ) : null}

        {analysis ? (
          <Card className="border-border/80 bg-card/60 hairline">
            <CardContent className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
              <Stat label="Scenes" value={String(analysis.sceneCount)} />
              <Stat label="Silences" value={String(analysis.silenceCount)} />
              <Stat label="Speech" value={formatDuration(analysis.speechSeconds)} />
              <Stat label="Method" value={analysis.method} small />
              {analysis.warnings.length > 0 ? (
                <div className="col-span-2 space-y-1 sm:col-span-4">
                  {analysis.warnings.map((warning) => (
                    <p key={warning} className="flex gap-1.5 text-[10px] leading-relaxed text-amber-200">
                      <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" /> {warning}
                    </p>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {candidates.length === 0 ? (
          <EmptyState
            variant="media"
            title="No candidates yet"
            description="Run speech and scene analysis to find highlights. Add a focus above to rank clips around a topic, then review each one before rendering."
            action={
              <Button size="sm" onClick={analyze} disabled={analyzing}>
                {analyzing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1.5 h-3.5 w-3.5" />}
                Analyse now
              </Button>
            }
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium">
                {selected.size} of {candidates.length} selected
              </h3>
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelected(new Set(candidates.map((_, index) => index)))}
                >
                  Select all
                </Button>
                <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {candidates.map((candidate, index) => {
                const isSelected = selected.has(index);
                return (
                  <button
                    key={`${candidate.start}-${candidate.end}-${index}`}
                    type="button"
                    onClick={() => {
                      setPreviewIndex(index);
                      const next = new Set(selected);
                      if (isSelected) next.delete(index);
                      else next.add(index);
                      setSelected(next);
                    }}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-colors",
                      isSelected
                        ? "border-brand/50 bg-brand/[0.07]"
                        : "border-border/70 bg-surface/40 hover:border-border",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium">Clip {index + 1}</span>
                          {candidate.score ? (
                            <Badge variant="outline" className="border-brand/40 bg-brand/10 text-[9px] text-brand-soft">
                              {candidate.score} score
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {formatDuration(candidate.start)} → {formatDuration(candidate.end)} ·{" "}
                          {formatDuration(candidate.end - candidate.start)}
                        </p>
                        {candidate.hook ? (
                          <p className="mt-1.5 line-clamp-2 text-[11px] italic text-muted-foreground">
                            “{candidate.hook}”
                          </p>
                        ) : (
                          <p className="mt-1.5 text-[11px] text-muted-foreground">
                            {candidate.title ?? "Highlight"}
                          </p>
                        )}
                      </div>
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                          isSelected
                            ? "border-brand bg-brand text-background"
                            : "border-border text-transparent",
                        )}
                      >
                        <Check className="h-3 w-3" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-card/60 p-3">
              <div className="text-[11px] text-muted-foreground">
                {projectName} · {aspect} · {resolution} · {defaultFps}fps
              </div>
              <Button onClick={render} disabled={rendering || selected.size === 0 || !selectedBackend?.available}>
                {rendering ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Scissors className="mr-1.5 h-3.5 w-3.5" />
                )}
                Render {selected.size} clip{selected.size === 1 ? "" : "s"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-md border border-border/70 bg-surface/40 p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 truncate font-medium", small ? "text-[10px]" : "text-sm tabular")}>{value}</div>
    </div>
  );
}

function parseTimestamp(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) return null;
  if (/^\d+(?:\.\d+)?$/.test(normalized)) return Number(normalized);
  const parts = normalized.split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !/^\d+(?:\.\d+)?$/.test(part))) return null;
  const values = parts.map(Number);
  if (values.slice(1).some((part) => part >= 60)) return null;
  return values.length === 2 ? values[0] * 60 + values[1] : values[0] * 3600 + values[1] * 60 + values[2];
}
