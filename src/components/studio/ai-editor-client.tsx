"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  ChevronRight,
  CircleSlash,
  ListVideo,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
  TriangleAlert,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, StatusBadge } from "@/components/ui-kit";
import { postJson, patchJson } from "@/lib/client-api";
import { relativeTime } from "@/lib/format";
import type { PlanOperation } from "@/lib/types";

export type PlanRow = {
  id: string;
  prompt: string;
  summary: string;
  engine: string;
  status: string;
  operations: PlanOperation[];
  warnings: string[];
  createdAt: string;
};

const examples = [
  "Create three vertical clips of 30 seconds with karaoke captions and remove silences.",
  "Cut a 45 second highlight, add fade transitions and a cinematic colour grade.",
  "Make a square teaser with bold captions and background music.",
  "Tighten the full interview, remove dead air and add an animated title.",
];

export function AiEditorClient({
  projectId,
  projectName,
  mediaCount,
  subtitleCount,
  claudeAvailable,
  plans,
}: {
  projectId: string | null;
  projectName: string | null;
  mediaCount: number;
  subtitleCount: number;
  claudeAvailable: boolean;
  plans: PlanRow[];
}) {
  const router = useRouter();
  const [prompt, setPrompt] = React.useState(examples[0]);
  const [plan, setPlan] = React.useState<PlanRow | null>(plans[0] ?? null);
  const [operations, setOperations] = React.useState<PlanOperation[]>(plans[0]?.operations ?? []);
  const [busy, setBusy] = React.useState<"generate" | "save" | "execute" | null>(null);
  const [plannerEngine, setPlannerEngine] = React.useState<"builtin" | "claude">("builtin");

  function loadPlan(next: PlanRow) {
    setPlan(next);
    setOperations(next.operations);
    setPrompt(next.prompt);
  }

  async function generate() {
    if (!projectId) return;
    setBusy("generate");
    try {
      const data = await postJson<{ plan: PlanRow; warnings: string[] }>("/api/plans", {
        projectId,
        prompt,
        engine: plannerEngine,
      });
      const next: PlanRow = {
        ...data.plan,
        warnings: data.warnings ?? [],
        operations: data.plan.operations as PlanOperation[],
      };
      loadPlan(next);
      toast.success("Plan drafted. Review each operation before rendering.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate a plan");
    } finally {
      setBusy(null);
    }
  }

  function toggle(id: string) {
    setOperations((current) =>
      current.map((operation) =>
        operation.id === id
          ? { ...operation, status: operation.status === "skipped" ? "pending" : "skipped" }
          : operation,
      ),
    );
  }

  async function savePlan() {
    if (!plan) return;
    setBusy("save");
    try {
      await patchJson(`/api/plans/${plan.id}`, { operations });
      setPlan({ ...plan, operations });
      toast.success("Plan updated");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the plan");
    } finally {
      setBusy(null);
    }
  }

  async function execute() {
    if (!plan) return;
    setBusy("execute");
    try {
      await patchJson(`/api/plans/${plan.id}`, { operations, status: "approved" });
      const result = await postJson<{ jobs: Array<{ id: string; name: string }>; warnings: string[] }>(
        `/api/plans/${plan.id}/execute`,
        {},
      );
      toast.success(
        result.jobs.length > 1
          ? `Queued ${result.jobs.length} render jobs`
          : "Render queued. Track progress in the queue.",
      );
      setPlan({ ...plan, status: "executed", operations });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not execute the plan");
    } finally {
      setBusy(null);
    }
  }

  const activeOps = operations.filter((operation) => operation.status !== "skipped");
  const warnings = plan?.warnings ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
      <div className="space-y-4">
        <Card className="border-border/80 bg-card/60 hairline">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-brand" />
              Describe the edit. FREMIQ turns it into a reviewable plan before any frame is rendered.
            </div>
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={4}
              placeholder="e.g. Create two vertical clips with karaoke captions and remove silences"
              className="resize-none"
            />
            <div className="flex flex-wrap gap-1.5">
              {examples.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setPrompt(example)}
                  className="rounded-full border border-border/70 bg-surface/50 px-2.5 py-1 text-[10px] text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground"
                >
                  {example.length > 52 ? `${example.slice(0, 52)}…` : example}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                <Badge variant="outline" className="border-border/70 text-[10px]">
                  {mediaCount} media
                </Badge>
                <Badge variant="outline" className="border-border/70 text-[10px]">
                  {subtitleCount} caption tracks
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  Planner
                  <select
                    value={plannerEngine}
                    onChange={(event) => setPlannerEngine(event.target.value as "builtin" | "claude")}
                    className="h-8 rounded-md border border-border/70 bg-background px-2 text-xs text-foreground"
                  >
                    <option value="builtin">FREMIQ</option>
                    <option value="claude" disabled={!claudeAvailable}>
                      {claudeAvailable ? "Claude Code (optional)" : "Claude Code (not installed)"}
                    </option>
                  </select>
                </label>
                <Button size="sm" onClick={generate} disabled={!projectId || busy !== null || !prompt.trim()}>
                  {busy === "generate" ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Generate plan
                </Button>
              </div>
            </div>
            {plannerEngine === "claude" ? (
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                This sends your edit request and project media names to Claude Code using its signed-in account. Claude only drafts the instruction; FREMIQ validates the plan and you approve it before rendering.
              </p>
            ) : null}
          </CardContent>
        </Card>

        {!projectId ? (
          <EmptyState
            variant="projects"
            title="Choose a project"
            description="The AI editor plans inside a project so it can see that project's media and captions."
            action={
              <Button asChild size="sm">
                <Link href="/projects">Go to projects</Link>
              </Button>
            }
          />
        ) : !plan ? (
          <EmptyState
            variant="search"
            title="No plan yet"
            description="Describe the result you want above. The planner reads your media inventory and proposes concrete FFmpeg operations."
          />
        ) : (
          <Card className="border-border/80 bg-card/60 hairline">
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium">Editing plan</h3>
                    <StatusBadge status={plan.status} />
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{plan.summary}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground/80">
                    {plan.engine} · drafted {relativeTime(plan.createdAt)}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" onClick={savePlan} disabled={busy !== null}>
                    {busy === "save" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                    Save
                  </Button>
                  <Button size="sm" onClick={execute} disabled={busy !== null || activeOps.length === 0}>
                    {busy === "execute" ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Approve &amp; render
                  </Button>
                </div>
              </div>

              {warnings.length > 0 ? (
                <div className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5">
                  {warnings.map((warning) => (
                    <p key={warning} className="flex gap-1.5 text-[11px] leading-relaxed text-amber-200">
                      <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" /> {warning}
                    </p>
                  ))}
                </div>
              ) : null}

              <ul className="space-y-2">
                {operations.map((operation, index) => {
                  const skipped = operation.status === "skipped";
                  return (
                    <li
                      key={operation.id}
                      className={`rounded-lg border p-3 transition-colors ${
                        skipped
                          ? "border-border/60 bg-surface/20 opacity-60"
                          : "border-border/70 bg-surface/40"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border/70 bg-surface-2/60 text-[10px] font-medium tabular">
                          {index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-medium">{operation.title}</span>
                            <Badge variant="outline" className="border-border/70 text-[9px] uppercase text-muted-foreground">
                              {operation.type}
                            </Badge>
                            {skipped ? (
                              <Badge variant="outline" className="border-border/70 text-[9px] text-muted-foreground">
                                skipped
                              </Badge>
                            ) : null}
                          </div>
                          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                            {operation.description}
                          </p>
                          {Object.keys(operation.parameters ?? {}).length > 0 ? (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {Object.entries(operation.parameters).map(([key, value]) => (
                                <span
                                  key={key}
                                  className="rounded bg-surface-2/70 px-1.5 py-0.5 text-[9px] text-muted-foreground"
                                >
                                  {key}: {String(value)}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <Button
                          variant={skipped ? "outline" : "ghost"}
                          size="sm"
                          className="h-7 shrink-0 px-2 text-[10px]"
                          onClick={() => toggle(operation.id)}
                          disabled={plan.status === "executed"}
                        >
                          {skipped ? (
                            <>
                              <RotateCcw className="mr-1 h-3 w-3" /> Include
                            </>
                          ) : (
                            <>
                              <CircleSlash className="mr-1 h-3 w-3" /> Skip
                            </>
                          )}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
                <span>
                  {activeOps.length} of {operations.length} operations will run on the local engine.
                </span>
                <Link href="/render-queue" className="flex items-center gap-1 text-brand hover:underline">
                  <ListVideo className="h-3 w-3" /> Open render queue
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="h-fit border-border/80 bg-card/60 hairline">
        <CardContent className="space-y-2 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Plan history</h3>
            <span className="text-[10px] text-muted-foreground">{plans.length}</span>
          </div>
          {plans.length === 0 ? (
            <p className="py-4 text-xs text-muted-foreground">
              Plans you generate are saved here with their operations and status.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {plans.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => loadPlan(row)}
                    className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                      plan?.id === row.id
                        ? "border-brand/40 bg-brand/[0.06]"
                        : "border-border/70 bg-surface/40 hover:border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <StatusBadge status={row.status} />
                      <span className="text-[9px] text-muted-foreground">{relativeTime(row.createdAt)}</span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug">{row.prompt}</p>
                    <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                      {row.operations.length} operations <ChevronRight className="h-3 w-3" />
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {projectName ? (
            <Link
              href="/timeline"
              className="flex items-center justify-between rounded-md border border-border/70 bg-surface/40 px-2.5 py-2 text-[11px] text-muted-foreground hover:text-foreground"
            >
              Prefer manual control? Open the timeline
              <ArrowRight className="h-3 w-3" />
            </Link>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
