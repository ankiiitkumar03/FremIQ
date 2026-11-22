import Link from "next/link";
import { ArrowRight, Puzzle, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getExtensionViews } from "@/lib/extensions/manager";

export async function ExtensionHints({
  ids,
  title = "Optional creative extensions",
  description = "FREMIQ works without these. Install one from Tool Manager when you want an extra rendering or audio workflow.",
}: {
  ids: string[];
  title?: string;
  description?: string;
}) {
  const views = (await getExtensionViews()).filter((view) =>
    ids.includes(view.definition.id),
  );
  if (views.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/70 bg-surface/40 p-4">
      <div className="flex items-start gap-2">
        <Puzzle className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">{title}</h3>
            <Link
              href="/tools"
              className="inline-flex items-center gap-1 text-[11px] text-brand hover:underline"
            >
              Open Tool Manager <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {views.map((view) => (
          <div
            key={view.definition.id}
            className="rounded-lg border border-border/70 bg-card/50 p-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium">{view.definition.name}</span>
              {view.operational ? (
                <Badge
                  variant="outline"
                  className="shrink-0 border-emerald-500/30 bg-emerald-500/10 text-[9px] text-emerald-300"
                >
                  <ShieldCheck className="mr-1 h-2.5 w-2.5" /> ready
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="shrink-0 border-border/70 text-[9px] text-muted-foreground"
                >
                  {view.definition.verification === "planned"
                    ? "planned"
                    : view.installed
                      ? view.enabled
                        ? view.health
                        : "disabled"
                      : "optional"}
                </Badge>
              )}
            </div>
            <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
              {view.definition.tagline}
            </p>
            {view.operational ? (
              <p className="mt-1.5 text-[10px] text-brand">
                FREMIQ can use this extension in this studio.
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
