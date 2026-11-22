"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Field, EmptyState } from "@/components/ui-kit";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { postJson } from "@/lib/client-api";
import { cn } from "@/lib/utils";

const presets = [
  { key: "title", label: "Title card" },
  { key: "lower-third", label: "Lower third" },
  { key: "intro", label: "Intro" },
  { key: "outro", label: "Outro" },
  { key: "logo", label: "Logo reveal" },
  { key: "social", label: "Social bumper" },
  { key: "chart", label: "Chart" },
  { key: "kinetic", label: "Kinetic type" },
];

const animations = [
  { key: "fade", label: "Fade" },
  { key: "slide", label: "Slide" },
  { key: "scale", label: "Scale" },
  { key: "typewriter", label: "Typewriter" },
];

export type MotionMedia = { id: string; name: string; kind: string };

export type MotionBackend = {
  key: string;
  label: string;
  available: boolean;
  operational: boolean;
  reason: string | null;
};

export function MotionClient({
  projectId,
  projectName,
  defaultResolution,
  media,
  backends = [{ key: "ffmpeg", label: "FFmpeg", available: true, operational: true, reason: null }],
  defaultBackend = "ffmpeg",
}: {
  projectId: string | null;
  projectName: string | null;
  defaultResolution: string;
  media: MotionMedia[];
  backends?: MotionBackend[];
  defaultBackend?: string;
}) {
  const router = useRouter();
  const [composition, setComposition] = React.useState({
    preset: "title",
    title: projectName ?? "Your title",
    subtitle: "A FREMIQ motion composition",
    accent: "#A78BFA",
    background: "#101116",
    animation: "fade",
    duration: 5,
    resolution: defaultResolution,
  });
  const [backgroundMediaId, setBackgroundMediaId] = React.useState("none");
  const [backend, setBackend] = React.useState(defaultBackend);
  const [busy, setBusy] = React.useState(false);
  const selectedBackend = backends.find((item) => item.key === backend) ?? backends[0];

  function update<K extends keyof typeof composition>(key: K, value: (typeof composition)[K]) {
    setComposition((current) => ({ ...current, [key]: value }));
  }

  async function render() {
    if (!projectId) return;
    setBusy(true);
    try {
      await postJson("/api/motion/render", {
        projectId,
        composition: {
          preset: composition.preset,
          title: composition.title,
          subtitle: composition.subtitle,
          accent: composition.accent,
          background: composition.background,
          animation: composition.animation,
          duration: composition.duration,
        },
        resolution: composition.resolution,
        backgroundMediaId: backgroundMediaId === "none" ? undefined : backgroundMediaId,
        backend,
      });
      toast.success(`Motion render queued on ${selectedBackend?.label ?? "FFmpeg"}`);
      router.push("/render-queue");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not queue the render");
    } finally {
      setBusy(false);
    }
  }

  if (!projectId) {
    return (
      <EmptyState
        variant="projects"
        title="Choose a project"
        description="Motion compositions render inside a project so exports land in its queue."
      />
    );
  }

  const lower = composition.preset === "lower-third";

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="space-y-3">
        <Card className="overflow-hidden border-border/80 bg-card/60 hairline">
          <div
            className="relative flex aspect-video w-full flex-col items-center justify-center overflow-hidden p-8 text-center"
            style={{ backgroundColor: composition.background }}
          >
            <div
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{
                background: `radial-gradient(60% 60% at 50% 30%, ${composition.accent}44 0%, transparent 70%)`,
              }}
            />
            <div className={cn("relative w-full", lower && "flex h-full flex-col items-start justify-end pb-8")}>
              <div
                className="text-2xl font-semibold tracking-tight sm:text-4xl"
                style={{ color: "#F5F5F7" }}
              >
                {composition.title || "Your title"}
              </div>
              {composition.subtitle ? (
                <div
                  className={cn("mt-2 text-xs font-medium sm:text-sm", lower && "mt-1")}
                  style={{ color: composition.accent }}
                >
                  {composition.subtitle}
                </div>
              ) : null}
              {lower ? (
                <div className="mt-3 h-1 w-24 rounded-full" style={{ backgroundColor: composition.accent }} />
              ) : null}
            </div>
            <span className="absolute right-3 top-3 rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-[9px] text-white/60">
              {composition.resolution} · {composition.duration}s · {composition.animation}
            </span>
            <span className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-[9px] text-white/60">
              {selectedBackend?.label ?? "FFmpeg"} backend
            </span>
          </div>
          <CardContent className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 p-3">
            <div className="text-[11px] text-muted-foreground">
              {presets.find((preset) => preset.key === composition.preset)?.label} · {projectName}
            </div>
            <Button size="sm" onClick={render} disabled={busy}>
              {busy ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="mr-1.5 h-3.5 w-3.5" />
              )}
              Render composition
            </Button>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {presets.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => update("preset", preset.key)}
              className={cn(
                "rounded-lg border p-2.5 text-left transition-colors",
                composition.preset === preset.key
                  ? "border-brand/50 bg-brand/[0.07]"
                  : "border-border/70 bg-surface/40 hover:border-border",
              )}
            >
              <Wand2 className="h-3.5 w-3.5 text-brand" />
              <div className="mt-1.5 text-[11px] font-medium">{preset.label}</div>
            </button>
          ))}
        </div>
      </div>

      <Card className="h-fit border-border/80 bg-card/60 hairline">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" />
            <h3 className="text-sm font-medium">Composition</h3>
          </div>
          <Field label="Title">
            <Input value={composition.title} onChange={(event) => update("title", event.target.value)} />
          </Field>
          <Field label="Subtitle">
            <Input value={composition.subtitle} onChange={(event) => update("subtitle", event.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Accent">
              <Input
                type="color"
                value={composition.accent}
                onChange={(event) => update("accent", event.target.value)}
                className="h-9 p-1"
              />
            </Field>
            <Field label="Background">
              <Input
                type="color"
                value={composition.background}
                onChange={(event) => update("background", event.target.value)}
                className="h-9 p-1"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Animation">
              <Select value={composition.animation} onValueChange={(value) => update("animation", value)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {animations.map((animation) => (
                    <SelectItem key={animation.key} value={animation.key}>
                      {animation.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Duration (s)">
              <Input
                type="number"
                min={1}
                max={30}
                value={composition.duration}
                onChange={(event) => update("duration", Math.max(1, Math.min(30, Number(event.target.value))))}
                className="h-9"
              />
            </Field>
          </div>
          <Field label="Resolution">
            <Select value={composition.resolution} onValueChange={(value) => update("resolution", value)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["1920x1080", "1080x1920", "1080x1080", "1080x1350"].map((resolution) => (
                  <SelectItem key={resolution} value={resolution}>
                    {resolution}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Rendering backend"
            hint={
              selectedBackend?.available
                ? "Optional backends come from installed extensions. FFmpeg always remains available."
                : selectedBackend?.reason ?? "That backend is unavailable."
            }
          >
            <Select value={backend} onValueChange={setBackend}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {backends.map((item) => (
                  <SelectItem key={item.key} value={item.key} disabled={!item.available}>
                    {item.label}
                    {item.available ? "" : " · unavailable"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Background media" hint="Optional image or video behind the composition.">
            <Select value={backgroundMediaId} onValueChange={setBackgroundMediaId}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Solid background</SelectItem>
                {media.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>
    </div>
  );
}
