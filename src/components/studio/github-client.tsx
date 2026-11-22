"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCode2,
  FolderGit2,
  Github,
  Loader2,
  Lock,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, Field, StatusBadge } from "@/components/ui-kit";
import { apiFetch, postJson } from "@/lib/client-api";
import { relativeTime } from "@/lib/format";

type GithubStatus = {
  connected: boolean;
  login: string | null;
  message: string;
  gitAvailable: boolean;
};

type RemoteRepo = {
  fullName: string;
  name: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
  url: string;
  updatedAt: string;
  description: string | null;
};

export type ImportedRepo = {
  id: string;
  owner: string;
  repo: string;
  branch: string;
  url: string;
  status: string;
  projectId: string | null;
  createdAt: string;
};

export function GithubClient({
  status: initialStatus,
  imported: initialImported,
  projects,
}: {
  status: GithubStatus;
  imported: ImportedRepo[];
  projects: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [status, setStatus] = React.useState(initialStatus);
  const [imported, setImported] = React.useState(initialImported);
  const [remote, setRemote] = React.useState<RemoteRepo[] | null>(null);
  const [repoInput, setRepoInput] = React.useState("");
  const [branch, setBranch] = React.useState("");
  const [projectId, setProjectId] = React.useState("new");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [filesFor, setFilesFor] = React.useState<ImportedRepo | null>(null);
  const [files, setFiles] = React.useState<Array<{ name: string; type: string }> | null>(null);

  async function refreshStatus() {
    try {
      const data = await apiFetch<GithubStatus>("/api/github/status");
      setStatus(data);
      const importedData = await apiFetch<{ repos: ImportedRepo[] }>("/api/github/imported");
      setImported(importedData.repos);
      toast.success("GitHub status refreshed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not refresh GitHub");
    }
  }

  async function loadRepos() {
    setBusy("repos");
    setError(null);
    try {
      const data = await apiFetch<{ repos: RemoteRepo[] }>("/api/github/repos");
      setRemote(data.repos);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not list repositories");
    } finally {
      setBusy(null);
    }
  }

  async function importRepo(repo: string, selectedBranch?: string) {
    setBusy(`import:${repo}`);
    setError(null);
    try {
      const result = await postJson<{
        repo: ImportedRepo;
        projectId: string;
        files: Array<{ name: string; type: string }>;
        notice: string;
      }>("/api/github/import", {
        repo,
        branch: selectedBranch || undefined,
        projectId: projectId === "new" ? undefined : projectId,
      });
      toast.success(`Imported ${result.repo.owner}/${result.repo.repo}`);
      setRepoInput("");
      setBranch("");
      const importedData = await apiFetch<{ repos: ImportedRepo[] }>("/api/github/imported");
      setImported(importedData.repos);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(null);
    }
  }

  async function openFiles(repo: ImportedRepo) {
    setFilesFor(repo);
    setFiles(null);
    try {
      const data = await apiFetch<{ files: Array<{ name: string; type: string }> }>(
        `/api/github/${repo.id}/files`,
      );
      setFiles(data.files);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read workspace files");
      setFiles([]);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="border-border/80 bg-card/60 hairline">
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Github className="h-4 w-4 text-brand" />
              <h3 className="text-sm font-medium">Import a repository</h3>
              <StatusBadge
                status={status.connected ? "connected" : status.gitAvailable ? "pending" : "error"}
                label={
                  status.connected
                    ? status.login ?? "Connected"
                    : status.gitAvailable
                      ? "Token needed"
                      : "Git missing"
                }
                className="ml-auto"
              />
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">{status.message}</p>
            {!status.gitAvailable ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Git is not installed on the processing host. Install Git before importing repositories.
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Repository" hint="owner/repo or a full GitHub URL">
                <Input
                  value={repoInput}
                  onChange={(event) => setRepoInput(event.target.value)}
                  placeholder="vercel/next.js"
                />
              </Field>
              <Field label="Branch" hint="Leave blank for the configured default branch.">
                <Input
                  value={branch}
                  onChange={(event) => setBranch(event.target.value)}
                  placeholder="main"
                />
              </Field>
              <Field label="Target project" className="sm:col-span-2">
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">Create a new project from this repository</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            {error ? (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2.5 text-[11px] text-red-200">
                {error}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] text-muted-foreground">
                Cloned files are never executed. Dependencies are installed only with explicit approval.
              </p>
              <Button
                size="sm"
                disabled={!repoInput.trim() || busy !== null || !status.gitAvailable}
                onClick={() => importRepo(repoInput.trim())}
              >
                {busy?.startsWith("import:") ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                )}
                Import repository
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="h-fit border-border/80 bg-card/60 hairline">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-brand" />
              <h3 className="text-sm font-medium">Authentication</h3>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Add a GitHub personal access token in Settings to list private repositories and import
              private code. Tokens are encrypted before storage and never written to logs.
            </p>
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm" className="flex-1">
                <Link href="/settings">Open Settings</Link>
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={refreshStatus} aria-label="Refresh GitHub status">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/80 bg-card/60 hairline">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Search className="h-4 w-4 text-brand" />
            <h3 className="text-sm font-medium">Your GitHub repositories</h3>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={loadRepos}
              disabled={!status.connected || busy === "repos"}
            >
              {busy === "repos" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              {remote ? "Reload" : "List repositories"}
            </Button>
          </div>
          {!status.connected ? (
            <p className="rounded-md border border-border/70 bg-surface/40 p-3 text-[11px] text-muted-foreground">
              Repository listing needs a verified GitHub token. Manual owner/repo imports still work
              for public repositories.
            </p>
          ) : busy === "repos" && !remote ? (
            <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading repositories…
            </div>
          ) : remote && remote.length === 0 ? (
            <EmptyState
              variant="search"
              title="No repositories returned"
              description="The token is valid but GitHub returned no repositories for this account."
            />
          ) : remote ? (
            <ul className="divide-y divide-border/60">
              {remote.map((repo) => (
                <li key={repo.fullName} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs font-medium">{repo.fullName}</span>
                      {repo.private ? (
                        <Badge variant="outline" className="border-border/70 text-[9px]">
                          private
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground">
                      {repo.description ?? "No description"} · updated {relativeTime(repo.updatedAt)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => importRepo(repo.fullName, repo.defaultBranch)}
                  >
                    {busy === `import:${repo.fullName}` ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Import
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-[11px] text-muted-foreground">
              List repositories to import one without typing its name.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/60 hairline">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <FolderGit2 className="h-4 w-4 text-brand" />
            <h3 className="text-sm font-medium">Imported workspaces</h3>
            <Badge variant="outline" className="ml-auto border-border/70 text-[10px]">
              {imported.length}
            </Badge>
          </div>
          {imported.length === 0 ? (
            <EmptyState
              variant="projects"
              title="No repositories imported"
              description="Import a repository to create a project and a cloned workspace on this host."
            />
          ) : (
            <ul className="divide-y divide-border/60">
              {imported.map((repo) => (
                <li key={repo.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-xs font-medium">
                        {repo.owner}/{repo.repo}
                      </span>
                      <Badge variant="outline" className="border-border/70 text-[9px]">
                        {repo.branch}
                      </Badge>
                      <StatusBadge status={repo.status} />
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      Imported {relativeTime(repo.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => openFiles(repo)}>
                      <FileCode2 className="mr-1.5 h-3.5 w-3.5" /> Files
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                      <a href={repo.url} target="_blank" rel="noreferrer">
                        <Github className="mr-1.5 h-3.5 w-3.5" /> Source
                      </a>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(filesFor)} onOpenChange={(open) => (!open ? setFilesFor(null) : null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {filesFor ? `${filesFor.owner}/${filesFor.repo}` : "Workspace"} files
            </DialogTitle>
          </DialogHeader>
          {files === null ? (
            <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading workspace…
            </div>
          ) : files.length === 0 ? (
            <p className="py-4 text-xs text-muted-foreground">No files found in this workspace.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-border/60 overflow-auto">
              {files.map((file) => (
                <li key={file.name} className="flex items-center gap-2 py-1.5 text-xs">
                  {file.type === "directory" ? (
                    <FolderGit2 className="h-3.5 w-3.5 text-brand" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className="truncate">{file.name}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">{file.type}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Only the top-level workspace is listed. Repository scripts are not executed by FREMIQ.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
