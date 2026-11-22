"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Clapperboard,
  FolderKanban,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Sparkles,
  Star,
  Trash2,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, MetricCard, StatusBadge } from "@/components/ui-kit";
import { deleteJson, patchJson, postJson } from "@/lib/client-api";
import { relativeTime } from "@/lib/format";

export type ProjectCard = {
  id: string;
  name: string;
  description: string;
  status: string;
  aspectRatio: string;
  resolution: string;
  frameRate: number;
  isDemo: boolean;
  updatedAt: string;
  media: number;
  plans: number;
  jobs: number;
};

const aspects = ["16:9", "9:16", "1:1", "4:5", "4:3", "21:9"];
const resolutions: Record<string, string> = {
  "16:9": "1920x1080",
  "9:16": "1080x1920",
  "1:1": "1080x1080",
  "4:5": "1080x1350",
  "4:3": "1440x1080",
  "21:9": "2520x1080",
};

type FormState = {
  name: string;
  description: string;
  aspectRatio: string;
  resolution: string;
  frameRate: number;
};

export function ProjectsClient({
  projects,
  activeProjectId,
  defaults,
}: {
  projects: ProjectCard[];
  activeProjectId: string | null;
  defaults: Pick<FormState, "aspectRatio" | "resolution" | "frameRate">;
}) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<ProjectCard | null>(null);
  const [deleting, setDeleting] = React.useState<ProjectCard | null>(null);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const emptyForm: FormState = { name: "", description: "", ...defaults };

  const active = projects.find((project) => project.id === activeProjectId) ?? null;
  const totals = React.useMemo(
    () => ({
      media: projects.reduce((sum, project) => sum + project.media, 0),
      jobs: projects.reduce((sum, project) => sum + project.jobs, 0),
      plans: projects.reduce((sum, project) => sum + project.plans, 0),
    }),
    [projects],
  );

  async function activate(project: ProjectCard) {
    if (project.id === activeProjectId) return;
    setPendingId(project.id);
    try {
      await postJson("/api/active-project", { projectId: project.id });
      router.refresh();
      toast.success(`Active project: ${project.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not switch project");
    } finally {
      setPendingId(null);
    }
  }

  async function updateStatus(project: ProjectCard, status: string) {
    try {
      await patchJson(`/api/projects/${project.id}`, { status });
      router.refresh();
      toast.success("Project status updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update project");
    }
  }

  async function remove(project: ProjectCard) {
    try {
      await deleteJson(`/api/projects/${project.id}`);
      toast.success(`Deleted ${project.name}`);
      setDeleting(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete project");
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Projects" value={projects.length} detail="All productions" icon={FolderKanban} />
        <MetricCard label="Media items" value={totals.media} detail="Across every project" icon={Clapperboard} />
        <MetricCard label="Plans" value={totals.plans} detail="AI editing plans" icon={Sparkles} tone="brand" />
        <MetricCard label="Render jobs" value={totals.jobs} detail="Queued and completed" icon={Loader2} />
      </div>

      {active ? (
        <div className="flex flex-col gap-2 rounded-xl border border-brand/25 bg-brand/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs">
            <Star className="h-3.5 w-3.5 text-brand" />
            <span className="text-muted-foreground">Active project</span>
            <span className="font-medium">{active.name}</span>
            <Badge variant="outline" className="border-border/70 text-[10px]">
              {active.aspectRatio} · {active.resolution}
            </Badge>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/ai-editor">
              <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Open in AI Editor
            </Link>
          </Button>
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">All projects</h2>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> New project
        </Button>
      </div>

      {projects.length === 0 ? (
        <Card className="border-dashed border-border/80 bg-card/50">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <FolderKanban className="h-8 w-8 text-brand" />
            <div>
              <div className="text-sm font-medium">No projects yet</div>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                A project groups media, timelines, captions and renders. Create your first one to
                unlock the studios.
              </p>
            </div>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Create a project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const isActive = project.id === activeProjectId;
            return (
              <Card
                key={project.id}
                className={`group border-border/80 bg-card/60 hairline transition-colors ${
                  isActive ? "border-brand/40" : "hover:border-border"
                }`}
              >
                <CardContent className="flex h-full flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-surface-2/60">
                        <Clapperboard className="h-4 w-4 text-brand" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-medium">{project.name}</span>
                          {project.isDemo ? (
                            <Badge variant="outline" className="border-border/70 text-[9px] text-muted-foreground">
                              demo
                            </Badge>
                          ) : null}
                          {isActive ? <Check className="h-3.5 w-3.5 text-brand" /> : null}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                          {project.description || "No description"}
                        </p>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => setEditing(project)}>
                          <Pencil className="mr-2 h-3.5 w-3.5" /> Edit details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => activate(project)} disabled={isActive}>
                          <Star className="mr-2 h-3.5 w-3.5" /> Set active
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {["active", "draft", "archived"].map((status) => (
                          <DropdownMenuItem
                            key={status}
                            onClick={() => updateStatus(project, status)}
                            disabled={project.status === status}
                            className="capitalize"
                          >
                            Mark {status}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-400 focus:text-red-400"
                          onClick={() => setDeleting(project)}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={project.status} />
                    <Badge variant="outline" className="border-border/70 text-[10px] text-muted-foreground">
                      {project.aspectRatio} · {project.resolution} · {project.frameRate}fps
                    </Badge>
                  </div>

                  <div className="mt-auto grid grid-cols-3 gap-2 border-t border-border/60 pt-3 text-center">
                    <div>
                      <div className="text-sm font-semibold tabular">{project.media}</div>
                      <div className="text-[10px] text-muted-foreground">media</div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold tabular">{project.plans}</div>
                      <div className="text-[10px] text-muted-foreground">plans</div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold tabular">{project.jobs}</div>
                      <div className="text-[10px] text-muted-foreground">jobs</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                    <span>Updated {relativeTime(project.updatedAt)}</span>
                    <div className="flex gap-1">
                      <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-[11px]">
                        <Link href="/media">Media</Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[11px]"
                        disabled={pendingId === project.id || isActive}
                        onClick={() => activate(project)}
                      >
                        {pendingId === project.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : isActive ? (
                          "Active"
                        ) : (
                          "Activate"
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ProjectDialog
        open={creating}
        onOpenChange={setCreating}
        title="New project"
        description="Set the working format. You can change it later."
        initial={emptyForm}
        submitLabel="Create project"
        onSubmit={async (form) => {
          await postJson("/api/projects", form);
          toast.success(`Created ${form.name}`);
          setCreating(false);
          router.refresh();
        }}
      />

      <ProjectDialog
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Edit project"
        description="Update the project details and output format."
        initial={
          editing
            ? {
                name: editing.name,
                description: editing.description,
                aspectRatio: editing.aspectRatio,
                resolution: editing.resolution,
                frameRate: editing.frameRate,
              }
            : emptyForm
        }
        submitLabel="Save changes"
        onSubmit={async (form) => {
          if (!editing) return;
          await patchJson(`/api/projects/${editing.id}`, form);
          toast.success("Project updated");
          setEditing(null);
          router.refresh();
        }}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the project, its media files, timelines, captions and render outputs. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 text-white hover:bg-red-600"
              onClick={() => deleting && remove(deleting)}
            >
              Delete project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ProjectDialog({
  open,
  onOpenChange,
  title,
  description,
  initial,
  submitLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  initial: FormState;
  submitLabel: string;
  onSubmit: (form: FormState) => Promise<void>;
}) {
  const [form, setForm] = React.useState<FormState>(initial);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) setForm(initial);
  }, [open]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) {
      toast.error("Project name is required");
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ ...form, name: form.name.trim() });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save project");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Project name" htmlFor="project-name">
            <Input
              id="project-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Aurora launch film"
              maxLength={120}
            />
          </Field>
          <Field label="Description" htmlFor="project-description" hint="Optional. Helps your agents understand the brief.">
            <Textarea
              id="project-description"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="What are we making?"
              rows={3}
              maxLength={600}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Aspect ratio">
              <Select
                value={form.aspectRatio}
                onValueChange={(value) =>
                  setForm({ ...form, aspectRatio: value, resolution: resolutions[value] ?? form.resolution })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {aspects.map((aspect) => (
                    <SelectItem key={aspect} value={aspect}>
                      {aspect}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Frame rate">
              <Select
                value={String(form.frameRate)}
                onValueChange={(value) => setForm({ ...form, frameRate: Number(value) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[24, 25, 30, 50, 60].map((fps) => (
                    <SelectItem key={fps} value={String(fps)}>
                      {fps} fps
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Resolution" hint="Used for timeline renders and clip exports.">
            <Input
              value={form.resolution}
              onChange={(event) => setForm({ ...form, resolution: event.target.value })}
              placeholder="1920x1080"
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
