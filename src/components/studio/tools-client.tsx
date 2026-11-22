"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Box,
  CheckCircle2,
  Clapperboard,
  Download,
  ExternalLink,
  Film,
  Frame,
  Github,
  Loader2,
  Puzzle,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wrench,
  Zap,
  AudioLines,
  MousePointer2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, Field, MetricCard, StatusBadge } from "@/components/ui-kit";
import { apiFetch, postJson } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { formatBytes, relativeTime } from "@/lib/format";
import type { ExtensionView, HostDependency } from "@/lib/extensions/types";
import type { ToolInfo } from "@/lib/types";

type HostInfo = {
  platform: string;
  hostname: string;
  cpus: number;
  cpuModel: string;
  totalMemory: number;
  freeMemory: number;
  arch: string;
};

const filters = ["all", "installed", "available", "enabled", "disabled"] as const;
type Filter = (typeof filters)[number];

const toolGuidance: Record<string, { when: string; device: string; docs: string }> = {
  python: { when: "Needed for Python-based media tools and the Local Agent.", device: "FREMIQ requires Python 3.10+; use the official installer for your OS. No project-wide RAM/GPU minimum is published.", docs: "https://www.python.org/downloads/" },
  node: { when: "Needed for FREMIQ and JavaScript extensions such as Remotion.", device: "Use Node.js 22+ for this FREMIQ setup. Node publishes Windows, macOS and Linux builds; no GPU requirement.", docs: "https://nodejs.org/en/download" },
  git: { when: "Needed only when an extension or project is fetched from a Git repository.", device: "Available for Windows, macOS and Linux. No special CPU/GPU requirement is published.", docs: "https://git-scm.com/install/" },
  ffmpeg: { when: "Required to import, convert, trim and export media.", device: "Use a build for your operating system and required codecs. Hardware acceleration is build/GPU dependent; CPU encoding works without a GPU.", docs: "https://ffmpeg.org/download.html" },
  ffprobe: { when: "Required with FFmpeg to read media duration, streams and metadata.", device: "Included with standard FFmpeg builds; install both from the same OS-compatible package.", docs: "https://ffmpeg.org/download.html" },
  whisper: { when: "Optional local speech recognition; use web Whisper in Settings for provider-based transcription.", device: "OpenAI's package documents Python 3.8–3.11 and requires FFmpeg. Model VRAM estimates: ~1 GB tiny/base, 2 GB small, 5 GB medium, 10 GB large; CPU mode is possible but slower.", docs: "https://github.com/openai/whisper#setup" },
  "faster-whisper": { when: "Optional local transcription on a paired Local Agent machine.", device: "Python 3.9+; CPU INT8 is supported. NVIDIA GPU is optional; current CUDA setup calls for CUDA 12 and cuDNN 9. Memory depends on model size.", docs: "https://github.com/SYSTRAN/faster-whisper#requirements" },
  torch: { when: "Install only when a selected local AI/media tool requires PyTorch.", device: "Choose OS, Python and compute platform in the official selector. CPU builds work without a GPU; CUDA/ROCm needs supported hardware and matching runtime.", docs: "https://pytorch.org/get-started/locally/" },
  opencv: { when: "Optional computer vision tasks such as frame analysis or image processing.", device: "Install a wheel matching your Python version and OS/architecture. Standard Python wheels run on CPU; GPU builds are separate.", docs: "https://pypi.org/project/opencv-python/" },
  moviepy: { when: "Optional Python editing scripts or integrations that specifically use MoviePy.", device: "MoviePy 2 supports Python 3.7+ and uses FFmpeg; ImageIO can install FFmpeg on first use. FFplay is only needed for preview features.", docs: "https://zulko.github.io/moviepy/getting_started/install.html" },
  numpy: { when: "Optional numerical processing dependency for Python media/AI packages.", device: "Python version and OS/CPU architecture must match a published NumPy wheel; no GPU is required for the standard package.", docs: "https://numpy.org/install/" },
  pillow: { when: "Optional image loading, resizing and conversion in Python workflows.", device: "Use a wheel matching your Python version and OS/architecture; current Pillow platform support is published in its docs. No GPU required.", docs: "https://pillow.readthedocs.io/en/stable/installation.html" },
  remotion: { when: "Use for code-driven React animations and programmable video compositions.", device: "Remotion supports Node.js or Bun; FREMIQ uses Node.js 22+. Remotion manages its Chromium render browser. RAM use varies with composition and render size.", docs: "https://www.remotion.dev/docs" },
  codex: { when: "Optional coding agent for repository-aware development tasks.", device: "Install the CLI for your supported OS and authenticate. No local GPU requirement is published; internet access is needed.", docs: "https://developers.openai.com/codex/cli" },
  claude: { when: "Optional coding agent for repository-aware development tasks.", device: "Follow the supported OS/install method and authenticate. No local GPU requirement is published; internet access is needed.", docs: "https://docs.anthropic.com/en/docs/claude-code/setup" },
  gemini: { when: "Optional coding agent for code generation and repository analysis.", device: "Follow the official CLI prerequisites for your OS and authenticate. No local GPU requirement is published.", docs: "https://github.com/google-gemini/gemini-cli" },
  cursor: { when: "Optional editor agent integration for Cursor workflows.", device: "Cursor is optional; install its supported desktop/CLI setup and sign in. No dedicated GPU requirement is published.", docs: "https://docs.cursor.com/cli/overview" },
};

const icons: Record<string, React.ComponentType<{ className?: string }>> = {
  frames: Frame,
  react: MousePointer2,
  motion: Sparkles,
  audio: AudioLines,
  clapper: Clapperboard,
  box: Box,
  film: Film,
};

function iconFor(name: string) {
  return icons[name] ?? Puzzle;
}

function installCommand(view: ExtensionView) {
  const definition = view.definition;
  const dir = `.data/extensions/${definition.id}`;
  if (definition.installMethod === "npm") {
    return `npm install --prefix ${dir} ${definition.packageSpec}`;
  }
  if (definition.installMethod === "git-clone") {
    const [repo, branch = "main"] = (definition.packageSpec ?? "").split("#");
    return `git clone --depth 1 --branch ${branch} ${repo} ${dir}`;
  }
  if (definition.installMethod === "pip-git") {
    return `python -m pip install --target ${dir}/site-packages "${definition.packageSpec}"`;
  }
  return null;
}

function matchesFilter(view: ExtensionView, filter: Filter) {
  if (filter === "all") return true;
  if (filter === "installed") return view.installed;
  if (filter === "available") return !view.installed;
  if (filter === "enabled") return view.enabled;
  return !view.enabled;
}

export function ToolsClient({
  initialTools,
  host,
  initialExtensions,
  initialHostDependencies,
  agentConnected,
  webTranscriptionConfigured,
}: {
  initialTools: ToolInfo[];
  host: HostInfo;
  initialExtensions: ExtensionView[];
  initialHostDependencies: HostDependency[];
  agentConnected: boolean;
  webTranscriptionConfigured: boolean;
}) {
  const [tools, setTools] = React.useState(initialTools);
  const [extensions, setExtensions] = React.useState(initialExtensions);
  const [hostDependencies, setHostDependencies] = React.useState(initialHostDependencies);
  const [loadingTools, setLoadingTools] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");
  const [category, setCategory] = React.useState("all");
  const [selected, setSelected] = React.useState<ExtensionView | null>(null);
  const [confirmInstall, setConfirmInstall] = React.useState(false);
  const [licenseAccepted, setLicenseAccepted] = React.useState(false);
  const [pending, setPending] = React.useState<string | null>(null);
  const [showLogs, setShowLogs] = React.useState(false);
  const [config, setConfig] = React.useState({ projectDir: "", entryPoint: "", compositionId: "" });

  React.useEffect(() => {
    if (!selected) return;
    setConfirmInstall(false);
    setLicenseAccepted(false);
    setShowLogs(false);
    setConfig({
      projectDir: String(selected.config.projectDir ?? ""),
      entryPoint: String(selected.config.entryPoint ?? ""),
      compositionId: String(selected.config.compositionId ?? ""),
    });
  }, [selected?.definition.id]);

  const categories = React.useMemo(
    () => Array.from(new Set(extensions.map((view) => view.definition.category))),
    [extensions],
  );

  const visible = extensions.filter((view) => {
    if (!matchesFilter(view, filter)) return false;
    if (category !== "all" && view.definition.category !== category) return false;
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return (
      view.definition.name.toLowerCase().includes(query) ||
      view.definition.tagline.toLowerCase().includes(query) ||
      view.definition.description.toLowerCase().includes(query) ||
      view.definition.capabilities.some((item) => item.toLowerCase().includes(query))
    );
  });

  const summary = {
    installed: extensions.filter((view) => view.installed).length,
    operational: extensions.filter((view) => view.operational).length,
    planned: extensions.filter((view) => view.definition.verification === "planned").length,
  };

  async function refreshExtensions(silent = false) {
    try {
      const data = await apiFetch<{
        extensions: ExtensionView[];
        host: HostDependency[];
      }>("/api/extensions");
      setExtensions(data.extensions);
      setHostDependencies(data.host);
      if (selected) {
        const next = data.extensions.find((item) => item.definition.id === selected.definition.id);
        if (next) setSelected(next);
      }
      if (!silent) toast.success("Extension registry refreshed");
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "Could not refresh extensions");
    }
  }

  async function refreshTools() {
    setLoadingTools(true);
    try {
      const data = await apiFetch<{ tools: ToolInfo[] }>("/api/tools");
      setTools(data.tools);
      toast.success("Dependency checks refreshed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not refresh tools");
    } finally {
      setLoadingTools(false);
    }
  }

  async function installSystemTool(tool: ToolInfo) {
    setPending(`tool:${tool.key}`);
    try {
      const started = await postJson<{ jobId?: string }>("/api/tools/install", { key: tool.key });
      if (!started.jobId) throw new Error("Local Agent did not return an install job ID");
      const deadline = Date.now() + 31 * 60 * 1000;
      let status: { status: string; progress?: string; error?: string; output?: string; restartRequired?: boolean } | null = null;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        status = await apiFetch<{ status: string; progress?: string; error?: string; output?: string; restartRequired?: boolean }>(
          "/api/tools/install/" + encodeURIComponent(started.jobId),
        );
        if (status.status === "complete") break;
        if (status.status === "failed") {
          throw new Error(status.error || status.output || status.progress || "Local package installation failed");
        }
      }
      if (!status || status.status !== "complete") {
        throw new Error("Install is still running or stopped responding. Re-check Tool Manager before retrying.");
      }
      const data = await apiFetch<{ tools: ToolInfo[] }>("/api/tools");
      setTools(data.tools);
      toast.success(tool.name + " installed. Restart the Local Agent before transcribing.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not install ${tool.name}`);
    } finally {
      setPending(null);
    }
  }

  async function action(id: string, name: string, body: Record<string, unknown> = {}) {
    setPending(`${id}:${name}`);
    try {
      const data = await postJson<{ result?: { ok: boolean; message: string }; extension?: ExtensionView }>(
        `/api/extensions/${id}/${name}`,
        body,
      );
      if (data.result && !data.result.ok) throw new Error(data.result.message);
      toast.success(data.result?.message ?? `${name} completed`);
      await refreshExtensions(true);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${name} failed`);
      await refreshExtensions(true);
      return false;
    } finally {
      setPending(null);
    }
  }

  async function saveConfig() {
    if (!selected) return;
    setPending(`${selected.definition.id}:config`);
    try {
      const data = await apiFetch<{ extension: ExtensionView }>(
        `/api/extensions/${selected.definition.id}`,
        { method: "PATCH", body: JSON.stringify({ config }) },
      );
      setSelected(data.extension);
      setExtensions((current) =>
        current.map((item) =>
          item.definition.id === data.extension.definition.id ? data.extension : item,
        ),
      );
      toast.success("Configuration saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save configuration");
    } finally {
      setPending(null);
    }
  }

  const definition = selected?.definition;
  const command = selected ? installCommand(selected) : null;

  return (
    <div className="space-y-5">
      <Tabs defaultValue="extensions">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="extensions">
            <Puzzle className="mr-1.5 h-3.5 w-3.5" /> Creative Extensions
          </TabsTrigger>
          <TabsTrigger value="dependencies">
            <Wrench className="mr-1.5 h-3.5 w-3.5" /> System Dependencies
          </TabsTrigger>
        </TabsList>

        <TabsContent value="extensions" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricCard label="Installed" value={summary.installed} detail="Isolated in .data/extensions" icon={Download} />
            <MetricCard label="Operational" value={summary.operational} detail="Installed, enabled and healthy" icon={ShieldCheck} tone="success" />
            <MetricCard label="Available" value={extensions.length - summary.installed} detail="Optional tools you can add" icon={Puzzle} tone="brand" />
            <MetricCard label="Planned" value={summary.planned} detail="Unverified, cannot install" icon={AlertTriangle} tone="warning" />
          </div>

          <Card className="border-brand/25 bg-brand/[0.04] hairline">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <div className="rounded-lg border border-brand/20 bg-brand/10 p-2">
                  <AudioLines className="h-4 w-4 text-brand" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-medium">Whisper Transcription</h3>
                    <StatusBadge
                      status={webTranscriptionConfigured ? "ok" : "missing"}
                      label={webTranscriptionConfigured ? "Provider configured" : "Setup required"}
                    />
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Transcribe captions through your configured web provider. No Local Agent or local Whisper install is needed; audio is sent only when you start transcription.
                  </p>
                </div>
              </div>
              <Button asChild variant={webTranscriptionConfigured ? "outline" : "default"} size="sm" className="shrink-0">
                <Link href="/settings">{webTranscriptionConfigured ? "Manage provider" : "Set up Whisper"}</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-card/60 hairline">
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search extensions, capabilities or categories"
                    className="h-9 pl-8"
                  />
                </div>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-9 lg:w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {categories.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => refreshExtensions()}>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {filters.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setFilter(item)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[10px] capitalize transition-colors",
                      filter === item
                        ? "border-brand/50 bg-brand/10 text-brand-soft"
                        : "border-border/70 bg-surface/40 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {visible.length === 0 ? (
            <EmptyState
              variant="search"
              title="No extensions match"
              description="Clear the search or change the filter to see the rest of the trusted registry."
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((view) => {
                const Icon = iconFor(view.definition.icon);
                return (
                  <Card
                    key={view.definition.id}
                    className="flex flex-col border-border/80 bg-card/60 hairline transition-colors hover:border-brand/40"
                  >
                    <CardContent className="flex flex-1 flex-col gap-3 p-4">
                      <div className="flex items-start gap-2.5">
                        <div className="rounded-lg border border-border/70 bg-surface-2/60 p-2">
                          <Icon className="h-4 w-4 text-brand" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-sm font-medium">{view.definition.name}</span>
                            <Badge variant="outline" className="border-border/70 text-[9px] text-muted-foreground">
                              v{view.definition.version}
                            </Badge>
                          </div>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">{view.definition.category}</p>
                        </div>
                        <StatusBadge
                          status={
                            view.operational
                              ? "ok"
                              : view.installed
                                ? view.enabled
                                  ? view.health
                                  : "disabled"
                                : "not_installed"
                          }
                          label={
                            view.operational
                              ? "Operational"
                              : view.installed
                                ? view.enabled
                                  ? `Health: ${view.health}`
                                  : "Disabled"
                                : "Available"
                          }
                        />
                      </div>
                      <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                        {view.definition.tagline}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {view.definition.capabilities.slice(0, 3).map((capability) => (
                          <Badge key={capability} variant="outline" className="border-border/60 text-[9px] text-muted-foreground">
                            {capability}
                          </Badge>
                        ))}
                      </div>
                      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 pt-2.5">
                        <button
                          type="button"
                          onClick={() => setSelected(view)}
                          className="text-[11px] font-medium text-brand hover:underline"
                        >
                          Details
                        </button>
                        <div className="flex gap-1.5">
                          {view.installed ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-[10px]"
                                disabled={pending !== null}
                                onClick={() =>
                                  action(view.definition.id, view.enabled ? "disable" : "enable")
                                }
                              >
                                {pending === `${view.definition.id}:${view.enabled ? "disable" : "enable"}` ? (
                                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                ) : null}
                                {view.enabled ? "Disable" : "Enable"}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-[10px]"
                                disabled={pending !== null}
                                onClick={() => action(view.definition.id, "health")}
                              >
                                Health
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              className="h-7 text-[10px]"
                              onClick={() => setSelected(view)}
                              disabled={view.definition.verification === "planned"}
                            >
                              {view.definition.verification === "planned" ? "Unverified" : "Install"}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="dependencies" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricCard label="Detected" value={`${tools.filter((tool) => tool.installed).length}/${tools.length}`} detail="On this host" icon={CheckCircle2} tone="brand" />
            <MetricCard label="Missing required" value={tools.filter((tool) => tool.required && !tool.installed).length} detail="Block core processing" icon={AlertTriangle} tone="warning" />
            <MetricCard label="Host" value={host.hostname} detail={`${host.platform} · ${host.arch}`} icon={Wrench} />
            <MetricCard label="CPU" value={`${host.cpus} cores`} detail={host.cpuModel} icon={Zap} />
          </div>

          <Card className="border-border/80 bg-card/60 hairline">
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Wrench className="h-4 w-4 text-brand" />
                <h3 className="text-sm font-medium">Host dependency checks</h3>
                <Button variant="outline" size="sm" className="ml-auto" onClick={refreshTools} disabled={loadingTools}>
                  <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loadingTools ? "animate-spin" : ""}`} /> Re-check
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {hostDependencies.map((dependency) => (
                  <div key={dependency.key} className="rounded-lg border border-border/70 bg-surface/40 p-2.5">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-xs font-medium" title={dependency.label}>{dependency.label}</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "flex max-w-[65%] min-w-0 shrink-0 items-center gap-1.5 overflow-hidden rounded-full px-2 py-0.5 text-[10px] font-medium",
                          !dependency.installed
                            ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                            : dependency.meetsMinimum
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                              : "border-amber-500/30 bg-amber-500/10 text-amber-300",
                        )}
                        title={dependency.installed ? dependency.version ?? "detected" : "missing"}
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
                        <span className="truncate">{dependency.installed ? dependency.version ?? "detected" : "missing"}</span>
                      </Badge>
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {dependency.minVersion ? `Needs ${dependency.minVersion}+` : "No minimum version"}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-card/60 hairline">
            <CardContent className="space-y-2 p-4">
              <h3 className="text-sm font-medium">Core and media tools</h3>
              <ul className="divide-y divide-border/60">
                {tools.map((tool) => {
                  const guidance = toolGuidance[tool.key] ?? { when: tool.description, device: "Requirements depend on the selected integration; check its official setup guide." };
                  return (
                  <li key={tool.key} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-[220px] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium">{tool.name}</span>
                        <Badge variant="outline" className="border-border/60 text-[9px] text-muted-foreground">{tool.category}</Badge>
                        <StatusBadge status={tool.health} />
                      </div>
                      <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground"><span className="font-medium text-foreground/80">When:</span> {guidance.when}</p>
                      <p className="text-[10px] leading-relaxed text-muted-foreground"><span className="font-medium text-foreground/80">Device:</span> {guidance.device}</p>
                      <details className="mt-1 text-[10px] text-brand">
                        <summary className="w-fit cursor-pointer">{tool.installed ? "Requirements & documentation" : "Requirements & setup"}</summary>
                        <div className="mt-1 space-y-1 leading-relaxed text-muted-foreground">
                          {!tool.installed ? (
                            <p className="break-words">
                              {tool.key === "faster-whisper"
                                ? "1. Pair your computer from Local Agent. 2. Return here and choose Install locally; FREMIQ runs the install on that paired machine."
                                : tool.installHint}
                            </p>
                          ) : null}
                          {guidance.docs ? (
                            <a href={guidance.docs} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">
                              Official requirements and install guide <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : null}
                        </div>
                      </details>
                    </div>
                    <span className="max-w-full truncate text-[10px] text-muted-foreground sm:max-w-[28%]" title={tool.version ?? "Not installed"}>
                      {tool.version ?? "Not installed"}
                    </span>
                    {tool.key === "faster-whisper" ? agentConnected ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[10px]"
                        onClick={() => installSystemTool(tool)}
                        disabled={pending !== null}
                      >
                        {pending === `tool:${tool.key}` ? (
                          <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Installing</>
                        ) : (
                          tool.installed ? "Repair / update locally" : "Install locally"
                        )}
                      </Button>
                    ) : !tool.installed ? (
                      <Button asChild variant="outline" size="sm" className="h-7 text-[10px]">
                        <Link href="/local-agent">Pair Local Agent</Link>
                      </Button>
                    ) : null : null}
                  </li>
                )})}
              </ul>
              <p className="pt-1 text-[10px] leading-relaxed text-muted-foreground">
                Web transcription is configured in <Link href="/settings" className="text-brand hover:underline">Settings</Link>. The row above is an optional local package for paired-agent workflows; install it through the
                <Link href="/local-agent" className="ml-1 text-brand hover:underline">Local Agent</Link> first.
              </p>
              <p className="text-[10px] leading-relaxed text-muted-foreground">Requirements above follow each project’s published compatibility guidance where available. There is no universal RAM minimum for video rendering: resolution, codec, model size and parallel renders change memory use.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => (!open ? setSelected(null) : null)}>
        <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
          {definition && selected ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
                  <span>{definition.name}</span>
                  <Badge variant="outline" className="border-border/70 text-[10px]">
                    v{definition.version}
                  </Badge>
                  <StatusBadge
                    status={
                      selected.operational
                        ? "ok"
                        : selected.installed
                          ? selected.enabled
                            ? selected.health
                            : "disabled"
                          : "not_installed"
                    }
                    label={
                      selected.operational
                        ? "Operational"
                        : selected.installed
                          ? selected.enabled
                            ? `Health: ${selected.health}`
                            : "Installed · disabled"
                          : "Not installed"
                    }
                  />
                </DialogTitle>
                <DialogDescription className="text-xs leading-relaxed">
                  {definition.description}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <Info label="Category" value={definition.category} />
                  <Info label="License" value={definition.license.name} />
                  <Info
                    label="Install size"
                    value={definition.installSizeBytes ? formatBytes(definition.installSizeBytes) : "Unknown"}
                  />
                  <Info
                    label="Platforms"
                    value={definition.supportedPlatforms.length ? definition.supportedPlatforms.join(", ") : "Unverified"}
                  />
                  <Info label="Method" value={definition.installMethod} />
                  <Info
                    label="State"
                    value={
                      selected.installed
                        ? selected.enabled
                          ? "Installed, enabled"
                          : "Installed, disabled"
                        : "Not installed"
                    }
                  />
                </div>

                {definition.verification === "planned" ? (
                  <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-200">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{definition.notes}</span>
                  </div>
                ) : null}

                <div>
                  <h4 className="text-xs font-medium">Capabilities</h4>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {definition.capabilities.length ? (
                      definition.capabilities.map((capability) => (
                        <Badge key={capability} variant="outline" className="border-border/70 text-[9px] text-muted-foreground">
                          {capability}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-[11px] text-muted-foreground">Not verified</span>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-medium">Dependencies</h4>
                  <ul className="mt-1.5 space-y-1.5">
                    {definition.dependencies.length ? (
                      definition.dependencies.map((dependency) => {
                        const hostRow = hostDependencies.find((item) => item.key === dependency.kind);
                        const ok = Boolean(hostRow?.installed);
                        return (
                          <li key={dependency.name} className="flex items-start gap-2 text-[11px]">
                            {ok ? (
                              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                            ) : (
                              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                            )}
                            <div className="min-w-0">
                              <span className="font-medium">{dependency.name}</span>
                              {dependency.minVersion ? (
                                <span className="ml-1 text-muted-foreground">{dependency.minVersion}+</span>
                              ) : null}
                              <span className="ml-1 text-muted-foreground">
                                {ok ? `· detected${hostRow?.version ? ` ${hostRow.version}` : ""}` : `· ${dependency.hint}`}
                              </span>
                              {!dependency.required ? (
                                <span className="ml-1 text-muted-foreground">(optional)</span>
                              ) : null}
                            </div>
                          </li>
                        );
                      })
                    ) : (
                      <li className="text-[11px] text-muted-foreground">No dependencies declared.</li>
                    )}
                  </ul>
                </div>

                <div>
                  <h4 className="text-xs font-medium">License and commercial use</h4>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {definition.license.commercialUse}
                  </p>
                  {definition.license.url ? (
                    <a
                      href={definition.license.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-[11px] text-brand hover:underline"
                    >
                      Read the license <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-3 text-[11px]">
                  {definition.source.repository ? (
                    <a
                      href={definition.source.repository}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-brand hover:underline"
                    >
                      <Github className="h-3.5 w-3.5" /> Source repository
                    </a>
                  ) : (
                    <span className="text-muted-foreground">Source repository unverified</span>
                  )}
                  {definition.source.documentation ? (
                    <a
                      href={definition.source.documentation}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-brand hover:underline"
                    >
                      Documentation <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                </div>

                <div className="rounded-lg border border-border/70 bg-surface/40 p-3">
                  <h4 className="text-xs font-medium">Health check</h4>
                  <p className="mt-1 text-[11px] text-muted-foreground">{definition.healthCheck}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                    <StatusBadge status={selected.health} />
                    <span>{selected.healthDetail ?? "No health check recorded yet"}</span>
                    {selected.lastHealthAt ? <span>· {relativeTime(selected.lastHealthAt)}</span> : null}
                  </div>
                </div>

                {command ? (
                  <div className="rounded-lg border border-border/70 bg-surface/40 p-3">
                    <h4 className="text-xs font-medium">Installation command (reviewed registry)</h4>
                    <pre className="mt-1.5 overflow-x-auto rounded-md bg-black/40 p-2 text-[10px] text-muted-foreground">
                      {command}
                    </pre>
                    <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                      FREMIQ runs only this pinned command from its trusted registry, inside
                      .data/extensions/{definition.id}. It never executes commands read from a remote
                      repository.
                    </p>
                  </div>
                ) : null}

                {(definition.id === "remotion" || definition.id === "hyperframes") ? (
                  <div className="space-y-2 rounded-lg border border-border/70 bg-surface/40 p-3">
                    <h4 className="text-xs font-medium">Rendering configuration</h4>
                    {definition.id === "remotion" ? (
                      <>
                        <p className="text-[10px] leading-relaxed text-muted-foreground">
                          FREMIQ clip exports work after installation. These fields configure an existing custom project for Motion Studio renders.
                        </p>
                        <Field label="Project directory" hint="Relative to the FREMIQ data directory, or an absolute path inside it.">
                          <Input
                            value={config.projectDir}
                            onChange={(event) => setConfig((current) => ({ ...current, projectDir: event.target.value }))}
                            placeholder="workspace/my-remotion-project"
                          />
                        </Field>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Field label="Entry point">
                            <Input
                              value={config.entryPoint}
                              onChange={(event) => setConfig((current) => ({ ...current, entryPoint: event.target.value }))}
                              placeholder="src/index.ts"
                            />
                          </Field>
                          <Field label="Composition ID">
                            <Input
                              value={config.compositionId}
                              onChange={(event) => setConfig((current) => ({ ...current, compositionId: event.target.value }))}
                              placeholder="MyComposition"
                            />
                          </Field>
                        </div>
                        <Button variant="outline" size="sm" onClick={saveConfig} disabled={pending !== null}>
                          Save configuration
                        </Button>
                      </>
                    ) : null}
                    {definition.id === "hyperframes" ? (
                      <p className="text-[10px] leading-relaxed text-muted-foreground">
                        Motion Studio builds a seekable HyperFrames composition from your title settings for each render. No project path is needed.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {selected.logs ? (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowLogs((current) => !current)}
                      className="text-[11px] font-medium text-brand hover:underline"
                    >
                      {showLogs ? "Hide installation log" : "Show installation log"}
                    </button>
                    {showLogs ? (
                      <pre className="mt-1.5 max-h-56 overflow-auto rounded-md border border-border/70 bg-black/40 p-2 text-[10px] leading-relaxed text-muted-foreground">
                        {selected.logs}
                      </pre>
                    ) : null}
                  </div>
                ) : null}

                {selected.lastError ? (
                  <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2.5 text-[11px] text-red-200">
                    {selected.lastError}
                  </div>
                ) : null}

                <div className="space-y-3 border-t border-border/60 pt-3">
                  {!selected.installed && definition.verification === "verified" ? (
                    <>
                      <label className="flex items-start gap-2 text-[11px]">
                        <input
                          type="checkbox"
                          checked={confirmInstall}
                          onChange={(event) => setConfirmInstall(event.target.checked)}
                          className="mt-0.5 h-3.5 w-3.5 accent-[var(--brand)]"
                        />
                        <span>
                          I reviewed the command, dependencies and license above, and I want FREMIQ to
                          install this extension into an isolated directory.
                        </span>
                      </label>
                      {definition.license.acknowledgementRequired ? (
                        <label className="flex items-start gap-2 text-[11px]">
                          <input
                            type="checkbox"
                            checked={licenseAccepted}
                            onChange={(event) => setLicenseAccepted(event.target.checked)}
                            className="mt-0.5 h-3.5 w-3.5 accent-[var(--brand)]"
                          />
                          <span>
                            I confirm my organisation meets the {definition.name} license terms.
                          </span>
                        </label>
                      ) : null}
                      <Button
                        size="sm"
                        disabled={
                          !confirmInstall ||
                          (definition.license.acknowledgementRequired && !licenseAccepted) ||
                          pending !== null ||
                          selected.missingDependencies.some((item) => item.required)
                        }
                        onClick={() =>
                          action(definition.id, "install", {
                            confirm: true,
                            licenseAccepted,
                          })
                        }
                      >
                        {pending === `${definition.id}:install` ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Install {definition.name}
                      </Button>
                      {selected.missingDependencies.some((item) => item.required) ? (
                        <p className="text-[10px] text-amber-300">
                          Install the required host dependencies first.
                        </p>
                      ) : null}
                    </>
                  ) : selected.installed ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending !== null}
                        onClick={() => action(definition.id, selected.enabled ? "disable" : "enable")}
                      >
                        {selected.enabled ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending !== null}
                        onClick={() => action(definition.id, "health")}
                      >
                        Run health check
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending !== null}
                        onClick={() => action(definition.id, "update", { confirm: true })}
                      >
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Update
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={pending !== null}
                        onClick={() => {
                          if (!window.confirm(`Uninstall ${definition.name}? Its isolated files will be removed.`)) return;
                          action(definition.id, "uninstall", { confirm: true });
                        }}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Uninstall
                      </Button>
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      This extension cannot be installed until FREMIQ verifies its project, platform,
                      installation procedure and license.
                    </p>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-surface/40 p-2">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 break-words text-[11px] font-medium">{value}</div>
    </div>
  );
}
