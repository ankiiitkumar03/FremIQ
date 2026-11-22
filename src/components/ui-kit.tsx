import * as React from "react";
import { Check, Copy, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyArt } from "@/components/brand/empty-art";
import { toast } from "sonner";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-brand">
              {eyebrow}
            </div>
          ) : null}
          <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-[28px]">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function Panel({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn("border-border/80 bg-card/70 hairline", className)}>
      {title || action ? (
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-3">
          <div className="min-w-0">
            {title ? <CardTitle className="text-sm font-medium">{title}</CardTitle> : null}
            {description ? (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {action}
        </CardHeader>
      ) : null}
      <CardContent className={cn(title ? "pt-0" : "pt-6", contentClassName)}>{children}</CardContent>
    </Card>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  detail?: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "default" | "brand" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    default: "text-foreground",
    brand: "text-brand",
    success: "text-emerald-400",
    warning: "text-amber-400",
    danger: "text-red-400",
  }[tone];
  return (
    <Card className="border-border/80 bg-card/60 hairline">
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className={cn("mt-2 text-2xl font-semibold tabular tracking-tight", toneClass)}>
            {value}
          </div>
          {detail ? (
            <div className="mt-1 truncate text-[11px] text-muted-foreground">{detail}</div>
          ) : null}
        </div>
        {Icon ? (
          <div className="rounded-lg border border-border/70 bg-surface-2/70 p-2 text-muted-foreground">
            <Icon className="h-4 w-4" />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

const statusStyles: Record<string, string> = {
  completed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  connected: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  rendering: "border-brand/40 bg-brand/10 text-brand-soft",
  processing: "border-brand/40 bg-brand/10 text-brand-soft",
  analyzing: "border-brand/40 bg-brand/10 text-brand-soft",
  preparing: "border-brand/40 bg-brand/10 text-brand-soft",
  queued: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  detected: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  failed: "border-red-500/30 bg-red-500/10 text-red-300",
  error: "border-red-500/30 bg-red-500/10 text-red-300",
  cancelled: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
  not_installed: "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
  missing: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  draft: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  pending: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  approved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  skipped: "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
  rejected: "border-red-500/30 bg-red-500/10 text-red-300",
  archived: "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
  unknown: "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
};

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize",
        statusStyles[status] ?? statusStyles.unknown,
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {label ?? status.replace(/_/g, " ")}
    </Badge>
  );
}

export function EmptyState({
  variant = "projects",
  title,
  description,
  action,
}: {
  variant?: "media" | "jobs" | "projects" | "agents" | "subtitles" | "search";
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/80 bg-surface/40 px-6 py-10 text-center">
      <EmptyArt variant={variant} />
      <div>
        <div className="text-sm font-medium">{title}</div>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}

export function RefreshButton({
  onClick,
  loading,
  label = "Refresh",
}: {
  onClick: () => void;
  loading?: boolean;
  label?: string;
}) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={loading}>
      <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
      {label}
    </Button>
  );
}

export function CopyButton({
  value,
  label = "Copy",
  size = "sm",
  variant = "outline",
}: {
  value: string;
  label?: string;
  size?: "sm" | "default" | "icon";
  variant?: "outline" | "ghost" | "default";
}) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      variant={variant}
      size={size}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          toast.error("Clipboard access was blocked by the browser");
        }
      }}
      aria-label={label}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {size !== "icon" ? <span className="ml-1.5">{copied ? "Copied" : label}</span> : null}
    </Button>
  );
}

export function JobProgress({
  progress,
  stage,
  status,
}: {
  progress: number;
  stage?: string;
  status?: string;
}) {
  const value = Math.max(0, Math.min(100, progress));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="truncate">{stage ?? "Working…"}</span>
        <span className="tabular">{value}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            status === "failed"
              ? "bg-red-500"
              : status === "completed"
                ? "bg-emerald-500"
                : "bg-brand",
          )}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-foreground">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[11px] text-red-400">{error}</p>
      ) : hint ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function InlineSpinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      {label}
    </span>
  );
}

export function KeyValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium tabular">{value}</span>
    </div>
  );
}
