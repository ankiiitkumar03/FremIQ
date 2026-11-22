import Link from "next/link";
import { AudioLines, Film, Image as ImageIcon, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import type { MediaItem } from "@/lib/db/schema";

export function NoProject({
  title = "Choose a project first",
  description = "Every studio works inside a project. Create one or pick an existing project from the switcher in the top bar.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <EmptyState
      variant="projects"
      title={title}
      description={description}
      action={
        <Button asChild size="sm">
          <Link href="/projects">Go to projects</Link>
        </Button>
      }
    />
  );
}

export function MediaIcon({ kind, className }: { kind: string; className?: string }) {
  const Icon =
    kind === "audio" ? AudioLines : kind === "image" ? ImageIcon : kind === "archive" ? Package : Film;
  return <Icon className={className} />;
}

export function MediaThumb({
  item,
  className,
  iconClassName,
}: {
  item: Pick<MediaItem, "id" | "kind" | "name" | "thumbnailPath">;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-md border border-border/70 bg-surface-2/60",
        className,
      )}
    >
      {item.thumbnailPath ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/media/${item.id}/thumb`}
          alt={item.name}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <MediaIcon kind={item.kind} className={cn("h-4 w-4 text-brand", iconClassName)} />
      )}
    </div>
  );
}

export function KindBadge({ kind }: { kind: string }) {
  const tone =
    kind === "video"
      ? "text-brand"
      : kind === "audio"
        ? "text-sky-300"
        : kind === "image"
          ? "text-emerald-300"
          : "text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] uppercase tracking-wide", tone)}>
      <MediaIcon kind={kind} className="h-3 w-3" />
      {kind}
    </span>
  );
}
