"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AudioLines,
  CheckCircle2,
  Download,
  Loader2,
  Music4,
  Play,
  Sparkles,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, EmptyState, StatusBadge } from "@/components/ui-kit";
import { postJson } from "@/lib/client-api";
import { cn } from "@/lib/utils";

export type AudioMedia = {
  id: string;
  name: string;
  kind: string;
  durationSec: number | null;
  hasAudio: boolean;
};

export type EarshotState = {
  installed: boolean;
  enabled: boolean;
  operational: boolean;
  health: string;
  reason: string | null;
};

const formats = [
  { key: "mp3", label: "MP3" },
  { key: "wav", label: "WAV" },
  { key: "m4a", label: "M4A / AAC" },
];

export function AudioClient({
  projectId,
  projectName,
  media,
  earshot,
}: {
  projectId: string | null;
  projectName: string | null;
  media: AudioMedia[];
  earshot: EarshotState;
}) {
  const router = useRouter();
  const sources = media.filter((item) => item.hasAudio);
  const [mediaId, setMediaId] = React.useState(sources[0]?.id ?? "");
  const [operations, setOperations] = React.useState({
    normalize: true,
    trimStart: "",
    trimEnd: "",
    fadeIn: "",
    fadeOut: "",
    volume: "",
    format: "mp3",
  });
  const [busy, setBusy] = React.useState(false);
  const [request, setRequest] = React.useState("a soft success chime for an app");
  const [sfxBusy, setSfxBusy] = React.useState(false);
  const [sfxResult, setSfxResult] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!sources.some((item) => item.id === mediaId)) {
      setMediaId(sources[0]?.id ?? "");
    }
  }, [mediaId, sources]);

  const selected = sources.find((item) => item.id === mediaId);

  async function processAudio() {
    if (!projectId || !mediaId) return;
    setBusy(true);
    try {
      const result = await postJson<{ job: { id: string } }>("/api/audio/process", {
        projectId,
        mediaId,
        operations: {
          normalize: operations.normalize,
          trimStart: operations.trimStart === "" ? undefined : Number(operations.trimStart),
          trimEnd: operations.trimEnd === "" ? undefined : Number(operations.trimEnd),
          fadeIn: operations.fadeIn === "" ? undefined : Number(operations.fadeIn),
          fadeOut: operations.fadeOut === "" ? undefined : Number(operations.fadeOut),
          volume: operations.volume === "" ? undefined : Number(operations.volume),
          format: operations.format,
        },
      });
      toast.success("Audio processing queued");
      router.push(`/render-queue`);
      return result;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not queue audio processing");
    } finally {
      setBusy(false);
    }
  }

  async function makeSfx() {
    setSfxBusy(true);
    try {
      const result = await postJson<{ result: { ok: boolean; message: string } }>(
        "/api/extensions/earshot/execute",
        {
          operation: "make",
          request,
          output: `exports/earshot-${Date.now()}.wav`,
        },
      );
      if (!result.result.ok) throw new Error(result.result.message);
      setSfxResult(result.result.message);
      toast.success("Earshot generated a sound effect");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Earshot failed");
    } finally {
      setSfxBusy(false);
    }
  }

  if (!projectId) {
    return (
      <EmptyState
        variant="projects"
        title="Choose a project"
        description="Audio processing runs inside a project so results land in its render queue and exports."
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <Card className="border-border/80 bg-card/60 hairline">
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center gap-2">
              <AudioLines className="h-4 w-4 text-brand" />
              <h3 className="text-sm font-medium">Clean and master audio</h3>
              <Badge variant="outline" className="ml-auto border-border/70 text-[10px]">
                FFmpeg backend
              </Badge>
            </div>
            {sources.length === 0 ? (
              <EmptyState
                variant="media"
                title="No audio sources yet"
                description="Upload an audio file, or a video with an audio stream, in the Media Library."
                action={
                  <Button asChild size="sm">
                    <Link href="/media">Open Media Library</Link>
                  </Button>
                }
              />
            ) : (
              <>
                <Field label="Source file" hint={selected ? `${selected.kind} · ${selected.name}` : undefined}>
                  <Select value={mediaId} onValueChange={setMediaId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Choose audio" />
                    </SelectTrigger>
                    <SelectContent>
                      {sources.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Trim start (s)" hint="Optional. Seconds from the beginning.">
                    <Input
                      type="number"
                      min={0}
                      value={operations.trimStart}
                      onChange={(event) =>
                        setOperations((current) => ({ ...current, trimStart: event.target.value }))
                      }
                      placeholder="0"
                    />
                  </Field>
                  <Field label="Trim end (s)" hint="Optional. Leave blank for the full file.">
                    <Input
                      type="number"
                      min={0}
                      value={operations.trimEnd}
                      onChange={(event) =>
                        setOperations((current) => ({ ...current, trimEnd: event.target.value }))
                      }
                      placeholder="e.g. 30"
                    />
                  </Field>
                  <Field label="Fade in (s)">
                    <Input
                      type="number"
                      min={0}
                      step="0.1"
                      value={operations.fadeIn}
                      onChange={(event) =>
                        setOperations((current) => ({ ...current, fadeIn: event.target.value }))
                      }
                      placeholder="0"
                    />
                  </Field>
                  <Field label="Fade out (s)">
                    <Input
                      type="number"
                      min={0}
                      step="0.1"
                      value={operations.fadeOut}
                      onChange={(event) =>
                        setOperations((current) => ({ ...current, fadeOut: event.target.value }))
                      }
                      placeholder="0"
                    />
                  </Field>
                  <Field label="Volume gain" hint="1 = unchanged, 0.5 = half, 2 = double.">
                    <Input
                      type="number"
                      min={0}
                      step="0.1"
                      value={operations.volume}
                      onChange={(event) =>
                        setOperations((current) => ({ ...current, volume: event.target.value }))
                      }
                      placeholder="1"
                    />
                  </Field>
                  <Field label="Output format">
                    <Select
                      value={operations.format}
                      onValueChange={(value) =>
                        setOperations((current) => ({ ...current, format: value }))
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {formats.map((format) => (
                          <SelectItem key={format.key} value={format.key}>
                            {format.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <label className="flex items-center gap-2 rounded-lg border border-border/70 bg-surface/40 p-3 text-xs">
                  <input
                    type="checkbox"
                    checked={operations.normalize}
                    onChange={(event) =>
                      setOperations((current) => ({ ...current, normalize: event.target.checked }))
                    }
                    className="h-3.5 w-3.5 accent-[var(--brand)]"
                  />
                  <span>
                    Loudness normalisation
                    <span className="ml-1 text-muted-foreground">
                      (FFmpeg loudnorm to a broadcast-safe target)
                    </span>
                  </span>
                </label>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-muted-foreground">
                    The original file is never modified. FREMIQ writes a new export.
                  </p>
                  <Button size="sm" onClick={processAudio} disabled={busy || !mediaId}>
                    {busy ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Queue audio pass
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/60 hairline">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-brand" />
              <h3 className="text-sm font-medium">Earshot sound design</h3>
              <StatusBadge
                status={earshot.operational ? "ok" : earshot.installed ? earshot.health : "not_installed"}
                label={earshot.operational ? "Operational" : earshot.installed ? "Installed" : "Optional"}
                className="ml-auto"
              />
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {earshot.operational
                ? "Describe a sound in words. Earshot renders a new take locally from its code-built catalogue. Listening models stay disabled unless you enable them explicitly."
                : earshot.reason ??
                  "Install the optional Earshot extension from Tool Manager to generate sound effects from plain language."}
            </p>
            {earshot.operational ? (
              <>
                <Field label="Describe the sound">
                  <Input
                    value={request}
                    onChange={(event) => setRequest(event.target.value)}
                    placeholder="a soft success chime for an app"
                  />
                </Field>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-muted-foreground">
                    Writes a WAV into the FREMIQ exports directory.
                  </span>
                  <Button size="sm" onClick={makeSfx} disabled={sfxBusy || !request.trim()}>
                    {sfxBusy ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Generate sound
                  </Button>
                </div>
                {sfxResult ? (
                  <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-[11px] text-emerald-200">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="break-all">{sfxResult}</span>
                  </div>
                ) : null}
              </>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link href="/tools">Open Tool Manager</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="h-fit border-border/80 bg-card/60 hairline">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Music4 className="h-4 w-4 text-brand" />
            <h3 className="text-sm font-medium">Project audio</h3>
          </div>
          <div className="rounded-lg border border-border/70 bg-surface/40 p-3">
            <div className="text-[10px] text-muted-foreground">Project</div>
            <div className="mt-0.5 truncate text-xs font-medium">{projectName}</div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{sources.length} audio-capable files</span>
              <span>{media.length} media total</span>
            </div>
          </div>
          <ul className="space-y-1.5">
            {sources.slice(0, 8).map((item) => (
              <li
                key={item.id}
                className={cn(
                  "flex items-center gap-2 rounded-md border p-2 text-[11px]",
                  item.id === mediaId
                    ? "border-brand/40 bg-brand/[0.06]"
                    : "border-border/60 bg-surface/30",
                )}
              >
                <AudioLines className="h-3 w-3 shrink-0 text-brand" />
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {item.kind}
                </span>
              </li>
            ))}
          </ul>
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link href="/render-queue">
              <Download className="mr-1.5 h-3.5 w-3.5" /> Open exports
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
