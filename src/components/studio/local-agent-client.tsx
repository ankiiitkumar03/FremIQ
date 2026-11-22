"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  HardDrive,
  Loader2,
  MonitorSmartphone,
  Plug,
  Power,
  RefreshCw,
  Server,
  ShieldCheck,
  Wrench,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Field, KeyValue, StatusBadge } from "@/components/ui-kit";
import { apiFetch, deleteJson, postJson } from "@/lib/client-api";
import { formatBytes, relativeTime } from "@/lib/format";
import type { SystemStatus, ToolInfo } from "@/lib/types";

type AgentHealth = {
  ok: boolean;
  url: string;
  version: string | null;
  hostname: string | null;
  os: string | null;
  gpu: string | null;
  tools: string[] | null;
  error: string | null;
  latencyMs: number | null;
};

type AgentState = {
  url: string;
  paired: boolean;
  autoConnect: boolean;
  health: AgentHealth;
};

export function LocalAgentClient({
  initial,
  status,
  tools,
  extensions,
}: {
  initial: AgentState;
  status: SystemStatus;
  tools: ToolInfo[];
  extensions: Array<{ id: string; name: string; installed: boolean; enabled: boolean; health: string }>;
}) {
  const [agent, setAgent] = React.useState(initial);
  const [connection, setConnection] = React.useState<"connected" | "disconnected" | "connecting">(
    initial.health.ok ? "connected" : "disconnected",
  );
  const [url, setUrl] = React.useState(initial.url);
  const [pairingCode, setPairingCode] = React.useState("");
  const [token, setToken] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [actionResult, setActionResult] = React.useState<string | null>(null);

  const installedExtensions = extensions.filter((extension) => extension.installed);

  async function refresh() {
    setBusy("refresh");
    setConnection((current) => (current === "connected" ? "connecting" : current));
    try {
      const data = await apiFetch<AgentState>("/api/agent/connect");
      setAgent(data);
      setConnection(data.health.ok ? "connected" : "disconnected");
      toast.success(data.health.ok ? "Agent is reachable" : "Agent is not reachable");
    } catch (error) {
      setConnection("disconnected");
      toast.error(error instanceof Error ? error.message : "Could not check the agent");
    } finally {
      setBusy(null);
    }
  }

  async function connect() {
    setBusy("connect");
    setConnection("connecting");
    try {
      const data = await postJson<{ connected: boolean; health: AgentHealth; paired: boolean }>(
        "/api/agent/connect",
        { url, pairingCode: pairingCode || undefined, token: token || undefined },
      );
      setAgent({ url: data.health.url, paired: data.paired, autoConnect: true, health: data.health });
      setConnection(data.connected ? "connected" : "disconnected");
      if (data.connected) {
        toast.success("Local agent connected");
        setPairingCode("");
        setToken("");
      } else {
        toast.error(data.health.error ?? "Agent did not report a healthy state");
      }
    } catch (error) {
      setConnection("disconnected");
      toast.error(error instanceof Error ? error.message : "Could not connect to the agent");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy("disconnect");
    try {
      await deleteJson("/api/agent/connect");
      setAgent((current) => ({
        ...current,
        paired: false,
        health: { ...current.health, ok: false, error: "Disconnected by user" },
      }));
      setConnection("disconnected");
      toast.success("Agent pairing cleared");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not disconnect");
    } finally {
      setBusy(null);
    }
  }

  async function runAction(action: "reconnect" | "restart" | "diagnose") {
    setBusy(action);
    try {
      const data = await postJson<{ result?: unknown; health?: AgentHealth }>(
        "/api/agent/action",
        { action },
      );
      if (data.health) {
        setAgent((current) => ({ ...current, health: data.health! }));
        setConnection(data.health.ok ? "connected" : "disconnected");
      }
      setActionResult(
        typeof data.result === "string"
          ? data.result
          : data.result
            ? JSON.stringify(data.result, null, 2)
            : "Action completed",
      );
      toast.success(`Agent ${action} completed`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Agent ${action} failed`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="border-border/80 bg-card/60 hairline">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <MonitorSmartphone className="h-4 w-4 text-brand" />
            <h3 className="text-sm font-medium">Connection</h3>
            <StatusBadge
              status={
                connection === "connected"
                  ? "connected"
                  : connection === "connecting"
                    ? "pending"
                    : "disconnected"
              }
              label={
                connection === "connected"
                  ? "Connected"
                  : connection === "connecting"
                    ? "Connecting…"
                    : "Disconnected"
              }
              className="ml-auto"
            />
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Pairing is optional. Without an installed FREMIQ Local Agent, media processing continues
            on the current FREMIQ engine. Connection status only changes after the agent answers its health endpoint.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Agent URL" hint="Use the address shown by the FREMIQ Local Agent app, for example http://127.0.0.1:8765.">
              <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="http://127.0.0.1:8765" />
            </Field>
            <Field label="Pairing code" hint="Enter the code displayed by the Local Agent when pairing is enabled.">
              <Input value={pairingCode} onChange={(event) => setPairingCode(event.target.value)} placeholder="Six-digit code" />
            </Field>
            <Field label="Pairing token" hint="Optional for code-based pairing. Stored encrypted and never shown again." className="sm:col-span-2">
              <Input
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Leave blank to reuse the stored token"
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={connect} disabled={busy !== null || !url.trim()}>
              {busy === "connect" || connection === "connecting" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plug className="mr-1.5 h-3.5 w-3.5" />
              )}
              {connection === "connecting" ? "Connecting…" : "Connect"}
            </Button>
            <Button variant="outline" size="sm" onClick={refresh} disabled={busy !== null}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${busy === "refresh" ? "animate-spin" : ""}`} />
              Reconnect / check health
            </Button>
            <Button variant="outline" size="sm" onClick={() => runAction("diagnose")} disabled={busy !== null || connection !== "connected"}>
              Diagnose
            </Button>
            <Button variant="outline" size="sm" onClick={() => runAction("restart")} disabled={busy !== null || connection !== "connected"}>
              Restart agent
            </Button>
            <Button variant="ghost" size="sm" onClick={disconnect} disabled={busy !== null || !agent.paired}>
              Forget pairing
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href="/downloads/fremiq-local-agent.zip" download>
                <Power className="mr-1.5 h-3.5 w-3.5" /> Download Windows agent
              </a>
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Extract the downloaded ZIP and double-click <span className="font-medium">Start FREMIQ Agent.bat</span>.
            Keep its window open, then pair with the URL and six-digit code it displays. First launch installs the small agent runtime.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/80 bg-card/60 hairline">
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-brand" />
              <h3 className="text-sm font-medium">Agent health</h3>
            </div>
            {connection === "connected" ? (
              <>
                <KeyValue label="Version" value={agent.health.version ?? "Unknown"} />
                <KeyValue label="Hostname" value={agent.health.hostname ?? "Unknown"} />
                <KeyValue label="OS" value={agent.health.os ?? "Unknown"} />
                <KeyValue label="GPU" value={agent.health.gpu ?? "Not reported"} />
                <KeyValue label="Latency" value={agent.health.latencyMs !== null ? `${agent.health.latencyMs} ms` : "—"} />
                <KeyValue label="URL" value={agent.health.url} />
              </>
            ) : (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{agent.health.error ?? "No agent is connected. Processing runs on the hosted engine."}</span>
              </div>
            )}
            {agent.health.tools && agent.health.tools.length > 0 ? (
              <div className="flex flex-wrap gap-1 pt-1">
                {agent.health.tools.map((tool) => (
                  <Badge key={tool} variant="outline" className="border-border/70 text-[9px]">
                    {tool}
                  </Badge>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/60 hairline">
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-brand" />
              <h3 className="text-sm font-medium">Machine</h3>
            </div>
            <KeyValue label="Engine" value={status.engine.label} />
            <KeyValue label="Platform" value={status.engine.platform} />
            <KeyValue label="Hostname" value={status.engine.hostname} />
            <KeyValue label="CPU" value={`${status.engine.cpu}%`} />
            <KeyValue
              label="Memory"
              value={`${formatBytes(status.engine.memoryUsedBytes)} / ${formatBytes(status.engine.memoryTotalBytes)}`}
            />
            <KeyValue
              label="Disk free"
              value={status.engine.diskFreeBytes !== null ? formatBytes(status.engine.diskFreeBytes) : "Unavailable"}
            />
            <KeyValue label="Uptime" value={`${Math.round(status.engine.uptimeSec / 3600)} h`} />
            <KeyValue label="Checked" value={relativeTime(status.engine.checkedAt)} />
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/60 hairline">
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-brand" />
              <h3 className="text-sm font-medium">Processing tools</h3>
              <Badge variant="outline" className="ml-auto border-border/70 text-[9px]">
                {tools.filter((tool) => tool.installed).length}/{tools.length}
              </Badge>
            </div>
            <ul className="space-y-1.5">
              {tools
                .filter((tool) => tool.required)
                .map((tool) => (
                  <li key={tool.key} className="flex items-center gap-2 text-[11px]">
                    {tool.installed ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{tool.name}</span>
                    <span className="max-w-[50%] truncate text-[10px] text-muted-foreground">
                      {tool.version ?? "Missing"}
                    </span>
                  </li>
                ))}
            </ul>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <StatusBadge status={status.engine.ffmpeg ? "ok" : "missing"} label="FFmpeg" />
              <StatusBadge status={status.engine.ffprobe ? "ok" : "missing"} label="FFprobe" />
              <Badge variant="outline" className="border-border/70 text-[9px]">
                <HardDrive className="mr-1 h-2.5 w-2.5" /> local storage
              </Badge>
            </div>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href="/tools">
                <Wrench className="mr-1.5 h-3.5 w-3.5" /> Tool Manager
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/80 bg-card/60 hairline">
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-brand" />
              <h3 className="text-sm font-medium">Installed extensions</h3>
              <Badge variant="outline" className="ml-auto border-border/70 text-[9px]">
                {installedExtensions.length}
              </Badge>
            </div>
            {installedExtensions.length === 0 ? (
              <EmptyState
                variant="agents"
                title="No extensions installed"
                description="The core engine does not need any extension. Add optional rendering or audio tools from Tool Manager."
                action={
                  <Button asChild size="sm">
                    <Link href="/tools">Open Tool Manager</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-border/60">
                {installedExtensions.map((extension) => (
                  <li key={extension.id} className="flex items-center gap-2 py-2 text-[11px]">
                    <span className="min-w-0 flex-1 truncate">{extension.name}</span>
                    <Badge variant="outline" className="border-border/70 text-[9px]">
                      {extension.enabled ? "enabled" : "disabled"}
                    </Badge>
                    <StatusBadge status={extension.health} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/60 hairline">
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center gap-2">
              <MonitorSmartphone className="h-4 w-4 text-brand" />
              <h3 className="text-sm font-medium">Windows Local Agent</h3>
              <Badge variant="outline" className="ml-auto border-amber-500/30 bg-amber-500/10 text-[9px] text-amber-300">
                Download available
              </Badge>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              The download includes the agent app and a one-click Windows launcher. Start it, pair it above, and install Faster-Whisper from Tool Manager to transcribe locally without web API credits.
            </p>
            <ul className="space-y-1 text-[11px] text-muted-foreground">
              {[
                "Local FFmpeg and FFprobe management",
                "Faster-Whisper transcription",
                "Media processing and rendering",
                "Optional extension installation",
                "Local AI tool connections",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="h-3 w-3 text-muted-foreground" /> {item}
                </li>
              ))}
            </ul>
            {actionResult ? (
              <pre className="max-h-40 overflow-auto rounded-md border border-border/70 bg-black/40 p-2 text-[10px] text-muted-foreground">
                {actionResult}
              </pre>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
