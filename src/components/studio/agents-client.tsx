"use client";

import * as React from "react";
import Link from "next/link";
import { Bot, Loader2, Play, RefreshCw, Save, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, StatusBadge } from "@/components/ui-kit";
import { apiFetch, patchJson, postJson } from "@/lib/client-api";
import { relativeTime } from "@/lib/format";
import type { AgentProbe } from "@/lib/types";

type SkillExtension = {
  id: string;
  name: string;
  installed: boolean;
  operational: boolean;
  tagline: string;
};

export function AgentsClient({
  initialAgents,
  skills,
}: {
  initialAgents: AgentProbe[];
  skills: SkillExtension[];
}) {
  const [agents, setAgents] = React.useState(initialAgents);
  const [paths, setPaths] = React.useState<Record<string, string>>(
    Object.fromEntries(initialAgents.map((agent) => [agent.key, agent.path ?? ""])),
  );
  const [enabled, setEnabled] = React.useState<Record<string, boolean>>(
    Object.fromEntries(initialAgents.map((agent) => [agent.key, true])),
  );
  const [busy, setBusy] = React.useState<string | null>(null);

  async function refresh() {
    setBusy("refresh");
    try {
      const data = await apiFetch<{ agents: AgentProbe[] }>("/api/agents");
      setAgents(data.agents);
      setPaths(Object.fromEntries(data.agents.map((agent) => [agent.key, agent.path ?? ""])));
      toast.success("Agent detection refreshed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not refresh agents");
    } finally {
      setBusy(null);
    }
  }

  async function test(key: string) {
    setBusy(`test:${key}`);
    try {
      const data = await postJson<{ agent: AgentProbe }>(`/api/agents/${key}/test`, {});
      setAgents((current) => current.map((agent) => (agent.key === key ? data.agent : agent)));
      toast.success(
        data.agent.status === "connected"
          ? `${data.agent.name} responded${data.agent.version ? ` · ${data.agent.version}` : ""}`
          : `${data.agent.name} is ${data.agent.status.replace(/_/g, " ")}`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Agent test failed");
    } finally {
      setBusy(null);
    }
  }

  async function save(key: string) {
    setBusy(`save:${key}`);
    try {
      const data = await patchJson<{ agent: AgentProbe }>(`/api/agents/${key}`, {
        executablePath: paths[key] ?? "",
        enabled: enabled[key] ?? true,
      });
      setAgents((current) => current.map((agent) => (agent.key === key ? data.agent : agent)));
      toast.success("Agent settings saved and re-checked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save agent settings");
    } finally {
      setBusy(null);
    }
  }

  const connected = agents.filter((agent) => agent.status === "connected").length;

  return (
    <div className="space-y-5">
      <Card className="border-brand/20 bg-brand/[0.04] hairline">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium">How agent setup works</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Install and sign in to a coding agent on this host first. Then use Re-detect, or set its executable path below and press Save and Test. FREMIQ does not install or authenticate third-party agents for you.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/local-agent">Local Agent setup</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/tools">Tool Manager</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="border-border/70 text-[10px]">
          {agents.length} agents detected
        </Badge>
        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-300">
          {connected} connected
        </Badge>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={refresh}
          disabled={busy === "refresh"}
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${busy === "refresh" ? "animate-spin" : ""}`} />
          Re-detect
        </Button>
      </div>

      {agents.length === 0 ? (
        <EmptyState
          variant="agents"
          title="No agent definitions"
          description="FREMIQ checks for Codex, [CC], Gemini CLI and Cursor on the processing host."
        />
      ) : (
        <div className="grid items-stretch gap-3 md:grid-cols-2">
          {agents.map((agent) => (
            <Card key={agent.key} className="h-full border-border/80 bg-card/60 hairline">
              <CardContent className="flex h-full flex-col space-y-3 p-4">
                <div className="flex items-start gap-2">
                  <div className="rounded-md border border-border/70 bg-surface-2/60 p-1.5">
                    <Bot className="h-4 w-4 text-brand" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{agent.name}</span>
                      <StatusBadge status={agent.status} />
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {agent.installed ? agent.version ?? "Version unknown" : "Not found on PATH"}
                      {agent.lastCheckedAt ? ` · checked ${relativeTime(agent.lastCheckedAt)}` : ""}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {agent.capabilities.map((capability) => (
                    <Badge key={capability} variant="outline" className="border-border/70 text-[9px] text-muted-foreground">
                      {capability}
                    </Badge>
                  ))}
                </div>

                <p className="min-h-8 text-[10px] leading-relaxed text-muted-foreground">{agent.notes}</p>

                <div className="mt-auto space-y-2">
                  <Input
                    value={paths[agent.key] ?? ""}
                    onChange={(event) =>
                      setPaths((current) => ({ ...current, [agent.key]: event.target.value }))
                    }
                    placeholder="Optional executable path override"
                    className="h-8 text-xs"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={enabled[agent.key] ?? true}
                        onChange={(event) =>
                          setEnabled((current) => ({ ...current, [agent.key]: event.target.checked }))
                        }
                        className="h-3 w-3 accent-[var(--brand)]"
                      />
                      Enabled
                    </label>
                    <div className="flex gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() => save(agent.key)}
                        disabled={busy !== null}
                      >
                        {busy === `save:${agent.key}` ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <Save className="mr-1 h-3 w-3" />
                        )}
                        Save
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() => test(agent.key)}
                        disabled={busy !== null}
                      >
                        {busy === `test:${agent.key}` ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <Play className="mr-1 h-3 w-3" />
                        )}
                        Test
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="border-border/80 bg-card/60 hairline">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" />
            <h3 className="text-sm font-medium">Optional extension skills</h3>
            <Button asChild variant="outline" size="sm" className="ml-auto">
              <Link href="/tools">Tool Manager</Link>
            </Button>
          </div>
          {skills.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No skill extensions are registered.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {skills.map((skill) => (
                <li key={skill.id} className="flex flex-wrap items-center gap-2 py-2.5">
                  <ShieldAlert className="h-3.5 w-3.5 text-brand" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium">{skill.name}</div>
                    <p className="text-[10px] text-muted-foreground">{skill.tagline}</p>
                  </div>
                  <StatusBadge
                    status={skill.operational ? "ok" : skill.installed ? "pending" : "not_installed"}
                    label={skill.operational ? "Available to agents" : skill.installed ? "Installed" : "Optional"}
                  />
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            FREMIQ detects agent binaries but never authenticates them for you. Skills are copied into
            an agent&apos;s skill directory only after you install them from Tool Manager.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
