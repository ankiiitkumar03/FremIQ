"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clapperboard, Loader2, RefreshCw, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch, postJson } from "@/lib/client-api";
import type { ToolInfo } from "@/lib/types";

const SETUP_KEY = "fremiq-first-run-v1";

type ToolResponse = { tools: ToolInfo[]; summary: { missingRequired: number } };

export function FirstRunSetup() {
  const [open, setOpen] = React.useState(false);
  const [tools, setTools] = React.useState<ToolInfo[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [installing, setInstalling] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [checked, setChecked] = React.useState(false);

  const checkTools = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<ToolResponse>("/api/tools");
      setTools(result.tools.filter((tool) => tool.required));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not check the editing engine.");
    } finally {
      setChecked(true);
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    try {
      if (window.localStorage.getItem(SETUP_KEY)) return;
    } catch {
      // Keep setup available when browser storage is disabled.
    }
    setOpen(true);
    void checkTools();
  }, [checkTools]);

  function finishSetup() {
    try {
      window.localStorage.setItem(SETUP_KEY, "done");
    } catch {
      // The dialog can still be closed when browser storage is disabled.
    }
    setOpen(false);
  }

  async function installMissing() {
    const missing = tools.filter((tool) => !tool.installed);
    if (missing.length === 0) return;
    setInstalling(true);
    setError(null);
    try {
      for (const tool of missing) {
        await postJson("/api/tools/install", { key: tool.key });
      }
      await checkTools();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not install the required tools.";
      setError(`${message} If this is the browser preview, it cannot install software on your computer.`);
    } finally {
      setInstalling(false);
    }
  }

  const missing = tools.filter((tool) => !tool.installed);
  const ready = checked && !loading && !error && missing.length === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) finishSetup();
      }}
    >
      <DialogContent className="max-w-lg border-border/80 bg-card">
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl border border-brand/30 bg-brand/10 text-brand">
            {ready ? <Clapperboard className="h-5 w-5" /> : <Wrench className="h-5 w-5" />}
          </div>
          <DialogTitle>{ready ? "FREMIQ is ready" : "Setting up FREMIQ"}</DialogTitle>
          <DialogDescription>
            {ready
              ? "The video engine is ready. You can start editing without installing anything."
              : "We check the video engine before you start. Required tools are bundled with FREMIQ when available; if one is missing, install it through the Tool Manager on the computer running FREMIQ."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-1">
          {loading ? (
            <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-surface/40 p-3 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-brand" /> Checking video tools…
            </div>
          ) : tools.length > 0 ? (
            tools.map((tool) => (
              <div key={tool.key} className="flex items-center gap-3 rounded-lg border border-border/70 bg-surface/40 p-3">
                {tool.installed ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium">{tool.name}</div>
                  <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                    {tool.installed ? tool.version ?? "Ready" : "Required for video editing"}
                  </div>
                </div>
                <span className={`text-[10px] ${tool.installed ? "text-emerald-400" : "text-amber-400"}`}>
                  {tool.installed ? "Ready" : "Missing"}
                </span>
              </div>
            ))
          ) : null}
          {error ? (
            <div role="alert" className="rounded-lg border border-amber-400/25 bg-amber-400/[0.06] p-3 text-xs leading-relaxed text-amber-100">
              {error}
            </div>
          ) : null}
          {ready ? (
            <p className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.05] p-3 text-xs leading-relaxed text-muted-foreground">
              Upload a video, pick the clips you want, and export them from FREMIQ. No terminal commands are needed.
            </p>
          ) : null}
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between">
          <Button variant="ghost" onClick={finishSetup} disabled={loading || installing}>
            Continue to FREMIQ
          </Button>
          <div className="flex gap-2">
            {missing.length > 0 && checked && !installing ? (
              <Button variant="outline" onClick={installMissing}>
                <Wrench className="h-3.5 w-3.5" /> Install required tools
              </Button>
            ) : null}
            {missing.length > 0 && checked ? (
              <Button asChild variant="outline" onClick={finishSetup}>
                <Link href="/tools">Open Tool Manager</Link>
              </Button>
            ) : null}
            {(error || !ready) && !loading ? (
              <Button variant="outline" onClick={checkTools} disabled={installing}>
                <RefreshCw className="h-3.5 w-3.5" /> Re-check
              </Button>
            ) : null}
            {ready ? (
              <Button asChild onClick={finishSetup}>
                <Link href="/projects">Start editing</Link>
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
