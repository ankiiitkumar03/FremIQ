"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AudioLines,
  Download,
  FileArchive,
  Film,
  Image as ImageIcon,
  Link2,
  Loader2,
  Play,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, MetricCard } from "@/components/ui-kit";
import { MediaIcon, MediaThumb } from "@/components/studio/shared";
import { apiFetch, deleteJson } from "@/lib/client-api";
import { formatBytes, formatDate, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

export type MediaRow = {
  id: string;
  name: string;
  kind: string;
  mimeType: string;
  sizeBytes: number;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  hasAudio: boolean;
  thumbnailPath: string | null;
  createdAt: string;
};

const filters = ["all", "video", "audio", "image", "archive"] as const;

function isYouTubeLink(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    return ["youtube.com", "m.youtube.com", "youtu.be", "youtube-nocookie.com"].includes(hostname);
  } catch {
    return false;
  }
}

export function MediaClient({
  projectId,
  projectName,
  items,
}: {
  projectId: string | null;
  projectName: string | null;
  items: MediaRow[];
}) {
  const router = useRouter();
  const [filter, setFilter] = React.useState<(typeof filters)[number]>("all");
  const [query, setQuery] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [videoUrl, setVideoUrl] = React.useState("");
  const [importingUrl, setImportingUrl] = React.useState(false);
  const [nextStep, setNextStep] = React.useState("clips");
  const [preview, setPreview] = React.useState<MediaRow | null>(null);
  const [deleting, setDeleting] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const youtubeLinkEntered = isYouTubeLink(videoUrl.trim());

  function openNextStep(mediaId: string) {
    const encodedId = encodeURIComponent(mediaId);
    if (nextStep === "subtitles") router.push(`/subtitles?mediaId=${encodedId}`);
    else if (nextStep === "ai-editor") router.push(`/ai-editor?mediaId=${encodedId}`);
    else router.push(`/clips?mediaId=${encodedId}`);
  }

  const visible = items.filter((item) => {
    if (filter !== "all" && item.kind !== filter) return false;
    if (query && !item.name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const totals = {
    video: items.filter((item) => item.kind === "video").length,
    audio: items.filter((item) => item.kind === "audio").length,
    image: items.filter((item) => item.kind === "image").length,
    bytes: items.reduce((sum, item) => sum + item.sizeBytes, 0),
  };

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (!projectId) {
      toast.error("Create a project before uploading media");
      return;
    }
    setUploading(true);
    let uploaded = 0;
    let firstImportedVideoId: string | null = null;
    const errors: string[] = [];
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("projectId", projectId);
      form.append("file", file);
      try {
        const result = await apiFetch<{ media: { id: string; kind: string } }>(
          "/api/media/upload",
          { method: "POST", body: form },
        );
        uploaded += 1;
        if (!firstImportedVideoId && result.media.kind === "video") {
          firstImportedVideoId = result.media.id;
        }
      } catch (error) {
        errors.push(`${file.name}: ${error instanceof Error ? error.message : "upload failed"}`);
      }
    }
    setUploading(false);
    if (uploaded > 0) toast.success(`Imported ${uploaded} file${uploaded === 1 ? "" : "s"}`);
    if (errors.length > 0) toast.error(errors[0]);
    if (inputRef.current) inputRef.current.value = "";
    if (firstImportedVideoId) openNextStep(firstImportedVideoId);
    else router.refresh();
  }

  async function handleVideoUrl(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId || !videoUrl.trim()) return;
    setImportingUrl(true);
    try {
      const result = await apiFetch<{ media: { id: string } }>("/api/media/import-url", {
        method: "POST",
        body: JSON.stringify({ projectId, url: videoUrl.trim() }),
      });
      setVideoUrl("");
      toast.success("Video imported. It is ready to clip or edit.");
      openNextStep(result.media.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import this video link");
    } finally {
      setImportingUrl(false);
    }
  }

  async function remove(item: MediaRow) {
    setDeleting(item.id);
    try {
      await deleteJson(`/api/media/${item.id}`);
      toast.success(`Removed ${item.name}`);
      if (preview?.id === item.id) setPreview(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete media");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Video" value={totals.video} detail="Footage in this project" icon={Film} />
        <MetricCard label="Audio" value={totals.audio} detail="Music and voice" icon={AudioLines} />
        <MetricCard label="Images" value={totals.image} detail="Stills and covers" icon={ImageIcon} />
        <MetricCard label="Storage" value={formatBytes(totals.bytes)} detail="Originals preserved" icon={FileArchive} tone="brand" />
      </div>

      <Card className="border-border/80 bg-card/60 hairline">
        <CardContent className="space-y-3 p-4">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.7fr)] sm:items-end">
            <div>
              <h2 className="text-sm font-medium">What do you want to make?</h2>
              <p className="mt-1 text-[10px] text-muted-foreground">Choose the workflow FREMIQ should open after importing your video.</p>
            </div>
            <Select value={nextStep} onValueChange={setNextStep}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="clips">Short clips · Shorts / Reels</SelectItem>
                <SelectItem value="subtitles">Captions · subtitles</SelectItem>
                <SelectItem value="ai-editor">Custom edit · describe it</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search media…"
                  className="h-9 pl-8"
                />
              </div>
              <Tabs value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
                <TabsList className="h-9">
                  {filters.map((value) => (
                    <TabsTrigger key={value} value={value} className="px-2.5 text-[11px] capitalize">
                      {value}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="file"
                multiple
                className="hidden"
                accept="video/*,audio/*,image/*,.zip,.srt,.vtt,.ass"
                onChange={(event) => handleUpload(event.target.files)}
              />
              <Button
                size="sm"
                className="h-9"
                disabled={uploading || importingUrl || !projectId}
                onClick={() => inputRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                )}
                {uploading ? "Uploading…" : "Upload media"}
              </Button>
            </div>
          </div>
          <form onSubmit={handleVideoUrl} className="flex flex-col gap-2 border-t border-border/60 pt-3 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Link2 className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="url"
                value={videoUrl}
                onChange={(event) => setVideoUrl(event.target.value)}
                placeholder="Direct video file URL (.mp4, .mov, .webm, .mkv)"
                aria-label="Direct video file URL"
                className="h-9 pl-8"
                disabled={!projectId || importingUrl}
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="h-9"
              disabled={!projectId || importingUrl || !videoUrl.trim()}
            >
              {importingUrl ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              {importingUrl ? "Downloading…" : "Import link"}
            </Button>
          </form>
          <p className="text-[10px] text-muted-foreground">
            For a video on this device, choose <strong className="font-medium text-foreground">Upload media</strong> (a local path such as C:\Videos\clip.mp4 is not accessible to the web app). Direct downloadable video-file links work.
          </p>
          {youtubeLinkEntered ? (
            <p className="rounded-md border border-brand/30 bg-brand/5 p-2 text-[10px] leading-relaxed text-muted-foreground">
              YouTube watch/live links cannot be imported directly. If you own the video or have permission to edit it, download/export the file through{" "}
              <a href="https://studio.youtube.com/" target="_blank" rel="noreferrer" className="font-medium text-brand hover:underline">YouTube Studio</a>{" "}
              and then choose <strong className="font-medium text-foreground">Upload media</strong>.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {!projectName ? (
        <EmptyState
          variant="projects"
          title="No active project"
          description="Create a project first, then upload footage, audio and images into it."
          action={
            <Button asChild size="sm">
              <Link href="/projects">Go to projects</Link>
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          variant="media"
          title={items.length === 0 ? "The library is empty" : "Nothing matches this filter"}
          description={
            items.length === 0
              ? "Upload footage, audio, images or a ZIP archive. FREMIQ probes each file with FFprobe and never modifies the original."
              : "Try another media type or clear the search."
          }
          action={
            items.length === 0 ? (
              <Button size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
                <Upload className="mr-1.5 h-3.5 w-3.5" /> Upload media
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {visible.map((item) => (
            <Card
              key={item.id}
              className="group overflow-hidden border-border/80 bg-card/60 hairline transition-colors hover:border-brand/40"
            >
              <button
                type="button"
                onClick={() => setPreview(item)}
                className="relative block aspect-video w-full overflow-hidden bg-surface-2/40"
              >
                <MediaThumb item={item} className="h-full w-full rounded-none border-0" iconClassName="h-7 w-7" />
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white">
                    <Play className="h-4 w-4" />
                  </span>
                </span>
                {item.durationSec ? (
                  <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] tabular text-white">
                    {formatDuration(item.durationSec)}
                  </span>
                ) : null}
              </button>
              <CardContent className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium" title={item.name}>
                      {item.name}
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {formatBytes(item.sizeBytes)}
                      {item.width && item.height ? ` · ${item.width}×${item.height}` : ""}
                      {item.fps ? ` · ${item.fps}fps` : ""}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-red-400"
                    onClick={() => remove(item)}
                    disabled={deleting === item.id}
                    aria-label={`Delete ${item.name}`}
                  >
                    {deleting === item.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="gap-1 border-border/70 text-[9px] uppercase text-muted-foreground">
                    <MediaIcon kind={item.kind} className="h-2.5 w-2.5" />
                    {item.kind}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">{formatDate(item.createdAt)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <MediaIcon kind={preview?.kind ?? "other"} className="h-4 w-4 text-brand" />
              <span className="truncate">{preview?.name}</span>
            </DialogTitle>
          </DialogHeader>
          {preview ? (
            <div className="space-y-3">
              <div className={cn("overflow-hidden rounded-lg border border-border/70 bg-black/40", preview.kind === "audio" && "bg-surface-2/40 p-4")}>
                {preview.kind === "video" ? (
                  <video
                    src={`/api/media/${preview.id}/file?inline=1`}
                    controls
                    aria-label={`Preview ${preview.name}`}
                    className="max-h-[60vh] w-full"
                  />
                ) : preview.kind === "audio" ? (
                  <audio src={`/api/media/${preview.id}/file?inline=1`} controls aria-label={`Preview ${preview.name}`} className="w-full" />
                ) : preview.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/media/${preview.id}/file?inline=1`}
                    alt={preview.name}
                    className="max-h-[60vh] w-full object-contain"
                  />
                ) : (
                  <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                    <FileArchive className="h-5 w-5" /> No inline preview for this file type
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                <Meta label="Type" value={preview.kind} />
                <Meta label="Size" value={formatBytes(preview.sizeBytes)} />
                <Meta label="Duration" value={formatDuration(preview.durationSec)} />
                <Meta label="Audio" value={preview.hasAudio ? "Yes" : "No"} />
              </div>
              <div className="flex justify-end gap-2">
                <Button asChild variant="outline" size="sm">
                  <a href={`/api/media/${preview.id}/file`}>
                    <Download className="mr-1.5 h-3.5 w-3.5" /> Download original
                  </a>
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/70 bg-surface/50 p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate font-medium capitalize">{value}</div>
    </div>
  );
}
