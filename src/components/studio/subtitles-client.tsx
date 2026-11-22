"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Captions,
  Download,
  FileUp,
  Flame,
  Loader2,
  Mic,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, Field, StatusBadge } from "@/components/ui-kit";
import { deleteJson, patchJson, postJson } from "@/lib/client-api";
import { relativeTime } from "@/lib/format";
import { subtitlePresets, defaultSubtitleStyle } from "@/lib/media/subtitles";
import type { SubtitleCue, SubtitleStyle } from "@/lib/types";

export type TrackRow = {
  id: string;
  name: string;
  language: string;
  format: string;
  source: string;
  mediaId: string | null;
  style: SubtitleStyle;
  cues: SubtitleCue[];
  updatedAt: string;
};

export type MediaOption = { id: string; name: string; kind: string; hasAudio: boolean };

export function SubtitlesClient({
  projectId,
  projectName,
  tracks,
  media,
  initialMediaId,
}: {
  projectId: string | null;
  projectName: string | null;
  tracks: TrackRow[];
  media: MediaOption[];
  initialMediaId?: string;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = React.useState<string | null>(tracks[0]?.id ?? null);
  const selected = tracks.find((track) => track.id === selectedId) ?? null;
  const [cues, setCues] = React.useState<SubtitleCue[]>(tracks[0]?.cues ?? []);
  const [style, setStyle] = React.useState<SubtitleStyle>(tracks[0]?.style ?? defaultSubtitleStyle);
  const [name, setName] = React.useState(tracks[0]?.name ?? "Captions");
  const [busy, setBusy] = React.useState<"save" | "render" | "import" | "transcribe" | null>(null);
  const [importOpen, setImportOpen] = React.useState(false);
  const [importForm, setImportForm] = React.useState({
    name: "Captions",
    format: "srt",
    preset: "bold",
    mediaId: "none",
    content: "",
  });
  const [transcribeMedia, setTranscribeMedia] = React.useState(
    initialMediaId && media.some((item) => item.id === initialMediaId)
      ? initialMediaId
      : media.find((item) => item.kind === "video" || item.hasAudio)?.id ?? "",
  );

  React.useEffect(() => {
    const track = tracks.find((item) => item.id === selectedId);
    if (!track) return;
    setCues(track.cues);
    setStyle(track.style);
    setName(track.name);
  }, [selectedId, tracks]);

  function applyPreset(preset: string) {
    const next = subtitlePresets[preset];
    if (next) setStyle({ ...next });
  }

  async function save() {
    if (!selected) return;
    setBusy("save");
    try {
      await patchJson(`/api/subtitles/${selected.id}`, { name, cues, style });
      toast.success("Caption track saved");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save captions");
    } finally {
      setBusy(null);
    }
  }

  async function render() {
    if (!selected) return;
    setBusy("render");
    try {
      await patchJson(`/api/subtitles/${selected.id}`, { name, cues, style });
      await postJson(`/api/subtitles/${selected.id}/render`, {});
      toast.success("Caption burn queued");
      router.push("/render-queue");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not queue the render");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!selected) return;
    try {
      await deleteJson(`/api/subtitles/${selected.id}`);
      toast.success("Caption track removed");
      setSelectedId(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the track");
    }
  }

  async function importTrack() {
    if (!projectId) return;
    setBusy("import");
    try {
      await postJson("/api/subtitles", {
        projectId,
        name: importForm.name,
        format: importForm.format,
        preset: importForm.preset,
        content: importForm.content,
        mediaId: importForm.mediaId === "none" ? undefined : importForm.mediaId,
      });
      toast.success("Caption track imported");
      setImportForm({ ...importForm, content: "" });
      setImportOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import captions");
    } finally {
      setBusy(null);
    }
  }

  async function transcribe() {
    if (!projectId || !transcribeMedia) return;
    setBusy("transcribe");
    try {
      await postJson("/api/subtitles/transcribe", { projectId, mediaId: transcribeMedia });
      toast.success("Transcription complete");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Transcription failed");
    } finally {
      setBusy(null);
    }
  }

  function updateCue(index: number, patch: Partial<SubtitleCue>) {
    setCues((current) => current.map((cue, i) => (i === index ? { ...cue, ...patch } : cue)));
  }

  if (!projectId) {
    return (
      <EmptyState
        variant="projects"
        title="Choose a project"
        description="Caption tracks belong to a project. Create or activate one to get started."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setImportOpen((open) => !open)}>
          <FileUp className="mr-1.5 h-3.5 w-3.5" /> Import captions
        </Button>
        <div className="flex items-center gap-1.5">
          <Select value={transcribeMedia} onValueChange={setTranscribeMedia}>
            <SelectTrigger className="h-8 w-52 text-xs">
              <SelectValue placeholder="Choose media" />
            </SelectTrigger>
            <SelectContent>
              {media.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            onClick={transcribe}
            disabled={busy !== null || !transcribeMedia}
          >
            {busy === "transcribe" ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Mic className="mr-1.5 h-3.5 w-3.5" />
            )}
            Transcribe
          </Button>
        </div>
        <span className="text-[10px] text-muted-foreground">
          Web transcription uses the provider set in Settings. Audio is sent only when you press Transcribe.
        </span>
      </div>

      {importOpen ? (
        <Card className="border-brand/30 bg-brand/[0.04]">
          <CardContent className="space-y-3 p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Track name">
                <Input
                  value={importForm.name}
                  onChange={(event) => setImportForm({ ...importForm, name: event.target.value })}
                  className="h-9"
                />
              </Field>
              <Field label="Format">
                <Select
                  value={importForm.format}
                  onValueChange={(value) => setImportForm({ ...importForm, format: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["srt", "vtt", "ass"].map((format) => (
                      <SelectItem key={format} value={format}>
                        {format.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Link to media">
                <Select
                  value={importForm.mediaId}
                  onValueChange={(value) => setImportForm({ ...importForm, mediaId: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No media</SelectItem>
                    {media.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Subtitle content" hint="Paste SRT, VTT or ASS. FREMIQ parses cues and timings.">
              <Textarea
                value={importForm.content}
                onChange={(event) => setImportForm({ ...importForm, content: event.target.value })}
                rows={6}
                placeholder={"1\n00:00:00,000 --> 00:00:03,000\nYour first caption"}
                className="font-mono text-[11px]"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setImportOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={importTrack} disabled={busy !== null || !importForm.content.trim()}>
                {busy === "import" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Import track
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Card className="h-fit border-border/80 bg-card/60 hairline">
          <CardContent className="space-y-2 p-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Caption tracks</h3>
              <span className="text-[10px] text-muted-foreground">{tracks.length}</span>
            </div>
            {tracks.length === 0 ? (
              <p className="py-4 text-xs text-muted-foreground">
                No caption tracks yet. Import an SRT/VTT file or transcribe audio with the Local Agent.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {tracks.map((track) => (
                  <li key={track.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(track.id)}
                      className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                        selectedId === track.id
                          ? "border-brand/40 bg-brand/[0.06]"
                          : "border-border/70 bg-surface/40 hover:border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[11px] font-medium">{track.name}</span>
                        <Badge variant="outline" className="border-border/70 text-[9px] uppercase text-muted-foreground">
                          {track.format}
                        </Badge>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <Captions className="h-2.5 w-2.5" /> {track.cues.length} cues ·{" "}
                        {track.language.toUpperCase()}
                      </div>
                      <div className="mt-0.5 text-[9px] text-muted-foreground/80">
                        {track.source} · {relativeTime(track.updatedAt)}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {!selected ? (
          <EmptyState
            variant="subtitles"
            title="Select a caption track"
            description="Pick a track to edit its cues and style, or import a new one."
          />
        ) : (
          <div className="space-y-3">
            <Card className="border-border/80 bg-card/60 hairline">
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="h-8 w-56 text-xs"
                  />
                  <StatusBadge status={selected.source === "whisper" ? "detected" : "ok"} label={selected.source} />
                  <div className="ml-auto flex flex-wrap gap-1.5">
                    <Button asChild variant="outline" size="sm" className="h-8">
                      <a href={`/api/subtitles/${selected.id}?format=srt`}>
                        <Download className="mr-1 h-3 w-3" /> SRT
                      </a>
                    </Button>
                    <Button asChild variant="outline" size="sm" className="h-8">
                      <a href={`/api/subtitles/${selected.id}?format=vtt`}>
                        <Download className="mr-1 h-3 w-3" /> VTT
                      </a>
                    </Button>
                    <Button asChild variant="outline" size="sm" className="h-8">
                      <a href={`/api/subtitles/${selected.id}?format=ass`}>
                        <Download className="mr-1 h-3 w-3" /> ASS
                      </a>
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-400" onClick={remove}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
                  <Button size="sm" onClick={save} disabled={busy !== null}>
                    {busy === "save" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={render} disabled={busy !== null || !selected.mediaId}>
                    {busy === "render" ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Flame className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Burn into video
                  </Button>
                  {!selected.mediaId ? (
                    <span className="text-[10px] text-amber-300">Link a video to burn these captions.</span>
                  ) : null}
                  <span className="ml-auto text-[10px] text-muted-foreground">{projectName}</span>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
              <Card className="border-border/80 bg-card/60 hairline">
                <CardContent className="space-y-2 p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">Cues</h3>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setCues((current) => [
                          ...current,
                          {
                            id: `cue-${Date.now()}`,
                            start: current.length ? current[current.length - 1].end + 0.2 : 0,
                            end: current.length ? current[current.length - 1].end + 2.2 : 2,
                            text: "New caption",
                          },
                        ])
                      }
                    >
                      <Plus className="mr-1 h-3 w-3" /> Add cue
                    </Button>
                  </div>
                  {cues.length === 0 ? (
                    <p className="py-6 text-center text-xs text-muted-foreground">No cues yet.</p>
                  ) : (
                    <ul className="max-h-[520px] space-y-1.5 overflow-y-auto pr-1">
                      {cues.map((cue, index) => (
                        <li key={cue.id} className="rounded-lg border border-border/70 bg-surface/40 p-2">
                          <div className="flex items-center gap-1.5">
                            <span className="w-6 shrink-0 text-[9px] text-muted-foreground tabular">{index + 1}</span>
                            <Input
                              type="number"
                              step="0.1"
                              min={0}
                              value={cue.start}
                              onChange={(event) => updateCue(index, { start: Number(event.target.value) })}
                              className="h-7 w-20 text-[10px]"
                            />
                            <span className="text-[9px] text-muted-foreground">→</span>
                            <Input
                              type="number"
                              step="0.1"
                              min={0}
                              value={cue.end}
                              onChange={(event) => updateCue(index, { end: Number(event.target.value) })}
                              className="h-7 w-20 text-[10px]"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="ml-auto h-6 w-6 text-muted-foreground hover:text-red-400"
                              onClick={() => setCues((current) => current.filter((_, i) => i !== index))}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                          <Textarea
                            value={cue.text}
                            onChange={(event) => updateCue(index, { text: event.target.value })}
                            rows={2}
                            className="mt-1.5 resize-none text-[11px]"
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card className="h-fit border-border/80 bg-card/60 hairline">
                <CardContent className="space-y-3 p-4">
                  <h3 className="text-sm font-medium">Style</h3>
                  <Field label="Preset">
                    <Select value={style.preset} onValueChange={applyPreset}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(subtitlePresets).map((preset) => (
                          <SelectItem key={preset} value={preset} className="capitalize">
                            {preset}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Size">
                      <Input
                        type="number"
                        min={12}
                        max={140}
                        value={style.fontSize}
                        onChange={(event) => setStyle({ ...style, fontSize: Number(event.target.value) })}
                        className="h-8 text-xs"
                      />
                    </Field>
                    <Field label="Outline">
                      <Input
                        type="number"
                        min={0}
                        max={12}
                        value={style.outlineWidth}
                        onChange={(event) => setStyle({ ...style, outlineWidth: Number(event.target.value) })}
                        className="h-8 text-xs"
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Text colour">
                      <Input
                        type="color"
                        value={style.primaryColor}
                        onChange={(event) => setStyle({ ...style, primaryColor: event.target.value })}
                        className="h-8 p-1"
                      />
                    </Field>
                    <Field label="Highlight">
                      <Input
                        type="color"
                        value={style.highlightColor}
                        onChange={(event) => setStyle({ ...style, highlightColor: event.target.value })}
                        className="h-8 p-1"
                      />
                    </Field>
                  </div>
                  <Field label="Position">
                    <Tabs
                      value={style.position}
                      onValueChange={(value) =>
                        setStyle({ ...style, position: value as "top" | "center" | "bottom" })
                      }
                    >
                      <TabsList className="h-8 w-full">
                        {["top", "center", "bottom"].map((position) => (
                          <TabsTrigger key={position} value={position} className="flex-1 text-[10px] capitalize">
                            {position}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
                  </Field>
                  <div className="space-y-2 border-t border-border/60 pt-2">
                    <Toggle label="Uppercase" checked={style.uppercase} onChange={(v) => setStyle({ ...style, uppercase: v })} />
                    <Toggle label="Bold" checked={style.bold} onChange={(v) => setStyle({ ...style, bold: v })} />
                    <Toggle label="Italic" checked={style.italic} onChange={(v) => setStyle({ ...style, italic: v })} />
                    <Toggle label="Karaoke highlight" checked={style.karaoke} onChange={(v) => setStyle({ ...style, karaoke: v })} />
                    <Toggle label="Background box" checked={style.background} onChange={(v) => setStyle({ ...style, background: v })} />
                  </div>
                  <div className="rounded-lg border border-border/70 bg-surface/40 p-3">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Preview</div>
                    <div className="mt-2 flex min-h-20 items-center justify-center rounded-md bg-black/50 p-2">
                      <span
                        style={{
                          color: style.primaryColor,
                          fontSize: Math.min(22, Math.max(10, style.fontSize / 2.6)),
                          fontWeight: style.bold ? 700 : 400,
                          fontStyle: style.italic ? "italic" : "normal",
                          textTransform: style.uppercase ? "uppercase" : "none",
                          textShadow:
                            style.outlineWidth > 0
                              ? `0 0 ${style.outlineWidth}px ${style.outlineColor}, 1px 1px 0 ${style.outlineColor}`
                              : undefined,
                          backgroundColor: style.background ? `rgba(16,17,22,${style.backgroundOpacity})` : undefined,
                          padding: style.background ? "2px 6px" : undefined,
                          borderRadius: 4,
                        }}
                      >
                        {cues[0]?.text ?? "Your caption appears here"}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
