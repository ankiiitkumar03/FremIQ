"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AudioLines,
  Clapperboard,
  Eye,
  EyeOff,
  Film,
  Image as ImageIcon,
  Loader2,
  Lock,
  LockOpen,
  Plus,
  Save,
  Trash2,
  Type,
  Video,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui-kit";
import { MediaThumb } from "@/components/studio/shared";
import { postJson, putJson } from "@/lib/client-api";
import { formatDuration, formatTimecode } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TimelineClip, TimelineData, TimelineTrack } from "@/lib/types";

export type TimelineMedia = {
  id: string;
  name: string;
  kind: string;
  durationSec: number | null;
  thumbnailPath: string | null;
};

const trackColors: Record<string, string> = {
  video: "border-brand/40 bg-brand/20 text-brand-soft",
  audio: "border-sky-500/40 bg-sky-500/15 text-sky-200",
  subtitle: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
  text: "border-amber-500/40 bg-amber-500/15 text-amber-200",
  overlay: "border-pink-500/40 bg-pink-500/15 text-pink-200",
};

export function TimelineClient({
  projectId,
  projectName,
  initialTimeline,
  savedAt,
  media,
}: {
  projectId: string | null;
  projectName: string | null;
  initialTimeline: TimelineData;
  savedAt: string | null;
  media: TimelineMedia[];
}) {
  const router = useRouter();
  const [timeline, setTimeline] = React.useState<TimelineData>(initialTimeline);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [zoom, setZoom] = React.useState(28);
  const [busy, setBusy] = React.useState<"save" | "render" | null>(null);
  const [adding, setAdding] = React.useState<null | "media" | "text">(null);
  const [addTarget, setAddTarget] = React.useState<string>("v1");

  const clips = timeline.clips;
  const duration = Math.max(
    10,
    ...clips.map((clip) => clip.start + clip.duration),
  );
  const selected = clips.find((clip) => clip.id === selectedId) ?? null;

  const selectedTrack = timeline.tracks.find((track) => track.id === selected?.trackId);

  function updateClip(id: string, patch: Partial<TimelineClip>) {
    setTimeline((current) => ({
      ...current,
      clips: current.clips.map((clip) => (clip.id === id ? { ...clip, ...patch } : clip)),
    }));
  }

  function updateText(id: string, patch: Partial<NonNullable<TimelineClip["text"]>>) {
    setTimeline((current) => ({
      ...current,
      clips: current.clips.map((clip) =>
        clip.id === id
          ? {
              ...clip,
              text: {
                content: "",
                fontSize: 64,
                color: "#FFFFFF",
                position: "center",
                ...(clip.text ?? {}),
                ...patch,
              },
            }
          : clip,
      ),
    }));
  }

  function updateTrack(id: string, patch: Partial<TimelineTrack>) {
    setTimeline((current) => ({
      ...current,
      tracks: current.tracks.map((track) => (track.id === id ? { ...track, ...patch } : track)),
    }));
  }

  function trackEnd(trackId: string) {
    return timeline.clips
      .filter((clip) => clip.trackId === trackId)
      .reduce((max, clip) => Math.max(max, clip.start + clip.duration), 0);
  }

  function addMediaClip(item: TimelineMedia) {
    const preferred =
      item.kind === "audio"
        ? timeline.tracks.find((track) => track.kind === "audio")
        : timeline.tracks.find((track) => track.kind === "video");
    const track = timeline.tracks.find((entry) => entry.id === addTarget) ?? preferred;
    if (!track) {
      toast.error("Add a suitable track first");
      return;
    }
    const clip: TimelineClip = {
      id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      trackId: track.id,
      mediaId: item.id,
      name: item.name,
      kind: item.kind === "audio" ? "audio" : item.kind === "image" ? "image" : "video",
      start: Math.round(trackEnd(track.id) * 100) / 100,
      duration: Math.max(1, item.durationSec ?? (item.kind === "image" ? 5 : 5)),
      inPoint: 0,
      speed: 1,
      volume: 1,
      fit: "cover",
    };
    setTimeline((current) => ({ ...current, clips: [...current.clips, clip] }));
    setSelectedId(clip.id);
    setAdding(null);
    toast.success(`Added ${item.name}`);
  }

  function addTextClip() {
    const track =
      timeline.tracks.find((entry) => entry.id === addTarget) ??
      timeline.tracks.find((entry) => entry.kind === "text");
    if (!track) {
      toast.error("Add a text track first");
      return;
    }
    const clip: TimelineClip = {
      id: `text-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      trackId: track.id,
      name: "Title",
      kind: "text",
      start: Math.round(trackEnd(track.id) * 100) / 100,
      duration: 3,
      inPoint: 0,
      speed: 1,
      volume: 1,
      fit: "contain",
      text: { content: "Your title", fontSize: 64, color: "#FFFFFF", position: "center" },
    };
    setTimeline((current) => ({ ...current, clips: [...current.clips, clip] }));
    setSelectedId(clip.id);
    setAdding(null);
  }

  function removeClip(id: string) {
    setTimeline((current) => ({ ...current, clips: current.clips.filter((clip) => clip.id !== id) }));
    if (selectedId === id) setSelectedId(null);
  }

  async function save() {
    if (!projectId) return false;
    setBusy("save");
    try {
      await putJson("/api/timeline", { projectId, data: timeline });
      toast.success("Timeline saved");
      router.refresh();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the timeline");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function render() {
    if (!projectId) return;
    setBusy("render");
    try {
      await putJson("/api/timeline", { projectId, data: timeline });
      const result = await postJson<{ job: { id: string } }>("/api/timeline/render", { projectId });
      toast.success("Timeline render queued");
      router.push("/render-queue");
      return result;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not queue the render");
    } finally {
      setBusy(null);
    }
  }

  const ticks = React.useMemo(() => {
    const step = zoom < 20 ? 10 : zoom < 40 ? 5 : zoom < 80 ? 2 : 1;
    const count = Math.ceil((duration + 5) / step);
    return Array.from({ length: count + 1 }, (_, index) => index * step);
  }, [duration, zoom]);

  if (!projectId) {
    return (
      <Card className="border-dashed border-border/80 bg-card/50">
        <CardContent className="py-14 text-center">
          <Clapperboard className="mx-auto h-8 w-8 text-brand" />
          <div className="mt-3 text-sm font-medium">Choose a project</div>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            The timeline is saved per project. Create or activate a project first.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-3">
        <Card className="border-border/80 bg-card/60 hairline">
          <CardContent className="flex flex-col gap-3 p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Button size="sm" onClick={() => { setAdding("media"); setAddTarget("v1"); }}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Media
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setAdding("text"); setAddTarget("t1"); }}>
                  <Type className="mr-1 h-3.5 w-3.5" /> Text
                </Button>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <Badge variant="outline" className="border-border/70 text-[10px] text-muted-foreground">
                  {timeline.settings.aspectRatio} · {timeline.settings.width}×{timeline.settings.height} ·{" "}
                  {timeline.settings.fps}fps
                </Badge>
                <Button size="sm" variant="outline" onClick={save} disabled={busy !== null}>
                  {busy === "save" ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="mr-1 h-3.5 w-3.5" />
                  )}
                  Save
                </Button>
                <Button size="sm" onClick={render} disabled={busy !== null || clips.length === 0}>
                  {busy === "render" ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="mr-1 h-3.5 w-3.5" />
                  )}
                  Render
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
              <span>{clips.length} clips</span>
              <span>{formatDuration(duration)} total</span>
              {savedAt ? <span>last saved {savedAt}</span> : <span>not saved yet</span>}
              <div className="ml-auto flex items-center gap-2">
                <ZoomOut className="h-3.5 w-3.5" />
                <Slider
                  value={[zoom]}
                  min={10}
                  max={120}
                  step={2}
                  onValueChange={([value]) => setZoom(value)}
                  className="w-28"
                />
                <ZoomIn className="h-3.5 w-3.5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-border/80 bg-card/60 hairline">
          <div className="flex">
            <div className="w-32 shrink-0 border-r border-border/70 bg-surface/40 sm:w-40">
              <div className="h-8 border-b border-border/70 px-2.5 py-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                Tracks
              </div>
              {timeline.tracks.map((track) => (
                <div
                  key={track.id}
                  className="flex h-14 items-center gap-1.5 border-b border-border/60 px-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-medium">{track.name}</div>
                    <div className="text-[9px] capitalize text-muted-foreground">{track.kind}</div>
                  </div>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => updateTrack(track.id, { visible: !track.visible })}
                    aria-label="Toggle visibility"
                  >
                    {track.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  </button>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => updateTrack(track.id, { muted: !track.muted })}
                    aria-label="Toggle mute"
                  >
                    {track.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                  </button>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => updateTrack(track.id, { locked: !track.locked })}
                    aria-label="Toggle lock"
                  >
                    {track.locked ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
                  </button>
                </div>
              ))}
            </div>
            <div className="min-w-0 flex-1 overflow-x-auto">
              <div className="relative" style={{ width: Math.max(640, (duration + 4) * zoom) }}>
                <div className="relative h-8 border-b border-border/70 bg-surface/30">
                  {ticks.map((tick) => (
                    <div
                      key={tick}
                      className="absolute top-0 h-full border-l border-border/40 pl-1 text-[9px] text-muted-foreground"
                      style={{ left: tick * zoom }}
                    >
                      {formatDuration(tick)}
                    </div>
                  ))}
                </div>
                {timeline.tracks.map((track) => (
                  <div
                    key={track.id}
                    className="relative h-14 border-b border-border/60 bg-background/20"
                    onDoubleClick={() => {
                      setAddTarget(track.id);
                      setAdding(track.kind === "text" ? "text" : "media");
                    }}
                  >
                    {clips
                      .filter((clip) => clip.trackId === track.id)
                      .map((clip) => (
                        <button
                          key={clip.id}
                          type="button"
                          onClick={() => setSelectedId(clip.id)}
                          className={cn(
                            "absolute top-1.5 flex h-11 flex-col justify-center overflow-hidden rounded-md border px-1.5 text-left text-[9px] transition-shadow",
                            trackColors[track.kind] ?? trackColors.video,
                            selectedId === clip.id && "ring-2 ring-brand ring-offset-1 ring-offset-background",
                          )}
                          style={{
                            left: clip.start * zoom,
                            width: Math.max(24, clip.duration * zoom),
                            opacity: track.visible ? 1 : 0.4,
                          }}
                        >
                          <span className="flex items-center gap-1 truncate font-medium">
                            {clip.kind === "audio" ? (
                              <AudioLines className="h-2.5 w-2.5 shrink-0" />
                            ) : clip.kind === "image" ? (
                              <ImageIcon className="h-2.5 w-2.5 shrink-0" />
                            ) : clip.kind === "text" ? (
                              <Type className="h-2.5 w-2.5 shrink-0" />
                            ) : (
                              <Film className="h-2.5 w-2.5 shrink-0" />
                            )}
                            <span className="truncate">{clip.name}</span>
                          </span>
                          <span className="truncate opacity-70">{formatDuration(clip.duration)}</span>
                        </button>
                      ))}
                  </div>
                ))}
                <div
                  className="pointer-events-none absolute bottom-0 top-8 w-px bg-brand/70"
                  style={{ left: 0 }}
                />
              </div>
            </div>
          </div>
        </Card>

        <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Video className="h-3 w-3" /> Double-click a track to add media or text.
          </span>
          {projectName ? <span className="ml-auto">{projectName}</span> : null}
        </div>
      </div>

      <Card className="h-fit border-border/80 bg-card/60 hairline">
        <CardContent className="space-y-3 p-4">
          {!selected ? (
            <>
              <h3 className="text-sm font-medium">Inspector</h3>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Select a clip on the timeline to edit its timing, fit, volume and text.
              </p>
              <div className="rounded-lg border border-border/70 bg-surface/40 p-2.5 text-[11px] text-muted-foreground">
                {timeline.settings.aspectRatio} canvas · {timeline.settings.width}×{timeline.settings.height}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-medium">{selected.name}</h3>
                  <p className="text-[10px] capitalize text-muted-foreground">
                    {selectedTrack?.name} · {selected.kind}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-red-400"
                  onClick={() => removeClip(selected.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {selected.mediaId ? (
                <MediaThumb
                  item={
                    media.find((item) => item.id === selected.mediaId) ?? {
                      id: selected.mediaId,
                      kind: selected.kind,
                      name: selected.name,
                      thumbnailPath: null,
                    }
                  }
                  className="aspect-video w-full"
                />
              ) : null}

              <Field label="Label">
                <Input
                  value={selected.name}
                  onChange={(event) => updateClip(selected.id, { name: event.target.value })}
                  className="h-8 text-xs"
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Start (s)">
                  <Input
                    type="number"
                    step="0.1"
                    min={0}
                    value={selected.start}
                    onChange={(event) => updateClip(selected.id, { start: Math.max(0, Number(event.target.value)) })}
                    className="h-8 text-xs"
                  />
                </Field>
                <Field label="Duration (s)">
                  <Input
                    type="number"
                    step="0.1"
                    min={0.1}
                    value={selected.duration}
                    onChange={(event) =>
                      updateClip(selected.id, { duration: Math.max(0.1, Number(event.target.value)) })
                    }
                    className="h-8 text-xs"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="In point (s)">
                  <Input
                    type="number"
                    step="0.1"
                    min={0}
                    value={selected.inPoint}
                    onChange={(event) => updateClip(selected.id, { inPoint: Math.max(0, Number(event.target.value)) })}
                    className="h-8 text-xs"
                  />
                </Field>
                <Field label="Speed">
                  <Input
                    type="number"
                    step="0.05"
                    min={0.25}
                    max={4}
                    value={selected.speed}
                    onChange={(event) =>
                      updateClip(selected.id, {
                        speed: Math.max(0.25, Math.min(4, Number(event.target.value))),
                      })
                    }
                    className="h-8 text-xs"
                  />
                </Field>
              </div>

              {selected.kind !== "text" ? (
                <>
                  <Field label={`Volume · ${Math.round(selected.volume * 100)}%`}>
                    <Slider
                      value={[selected.volume * 100]}
                      min={0}
                      max={100}
                      step={1}
                      onValueChange={([value]) => updateClip(selected.id, { volume: value / 100 })}
                    />
                  </Field>
                  <Field label="Fit">
                    <Tabs
                      value={selected.fit}
                      onValueChange={(value) => updateClip(selected.id, { fit: value as "cover" | "contain" })}
                    >
                      <TabsList className="h-8 w-full">
                        <TabsTrigger value="cover" className="flex-1 text-[11px]">
                          Cover
                        </TabsTrigger>
                        <TabsTrigger value="contain" className="flex-1 text-[11px]">
                          Contain
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Text">
                    <Input
                      value={selected.text?.content ?? ""}
                      onChange={(event) => updateText(selected.id, { content: event.target.value })}
                      className="h-8 text-xs"
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Size">
                      <Input
                        type="number"
                        min={12}
                        max={200}
                        value={selected.text?.fontSize ?? 64}
                        onChange={(event) => updateText(selected.id, { fontSize: Number(event.target.value) })}
                        className="h-8 text-xs"
                      />
                    </Field>
                    <Field label="Colour">
                      <Input
                        type="color"
                        value={selected.text?.color ?? "#FFFFFF"}
                        onChange={(event) => updateText(selected.id, { color: event.target.value })}
                        className="h-8 p-1"
                      />
                    </Field>
                  </div>
                  <Field label="Position">
                    <Tabs
                      value={selected.text?.position ?? "center"}
                      onValueChange={(value) =>
                        updateText(selected.id, { position: value as "top" | "center" | "bottom" })
                      }
                    >
                      <TabsList className="h-8 w-full">
                        {["top", "center", "bottom"].map((position) => (
                          <TabsTrigger key={position} value={position} className="flex-1 text-[11px] capitalize">
                            {position}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
                  </Field>
                </>
              )}

              <div className="flex items-center justify-between rounded-lg border border-border/70 bg-surface/40 px-2.5 py-2 text-[10px] text-muted-foreground">
                <span>Timeline position</span>
                <span className="tabular">{formatTimecode(selected.start, timeline.settings.fps)}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={adding === "media"} onOpenChange={(open) => !open && setAdding(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">Add media to timeline</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Target track</span>
              <select
                value={addTarget}
                onChange={(event) => setAddTarget(event.target.value)}
                className="h-8 flex-1 rounded-md border border-border/70 bg-surface/60 px-2 text-xs"
              >
                {timeline.tracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.name} · {track.kind}
                  </option>
                ))}
              </select>
            </div>
            {media.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No media in this project yet. Upload files in the Media Library.
              </p>
            ) : (
              <ul className="max-h-80 space-y-1.5 overflow-y-auto">
                {media.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => addMediaClip(item)}
                      className="flex w-full items-center gap-2.5 rounded-lg border border-border/70 bg-surface/40 p-2 text-left transition-colors hover:border-brand/40"
                    >
                      <MediaThumb item={item} className="h-9 w-14" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[11px] font-medium">{item.name}</div>
                        <div className="text-[10px] capitalize text-muted-foreground">
                          {item.kind} · {formatDuration(item.durationSec)}
                        </div>
                      </div>
                      <Plus className="h-3.5 w-3.5 text-brand" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={adding === "text"} onOpenChange={(open) => !open && setAdding(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Add a text clip</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Target track</span>
              <select
                value={addTarget}
                onChange={(event) => setAddTarget(event.target.value)}
                className="h-8 flex-1 rounded-md border border-border/70 bg-surface/60 px-2 text-xs"
              >
                {timeline.tracks
                  .filter((track) => track.kind === "text" || track.kind === "subtitle")
                  .map((track) => (
                    <option key={track.id} value={track.id}>
                      {track.name}
                    </option>
                  ))}
              </select>
            </div>
            <Button size="sm" className="w-full" onClick={addTextClip}>
              <Type className="mr-1.5 h-3.5 w-3.5" /> Add title
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
